# Chrome Prompt API session compaction: research and prototype recommendations

Research date: **2026-10-12**. This is documentation and proposed future work only; no implementation change or live-browser claim is implied.

Primary reading: [Session compacting with the Prompt API](https://developer.chrome.com/docs/ai/session-compacting), published and last updated June 23, 2026. Repository observations refer to local commit **`a76e0b05a04835ffdc5e0628bcb6af020eff78fd`**, with `AGENTS.md`, `INTENT.md`, and `DESIGN.md` read first. Upstream source pins checked on the research date: GoogleChromeLabs/web-ai-demos **`d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c`** and webmachinelearning/prompt-api **`dfcddb444a2763a823e1a7a8bb0af7c54009536a`**. Rendered documentation/specification pages are dated reads and may later change.

## Recommendation and fit

First add context diagnostics and exact-input budget checks to the existing turn architecture. Consider optional, bounded summaries of older completed conversational turns only after measuring whether the six-message transcript limit harms continuity. Do not convert this tool harness to a single indefinitely growing session simply to reproduce the chat demo.

Keep all work in static browser JavaScript and IndexedDB, with no backend, remote model service, new dependency, or build step. A compaction feature should be an enhancement: inability to create a summarizer must not make the already-working list manager unusable. Existing startup requirements for Prompt API and WebMCP remain a separate product decision.

### Current repository evidence

| Evidence at the pinned local commit | Consequence for future compaction |
| --- | --- |
| [`app.js`](../../app.js), `createSession()` around line 196, creates a session with the original system policy; `chat()` around line 369 creates a fresh native session per human request. | There is generally no long-lived native conversation to shrink. The possible improvement is the selected historical context, or unusually large multi-tool turns. |
| `chat()` clones the prepared JSON bridge session where supported and destroys the per-turn session in `finally`; without cloning, `modelTurns` stops use after ten turns. | Measure the active clone, not the usually empty base session. A no-clone implementation is the most direct candidate for controlled renewal. Ten turns is an application bound, not Chrome's capacity. |
| [`harness.js`](../../harness.js), `conversationForModel()` around line 262, filters whole failed/denied historical turns and supplies at most six messages, each cut at 1,000 characters. | Stored history and model history already differ. Compaction should not resurrect a rejected proposal as a positive demonstration. A trailing six-message slice can still split a conversational turn; preserve whole completed groups in any new selection logic. |
| `promptContext()` and `bridgeContext()` keep the current human request separate from historical/context data and preserve request-first, verified-context-next, continuation-last order after results. | A summary must remain historical data. It cannot become the newest command, erase request provenance, or claim authority to execute an earlier imperative. |
| [`storage.js`](../../storage.js), `openDatabase()`, has `history`, `preferences`, `items`, and `reviews` stores. `appendMessage()` in `app.js` stores text messages with role and time. | Current chat storage is not a durable typed tool transcript or complete execution ledger. It cannot reconstruct pending native tool calls safely. |
| `modelCatalog()` fixes readable item references for a turn, projects storage IDs out of model-facing schemas/data, and resolves against current records before execution. | Any saved summary containing old readable choices needs current projection; an old label cannot silently bind to a different record. |
| `stop()` reports known committed receipts, increases `generation`, aborts model/tool work, and cancels approval. Native feedback preserves opaque IDs through `nativeResultPart()`. | A compaction operation needs the same cancellation/staleness discipline and must not replace the active session after Stop, reset, or fallback. |
| The native fallback only retries a first inference before dispatch; callbacks perform permission/stale checks and storage performs atomic writes. | Context failure must never broaden the retry boundary to a dispatched operation. Compaction changes model memory, not the status of a database transaction. |

These observations are supported by the local files and [the existing harness document](../harness.md). They describe application behavior, not a guarantee from Chrome.

## Official mechanics, separated from recommendations

### What the compaction guide actually prescribes

Chrome's guide describes application-managed compaction: monitor `contextUsage/contextWindow`, retain original history, summarize messages, destroy the session, then create a replacement using summaries as `initialPrompts`. This is not a `session.compact()` API.

For runtime overflow, Chrome removes oldest prompt/response pairs. `contextoverflow` fires when eviction begins. Initial prompts remain protected during runtime eviction; oversized initial prompts reject creation. If the incoming prompt still cannot fit after removing evictable history, prompting rejects with `QuotaExceededError` without removing anything. The guide's recovery example recreates from `fullHistory`; critical message portions such as code can be excluded from summarization. [Chrome compaction guide](https://developer.chrome.com/docs/ai/session-compacting#listen_for_context_overflow), [compaction lifecycle](https://developer.chrome.com/docs/ai/session-compacting#compact_the_session).

**Application inference:** the guide's suggestion to use the event as an early warning cannot guarantee interception before loss. Do proactive checks before submitting a prompt; an event handler should record pressure and request maintenance at the next safe boundary. Destroying a session inside that callback risks interfering with the operation that triggered it.

### Demo algorithm and details worth examining

The official demo detects each message's language, accepts detections at confidence 0.7, otherwise uses `navigator.language`. It chooses Markdown/plain text from content and caches summarizers by format/language. Its settings are `tldr`, `short`, matching input/context/output languages, `preference: 'speed'`, retrying availability with `'auto'` if unavailable. Only character-shorter summaries replace text; fenced code is retained. It gathers confident languages for replacement session options, reattaches overflow handling, and logs before/after usage plus full/compacted JSON. Visual warning colors use 65% and 85%.

The pinned source gates downloads on user activation and reuses matching creation options. Its recovery uses `history`, whereas the article uses `fullHistory`; controls are re-enabled even after failed recovery. It lacks a tool ledger or Stop lifecycle. [Pinned official demo source](https://github.com/GoogleChromeLabs/web-ai-demos/blob/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/prompt-api-session-compacting/script.js), [running demo](https://chrome.dev/web-ai-demos/prompt-api-session-compacting/).

**Application inference:** its percentages are presentation choices, its character check is not a token proof, and the fenced-code regex is not a general structured-data preservation strategy. A successful demonstration of text continuity is not evidence that approvals, exact titles, exclusions, or tool identities survive summarization.

### Accounting and specification qualifications

The current draft exposes `contextUsage`, `contextWindow`, and `measureContextUsage(input, options)`. Measurement includes implementation-defined model encodings/wrappers; units are implementation-defined, not universally guaranteed tokenizer counts. Completed generated responses, including tool calls, update usage. Constraint-related input can affect measurement. The inspected draft's prefilling algorithm rejects when current usage plus measured input exceeds capacity, without spelling out Chrome's eviction procedure, despite exposing the overflow handler. This also appears in the [pinned draft source](https://github.com/webmachinelearning/prompt-api/blob/dfcddb444a2763a823e1a7a8bb0af7c54009536a/index.bs). Treat that as a documentation/specification mismatch; Chrome-specific overflow assertions above come from Chrome's implementation guide. [Prompt API draft, usage](https://webmachinelearning.github.io/prompt-api/#usage), [prefilling](https://webmachinelearning.github.io/prompt-api/#prefill), [measurement](https://webmachinelearning.github.io/prompt-api/#dom-languagemodel-measurecontextusage).

**Proposed accounting discipline:**

Measurement options express the intended request, but the pinned Chromium implementation does not pass JSON-schema guidance through its measurement path. Therefore the following measurement is useful input evidence, not proof that all hidden constraint overhead was counted. Keep a conservative reserve and consult [the structured-output measurement comparison](chrome-structured-output.md) before treating a fit estimate as exact.

- Measure the exact projected message array for the next routing/arguments/respond stage, with the same `responseConstraint` and `omitResponseConstraintInput` used for inference. Character limits, JSON length, and displayed text cannot replace this check.
- Track actual usage after creation and each completed inference. For streaming, a progress display can refresh during chunks, but final settled values are the useful comparison point.
- Reserve explicit headroom for generated content and later tool responses. `needed <= window - usage` only establishes input fit at that instant; it is not a guarantee of completing a six-tool turn.
- Keep quota accounting per session; a summary produced by Summarizer does not change the old Prompt session. Savings appear only when a replacement or future prompt receives less context.
- Record both before/after window sizes. If replacement options or the model change, token reductions and percentage reductions alone can mislead. Reject a replacement that leaves less usable room for the intended next request.
- Log error `name`, optional numeric `requested`, `quota`, and `contextWindow` when exposed; do not assume identical exception fields across API versions. Browser context quota is distinct from IndexedDB storage quota.
- Model schemas, system policy, current state projection, transcript, tool feedback, and response constraints all compete for room. Compaction of old prose cannot fix a single intrinsically oversized required request or preserved payload.

### Native tools have a different preservation contract

The Prompt API explainer's open loop returns proposals to the application for execution and feedback. Opaque `callId` values must be returned unchanged with the corresponding success/error; tool feedback immediately follows the generated call. Replaying assistant tool calls as history requires `tool-call` in `expectedInputs`, alongside `tool-response`. Assistant calls and user responses use their typed constructor instances. The explainer also states that aborting a prompting/appending operation does not restore overflowed messages. Automatic closed-loop execution is future work in that explainer. [Prompt API explainer, tool use](https://github.com/webmachinelearning/prompt-api/blob/dfcddb444a2763a823e1a7a8bb0af7c54009536a/README.md#tool-use), [aborting](https://github.com/webmachinelearning/prompt-api/blob/dfcddb444a2763a823e1a7a8bb0af7c54009536a/README.md#aborting).

**Application inference:** the browser's prompt/response eviction unit should not be assumed to coincide with a complete application tool round. A user request can contain multiple native calls, multiple approvals, and several model continuations. Preserve the application's round atomically; the browser's eviction mechanism does not know this ledger.

## Supporting APIs and support limits

### Summarizer

Chrome documents Summarizer from stable Chrome 138. `availability()` and `create()` should be checked for the actual language/settings combination. Creation may require user activation and a separate download with progress monitoring. Settings are immutable; `type`, `format`, `length`, and `preference` influence output, with speed favoring latency and capability favoring richer extraction. Supported documented languages are English, Japanese, Spanish, German, and French. `summarize(text, {context})` provides per-input background. APIs are exposed to the top-level window and same-origin frames by default; cross-origin frames need `allow="summarizer"`; workers are unsupported. [Chrome Summarizer guide](https://developer.chrome.com/docs/ai/summarizer-api).

The base API's milestone does not establish that every option is stable. The pinned source separately gates performance `preference`; its speed path has additional language, context, and input restrictions. See [the Summarizer chapter](chrome-summarizer.md) for exact source/draft boundaries before adopting those options or per-call context in a compaction flow.

The writing-assistance draft defines `measureInputUsage(input, {context, signal})`, `inputQuota`, cancellable summarization and destroyable instances. Measured input includes shared/per-call context and formatting options. Oversized summarizer input fails independently of Prompt session capacity. [Writing Assistance draft, Summarizer](https://webmachinelearning.github.io/writing-assistance-apis/#summarizer), [input measurement](https://webmachinelearning.github.io/writing-assistance-apis/#dom-summarizer-measureinputusage).

**Proposed adaptation:** preflight each eligible prose segment against the summarizer's quota when supported. Split oversized prose at meaningful boundaries, retaining source ordering; never split an exact title, approval decision, call/result structure, or literal artifact merely to make it fit. If the safe preserved material is too large, fall back to selected completed history instead of repeatedly asking the summarizer to solve an impossible budget.

### Language detection

Chrome's detector returns ranked language/confidence results. Short phrases and single words are unreliable. It is desktop-only, has its own availability/download/create flow, and creation may need user activation. Default frame policy is same-origin, delegated with `allow="language-detector"`; workers are unsupported. [Chrome Language Detector guide](https://developer.chrome.com/docs/ai/language-detection).

**Proposed adaptation:** this prototype currently declares English. Begin with English-only compaction and retain unrecognized text verbatim; language detection can become an optional multilingual extension. Do not infer support from the user's locale. Normalize and test a fallback locale deliberately instead of feeding an arbitrary regional or unsupported tag to all APIs.

If multilingual support is added, include the system policy's language, actual summary languages, supported fallback language, and intended next request/output language in appropriate session options. A set containing only confidently detected messages may omit fallback-language content. The demo configures context language to each message's language but sends an English context instruction; the application should declare the actual context instruction language or supply a matching localized context. Cache keys should include every setting that changes semantics, not merely format/language if other options vary. These are proposed corrections based on reading the example, not additional Chrome requirements.

### Prompt API/device constraints

Chrome's August 26, 2026 Prompt API page lists web support at Chrome 148 and extension support at 138. Web sampling parameters require an origin trial. Documented foundation-model requirements include supported desktop OS, 22 GB free profile-volume storage, GPU with more than 4 GB VRAM or CPU with at least 16 GB RAM/four cores, and unmetered initial download. Android/iOS and non-Plus ChromeOS are unsupported; downloaded models can later be removed under storage pressure. Prompt operations support cancellation; `destroy()` makes the session unusable and aborts ongoing execution. The API is unavailable in workers. [Chrome Prompt API](https://developer.chrome.com/docs/ai/prompt-api).

**Application inference:** installation as a PWA, a modern browser number, or offline shell availability does not prove all three AI surfaces and native tool modalities are usable. Feature-detect APIs/methods and perform matching option-specific availability checks; retain current native/bridge distinctions. Do not present the typed tool proposal experiment as generally supported just because plain-text Prompt API ships. None of this research changed flags, installed models, ran the demo, or verified the user's current device.

## Proposed safe compaction boundary

Compaction is allowed only when the model and application agree that the preceding request is settled. Use an explicit state transition such as `idle -> preparing-summary -> validating-replacement -> idle`; queue a request for maintenance while inference/approval/tool execution is active.

An idle boundary means all of the following:

1. No model prompt or stream is running, including bridge route/arguments/respond stages.
2. No proposed native call awaits its matching success/error, including skipped siblings of a denied batch.
3. No permission card or destructive-action confirmation is awaiting input.
4. No storage transaction or external WebMCP callback is in flight.
5. The turn is closed, or an explicit continuation checkpoint exists with verified outcomes and no unresolved calls. Prefer closed turns for the first implementation.
6. The full transcript and all receipts needed for recovery have finished saving; fire-and-forget UI persistence is not a sufficient durability boundary.

Do not compact automatically after receiving a proposal and before returning its result. If budget is insufficient for a pending result, first retain the actual receipt and classify the turn safely; do not manufacture a shorter success or dispatch again. A future resume mechanism needs its own explicit checkpoint design and is outside simple prose compaction.

### Data that must remain exact

| Material | Proposed treatment |
| --- | --- |
| Original system policy and tool execution rules | Reinsert from trusted application code verbatim; do not summarize it with chat data. |
| Current human request, exact named titles, negations/exclusions, intended targets | Keep exact in the live turn. Store original separately and mark summaries as historical. |
| Tool calls/results in an unresolved batch | Defer compaction. Retain call identity, name, arguments, response type, ordering, actual error/success, and skipped-call feedback as one group. |
| Approval/denial/cancellation and resolved effect snapshot | Keep in application state/ledger; summaries neither grant permission nor revoke known committed effects. A chat grant is not a sentence in model context. |
| Committed writes, completed-write signatures, last successful call, dispatch count | Preserve as application records and enforce them independently of model output. Never infer these from generated prose. |
| Weekly-review active/index/marks/current-step provenance | Read saved review state. Never let a summary advance it or override the current step. |
| Catalog references, storage IDs, record revisions | Retain the actual identity/revision mapping privately. Rebuild model-facing choices from current data. Preserve opaque model call IDs separately from storage IDs. |
| Literal code, JSON needed for fidelity, dates, counts, exact values | Preserve using application-identified spans/fields. A heuristic code-fence regex cannot identify everything that matters. |
| Old conversational prose | Eligible for summarization only when its request has a settled outcome. Keep source role/order and original record references. |
| Failed, denied, partial-error, or uncertain historical turns | Keep visible originals/receipts. Preserve existing exclusion from model examples; a short outcome annotation may be supplied only as explicitly historical data if justified. |

The repository accepts observed Chrome `callID` as well as draft `callId`, rejects duplicates, and supports a solitary empty ID in the observed Chrome 154 contract. Do not normalize IDs by guessing or convert them into item references during compaction. Changing that compatibility policy is separate work. Durable typed history would need a versioned data representation and explicit reconstruction into the constructors exposed by the target build.

### Prompt-injection and provenance constraints

Summaries are model-generated, derived from potentially adversarial item descriptions, quoted instructions, and tool results. They belong in fenced historical DATA, never as new trusted system rules. Their durable record should identify source record range, source roles, language, summarizer settings, checkpoint version, and generation time. A source fingerprint is useful for invalidation; it does not prove the summary is semantically correct.

Preserve application-computed facts separately from narrative summaries. In particular, a model sentence such as “the user approved deletion” cannot authorize deletion. A summary containing “complete the review” is an old conversation topic, not the current user request. Validate exact-title/exclusion fields deterministically and retain originals when validation fails. For prose, use spot checks and task-specific evaluation rather than claiming a general semantic equivalence guarantee.

Re-summarizing prior summaries compounds omissions. Prefer a new bounded checkpoint from original completed records or combine an unchanged prior checkpoint with a verified new interval. Never accumulate every summary permanently; older state descriptions will become stale and consume room even when obsolete.

## Persistence, reconstruction, and failure recovery

Chrome's session-management guide demonstrates reconstructing context with `initialPrompts` after restart; this creates a new model session, not an exact serialized model-state restore. Clones inherit context, so cloning alone does not shorten it. Destroy unused sessions to release resources. [Chrome session-management guide](https://developer.chrome.com/docs/ai/session-management#restore_a_past_session).

**Proposed IndexedDB design:** retain original messages in the existing history store. A separate versioned checkpoint record could contain a compact narrative plus source range/fingerprint, exact retained fields, capability/options version, and token diagnostics. Do not overwrite original messages or database item/review records. This would require a deliberate schema/storage design review; no new store or upgrade is implemented here.

For a stronger crash-safety goal, add a request/dispatch ledger in future work: request ID and original request; proposal identity/signature; approval snapshot; dispatched/committed/denied/unknown outcome; actual receipt; terminal marker. Persist committed receipts with relevant mutations in the same IndexedDB transaction where practicable. Current text history and ephemeral activities cannot establish an exactly-once guarantee across a crash. Do not describe a prose summary as fixing that limitation.

Proposed restart sequence:

1. Read originals, valid checkpoint, current items/preferences/review, and any durable ledger. Match source/version fingerprints and reject malformed or obsolete checkpoints.
2. Close interrupted requests as interrupted/uncertain; do not reissue model proposals or restore an outstanding approval card as approved. Read committed item state before an explicit human retry.
3. Retain the current startup behavior that pauses saved weekly review. Rebuild current catalogs and use present records as state authority.
4. Create with trusted system policy, bounded historical summary, and an exact recent tail of completed turns. Leave current changing item state and catalog choices to the live request context.
5. Validate actual usage and next-input fit; attach listeners; enable chat only after success. Restoring context must not invoke tools, mutate items, or advance the review.

For replacement creation failures, try at most a small, deterministic fallback ladder: last validated checkpoint plus smaller complete recent tail; bounded original completed turns; trusted policy plus current application state and no historical narrative. Keep all originals available in the UI. Explicitly say continuity is reduced if a fallback removes it. Do not retry creation indefinitely or assume that injecting the entire full history can fit.

Keep the old session until a replacement is validated where memory/device availability permits; destroy the loser promptly. This is an application adaptation that uses more memory than the article's destroy-first ordering. When two sessions cannot coexist, save a durable recovery checkpoint first, then use destroy-first and the bounded ladder. Failed summarization before destruction should leave the old session intact. A failed creation after destruction should leave Send disabled with a useful Retry path; tools and lists can remain usable.

### Stop and race handling

- Use a dedicated maintenance controller and monotonically increasing generation. Stop, reset, startup retry, mode switch, database closure, and tab teardown invalidate it.
- Pass cancellation signals to supported detector/summarizer/measurement/create operations. Check generation and abort state after every await even if the API accepts a signal.
- A signal supplied to session creation can govern the session lifetime. Distinguish a maintenance/session-lifetime controller from a per-prompt Stop controller; do not unintentionally destroy a successfully installed base session by later aborting a completed operation's controller.
- Late summarization or creation results must be discarded; destroy a stale new session. A stale `finally` block must not enable Send over a newer active turn.
- Attach handlers to the session they refer to, not just a mutable global. An obsolete clone's overflow notification must not compact the current base or turn.
- Re-read or revision-check the items/review/history used by a checkpoint before committing it. Another tab can edit data while summarization runs; summary completion does not freeze the database.
- Cancellation does not undo a committed write. Preserve receipt reporting and never turn aborted maintenance into automatic tool replay.

## Original adapted pseudocode

The following is a design sketch, **not runnable production code**. Application helpers intentionally stand for unimplemented storage, validation, budgeting, and locking. It keeps the existing isolated-turn design and generates a bounded historical checkpoint. It does not execute tools or restore typed tool continuations.

```js
// Proposed maintenance state, separate from turn/controller state.
let maintenance = null;
let maintenanceEpoch = 0;
let historicalCheckpoint = null;

function requestCompaction() {
  // An overflow handler may set this flag; it never destroys a running session.
  pendingMaintenance = true;
}

function stopMaintenance() {
  ++maintenanceEpoch;
  maintenance?.controller.abort();
  maintenance = null;
}

async function buildHistoricalCheckpoint() {
  if (!isClosedTurnBoundary() || maintenance) return { deferred: true };
  const epoch = ++maintenanceEpoch;
  const controller = new AbortController();
  const ownOperation = { epoch, controller };
  maintenance = ownOperation;
  setMaintenanceControls(true); // Preserve a working Stop control.
  const current = () => epoch === maintenanceEpoch &&
    !controller.signal.aborted && isClosedTurnBoundary();
  let candidateSession = null;

  try {
    await flushOriginalMessagesAndReceipts();
    if (!current()) return;
    const source = await readCompletedHistorySnapshot();
    const { olderProse, exactTail, retainedFacts } = selectWholeTurnGroups(source);
    // retainedFacts comes from original human fields/verified application facts.
    // Do not include approvals as executable authority or stale catalog enums.
    const narrative = [];
    for (const segment of olderProse) {
      if (!current()) return;
      const summarizer = await getPreparedEnglishSummarizer();
      if (!current()) return;
      const summaryContext = 'Describe an old conversation as history. Preserve negations.';
      if (typeof summarizer.measureInputUsage === 'function') {
        const inputUsage = await summarizer.measureInputUsage(segment.text, {
          context: summaryContext, signal: controller.signal
        });
        if (!current()) return;
        if (inputUsage > summarizer.inputQuota) {
          narrative.push(retainOrOmitWholeEligibleSegment(segment));
          continue;
        }
      }
      const proposed = await summarizer.summarize(segment.text, {
        context: summaryContext, signal: controller.signal
      });
      if (!current()) return;
      narrative.push(validateHistoricalProseOrRetainOriginal(segment, proposed));
    }

    const checkpoint = boundedHistoricalData({ narrative, exactTail, retainedFacts });
    // A text-only scratch session avoids declaring tools with obsolete choices.
    const options = textOnlyEnglishOptions();
    if (await LanguageModel.availability(options) !== 'available') {
      // Route download/activation to an explicit preparation UI, no hidden download.
      return { needsPreparation: true };
    }
    if (!current()) return;
    candidateSession = await LanguageModel.create({
      ...options,
      signal: controller.signal,
      initialPrompts: [
        { role: 'system', content: TRUSTED_SYSTEM_POLICY },
        { role: 'user', content: fenceHistoricalData(checkpoint) }
      ]
    });
    if (!current()) return;
    const needed = await candidateSession.measureContextUsage(
      representativeNextContextAndRequest(),
      matchingNextPromptOptions(controller.signal)
    );
    if (!current()) return;
    if (candidateSession.contextUsage + needed + measuredHeadroom() >
        candidateSession.contextWindow) {
      return { insufficientRoom: true }; // Reduce bounded data or keep old checkpoint.
    }
    if (!await sourceSnapshotStillMatches(source) || !current()) return;
    await saveCheckpointIfSourceMatches(checkpoint, source);
    if (!current()) return;
    historicalCheckpoint = checkpoint;
    pendingMaintenance = false;
    return { readyForFutureTurns: true };
  } finally {
    candidateSession?.destroy(); // Scratch session is never the active tool session.
    if (maintenance === ownOperation) {
      maintenance = null;
      restoreControlsForActualCurrentState();
    }
  }
}

// Later live turns still create/clone sessions normally, rebuild catalogs,
// project checkpoint data, supply the original human request separately,
// and retain callback permission, stale-write, receipt and replay enforcement.
```

For any future persistent no-clone session renewal, use the same closed boundary and checkpoint, create/validate a replacement with the current mode's modalities/policy, and atomically install it only if generation/source checks still pass. Reattach its overflow listener and reset application counters only after that installation. Carry no old approval or unresolved native call into this path. The scratch preflight above checks representative input; a real submission still needs measurement of the exact current catalog/projected context.

## Proposed implementation sequence and acceptance criteria

| Step | Work proposed | Acceptance criteria before proceeding |
| --- | --- | --- |
| 1. Diagnose actual pressure | Display usage/window in Tools for the active turn and collect quota/overflow diagnostics. | Native and bridge measurements identify the actual session; missing accounting fields fail gracefully; Send/Stop behavior remains unchanged. No hardcoded context-window size or obsolete quota aliases. |
| 2. Preflight stage inputs | Measure actual projected input plus matching response options, reserving practical headroom. | Oversized route, selected schema, current request, and tool feedback produce useful bounded recovery. No write occurs because of a measurement error; no dispatched write is retried. |
| 3. Define whole-turn history/checkpoints | Separate originals, eligible older prose, exact recent tail, provenance, and authoritative receipts. | Failed/denied history stays excluded; exact titles/negations survive; old catalog labels cannot retarget; originals remain unchanged and readable. |
| 4. Optional local summarization | Prepare Summarizer explicitly; support unavailable/unsupported-language/oversized-input cases. | Chat works without Summarizer; download needs the existing explicit preparation pattern; Stop rejects late work; output shorter in characters but larger in measured usage is rejected. |
| 5. Validate/install or save bounded context | Add source/generation checks and safe replacement/scratch lifecycle. | Replacement failure retains usable old context where possible; destroy-first failure has bounded recovery and truthful disabled Send; all listeners/resources/controllers belong to the correct session. |
| 6. Restart recovery | Reconstruct from versioned data and current IndexedDB state. | Reload never dispatches an old tool or advances review; invalid/stale checkpoints fall back; interrupted/unknown writes require state inspection and a new explicit request. |
| 7. Evaluate real model continuity | Exercise representative weekly-review/list conversations at capacity. | Record browser/model/options, actual usage savings, language behavior, latency, cancellation, and summary fidelity; deterministic harness tests and real model evidence are reported separately. |

Minimum failure cases for a future implementation:

- Overflow during route or continuation records a warning and defers compaction; the current request is neither silently replayed nor retargeted.
- Initial checkpoint too large; one current prompt too large even in a fresh session; protected literal content dominating the budget; full-history recovery exceeding capacity.
- Multiple calls where first commits and second awaits approval; denied first call with skipped siblings; six-tool continuation; lost response after a committed write. Compaction defers and known outcomes remain factual.
- Stop during detector, summarizer, measurement, creation, storage flush, or source revalidation; reset/fallback while creation is pending. No stale session/checkpoint/permission card is installed.
- Same-title records reordered, rename/delete from another tab, and review marks changed during maintenance. Old readable choices never switch identities; current records win.
- Injection embedded in a title/result, old imperative in a summary, negation (“do not move B”), exact quoted task title, numeric/date detail, code fence and unfenced JSON. No historical content becomes authorization.
- Mixed languages, short low-confidence text, unsupported locale, speed unavailable but auto available, unavailable summarizer, model eviction under storage pressure, and offline operation with missing companion models.
- Model returns an empty/nonshorter/inaccurate summary, measured capacity changes between session creations, or a checkpoint references records that were cleared. Recovery stays bounded and originals remain intact.

## Uncertainties and limits of this research

The Chrome guide, explainer, and draft differ in details of overflow protection/algorithm and API support. The precise native tool behavior on the installed Chrome build, whether output generation itself triggers eviction, retained-context behavior after abort on that build, and all exception-property spellings need controlled live validation before relying on them. Do not infer synchronous progress/cancellation guarantees from the event examples. Companion research: [Summarizer](chrome-summarizer.md) and [Language Detector](chrome-language-detection.md).

No compaction quality evaluation or device latency/memory measurement was performed. No new production implementation, migration, test runner, dependency, browser setting, or model download was created. Upstream examples are illustrative; source pins are recorded above. This document's data model, idle gate, safe fallback ladder, safety table, pseudocode, and acceptance criteria are proposed adaptations for this prototype, not requirements in Chrome's compaction article.
