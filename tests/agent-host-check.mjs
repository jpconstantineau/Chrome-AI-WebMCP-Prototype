import assert from 'node:assert/strict';
import { createHost, reduceEvent, DEFAULT_POLICY } from '../agent-host.js';
let time = 0;
const host = createHost({}, () => time), run = host.startRun('Keep exact human intent');
assert.deepEqual(host.policy, DEFAULT_POLICY);
const round = host.beginRound(run);
assert.throws(() => reduceEvent(run.reducer, { type: 'dispatch-started', runId: 'forged', agentId: run.runId, seq: 3, time: 0 }));
assert.throws(() => reduceEvent(run.reducer, { type: 'call-settled', runId: run.runId, agentId: run.runId, seq: 1, time: 0, callId: 'unknown', outcome: 'success' }));
const [call, sibling] = host.admitBatch(run, [{ name: 'create_item', arguments: { title: 'Exact' } }, { name: 'list_items', arguments: {} }]);
assert.equal(round.state, 'finalized');
assert.throws(() => host.admitBatch(run, []));
const handle = host.beginDispatch(run, call);
assert.throws(() => host.beginDispatch(run, sibling));
time = 1200; const resume = host.beginWait(run); time = 90000;
assert.equal(host.activeMs(run), 1200); resume(); time += 800;
host.stopRun(run);
assert.equal(run.reason, 'cancellation'); assert.equal(host.activeMs(run), 2000);
const receipt = { message: 'Saved Exact', data: { title: 'Exact' } };
host.commitEffect(handle, receipt); receipt.data.title = 'Changed';
assert.equal(run.receipts[0].data.title, 'Exact'); assert.equal(run.reason, 'cancellation'); assert.equal(call.certainty, 'committed');
assert.throws(() => host.commitEffect(handle, receipt));
assert.throws(() => host.commitEffect(sibling, receipt));
assert.equal(host.settleCall(handle, 'success'), false); host.finishDispatch(handle);
assert.throws(() => host.beginRound(run));
const capped = host.startRun('Continue the same exact intent');
for (let segment = 0; segment < 3; segment++) {
  for (let index = 0; index < 6; index++) { host.beginRound(capped); const [call] = host.admitBatch(capped, [{ name: 'list_items', arguments: { search: `${segment}-${index}` } }]); const dispatch = host.beginDispatch(capped, call); host.settleCall(dispatch, 'success'); host.finishDispatch(dispatch); }
  if (segment < 2) { capped.signatures.add('keep'); host.pauseRun(capped); host.continueRun(capped); assert(capped.signatures.has('keep')); }
}
assert.equal(capped.reducer.dispatches, 18); assert.equal(capped.continuationCount, 2);
host.beginRound(capped); const [nineteenth] = host.admitBatch(capped, [{ name: 'list_items', arguments: {} }]);
assert.throws(() => host.beginDispatch(capped, nineteenth), /budget/); assert.equal(capped.reason, 'budget');
const inferenceRun = host.startRun('Bound stages'); host.beginRound(inferenceRun);
for (let index = 0; index < 24; index++) await host.infer(inferenceRun, index % 2 ? 'arguments' : 'route', async () => { time++; if (index === 3) throw new Error('Count failed stages too'); return index; }).catch(error => assert.match(error.message, /failed stages/));
assert.equal(inferenceRun.reducer.inferences, 24);
await assert.rejects(host.infer(inferenceRun, 'respond', async () => {}), /budget/);
assert.equal(inferenceRun.reason, 'budget');
const pending = host.startRun('Cancelled slow work'); host.beginRound(pending); let resolveInference;
const promise = host.infer(pending, 'native-proposal', () => new Promise(resolve => { resolveInference = resolve; })); await Promise.resolve(); host.stopRun(pending);
await assert.rejects(promise, /cancelled/);
const fresh = host.startRun('Fresh request'); host.beginRound(fresh);
await assert.rejects(host.infer(fresh, 'route', async () => 'new'), /one active inference/);
resolveInference('late'); await Promise.resolve(); await Promise.resolve();
assert.equal(await host.infer(fresh, 'route', async () => 'new'), 'new'); host.stopRun(fresh);
const late = host.startRun('Slow session'); let resolveCreation, destroys = 0;
const creating = host.ownWorker(late, () => new Promise(resolve => { resolveCreation = resolve; })); await Promise.resolve(); host.stopRun(late);
await assert.rejects(creating, /cancelled/); resolveCreation({ destroy() { destroys++; } }); await Promise.resolve(); await Promise.resolve(); assert.equal(destroys, 1);
const childRun = host.startRun('Ask reviewer explicitly');
assert.throws(() => host.admitChild(childRun, { scope: 'inbox', signature: 'x' }));
const child = host.admitChild(childRun, { explicit: true, scope: 'inbox', signature: 'x' }); assert.equal(child.parentRunId, childRun.runId);
assert.throws(() => host.admitChild(childRun, { explicit: true, scope: 'inbox', signature: 'x' })); host.stopRun(childRun); assert.equal(child.outcome, 'cancelled');
for (let index = 0; index < 100; index++) { const brief = host.startRun('Journal bound'); host.settleRun(brief); }
assert(host.journal.length <= 500); assert(host.runs.size <= 50);
console.log('Agent host checks passed: identity/order, serial lifecycle, all shared totals, wait exclusion, original-run Continue, immutable post-Stop receipts, global inference/session ownership, child admission, late cancellation, and bounded diagnostics.');
