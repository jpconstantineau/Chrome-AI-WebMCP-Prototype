import { inInbox, fail } from './workspace.js';
export const STANDARD_TOOLS = Object.freeze(['capture_tasks', 'organize_tasks', 'set_task_status', 'weekly_review', 'add_shopping_item', 'complete_task', 'list_items', 'read_item', 'show_view', 'create_item', 'update_item', 'delete_item', 'ask_user']);
export function catalogProfile(name = 'standard') { if (!['standard', 'full'].includes(name)) fail('Unknown catalog profile.'); return name === 'full' ? null : STANDARD_TOOLS; }
export function closedTurns(history) {
  const turns = []; let current = null;
  for (const entry of history) {
    const messages = typeof entry.text === 'string' ? [{ role: entry.role, text: entry.text }] : [...(entry.prompt ? [{ role: 'user', text: entry.prompt }] : []), ...(entry.response ? [{ role: 'assistant', text: entry.response }] : [])];
    for (const message of messages) {
      if (message.role === 'user') { if (current?.some(item => item.role === 'assistant')) turns.push(current); current = [message]; }
      else if (message.role === 'assistant' && current) current.push(message);
    }
  }
  if (current?.some(item => item.role === 'assistant')) turns.push(current);
  return turns.filter(turn => !turn.some(message => message.role === 'assistant' && /^(Tool stopped:|Request failed:)/u.test(message.text)));
}
export function boundedHistory(history, maxChars = 6000) {
  const turns = closedTurns(history); while (turns.length && JSON.stringify(turns).length > maxChars) turns.shift(); return turns.flat();
}
export function projectStage(stage, facts) {
  const { request, history = [], receipts = [], results = [], review = null, boundary = null, tools = [], operation = null, ...optional } = facts;
  return { stage, request, receipts, review, boundary, ...(stage === 'route' || stage === 'native' ? { tools: tools.map(({ name, description }) => ({ name, description })) } : stage === 'arguments' ? { operation, tools: tools.filter(tool => tool.name === operation) } : {}), DATA: { ...optional, transcript: boundedHistory(history), toolResults: results } };
}
export function projectResult(result, aliases = value => value) {
  const projected = aliases(result); if (JSON.stringify(projected).length <= 8000) return projected;
  const trim = value => typeof value === 'string' ? value.slice(0, 1000) : Array.isArray(value) ? value.slice(0, 10).map(trim) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, trim(item)])) : value;
  const bounded = { ...trim(projected), modelContextTruncated: true }; if (JSON.stringify(bounded).length > 8000) fail('The result is too large. Inspect activity and narrow the request.', 'context'); return bounded;
}
// The guard preserves exact protected facts. Only complete history and explicitly optional facts are expendable.
export function fitContext(projection, measurement = {}, limit = 48000) {
  const value = structuredClone(projection), measured = Number.isFinite(measurement.usage) && measurement.usage >= 0 && Number.isFinite(measurement.window) && measurement.window > 0 && Number.isFinite(measurement.currentUsage) && measurement.currentUsage >= 0;
  const initialSize = JSON.stringify(value).length, allowance = measured ? measurement.window * .75 : null;
  const current = Number.isFinite(measurement.currentUsage) && measurement.currentUsage >= 0 ? measurement.currentUsage : 0;
  const cost = () => measured ? measurement.usage + current : JSON.stringify(value).length;
  const tooLarge = () => JSON.stringify(value).length > limit || (measured && cost() > allowance);
  const data = value.DATA || {}; let trimmed = false;
  while (tooLarge() && data.transcript?.length) { data.transcript.shift(); while (data.transcript.length && data.transcript[0].role !== 'user') data.transcript.shift(); trimmed = true; }
  if (tooLarge() && (data.visibleItems || data.optionalDescriptions)) { delete data.visibleItems; delete data.optionalDescriptions; trimmed = true; }
  return { projection: value, overflow: tooLarge(), usage: measured ? measurement.usage : 'unknown', contextWindow: measured ? measurement.window : 'unknown', reserve: .25, needsRemeasure: measured && trimmed };

}
export async function measureStage(session, input, options) {
  const windowSize = session.contextWindow;
  if (typeof session.measureContextUsage !== 'function') return { usage: null, window: Number.isFinite(windowSize) ? windowSize : null, currentUsage: Number.isFinite(session.contextUsage) ? session.contextUsage : 'unknown' };
  try { const measurement = await session.measureContextUsage(input, options); return { usage: typeof measurement === 'number' ? measurement : measurement?.usage, window: windowSize, currentUsage: Number.isFinite(session.contextUsage) ? session.contextUsage : 'unknown' }; }
  catch (error) { return { usage: null, window: windowSize, error: { name: error.name, message: error.message }, currentUsage: 'unknown' }; }
}
export function reviewerScope(items, scope, projectId = null) {
  if (scope === 'inbox') return items.filter(inInbox);
  const project = items.find(item => item.id === projectId && item.type === 'Project'); if (!project) fail('Select a Project or Inbox before asking the reviewer.');
  return [project, ...items.filter(item => item.type === 'Task' && item.parentId === project.id)];
}
export function revisionSignature(records) { return JSON.stringify(records.map(item => ({ ...item })).sort((a, b) => a.id.localeCompare(b.id))); }
export function specialistSnapshot(items, scope, projectId = null, project = value => value) {
  const records = reviewerScope(items, scope, projectId), selected = []; let size = 0;
  for (const item of records.slice(0, 40)) { const projected = project(item), length = JSON.stringify(projected).length; if (size + length > 16000) break; selected.push(projected); size += length; }
  return { records: selected, signature: revisionSignature(records), total: records.length, omitted: records.length - selected.length, references: selected.map(item => item.id) };
}
export function reviewerSchema(references) {
  const text = { type: 'string', minLength: 1, maxLength: 400 }, entry = { type: 'object', properties: { references: { type: 'array', items: { type: 'string', enum: references }, minItems: 1, maxItems: 10 }, text }, required: ['references', 'text'], additionalProperties: false };
  return { type: 'object', properties: { observations: { type: 'array', items: entry, maxItems: 10 }, suggestions: { type: 'array', items: entry, maxItems: 10 }, questions: { type: 'array', items: text, maxItems: 10 }, limitations: { type: 'array', items: text, maxItems: 10 } }, required: ['observations', 'suggestions', 'questions', 'limitations'], additionalProperties: false };
}
export function validateReviewerReport(text, references) {
  if (typeof text !== 'string' || text.length > 6000) fail('The reviewer report exceeds its bounds.'); let report; try { report = JSON.parse(text); } catch { fail('The reviewer returned invalid JSON.'); }
  const names = ['observations', 'suggestions', 'questions', 'limitations'];
  if (!report || Array.isArray(report) || typeof report !== 'object' || Object.keys(report).length !== 4 || names.some(name => !Array.isArray(report[name]) || report[name].length > 10)) fail('The reviewer returned an invalid report shape.');
  const validText = text => typeof text === 'string' && text.trim() && text.length <= 400;
  for (const name of ['observations', 'suggestions']) for (const entry of report[name]) if (!entry || Array.isArray(entry) || Object.keys(entry).length !== 2 || !validText(entry.text) || !Array.isArray(entry.references) || !entry.references.length || entry.references.length > 10 || entry.references.some(reference => !references.includes(reference))) fail('The reviewer used an unknown reference or invalid observation.');
  for (const name of ['questions', 'limitations']) if (report[name].some(text => !validText(text))) fail('The reviewer text is invalid.'); return report;
}
export function guardedReply(message, verifiedEffects) {
  if (!verifiedEffects && /(?:\bI(?:'ve| have)?\s+(?:saved|created|captured|deleted|moved|completed|updated|added|reopened|organized)\b|^(?:Saved|Created|Captured|Deleted|Moved|Updated|Added|Reopened|Organized)\b)/iu.test(message) && !/\b(?:not|no|cannot|can’t|could|would|should|please|haven’t|have not|already)\b/iu.test(message)) return { message: 'No changes were made for this request. Please state the specific action you want me to perform.', unfulfilled: true };
  return { message, unfulfilled: false };
}
