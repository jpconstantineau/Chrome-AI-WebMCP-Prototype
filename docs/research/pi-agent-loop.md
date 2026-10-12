# Pi agent loop: source study and browser harness adaptation

Research date: **2026-10-12**. Repository studied: [earendil-works/pi](https://github.com/earendil-works/pi), pinned to **`19cb534c3b6e3871458a8fa59e98f0312c50e995`**. All external code links below use that commit. This is research and original design pseudocode; it adds no runtime dependency or implementation change.

The useful idea is a small, explicit scheduler around model requests and tool outcomes, with separate owners for inference, execution, persistence, and presentation. Adopt those boundaries while preserving this prototype's local Prompt API, native page WebMCP, IndexedDB transactions, permission cards, fixed reference catalog, and terminal workflow rules. Pi's parallel default, recovery policy, and tool termination hint cannot be transferred unchanged.

## Scope and version cautions

This snapshot's package names are `@earendil-works/pi-agent-core` and `@earendil-works/pi-coding-agent`, both declaring version `1.1.0`; the source folder is **`packages/agent`**, not `packages/agent-core`. Package manifests target Node and compiled distribution files. These are version observations, not a recommendation to install either package. [Agent manifest](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/agent/package.json#L1-L56), [coding-agent manifest](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/coding-agent/package.json#L1-L57).

Do not combine legacy `badlogic/pi-mono` examples, current `main`, or release-tag documentation into this trace. In particular, older descriptions of sequential tool execution, separate context-level system/tool fields, or `shouldStopAfterTurn` do not describe this pinned loop. The current README documents `finishTurn` as its replacement. [Migration note](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/agent/README.md#L146-L154).

**Source fact** means behavior visible in the cited implementation or test. **Browser recommendation** means our proposed adaptation, not a Pi feature or an implemented change. Pi tests were read as evidence of intended behavior; no Pi test suite, build, package installation, browser mutation, or model run was performed for this study.

## The actual entry path

The current CLI is more layered than “CLI directly constructs an Agent.” Its verified path is:

```text
cli.ts → main(argv)
  → select/open/create SessionManager
  → createAgentSessionServices
  → createAgentSessionFromServices
  → sdk.createAgentSession
      → new Agent({ streamFn, conversion, initial messages, queues, ... })
      → new AgentSession({ agent, SessionManager, settings, resources, ... })
  → createAgentSessionRuntime(factory, session target)
  → interactive / RPC / print interface
      → AgentSession.prompt
      → _startRun → Agent.prompt → runAgentLoop → runLoop
```

The CLI wrapper invokes `main`; `main` creates services and a session through the shared factory and selects its interface. The services wrapper delegates to the SDK, while the runtime stores the factory for later session replacement. [CLI entry](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/coding-agent/src/cli.ts#L1-L6), [main setup](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/coding-agent/src/main.ts#L751-L869), [interface selection](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/coding-agent/src/main.ts#L948-L991), [services delegation](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/coding-agent/src/core/agent-session-services.ts#L214-L232), [runtime factory](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/coding-agent/src/core/agent-session-runtime.ts#L414-L437).

The SDK supplies a model runtime through `streamFn`, restores projected session messages, and constructs both owners. Print mode confirms the interface boundary by subscribing to session events and calling `session.prompt`. The core Agent is stateful but does not itself own JSONL session persistence, CLI parsing, extension discovery, or compaction policy. [SDK construction](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/coding-agent/src/core/sdk.ts#L406-L490), [print interface](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/coding-agent/src/modes/print-mode.ts#L106-L143), [Agent entry methods](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/agent/src/agent.ts#L370-L457).

**Durable boundary:** the inspected CLI → SDK → AgentSession → Agent path uses `runAgentLoop`; it does not substitute a `pi-durable` scheduler. The `AgentTool.replay` field describes a durable recovery policy, but the plain `agent-loop.ts` executor does not consume it. A separate durable integration must be studied on its own call path before attributing journal/replay guarantees to this loop. [AgentTool contract](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/agent/src/types.ts#L465-L499), [plain invocation](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/agent/src/agent.ts#L432-L457).

## Run, turn, message, and batch are different units

| Unit | Source-backed meaning | Browser interpretation |
| --- | --- | --- |
| Run | One `Agent.prompt()` or `continue()` lifecycle, potentially many assistant responses. | One authorized human request, including bounded tool feedback rounds. |
| Turn | One assistant response and its tool results, ending in `turn_end`. | One completed proposal/result round; the JSON route and argument prompts are internal inference stages. |
| Message | System, user, assistant, or tool result with start/end events; assistant content can stream. | Keep proposed content, verified receipts, and visible chat text distinguishable. |
| Tool batch | All calls in one finalized assistant message. | Execute serially and stop further dispatch at the first terminal outcome. |
| Session | Stateful conversation and host-owned storage/context policies. | Local application history plus a replaceable Prompt API session; model session identity is not storage identity. |

The event type definitions explicitly make a turn an assistant response plus calls/results. The wrapper owns active-run state, a transcript, two queues, and an AbortController. Calling `prompt` while active rejects. `waitForIdle` includes awaited subscribers, not merely the last model token. [Event/state definitions](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/agent/src/types.ts#L408-L420), [events](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/agent/src/types.ts#L509-L539), [lifecycle owner](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/agent/src/agent.ts#L507-L611).

### Scheduler trace

`runAgentLoop` copies the existing context, inserts new input and tool-declaration changes, and emits initial lifecycle events. `runLoop` polls steering, prepares a request, obtains a **final** assistant message, then inspects its tool-call blocks. Results re-enter context. Further tools or queued input schedule another response. When normal work finishes, follow-up input gets a chance; otherwise the run ends. Error/aborted assistant responses finalize and exit before tool execution. [Entry and scheduler](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/agent/src/agent-loop.ts#L102-L320).

An ordinary tool round has this ordering:

```text
agent_start                         # once for this low-level run
turn_start
message_start/end(system/user)       # selected input and declarations
prepareRequest
transformContext → convertToLlm → normalizeContext → streamFn
message_start(assistant)
message_update(assistant)*           # presentation only; no tool dispatch
message_end(final assistant)
tool_execution_start(call)
argument preparation → validation → beforeToolCall
execute + tool_execution_update* → afterToolCall
tool_execution_end(call)
message_start/end(toolResult)
finishTurn
turn_end
steering poll / follow-up selection / continuation decision
prepareNextTurn                      # only if another turn was selected
turn_start … or agent_end
```

For parallel batches, preflight runs in source order, execution-end events can arrive in completion order, and result messages are emitted afterward in source order. The upstream test explicitly checks the distinction. For the first turn there is no previous-turn preparation. [Completion-order test](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/agent/test/agent-loop.test.ts#L668-L761), [hook ordering test](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/agent/test/agent-loop.test.ts#L1108-L1216).

## Request preparation and the provider boundary

Four operations serve different purposes:

| Operation | Placement and responsibility |
| --- | --- |
| `prepareNextTurn` | Between selected turns; can replace context/model/reasoning and append prepared messages. Suitable for host-owned compaction or loadout refresh. |
| `prepareRequest` | Immediately before **every** conversational request, after input events. Can install canonical context and select the actual model. Does not perform a second queue drain. |
| `transformContext` | Per-request transformation of AgentMessages; pruning/injection without rewriting the raw transcript. |
| `convertToLlm` | Converts or filters application message kinds at the LLM boundary; resulting transcript is normalized for the stream function. |

The types separate request updates from next-turn updates: request updates cannot append new lifecycle messages. The stream contract returns protocol events and a final error/aborted message for runtime failures, rather than throwing. Both conversion and context transformation have documented safe-fallback contracts. Core's default stream function is installed by the host, not a provider catalog embedded in the loop. [Request and transform contracts](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/agent/src/types.ts#L19-L37), [update types](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/agent/src/types.ts#L160-L244), [fallback stream boundary](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/agent/src/stream-fn.ts#L1-L20).

System instructions and tool declarations now travel in transcript system messages. `declareToolChanges` reconciles executable tools against declared tools; it replaces pending declaration intent with the actual delta. The stream boundary normalizes the converted transcript and resolves credentials for that request. [Declaration and stream boundary](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/agent/src/agent-loop.ts#L323-L409).

**Browser recommendation:** use an application-owned context projector plus a Prompt API adapter. Keep actual WebMCP descriptors and validators authoritative, and supply only the fixed projected model catalog. Never regenerate numbered item choices mid-request; Pi's refresh mechanism is not a reason to weaken our fixed-reference guarantee. Refresh executable discovery before dispatch, and reject stale targets using the original mapping. Our native and JSON paths may normalize to one proposal/result interface while retaining their different feedback protocols.

The JSON bridge's route → arguments/respond stages should remain adapter internals. A UI must not call a route output a completed assistant answer, and a route error must not erase earlier receipts. Neither Pi's cloud model selection, provider credentials, compatibility layer, nor a Node SDK belongs in this static app.

## Streaming is not execution permission

Pi replaces the transient assistant snapshot on each content event and obtains the stream's authoritative `result()` on completion. The final object replaces the partial object before `message_end`. Tool execution begins later. A `toolcall_end` delta is therefore still part of an in-progress assistant response. [Streaming finalization](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/agent/src/agent-loop.ts#L411-L468).

Length-truncated responses are especially significant: the upstream test supplies arguments that still validate after truncation and expects **zero executions**, synthetic error results, and another model response. Schema validity alone does not prove complete intent. [Truncation regression](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/agent/test/agent-loop.test.ts#L456-L526).

**Browser recommendation:** our current `prompt()` path receives complete responses. If streaming is explored later, buffer proposals until complete response finalization, schema validation, identity checks, and approval. Display deltas as provisional text. Never dispatch incrementally parsed JSON or salvage a truncated write. An adapter should expose a finalization outcome even if native browser APIs provide less detailed stop metadata. Missing completion evidence should fail closed for mutation proposals. A display stream and an execution stream should never share a permissive parser.

## Tool pipeline, result channels, and identity

The tool pipeline resolves a name, optionally prepares raw arguments, validates, calls a pre-execution hook, executes, waits for accepted progress updates, and applies a result hook. Unknown tools, invalid arguments, blocked calls, and thrown execution errors become error outcomes. Hooks cannot replace the model's opaque call identity: final tool messages correlate using the original call's ID and name. `runToolCall` exposes the same pipeline for nested calls, but emits no transcript events itself. [Pipeline](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/agent/src/agent-loop.ts#L694-L818), [execution/finalization](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/agent/src/agent-loop.ts#L821-L949).

Pi distinguishes model-visible `content`, UI/log `details`, and programmatic `structuredContent`. A result must signal failure via `isError`, not just error-sounding text. Result overrides replace fields rather than deep-merging; replacing content without structured content discards the old structured value. [Result contract](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/agent/src/types.ts#L76-L103), [channels](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/agent/src/types.ts#L423-L445).

One subtle upstream behavior deserves deliberate avoidance: `beforeToolCall` receives validated argument objects that it can mutate; an explicit test expects the mutated values to execute **without revalidation**. [Mutation regression](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/agent/test/agent-loop.test.ts#L528-L587).

**Browser recommendation:** keep approved argument/effect snapshots immutable, and re-resolve inside the transaction. Permission hooks may approve or deny a concrete plan, not quietly retarget it. Preserve `{ ok, data/error }` as the native execution truth and project bounded text separately for model feedback. A formatting hook failure after a committed write is a reporting failure, not evidence that the write never occurred.

Retain `parseNativeTurn`'s whole-batch duplicate-ID check and `callId`/`callID` compatibility. The plain Pi executor shown above correlates IDs but does not add an equivalent duplicate-ID admission guard. A browser call ID is opaque protocol identity, not an item ID and not an idempotency key. Continue canonical write-signature checks separately. For the JSON bridge, an internal app-generated call ID may identify events and receipts; it must not pretend to be a native Prompt API identifier. [Current parser and native feedback](../../harness.js#L275-L318).

## Scheduling and termination: the differences that matter

The pinned README describes parallel as the default: preflight is sequential, allowed tools execute concurrently, and any per-tool sequential override makes the **whole** batch sequential. A result's `terminate: true` skips the automatic next model request caused by tool results only when every finalized result carries it. Mixed batches continue. [Execution policy](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/agent/README.md#L107-L122).

This does not mean “stop immediately after this tool.” Sibling calls still run; a blocked call need not stop another allowed call. After an all-terminating batch, steering or follow-up input can still schedule another response. A normal `finishTurn` decision can explicitly request continuation. `finishTurn: end` is stronger: it ends after `turn_end` before queue polling/preparation. Unconditionally returning continue can create an endless run. Error and aborted assistant responses remain hard exits regardless of the hook's decision. Upstream tests distinguish all-terminating, mixed blocked, mixed parallel, and result-hook termination cases. [Termination tests](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/agent/test/agent-loop.test.ts#L1732-L2010), [continuation/end tests](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/agent/test/agent-loop.test.ts#L1217-L1403).

**Browser recommendation:** keep serial writes and permissions. Our first denied, cancelled, stale, failed, or clarification result must stop remaining dispatches and return correlated skipped results. A successful review transition also ends dispatch and waits for a fresh human answer. Item mutations establish the separate review-control boundary even when other requested item operations can continue. These are host rules with concrete human-intent consequences; a model or tool's optional termination hint cannot override them. An optional final model explanation after terminal feedback must be explicitly non-executing.

No general loop counter or wall-time budget appears in the inspected plain Pi scheduler. Our six-dispatch cap, repeated-proposal guard, and explicit Continue control are therefore useful existing protections. A future inference-stage budget should bound route/argument/feedback requests too, since one tool dispatch can require several local inference calls. An explicit continuation must carry the completed-write ledger and review boundary, as the current continuation does.

## Steering and follow-up queues

Steering enters at run startup or after a completed assistant/tool turn. Follow-up enters when tool/steering work would naturally finish. The wrapper defaults both queues to one-at-a-time; all mode drains a batch. Preparation may run long: steering queued during `prepareNextTurn` is caught by an extra poll only if the previous poll was empty. Steering arriving during `prepareRequest` waits for the next ordinary poll. Queue input never interrupts a batch halfway through execution. [Queue modes and queue class](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/agent/src/types.ts#L49-L55), [queue implementation/defaults](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/agent/src/agent.ts#L143-L173), [defaults](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/agent/src/agent.ts#L247-L253), [polling regressions](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/agent/test/agent-loop.test.ts#L1458-L1632).

`continue()` with a user/tool-result tail retries that existing tail; with an assistant tail it instead selects queued steering, then queued follow-up. Empty/system-only context rejects. Queue draining is not implicit authorization for another mutation. [Continuation behavior](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/agent/README.md#L169-L182).

**Browser recommendation:** retain the currently disabled send control during a request until a real queue UX is justified. For future steering, show queued user text and scope it to a fresh request/catalog boundary, not an old readable-choice snapshot. Do not attach “complete the review step” to a finishing capture batch. Stop should settle or invalidate the active work before starting queued work. Queue previews, editing/removal, and whether messages survive cancellation are product decisions, not incidental implementation details.

## Cancellation, retries, and uncertain effects

Pi's Agent aborts its run controller; tools and hooks receive the signal. Settled progress callbacks are ignored, and listeners are awaited before the wrapper becomes idle. Abort remains cooperative: an already committed external effect cannot be undone by the signal. Upstream tests verify late tool updates are ignored and awaited subscribers delay settlement. Unexpected exceptions crossing the low-level loop are a different path from protocol error messages: the Agent wrapper synthesizes assistant failure, turn-end and agent-end events, then clears owned run state. Direct low-level callers must honor the stream/conversion contracts rather than assume that wrapper recovery. [Cancellation/update tests](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/agent/test/agent.test.ts#L361-L612), [wrapper failure path](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/agent/src/agent.ts#L523-L556).

AgentSession owns another lifecycle around low-level runs. Its post-run handler can schedule retry, compaction recovery, queued work, or pre-settlement continuation; session abort cancels retry, compaction and branch summarization as well as the Agent. `_prepareRetry` persistently omits the failed assistant attempt from projected context and waits with abortable backoff. Its next run continues the retained input/tool-result tail. That is inference retry, not an unconditional replay of prior tool writes. [Session scheduling/retry](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/coding-agent/src/core/agent-session.ts#L1832-L1975), [abort](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/coding-agent/src/core/agent-session.ts#L2456-L2468), [retry preparation](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/coding-agent/src/core/agent-session.ts#L3783-L3827).

This still does not prove exactly-once tool effects. A repeated model proposal, lost response, process failure, or tool that disregards cancellation needs separate host accounting. The low-level executor does not provide a committed-effect journal simply because a tool declares `replay`.

**Browser recommendation:** preserve the current narrow automatic native → JSON fallback: only a fresh first inference failure with zero dispatch, no continuation and no cancellation. Once any call is dispatched, record it before awaiting the bridge. Distinguish `committed`, `failed before commit`, and `outcome unknown`. A lost WebMCP reply can coexist with a successful IndexedDB commit. Never reissue a write automatically after that boundary; inspect stored state and require a new explicit user request if another write attempt is needed. A formatting/model error after successful tool execution must retain and display the verified receipt. [Current dispatch/fallback logic](../../app.js#L369-L500), [stop behavior](../../app.js#L326).

## Persistence and compaction ownership

SessionManager stores append-only JSONL entries linked by `id`/`parentId`, with a current leaf. Model context is reconstructed from the active branch. Message completion is persisted by AgentSession; finalized assistant processing finishes before tool preflight. Compaction is a projection boundary, not raw-history deletion. [SessionManager ownership](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/coding-agent/src/core/session-manager.ts#L976-L1010), [append operation](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/coding-agent/src/core/session-manager.ts#L1191-L1213), [session message persistence](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/coding-agent/src/core/agent-session.ts#L1146-L1197).

A compaction entry includes a retained-entry boundary, summary, and current system/tool checkpoint. Rebuilding uses that checkpoint, summary and retained tail; raw entries remain available. Between-tool-turn threshold checks run before the next assistant response. Post-run context overflow/length recovery has a separate one-attempt compact-and-retry route. [Session format](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/coding-agent/docs/session-format.md#L123-L135), [context reconstruction](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/coding-agent/docs/session-format.md#L226-L248), [compaction lifecycle](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/coding-agent/docs/compaction.md#L25-L98).

`prepareCompaction` uses projected entries and records the previous summary, retained boundary and any split-turn prefix. Cut selection respects valid boundaries, including the preceding assistant call when retaining large tool results. Summary serialization omits thinking and truncates tool-result text to 2,000 characters with a marker. Application messages are converted first; custom/summarized messages become appropriate model-facing messages. [Preparation/cut selection](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/coding-agent/src/core/compaction/compaction.ts#L446-L500), [projection preparation](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/coding-agent/src/core/compaction/compaction.ts#L872-L935), [summary serialization](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/coding-agent/src/core/compaction/utils.ts#L93-L154), [message conversion](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/coding-agent/src/core/messages.ts#L147-L195).

**Browser recommendation:** model context, visible transcript, permission state, and transaction receipts need separate storage roles. Currently `conversationForModel` filters whole failed turns and limits historical text, while UI/history preserve messages. Activity cards retain full outcomes only in the running page. A later reporting failure can hide a partially successful turn from subsequent model context; current database state and verified receipts must then restore the facts. [History projection](../../harness.js#L262-L273), [activity/history code](../../app.js#L244-L322), [documented bounded context](../harness.md).

A small future IndexedDB event/receipt ledger would be more useful than copying Pi's JSONL branch tree. Persist known commit outcomes under request/call identity; separately record a bounded model projection. If summaries are introduced, preserve user decisions, unresolved clarification, committed effects, and explicit workflow step state. Keep permissions in authoritative UI state: a summary must not manufacture a grant. Summarize at safe boundaries with no unresolved call/results. Do not use Pi's token defaults as Chrome model limits; local Prompt API quotas and model capacity need their own measurement.

## Comparison with this prototype

Read-only baseline: [INTENT.md](../../INTENT.md), [DESIGN.md](../../DESIGN.md), [app.js](../../app.js), [harness.js](../../harness.js), [harness documentation](../harness.md).

| Area | Existing strength / remaining risk | Decision |
| --- | --- | --- |
| Host ownership | Execution stays in native WebMCP callbacks with approvals and transaction checks. `chat` also handles inference, terminal logic, history and UI. | Adopt explicit loop/context/UI boundaries when implementation is requested; keep shared execution authority. |
| Catalog | Fixed labels prevent old proposals retargeting new records. Schemas may grow with all stored items. | Adapt Pi request preparation using bounded task context; refresh capabilities without changing old label mappings. |
| Batch execution | Sequential dispatch fits singleton permission cards and `state.toolBusy`. | Avoid Pi parallel default for writes/navigation/approval. Parallel reads require proven independence and a separate safe UI model. |
| Protocol identity | Native parser accepts both ID spellings, rejects duplicates and supports the observed solitary empty ID. | Retain this stronger admission guard; distinguish call identity from write signature. |
| Replay | Canonical signatures, six-tool cap and persisted committed item data prevent common repeats. An unknown dispatched outcome has no permanent request receipt. | Preserve no-auto-replay; consider an IndexedDB receipt ledger for diagnosis/recovery. |
| Termination | Denial, ambiguity and review progress boundaries stop remaining actions. | Avoid all-results termination semantics; use explicit host reasons. |
| Reporting | Verified workflow/primitive receipts survive later inference failure. History saves are asynchronous, and activities are transient. | Adopt completion barriers where persistence affects recovery; keep factual receipts authoritative. |
| Context | Projected IDs/results, fences and bounded history limit exposure and context pressure. Whole failed-turn omission may discard successful effects from future model memory. | Adapt raw-history vs context projection separation; supply current facts plus retained receipts. |
| Cancellation | AbortController and generation checks prevent stale UI/permission work; committed data remains saved. | Preserve both signal and generation guards; distinguish cancellation from rollback. |
| Specialists | Intent anticipates orchestrator/detail roles; no specialist runtime exists here. | Use bounded task/context delegation only after the single loop is defined. No import of CLI process spawning or provider runtime. |

These are architectural observations from source reading, not newly verified runtime failures. The current regression evidence remains documented in `docs/harness.md`; this research does not claim those tests were rerun.

## Original browser-only loop sketch

This is a design sketch, **not drop-in code**. `adapter` means an in-page Prompt API wrapper for native calls or the existing staged JSON bridge. `executeAuthorizedWebMCP` means the current page-owned validator/approval/transaction pipeline. Neither specialists nor inference adapters receive direct IndexedDB write access.

```javascript
async function runBrowserRequest(humanText, services) {
  const run = services.beginRequest(humanText); // id, generation, signal, ledger
  let adapter;
  let feedback = null;
  let terminalReason = null;

  try {
    await services.emitAndSave({ type: 'request-start', runId: run.id });
    const catalog = await services.snapshotModelCatalog(run);
    adapter = await services.prepareLocalModel(run, catalog);
    while (!terminalReason) {
      services.assertCurrent(run);
      services.checkInferenceBudget(run); // count route/arguments/feedback too
      const context = await services.projectContext(run, catalog, feedback);
      const final = await adapter.inferFinal(context, run.signal, delta => {
        services.renderProvisional(run, delta); // never dispatch from a delta
      });
      services.assertCurrent(run);
      const proposal = services.validateFinalProposal(final, catalog);
      await services.emitAndSave({ type: 'proposal-final', proposal });

      if (!proposal.calls.length) {
        services.presentVerifiedReply(run, proposal.text);
        break;
      }

      const replies = [];
      for (const call of proposal.calls) { // sequential shared permission owner
        if (terminalReason) {
          replies.push(services.skippedReply(call, terminalReason));
          continue;
        }
        services.assertCurrent(run);
        const decision = services.checkHostBoundaries(run, call, catalog);
        if (!decision.allowed) {
          replies.push(services.skippedReply(call, decision.reason));
          terminalReason = decision.reason;
          continue;
        }

        const resolved = await services.resolveCurrentTarget(call, catalog);
        const ticket = await services.recordDispatchIntent(run, call, resolved);
        // After this point, a lost reply is an unknown outcome, never a retry.
        const outcome = await services.executeAuthorizedWebMCP(
          resolved, run.signal
        );
        await services.recordOutcome(ticket, outcome);
        services.recordCommittedReceipt(run, outcome);
        replies.push(adapter.correlateResult(call, services.projectResult(outcome)));
        terminalReason = services.terminalReason(run, call, outcome);
      }

      feedback = replies;
      await services.finishRound(run, replies, terminalReason);
      if (terminalReason) {
        // Optional explanation may use correlated feedback, with execution disabled.
        services.presentTerminalReceipt(run, terminalReason);
        break;
      }
    }
  } catch (error) {
    // The real app has a narrow pre-dispatch native→JSON compatibility fallback.
    // It is an adapter transition, not permission to replay a dispatched write.
    await services.markUnsettledDispatchesUnknown(run);
    await services.recordRequestFailure(run, error);
    services.presentKnownReceiptsAndFailure(run, error);
  } finally {
    await services.settleAndDestroyLocalSession(run, adapter);
    await services.emitAndSave({ type: 'request-settled', runId: run.id });
    services.releaseRequestWhenCurrent(run);
  }
}
```

Suggested normalized event envelope:

```javascript
{
  sequence, timestamp, requestId, roundId,
  callId, parentCallId, specialistId, // optional; identity is separate from item ID
  type,                             // finite application-defined event names
  payload,                          // bounded data; full receipt stored separately
  outcome                           // proposed/denied/skipped/committed/failed/unknown
}
```

An event reducer could drive one compact activity timeline: inference → proposed → awaiting permission → executing → succeeded/denied/failed/unknown. It must not infer success from text, a tool name, `message_end`, or cancellation. Persisted commit facts must survive a later failed inference. `request-settled` should mean the owned session, pending approvals, storage bookkeeping and any accepted event work are finished. A closed loop still needs generation checks so late callbacks cannot revive it.

## Specialists: preserve one execution authority

The traced generic core exposes tools and nested tool execution, not a built-in specialist orchestration protocol. The coding session routes nested calls back through shared hooks with a parent-call identity. That is a useful boundary to preserve, but it does not by itself create isolated model contexts, scheduling limits or agent delegation. [Nested execution boundary](https://github.com/earendil-works/pi/blob/19cb534c3b6e3871458a8fa59e98f0312c50e995/packages/coding-agent/src/core/agent-session.ts#L726-L763).

**Browser recommendation:** an orchestrator may eventually request a narrowly scoped local specialist, for example “summarize Waiting For items” or “ask the current review-step question.” The specialist should return a bounded proposal/evidence summary to the orchestrator. Shared WebMCP authority validates and approves every actual write. A specialist cannot grant itself new tools, expand a chat permission, advance review progress, or resume uncertain writes. All model contexts stay local; delegation must also count against the request's inference/dispatch budgets.

Sequential specialists are the appropriate first experiment because this app shares one mutable workspace, navigation state, dirty draft, review record and permission surface. If read-only specialist inference is later run concurrently, results need source snapshot/revision identity and may be stale by the time they are used. Parent cancellation must cancel all owned model sessions. Parent results must distinguish observations, proposals, and committed receipts. Child task IDs identify orchestration, not native tool protocol IDs.

## Adoption order and evidence to collect later

1. Define request/round/call/receipt identities and explicit terminal reasons; preserve all existing callback checks.
2. Normalize native and JSON adapter outcomes while retaining their native correlation and staged constraints.
3. Add completion/event boundaries to make UI and persistence ownership reviewable; no server, package import or build step is required.
4. Investigate a small IndexedDB receipt journal for unknown dispatched outcomes and partial-success context recovery.
5. Measure local context/inference budgets before adding compaction or specialists.
6. Experiment with a single read-only specialist and bounded return format; only expand after cancellation, stale snapshots and shared approvals have concrete evidence.

Useful future verification scenarios: a valid-looking truncated write executes nothing; duplicate call IDs reject before any dispatch; denial in a mixed batch skips siblings; a write commits then inference fails and its receipt remains; Stop after commit preserves truth without late permission cards; stale target changes during approval reject atomically; a capped continuation retains the write ledger and review boundary; a specialist cannot bypass shared permissions; cancelled child inference cannot update a new parent request. These are proposals for future implementation validation, not tests added or run in this research task.

## Companion research boundaries

The core trace is complete for the inspected entry path. Separate source chapters should cover Pi AI's provider/model/event normalization and transport retries; `pi-durable`'s actual journal/recovery integration; native extension/skill discovery and security; specialist example implementations; and current Chrome Prompt API context/session capabilities. Those mechanisms have different owners and should not be inferred from the small loop. This repository already has [Prompt API](chrome-prompt-api.md), [session management](chrome-session-management.md), and [compacting](chrome-session-compacting.md) research that can supply the browser-side companion context.
