import assert from 'node:assert/strict';
import { analyzeRequest, plannedCatalog } from '../request-policy.js';
import { modelCatalog } from '../harness.js';
import { TOOLS } from '../workspace.js';
const items = [
  { id: 'task-a', title: 'Paint hall', type: 'Task', status: 'Open', context: '', parentId: null },
  { id: 'task-b', title: 'Call painter', type: 'Task', status: 'Waiting For', context: '@Work', parentId: null },
  { id: 'project-a', title: 'Home', type: 'Project', status: 'Open', context: '', parentId: null },
  { id: 'project-b', title: 'Home improvements', type: 'Project', status: 'Open', context: '', parentId: null }
];
const review = { index: 6, active: true, completed: [], skipped: [] };
for (const value of ['@Someday/Maybe', '  @Home / @Work  ', 'remove context', 'complete current review step', 'no tools', 'Call painter', '', 'x'.repeat(200), 'task-a', '12345678-1234-1234-1234-123456789abc']) {
  const text = `Set the context of Paint hall to ${JSON.stringify(value)}.`;
  const plan = analyzeRequest(text, items, review); assert.equal(plan.steps[0]?.context, value, text);
  const base = modelCatalog(TOOLS, items, { request: text }); const scoped = plannedCatalog(base, plan.steps[0], items, () => review);
  assert.deepEqual(scoped.tools.map(tool => tool.name), ['update_item']);
  const args = { id: base.project('task-a'), patch: { context: scoped.tools[0].inputSchema.properties.patch.properties.context.enum[0] } };
  assert.equal(scoped.resolve({ name: 'update_item', arguments: args }).arguments.patch.context, value);
  assert.throws(() => scoped.resolve({ name: 'update_item', arguments: { ...args, patch: { context: value, status: 'Completed' } } }));
  assert.throws(() => scoped.resolve({ name: 'complete_task', arguments: { title: 'Paint hall' } }));
}
assert.equal(analyzeRequest('Change the context to exactly "@Someday/Maybe" for Paint hall. The @ character is part of the value.', items).steps[0].context, '@Someday/Maybe');
assert.equal(analyzeRequest('Clear the context of Paint hall.', items).steps[0].context, '');
assert.ok(analyzeRequest('Set Paint hall context to multiword context', items).question);
assert.ok(analyzeRequest(`Set Paint hall context to "${'x'.repeat(201)}"`, items).question);
assert.equal(analyzeRequest('Move Paint hall to Home improvements.', items).steps[0].parentId, 'project-b');
assert.equal(analyzeRequest('Move Paint hall back to Inbox.', items).steps[0].parentId, null);
const moveText = 'Move Paint hall and Call painter to Home improvements.';
const movePlan = analyzeRequest(moveText, items); const moveBase = modelCatalog(TOOLS, items, { request: moveText }); const moveCatalog = plannedCatalog(moveBase, movePlan.steps[0], items, () => null);
assert.throws(() => moveCatalog.resolve({ name: 'organize_tasks', arguments: { titles: ['Paint hall', 'Paint hall'], parentId: moveBase.project('project-b') } }));
assert.deepEqual(moveCatalog.resolve({ name: 'organize_tasks', arguments: { titles: ['Paint hall', 'Call painter'], parentId: moveBase.project('project-b') } }).arguments.titles, ['Paint hall', 'Call painter']);
const protectedReview = analyzeRequest('I reviewed Waiting For. Call painter is still waiting; keep its status. Complete the current weekly review step.', items, review);
assert.deepEqual(protectedReview.steps.map(step => step.operation), ['weekly_review']); assert.equal(protectedReview.steps[0].action, 'complete_step');
assert.deepEqual(analyzeRequest('Complete Paint hall and set Call painter to Waiting For.', items).steps.map(step => step.operation), ['complete_task', 'set_task_status']);
assert.deepEqual(analyzeRequest('Complete Paint hall and do not complete current review step.', items).steps.map(step => step.operation), ['complete_task']);
for (const text of ['Do not complete Paint hall', 'Do not clear Paint hall context.', 'Do not start my weekly review.', 'Do not put Paint hall in Inbox.', 'Do not rename Paint hall.', 'Keep Paint hall Open', 'Complete Paint hall and rename Home to House.', 'Complete Paint hall and set Paint hall to Waiting For.']) assert.ok(analyzeRequest(text, items).question, text);
const pending = analyzeRequest('Move Paint hall to a Project. Ask which before changing it.', items); assert.equal(pending.steps.length, 0); assert.ok(pending.pending);
assert.equal(analyzeRequest('Use Home improvements', items, null, pending.pending).steps[0].parentId, 'project-b');
assert.equal(analyzeRequest('Use Inbox', items, null, pending.pending).steps[0].parentId, null);
assert.ok(analyzeRequest('Do not use Home improvements', items, null, pending.pending).question);
assert.equal(analyzeRequest('No tools: which Project should Paint hall belong in?', items).pending, null);
const duplicated = [...items, { ...items[3], id: 'project-c' }]; assert.ok(analyzeRequest('Use Home improvements', duplicated, null, pending.pending).question);
assert.ok(analyzeRequest('Use Home improvements', items.filter(item => item.id !== 'task-a'), null, pending.pending).question);
assert.equal(analyzeRequest("Don't move Paint hall; ask before changing it.", items).pending, null);
const duplicateTasks = [...items, { ...items[0], id: 'task-duplicate', parentId: 'project-b' }];
assert.equal(analyzeRequest('Move Paint hall to a Project. Ask which before changing it.', duplicateTasks).pending, null);
assert.equal(analyzeRequest('Set the context of Paint hall under Project Home improvements to "Call painter".', duplicateTasks).steps[0].targets[0].id, 'task-duplicate');
const dumpTitles = ['Compare car insurance', 'Book a test drive', 'Renew my passport', 'Chase kitchen quote', 'Research options for a new car', 'Sketch a reading nook layout'];
const dumpRequest = `Here is my mind dump. Capture these exact titles: ${dumpTitles.map(title => JSON.stringify(title)).join(', ')}.`;
const dump = analyzeRequest(dumpRequest, items); assert.equal(dump.steps.length, 1); assert.equal(dump.steps[0].operation, 'capture_tasks'); assert.deepEqual(dump.steps[0].captureTitles, dumpTitles);
for (const header of ['Here is my mind dump.', 'Mind dump.', 'This is the mind dump.']) assert.ok(analyzeRequest(header, items).question);
assert.ok(analyzeRequest('Here is my mind dump. Rename Home to House.', items).question);
assert.equal(analyzeRequest('Here is my mind dump. Capture exact title: "Find hiking boots" and capture exact title: "Plan a picnic".', items).steps.length, 2);
for (const title of ['Paint hall', 'Call painter']) {
  const waiting = analyzeRequest(`I am waiting for ${title}. Set that task to Waiting For.`, items); assert.equal(waiting.steps.length, 1); assert.equal(waiting.steps[0].status, 'Waiting For'); assert.equal(waiting.steps[0].targets[0].title, title);
  const complete = analyzeRequest(`I completed ${title}. Mark that existing task complete.`, items); assert.equal(complete.steps.length, 1); assert.equal(complete.steps[0].operation, 'complete_task');
  const independent = analyzeRequest(`I am waiting for ${title}. Set its context to "@Home / planning".`, items); assert.equal(independent.steps.length, 2); assert.equal(independent.steps[1].context, '@Home / planning'); assert.equal(independent.steps[1].targets[0].title, title);
  assert.ok(analyzeRequest(`I completed ${title}. Mark it Waiting For.`, items).question);
}
assert.ok(analyzeRequest('Mark that existing task complete.', items).question);
assert.ok(analyzeRequest('Complete Paint hall. Keep Call painter waiting. Move it to Home.', items).question);
const plural = analyzeRequest('Set Paint hall and Call painter to Waiting For. Mark them Waiting For.', items); assert.equal(plural.steps.length, 2);
const overlap = analyzeRequest('Move Paint hall to Home. Move Paint hall and Call painter to Home.', items); assert.equal(overlap.steps.length, 2); assert.deepEqual(overlap.steps[1].targets.map(item => item.title), ['Call painter']);
const car = { ...items[3], id: 'car-project', title: 'Choose a new car' };
const newNamed = { ...items[2], id: 'new-project', title: 'Start a new studio' };
for (const destination of [car, newNamed]) { const known = [...items, destination]; const plan = analyzeRequest(`Move Paint hall to the existing ${destination.title} Project.`, known); assert.equal(plan.steps[0].parentId, destination.id); assert.equal(Object.hasOwn(plan.steps[0], 'newProjectTitle'), false); }
assert.equal(analyzeRequest('Move Paint hall under a new Buy new car project.', items).steps[0].newProjectTitle, 'Buy new car');
assert.equal(analyzeRequest('Move Paint hall under a new Project named "House repairs".', items).steps[0].newProjectTitle, 'House repairs');
const literalTask = { ...items[0], id: 'literal-task', title: 'Inspect new Project named Car' };
assert.equal(analyzeRequest('Move "Inspect new Project named Car" to existing Home improvements.', [...items, literalTask]).steps[0].parentId, 'project-b');
const narrated = analyzeRequest('My mind dump is captured and organized. Complete the current Empty your head review step.', items, review); assert.deepEqual(narrated.steps.map(step => step.operation), ['weekly_review']); assert.equal(narrated.steps[0].action, 'complete_step');
assert.deepEqual(analyzeRequest('My mind dump is saved. Capture exact title: "Plan the holiday".', items, review).steps.map(step => step.operation), ['capture_tasks']);
assert.ok(analyzeRequest('My mind dump is captured and organized.', items, review).question);
const ordinaryDump = analyzeRequest('Mind dump: compare car insurance, book a test drive and renew passport at home. Capture them in Inbox.', [], review); assert.equal(ordinaryDump.steps.length, 1); assert.equal(ordinaryDump.steps[0].operation, 'capture_tasks');
const suppliedThought = analyzeRequest('One more thought: chase the dealer quote at work. Capture it.', [], review); assert.equal(suppliedThought.steps.length, 1); assert.equal(suppliedThought.steps[0].operation, 'capture_tasks'); assert.ok(suppliedThought.steps[0].source.includes('chase the dealer quote'));
console.log('Request policy checks passed: literal fields, protective negation, finite compound plans, review binding and grounded clarification.');
