import { explicitCaptureTitles, explicitNewProjectTitle, namedTaskFocus } from './harness.js';
import { fail, validateTool } from './workspace.js';

const signature = item => JSON.stringify(item);
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
const mutation = /\b(?:move|put|file|organize|complete[ds]?|finish(?:ed)?|capture|save|create|add|set|mark|update|change|clear|start(?:ed)?|working on|waiting for|resume|pause|skip|delete|remove|rename)\b/iu;
const prohibited = /\bno\s+tools\b|\b(?:do not|don't|don’t|never|without|before)\s+(?:call|use|run|invoke|execute)\s+(?:any\s+)?tools?\b|\b(?:ask|clarify)\b[^.!?]*\bbefore\b[^.!?]*\b(?:chang|mov|updat)/iu;
function clauses(text) {
  // Literal strings are indivisible data, including words such as "complete".
  const literals = []; const masked = text.replace(/"(?:[^"\\]|\\.)*"|“[^”]*”/gu, literal => { literals.push(literal); return `\u0001${literals.length - 1}\u0001`; });
  return masked.split(/\s*(?:;|\.(?=\s|$)|(?:\band(?:\s+then)?|,?\s*\bthen)\s+(?=(?:please\s+)?(?:(?:do not|don't|don’t|never)\s+)?(?:complete|finish|set|mark|move|file|organize|capture|add|create|read|tell me how many|update|change|clear|show|count|list|start|resume|pause|skip|rename|delete|remove)\b))\s*/iu).filter(Boolean).map(part => part.replace(/\u0001(\d+)\u0001/gu, (_, index) => literals[Number(index)]));
}
function contextValue(text) {
  const masked = text.replace(/"(?:[^"\\]|\\.)*"|“[^”]*”/gu, literal => '_'.repeat(literal.length));
  if (/\b(?:clear|remove|empty)\b[^.!?]*\bcontext\b/iu.test(masked)) return { value: '' };
  const marker = masked.match(/\bcontext(?:\s+(?:field|value))?(?:\s+of\s+.+?)?\s*(?:to|as|=|:)\s*(?:exactly\s+)?/iu);
  if (!marker) return { question: 'What exact context should I save? Put the value in quotes to preserve it exactly.' };
  const rest = text.slice(marker.index + marker[0].length).trim();
  let value;
  let literalLength = 0;
  if (rest.startsWith('"')) { const match = rest.match(/^("(?:[^"\\]|\\.)*")(?:\s*(?:[.!?]|for\b)|\s*$)/u); if (match) { try { value = JSON.parse(match[1]); literalLength = match[1].length; } catch {} } }
  else if (rest.startsWith('“')) { const match = rest.match(/^“([^”]*)”(?:\s*(?:[.!?]|for\b)|\s*$)/u); value = match?.[1]; if (match) literalLength = match[1].length + 2; }
  else if (/^@[^\s.!?]+\s*[.!?]?$/u.test(rest)) value = rest.replace(/[.!?]$/u, '').trim();
  if (typeof value !== 'string' || value.length > 200) return { question: 'Please quote the exact context value (at most 200 characters), including any @, spaces or punctuation.' };
  return { value, ...(literalLength ? { literalStart: marker.index + marker[0].length, literalLength } : {}) };
}
function targetChoices(text, items) {
  const names = namedTaskFocus(text, items.filter(item => item.type === 'Task'));
  let matches = names ? items.filter(item => item.type === 'Task' && names.includes(item.title)) : [];
  const qualifier = /\b(?:move|organize|file)\b/iu.test(text) ? '(?:from|within)' : '(?:under|from|within)';
  let parents = items.filter(item => new RegExp(`\\b${qualifier}\\s+(?:Project\\s+)?["“]?${escape(item.title)}["”]?(?![\\p{L}\\p{N}_])`, 'iu').test(text));
  if (parents.length > 1) parents = parents.filter(item => !parents.some(other => other.title.length > item.title.length && other.title.toLowerCase().startsWith(item.title.toLowerCase())));
  if (parents.length === 1) matches = matches.filter(item => item.parentId === parents[0].id);
  if (/\b(?:from|in)\s+(?:the\s+)?Inbox\b/iu.test(text)) matches = matches.filter(item => item.parentId === null);
  return matches;
}
function ask(question, pending = null) { return { steps: [], question, pending }; }
export function analyzeRequest(text, items, review = null, pending = null) {
  if (pending) {
    if (/^\s*(?:(?:please\s+)?(?:use|choose|move it to|put it in)\s+)?Inbox\s*[.!]?\s*$/iu.test(text)) {
      if (pending.targets.some(old => signature(old) !== signature(items.find(item => item.id === old.id)))) return ask('The task changed. Please restate your move request.');
      return { steps: [{ operation: 'organize_tasks', targets: pending.targets, parentId: null, source: text }] };
    }
    if (/\b(?:don't|do not|don’t|cancel|never)\b[^.!?]*\b(?:move|change|it|that)\b/iu.test(text)) return ask('Cancelled. No changes were made.');
    let matches = pending.destinations.filter(item => new RegExp(`(?<![\\p{L}\\p{N}_])${escape(item.title)}(?![\\p{L}\\p{N}_])`, 'iu').test(text));
    if (matches.length > 1) matches = matches.filter(item => !matches.some(other => other.title.length > item.title.length && other.title.toLowerCase().startsWith(item.title.toLowerCase())));
    if (matches.length === 1 && new RegExp(`^\\s*(?:(?:please\\s+)?(?:use|choose|put it (?:in|under)|move it to)\\s+)?["“]?${escape(matches[0].title)}["”]?\\s*[.!]?\\s*$`, 'iu').test(text)) {
      if (items.filter(item => item.type === 'Project' && item.title === matches[0].title).length !== 1) return ask('Several Projects now match. Please restate the task and destination.');
      const records = [...pending.targets, matches[0]];
      if (records.some(old => signature(old) !== signature(items.find(item => item.id === old.id)))) return ask('Those choices changed. Please restate the task and destination before I move anything.');
      return { steps: [{ operation: 'organize_tasks', targets: pending.targets, parentId: matches[0].id, source: text }] };
    }
    if (!mutation.test(text) && !/\b(?:list|show|count|how many|read|reviewer)\b/iu.test(text)) return ask(pending.question, pending);
  }
  const projects = items.filter(item => item.type === 'Project');
  if (prohibited.test(text.replace(/"(?:[^"\\]|\\.)*"|“[^”]*”/gu, literal => '_'.repeat(literal.length)))) {
    const targets = targetChoices(text, items); const question = targets.length ? `Which Project should contain ${targets.map(item => item.title).join(', ')}? Choose ${projects.map(item => item.title).join(' or ')}${projects.length ? ' or ' : ''}Inbox.` : 'What would you like me to clarify? No tools will run for this request.';
    if (new Set(targets.map(item => item.title)).size !== targets.length) return ask('Several tasks match that title. Please specify its parent before choosing a destination.');
    const positive = text.replace(/"(?:[^"\\]|\\.)*"|“[^”]*”/gu, literal => '_'.repeat(literal.length));
    return ask(question, targets.length && projects.length && /\b(?:move|file|organize)\b/iu.test(positive) && !/\b(?:do not|don't|don’t|never)\b/iu.test(positive) ? { targets, destinations: projects, question } : null);
  }
  const steps = [], parts = clauses(text); let deferredReview = false, protectedOnly = false, mindDumpHeader = null, subject = null;
  for (let part of parts) {
    let semantics = part.replace(/"(?:[^"\\]|\\.)*"|“[^”]*”/gu, literal => '_'.repeat(literal.length));
    for (const item of items) semantics = semantics.replace(new RegExp(escape(item.title), 'giu'), ' '.repeat(item.title.length));
    // A header introduces the following capture; it is not an additional task
    // capture. Keep actual separate commitments and unsupported clauses intact.
    if (/^(?:(?:here is|here’s|here's|this is)\s+(?:my|the|a)\s+)?mind dump\s*:?$|^my mind dump\s*:?$|^here is my mind dump\s*:?$/iu.test(part)) {
      if (mindDumpHeader) return ask('What thoughts should I capture in Inbox? Please list them.');
      mindDumpHeader = part; subject = null; continue;
    }
    // Preservation and negative clauses grant no mutation authority.
    if (/^(?:(?:my|the|this|our)\s+)?mind dump\s+(?:(?:is|was|has been)\s+)?(?:already\s+)?(?:captured|organized|saved|done|completed|complete)(?:\s+and\s+(?:captured|organized|saved|done|completed|complete))*\s*$/iu.test(semantics)) { protectedOnly = true; subject = null; continue; }
    if (/\b(?:nothing(?: else)?|no (?:further|more|other))\b[^.!?]*\b(?:capture|add|change|move|complete)\b/iu.test(semantics) || /\bInbox\s+is\s+clear\b/iu.test(semantics)) { protectedOnly = true; subject = null; continue; }
    if ((/^(?:I(?:'ve| have)?\s+reviewed|Reviewed|No\s+relevant|There\s+are\s+no)\b|\b(?:is|are)\s+reviewed\b/iu.test(semantics) && !/\b(?:complete|set|mark|move|capture|add|change|update|clear|start|resume|pause|skip|delete|remove|rename)\b/iu.test(semantics)) || /\bis\s+still\s+(?:waiting|open|blocked|in progress)\b/iu.test(semantics)) { protectedOnly = true; subject = null; continue; }
    if (/\b(?:keep|leave|preserve)\b/iu.test(semantics) && !/\b(?:complete|set|move|update|capture|add)\b/iu.test(semantics)) { protectedOnly = true; subject = null; continue; }
    if (/\b(?:don't|do not|don’t|never|not to)\b/iu.test(semantics) && mutation.test(semantics)) { protectedOnly = true; subject = null; if ([...semantics.matchAll(new RegExp(mutation.source, 'giu'))].length > 1) return ask('Please separate the requested change from what must stay unchanged.'); continue; }
    const captureRestatement = /^\s*(?:capture|save)\s+(?:all\s+(?:of\s+)?)?(?:it|these|them|those)(?:\s+(?:in|into)\s+(?:the\s+)?Inbox)?\s*$/iu.test(part);
    if (captureRestatement && steps.at(-1)?.operation === 'capture_tasks') { steps.at(-1).source += `. ${part}`; subject = null; continue; }
    if (captureRestatement && mindDumpHeader) return ask('What thoughts should I capture in Inbox? Please list them.');
    const contextSlot = /\bcontext\b/iu.test(semantics) && /\b(?:set|update|change|clear|remove|empty)\b/iu.test(semantics) ? contextValue(part) : null;
    const targetText = contextSlot?.literalLength ? part.slice(0, contextSlot.literalStart) + ' '.repeat(contextSlot.literalLength) + part.slice(contextSlot.literalStart + contextSlot.literalLength) : part;
    let targets = targetChoices(targetText, items);
    if (!targets.length && /\b(?:that(?:\s+existing)?\s+task|it|its|them|those tasks)\b/iu.test(semantics) && mutation.test(semantics)) {
      if (!subject?.length || subject.length > 1 && !/\b(?:them|those tasks)\b/iu.test(semantics)) return ask('Which existing task do you mean? Please name it before I change anything.');
      targets = subject;
    }
    let step = { source: part, targets, inert: !mutation.test(semantics) && !/\b(?:show|list|count|how many|working on|in progress|waiting)\b/iu.test(semantics) };
    if (new Set(targets.map(item => item.title)).size !== targets.length && mutation.test(semantics)) return ask('Several tasks match that title. Please specify its parent before changing anything.');
    const reviewMention = /\b(?:weekly\s+review|(?:this|my|the)\s+review|(?:current|this|review|that)\s+(?:weekly\s+|review\s+)?step)\b/iu.test(semantics);
    if ((reviewMention || review && !targets.length && /\b(?:next|move on|advance|move to (?:the )?(?:mind dump|action lists))\b/iu.test(semantics)) && /\b(?:complete|done|finished|finish|move on|move to|advance|next|start|resume|pause|skip|back)\b/iu.test(semantics)) {
      step.operation = 'weekly_review'; step.targets = []; step.action = /\bresume\b/iu.test(semantics) ? 'resume' : /\bpause\b/iu.test(semantics) ? 'pause' : /\bstart\b/iu.test(semantics) ? 'start' : /\bskip\b/iu.test(semantics) ? 'skip_step' : /\bback\b/iu.test(semantics) ? 'back' : 'complete_step'; step.review = JSON.stringify(review);
    } else if (/\bcontext(?:\s+field|\s+value)?\b/iu.test(semantics) && /\b(?:set|update|change|clear|remove|empty)\b/iu.test(semantics)) {
      const value = contextSlot; if (value.question) return ask(value.question);
      if (targets.length !== 1) return ask(targets.length ? 'Several tasks match. Please specify the task and its parent before changing its context.' : 'Which existing task should receive that exact context?');
      step.operation = 'update_item'; step.context = value.value;
    } else if (/\b(?:move|file|organize|put)\b/iu.test(semantics)) {
      step.operation = 'organize_tasks';
      const named = semantics.match(/\b(?:to|into|under|in)\s+(?:a\s+|the\s+)?new\s+Project\s+(?:named|called|titled)\s+/iu);
      const unnamed = semantics.match(/\b(?:to|into|under|in)\s+(?:a\s+|the\s+)?new\s+(.+?)\s+project\s*$/iu);
      let newProjectTitle = named ? explicitNewProjectTitle(part.slice(named.index)) : null;
      if (!newProjectTitle && unnamed) { const prefix = unnamed[0].match(/^.*?\bnew\s+/iu)[0]; newProjectTitle = part.slice(unnamed.index + prefix.length).match(/^(.+?)\s+Project\s*$/iu)?.[1]?.trim(); }
      let destinations = projects.filter(item => [...part.matchAll(new RegExp(`(?:\\b(?:to|into|under|in)\\s+(?:the\\s+)?(?:existing\\s+)?(?:Project\\s+)?["“]?)${escape(item.title)}(?:["”]?)(?![\\p{L}\\p{N}_])`, 'giu'))].some(match => /^(?:to|into|under|in)\s+/iu.test(semantics.slice(match.index))));
      if (destinations.length > 1) destinations = destinations.filter(item => !destinations.some(other => other.title.length > item.title.length && other.title.toLowerCase().startsWith(item.title.toLowerCase())));
      if (destinations.length === 1 && /\b(?:to|into|under|in)\s+(?:the\s+)?existing\b/iu.test(semantics)) step.parentId = destinations[0].id;
      else if (newProjectTitle) step.newProjectTitle = newProjectTitle;
      else if (/\b(?:to|into|back to|in)\s+(?:the\s+)?Inbox\b/iu.test(part)) step.parentId = null;
      else if (destinations.length === 1) step.parentId = destinations[0].id;
      else { const question = `Which Project should contain ${targets.map(item => item.title).join(', ') || 'the task'}? Choose ${projects.map(item => item.title).join(' or ')}${projects.length ? ' or ' : ''}Inbox.`; return ask(question, targets.length ? { targets, destinations: projects, question } : null); }
    } else if (/\b(?:shopping|grocer(?:y|ies)|purchase)\b/iu.test(semantics) && /\b(?:add|buy|need|put)\b/iu.test(semantics)) step.operation = 'add_shopping_item';
    else if (/\b(?:capture|mind dump|save (?:this|these)|tasks? (?:named|called|titled)|exact titles?)\b/iu.test(semantics) || /\b(?:one more|another)\s+(?:thought|idea|commitment)\s*:/iu.test(semantics)) { step.operation = 'capture_tasks'; step.captureTitles = explicitCaptureTitles(part); step.targets = []; }
    else if (/\bcreate\b/iu.test(semantics)) { step.operation = 'create_item'; step.targets = []; }
    else if ((targets.length || /^\s*(?:I(?: have)?\s+)?(?:completed|finished|complete|finish)\b/iu.test(semantics)) && /\b(?:complete[ds]?|finished|finish|done)\b/iu.test(semantics)) { step.operation = 'complete_task'; step.status = 'Completed'; }
    else if ((targets.length || /\b(?:working on|started|waiting for)\b/iu.test(semantics)) && /\b(?:in progress|working on|started|waiting(?: for)?|blocked|reopen|Open)\b/iu.test(semantics)) { step.operation = 'set_task_status'; step.status = /\bwaiting\b/iu.test(semantics) ? 'Waiting For' : /\bblocked\b/iu.test(semantics) ? 'Blocked' : /\breopen|\bOpen\b/iu.test(semantics) ? 'Open' : 'In Progress'; }
    else if (/^\s*(?:please\s+)?(?:count|list|read)\b|\bhow many\b/iu.test(semantics)) step.operation = /^\s*(?:please\s+)?read\b/iu.test(semantics) ? 'read_item' : 'list_items';
    else if (!mutation.test(semantics) && steps.length) continue;
    else step.operation = null; // Current-only model route for requests without strong intent anchors.
    if (mindDumpHeader) {
      if (step.operation !== 'capture_tasks' || /^\s*(?:capture|save)\s+(?:it|these|them|that)(?:\s+(?:in|into)\s+(?:the\s+)?Inbox)?\s*$/iu.test(part)) return ask('What thoughts should I capture in Inbox? Please list them, or separate the other requested action.');
      step.source = `${mindDumpHeader}. ${part}`; mindDumpHeader = null;
    }
    subject = step.targets?.length ? step.targets : null;
    if (['complete_task', 'set_task_status', 'update_item', 'organize_tasks'].includes(step.operation) && new Set(targets.map(item => item.title)).size !== targets.length) return ask('Several tasks match that title. Please specify its parent so I can choose the right task.');
    if (['complete_task', 'set_task_status'].includes(step.operation) && targets.length > 1) steps.push(...targets.map(item => ({ ...step, targets: [item] })));
    else steps.push(step);
  }
  if (mindDumpHeader) return ask('What thoughts should I capture in Inbox? Please list them.');
  if (steps.some(step => step.operation)) for (let index = steps.length - 1; index >= 0; index--) if (!steps[index].operation && steps[index].inert) steps.splice(index, 1);
  if (steps.length > 18 || (steps.length > 1 && steps.some(step => !step.operation))) return ask('Please separate the requested changes so I can identify each task, field and destination before changing anything.');
  const fields = new Map(), distinct = [];
  for (const step of steps) {
    const remainingTargets = [];
    for (const target of step.targets || []) {
      const field = step.status ? 'status' : Object.hasOwn(step, 'context') ? 'context' : step.operation === 'organize_tasks' ? 'parentId' : step.operation;
      const value = step.status || (Object.hasOwn(step, 'context') ? step.context : step.operation === 'organize_tasks' ? Object.hasOwn(step, 'parentId') ? ['existing', step.parentId] : ['new', step.newProjectTitle] : step.operation);
      const key = `${target.id}:${field}`, encoded = JSON.stringify(value);
      if (fields.has(key)) { if (fields.get(key).value !== encoded) return ask('That task has conflicting changes to the same field. Please choose one value before I change anything.'); fields.get(key).step.source += `. ${step.source}`; }
      else { fields.set(key, { value: encoded, step }); remainingTargets.push(target); }
    }
    if (!step.targets?.length || remainingTargets.length) { if (step.targets?.length) step.targets = remainingTargets; distinct.push(step); }
  }
  steps.splice(0, steps.length, ...distinct);
  if (steps.some(step => step.operation && !['weekly_review', 'list_items', 'read_item', 'show_view'].includes(step.operation))) { deferredReview = steps.some(step => step.operation === 'weekly_review'); if (deferredReview) steps.splice(0, steps.length, ...steps.filter(step => step.operation !== 'weekly_review')); }
  if (!steps.length && protectedOnly) return ask('No changes were requested. I kept the existing values.');
  return { steps: steps.length ? steps : [{ operation: null, source: text, targets: [] }], deferredReview };
}

export function plannedCatalog(base, step, snapshot, review, revisions = new Map()) {
  const contextChoice = Object.hasOwn(step, 'context') && base.project(step.context) !== step.context ? 'Exact context value supplied by you' : step.context;
  const tools = base.tools.filter(tool => (!step.operation || tool.name === step.operation) && (step.operation || mutation.test(step.source) || tool.annotations?.readOnlyHint || ['list_items', 'read_item', 'list_attributes', 'read_attribute', 'show_view'].includes(tool.name))).map(tool => {
    const inputSchema = structuredClone(tool.inputSchema), p = inputSchema.properties;
    const titles = step.targets?.map(item => base.project(item.title));
    if (titles?.length && p.title && tool.name !== 'add_shopping_item') p.title.enum = [...new Set(titles)];
    if (titles?.length && p.titles) { p.titles.items.enum = [...new Set(titles)]; p.titles.minItems = p.titles.maxItems = new Set(titles).size; }
    if (step.captureTitles?.length && tool.name === 'capture_tasks') { p.titles.items.enum = step.captureTitles.map(title => base.project(title)); p.titles.minItems = p.titles.maxItems = step.captureTitles.length; }
    if (tool.name === 'organize_tasks' && step.operation) {
      const key = Object.hasOwn(step, 'parentId') ? 'parentId' : 'newProjectTitle', value = key === 'parentId' ? base.project(step.parentId) : base.project(step.newProjectTitle);
      inputSchema.properties = { titles: p.titles, [key]: { type: value === null ? 'null' : 'string', enum: [value] } }; inputSchema.required = ['titles', key]; delete inputSchema.anyOf;
    }
    if (Object.hasOwn(step, 'context')) {
      const id = base.project(step.targets[0].id);
      inputSchema.properties = { id: { type: 'string', enum: [id] }, patch: { type: 'object', properties: { context: { type: 'string', enum: [contextChoice], maxLength: 200 } }, required: ['context'], additionalProperties: false } }; inputSchema.required = ['id', 'patch'];
    }
    if (step.action && p.action) p.action.enum = [step.action];
    if (step.status && p.status) p.status.enum = [step.status];
    return { ...tool, inputSchema };
  });
  return { ...base, tools, resolve(call, fresh = snapshot) {
    if (!tools.some(tool => tool.name === call.name) || step.operation && call.name !== step.operation) fail('The proposal does not match the requested operation.');
    if (step.action && JSON.stringify(review()) !== step.review) fail('The current review step changed. Make a fresh request.', 'stale');
    if (step.targets?.some(old => signature(old) !== signature(fresh.find(item => item.id === old.id)))) fail('The requested task changed. Make a fresh request.', 'stale');
    const args = call.arguments;
    if (Object.hasOwn(step, 'context') && (Object.keys(args).sort().join(',') !== 'id,patch' || Object.keys(args.patch || {}).join(',') !== 'context' || args.patch.context !== contextChoice || args.id !== base.project(step.targets[0].id))) fail('Only the exact requested context may change.');
    if (step.targets?.length && args.title && !step.targets.some(item => base.project(item.title) === args.title)) fail('The proposal selected an unrequested task.');
    if (step.targets?.length && args.titles && (args.titles.length !== new Set(step.targets.map(item => item.title)).size || new Set(args.titles).size !== args.titles.length || args.titles.some(title => !step.targets.some(item => base.project(item.title) === title)))) fail('Choose exactly the requested tasks.');
    if (step.captureTitles?.length && (args.titles?.length !== step.captureTitles.length || new Set(args.titles).size !== step.captureTitles.length || args.titles.some(title => !step.captureTitles.some(actual => base.project(actual) === title)))) fail('Capture every exact requested title once.');
    if (step.operation === 'organize_tasks' && (Object.hasOwn(step, 'parentId') ? args.parentId !== base.project(step.parentId) || Object.hasOwn(args, 'newProjectTitle') : args.newProjectTitle !== base.project(step.newProjectTitle) || Object.hasOwn(args, 'parentId'))) fail('Choose exactly the requested destination.');
    if (step.action && args.action !== step.action || step.status && args.status && args.status !== step.status) fail('The proposal selected an unrequested status or review action.');
    for (const [id, revision] of revisions) if (signature(fresh.find(item => item.id === id)) !== signature(revision.saved)) fail('A previously saved task changed outside this run.', 'stale');
    const compatible = fresh.map(item => revisions.get(item.id)?.original || item);
    let restored = Object.hasOwn(step, 'context') ? { ...call, arguments: { ...args, patch: { context: step.context } } } : call;
    const resolved = base.resolve(restored, compatible);
    if (step.captureTitles?.length) resolved.arguments.titles = args.titles.map(title => step.captureTitles.find(actual => base.project(actual) === title));
    if (Object.hasOwn(step, 'newProjectTitle')) resolved.arguments.newProjectTitle = step.newProjectTitle;
    validateTool(resolved.name, resolved.arguments);
    return resolved;
  } };
}
