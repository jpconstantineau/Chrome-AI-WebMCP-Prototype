const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const URL = process.env.APP_URL || 'http://127.0.0.1:8765';
let browser;
(async () => {
  browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'chrome', headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block' }), page = await context.newPage();
  await page.goto(URL);
  const report = await page.evaluate(async () => {
    const { planWorkflow, validateTool } = await import('./workspace.js');
    const { openDatabase, read, mutate } = await import('./storage.js');
    const db = await openDatabase(() => {}), checks = [];
    const check = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
    const all = () => read(db, 'items');
    async function workflow(name, args, captured = null, signal) { const plan = captured || planWorkflow(name, args, await all()); return mutate(db, { kind: 'workflow', name, args, snapshot: plan.snapshot }, signal); }
    const create = patch => mutate(db, { kind: 'create', patch });
    async function rejects(fn, code) { try { await fn(); throw new Error('Expected operation rejection.'); } catch (error) { if (error.code !== code) throw error; } }
    try {
      let rejected = false; try { validateTool('complete_task', { title: 'Task', approved: true }); } catch { rejected = true; } check(rejected, 'Workflow schemas reject approval and unknown fields');
      rejected = false; try { planWorkflow('add_shopping_item', { title: '   ' }, []); } catch { rejected = true; } check(rejected, 'Blank workflow titles reject before planning');
      const proposal = planWorkflow('add_shopping_item', { title: 'Bananas' }, await all());
      check(proposal.ok && proposal.mutations.length === 2 && (await all()).length === 0, 'Planning alone makes no writes before approval');
      const added = await workflow('add_shopping_item', { title: 'Bananas' }, proposal);
      check(added.outcome === 'created' && added.changedItems.length === 2 && added.list.type === 'Shopping List' && added.list.title === 'Shopping List' && added.item.type === 'Task' && added.item.parentId === added.list.id, 'Missing list and its Task commit atomically with actual IDs');
      const duplicate = await workflow('add_shopping_item', { title: '  bANANAS  ' });
      check(duplicate.outcome === 'already_listed' && !duplicate.changedItems.length && (await all()).length === 2, 'Case and whitespace normalized purchase deduplicates');
      const detailed = await mutate(db, { kind: 'update', id: added.item.id, patch: { description: 'Keep the full outcome.', context: '@Home', status: 'Completed' } });
      const reopen = await workflow('add_shopping_item', { title: 'bananas' });
      check(reopen.outcome === 'reopened' && reopen.changedItems.length === 1 && reopen.item.id === detailed.id && reopen.item.status === 'Open' && reopen.item.description === detailed.description && reopen.item.context === detailed.context && reopen.item.parentId === detailed.parentId && reopen.item.createdAt === detailed.createdAt, 'Completed purchase reopens with status-only changes');
      const second = await create({ title: 'Hardware', type: 'Shopping List' });
      const ambiguous = await workflow('add_shopping_item', { title: 'Carrots' });
      check(ambiguous.outcome === 'clarification' && ambiguous.question && ambiguous.candidates.length === 2 && !ambiguous.changedItems.length && (await all()).length === 3, 'Multiple unnamed shopping lists clarify without writes');
      const named = await workflow('add_shopping_item', { title: 'Screws', listTitle: ' hardware ' });
      check(named.outcome === 'created' && named.list.id === second.id && named.item.parentId === second.id, 'Explicit normalized Shopping List name resolves existing container');
      const newNamed = await workflow('add_shopping_item', { title: 'Milk', listTitle: 'Weekend groceries' });
      check(newNamed.changedItems.length === 2 && newNamed.list.title === 'Weekend groceries' && newNamed.item.parentId === newNamed.list.id, 'Absent named shopping list and Task are created together');
      await create({ title: 'BANANAS', parentId: added.list.id });
      const ambiguousChild = await workflow('add_shopping_item', { title: 'bananas', listTitle: 'Shopping List' });
      check(ambiguousChild.outcome === 'clarification' && ambiguousChild.candidates.length === 2 && !ambiguousChild.changedItems.length, 'Duplicate purchase titles clarify without choosing a child');
      const parent = await create({ title: 'Home responsibilities', type: 'Project' });
      const task = await create({ title: 'Call   dentist', description: 'Book a check-up', context: '@Work', parentId: parent.id, status: 'In Progress' });
      await create({ title: 'Call dentist later' });
      const complete = await workflow('complete_task', { title: '  CALL dentist ' });
      check(complete.outcome === 'completed' && complete.item.id === task.id && complete.item.status === 'Completed' && complete.item.description === task.description && complete.item.context === task.context && complete.item.parentId === parent.id && complete.item.type === 'Task' && complete.item.createdAt === task.createdAt, 'Exact title wins over partial matches and completion changes status only');
      const already = await workflow('complete_task', { title: 'Call dentist' });
      check(already.outcome === 'already_completed' && !already.changedItems.length && already.item.updatedAt === complete.item.updatedAt, 'Already-completed task is an idempotent no-op');
      const unique = await create({ title: 'Clean the blue shelf' });
      const partial = await workflow('complete_task', { title: 'blue shelf' });
      check(partial.item.id === unique.id && partial.outcome === 'completed', 'Unique whole-word phrase can conservatively resolve a task');
      const noMatchCount = (await all()).length, noMatch = await workflow('complete_task', { title: 'shelving' });
      check(noMatch.outcome === 'clarification' && noMatch.question && !noMatch.changedItems.length && (await all()).length === noMatchCount, 'No match and partial-word match never create or modify tasks');
      await create({ title: 'Call dentist', parentId: parent.id });
      const taskAmbiguous = await workflow('complete_task', { title: 'Call dentist' });
      check(taskAmbiguous.outcome === 'clarification' && taskAmbiguous.candidates.length === 2 && !taskAmbiguous.changedItems.length, 'Duplicate task titles return identified candidates without guessing');
      const staleTask = await create({ title: 'Pending approval task' });
      const captured = planWorkflow('complete_task', { title: staleTask.title }, await all());
      await create({ title: staleTask.title });
      await rejects(() => workflow('complete_task', { title: staleTask.title }, captured), 'stale');
      check((await all()).find(item => item.id === staleTask.id).status === 'Open', 'New task ambiguity after permission snapshot rejects without effects');
      const capturedPurchase = planWorkflow('add_shopping_item', { title: 'Carrots', listTitle: 'Hardware' }, await all());
      await mutate(db, { kind: 'update', id: second.id, patch: { title: 'Hardware renamed' } });
      await rejects(() => workflow('add_shopping_item', { title: 'Carrots', listTitle: 'Hardware' }, capturedPurchase), 'stale');
      check(!(await all()).some(item => item.title === 'Carrots'), 'Renamed list after approval snapshot rejects instead of creating another list');
      const controller = new AbortController(); controller.abort(); const count = (await all()).length;
      await rejects(() => workflow('add_shopping_item', { title: 'Cancelled item', listTitle: 'Cancelled list' }, null, controller.signal), 'cancelled');
      check((await all()).length === count, 'Aborted caller never creates either workflow record');
      const originalPut = IDBObjectStore.prototype.put; let writes = 0;
      IDBObjectStore.prototype.put = function(...args) { if (this.name === 'items' && ++writes === 2) throw new Error('Injected second-record failure'); return originalPut.apply(this, args); };
      let failed = false;
      try { await workflow('add_shopping_item', { title: 'Failed item', listTitle: 'Failed list' }); } catch (error) { failed = error.message === 'Injected second-record failure'; } finally { IDBObjectStore.prototype.put = originalPut; }
      check(failed && (await all()).length === count && !(await all()).some(item => item.title === 'Failed list'), 'Second-record failure rolls back newly created parent and child');
      return { checks: checks.length, messages: checks };
    } finally { db.close(); }
  });
  assert(report.checks >= 18);
  console.log(`Workflow production checks passed: ${report.checks} real IndexedDB/schema/resolution/atomicity/stale/cancellation assertions.`);
  await browser.close();
})().catch(async error => { console.error(error); await browser?.close(); process.exitCode = 1; });
