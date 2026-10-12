// Local bookkeeping only; host identities never enter a model projection.
/** @typedef {{runId:string,generation:number,intent:string,state:'created'|'preparing'|'running'|'awaiting_approval'|'paused_budget'|'settled',reason:'completed'|'clarification'|'denial'|'cancellation'|'stale'|'failure'|'uncertain'|'review_boundary'|'repeated'|'budget'|null,controller:AbortController,rounds:Map,calls:Map,receipts:Array,events:Array}} Run */
/** @typedef {{roundId:string,runId:string,state:'projecting'|'inferring'|'finalized'|'settling'|'closed'}} Round */
/** @typedef {{callId:string,runId:string,roundId:string,name:string,state:'proposed'|'validated'|'awaiting_approval'|'dispatching'|'settled',outcome:'success'|'no-change'|'clarification'|'denied'|'cancelled'|'stale'|'failed'|'skipped'|'uncertain'|null,certainty:'none'|'uncertain'|'committed'}} Call */
/** @typedef {{childId:string,parentRunId:string,role:'next-action-reviewer',state:'admitted'|'preparing'|'inferring'|'validating'|'settled'}} Child */
/** @typedef {{type:'run-started'|'round-started'|'run-continued'|'run-settled'|'inference-started'|'inference-settled'|'proposal-finalized'|'approval-requested'|'approval-decided'|'dispatch-started'|'effect-committed'|'call-settled'|'budget-paused'|'child-admitted'|'child-settled',runId:string,agentId:string,seq:number,time:number,roundId?:string,callId?:string,outcome?:string}} Event */
export const DEFAULT_POLICY = Object.freeze({ inferences: 24, dispatches: 18, activeMs: 180000, segmentDispatches: 6, children: 1, childMs: 30000, journal: 500 });
const terminal = new Set(['completed', 'clarification', 'denial', 'cancellation', 'stale', 'failure', 'uncertain', 'review_boundary', 'repeated', 'budget']);
const outcomes = new Set(['success', 'no-change', 'clarification', 'denied', 'cancelled', 'stale', 'failed', 'skipped', 'uncertain']);
const error = (message, code = 'host') => { throw Object.assign(new Error(message), { code }); };
const copy = value => JSON.parse(JSON.stringify(value));
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
export function validateEvent(state, event) {
  if (!event || event.runId !== state.runId || event.agentId !== state.runId || event.seq !== state.seq + 1 || !Number.isFinite(event.time) || event.time < state.time) error('Invalid host event identity or order.');
  if (event.callId && !state.callIds.includes(event.callId) && event.type !== 'proposal-finalized') error('Unknown host call.');
  if (event.roundId && !state.roundIds.includes(event.roundId) && event.type !== 'round-started') error('Unknown host round.');
  if (state.state === 'settled' && event.type !== 'effect-committed' && event.type !== 'call-settled' && event.type !== 'child-settled') error('Late host event.');
  return event;
}
export function reduceEvent(state, event) {
  validateEvent(state, event);
  const next = { ...state, seq: event.seq, time: event.time, callIds: [...state.callIds], roundIds: [...state.roundIds], settledCalls: [...state.settledCalls], dispatchedCalls: [...state.dispatchedCalls], committedCalls: [...state.committedCalls], callStates: { ...state.callStates } };
  switch (event.type) {
    case 'run-started': if (next.state !== 'created') error('Run already started.'); next.state = 'preparing'; break;
    case 'round-started': next.roundIds.push(event.roundId); next.state = 'running'; break;
    case 'inference-started': if (next.inferenceActive) error('Inference overlap.'); next.inferenceActive = true; next.inferences++; break;
    case 'inference-settled': if (!next.inferenceActive) error('No active inference.'); next.inferenceActive = false; break;
    case 'proposal-finalized': if (next.inferenceActive) error('A proposal cannot finalize during inference.'); if (next.callIds.includes(event.callId)) error('Duplicate host call.'); next.callIds.push(event.callId); next.callStates[event.callId] = 'validated'; break;
    case 'approval-requested': next.state = 'awaiting_approval'; break;
    case 'approval-decided': next.state = 'running'; break;
    case 'dispatch-started': if (next.callStates[event.callId] !== 'validated' || Object.values(next.callStates).includes('dispatching')) error('Invalid or overlapping dispatch event.'); next.callStates[event.callId] = 'dispatching'; next.dispatchedCalls.push(event.callId); next.dispatches++; next.segmentDispatches++; break;
    case 'call-settled': if (next.settledCalls.includes(event.callId) || !outcomes.has(event.outcome)) error('Call already settled or invalid outcome.'); next.settledCalls.push(event.callId); next.callStates[event.callId] = 'settled'; break;
    case 'budget-paused': next.state = 'paused_budget'; break;
    case 'run-continued': if (next.state !== 'paused_budget') error('Run is not paused.'); next.state = 'running'; next.segmentDispatches = 0; break;
    case 'run-settled': if (!terminal.has(event.outcome)) error('Invalid terminal reason.'); next.state = 'settled'; next.reason = event.outcome; break;
    case 'effect-committed': if (!next.dispatchedCalls.includes(event.callId) || next.committedCalls.includes(event.callId) || typeof event.receipt?.message !== 'string') error('Unproven or duplicate committed effect.'); next.committedCalls.push(event.callId); break;
    case 'child-admitted': next.children++; break;
    case 'child-settled': break;
    default: error('Unknown host event.');
  }
  return next;
}
export function createHost(policy = {}, clock = () => performance.now()) {
  const limits = Object.freeze({ ...DEFAULT_POLICY, ...policy }), journal = [], runs = new Map();
  let identity = 0, activeInference = null, pendingCreation = null, liveWorker = null;
  const id = kind => `${kind}-${++identity}`;
  const now = () => clock();
  function activeMs(run) { return run.activeMs + (run.startedAt === null ? 0 : Math.max(0, now() - run.startedAt)); }
  function emit(run, type, extra = {}) {
    const event = Object.freeze({ type, runId: run.runId, agentId: run.runId, seq: run.reducer.seq + 1, time: Math.max(now(), run.reducer.time), ...extra });
    run.reducer = reduceEvent(run.reducer, event); run.state = run.reducer.state; run.reason = run.reducer.reason;
    journal.push(event); if (journal.length > limits.journal) journal.splice(0, journal.length - limits.journal);
    return event;
  }
  function suspend(run) { if (run.startedAt !== null) { run.activeMs = activeMs(run); run.startedAt = null; } clearTimeout(run.timer); clearTimeout(run.childTimer); }
  function arm(run) {
    if (run.state === 'settled' || run.state === 'paused_budget' || run.waits) return;
    run.startedAt ??= now(); clearTimeout(run.timer);
    const remaining = run.policy.activeMs - activeMs(run);
    run.timer = setTimeout(() => stopRun(run, 'budget'), Math.max(0, remaining)); run.timer?.unref?.();
    if (run.childDeadline && run.child?.state !== 'settled') { clearTimeout(run.childTimer); const childRemaining = run.childDeadline.ms - (activeMs(run) - run.childDeadline.started); run.childTimer = setTimeout(run.childDeadline.expire, Math.max(0, childRemaining)); run.childTimer?.unref?.(); }
  }
  function remaining(run) { return { inferences: run.policy.inferences - run.reducer.inferences, dispatches: run.policy.dispatches - run.reducer.dispatches, activeMs: Math.max(0, run.policy.activeMs - activeMs(run)) }; }
  function check(run, kind) {
    if (run.controller.signal.aborted || run.state === 'settled') error('Run stopped.', 'cancelled');
    const left = remaining(run);
    if (left.activeMs <= 0 || (kind === 'inference' && left.inferences <= 0) || (kind === 'dispatch' && left.dispatches <= 0)) { stopRun(run, 'budget'); error('The total run budget is exhausted. Make a narrower new request.', 'budget'); }
  }
  function startRun(intent, options = {}) {
    if (typeof intent !== 'string' || !intent.trim()) error('A human request is required.');
    const runId = id('run'), controller = new AbortController();
    const run = { runId, generation: 1, intent, transport: options.transport || 'bridge', state: 'created', reason: null, controller, rounds: new Map(), calls: new Map(), receipts: [], signatures: new Set(), results: [], child: null, catalog: null, activeMs: 0, startedAt: null, waits: 0, timer: null, worker: null, inference: null, reportedReceipts: 0, itemMutationSucceeded: false, continuationCount: 0,
      reducer: { runId, seq: 0, time: now(), state: 'created', reason: null, inferenceActive: false, inferences: 0, dispatches: 0, segmentDispatches: 0, children: 0, callIds: [], roundIds: [], settledCalls: [], dispatchedCalls: [], committedCalls: [], callStates: {} } };
    run.policy = Object.freeze({ ...limits, ...options.policy });
    for (const [oldId, old] of runs) if (runs.size >= 50 && old.state === 'settled' && !old.inference && [...old.calls.values()].every(call => !call.dispatched || call.invocationDone)) runs.delete(oldId);
    runs.set(runId, run); emit(run, 'run-started'); arm(run); return run;
  }
  function beginRound(run) { check(run); if (run.inference || run.state === 'paused_budget') error('A round cannot start during inference or a paused segment.'); const round = { runId: run.runId, roundId: id('round'), state: 'projecting' }; run.rounds.set(round.roundId, round); emit(run, 'round-started', { roundId: round.roundId }); run.round = round; return round; }
  async function infer(run, stage, operation) {
    check(run, 'inference'); if (activeInference || run.inference) error('Only one active inference is allowed.', 'busy');
    const started = now(), generation = run.generation; run.inference = stage; if (run.round) run.round.state = 'inferring'; emit(run, 'inference-started', { stage, roundId: run.round?.roundId });
    const pending = Promise.resolve().then(() => operation(run.controller.signal)); activeInference = pending;
    pending.then(() => { if (activeInference === pending) activeInference = null; }, () => { if (activeInference === pending) activeInference = null; });
    const aborted = new Promise((resolve, reject) => { if (run.controller.signal.aborted) reject(Object.assign(new Error('Inference cancelled.'), { code: 'cancelled' })); else run.controller.signal.addEventListener('abort', () => reject(Object.assign(new Error('Inference cancelled.'), { code: 'cancelled' })), { once: true }); });
    try { const result = await Promise.race([pending, aborted]); if (run.controller.signal.aborted || generation !== run.generation) error('Inference cancelled.', 'cancelled'); return result; }
    finally { run.inference = null; if (run.round && run.round.state === 'inferring') run.round.state = run.state === 'settled' ? 'closed' : 'projecting'; if (run.state !== 'settled') emit(run, 'inference-settled', { stage, latencyMs: Math.max(0, now() - started), roundId: run.round?.roundId }); else run.reducer.inferenceActive = false; }
  }
  function admitBatch(run, proposals) {
    check(run); if (!run.round || !Array.isArray(proposals) || proposals.length > 32 || run.round.state === 'finalized') error('Invalid finalized batch.');
    const calls = proposals.map(proposal => { if (!proposal || typeof proposal.name !== 'string' || !proposal.arguments || typeof proposal.arguments !== 'object') error('Invalid finalized proposal.'); return { runId: run.runId, roundId: run.round.roundId, callId: id('call'), name: proposal.name, proposal: freeze(copy(proposal)), state: 'validated', outcome: null, certainty: 'none', receipt: null }; });
    for (const call of calls) { run.calls.set(call.callId, call); emit(run, 'proposal-finalized', { roundId: call.roundId, callId: call.callId, name: call.name, correlation: call.proposal.id ?? null }); }
    run.round.state = 'finalized'; return calls;
  }
  function beginDispatch(run, call) {
    check(run, 'dispatch'); if (run.reducer.segmentDispatches >= run.policy.segmentDispatches) error('Segment dispatch limit.', 'segment');
    if (run.calls.get(call.callId) !== call || call.state !== 'validated') error('Invalid dispatch admission.');
    if ([...run.calls.values()].some(entry => entry.state === 'dispatching')) error('Dispatch overlap.');
    call.state = 'dispatching'; run.rounds.get(call.roundId).state = 'settling'; call.dispatched = true; call.invocationDone = false; emit(run, 'dispatch-started', { callId: call.callId, roundId: call.roundId, name: call.name });
    return Object.freeze({ runId: run.runId, callId: call.callId });
  }
  function lookup(handle) { const run = runs.get(handle?.runId), call = run?.calls.get(handle?.callId); if (!call) error('Unproven dispatch handle.'); return { run, call }; }
  function commitEffect(handle, receipt) {
    const { run, call } = lookup(handle);
    if (!call.dispatched || !['dispatching', 'settled'].includes(call.state) || call.receipt || !receipt || typeof receipt.message !== 'string') error('Invalid or duplicate commit handoff.');
    const saved = freeze(copy(receipt)); call.receipt = saved; call.certainty = 'committed'; run.receipts.push(saved);
    emit(run, 'effect-committed', { callId: call.callId, roundId: call.roundId, name: call.name, receipt: saved }); return saved;
  }
  function settleCall(handle, outcome, detail = null) {
    const { run, call } = lookup(handle); if (call.state === 'settled') return false;
    if (!outcomes.has(outcome)) error('Unknown call outcome.'); call.state = 'settled'; call.outcome = outcome; call.detail = detail;
    if (outcome === 'uncertain' && !call.receipt) call.certainty = 'uncertain';
    emit(run, 'call-settled', { callId: call.callId, roundId: call.roundId, name: call.name, outcome }); if ([...run.calls.values()].filter(entry => entry.roundId === call.roundId).every(entry => entry.state === 'settled')) run.rounds.get(call.roundId).state = 'closed'; return true;
  }
  function settlePending(run, outcome = 'skipped') { for (const call of run.calls.values()) if (call.state !== 'settled') settleCall(call, call.state === 'dispatching' ? 'cancelled' : outcome); }
  function settleRun(run, reason = 'completed') { if (run.state === 'settled') return; settlePending(run); for (const round of run.rounds.values()) round.state = 'closed'; suspend(run); emit(run, 'run-settled', { outcome: reason, activeMs: run.activeMs }); }
  function stopRun(run, reason = 'cancellation') { if (!run || run.state === 'settled') return; run.generation++; run.controller.abort(); releaseWorker(run); if (run.child && run.child.state !== 'settled') settleChild(run, 'cancelled'); settleRun(run, reason); }
  function pauseRun(run) { check(run); settlePending(run); suspend(run); emit(run, 'budget-paused'); }
  function continueRun(run) { check(run); if (Object.values(remaining(run)).some(value => value <= 0)) error('No total budget remains.', 'budget'); emit(run, 'run-continued'); run.continuationCount++; arm(run); return run; }
  function beginWait(run) { if (!run || run.state === 'settled') return () => {}; if (!run.waits++) { suspend(run); emit(run, 'approval-requested'); } let finished = false; return (outcome = 'resolved') => { if (finished) return; finished = true; if (--run.waits === 0 && run.state !== 'settled') { emit(run, 'approval-decided', { outcome }); arm(run); } }; }
  async function ownWorker(run, create) {
    check(run); releaseWorker(run);
    if (pendingCreation || liveWorker) error('A prior owned session is still preparing or running.', 'busy');
    const generation = run.generation;
    const preparing = Promise.resolve().then(() => create(run.controller.signal)); pendingCreation = preparing;
    const created = preparing.then(worker => {
      if (pendingCreation === preparing) pendingCreation = null;
      if (generation !== run.generation || run.controller.signal.aborted || run.state === 'settled') { worker?.destroy(); error('Session creation cancelled.', 'cancelled'); }
      run.worker = worker; liveWorker = run; return worker;
    }, failure => { if (pendingCreation === preparing) pendingCreation = null; throw failure; });
    const aborted = new Promise((resolve, reject) => { if (run.controller.signal.aborted) reject(Object.assign(new Error('Session creation cancelled.'), { code: 'cancelled' })); else run.controller.signal.addEventListener('abort', () => reject(Object.assign(new Error('Session creation cancelled.'), { code: 'cancelled' })), { once: true }); });
    return Promise.race([created, aborted]);
  }
  function releaseWorker(run) { run.worker?.destroy(); run.worker = null; if (liveWorker === run) liveWorker = null; }
  function admitChild(run, request) {
    check(run, 'inference'); if (!request?.explicit || !['inbox', 'project'].includes(request.scope) || run.reducer.children >= run.policy.children || run.child) error('Reviewer admission is unavailable.');
    const child = { childId: id('child'), parentRunId: run.runId, role: 'next-action-reviewer', scope: request.scope, signature: request.signature, state: 'admitted', startedActiveMs: activeMs(run) }; run.child = child; emit(run, 'child-admitted', { childId: child.childId, scope: child.scope }); return child;
  }
  function settleChild(run, outcome) { if (!run.child || run.child.state === 'settled') return false; if (outcome === 'report' && run.child.state !== 'validating') error('A child report must be validated first.'); clearTimeout(run.childTimer); run.childDeadline = null; run.child.state = 'settled'; run.child.outcome = outcome; emit(run, 'child-settled', { childId: run.child.childId, outcome }); return true; }
  function deadline(run, ms, expire) { run.childDeadline = { ms, started: activeMs(run), expire }; arm(run); return () => { clearTimeout(run.childTimer); run.childDeadline = null; }; }
  function finishDispatch(handle) { const { call } = lookup(handle); call.invocationDone = true; }
  return { policy: limits, finishDispatch, deadline, runs, journal, startRun, beginRound, infer, admitBatch, beginDispatch, settleCall, commitEffect, pauseRun, continueRun, stopRun, settleRun, beginWait, activeMs, remaining, ownWorker, releaseWorker, admitChild, settleChild,
    diagnostic: () => ({ policy: limits, events: [...journal], runs: [...runs.values()].map(run => ({ runId: run.runId, intent: run.intent, state: run.state, reason: run.reason, counters: run.reducer, activeMs: activeMs(run), receipts: run.receipts, calls: [...run.calls.values()], child: run.child })) }) };
}
