# Reference Chrome harnesses: model calls, permission, page execution, and feedback

Research date: **2026-10-12**. This chapter follows the actual model↔tools paths in the **Example Agentic Chrome Extension**, then compares the separate **Model Context Tool Inspector**. It is source research: no extension was installed, no build or test was run, no browser was opened, and no local model or cloud account was used. Repository files and test source establish the inspected design and intended regression coverage; they do not establish runtime success on this machine.

The useful adaptation is a small application-owned loop: declare capabilities, receive finalized proposals, validate and obtain concrete permission, execute through page callbacks, return correlated facts, and continue within explicit limits. The reference extension demonstrates the separation between inference and page execution. It does not supply this prototype's domain validation, transaction receipts, review-step policy, or recovery guarantees. Follow [INTENT.md](../../INTENT.md), [DESIGN.md](../../DESIGN.md), and [AGENTS.md](../../AGENTS.md): keep the later implementation static, browser-only, local, and free of build or backend requirements.

## Sources and identities

| Source | Inspected revision | Commit date | What it is |
| --- | --- | --- | --- |
| [GoogleChromeLabs/webmcp-extension][E0] | `6f627070736a8ca451d5acb02b70f63a1e072f92` | 2026-10-08 | Example Agentic Chrome Extension: permission UI, per-tab chats, Node/provider and local Prompt API backends |
| [beaufortfrancois/model-context-tool-inspector][I0] | `ad93e8a27f2abea443af1d744c774b34f968c253` | 2026-10-12 | Independently inspected Inspector snapshot; manual execution, cloud Gemini text and Live |
| [Inspector gitlink snapshot][O0] | `c9fbf9a7314ebfbb3ddb539d707548788435f059` | 2026-10-02 | The Inspector revision referenced by the researched `webmcp-tools` collection |
| [Related EasyLanguageModel source][H0] | `web-ai-demos` at `d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c` | See [demo chapter](chrome-ai-demos.md) | Helper source at version 0.2.6; related evidence, not the extension's installed artifact |

The repositories are separate products. The screenshots referenced by this app's intent are from **webmcp-extension**, not from the Inspector. Neither README presents its project as an officially supported Google product. Their extension privileges, SDKs, install/build instructions, cloud features, and development test servers are example infrastructure; none becomes a dependency of this PWA. [Extension README][E1], [Inspector README][I1].

**Package boundary.** The pinned extension declares `easy-language-model: ^0.2.1`; its lock resolves **0.2.1**. The separately pinned `web-ai-demos/easy-language-model/package.json` says **0.2.6**. This chapter verifies the extension's adapter source and tests, and crosslinks the related [helper analysis](chrome-ai-demos.md#easylanguagemodel-wrapper-behavior-is-distinct-from-the-native-api). It does not assume the 0.2.6 source is byte-identical to the 0.2.1 npm package. Native `LanguageModel` does not implement the wrapper's `execute`, `onToolCall`, `onToolResponse`, `maxToolRounds`, `history`, or `compact` orchestration. [Extension package][E2], [lock][E3], [helper package][H1].

## Code map

| Concern | Extension source | Why it matters |
| --- | --- | --- |
| Main conversation/tool loop | [`useAgentSession.ts`][E4] | Permission, serial dispatch, activity, cancellation, ten-round cap |
| Backend routing | [`chatBridge.ts`][E5] | Same internal request/response shape; explicit device/server choice |
| Local adapter | [`promptApiBackend.ts`][E6] | Deferred helper callbacks, typed feedback, session replacement, history, retry, compaction |
| Tool declarations | [`toolEncoder.ts`][E7] | Frame-qualified names and schema projection |
| Permission policy | [`toolPermissions.ts`][E8] | Origin/tool/chat grant scoping; consequential confirmation |
| Result handling | [`toolResults.ts`][E9] | Character limit, spotlighting, catalog settling |
| Tab state | [`tabSessionStore.ts`][E10], [`useActiveTabTools.ts`][E11] | Chat owner, page metadata, discovery and navigation |
| Page transport | [`extensionBridge.ts`][E12], [`content.ts`][E13] | Extension IPC, frame dispatch, WebMCP execution and navigation results |
| Model instructions | [`shared/systemPrompt.ts`][E14] | Data/instruction boundary and backend-specific spotlight explanation |
| Server alternative | [`server.ts`][E15], [`tools.ts`][E16], [`providers.ts`][E17] | Provider inference, pending results, ephemeral history; page execution remains outside server |

## The outer loop owns execution

`handleSendPrompt` fixes the **conversation tab ID** at turn start, rejects an empty/busy composer, creates an AbortController and chat ID, records the user's message, and sends the current declarations through `sendChatTurn`. A running turn remains associated with that chat when the user changes active tabs. Its **working page tab ID** may change when a tool opens a new tab; those identities are deliberately distinct. [Main loop][E4], [tab store][E10].

The repeated exchange is:

```text
human message + current tool declarations → selected model backend
finalized text + functionCalls → extension agent loop
each call → locate descriptor → permission policy → page execution
outcomes → size/spotlight processing → correlated functionResponses
refresh and settle current page catalog
functionResponses + refreshed declarations → selected model backend
repeat until no calls, abort, failure, or round cap
```

Calls in a returned batch run **serially** with `await runToolCall(call)`. Text preceding calls becomes a chat message with the activity collected so far. After the batch, discovery is refreshed; the next inference uses updated declarations. Streaming text is provisional presentation; it does not itself trigger a tool. [Main loop][E4], [results/catalog settling][E9].

Missing tools become correlated errors before prompting or execution. Permission denial and page execution failure also become error responses. These errors do **not** stop the remaining calls in the batch or prohibit another model round. That is an example behavior, not this prototype's existing stop-on-denial/error/review-boundary policy. The extension has comments suggesting an intent critic and injection classifier at key boundaries; those comments are extension points, not implemented guards. [Call execution path][E4].

`MAX_TURNS = 10` caps outer **tool batches**, not individual calls, elapsed time, inference tokens, or effects. The local wrapper is configured with `maxToolRounds = 10` too. The outer loop itself does not emit a distinct budget-exhausted error when the cap is reached; remaining proposals require careful settlement by a later adapter. Navigation can rebuild the local helper session mid-turn, so do not infer that matching constants create one shared global model budget. [Outer limit][E4], [local options and continuation][E6].

## Local Prompt API: how callbacks pause and resume

The on-device path stays inside the extension/browser for inference; `chatBridge` does not call `/api/chat` in this mode. It passes the same internal `ChatTurnRequest`/`ChatTurnResponse` shape used by the server so the outer execution policy stays shared. A new local conversation receives a UUID if needed. Backend switching resets all tab chats using the backend that held each old conversation. [Routing][E5], [backend switching][E4].

`toPromptApiTools` converts declarations to `name`, `description`, and `inputSchema`. `createSession` attaches an `execute` callback for **the wrapper**, then the wrapper supplies declarations to native Prompt API. These callbacks are not the WebMCP execute functions. The adapter is a suspension boundary:

1. `onToolCall` records native call metadata in the current round.
2. The helper invokes `execute(args)`. `executeLater` stores deferred resolve/reject callbacks for that call and returns an unresolved promise.
3. A queued microtask collects callbacks for the round, captures any preceding text, marks `ranTools`, and resolves the adapter's next-step promise. The outer loop receives `functionCalls` while helper execution remains paused.
4. The outer loop performs permission and actual page execution, then sends `toolResponses` back into `sendOnDeviceChat`.
5. `recordResponses` correlates outcomes, records calls and results in the turn transcript, and gives unanswered calls explicit errors.
6. `settleCalls` resolves or rejects the deferred callbacks. The helper supplies native success/error content and continues the model stream. The next adapter step is another round or final text. [Deferred execution and settlement][E6].

This is genuine structured call/result orchestration in the inspected example; it is not parsing a model's prose for function names. It is also **not automatic browser execution** of WebMCP tools. The application remains in control of page execution. See [the native open-loop protocol and flag](chrome-prompt-api-tool-use.md) for the platform contract and current implementation limits.

The adapter also records calls the helper refuses without invoking `execute`, such as unknown/repeated calls or missing arguments. `onToolResponse` locates those by name and serialized arguments when necessary, adds their errors, and preserves them in a replay transcript. The extension tests cover this path with stubbed platform calls. Required-argument rejection must not be confused with complete domain/schema validation. [Adapter callbacks][E6], [adapter tests][T1], [helper validation limits](chrome-ai-demos.md).

## IDs, result values, and version drift

| Identity or shape | At the extension pin | Adaptation consequence |
| --- | --- | --- |
| Local native call field | `callID` | Historic example contract; current Chromium research uses `callId` |
| Outer protocol call field | `functionCalls[].id` / `functionResponse.id` | Preserve opaque correlation; keep separate from an item ID or effect operation ID |
| Page routing name | `_<frameId>_<toolName>` | Names distinguish same-named frame tools; they do not authenticate arguments or origin |
| Chat identity | UUID / backend `chatId` | Conversation routing, not mutation idempotency |
| UI/activity identity | Monotonic numeric IDs | Presentation identity, not execution receipts |

`recordResponses` matches by ID when both sides provide one, otherwise consumes same-name calls in order. Unmatched responses are ignored; remaining calls receive a missing-response error. Server `appendTurnMessages` similarly consumes responses once, prefers IDs, and uses same-name fallback only when one side lacks an ID. These fallbacks exist for imperfect example/protocol identities; they are unsuitable as authority or deduplication guarantees for list writes. [Local correlation][E6], [server correlation][E16].

The adapter reconstructs replay entries with `LanguageModelToolCall`, `LanguageModelToolSuccess`, and `LanguageModelToolError`, using `callID`. The pinned current [Chromium and proposal analysis](chrome-prompt-api-tool-use.md) documents `callId` and streaming differences. Do not copy this code's capitalization or stream expectations into new native code without a target-build canary. Constructor exposure alone is insufficient readiness evidence.

Object results are recursively stripped of `null`/`undefined`, including array entries, before the local native success wrapper is constructed. A nullish whole result becomes empty text. These are transport workarounds that can erase meaningful domain distinctions. Separately, content-script caught execution errors can be returned as JSON-stringified messages, which an outer caller can receive through the success path rather than a rejected promise. A future domain result should explicitly distinguish committed, denied, failed, stale and uncertain states before transport conversion. [Local response conversion][E6], [content-script reply paths][E13].

## Permissions: useful scoping, incomplete authority

The extension's policy evaluates page-supplied annotations in this order:

| Condition | Source behavior |
| --- | --- |
| `consequentialHint === true` | Always prompt; settings, read-only claims and stored grants cannot skip it |
| Sensitive-action alerts disabled | Skip ordinary permission prompt |
| Explicit `readOnlyHint === true` | Skip ordinary permission prompt |
| Eligible standing grant for this tool/origin/chat tab | Skip ordinary permission prompt |
| Otherwise | Ask Allow / Deny, offering session permission only where eligible |

Session grants are in-memory Set entries keyed with `JSON.stringify([origin, toolName, chatTabId])`. Empty origin/name is ineligible; iframe tools cannot receive or use top-origin standing grants; consequential tools never earn them. A plain Allow does not persist. Resetting one chat clears that tab's grants; panel unmount clears all. Stop aborts a pending permission promise and resolves it as denial. [Policy][E8], [permission lifecycle][E4], [policy/UI tests][T2].

After permission, the outer loop checks the working page's origin again. This catches an origin change while the decision was pending. It does not establish that a same-origin tool descriptor, argument meaning, record state, or page document remained unchanged. The permission prompt assembled here contains tool name, description, origin, consequential status and grant choices; it does not carry the full arguments or a concrete before/after domain effect. The subsequent source comment proposes an intent critic but does not implement one. [Permission/execution boundary][E4].

**Inference for this app:** preserve scoped, revocable grants as a useful concept, but retain callback validation, host-owned read/write classification and exact-effect approval. A page's `readOnlyHint`/`consequentialHint` is a hint, not proof. Before a write, validate immutable approved arguments and recheck the target revision/state inside the transaction. A catalog refresh must not silently change the meaning of an approved item choice. A specialist must not inherit the root's grant merely by sharing a tool name.

## Untrusted output and spotlighting

`applyTokenLimit` cuts an oversized string or JSON serialization to **8,000 characters**, then appends a warning. This is a character limit before spotlighting, not a native token count, complete message limit, or guaranteed fit in the remaining context. For structured values the truncation can yield a partial JSON **string**, changing the result shape. Base64 adds size. [Result limit][E9], [token-limit tests][T3].

Only descriptors explicitly marked `untrustedContentHint: true` are spotlighted. Server-bound data is UTF-8 base64; local data is fenced in plaintext. The system instructions say to extract facts and never follow directives inside page/tool output. The local fence is `untrusted-` plus the first eight UUID characters, shared through local histories until all chats are reset. Known closing markers in data are removed before wrapping. This is not a fresh full-strength secret per call, nor does the code establish secrecy against all page observation paths. [Spotlighting][E9], [fence lifecycle][E6], [shared instructions][E14].

The local adapter's comment explains that its model performed poorly at base64 decoding, motivating fencing. That is a source assertion about the example author's model experience, not a benchmark reproduced here or a guarantee that every local model follows delimiters. Encoding and markers are prompting techniques; they neither authenticate content nor neutralize all injection. The default leaves unmarked results plain, and declarations/descriptions also reach the model. Critics/classifiers mentioned in comments are not present. [Adapter explanation][E6], [declaration construction][E7], [spotlighting tests][T4].

**Inference for this app:** label all external/user-authored prose as data by host policy, preserve typed factual receipts outside that prose, constrain what callbacks can do, and test adversarial descriptions/results. A locally stored task title/description can contain instructions too. Keep result projection bounded and useful rather than blindly copying 8,000-character cuts. Treat sanitized rendering and execution authority as separate boundaries; the adapter disables helper sanitization because its UI renders text, which is not permission to insert model output as HTML later. [Wrapper options][E6], [streaming/rendering guidance](chrome-ai-guidelines.md).

## Catalog changes, frames, and navigation

Discovery starts in the top content script with `document.modelContext.getTools({ fromOrigins })`. The bridge obtains frame origins using extension webNavigation capabilities. Discovery reports descriptors plus annotations and a frame ID; changes are debounced by 100 ms. Frame-ID relay checks the response source window and has a two-second timeout. The encoder uses frame-qualified names, parses historic string schemas if necessary, and defaults malformed/non-object schema input to an empty object shape. That is compatibility handling, not permission or complete schema validation. [Content discovery][E13], [frame origins][E18], [encoder][E7].

`useActiveTabTools` accepts reports from top-frame content-script senders with a tab identity, files them under their source tab, follows tracked background chats, and clears stale tools on URL changes. Its sequence tracking avoids older async tab metadata replacing newer reports. The main loop's `toolsView` reads current store state rather than a frozen array. After each batch it requests discovery, waits for a new report plus 250 ms quiet, and gives up after two seconds, polling at 25 ms. This is bounded debounce-based observation; timeout returns the latest available list and does not prove registrations finished. [Discovery hook][E11], [settling][E9].

Before a page execution, `content.ts` rediscovers the descriptor by name and its `window`, then calls `document.modelContext.executeTool(tool, inputArgs)`. It retries JSON-string arguments only for errors beginning with the historic parse-error message. There is no domain validation here and no invocation signal supplied. As the [imperative API chapter](webmcp-imperative-api.md) explains, schema declarations and registered callbacks require separate validation.

The navigation branch is explicit example plumbing:

- A declarative tool targeting a named iframe may return null; the content script waits for that frame's load and reads its first `application/ld+json` script.
- A null response or a closed extension message channel leads `executeTabTool` to wait for content readiness and tool reports, then page load, and read JSON-LD from the next document.
- The bridge watches the original tab and tabs whose opener is the original tab. A new-tab destination changes the working tab via `onTabChanged`; subsequent tools/discovery can follow it while the chat UI remains on its original tab.
- Readiness/report waits use two-second timeouts; page load resolves after at most five seconds. Those timeouts do not reject as failed navigation. Same-origin iframe JSON-LD access can still fail when documents are cross-origin. [Page execution][E13], [navigation bridge][E12].

A script, null result, or closed channel does not prove a mutation succeeded or that retrieved JSON-LD is an authenticated receipt for the requested call. The reference matching strategy can also observe more than one candidate tab opened by the original tab; it is not a host-generated operation receipt. This prototype primarily owns its page and IndexedDB, so cross-document scraping and cross-tab continuation should remain out of the first implementation scope. Preserve direct transaction receipts and classify navigation/transport loss as uncertain until domain evidence resolves it.

## Session replacement, compaction, and retry

The local adapter holds one active EasyLanguageModel session in `current`, with completed histories saved in an in-memory Map keyed by chat ID. This **single-session choice is example policy**, not a demonstrated universal Chrome limit. The UI rejects a simultaneous on-device turn from a different tab. Switching between idle chats retires the previous session and replays the requested chat history. Sessions are reusable only when chat identity and serialized declarations match, no turn remains in progress, and the session is not stale. [Session state/reuse][E6], [concurrency gate][E4], [tab tests][T5].

Changed tools require a new session because declarations were supplied at creation. If a call changed the catalog mid-turn, `recordResponses` first records its outcome; `continueTurn` aborts the old helper stream, combines completed history with the current transcript, creates a replacement session, then supplies the already-recorded results. A note tells the model the page now has different tools. Calls/results are not redispatched merely to rebuild context. If the page now has **zero tools**, the current turn finishes on the old session, marks it stale, and the next human turn recreates a text-only session. This avoids replaying tool content into a no-tool session. [Continuation/replay paths][E6], [replacement tests][T1].

Compaction occurs **between turns after `contextoverflow`**, not at a preventative fill percentage. The next turn waits for the compaction promise. `session.compact()` and its optional summarizer/detector/download/status behavior belong to EasyLanguageModel. Reset during compaction triggers cleanup of an unowned replacement; failure is logged and the code expects helper history restoration. The extension displays `contextUsage`/`contextWindow` but does not implement proactive reservation for output or forthcoming tool results. [Compaction/context reporting][E6], [adapter compaction tests][T1].

The source rationale is that short messages summarize poorly and tool content remains large. This is a sensible example tradeoff, not universal Chrome overflow evidence. Consult [session management](chrome-session-management.md) and [compaction](chrome-session-compacting.md): current documentation/draft/implementation behavior must be checked on the target build. For this app, choose safe closed compaction boundaries, reserve space before dispatch, and preserve restrictions, pending decisions and effect facts outside summaries.

Recovery is deliberately effect-aware, but only at the adapter's transport boundary:

| Failure | Local adapter response | Limit |
| --- | --- | --- |
| `UnknownError`/`InvalidStateError` DOMException before calls were handed out | One fresh-session retry, excluding the explicit non-retryable error marker | Name-based source policy, not proof of why a browser failed |
| Quota failure before handed-out calls | Retry fresh session with earlier history reduced to text | Earlier tool facts can be lost from projection |
| Failure after calls handed out | Do not replay the original human request through this branch | `ranTools` means handed out, not a recorded committed effect |
| Quota failure while consuming already-returned tool results | Continue from recorded current turn/results, dropping older tool-result history | No second dispatch in this continuation path; facts still need independent storage |
| Error propagated to outer loop | Show error and end backend chat | No durable outcome journal or exactly-once contract |

These are source paths and stub regression tests, not evidence of real-model recovery. `ranTools` is conservatively set when calls reach the outer loop, even if denied or rejected there. It cannot say what committed. Destroying the old handle before a replacement succeeds also leaves a failure window. [Retry and rebuilding][E6], [outer catch][E4], [retry tests][T1].

## Stop, persistence, and recovery boundaries

Stop aborts model transport, clears pending permission/busy state, and preserves already streamed text and activity. Permission waiting observes that signal. The local stream combines the external signal with a per-turn controller; session retirement aborts/destroys the helper. Server transport passes its AbortSignal through fetch/streaming, and the Node server aborts provider generation when the client disconnects. [Stop/unmount][E4], [local stream][E6], [server transport][E19], [server cancellation][E15].

The actual page invocation is different: `executeTabTool` receives no AbortSignal; `content.ts` calls WebMCP without an invocation signal; navigation waits run independently. The outer loop checks abort **after** execution returns and can discard feedback. Thus Stop prevents later dispatch/model work but can leave an already-started page effect running or committed. Tool-cancel events are logged, not used as rollback. Preserve this distinction in the prototype's UI and effect ledger. [Bridge][E12], [content invocation/events][E13], [imperative cancellation](webmcp-imperative-api.md).

The tab store, local histories, grant Set and activity are memory state. They are not IndexedDB persistence or crash recovery. The server keeps at most 100 chats in an LRU-style Map; restart/eviction loses them, and orphan result submission receives an explicit conflict response. Its bounded in-memory logs are useful diagnostics and can contain prompts/page data; they are not atomic operation receipts. Reset can clear model memory and permissions without undoing an effect. [Tab store][E10], [local history][E6], [server history/logs][E15].

**Inference for this app:** keep canonical item/review data, projected context, UI transcript, permissions and execution facts distinct. Persist operation receipts atomically with IndexedDB mutations when recovery is needed. After reload, display known/uncertain outcomes and require fresh human input; do not restore an in-flight approval or replay a chat as runnable instructions. PWA caching does not make these extension or Prompt API sessions durable background agents.

## Server/cloud alternative: same policy loop, different transport

The extension's default is a Node server, not local Prompt API. `chatBridge` streams `/api/chat`; provider configuration supports Google, OpenAI, Anthropic and Ollama. API keys and provider selection live in the server configuration. Ollama may be local inference, but remains a separate service/runtime. A localhost Node endpoint is not proof that inference or page data remain on-device. [Routing][E5], [providers][E17], [README][E1].

`server/tools.ts` wraps page schemas in AI SDK declarations **without execute callbacks**. The provider therefore returns calls to the side panel; the server never executes page tools. `server.ts` streams text deltas as NDJSON and sends finalized call metadata, stores messages, and accepts correlated outcomes on the next request. `appendTurnMessages` settles dangling calls with errors before a new human message. This is useful protocol discipline, but no reason to add the Node/provider stack to this repository. [Server tools/history][E16], [server streaming][E15], [transport][E19].

## Separate Inspector: manual tools and cloud Gemini

The Inspector is a diagnostic extension with a tool table, JSON argument editor, manual execute button, Gemini text chat, and Gemini Live microphone mode. Its current `sidebar.js` imports `GoogleGenAI`, reads/stores an API key and model choice in localStorage, and can generate suggested user prompts by sending the catalog to the cloud. There is no local Prompt API adapter in these inspected paths. Microphone permission is media access, not approval of a page-tool effect. [Inspector sidebar][I2], [Live][I3], [README][I1].

Its text loop captures the current tab at prompt start, creates/reuses a Gemini chat, supplies frame-qualified function declarations, executes returned calls serially, sends `functionResponse` results/errors back, and repeats until the model gives no calls. Unlike the agentic extension, this path has no explicit round cap, per-call permission card, consequential gate, result size/spotlighting layer, or AbortSignal chain. Text-mode results correlate by function name; the Live path retains call IDs. The current catalog is read for each cloud request, but chat state is a shared sidebar variable rather than the agentic extension's per-tab conversation store. [Text execution/configuration][I2].

The Inspector's page bridge also handles null/navigation/JSON-LD and opener tabs. Its table displays annotation names; it does not implement the extension's permission policy from them. Its source still interpolates page tool names/form targets into selectors in `content.js`; the agentic extension compares tool-name values and uses `getElementsByName` instead. This is a concrete robustness difference to preserve in adaptation, not an exploit demonstrated by this research. [Inspector content][I4], [extension content][E13].

Gemini Live connects to a cloud live model, sends microphone audio, plays received audio, and executes native Gemini function requests through the same extension bridge. It enables server context-window compression and session resumption, tracks a resume handle, and reconnects when catalog hashes change. The hash includes frame ID/name/schema, not descriptions/annotations. After a tool changes the catalog, reconnection supplies a textual user request and call-result summary; this is contextual continuity, not a durable execution ledger or local Prompt API compaction. An interruption clears audio playback; stopping closes media/session resources and prevents sending late results but does not cancel an already-running page effect. [Live session/call/reconnection lifecycle][I3].

### Gitlink revision versus independent snapshot

The independent Inspector commit on 2026-10-12 removes string-schema/string-argument compatibility code and raises `minimum_chrome_version` to **155.0.8052.0**. At that pin, `inputSchema` is forwarded as an object, manual JSON is parsed in the sidebar, Gemini arguments pass as objects, and content execution directly calls `executeTool(tool, inputArgs)`. [Change commit][I5], [manifest][I6], [sidebar][I2], [content][I4].

The tools collection's 2026-10-02 gitlink has the same overall Inspector text/Live/navigation architecture, but serializes schemas for transport, sends argument JSON strings, parses those in `content.js`, and retries old string execution on its specific parse-error prefix. Comparing fetched trees shows changes in `content.js`, `sidebar.js`, `gemini-live.js`, `manifest.json`, and the frame/page1 fixtures. Do not cite today's object-only code as what the tools collection pinned. The current README/test comments still mention Chrome 150 while the manifest requires 155: source metadata and prose have drifted. [Older sidebar][O1], [older content][O2], [older Live][O3], [current tests][I7], [collection inventory](webmcp-tools.md).

## Tests inspected and what they establish

| Test source | Coverage found in source | Evidence limit |
| --- | --- | --- |
| [`promptApiBackend.test.ts`][T1] | Structured declarations, calls/results, streaming, refused calls, changed/zero catalogs, stopped turn, download/language/context UI, compaction/reset, tab histories/fence, pre-call retry and post-call non-replay | Native `LanguageModel` and typed result constructors are stubs; summarization/download/errors are controlled. Exercises host/helper orchestration, not local-model competence or current `callId` support |
| [`toolPermissions.test.ts`][T2] | Read-only/default/settings rules, per-origin/tool/tab grants, iframe and consequential exclusions, allow-once/session decisions, UI/reset | Policy and rendered component regression intent; page annotations still originate outside host trust |
| [`tokenLimits.test.ts`][T3], [`spotlighting.test.ts`][T4] | Payload truncation, marked/unmarked handling, base64 and description projection; local fence lifecycle is covered in the adapter tests | Transform correctness, not injection resistance of an actual model |
| [`tabSessions.test.ts`][T5] | Tab-specific permission/chat UI, pinned dispatch, background turns, new-tab movement, close/reset, denial, missing tool, shared-model gate, Stop | Stubbed model/network/Chrome behaviors; no atomic effect or crash-recovery proof |
| [`toolReload.test.ts`][T6], [`contentScript.test.ts`][T7] | Name/frame encoding, changing catalogs, navigation retrieval, and annotation forwarding | Mocked bridge/DOM boundaries; compatibility paths are version-specific |
| [`chatAndToolExecution.smoke.test.ts`][T8] and [`chromeHarness.ts`][T9] | Bundled extension in Chrome against page tools, result correlation, UI activity/streaming and exactly-one fixture dispatch | Model replies are enqueued by a local test server. Native WebMCP/UI integration can be tested without real local or cloud inference |
| [Inspector `test/e2e.mjs`][I7] | Manual top/iframe tools, badges, form iframe/same-tab/new-tab navigation, empty catalog and console errors | Uses real enabled Chrome messaging/page paths with sidebar-as-tab query shim; does not exercise Gemini or local Prompt API |

Tests were **read, not run**. Presence of a passing test assertion is an intended contract, not a recorded pass here. Particularly useful later cases are delayed permissions during navigation, missing result IDs, aborted execution with a committed effect, same-named frame tools, and catalog changes after one completed call. Those must be expanded with this app's exact-effect and no-replay policies.

## Selective adaptation for this prototype

Use the reference code as a source map, keeping these recommendations explicitly separate from implemented behavior:

1. **One trusted host loop.** Share policy/domain execution across a native Prompt API adapter and existing constrained proposal adapter. Model output stays a proposal until finalized, validated and permitted. No backend switching or fallback after effects/pending results.
2. **One active local inference initially.** Treat it as a resource policy. Track total inference stages, tool dispatches, rounds, elapsed time, pending approvals, context reserve and result size independently; helper caps alone are insufficient.
3. **Strict correlated settlement.** Record every finalized call and one typed outcome, including denied/skipped/stale siblings. Preserve opaque native IDs and independent host operation identity. Do not infer a write from final narration or a tool-result string.
4. **Concrete permissions.** Show readable target, immutable arguments and the proposed effect. Host classification, callback validation and post-approval transaction checks remain mandatory. Stop the current turn at this app's denial/error/review boundary.
5. **Catalog freshness without retargeting.** Refresh own-page tools at safe boundaries; preserve frozen readable item choices for each proposal. Reject stale descriptors/targets; rebuild context after catalog change without re-executing completed work.
6. **Cancellation with effect facts.** Link model/tool invocation signals where the verified API permits; close pending approvals and reject late events. Aborting cannot roll back a committed IndexedDB transaction. Preserve its receipt even if later inference fails.
7. **Small context projection.** Use typed bounded results, preserve canonical facts outside session memory, compact only at closed boundaries, and keep optional Summarizer/Detector preparation separate from required startup. Verify native capitalization, stream shapes and quota behavior on the actual build.
8. **Evidence-separated evaluation.** Deterministic fixtures test host decisions; browser integration tests verify platform plumbing; recorded real local-model conversations test task understanding and injection resistance. None substitutes for the others.

Do not port React/esbuild, Node/provider APIs, API-key handling, Gemini Live audio, broad extension permissions, cross-tab execution, JSON-LD scraping, or automatic retries wholesale. The app needs a local list manager and guided review with inspectable effects. [Proposed browser architecture](browser-agent-architecture.md), [tool-design evaluation](webmcp-effective-tools.md), and [next actions](../../nextactions.md) supply the later design/implementation sequence.

## Pinned primary references

[E0]: https://github.com/GoogleChromeLabs/webmcp-extension/tree/6f627070736a8ca451d5acb02b70f63a1e072f92
[E1]: https://github.com/GoogleChromeLabs/webmcp-extension/blob/6f627070736a8ca451d5acb02b70f63a1e072f92/README.md
[E2]: https://github.com/GoogleChromeLabs/webmcp-extension/blob/6f627070736a8ca451d5acb02b70f63a1e072f92/package.json
[E3]: https://github.com/GoogleChromeLabs/webmcp-extension/blob/6f627070736a8ca451d5acb02b70f63a1e072f92/package-lock.json
[E4]: https://github.com/GoogleChromeLabs/webmcp-extension/blob/6f627070736a8ca451d5acb02b70f63a1e072f92/extension/sidepanel/hooks/useAgentSession.ts
[E5]: https://github.com/GoogleChromeLabs/webmcp-extension/blob/6f627070736a8ca451d5acb02b70f63a1e072f92/extension/sidepanel/services/chatBridge.ts
[E6]: https://github.com/GoogleChromeLabs/webmcp-extension/blob/6f627070736a8ca451d5acb02b70f63a1e072f92/extension/sidepanel/services/promptApiBackend.ts
[E7]: https://github.com/GoogleChromeLabs/webmcp-extension/blob/6f627070736a8ca451d5acb02b70f63a1e072f92/extension/sidepanel/services/toolEncoder.ts
[E8]: https://github.com/GoogleChromeLabs/webmcp-extension/blob/6f627070736a8ca451d5acb02b70f63a1e072f92/extension/sidepanel/services/toolPermissions.ts
[E9]: https://github.com/GoogleChromeLabs/webmcp-extension/blob/6f627070736a8ca451d5acb02b70f63a1e072f92/extension/sidepanel/services/toolResults.ts
[E10]: https://github.com/GoogleChromeLabs/webmcp-extension/blob/6f627070736a8ca451d5acb02b70f63a1e072f92/extension/sidepanel/services/tabSessionStore.ts
[E11]: https://github.com/GoogleChromeLabs/webmcp-extension/blob/6f627070736a8ca451d5acb02b70f63a1e072f92/extension/sidepanel/hooks/useActiveTabTools.ts
[E12]: https://github.com/GoogleChromeLabs/webmcp-extension/blob/6f627070736a8ca451d5acb02b70f63a1e072f92/extension/sidepanel/services/extensionBridge.ts
[E13]: https://github.com/GoogleChromeLabs/webmcp-extension/blob/6f627070736a8ca451d5acb02b70f63a1e072f92/extension/content.ts
[E14]: https://github.com/GoogleChromeLabs/webmcp-extension/blob/6f627070736a8ca451d5acb02b70f63a1e072f92/shared/systemPrompt.ts
[E15]: https://github.com/GoogleChromeLabs/webmcp-extension/blob/6f627070736a8ca451d5acb02b70f63a1e072f92/server/server.ts
[E16]: https://github.com/GoogleChromeLabs/webmcp-extension/blob/6f627070736a8ca451d5acb02b70f63a1e072f92/server/tools.ts
[E17]: https://github.com/GoogleChromeLabs/webmcp-extension/blob/6f627070736a8ca451d5acb02b70f63a1e072f92/server/providers.ts
[E18]: https://github.com/GoogleChromeLabs/webmcp-extension/blob/6f627070736a8ca451d5acb02b70f63a1e072f92/extension/frameOrigins.ts
[E19]: https://github.com/GoogleChromeLabs/webmcp-extension/blob/6f627070736a8ca451d5acb02b70f63a1e072f92/extension/sidepanel/services/backendBridge.ts
[T1]: https://github.com/GoogleChromeLabs/webmcp-extension/blob/6f627070736a8ca451d5acb02b70f63a1e072f92/tests/extension/promptApiBackend.test.ts
[T2]: https://github.com/GoogleChromeLabs/webmcp-extension/blob/6f627070736a8ca451d5acb02b70f63a1e072f92/tests/extension/toolPermissions.test.ts
[T3]: https://github.com/GoogleChromeLabs/webmcp-extension/blob/6f627070736a8ca451d5acb02b70f63a1e072f92/tests/extension/tokenLimits.test.ts
[T4]: https://github.com/GoogleChromeLabs/webmcp-extension/blob/6f627070736a8ca451d5acb02b70f63a1e072f92/tests/extension/spotlighting.test.ts
[T5]: https://github.com/GoogleChromeLabs/webmcp-extension/blob/6f627070736a8ca451d5acb02b70f63a1e072f92/tests/extension/tabSessions.test.ts
[T6]: https://github.com/GoogleChromeLabs/webmcp-extension/blob/6f627070736a8ca451d5acb02b70f63a1e072f92/tests/extension/toolReload.test.ts
[T7]: https://github.com/GoogleChromeLabs/webmcp-extension/blob/6f627070736a8ca451d5acb02b70f63a1e072f92/tests/extension/contentScript.test.ts
[T8]: https://github.com/GoogleChromeLabs/webmcp-extension/blob/6f627070736a8ca451d5acb02b70f63a1e072f92/tests/smoke/chatAndToolExecution.smoke.test.ts
[T9]: https://github.com/GoogleChromeLabs/webmcp-extension/blob/6f627070736a8ca451d5acb02b70f63a1e072f92/tests/smoke/chromeHarness.ts
[I0]: https://github.com/beaufortfrancois/model-context-tool-inspector/tree/ad93e8a27f2abea443af1d744c774b34f968c253
[I1]: https://github.com/beaufortfrancois/model-context-tool-inspector/blob/ad93e8a27f2abea443af1d744c774b34f968c253/README.md
[I2]: https://github.com/beaufortfrancois/model-context-tool-inspector/blob/ad93e8a27f2abea443af1d744c774b34f968c253/sidebar.js
[I3]: https://github.com/beaufortfrancois/model-context-tool-inspector/blob/ad93e8a27f2abea443af1d744c774b34f968c253/gemini-live.js
[I4]: https://github.com/beaufortfrancois/model-context-tool-inspector/blob/ad93e8a27f2abea443af1d744c774b34f968c253/content.js
[I5]: https://github.com/beaufortfrancois/model-context-tool-inspector/commit/ad93e8a27f2abea443af1d744c774b34f968c253
[I6]: https://github.com/beaufortfrancois/model-context-tool-inspector/blob/ad93e8a27f2abea443af1d744c774b34f968c253/manifest.json
[I7]: https://github.com/beaufortfrancois/model-context-tool-inspector/blob/ad93e8a27f2abea443af1d744c774b34f968c253/test/e2e.mjs
[O0]: https://github.com/beaufortfrancois/model-context-tool-inspector/tree/c9fbf9a7314ebfbb3ddb539d707548788435f059
[O1]: https://github.com/beaufortfrancois/model-context-tool-inspector/blob/c9fbf9a7314ebfbb3ddb539d707548788435f059/sidebar.js
[O2]: https://github.com/beaufortfrancois/model-context-tool-inspector/blob/c9fbf9a7314ebfbb3ddb539d707548788435f059/content.js
[O3]: https://github.com/beaufortfrancois/model-context-tool-inspector/blob/c9fbf9a7314ebfbb3ddb539d707548788435f059/gemini-live.js
[H0]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/easy-language-model
[H1]: https://github.com/GoogleChromeLabs/web-ai-demos/blob/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/easy-language-model/package.json
