# Recommended next actions

Prepared **2026-10-12**, after completing the source research requested in [ChromeAI.md](ChromeAI.md). This is a future-work plan. No implementation, browser configuration, model download, or app test was changed/performed by this research. Start with the [research index](docs/research/README.md) and [proposed browser architecture](docs/research/browser-agent-architecture.md); the individual chapters contain precise source/version evidence and unexecuted examples.

The recommended direction is **one trusted browser host, two Prompt API proposal adapters, and narrowly scoped specialists**. Keep the existing constrained JSON bridge, native own-page WebMCP execution, readable enum choices, explicit permissions, strict callbacks, and IndexedDB transactions. Borrow Pi's lifecycle and supervision patterns without importing its Node runtime or copying its parallel/retry defaults.

## 1. Revise the design and implementation plan before changing the harness

Use a new design agent to reconcile this research with the maintainer's [intent](INTENT.md), [visual direction](DESIGN.md), and existing [app design](docs/app-design.md). Then have a separate planning agent produce the implementation sequence. The old [implementation plan](docs/implementation-plan.md) records the initial build; it should not silently become the plan for a new harness.

The revised design should name the owners of human requests, application facts, proposals, approvals, execution, context, child jobs, and presentation. Define explicit run/turn/call/child states, terminal reasons, and shared budgets. Distinguish model output from verified effects and child advice from root authority. Keep the UI minimal: useful activity and permission state, not internal protocol chatter.

**Deliverable:** an agreed browser-only architecture and staged plan with acceptance criteria, migration needs, and a source/actual-build uncertainty list. Preserve static files, no build step, no backend, no external runtime/model API, and IndexedDB as application truth. [Architecture](docs/research/browser-agent-architecture.md), [Pi core loop](docs/research/pi-agent-loop.md), [Pi Subagents](docs/research/pi-subagents.md).

## 2. Establish the target Chrome contract with small, harmless probes

Before relying on experimental behavior, record Chrome version/channel, relevant manually supplied flag settings, session options/schema projection, selected transport, and model diagnostics where actually available. JavaScript does not provide a trustworthy general API for the browser's model version; do not invent one.

Test these layers separately: required interface exposure; matching language/modality availability; text-session creation/inference; native tool-session creation; one read-only tool-call canary and feedback round; own-page WebMCP discovery/manual invocation; result/error/cancellation behavior. A constructor or `available` response is not a functional-tool-use result. The pinned renderer availability path ignores the tool vector, so passing full options is necessary intent but insufficient proof.

The inspected `prompt-api-tool-use` Enabled choice expands to `AIPromptAPIToolUse`, `OnDeviceModelConversationBackend`, and `AIApiFoundationalModel:model_version/v4`. Its source currently offers Default/Enabled. It does not enable WebMCP or the base Prompt API. Returning to Default removes a manual override but does not prove other enabling mechanisms are absent. Do not describe our earlier generic errors/crash backoff as a proven flag or array-schema defect. [Flag investigation](docs/research/chrome-prompt-api-tool-use.md).

Probe current `callId` versus historical `callID`, nontext stream shapes, all-call/result correlation, raw-string versus object result serialization, null navigation results, and DOMException names. Keep one verified result envelope; avoid recursively parsing arbitrary nested tool text. Measure current context APIs and actual overflow behavior: the guide's eviction description and the draft's rejecting prefill path disagree. Constraint measurement also has an implementation gap. [Imperative contracts](docs/research/webmcp-imperative-api.md), [session contracts](docs/research/chrome-session-management.md), [structured output](docs/research/chrome-structured-output.md).

**Acceptance:** a dated matrix with observed pass/fail/unsupported/unknown, exact options and failure stage, and separate fixture versus actual-model evidence. No mutations in readiness canaries. No retry storm after model disconnection. Select fallback before dispatch; never change transport and replay a request after calls or uncertain effects exist. Treat native-session creation failure separately from native proposal-generation failure.

## 3. Introduce a shared host lifecycle without weakening existing guarantees

Normalize native calls and constrained JSON proposals behind adapters feeding one coordinator. Keep route/argument/reply prompts as adapter stages. Budget all inference stages, tool dispatches, elapsed time, live sessions, context, and result size separately. Default to one active local inference and serial effects.

Introduce typed lifecycle/outcome events and a reducer for activity. Retain actual commit receipts even if later inference, rendering, or cancellation fails. A valid no-tool answer may explain or ask a question; it must not claim an unsaved task was created/completed. Final prose is not proof of a write. Keep the canonical journal separate from model projection and visible chat history.

If durable effect records are added, design their operation identity and atomic transaction with the domain change. An append-only event list alone is not exactly-once execution. A crash or lost response after dispatch requires inspection of committed state, not automatic replay. Session restoration must not revive permission grants, pending calls, or executable jobs.

Preserve these current boundaries:

- Fully validate complete proposals, every enum/reference choice, and every callback argument; recheck the approved target/effect inside the mutation transaction.
- Keep approved plans immutable; a hook changing arguments needs revalidation and renewed approval of the changed effect.
- Stop dispatch on denial, cancellation, stale state, failure, clarification, or review transition. Account for skipped native siblings with correlated outcomes.
- Keep item mutations and review progression separated by a fresh human message; preserve the explicit continuation ledger and repeated-write guards.
- Link inference and invocation cancellation, close pending approval, destroy owned sessions, and reject late callbacks. Registration abort and closing a stream iterator are not sufficient execution cancellation.

Pi's default parallel batches, all-results `terminate` semantics, and mutable pre-execution hook are useful contrasts, not policies to adopt. The reference extension also permits behaviors our app intentionally handles more strictly. [Pi scheduler](docs/research/pi-agent-loop.md), [reference harnesses](docs/research/chrome-reference-harness.md), [stream cancellation](docs/research/chrome-streaming-output.md).

**Acceptance:** existing contract checks still pass; failure after a commit reports the exact partial outcome; no cancelled/stale event revives work; no missing receipt causes replay; no additional review transition occurs without a new human request.

## 4. Improve model catalogs and context before adding prompt rules

Continue hiding storage IDs from the model. Offer readable, disambiguated closed choices in tool parameters and resolve them through the host's fixed turn snapshot. Refresh relevant facts/tool discovery at safe boundaries while rejecting stale proposals; never silently assign an old alias to a different record. Newly created choices can enter the next appropriate request according to the established contract.

Compare a focused semantic catalog with the full sixteen-tool catalog. Prefer workflow capabilities for capture, filing, status, shopping, and completion; retain generic operations where they serve a measured need. Give each inference stage only relevant parameters/facts. Test retaining useful parameter descriptions where the target decoder supports them. The current projection removes schema metadata while correctly preserving the literal application field named `description`; preserve that distinction in any refactor.

Resolve the discrepancy between `list_items(parentId:null)` returning all root records and the UI Inbox meaning unfinished parentless Tasks. Descriptions, filters, and responses should express the same intended domain semantics. Avoid asking the model to infer UI rules from a generic null parent.

Keep exact task titles, omitted-field meanings, negations, status, and destination choices intact. Evaluate soft concise-reply instructions separately from the current hard 600-character reply grammar/validator. The official warning concerns generated prose quality, not a reason to remove storage limits, exact enums, or field validation. Decoder projections should be version-tested; preserve the stronger public schema and code validator even when a grammar projection is smaller. [Effective tools and current audit](docs/research/webmcp-effective-tools.md), [official guidelines](docs/research/chrome-ai-guidelines.md), [structured constraints](docs/research/chrome-structured-output.md).

**Acceptance:** varied natural-language requests select the correct capability, preserve all named commitments, clarify ambiguity, and avoid duplicate/unrequested changes. Record both blocked bad proposals and actual task success; a guard preventing damage is not an autonomous task pass.

## 5. Add one supervised, read-only specialist

Start with an Inbox clarifier or Project next-action reviewer. Use a configured weekly-review role or explicit human request to authorize the child job. Do not let model preference or complexity alone grant unrestricted delegation.

Host-assign identity, parent run, role, snapshot revision, tool/capability scope, budgets, and cancellation lineage. Give the child a bounded snapshot or read-only catalog. It returns a validated typed proposal: observations with evidence, suggested actions, questions, and limitations. It cannot mutate, approve, advance the review, spawn further children, evaluate arbitrary code, or carry the root's chat grant. Root validates freshness and presents any resulting operation through its existing execution gate.

Initially allow one child at a time and no nesting. Use small explicit admission/inference/report/deadline limits shared with the parent; measure before raising them. A fresh session or clone changes context, not privilege isolation. A model-supplied actor field does not authenticate a logical specialist to a WebMCP callback. Child reports are untrusted advice, never committed-effect receipts or new human authorization. [Pi Subagents](docs/research/pi-subagents.md), [session ownership](docs/research/chrome-session-management.md), [architecture](docs/research/browser-agent-architecture.md).

**Acceptance:** child proposals are useful and grounded; malformed, stale, injected, timed-out, and cancelled reports cannot change data or widen scope; parent Stop settles child work; active inference remains bounded; a child failure does not lose root receipts.

## 6. Add compaction only after measured context pressure

First improve deterministic context projection and retain complete closed turns. Record `contextUsage`/`contextWindow` and input measurement where supported, with output/result reserve and explicit estimation caveats. Do not treat character count as exact token accounting or `contextoverflow` as a preventative warning.

Compact only when no calls, approvals, unresolved effects, or capped continuation are pending. Preserve originals, exact restrictions, negation, human intent, verified receipts, unresolved questions, and call/result integrity. Summaries cannot replace canonical records or grant authority. Rebuild choices from current state, never by replaying summarized commands.

Summarizer and Language Detector remain optional with separate preparation/consent/readiness. Check actual configuration and method support; source speed summarization has language/type/length/context restrictions, and the demo's speed-first availability check is insufficient. A detector confidence threshold is application policy, not a guaranteed accuracy bound; short/mixed text can be unknown. Prefer already prepared resources for strict no-download background maintenance. [Compaction](docs/research/chrome-session-compacting.md), [Summarizer](docs/research/chrome-summarizer.md), [Language Detector](docs/research/chrome-language-detection.md), [download lifecycle](docs/research/chrome-model-downloads.md).

**Acceptance:** summaries are measured smaller and preserve protected meaning; unsupported/failed/inaccurate summaries fall back safely; Stop invalidates replacements; no mid-tool compaction or historic replay occurs.

## 7. Review the implemented result with realistic evidence

Keep evaluation layers separate: deterministic host/domain fixtures, actual native browser contract tests, real local-model conversations, and human review of meaning/claims. Upstream mock, echo, polyfill, and no-tool-count passes do not prove our native local-model workflow. The tools collection's step counts and semantic dry-run shortcuts deserve explicit reporting. [Demo evidence](docs/research/chrome-ai-demos.md), [WebMCP evaluation tooling](docs/research/webmcp-tools.md).

Have an independent review agent inspect the final code and intended behavior. Then try the actual app through a complete eleven-step weekly review using natural-language chat: mind dump, existing/new Projects, moves between lists/Inbox, in-progress/completed/waiting tasks, shopping, clarification, and explicit review progression. Supply calendar information as human input; do not invent calendar access.

Include paraphrases, exact quoted titles, duplicate names, negation, no-tool replies falsely claiming success, extra/malformed/duplicate native calls, wrong correlation, denied/skipped siblings, cancellation during approval and after commit, failure-after-commit, stale records from another tab, cap/Continue, reload/resume, large catalogs, and injected stored data/child reports. If streaming is introduced, include split Markdown/HTML, unsafe links, partial JSON, truncation, explicit Stop, and late chunks. If a feature changes, rerun relevant contracts plus the end-to-end review.

**Acceptance:** persisted state and review marks match actual human instructions; claimed effects have receipts; no unauthorized or replayed write occurs; failures are recoverable and reported truthfully. Record case denominators, interventions, clarifications, blocked proposals, inference failures/fallbacks, actual effects, and latency excluding human permission wait. No new runtime dependency or build step is required for local test artifacts.

## Defer until there is a demonstrated need

Defer parallel model sessions/writes, recursive specialists, detached/background agents, cloud/provider fallbacks, arbitrary workflow scripts, and generic agent-management tools. Defer rich Markdown and declarative forms unless a concrete UI/workflow benefit justifies their separate contracts. In particular, autosubmit activation is not an approval barrier, omitted form fields can retain state, and navigation null is not a saved-result receipt. [Declarative API](docs/research/webmcp-declarative-api.md), [streaming guidance](docs/research/chrome-streaming-output.md).

Do not import Pi's Node/process/filesystem environment, helper orchestration defaults, extension host privileges, or a polyfill to satisfy the required native API gate. Keep the product centered on the maintainer's local list manager and guided weekly review.
