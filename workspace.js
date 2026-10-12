export const TYPES = ['Project', 'Role', 'Area of Responsibility', 'Checklist', 'Shopping List', 'Task'];
export const STATUSES = ['Open', 'In Progress', 'Completed', 'Waiting For', 'Blocked'];
export const EDITABLE = ['type', 'title', 'description', 'status', 'context', 'parentId'];
export const ATTRIBUTES = ['id', ...EDITABLE, 'createdAt', 'updatedAt'];
export const VIEWS = { inbox: 'Inbox', projects: 'Projects', roles: 'Roles', areas: 'Areas of responsibility', checklists: 'Checklists', shopping: 'Shopping lists', all: 'All items', someday: 'Someday/Maybe' };
export const GROUP_TYPES = { projects: 'Project', roles: 'Role', areas: 'Area of Responsibility', checklists: 'Checklist', shopping: 'Shopping List' };
export function fail(message, code = 'invalid') { throw Object.assign(new Error(message), { code }); }
export function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
export function keys(value, allowed, required = []) {
  if (!object(value)) fail('Arguments must be an object.');
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`Unknown field: ${key}`);
  for (const key of required) if (!Object.hasOwn(value, key)) fail(`Required field: ${key}`);
}
export function descendants(items, id) {
  const ids = new Set([id]);
  let added = true;
  while (added) { added = false; for (const item of items) if (ids.has(item.parentId) && !ids.has(item.id)) { ids.add(item.id); added = true; } }
  return items.filter(item => ids.has(item.id));
}
export function validateItem(patch, items, previous = null) {
  keys(patch, EDITABLE);
  if (!Object.keys(patch).length) fail('Provide at least one editable attribute.');
  const item = { type: 'Task', title: '', description: '', status: 'Open', context: '', parentId: null, ...previous, ...patch };
  if (!TYPES.includes(item.type)) fail('Choose a known type.');
  if (!STATUSES.includes(item.status)) fail('Choose a known status.');
  for (const [field, limit] of [['title', 200], ['context', 200], ['description', 10000]]) {
    if (typeof item[field] !== 'string' || item[field].length > limit) fail(`${field} must be text of at most ${limit} characters.`);
  }
  item.title = item.title.trim();
  if (!item.title) fail('Title is required.');
  if (item.parentId !== null) {
    if (typeof item.parentId !== 'string' || !items.some(parent => parent.id === item.parentId)) fail('Parent item no longer exists.');
    if (previous && descendants(items, previous.id).some(child => child.id === item.parentId)) fail('An item cannot be its own parent or a descendant of itself.');
  }
  return item;
}
export function filterItems(items, filters = {}) {
  return items.filter(item => (!Object.hasOwn(filters, 'parentId') || item.parentId === filters.parentId)
    && (!filters.type || item.type === filters.type) && (!filters.status || item.status === filters.status)
    && (!filters.incomplete || item.status !== 'Completed')
    && (!filters.context || item.context.toLowerCase().includes(filters.context.toLowerCase()))
    && (!filters.search || `${item.title} ${item.description}`.toLowerCase().includes(filters.search.toLowerCase())));
}
const str = (maxLength = 200) => ({ type: 'string', maxLength });
const idSchema = { type: 'string', minLength: 1, maxLength: 200 };
const parentSchema = { type: ['string', 'null'], maxLength: 200, description: 'The actual ID of an existing container or parent from tool results. Null means Inbox. A shopping entry uses its Shopping List ID.' };
const fields = { title: { ...str(), minLength: 1 }, type: { type: 'string', enum: TYPES, description: 'Task means a thing to do or buy, such as Bananas. Shopping List means the container itself, such as Groceries, never the item to buy. New items default to Task; omit on updates unless changing type.' }, description: str(10000), status: { type: 'string', enum: STATUSES, description: 'Completed marks an existing task done; Open means still to do.' }, context: { ...str(), description: 'Optional text such as @Home. Omit when unspecified; do not use null.' }, parentId: parentSchema };
const schema = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const filters = { search: str(), status: fields.status, context: str() };
export const TOOLS = [
  ['add_shopping_item', 'Add a thing to buy to a Shopping List as a child Task. Reuse an existing list, or create a Shopping List container if absent. If more than one list is possible, ask which list. Do not create a Shopping List named after the purchase. An existing completed purchase is reopened; an existing open purchase is not duplicated.', schema({ title: { ...str(), minLength: 1 }, listTitle: { ...str(), minLength: 1 } }, ['title']), false],
  ['complete_task', 'Mark an existing Task completed by its title. Resolve exact title first. Ambiguous or missing tasks return a clarification question without changing anything. Changes only status; never creates or deletes a task.', schema({ title: { ...str(), minLength: 1 } }, ['title']), false],
  ['list_items', 'Find existing items and their IDs by type or title search. Search Shopping List containers before adding purchases; search Tasks before marking them completed. parentId selects children of a list. Omitted parentId searches all items; null means Inbox.', schema({ parentId: parentSchema, type: fields.type, ...filters, limit: { type: 'integer', minimum: 1, maximum: 100 } }), true],
  ['read_item', 'Read one item and its immediate child IDs.', schema({ id: idSchema }, ['id']), true],
  ['create_item', 'Create a Task for a thing to do or buy. A purchase such as Bananas is type Task, with parentId set to the actual Shopping List ID. To create the container itself, use type Shopping List and a container title such as Shopping List or Groceries. Find or create that container before adding its Task. Defaults: Task, Open, Inbox.', schema(fields, ['title']), false],
  ['update_item', 'Update editable attributes of an existing item.', schema({ id: idSchema, patch: { ...schema(fields), minProperties: 1 } }, ['id', 'patch']), false],
  ['delete_item', 'Permanently delete an item and all descendants. Always requires explicit app confirmation.', schema({ id: idSchema }, ['id']), false],
  ['list_attributes', 'List attributes, allowed types/statuses and parent rules.', schema({}), true],
  ['read_attribute', 'Read a documented item attribute.', schema({ id: idSchema, attribute: { type: 'string', enum: ATTRIBUTES } }, ['id', 'attribute']), true],
  ['update_attribute', 'Update one editable attribute using the normal item validator.', schema({ id: idSchema, attribute: { type: 'string', enum: EDITABLE }, value: { type: ['string', 'null'], maxLength: 10000 } }, ['id', 'attribute', 'value']), false],
  ['set_parent', 'Link, reparent, or unlink an item. Descendants are preserved.', schema({ id: idSchema, parentId: parentSchema }, ['id', 'parentId']), false],
  ['show_view', 'Show a named list or item. Unsaved changes require a user decision.', { ...schema({ view: { type: 'string', enum: Object.keys(VIEWS) }, itemId: idSchema, ...filters }), oneOf: [{ required: ['view'], not: { required: ['itemId'] } }, { required: ['itemId'], not: { required: ['view'] } }] }, false]
].map(([name, description, inputSchema, readOnlyHint]) => ({ name, description, inputSchema, annotations: { readOnlyHint, untrustedContentHint: true, consequentialHint: name === 'delete_item' } }));
function validateSchema(value, definition, path = 'arguments') {
  if (definition.type) {
    const types = Array.isArray(definition.type) ? definition.type : [definition.type];
    const actual = value === null ? 'null' : object(value) ? 'object' : typeof value === 'number' && Number.isInteger(value) ? 'integer' : typeof value;
    if (!types.includes(actual)) fail(`${path} has an invalid type.`);
  }
  if (definition.enum && !definition.enum.includes(value)) fail(`${path} has an unknown value.`);
  if (typeof value === 'string' && (value.length > (definition.maxLength ?? Infinity) || value.length < (definition.minLength ?? 0))) fail(`${path} has an invalid length.`);
  if (typeof value === 'number' && (value < definition.minimum || value > definition.maximum)) fail(`${path} is outside the allowed range.`);
  if (definition.type === 'object') {
    keys(value, Object.keys(definition.properties), definition.required);
    if (Object.keys(value).length < (definition.minProperties || 0)) fail(`${path} cannot be empty.`);
    for (const key of Object.keys(value)) validateSchema(value[key], definition.properties[key], `${path}.${key}`);
  }
}
export function validateTool(name, args) {
  const tool = TOOLS.find(tool => tool.name === name);
  if (!tool) fail('Unknown tool.');
  validateSchema(args, tool.inputSchema);
  if (name === 'show_view' && (Object.hasOwn(args, 'view') === Object.hasOwn(args, 'itemId'))) fail('Choose exactly one view or itemId.');
  return args;
}
function normalizedTitle(title) { return title.trim().replace(/\s+/gu, ' ').toLowerCase(); }
export function planWorkflow(name, args, items) {
  if (!['add_shopping_item', 'complete_task'].includes(name)) fail('Unknown workflow.');
  validateTool(name, args);
  const title = args.title.trim(), listTitle = args.listTitle?.trim();
  if (!title || (Object.hasOwn(args, 'listTitle') && !listTitle)) fail('A nonempty title is required.');
  const normalized = normalizedTitle(title), mutations = [], relevant = new Map();
  const remember = records => { for (const item of records) relevant.set(item.id, item); };
  const candidate = item => ({ id: item.id, title: item.title, parentTitle: items.find(parent => parent.id === item.parentId)?.title || 'Inbox' });
  function finish(result, effect) {
    const records = [...relevant.values()].sort((a, b) => a.id.localeCompare(b.id)).map(item => Object.fromEntries(ATTRIBUTES.map(attribute => [attribute, item[attribute]])));
    return { ok: true, summary: result.message, effect, snapshot: JSON.stringify({ name, title: normalized, listTitle: listTitle === undefined ? null : normalizedTitle(listTitle), outcome: result.outcome, effect, records }), mutations, result };
  }
  function clarify(question, records) {
    remember(records);
    const candidates = records.map(candidate);
    return finish({ outcome: 'clarification', message: question, question, candidates }, { action: 'Ask for clarification; no items will change', question, candidates });
  }
  if (name === 'complete_task') {
    const tasks = items.filter(item => item.type === 'Task');
    const exact = tasks.filter(item => normalizedTitle(item.title) === normalized);
    // shortcut: conservative whole-word phrase matching only; no fuzzy guessing.
    const matching = exact.length ? exact : tasks.filter(item => ` ${normalizedTitle(item.title)} `.includes(` ${normalized} `));
    if (!matching.length) return clarify(`No task matches “${title}”. Which existing task should I complete?`, tasks);
    if (matching.length > 1) return clarify(`Several tasks match “${title}”. Which one should I complete?`, matching);
    const task = matching[0]; remember([task]); const parent = items.find(item => item.id === task.parentId); if (parent) remember([parent]);
    const already = task.status === 'Completed';
    if (!already) mutations.push({ kind: 'update', id: task.id, patch: { status: 'Completed' } });
    return finish({ outcome: already ? 'already_completed' : 'completed', message: already ? `“${task.title}” is already completed.` : `Marked “${task.title}” completed.`, item: task }, { action: already ? 'No change; task is already completed' : 'Mark existing task completed', task: candidate(task), fromStatus: task.status, toStatus: 'Completed', changes: already ? [] : ['status only'] });
  }
  const lists = items.filter(item => item.type === 'Shopping List');
  const matchingLists = listTitle === undefined ? lists : lists.filter(item => normalizedTitle(item.title) === normalizedTitle(listTitle));
  remember(matchingLists);
  if (matchingLists.length > 1) return clarify(listTitle === undefined ? 'Which shopping list should I add this item to?' : `Several shopping lists match “${listTitle}”. Which one should I use?`, matchingLists);
  const list = matchingLists[0];
  const targetTitle = list?.title || listTitle || 'Shopping List';
  const children = list ? items.filter(item => item.type === 'Task' && item.parentId === list.id && normalizedTitle(item.title) === normalized) : [];
  remember(children);
  if (children.length > 1) return clarify(`Several purchases named “${title}” are in “${targetTitle}”. Which one should I use?`, children);
  const child = children[0];
  if (!list) mutations.push({ kind: 'create', ref: 'list', patch: { title: targetTitle, type: 'Shopping List' } });
  if (!child) mutations.push({ kind: 'create', ref: 'item', patch: { title, type: 'Task', parentId: list?.id || null }, ...(!list ? { parentRef: 'list' } : {}) });
  else if (child.status === 'Completed') mutations.push({ kind: 'update', id: child.id, patch: { status: 'Open' } });
  const outcome = !child ? 'created' : child.status === 'Completed' ? 'reopened' : 'already_listed';
  const message = outcome === 'created' ? `Added “${title}” to “${targetTitle}”.` : outcome === 'reopened' ? `Reopened “${child.title}” in “${targetTitle}”.` : `“${child.title}” is already listed in “${targetTitle}”.`;
  return finish({ outcome, message, ...(child ? { item: child } : {}), ...(list ? { list } : {}) }, { action: outcome === 'created' ? 'Add a shopping Task' : outcome === 'reopened' ? 'Reopen an existing shopping Task' : 'No change; purchase is already listed', shoppingList: { ...(list ? { id: list.id } : {}), title: targetTitle, create: !list }, purchase: { ...(child ? { id: child.id } : {}), title: child?.title || title, type: 'Task' }, changes: mutations.map(change => change.kind === 'create' ? `Create ${change.patch.type}: ${change.patch.title}` : `Change status from ${child.status} to Open only`) });
}
// Chrome 154's model decoder rejects these keywords. Full validation still uses TOOLS.
export function decoderSchema(value) {
  if (Array.isArray(value)) return value.map(decoderSchema);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !['oneOf', 'not', 'minProperties'].includes(key)).map(([key, item]) => [key, decoderSchema(item)]));
}
export const RESPONSE_SCHEMA = schema({ message: { type: 'string', maxLength: 8000 }, tool: { anyOf: [{ type: 'null' }, ...TOOLS.map(tool => schema({ name: { type: 'string', enum: [tool.name] }, arguments: decoderSchema(tool.inputSchema) }, ['name', 'arguments']))] } }, ['message', 'tool']);
export function parseEnvelope(text) {
  if (typeof text !== 'string' || text.length > 25000) fail('The model returned an invalid response.');
  let result; try { result = JSON.parse(text); } catch { fail('The model did not return valid JSON.'); }
  keys(result, ['message', 'tool'], ['message', 'tool']);
  if (typeof result.message !== 'string' || result.message.length > 8000 || (!result.message.trim() && result.tool === null)) fail('The model returned an empty or invalid message.');
  if (result.tool !== null) { keys(result.tool, ['name', 'arguments'], ['name', 'arguments']); validateTool(result.tool.name, result.tool.arguments); }
  return result;
}
export const REVIEW_STEPS = [
  ['collect', 'Get clear', 'Collect loose papers and materials', 'inbox', {}, 'Ask what loose materials need capturing.'],
  ['inbox-zero', 'Get clear', 'Get “In” to zero', 'inbox', {}, 'Help clarify each Inbox item and its next action or parent.'],
  ['head', 'Get clear', 'Empty your head', 'inbox', {}, 'Ask about uncaptured commitments and create only what the user requests.'],
  ['actions', 'Get current', 'Review action lists', 'all', { type: 'Task', incomplete: true }, 'Review incomplete tasks and their next actions and contexts.'],
  ['past-calendar', 'Get current', 'Review past calendar', 'all', {}, 'You cannot read calendars. Ask the user to consult their own past calendar and share follow-ups.'],
  ['upcoming-calendar', 'Get current', 'Review upcoming calendar', 'all', {}, 'You cannot read calendars. Ask the user to consult their upcoming calendar for preparation work.'],
  ['waiting', 'Get current', 'Review Waiting For', 'all', { status: 'Waiting For' }, 'Ask what waiting items need chasing or closing.'],
  ['projects', 'Get current', 'Review projects and larger outcomes', 'projects', {}, 'Review outcomes and missing next actions.'],
  ['checklists', 'Get current', 'Review relevant checklists', 'checklists', {}, 'Review recurring obligations.'],
  ['someday', 'Get creative', 'Review Someday/Maybe', 'someday', {}, 'Ask which possibilities to activate, keep or explicitly delete.'],
  ['creative', 'Get creative', 'Be creative & courageous', 'inbox', {}, 'Ask about new possibilities and capture explicit choices.']
].map(([id, phase, title, view, filters, instruction]) => ({ id, phase, title, view, filters, instruction }));
