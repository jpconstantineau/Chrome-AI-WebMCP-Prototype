import assert from 'node:assert/strict';
import { TOOLS, validateItem, validateTool, validateUserAnswer, decoderSchema } from '../workspace.js';
import { modelCatalog, declarations } from '../harness.js';
import { analyzeRequest, plannedCatalog } from '../request-policy.js';

const area = { id: 'area-home', title: 'Home Maintenance', type: 'Area of Responsibility', status: 'Open', context: '', description: '', parentId: null };
const task = { ...area, id: 'task-shower', title: 'Repair sink', type: 'Task', parentId: area.id };
const items = [area, task];
function catalogFor(text, records = items, options = {}) {
  const plan = analyzeRequest(text, records);
  assert.equal(plan.steps.length, 1, text);
  const base = modelCatalog(TOOLS, records, { request: text, ...options });
  return { step: plan.steps[0], base, catalog: plannedCatalog(base, plan.steps[0], records, () => null) };
}
for (const [text, title] of [['add Home Maintenance to Areas of Responsibilities', 'Home Maintenance'], ['Add "House & Garden" to areas of responsibility', 'House & Garden']]) {
  const { step, catalog } = catalogFor(text);
  assert.equal(step.operation, 'create_item');
  assert.deepEqual(step.creation, { title, type: 'Area of Responsibility', status: 'Open', parentId: null });
  assert.deepEqual(catalog.tools.map(tool => tool.name), ['create_item']);
  assert.deepEqual(validateItem(catalog.resolve({ name: 'create_item', arguments: step.creation }).arguments, items).type, 'Area of Responsibility');
  for (const patch of [{ type: 'Shopping List' }, { title: title.toUpperCase() }, { context: '@Home' }, { parentId: 'area-home' }]) assert.throws(() => catalog.resolve({ name: 'create_item', arguments: { ...step.creation, ...patch } }));
  assert.throws(() => catalog.resolve({ name: 'add_shopping_item', arguments: { title } }));
}
for (const [text, title] of [['add repair shower to home maintenance', 'repair shower'], ['Please add "Inspect Shower / Valve" under "Home Maintenance"', 'Inspect Shower / Valve'], ['add "Call plumber to arrange repair" to Home Maintenance', 'Call plumber to arrange repair']]) {
  const { step, base, catalog } = catalogFor(text);
  assert.equal(step.operation, 'create_item');
  assert.deepEqual(step.creation, { title, type: 'Task', status: 'Open', parentId: area.id });
  const args = { ...step.creation, parentId: base.project(area.id) };
  assert.deepEqual(catalog.resolve({ name: 'create_item', arguments: args }).arguments, step.creation);
  assert.equal(validateItem(catalog.resolve({ name: 'create_item', arguments: args }).arguments, items).parentId, area.id);
  assert.throws(() => catalog.resolve({ name: 'create_item', arguments: { ...args, parentId: null } }));
  assert.throws(() => catalog.resolve({ name: 'create_item', arguments: { ...args, type: 'Shopping List' } }));
  assert.throws(() => catalog.resolve({ name: 'create_item', arguments: args }, [task]));
  assert.throws(() => catalog.resolve({ name: 'create_item', arguments: args }, [...items, { ...area, id: 'duplicate-area' }]));
  assert.doesNotMatch(JSON.stringify(catalog.tools), /area-home/);
}
for (const records of [[], [...items, { ...area, id: 'other-area' }]]) assert.ok(analyzeRequest('add repair shower to home maintenance', records).question);
assert.ok(analyzeRequest('Do not add repair shower to Home Maintenance', items).question);
assert.equal(analyzeRequest('add bananas to shopping list', items).steps[0].operation, 'add_shopping_item');
assert.equal(analyzeRequest('ask me which maintenance task to do first', items).steps[0].operation, 'ask_user');

const args = { question: 'Which task should we discuss?', options: ['Repair shower', 'Inspect roof'] };
assert.equal(TOOLS.find(tool => tool.name === 'ask_user').annotations.readOnlyHint, true);
const questionTool = TOOLS.find(tool => tool.name === 'ask_user');
assert.equal(questionTool.inputSchema.properties.options.uniqueItems, true);
for (const profile of ['chromium-compatibility', 'descriptions']) {
  assert.equal(Object.hasOwn(decoderSchema(questionTool.inputSchema, profile).properties.options, 'uniqueItems'), false);
  assert.equal(Object.hasOwn(declarations([questionTool], profile)[0].inputSchema.properties.options, 'uniqueItems'), false);
  const projected = modelCatalog(TOOLS, items, { decoderProfile: profile }).tools.find(tool => tool.name === 'ask_user');
  assert.equal(Object.hasOwn(projected.inputSchema.properties.options, 'uniqueItems'), false);
}
assert.deepEqual(validateUserAnswer(args, 'A different task / @Home'), { question: args.question, answer: 'A different task / @Home' });
assert.deepEqual(validateTool('ask_user', args), args);
for (const invalid of [{ ...args, question: ' ' }, { ...args, options: ['One'] }, { ...args, options: ['One', ' one '] }, { ...args, options: ['One', ''] }, { ...args, options: Array(9).fill('One') }, { ...args, options: ['One', 'x'.repeat(121)] }, { ...args, approved: true }]) assert.throws(() => validateTool('ask_user', invalid));
for (const answer of ['', ' ', null, 'x'.repeat(8001)]) assert.throws(() => validateUserAnswer(args, answer));
const { catalog } = catalogFor('Set the context of Repair sink to "@Home / repairs".', items, { allowQuestions: true });
assert.deepEqual(catalog.tools.map(tool => tool.name), ['ask_user', 'update_item']);
assert.deepEqual(catalog.resolve({ name: 'ask_user', arguments: args }).arguments, args);
assert.throws(() => catalog.resolve({ name: 'complete_task', arguments: { title: task.title } }));
console.log('Conversation domain passed: exact Area/container creation, grounded child Tasks, parent staleness/ambiguity, shopping separation and bounded custom-answer question tools.');

for (const [destination, type] of [['Projects', 'Project'], ['Roles', 'Role'], ['Checklists', 'Checklist'], ['Areas', 'Area of Responsibility']]) {
  const plan = analyzeRequest(`add Exact new title to ${destination}`, []);
  assert.deepEqual(plan.steps[0].creation, { title: 'Exact new title', type, status: 'Open', parentId: null });
}

for (const destination of ['Projects', 'Roles', 'Checklists', 'Areas']) {
  const parent = { ...area, title: destination };
  const plan = analyzeRequest(`add "Schedule inspection" under "${destination}"`, [parent]);
  assert.deepEqual(plan.steps[0].creation, { title: 'Schedule inspection', type: 'Task', status: 'Open', parentId: parent.id });
}
