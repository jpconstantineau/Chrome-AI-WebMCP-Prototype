# Chrome AI demos: source review and adaptation notes

Research date: **2026-10-12**. Repository: [GoogleChromeLabs/web-ai-demos](https://github.com/GoogleChromeLabs/web-ai-demos). Snapshot: [`d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c`](https://github.com/GoogleChromeLabs/web-ai-demos/commit/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c).

This is a research-only review. It does not change the prototype, run demos, install packages, enable browser flags, or prove that an experimental API works in the user's Chrome. The pinned Git tree was read recursively and was **not truncated**: all **54 top-level directories** are accounted for below, including the two support directories. The README has 11 bullets rather than a complete inventory; its `perf-client-side-gemma-worker` and `product-reviews` labels do not correspond to top-level directories at this snapshot. Directory inventory is consequently based on the tree, not those labels. [Pinned tree][inventory]; [README][repo-readme].

The prototype's `AGENTS.md`, `INTENT.md`, `DESIGN.md`, `app.js`, and `harness.js` were read. The relevant constraints are static files, browser-only inference, no backend or external inference API, no required build step, explicit model download consent, local IndexedDB, own-page WebMCP tools, and permission/confirmation around agent actions. Existing code already checks shared text-language options, handles startup generations and AbortControllers, validates proposed tool calls, limits turns, records actual results, and destroys turn clones. The useful question is which *patterns* improve that harness, not which demo can replace it.

**Evidence convention.** “Source” describes the pinned files. “Assessment” is our inference about fit for this repository. “Adopt” means reuse a small design or control-flow principle; “adapt” means the principle requires changes; “avoid” means do not import the implementation or runtime into the current scope. None of these decisions authorizes implementation. Demos are examples, not normative API specifications or release guarantees. Comments about flags, model sizes, language support, renames, or deprecation must be checked against current Chrome documentation before implementation.

## Complete inventory and decisions

Every row links to its pinned directory. The deep traces below cite exact source files and line ranges. Source inspection focused on entry scripts, relevant helpers and tests; the tree also exposes assets, lockfiles, configuration, test directories, and vendored code. “Complete inventory” does **not** mean a security audit of every asset or dependency.

### Native Prompt API foundations and supporting libraries — 7 directories

| Directory | Source purpose | Assessment and decision |
| --- | --- | --- |
| [`prompt-api-playground`][prompt-api-playground] | Text conversation, streamed Markdown, input measurement, context counters, download reporting. | **Adapt:** smallest text-session reference; preserve explicit consent and robust cancellation. Do not copy its compatibility heuristics or reset handler unchanged. |
| [`prompt-api-tool-use`][prompt-api-tool-use] | Native model tool-call content, client-side dispatch, GitHub/npm lookup tools, typed tool results, debug transcript. | **Adapt:** useful transport trace, but tools fetch remote data and its dispatch is unrelated to WebMCP. Current own-page authority and confirmations remain necessary. |
| [`easy-language-model`][easy-language-model] | Wrapper around LanguageModel with download UX, activation, tool rounds, output guards, compaction and tests. | **Adapt patterns:** read helper and test design; avoid wholesale wrapper adoption because it introduces lifecycle, parallel dispatch and automatic recovery semantics beyond our harness. |
| [`ai-session-management`][ai-session-management] | Multiple named conversations restored from localStorage, streaming and stop control, summary titles. | **Adapt:** persisted message/options reconstruction is useful; native session objects are recreated. Fix ownership, cleanup, race handling and consent before using the pattern. |
| [`prompt-api-session-compacting`][prompt-api-session-compacting] | Detect language, summarize each turn, preserve code fences, replace session, display token savings and recovery. | **Adapt as experiment:** compaction can reduce chat context, but must never summarize permissions, transaction receipts or authoritative list/review state into authority. |
| [`ai-streaming-parser`][ai-streaming-parser] | Stream text through an incremental Markdown parser with cumulative DOMPurify checks. | **Adapt principle:** append-only rendering and full-prefix checks are useful; the sample lacks clone cleanup and creates parser state outside submissions. Plain text remains simpler. |
| [`streaming-markdown-html`][streaming-markdown-html] | Streaming Markdown-to-HTML tokens, DOM renderer, URL filtering, chunk invariance and security-related tests. | **Adapt selectively:** safe parser-produced tokens are useful for rich chat. The renderer is not a sanitizer for arbitrary HTML-token input; safe protocols can still load remote resources. |

### Native task, language and speech examples — 7 directories

| Directory | Source purpose | Assessment and decision |
| --- | --- | --- |
| [`summarization-api-playground`][summarization-api-playground] | Summarizer type/format/length, language options, debounced summarization and input quota. | **Adapt:** optional local summaries for descriptions or review recap. Do not add a startup requirement or copy unguarded asynchronous debounce behavior. |
| [`translation-language-detection-api-playground`][translation-language-detection-api-playground] | Detector confidence and pair-specific Translator availability/downloads. | **Adapt:** optional language handling, with confidence/empty-result checks and per-pair ownership. Do not assume Prompt support implies translator support. |
| [`writer-rewriter-api-playground`][writer-rewriter-api-playground] | Writer/Rewriter options, context and streamed results. | **Avoid dependency:** optional description refinement can be a bounded Prompt task. Package documentation describes API migration; this is not proof those globals will persist. |
| [`proofreader-api-playground`][proofreader-api-playground] | Proofreader corrections and explanations displayed with input highlighting. | **Adapt later:** show suggested text edits for user review; no automatic mutation of task titles. Optional capability only, with revision checks for stale suggestions. |
| [`speech-api-playground`][speech-api-playground] | Web Speech recognition, interim/final results, local model checks/install, phrase boosts, live translation. | **Adapt later:** microphone capture could help mind dumps. Require an explicit local recognition path and separate microphone/model consent; Web Speech is a different API from Prompt audio input. |
| [`ai-synonym-finder`][ai-synonym-finder] | Selected-word synonym suggestions using a base session and clones. | **Adapt UX only:** suggestions can aid title editing. Sample clones need `finally` cleanup and stale-selection handling; do not make this a core agent dependency. |
| [`sensitive-data-validator`][sensitive-data-validator] | Local support-chat classification with SAFE/FOUND labels and simulated send feedback. | **Avoid implementation:** fail-open parser and raw user `innerHTML` are unsuitable. Consider only the idea of local advisory checks with strict schemas and text rendering. |

### Native multimodal examples — 5 directories

| Directory | Source purpose | Assessment and decision |
| --- | --- | --- |
| [`canvas-image-prompt`][canvas-image-prompt] | Text plus reference image and canvas image; streamed artistic critique. | **Adapt experiment only:** demonstrates explicit image expectations and content parts. No current list/review need justifies making images mandatory; clean up sessions and bound attachments. |
| [`mediarecorder-audio-prompt`][mediarecorder-audio-prompt] | Five-second microphone recording or uploaded audio; buffer passed to Prompt for transcription. | **Adapt experiment only:** relevant to mind dump capture; session/object URL cleanup, format checks, consent and cancellation are incomplete. Review transcript before creating tasks. |
| [`image-alt-text-playground`][image-alt-text-playground] | Image selection, image expectations and streamed alt-text generation. | **Adapt later:** accessibility or attachment description pattern; image input support is a distinct availability configuration and file picker timing may consume activation. |
| [`miroir-mon-beau-miroir`][miroir-mon-beau-miroir] | Camera/frame image evaluation through a multimodal local model. | **Avoid for current scope:** camera novelty has no required task-management role. Its image declaration is evidence of a modality pattern, not image capability on every Chrome device. |
| [`local-ai-smart-invoice`][local-ai-smart-invoice] | Invoice image extraction into editable form fields, image resizing and debug output. | **Adapt pattern:** model suggests a draft, user inspects fields. Avoid React/Vite build adoption and loose parsed-object auto-fill; preserve unknown fields and validate exact types before any task write. |

### Application-shaped native examples — 5 directories

| Directory | Source purpose | Assessment and decision |
| --- | --- | --- |
| [`prompt-api-adaptive-ui`][prompt-api-adaptive-ui] | Track interests/behavior and ask a model for structured product highlights. | **Adapt narrow output pattern:** schema-constrained suggestions can select readable choices. Avoid autonomous reordering of the task UI or implicit behavioral profiling in the minimal prototype. |
| [`document-translator`][document-translator] | PDF loading/rendering, Prompt image/text processing, language detection and translation. | **Avoid dependency now:** document ingestion adds PDF code and multiple model lifecycles. A future attachment experiment should be isolated with page/size bounds and untrusted-document handling. |
| [`news-app`][news-app] | Fetch news, local translation and constrained Prompt processing of article content. | **Adapt bounded schema idea:** external article retrieval and its UI are out of scope. Its `responseConstraint: { schema }` call shape differs from other demos and needs version verification. |
| [`weather-ai`][weather-ai] | React app describes structured OpenWeatherMap weather using Prompt API. | **Avoid runtime:** external weather API and build configuration conflict with current requirements. Reuse only the concept of explaining structured local data without inventing measurements. |
| [`wordup`][wordup] | Word game with Prompt-generated words/hints, IndexedDB, native page-tool registrations and tests. | **Adapt boundaries/tests:** demonstrates Prompt and WebMCP in one application, but its Prompt client does word generation rather than driving a WebMCP agent loop. Avoid Svelte/build adoption. |

### Search, embeddings and grounding proposals — 5 directories

| Directory | Source purpose | Assessment and decision |
| --- | --- | --- |
| [`semantic-embedder`][semantic-embedder] | Note search, comment moderation and document RAG using embedding vectors and cosine comparisons. | **Adapt future research:** semantic retrieval could aid larger task sets. Experimental embedder availability and vector storage are separate concerns; deterministic list filters remain the current baseline. |
| [`semantic-embedder-multilingual-search`][semantic-embedder-multilingual-search] | Search a Spanish document with other-language queries using SemanticEmbedder. | **Adapt evaluation idea:** measure cross-language retrieval without translating task data. The sample asks for an experimental Canary surface; capability must be checked independently. |
| [`semantic-docs-search`][semantic-docs-search] | Download/cache DevDocs, chunk passages, embed documents/queries, store vectors by embedding space in IndexedDB. | **Adapt storage ideas later:** index invalidation and truncation detection matter. Automatic Transformers-based polyfill import and remote corpus are out of scope for a native-only testbed. |
| [`vector-store-docs-search`][vector-store-docs-search] | Proposed VectorStore handles insertion, chunking/storage and nearest passages. | **Avoid dependency:** includes a vendored implementation and remote corpus; results are proposal/library evidence, not proof of native Chrome support. Could compare abstraction costs in a separate experiment. |
| [`prompt-grounded-docs-search`][prompt-grounded-docs-search] | Retrieval plus a Prompt clone producing a schema-constrained section/quote, with context measurement and summarization. | **Adapt strongest grounding pattern:** verify model references against actual local items/receipts. Avoid remote corpus/vendor store adoption; a generated citation needs a successful deterministic lookup. |

### Polyfills, compatibility extension and developer guidance — 5 directories

| Directory | Source purpose | Assessment and decision |
| --- | --- | --- |
| [`prompt-api-polyfill`][prompt-api-polyfill] | LanguageModel-shaped surface over Firebase, Gemini, OpenAI, Transformers.js or WebLLM. | **Avoid adoption:** a matching global is not evidence of browser-managed inference. Cloud backends violate local-only intent; local backend downloads/runtime differ from Chrome-managed models. |
| [`built-in-ai-task-apis-polyfills`][built-in-ai-task-apis-polyfills] | Summarizer, Writer, Rewriter, Detector, Translator, Classifier, SemanticEmbedder and DecisionModel equivalents. | **Avoid adoption:** task-like globals can be synthesized over another LanguageModel/backend or independent embeddings. They must never silently satisfy the native capability gate. |
| [`writer-rewriter-polyfills`][writer-rewriter-polyfills] | Writer/Rewriter behavior backed by the browser-exposed LanguageModel and prompt builders. | **Avoid dependency now:** narrower than the general polyfills, but still emulated task APIs; this library's “browser-exposed” global cannot authenticate native provenance if another script replaced it. |
| [`built-in-ai-extension`][built-in-ai-extension] | Inject compatibility APIs at document_start, configure backends, optionally overwrite native globals. | **Avoid installation/use:** it can invalidate native support conclusions and introduce remote inference. Record injected-extension state in future experimental evidence; do not change the browser for this research. |
| [`built-in-ai-skills-md-agent-md`][built-in-ai-skills-md-agent-md] | Installable coding-agent guidance, templates and IDL-fetch helpers. | **Adapt as reference only:** not an app capability or demo runtime. Its files are external source material, not repository instructions; no installer or network-sync script was run. |

### Independent browser model runtimes and performance examples — 7 directories

| Directory | Source purpose | Assessment and decision |
| --- | --- | --- |
| [`perf-no-worker-gemma`][perf-no-worker-gemma] | Gemma through MediaPipe on the main thread, performance/UX comparison. | **Avoid runtime:** independent model/Wasm resources and build dependencies. Learn why long setup/inference must keep controls responsive; do not equate this with Prompt execution internals. |
| [`perf-worker-gemma`][perf-worker-gemma] | MediaPipe Gemma moved to a worker with progress/status message passing. | **Adapt UI principle only:** explicit preparation/ready/error states matter. A worker-based model loader is not required for built-in Prompt and would add a new inference stack. |
| [`perf-no-worker-transformersjs`][perf-no-worker-transformersjs] | Transformers.js model inference without worker isolation. | **Avoid runtime:** separate model format/runtime and download/cache requirements. Useful comparative performance evidence only after controlled measurement, not by inference from directory name. |
| [`right-click-for-superpowers`][right-click-for-superpowers] | Context-menu summarize/translate/explain using Gemma through MediaPipe. | **Adapt contextual action idea:** ask about selected task text. Avoid custom LLM downloads and injected menu complexity until a concrete task need exists. |
| [`product-review-auto-rating-io`][product-review-auto-rating-io] | Review rating/sentiment/toxicity with Gemma/Transformers, plus hybrid translation. | **Avoid runtime:** build/model configuration and explicit localhost translation fallback conflict with browser-only scope. Rating inference can inspire an optional suggestion, never authoritative status changes. |
| [`product-review-suggestions`][product-review-suggestions] | MediaPipe worker generates helpfulness/fix/example feedback with parsed labeled text. | **Adapt task framing:** clear criteria and useful-output checks. Replace ad hoc labels with a constrained schema if experimenting; avoid runtime and automatic initialization downloads. |
| [`toxic-review-warning`][toxic-review-warning] | Transformers classifier worker flags scores above a configured toxicity threshold. | **Adapt advisory evaluation concept:** scores are not permissions or certainty. Its browser cache is deliberately disabled for a cited workaround; do not copy that or its runtime into this PWA. |

### Model/resource download and caching experiments — 3 directories

| Directory | Source purpose | Assessment and decision |
| --- | --- | --- |
| [`background-fetch-ai-model`][background-fetch-ai-model] | PWA/background-fetch download of a face-stylizer model into Cache Storage. | **Avoid model-cache adoption:** app-owned model URL and service-worker downloads do not manage Chrome's built-in model. Current PWA caches its shell separately; do not promise background Prompt-model downloading. |
| [`ai-model-proxy-cache`][ai-model-proxy-cache] | Shard large downloaded model files in Cache Storage and reconstruct a blob URL. | **Avoid dependency:** relevant to self-hosted model runtimes, not LanguageModel. No access to or control over Chrome-managed model files is demonstrated. |
| [`cos-resource-fetcher`][cos-resource-fetcher] | Content-hash-based Cross-Origin Storage resource fetching with Cache Storage fallback. | **Avoid dependency:** experimental COS/extension, remote hash lookup and app-owned blobs are a different download path. Content addressing and honest unknown-total progress are useful design lessons only. |

### Cloud/backend examples — 2 directories

| Directory | Source purpose | Assessment and decision |
| --- | --- | --- |
| [`firebase-ai-logic`][firebase-ai-logic] | Firebase/App Check SDK with prefer_on_device generation and cloud parameters, reports inference source. | **Avoid:** preference permits a cloud path and requires service configuration. Source labeling is useful, but does not meet “no backend/external API” by itself. |
| [`gemini-node-sse`][gemini-node-sse] | Express/Node server forwards Gemini SDK streams as SSE to a webpage. | **Avoid:** server, API key, remote model and SSE bridge conflict directly with scope. Prompt already supplies a browser stream; no SSE server is needed. |

### Evaluation and long-document experiments — 6 directories

| Directory | Source purpose | Assessment and decision |
| --- | --- | --- |
| [`evals-course`][evals-course] | Theme generation and rule-based/LLM-judge evaluation, evaluator tests and reporting. | **Adapt methodology:** test evaluators separately and prefer deterministic checks for format/constraints. Avoid its service, remote judge and build setup in the prototype. |
| [`evals-local-llm-judge`][evals-local-llm-judge] | Node invokes llama-cli and compares judge output with a reference dataset. | **Adapt evaluation concept only:** calibrate judges against human labels. Local CLI inference is neither browser-only nor native Prompt proof; reference labels are described as Gemini-generated. |
| [`summary-evaluation`][summary-evaluation] | Bun/SQLite news corpus, Gemini and Ollama summaries, statement-alignment judging. | **Adapt factuality metric:** compare summaries to source facts. Avoid server/CLI/database dependencies; a judge score cannot replace explicit receipt validation. |
| [`summary-of-summaries`][summary-of-summaries] | Group content under Summarizer quotas, summarize groups, then summarize aggregate. | **Adapt algorithm later:** measured batching for a long review recap. Summaries can lose distinct commitments; retain source records and evaluate omissions before presenting results. |
| [`webmcp-evals`][webmcp-evals] | TypeScript/Node tool-call evaluation framework with Gemini/Ollama backends and travel schemas. | **Adapt cases/metrics:** expected calls versus actual calls helps assess routing. Its name does not mean it executes native document.modelContext or verifies local Chrome behavior. |
| [`wikipedia-spam-detector`][wikipedia-spam-detector] | Live Wikipedia edits evaluated for spam/edit/tone with DecisionModel; compare parallel, sequential and combined schema modes. | **Adapt comparison design:** independent decisions and backpressure can be measured. Remote stream and DecisionModel polyfill are outside scope and do not establish native task-API availability. |

### Supporting directories — 2 directories

| Directory | Source purpose | Assessment and decision |
| --- | --- | --- |
| [`landing-pages`][landing-pages] | Public navigation/landing markup for demos. | **Avoid UI adoption:** inventory/navigation material, not the minimal prototype's workspace design. Useful for finding examples only. |
| [`scripts`][scripts] | Repository maintenance/synchronization tooling and its documentation. | **Avoid execution/adoption:** contributor tooling is not a runtime requirement. No build/sync/install script was executed. |

**Coverage check:** 7 + 7 + 5 + 5 + 5 + 5 + 7 + 3 + 2 + 6 + 2 = **54**. There is no omitted top-level directory.

## Nested demos and important variants

The top-level inventory also includes these internal demonstration families; their existence does not imply native capability.

- **Task-polyfill pages:** `demo-summarizer.html`, `demo-writer.html`, `demo-rewriter.html`, `demo-language-detector.html`, `demo-translator.html`, `demo-classifier.html`, `demo-semantic-embedder.html`, and `demo-decision-model.html`. Inspect backend configuration and whether the page forces a polyfill before interpreting any result. [Task package][task-readme].
- **Prompt-polyfill pages:** `test-default.html`, `test-firebase.html`, `test-gemini.html`, `test-openai.html`, `test-transformers.html`, `test-webllm.html`. These test different providers, not six Chrome model variants. Default selection is described as Transformers.js. [Backend documentation][prompt-polyfill-readme].
- **Writer/Rewriter-polyfill pages:** `demo-writer.html`, `demo-rewriter.html`; README says the demos force polyfills by default and `?native` changes selection. This is an explicit evidence-provenance hazard. [Package documentation][writer-polyfill-readme].
- **Embedding pages:** `note_search.html`, `comment_moderator.html`, `docs_rag.html` under `semantic-embedder`. Search/matching, similarity-based moderation, and RAG are different tasks and need different criteria. [Family overview][embedder-readme].
- **Evaluation variants:** `webmcp-evals/examples/travel` supplies tool/eval JSON, while `evals-course` separates rule format/contrast, judge alignment/consistency, and evaluator tests. The local-judge and summary-evaluation folders add other runtimes. [Tool evaluation][webmcp-readme]; [Evaluation course][evals-readme].
- **Library tests and demos:** `easy-language-model/demo` is a wrapper consumer; Node stub tests cover wrapper orchestration, and browser sanitizer tests cover browser-dependent output behavior. `streaming-markdown-html/test` exercises formatting, chunk sizes, raw HTML/URL behavior and rendering. These are not recorded native Chrome test runs.
- **Application tests:** `wordup/tests` and `wordup/e2e` include Prompt client, WebMCP, database, adversarial and feature tests. Their existence is useful for test planning but is not a pass result or an authorization to import its framework.

## Deep source traces

### Text playground: options, activation, stream and context

**Source.** Shared SESSION_OPTIONS specify system prompt, English text input and output; availability and create use them. Download-needed setup can return null until a user gesture; progress updates are hidden in finally. Streaming accepts either cumulative or delta-looking text through a previous-chunk heuristic, then parses/sanitizes accumulated Markdown. Context counters support multiple API generations. Reset destroys the session and creates another. [Options/setup][playground-options]; [Stream/counters/reset][playground-flow].

**Assessment.** Reuse shared capability configuration and visible preparation. Retain the prototype's explicit “Download and continue” consent instead of allowing an arbitrary typing gesture to authorize a download. Match stream semantics to the chosen browser API; a prefix heuristic can incorrectly discard legitimate repeated delta text. API renames are compatibility evidence, not a reason to accept every historic shape indefinitely.

**Concrete source limitations.** Reset invokes `session.destroy()` without a null guard; token-left expressions apply nullish fallback to arithmetic that can already be NaN. The submit path lacks a busy gate/AbortSignal, so overlapping turns or reset during inference need additional ownership control. These are static observations, not reproduced browser failures.

### Native tool-use demo: a client-owned loop

**Source.** `execute` remains in the local tool registry; only name/description/inputSchema reach the model. Session expectations include text and tool-response input, text and tool-call output. Stream chunks distinguish strings from structured calls. The caller dispatches selected functions, constructs LanguageModelToolSuccess/Error with matching call identity, sends responses under the user role, and prompts again. It uses a pristine base session plus conversation clones. [Declaration/expectations][tools-declarations]; [Dispatcher/results][tools-dispatch]; [Round loop][tools-loop]; [Startup/reset][tools-startup].

**Assessment.** This is a useful *model transport loop*, not native WebMCP execution. Its GitHub/npm fetch functions must be replaced by validated own-page descriptors and `document.modelContext.executeTool` if adapting the pattern. Do not pass WebMCP execute callbacks into model options and expect Chrome to run them. The prototype must keep argument validation, permission, destructive confirmation, generation checks and actual receipts between model proposals and effects.

**Concrete source limitations.** Required-argument checks test presence/empty arrays, not complete JSON Schema validity. MAX_TOOL_CALLS is eight *rounds*; one round can contain several calls. There is no signal propagated through this demo's prompt/fetch loop and no per-effect authorization. It continues after tool errors so the model can try again; our denial/cancellation/error boundary must take precedence. Source comments describe callID → callId and null-result serialization workarounds; preserve null semantics in application data and normalize only at the transport boundary after current-browser verification.

### EasyLanguageModel: wrapper behavior is distinct from the native API

**Source.** `createRawSession` forwards the same create options to availability and create, installs download reporting, and delegates activation waiting. Activation waits for a trusted click on a supplied button, with listener cleanup and AbortSignal handling. Wrapper option keys are split from native options. Tool declarations exclude execute functions, add content expectations, run callbacks, convert result items, deduplicate calls by stringified arguments, and expose callbacks. Tests verify declaration separation, loops/caps, errors, repeated calls, typed results, old call identity, abort forwarding and ordered concurrent batches. [Create helper][easy-create]; [Activation helper][easy-activation]; [Tools helper][easy-tools]; [Wrapper/tests][easy-main]; [Tool tests][easy-tool-tests].

**Assessment.** Reuse the trusted dedicated activation button and targeted tests. The wrapper supplies orchestration; its `onToolCall`, `onToolResponse`, `maxToolRounds`, `promptHTML`, `compact`, and client callback execution are not native API methods or WebMCP permissions. Concurrent tool callbacks and model recovery are inappropriate defaults for dependent list mutations. Required-field checks alone do not validate type, enum, bounds, unknown properties or readable-choice membership. JSON.stringify deduplication is not a canonical transaction key.

**Lifecycle caveat.** Stub tests show aborted rounds can leave wrapper history unchanged while callbacks still have run. Abort ends waiting; it cannot undo an already committed effect. Our durable receipt must record that effect even if model continuation is cancelled. A late ignored callback result must not erase evidence or trigger a retry. Tool errors as model-readable results need classification so policy denial is never treated as a fix-and-retry invitation.

### Sessions and persistence: messages, not native handles

**Source.** `ai-session-management` stores UUIDs and conversation options/messages in localStorage, recreates sessions at startup, streams to text nodes with a prompt signal, creates another session to summarize a conversation title, then persists updated options. [Restoration/setup][session-init]; [Send/persist][session-send].

**Assessment.** Durable conversation data belongs in local storage/IndexedDB; native model handles are ephemeral. Recreate a bounded model context rather than serializing a session. The prototype already separates list/review state from chat; that should remain the source of truth.

**Concrete source limitations.** Conversation deletion removes DOM/storage but does not destroy/remove the assistant in the registry. Stop dereferences the controller without a guard. Title summarization destroys its helper session only on success, and its stream is not given the main signal. There is no strong submit/delete/session-switch concurrency guard. Adapt with owned handles, `try/finally`, cancellation propagation, revision/generation checks and single-turn serialization.

### Compaction: useful memory experiment, unsafe source of authority

**Source.** The standalone compaction demo detects each turn's language at confidence 0.7, chooses summarizer format, preserves matched code fences, keeps original prose if the summary is longer, caches summarizers by language/format, and retries speed preference with auto. It destroys the previous Prompt session, seeds a new one with summaries/languages, and can reconstruct from history after failure. [Language/summarizer setup][compact-language]; [Replacement/recovery][compact-flow].

**Assessment.** Preserve summaries as lossy context, retaining original messages and deterministic application state. A summary that is shorter can still be wrong or omit a commitment. Keep exact item identifiers, permissions, outstanding user approvals, completed action signatures and result receipts outside prose summarization. Recreated model sessions must restore the system instructions and bounded tool catalog explicitly.

**Ownership caveat.** The demo lacks end-to-end cancellation and destroys the old handle before replacement succeeds. EasyLanguageModel has recovery tests and restores untouched history, but also releases the old session before attempting replacement. If a future native browser permits simultaneous handles within resource limits, prefer creating/verifying replacement before swapping; otherwise preserve durable data and a clear unavailable/retry state. Compaction requires additional Detector/Summarizer capabilities and downloads; never silently make them core startup requirements.

### Streaming and safe display

**Source.** `ai-streaming-parser` accumulates model text for DOMPurify inspection, passes incremental chunks to streaming-markdown and displays raw text. `streaming-markdown-html` produces escaped Markdown-derived tokens, checks URL schemes, and renders those tokens using createElement/append. Tests include chunk invariance, raw HTML escaping, dangerous URL removal and avoiding string-to-DOM sinks. [Older parser][parser-source]; [Token renderer][html-renderer]; [URL policy][html-urls]; [Parser tests][html-tests]; [Rendering tests][html-render-tests].

**Assessment.** Use textContent first. If rich Markdown becomes necessary, bind a parser to one response, destroy its session clone in finally, handle partial streams and cancellation, and test split attack strings. The older sample's reused parser and unreleased clone should not be copied.

**Trust boundary.** The token renderer accepts tag names/attributes supplied by its input. Its safety depends on using the package's safe parser/token producer; it is not safe to feed arbitrary model HTML directly into renderStreamingHTML. Allowed HTTP(S) links/images are syntactically safe but can initiate network requests or mislead users. The current local-only product should decide explicitly whether remote images/links are allowed; no new remote rendering is recommended here.

### Image and audio content parts

**Source.** Canvas declares text+image expected inputs and text outputs, then sends a text instruction followed by HTML image and canvas content parts. Audio declares text+audio, records through getUserMedia/MediaRecorder, passes encoded bytes as an ArrayBuffer content part, and stops microphone tracks in finally. Recording/file selection can outlast the activation that initiated them. [Canvas][canvas-source]; [Audio][audio-source].

**Assessment.** Modalities belong in availability and create configuration, not just prompt content. Text-only availability says nothing about image/audio support. Check permissions, MIME/container compatibility, size/duration and cancellation separately. A mind dump experiment should present a transcript draft with explicit capture action.

**Concrete source limitations.** Neither sample destroys its per-request Prompt session. Audio object URLs are created but not revoked, and a recording named recording.mp3 uses MediaRecorder's chosen MIME rather than guaranteeing MP3. Recording/network preparation and model download need distinct consent; a later unrelated gesture should not grant broad capability consent. These samples prove content shape only, not robust multimodal workflow or transcription accuracy.

### Structured suggestions and app-shaped examples

**Invoice source.** Resize a bitmap to a maximum dimension, create a text+image session, prompt for JSON, destroy the session in finally, strip fences/find braces, JSON.parse, and auto-fill editable fields. [Invoice extraction][invoice-source]. **Assessment:** reuse the draft-and-review interaction. JSON parsing is not schema validation, image text can contain instructions, missing fields can be ambiguous, and “0 for missing” conflates unknown with zero. Add a response constraint and strict object/field/type/length validation, leave unknown facts unknown, release image bitmaps/object URLs, and guard stale file results before any mutation.

**Sensitive-validator source.** Parse SAFE/FOUND text, allow on unparseable output, interpolate raw user input into innerHTML, and simulate successful sending. [Validator source][sensitive-source]. **Assessment:** explicitly avoid these decisions. Prefer enum/object constraints and an “unrecognized result” state; render user/model text as text. This is not a security detector and must never decide WebMCP permission.

**Review sources.** Suggestions define useful feedback criteria and reject some malformed labeled output; their worker manages independent MediaPipe initialization. Toxicity uses Transformers scores/thresholds and disables cache. Auto-rating includes HybridTranslator with localhost fallback. [Suggestion worker][review-worker]; [Toxicity worker][toxicity-worker]; [Hybrid translator][hybrid-source]. **Assessment:** reuse bounded task framing and clear ready/error UX, not runtimes, fragile text parsers, disabled caches or server fallback. Advisory classification cannot determine consent, list status or review progression.

**Grounding source.** A briefed Prompt base creates per-document clones, measures fit, optionally condenses text and returns section/quote under a schema; clones are destroyed in finally. [Grounding helper][ground-source]. **Assessment:** use actual deterministic resolution to verify generated references; a schema cannot make a fabricated item ID, quote or completion factual.

**Wordup source.** Its Prompt client uses constraints for word/hint suggestions and destroys sessions; a separate module registers game tools on modelContext. [Prompt client][word-prompt]; [Page tools][word-tools]. **Assessment:** co-located AI and WebMCP are not an agent bridge. Evaluate model proposing, user authorization, native execution and verified-result continuation as separate stages.

### Task-specific local APIs

**Summarizer source.** Configure language/type/format/length, measure input use/quota, summarize and destroy on the successful path, with one-second debounce. [Summarizer source][summary-source]. **Assessment:** use independent availability and specific user action for optional summaries; debounce only prevents starting some calls, it does not cancel in-flight work. Add sequence checks, AbortSignal and finally cleanup. Preserve original descriptions and show suggested changes.

**Detector/Translator source.** Create a detector, display top-result confidence, detect source language on submit, check source/target pair availability, create translator and translate. [Language source][translation-source]. **Assessment:** check empty result lists, confidence and supported pair before treating detection as fact. Cache translators by exact pair, destroy on replacement/disposal, guard older detection/translation results and preserve source text. The sample does not destroy the translator on each submission.

## Original adaptation sketches for this prototype

These are proposed research experiments, not imported demo code or implementation changes.

1. **One capability configuration.** Define a text-only configuration with the intended input/output languages. Query availability with it and use it again for create. Explicitly reject unknown/unavailable states. Keep Prompt and native WebMCP as core gates; check optional Summarizer/Detector/image/audio only when requested.
2. **Owned preparation.** Present the existing download consent screen. The accepted button provides activation; create receives a startup signal and monitor. Normalize loaded/total to honest bounded progress, support unknown totals, distinguish preparation from progress, destroy a stale returned session, and keep user denial recoverable.
3. **Scoped enum → arguments → receipt.** For “move Task A to Project B,” build an enum containing only currently available operation names plus respond. Select the operation under a constraint, then request only its arguments under its schema. Resolve readable choices to verified local identifiers, validate again, obtain permission/confirmation, execute native WebMCP, and continue from the actual result. Existing harness code already follows this broad design; demos support its pieces but do not prove its native behavior.
4. **Display stream, commit complete object.** Stream human-facing text as text nodes. Buffer any constrained JSON until complete, parse/validate once, and never dispatch effects from a partial fragment. Reset parser/controller ownership per response; stopped text is not a completed answer.
5. **Separate durable data from summaries.** Preserve local list/review state and action receipts independently of chat. A compacted chat may say “Task A moved,” but only a verified durable result establishes that fact. Explicitly retain pending permissions and cancelled/denied outcomes outside summaries.
6. **Attachment draft.** An optional audio mind dump yields a transcript and candidate task titles. User reviews/corrects the draft, then authorizes capture. A schema validates candidate shapes, not transcription correctness. Image invoices remain a separate future experiment because they do not serve the current weekly-review workflow directly.

Example constrained proposal for a non-mutating evaluation fixture:

```json
{
  "operation": "capture_tasks",
  "arguments": {
    "titles": ["Book dentist appointment", "Replace hallway bulb"]
  }
}
```

This object is a proposal. Authorization and a successful real tool result are required before the assistant claims those tasks were saved. A denied permission, malformed title, stale catalog, unknown property, duplicate identifier or cancellation leaves the proposal unexecuted. A cancellation after a real commit leaves that commit recorded.

## Lightweight evaluation matrix

Use manual/native Chrome experiments and deterministic fixture checks when separately authorized. No row below was run in this research pass. Log browser version/channel, OS/hardware, API shapes/flags, extension/polyfill state, option set, availability state, model readiness, prompt fixture, actual results and timestamps. Do not log sensitive real task data merely for convenience.

| Experiment | Fixture / variation | Deterministic success criterion | What it establishes |
| --- | --- | --- | --- |
| Native provenance | APIs absent; injected polyfill present; real native build | Core gate rejects absent support; report injected state separately | Capability detection evidence, not model quality |
| Option parity | Text-only vs image/audio; matching languages | availability and create receive intended matching configuration | Configuration correctness for that surface |
| Download consent | available/downloadable/downloading/unavailable/unknown | No unapproved creation download; explicit progress/error/retry; stale session destroyed | Preparation lifecycle |
| Activation lifetime | File picker/recording expires; explicit accepted button | Dedicated actionable continuation; no unrelated page click authorizes model prep | Gesture/consent integration |
| Concurrent submit/reset | Submit twice, reset while create/stream pending | One owned turn; old work cannot change new UI/context; handles released | Race handling |
| Abort/late effect | Stop before execution; stop after a committed write | No future effect after pre-execution stop; committed receipt retained | Cancellation versus durable effects |
| Structured output | Empty, malformed JSON, extra fields, wrong enum/type, unknown ID | Rejected before dispatch; no mutation or invented success | Application validation, beyond constraints |
| Tool transport | Text-only output, multiple calls, call identity variants | Validate entire turn; pair results by verified identities; bounded calls and rounds | Transport handling on tested browser |
| Permissions/errors | Deny grant; destructive confirmation deny; storage error | Stop current turn; no automatic retry/repeated write | Policy boundary |
| Context pressure | Long transcript, exact receipt and pending permission | Summaries remain context; authoritative state/receipts preserved | Context management limits |
| Streaming display | Split tags/links, repeated delta strings, partial JSON | Text safe; no fragment-driven action; stable final reconstruction | Rendering/stream semantics |
| Summaries | Distinct commitments, negation, cancelled/completed tasks | Source facts retained, omissions/errors surfaced, no state change | Recap usefulness and factual limits |
| Translation | Empty detector results, uncertain detection, unsupported pair | Original remains; optional feature fails locally with clear state | Language handling |
| Multimodal draft | Unsupported MIME, long audio, conflicting image text | Bound inputs; cancel/cleanup; human reviews extracted draft | Attachment workflow, not extraction guarantee |
| Grounded continuation | Successful move then model proposes move again | Receipt ends completed operation; duplicate effect prevented | Action continuation reliability |
| Routing quality | Capture vs task completion vs review-step completion | Expected operation/arguments match fixture and actual receipt | Harness relevance to GTD workflow |

Rule checks should own schema/type/bounds/permission/receipt invariants. Human review should own usefulness, intent preservation, extraction errors and summary omissions. A separate model judge can be calibrated against labeled examples, but should never authorize effects or be the sole test of correctness. Evaluation scaffolds in this repository support that distinction; their cloud/CLI runners are not proposed dependencies.

## Evidence limits and recommended research priority

Highest-priority references are the shared-options lifecycle in the text playground, dedicated activation and abort tests in EasyLanguageModel, typed model tool-call/result exchange in prompt-api-tool-use, deterministic reference checking in grounded search, and separate Prompt/WebMCP tests in Wordup. Their reusable principles fit static browser modules without importing a build stack.

The repository mixes historical and experimental API shapes, proposal libraries, independent Wasm/WebGPU/Transformers runtimes, injected globals and cloud providers. Successful sample rendering cannot establish native Chrome support, local-only inference, offline availability, durable permissions or production safety. Model files cached by a PWA, COS or proxy library are not Chrome-managed Prompt model files. Browser-managed downloads, app shell caching and IndexedDB application persistence must be evaluated separately.

No browser execution, benchmark, dependency audit, upstream test run, model download, flag change, cloud inference request, application-code change or package install was performed. Static source review identifies adaptation opportunities and concrete hazards; current native runtime verification remains separate work.

## Pinned source links

[ai-model-proxy-cache]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/ai-model-proxy-cache
[ai-session-management]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/ai-session-management
[ai-streaming-parser]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/ai-streaming-parser
[ai-synonym-finder]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/ai-synonym-finder
[background-fetch-ai-model]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/background-fetch-ai-model
[built-in-ai-extension]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/built-in-ai-extension
[built-in-ai-skills-md-agent-md]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/built-in-ai-skills-md-agent-md
[built-in-ai-task-apis-polyfills]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/built-in-ai-task-apis-polyfills
[canvas-image-prompt]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/canvas-image-prompt
[cos-resource-fetcher]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/cos-resource-fetcher
[document-translator]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/document-translator
[easy-language-model]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/easy-language-model
[evals-course]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/evals-course
[evals-local-llm-judge]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/evals-local-llm-judge
[firebase-ai-logic]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/firebase-ai-logic
[gemini-node-sse]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/gemini-node-sse
[image-alt-text-playground]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/image-alt-text-playground
[landing-pages]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/landing-pages
[local-ai-smart-invoice]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/local-ai-smart-invoice
[mediarecorder-audio-prompt]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/mediarecorder-audio-prompt
[miroir-mon-beau-miroir]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/miroir-mon-beau-miroir
[news-app]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/news-app
[perf-no-worker-gemma]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/perf-no-worker-gemma
[perf-no-worker-transformersjs]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/perf-no-worker-transformersjs
[perf-worker-gemma]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/perf-worker-gemma
[product-review-auto-rating-io]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/product-review-auto-rating-io
[product-review-suggestions]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/product-review-suggestions
[prompt-api-adaptive-ui]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/prompt-api-adaptive-ui
[prompt-api-playground]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/prompt-api-playground
[prompt-api-polyfill]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/prompt-api-polyfill
[prompt-api-session-compacting]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/prompt-api-session-compacting
[prompt-api-tool-use]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/prompt-api-tool-use
[prompt-grounded-docs-search]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/prompt-grounded-docs-search
[proofreader-api-playground]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/proofreader-api-playground
[right-click-for-superpowers]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/right-click-for-superpowers
[scripts]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/scripts
[semantic-docs-search]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/semantic-docs-search
[semantic-embedder-multilingual-search]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/semantic-embedder-multilingual-search
[semantic-embedder]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/semantic-embedder
[sensitive-data-validator]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/sensitive-data-validator
[speech-api-playground]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/speech-api-playground
[streaming-markdown-html]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/streaming-markdown-html
[summarization-api-playground]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/summarization-api-playground
[summary-evaluation]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/summary-evaluation
[summary-of-summaries]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/summary-of-summaries
[toxic-review-warning]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/toxic-review-warning
[translation-language-detection-api-playground]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/translation-language-detection-api-playground
[vector-store-docs-search]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/vector-store-docs-search
[weather-ai]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/weather-ai
[webmcp-evals]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/webmcp-evals
[wikipedia-spam-detector]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/wikipedia-spam-detector
[wordup]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/wordup
[writer-rewriter-api-playground]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/writer-rewriter-api-playground
[writer-rewriter-polyfills]: https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/writer-rewriter-polyfills
[inventory]: https://api.github.com/repos/GoogleChromeLabs/web-ai-demos/git/trees/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c?recursive=1
[repo-readme]: https://github.com/GoogleChromeLabs/web-ai-demos/blob/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/README.md#L1-L29
[task-readme]: https://github.com/GoogleChromeLabs/web-ai-demos/blob/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/built-in-ai-task-apis-polyfills/README.md#L1-L120
[prompt-polyfill-readme]: https://github.com/GoogleChromeLabs/web-ai-demos/blob/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/prompt-api-polyfill/README.md#L1-L75
[writer-polyfill-readme]: https://github.com/GoogleChromeLabs/web-ai-demos/blob/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/writer-rewriter-polyfills/README.md#L142-L157
[embedder-readme]: https://github.com/GoogleChromeLabs/web-ai-demos/blob/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/semantic-embedder/README.md#L1
[webmcp-readme]: https://github.com/GoogleChromeLabs/web-ai-demos/blob/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/webmcp-evals/README.md#L1
[evals-readme]: https://github.com/GoogleChromeLabs/web-ai-demos/blob/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/evals-course/README.md#L1
[playground-options]: https://github.com/GoogleChromeLabs/web-ai-demos/blob/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/prompt-api-playground/script.js#L31-L93
[playground-flow]: https://github.com/GoogleChromeLabs/web-ai-demos/blob/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/prompt-api-playground/script.js#L95-L249
[tools-declarations]: https://github.com/GoogleChromeLabs/web-ai-demos/blob/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/prompt-api-tool-use/script.js#L45-L77
[tools-dispatch]: https://github.com/GoogleChromeLabs/web-ai-demos/blob/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/prompt-api-tool-use/script.js#L350-L456
[tools-loop]: https://github.com/GoogleChromeLabs/web-ai-demos/blob/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/prompt-api-tool-use/script.js#L458-L592
[tools-startup]: https://github.com/GoogleChromeLabs/web-ai-demos/blob/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/prompt-api-tool-use/script.js#L594-L704
[easy-create]: https://github.com/GoogleChromeLabs/web-ai-demos/blob/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/easy-language-model/src/create-session.js#L22-L64
[easy-activation]: https://github.com/GoogleChromeLabs/web-ai-demos/blob/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/easy-language-model/src/user-activation.js#L22-L92
[easy-tools]: https://github.com/GoogleChromeLabs/web-ai-demos/blob/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/easy-language-model/src/tools.js#L111-L236
[easy-main]: https://github.com/GoogleChromeLabs/web-ai-demos/blob/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/easy-language-model/src/easy-language-model.js#L131-L254
[easy-tool-tests]: https://github.com/GoogleChromeLabs/web-ai-demos/blob/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/easy-language-model/test/tools.test.js#L84-L895
[session-init]: https://github.com/GoogleChromeLabs/web-ai-demos/blob/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/ai-session-management/script.js#L19-L211
[session-send]: https://github.com/GoogleChromeLabs/web-ai-demos/blob/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/ai-session-management/script.js#L232-L327
[compact-language]: https://github.com/GoogleChromeLabs/web-ai-demos/blob/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/prompt-api-session-compacting/script.js#L168-L295
[compact-flow]: https://github.com/GoogleChromeLabs/web-ai-demos/blob/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/prompt-api-session-compacting/script.js#L382-L545
[parser-source]: https://github.com/GoogleChromeLabs/web-ai-demos/blob/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/ai-streaming-parser/script.js#L83-L126
[html-renderer]: https://github.com/GoogleChromeLabs/web-ai-demos/blob/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/streaming-markdown-html/render-stream.js#L37-L97
[html-urls]: https://github.com/GoogleChromeLabs/web-ai-demos/blob/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/streaming-markdown-html/safe-url.js#L6-L43
[html-tests]: https://github.com/GoogleChromeLabs/web-ai-demos/blob/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/streaming-markdown-html/test/markdown.test.js#L173-L256
[html-render-tests]: https://github.com/GoogleChromeLabs/web-ai-demos/blob/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/streaming-markdown-html/test/render-stream.test.js#L65-L116
[canvas-source]: https://github.com/GoogleChromeLabs/web-ai-demos/blob/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/canvas-image-prompt/script.js#L6-L89
[audio-source]: https://github.com/GoogleChromeLabs/web-ai-demos/blob/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/mediarecorder-audio-prompt/script.js#L9-L139
[invoice-source]: https://github.com/GoogleChromeLabs/web-ai-demos/blob/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/local-ai-smart-invoice/src/App.tsx#L19-L303
[sensitive-source]: https://github.com/GoogleChromeLabs/web-ai-demos/blob/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/sensitive-data-validator/script.js#L146-L234
[review-worker]: https://github.com/GoogleChromeLabs/web-ai-demos/blob/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/product-review-suggestions/src/worker.js#L6-L172
[toxicity-worker]: https://github.com/GoogleChromeLabs/web-ai-demos/blob/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/toxic-review-warning/src/worker.js#L4-L78
[hybrid-source]: https://github.com/GoogleChromeLabs/web-ai-demos/blob/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/product-review-auto-rating-io/src/lib/HybridTranslator.js#L6-L99
[ground-source]: https://github.com/GoogleChromeLabs/web-ai-demos/blob/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/prompt-grounded-docs-search/prompt-grounding.js#L250-L278
[word-prompt]: https://github.com/GoogleChromeLabs/web-ai-demos/blob/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/wordup/src/lib/promptClient.ts#L61-L190
[word-tools]: https://github.com/GoogleChromeLabs/web-ai-demos/blob/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/wordup/src/lib/webmcp.ts#L12-L59
[summary-source]: https://github.com/GoogleChromeLabs/web-ai-demos/blob/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/summarization-api-playground/src/main.ts#L17-L145
[translation-source]: https://github.com/GoogleChromeLabs/web-ai-demos/blob/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/translation-language-detection-api-playground/script.js#L63-L168

