# Harness v2 implementation and fixture evidence

Implemented **2026-10-12** against [design v2](harness-design-v2.md) and its [65-step plan](harness-implementation-plan-v2.md). This document records implementation and deterministic checks. Actual local-model trials are separately owned/recorded in [harness-v2-trial.md](harness-v2-trial.md).

## Delivered behavior

- Two small static modules: host event reducer/coordinator and pure context/catalog/specialist helpers. No packages, build, backend, APIs/polyfills or IndexedDB migration were introduced.
- Text-only preparation and bridge default; required-layer readiness, finite progress/indeterminate preparation, cancellation-safe sessions, optional dated native canary and idle transport/catalog/decoder controls.
- One inference at a time, serial effects, base plus worker, shared 24 inference/18 dispatch/180 active-second run budget, six dispatches per segment, original-ledger Continue, human-wait exclusion and bounded diagnostics.
- Callback-entry private one-use random transport token plus signature handoff, stripped before standard validation and absent from public/model/activity/diagnostic traces; immutable arguments; transaction commit receipts before rendering/Stop checks for every generic/domain/review write; factual partial results after response/render/inference failure; no replay or later dispatch after a transport/render failure.
- Whole native batch validation and exact correlation/skipped outcomes, including rejection of both ID spellings together and explicit solitary-empty-ID compatibility.
- Trusted UI-generated Start/Complete step/Resume guidance intersects Standard/Full with read-only tools plus view selection; all item mutations and review controls are unavailable even under retained chat grants. Fresh human requests retain their ordinary catalog.
- Frozen readable aliases, Standard twelve/Full sixteen selection, named decoder profiles preserving the literal description field, shared explicit Inbox scope, whole closed history, measured reserve plus exact trimmed remeasurement, unknown usage and bounded protected input/results across every JSON/plain/native typed prompt shape, exact named-new-Project destinations and closed existing view-context labels/@tags and matching requested substrings.
- Explicit next-action reviewer for Inbox/selected Project, one fresh tool-free inference, typed bounded grounded advice, membership/revision/lineage validation, Stop/timeout/stale rejection and no inherited authority/page effects.
- PWA shell v6 includes both modules offline; existing domain transactions, five workflows and eleven review steps remain.

## Exact runner results

All 23 runners below completed with exit code **0** using bundled Node 24.19.0, the existing Playwright module and isolated static origin `http://127.0.0.1:8766`. Chrome fixture processes used installed Chrome 154.0.8037.99. No dependency installation was needed. After the final capture-signature normalization, all ten affected runners passed again: the four pure checks, workflow-operations, review-workflow-operations, bridge-receipts, harness-v2-focus, harness-v2-context and harness-v2-lifecycle. Independent review also passed both transports with object and serialized callback arguments. Final source prefixes are app `95252979` and harness `A2FAD569`.

| Runner | Verified behavior |
| --- | --- |
| `tests/self-check.mjs` | Production integrity, hierarchy, filters, tool trust boundary, envelopes, eleven review planners |
| `tests/harness-check.mjs` | Native IDs, readable enums, private-ID projection, stale choices, grammar/validation, literal description; capture empty/omitted context signatures equivalent without argument mutation, nonempty contexts and update patch clears distinct |
| `tests/agent-host-check.mjs` | Ordered identity/admission, serial effects, shared totals, human-wait exclusion, same-ledger Continue, immutable late receipts, global inference/session ownership, bounded journal/runs |
| `tests/agent-context-check.mjs` | Whole closed turns, exact intent/receipts, known/unknown usage and reserve, catalog profiles, Inbox agreement, literal description, grounded typed reports and no-effect claim guard |
| `tests/browser-review.cjs` | Startup/cancel/retry, migration, hierarchy/forms, approvals, stale/delete/busy/revoke, Stop/cap, transaction errors, review/resume, 320px panels |
| `tests/native-contract.cjs` | Serialized/object WebMCP schemas/arguments, actual approved production callback and persisted item |
| `tests/natural-workflows.cjs` | Scripted shopping/container/child, task completion preserving details, both native IDs, no duplicate writes |
| `tests/workflow-operations.cjs` | 19 real IndexedDB/schema/resolution/atomicity/stale/cancellation assertions |
| `tests/review-workflow-operations.cjs` | 51 production schema/IndexedDB/status/stale/rollback and all-eleven-step assertions |
| `tests/weekly-chat.cjs` | Scripted eleven-step review under bridge and both native IDs, captures/Projects/moves/statuses/actionable Inbox and pause/reload/resume |
| `tests/review-ui-integrity.cjs` | Stale review controls preserve newer marks; automatic guidance omits progress tools |
| `tests/native-proposal-fallback.cjs` | Production opt-in; fresh first-inference fallback, manual idle switch, replacement recovery, no fallback/replay after dispatch/denial/AbortError/Stop/Continue |
| `tests/bridge-routing.cjs` | Stage-only grammar, exact titles, malformed/unknown replies blocked, approvals, Stop between stages, no replay |
| `tests/bridge-receipts.cjs` | Receipt-first continuation, post-commit repeat/inference failure, compound work, no duplicate weekly receipt |
| `tests/review-chat-boundary.cjs` | Item writes do not authorize review progression; exact blocked native correlation, remaining item work and fresh confirmed progression |
| `tests/catalog-continuation.cjs` | Duplicate-title insertion preserves original readable alias/target rather than renumbering |
| `tests/reviewer-check.cjs` | Existing mobile/keyboard/text-safety/external-abort/stale approval and draft checks; unmodified fixture-runner Chrome gate |
| `tests/pwa-check.cjs` | Twelve cached shell assets, added modules offline/subpath, unrelated/missing assets, and max-age=3600 old-v5→new-v6 update proving executed/cached new JavaScript and navigation HTML on normal reload/offline |
| `tests/harness-v2-lifecycle.cjs` | Default bridge, scoped canary despite grant, probe failure/unsupported layers, 100%-before-create/invalid progress/cancel/late sessions, seven exact commit-before-Stop callbacks, render/lost-response receipts, immutable approved arguments, external callback isolation and token correlation under identical public args / own lost-before-delivery / delayed delivery / Stop in serialized and object contracts, with metadata absent from traces |
| `tests/harness-v2-context.cjs` | Greeting route, unfulfilled false claim, measured reserve/remeasure/current usage, overflow/protected input, 24-stage original-ledger Continue, two sessions, whole-batch invalid correlation; reserve applied before plain canary/native typed feedback, receipt retention without further prompt/dispatch at feedback overflow, mixed create+count answer / extra false deletion claim, exact named-new-Project destination rejection, exact organize replay before stale validation, and invalid view-context rejection in both transports |
| `tests/harness-v2-reviewer.cjs` | Explicit Inbox/Project, fresh tool-free one-stage reviewer, no grant inheritance/effects, typed references/injection, malformed/stale membership/revisions, timeout/Stop/late rejection |
| `tests/harness-v2-focus.cjs` | Twelve bridge/native scenarios with prior chat/completion grants: exact named Task focus, unrelated5 followup/sentinel blocked before second dispatch, compound two-name work, broad six-Task request, duplicate clarification, unknown literal capture hiding existing title workflows, and compound capture plus existing completion |
| `tests/harness-v2-guidance.cjs` | UI Start/Complete step/Resume expose only reads plus show_view in Standard/Full and bridge/native; pre-existing chat grants cannot dispatch scripted item/review writes, while fresh human writes remain available |

Existing native scripts now choose Full where primitives are needed and run the production Test native tool calls → scoped Allow once → Use native proposals controls through `tests/harness-ui.cjs`. Canary-only fixture sessions supply their own harmless call/feedback without consuming normal scripts. Tests reset ordinary traces only when their assertions explicitly exclude diagnostics. Effects, correlations, stale checks and replay assertions remain.

## Evidence boundaries and limitations

The independent review found and reproduced four bugs, now covered by regressions: still-fresh HTTP cache masking a deployment; measured reserve missing plain/native-part inputs; requested read answers hidden after writes; and signature-only attribution of an interleaved external callback. The fixes above preserve existing saved facts, strict validation and replay guards. Real-model trials additionally motivated exact named-new-Project argument choices and closed existing view-context labels/@tags and matching requested substrings; safety of these gates is fixture-proven while model task competence remains separately measured.

A later actual capture proposed the same titles with empty then omitted context. `callSignature` now normalizes only that capture default, preventing a redundant second permission/dispatch. The context runner covers both bridge/native with one saved Task, one receipt, unchanged approved empty-context arguments and an informational repeat stop. Pure tests preserve distinct nonempty contexts and update/patch omission versus explicit clearing. This is repeat detection, not a routing or durable replay rule.

These runners use scripted proposal/model/native API doubles and real local DOM/IndexedDB. A canary pass in a fixture proves the host plumbing under that double; it does not prove installed Chrome typed-tool availability or real-model task competence. The unmodified Chrome check in `reviewer-check.cjs` observed Prompt API exposure and absent WebMCP, correctly blocking preparation. The coordinator's separately configured actual Chrome tab and real-model observations are documented independently.

Host policy numbers are prototype limits, not Chrome quotas. Native tool availability and description-retaining decoder compatibility require actual-browser evidence; unsupported layers are reported honestly. Usage is unknown unless usable measurements/current usage/window are present. Serialized character bounds are a fallback guard, not token measurement. Signal-ignoring backend work temporarily blocks a new inference/session preparation until it quiesces.

Readable choices stay closed for the run/Continue. Newly created records need a new human request to become selectable; changed-record proposals remain subject to stale validation. No-effect completion guarding is conservative language matching, not proof of correct routing/reasoning. Preventing an unsafe proposal is not fulfillment of its task.

The private token relies on the pinned WebMCP contract permitting transport input metadata despite its informational public schema; actual browser execution is verified separately by the coordinator. A same-privilege page script can intercept/copy transport arguments and already access IndexedDB, so this does not claim a hostile-page security boundary.

Current-request Task focus restricts only organize/completion/status title fields. Known literal matches use case-insensitive word boundaries and longest overlapping names; distinct names retain compound scope, and duplicate records still clarify. Recognized unknown capture literals omit those existing-title workflows unless current compound wording names an existing Task; new records still need a fresh request. Vague/unmatched wording and lexical broad phrases (all/each/every/remaining/other tasks, all of them, the rest/everything) retain unrestricted choices. A broad phrase may be negated or quoted background rather than affirmative authorization; no general natural-language intent policy is claimed. Generic primitive references, free new titles, wrong verbs/statuses and incidental existing-title mentions remain residual surfaces with their ordinary validation/permission boundaries. These fixture passes prove the targeted enum gates, not a universal intent firewall.

Commit receipts/journal are memory-only. They prove admitted callback transactions during that page lifetime and survive Stop; they cannot promise durable exactly-once recovery across reload/crash. Lost replies without a matching local receipt remain uncertain. Reload restores domain/history and paused review while discarding all execution authority/readiness/jobs.

Deferred features remain deferred: optional Summarizer/Language Detector, rich streaming/Markdown, declarative forms, critics, generic/nested/background/concurrent agents, durable replay/queues and cloud fallbacks.
