# Harness design v2: bounded local assistance

Design date: **2026-10-12**. This is the implementation target for this cycle, not a claim of completed runtime behavior. It follows [INTENT.md](../INTENT.md), [DESIGN.md](../DESIGN.md), the existing [app design](app-design.md), [next actions](../nextactions.md), and the [completed research](research/README.md).

## Scope and product decision

Keep the existing list manager, all eleven weekly-review steps, native WebMCP callbacks, and IndexedDB transactions. Improve the harness around them: one shared host lifecycle, explicit resource limits, deterministic context, focused model declarations, honest readiness, and one requested read-only specialist. Deliver ordinary ES modules and static assets; no packages, build, server-side dependency, remote model, extension privilege, or API polyfill.

The constrained JSON bridge becomes the startup default. Native Prompt API tool calls become an opt-in experiment enabled only after a harmless canary succeeds. Both continue executing actual page operations through native WebMCP. Missing either required native API still blocks the workspace. Switching proposal format does not repair a missing platform API.

The visual change is small: existing dark/light workspace and chat, one activity status, the current permission cards, a reviewer action, and expanded Tools & diagnostics. Use existing spacing/colors and accessible text controls; do not add an agent dashboard or rich transcript renderer.

## Ownership and modules

| Owner | Responsibility and concrete change |
| --- | --- |
| `app.js` | Human/UI events, startup, permission cards, own-page registration/discovery, validated callbacks, rendering, and domain integration. Replace ad hoc turn counters/status updates with host calls. |
| New `agent-host.js` | Small run/event reducer, IDs, shared budgets, linked cancellation, serial admission/dispatch accounting, continuation ledger, and specialist supervision. Use JSDoc discriminated contracts plus runtime validation; no TypeScript build. |
| `harness.js` | Native and bridge proposal adapters, exact schemas/parsers, fixed readable aliases, write signatures, native correlation, and result envelopes. Adapter internals never execute a page tool. |
| New `agent-context.js` | Pure stage projection, bounded complete history, result projection, catalog profiles, and optional context measurement. Reuse existing catalog identity resolution. |
| `workspace.js` / `storage.js` | Strong public schemas, domain planning, transaction revalidation, and authoritative items/review state. Fix shared Inbox/query semantics without replacing workflow planners. |
| `service-worker.js` | Cache/version the additional static modules. Preserve existing same-origin scope and asset failure behavior. |

Use one coordinator for both adapters. Keep DOM code and the existing execution switch in `app.js`; extracting the whole application or creating a generic plugin/hook framework is outside this cycle. The host owns human intent and capabilities; model proposals, stored descriptions, reports, and transcript text cannot grant authority.

## Run, round, call, and child contracts

A run starts from a fresh human chat/UI instruction. An assistant round consists of one finalized proposal and its settled calls. Route, argument, reply, native feedback, and specialist prompts each count as inference stages. Continue resumes the same run ledger; it does not make an old request a new human authorization.

`Run` holds host `runId`, generation, original human request, selected transport, immutable choice snapshot, review boundary, counters, call outcomes, committed receipts, completed-write signatures, and its AbortController. A child additionally has host `childId`, `parentRunId`, role, scope, and snapshot signature. Browser call IDs are opaque correlation IDs, distinct from host IDs and write signatures.

| Object | Allowed states |
| --- | --- |
| Run | `created -> preparing -> running <-> awaiting_approval`; then `paused_budget` or `settled`. Continue may leave `paused_budget` after validating remaining budget/state. |
| Round | `projecting -> inferring -> finalized -> settling -> closed`; invalid/cancelled inference closes without dispatch. |
| Call | `proposed -> validated -> awaiting_approval -> dispatching -> settled`; read/granted calls may skip approval. Settled outcome is success, no-change, clarification, denied, cancelled, stale, failed, skipped, or uncertain. |
| Child | `admitted -> preparing -> inferring -> validating -> settled`; terminal outcome is report, invalid, stale, cancelled, timeout, failed, or budget exhausted. |

Run terminal reasons are completed, clarification, denial, cancellation, stale state, failure, uncertain effect, review transition/boundary, repeated proposal, or exhausted total budget. A paused segment is not successful completion. Outcome certainty and terminal reason are separate: a cancelled run can contain a committed write.

Events have `{type, runId, agentId, seq, time, roundId?, callId?, outcome?}`. Required types are run started/settled, inference started/settled, proposal finalized, approval requested/decided, dispatch started, effect committed, call settled, budget paused, and child admitted/settled. Validate identity/order and reject late inference/report/UI events. One reducer produces visible status and diagnostic records from these facts.

Each admitted call settles exactly once. Validate an entire native batch, including duplicate IDs and arguments, before its first dispatch. After a terminal sibling, account for every remaining native call as skipped and correlate all outcomes with their original ID/name. Non-executing final feedback may consume one remaining inference stage; it cannot reopen dispatch. If cancellation prevents feedback delivery, record that distinction locally.

## Budgets, Stop, and effects

Initial host policy is one active inference, serial page effects/approval cards, at most two live sessions (prepared base plus current worker), one child per run, no nesting. Child preparation replaces/releases any idle root worker before creating its fresh session. All owned sessions are destroyed in `finally`, including late-created sessions after cancellation.

Use explicit configurable constants: **24 inference stages, 18 dispatch attempts, 180 seconds of active work per run**, and the existing **six dispatches per segment**. Continue permits another segment within the original total limits. Count failed stages/attempts and fallback work; never reset completed signatures, receipts, or the item/review boundary. Pause active-work time while awaiting a human permission/draft decision. Deadline timers abort owned work when active time expires.

Bound admitted proposals and results independently: retain the current native 32-part admission bound and 8,000-character model result ceiling, with explicit truncation metadata. Report inference latency, total active duration, and unavailable usage as unknown. These values are prototype defaults, not Chrome quotas; change them only with recorded trials.

Record dispatch before awaiting WebMCP. Record `effect-committed` immediately after `mutate()` or `transitionReview()` resolves, before rendering, model feedback, or abort-generation checks can lose it. Include generic item writes/deletion as well as workflow/review receipts. The callback returns exactly one `{ok:true,data}` or `{ok:false,error:{code,message}}` envelope; parsing a transport result does not recursively unwrap arbitrary JSON strings.

Stop aborts inference, child preparation/inference, current invocation, and pending approval; it invalidates later proposals. A transaction receipt belonging to an already admitted dispatch is still retained/reported after Stop, even if the run reason remains cancelled. Aborting is never described as undo. Lost transport response after a dispatched write is uncertain unless a local committed receipt proves its outcome; no automatic replay follows.

Preserve immutable approved effects, transaction stale-target checks, deletion subtree confirmation, separate complete/skip approval, and stop-on-first denial/error/clarification. Successful item operations exclude review controls for the rest of that human request. Successful review transition ends dispatch. Permission grants remain in-memory, revocable, and tied to root chat policy.

## Deterministic context and catalogs

Project from authoritative current records and host outcomes; session memory is disposable. Native/bridge adapters consume the same role, request, current review, relevant facts, complete closed history, and verified current-run receipts. Stage-specific context carries route names/descriptions, the selected argument schema, or reply facts. Do not repeatedly append the entire transcript to a reused session.

Replace the last-six-message slice with a bounded selection of complete closed human/assistant turns; discard whole oldest turns to fit. Preserve the exact current request, negation, named titles, unresolved question, review boundary, and full current-run receipt facts outside this history allowance. Old user messages remain historical DATA, never executable instructions.

The standard model profile exposes semantic workflows, review, `list_items`, `read_item`, `show_view`, `create_item`, `update_item`, and `delete_item`. Omit redundant attribute and parent primitives from ordinary model routing; `update_item` supports those edits. Keep all public WebMCP tools registered and inspectable. A full catalog remains a diagnostic comparison, with identical host validation/permissions.

Keep readable closed enums and private ID mapping. Freeze aliases for the entire human run, including Continue; refresh executable descriptors before dispatch without rebuilding aliases against different records. New records become selectable on the next fresh human request. Duplicate semantic titles produce candidates/questions. Do not filter away a referenced task merely because it is outside the selected view.

Use separate public schema, model schema, and decoder projection. Name the compatibility projection instead of permanently declaring Chromium keywords unsupported. Keep the proven projection as default; retain useful parameter descriptions in a tested profile where creation/inference accepts them. Preserve the literal application field `description`, omitted-field meanings, exclusivity checks, exact title safeguards, and full callback validators.

Share an Inbox predicate: parentless, unfinished `Task`. Add explicit optional `scope:"inbox"` to `list_items` and use it in prompts; retain `parentId:null` as the documented generic root-record filter for compatibility. Response metadata states the applied scope/filters, total, and truncation. UI Inbox, specialist Inbox, and explicit scoped queries must agree.

Before inference, where available call `measureContextUsage` with the actual stage/options and record `contextUsage`/`contextWindow`. Reserve at least 25% of the reported window for output/results and uncounted schema overhead. Measurements are estimates where Chromium omits constraints. If over budget, remove oldest complete history and optional descriptive facts; never trim exact enum identities or the current request. If protected input still exceeds the allowance, ask for a narrower request without dispatch.

Feature-detect context methods/events; absence is unknown, not zero usage. A bounded serialized projection remains the fallback guard. Handle `contextoverflow` as a recorded failure requiring a fresh bounded session at a closed boundary, never a trigger to replay tools. Keep current reply bounds initially and measure soft concise guidance separately; no speculative prose-grammar change is required for this cycle.

## Readiness and proposal transport

Startup records secure context, required methods, text/English availability, text-session creation, IndexedDB open, and own-page registration/discovery as distinct stages. Preparation opens a **text-only** base session so an experimental native-tool creation failure cannot prevent bridge use. Only successful completion of every required stage shows workspace Ready.

Show normalized download progress only for finite valid progress events; otherwise show indeterminate download/preparation. At 100%, display "Download reported complete; preparing AI" until `create()` resolves. Cancellation says preparation stopped and Chrome-managed download may continue. Retry is user initiated; no crash/backoff retry storm.

Tools & diagnostics offers "Test native tool calls" and then "Use native proposals" only after success. When typed native interfaces are absent, disable the probe and show unsupported; ordinary bridge use needs no flag change or browser restart. A user gesture starts a separate bounded diagnostic run: full native options availability, tool-enabled creation, one `list_attributes` read-only call, actual own-page WebMCP invocation, exact correlated feedback, and final text. Accept only that tool and one valid finalized call; deny all other proposals without execution. Do not reuse the root chat grant or mutate records/review during the probe.

Canary limits are three inference stages, one read dispatch, and 30 seconds active time. Store pass/fail/unsupported/unknown per layer with date, options/schema profile, call-ID spelling, error name/message, and feedback stage. Constructor presence, text readiness, and a no-tool answer cannot mark the canary passed. Canary success is plumbing evidence; normal-language tool competence needs separate app trials.

Keep `callId` and observed legacy `callID` support, rejecting duplicates and ambiguous correlation. Keep the existing observed solitary empty-ID compatibility explicit in diagnostics. Native session-creation failure selects bridge before proposal/dispatch. A fresh first native inference failure permits one bridge fallback only when there are no finalized/pending calls, dispatches, continuation, cancellation, or uncertain effects. After that boundary, settle and inspect; never switch transport and replay.

Native readiness expires on reload/configuration changes or native contract failure. Transport changes are accepted only while idle and destroy obsolete sessions. Display actual selected transport and reason; JavaScript cannot reliably discover every Chrome flag, channel, or model version. Provide optional manually supplied build/channel/flag/model notes and show missing details as unknown. The researched flag expands to tool use, conversation backend, and model-selection parameter `v4`; it does not prove exact weights or native availability.

## One explicitly requested specialist

Implement one fresh-session **next-action reviewer** with two scopes: actionable Inbox or the currently selected Project and its Tasks. An "Ask reviewer" action presents the scope and sends a visible human request. It may also be invoked by an explicit human reviewer request when scope is unambiguous. Ordinary review guidance, model complexity, or a report cannot authorize child admission.

The host supplies a frozen bounded snapshot, readable references, parent/scope identity, and revision signature. Limit input to 40 records and 16,000 serialized characters; report omissions. No tool declarations, callback dispatch access, parent transcript cloning, write/review/navigation/approval grants, arbitrary code, network, or child-spawning interface reach this session. Use the prepared local text path and count creation/inference against root limits.

The model returns only `{observations:[{references:[enum],text}], suggestions:[{references:[enum],text}], questions:[text], limitations:[text]}`. The host attaches identity/revision; model actor fields and extra properties are rejected. Bound each array to ten entries, each text to 400 characters, references to the admitted snapshot, and serialized report to 6,000 characters. One inference stage and 30-second active deadline suffice initially; no automatic retry.

Validate shape, references, cancellation lineage, and current scope membership/record signature before accepting. An invalid/stale/timed-out report yields an honest no-change outcome. Accepted advice appears with "Reviewer suggestions; no changes made" and its evidence labels. Any suggested write requires a new human request through the ordinary root gates. Stop settles the child, destroys its session, and rejects late advice.

## Presentation, persistence, and migration

Use host facts for Preparing, Thinking, Awaiting permission, Running tool, Reviewing, Paused at limit, Stopped, Failed, and Finished. Activity retains exact arguments/results behind existing details. Saved summaries come from committed receipts, including partial success before a later failure. No-tool prose cannot create successful activity; suspicious unverified completion claims are replaced with a host no-change response. Label specialist advice distinctly from saved changes.

Keep an in-memory bounded event journal (latest 500 events, retaining active-run outcomes/receipts independently), with optional user-initiated diagnostic JSON download. Diagnostics can include local item text; do not upload or silently export it. Persist only preferences, existing history, items, and review position. This cycle adds no database version/store migration and makes no durable exactly-once claim.

Reload restores saved domain data and paused review as today; discard native readiness, grants, pending approvals/calls, continuation, and child jobs. It never resumes execution from history. Atomic durable operation receipts would require a separately designed domain transaction/migration; defer them while retaining inspectable local outcomes and explicit uncertainty after lost replies.

## Acceptance, evidence, and limits

1. Existing list editing, atomic capture/organization/status/shopping, stale-state, approval, repeated-write, review-boundary, continuation, and PWA checks pass. Additional modules load from relative URLs without a build and are included in the shell cache.
2. Deterministic tests prove reducer transitions, per-stage and aggregate limits, whole-batch admission/correlation, skipped siblings, receipt retention after Stop/render/inference failure, and no execution after terminal outcome. Include generic writes/review receipts, lost responses, and continuation totals.
3. Context tests preserve whole turns, literal titles/negation, frozen aliases, result certainty, exact enums and domain `description`; oversized protected input blocks dispatch. Inbox scoped queries/UI/specialist agree. Test duplicate names and injected record/report text.
4. Specialist tests show one explicit admission, zero page dispatches/writes/review changes, fresh bounded input, typed grounded references, no inherited grant, and rejection of stale/malformed/late reports. Parent Stop and total budgets settle child work.
5. Readiness fixtures cover every required stage, valid/invalid/absent progress, 100%-before-create, cancellation/late creation, native opt-in success/failure, and permitted pre-dispatch fallback. The production native gate remains intact.
6. Record actual Chrome contract observations and a full natural-language eleven-step app trial: capture distinct commitments, existing/new Projects, filing/Inbox moves, statuses, shopping, ambiguity, explicit review progression, requested reviewer, pause/reload/resume. Calendar data comes from the human. Include denial/cancellation and persisted-state verification.
7. Independent review reports fixture results, actual browser plumbing, and real model task outcomes separately, including case counts, interventions, inference failures/fallbacks, unauthorized effects, false claims, and latency excluding human wait. Platform failures are measured limitations, not reasons to weaken the gate or claim success.

Defer Summarizer compaction, Language Detector, rich/Markdown streaming, declarative forms, model critics, generic agent management, nested/background/concurrent agents, queues, durable replay, and cloud fallbacks. Deterministic projection addresses current context needs with fewer moving parts. Add optional APIs only after recorded pressure or a concrete workflow benefit justifies their preparation and contracts.

Residual risks are experimental native contracts/model crashes, unknown flags/weights, approximate context accounting, small-model semantic mistakes, injected stored text/advice, and lost-reply uncertainty across reload. Guards protect effects but do not prove understanding. The acceptance evidence must report these separately; a blocked bad proposal is a safety pass and a failed task attempt.

Design sources: [browser architecture](research/browser-agent-architecture.md), [Pi lifecycle](research/pi-agent-loop.md), [Pi specialist supervision](research/pi-subagents.md), [native flag/contracts](research/chrome-prompt-api-tool-use.md), [reference harnesses](research/chrome-reference-harness.md), [structured output](research/chrome-structured-output.md), [effective tools](research/webmcp-effective-tools.md), [session lifecycle](research/chrome-session-management.md), and [download UX](research/chrome-model-downloads.md). Their research pins establish design inputs; actual target-browser evidence remains part of implementation/review.
