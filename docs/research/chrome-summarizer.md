# Chrome Summarizer API: research and prototype recommendations

Research date: **2026-10-12**. Primary page: [Summarize with built-in AI](https://developer.chrome.com/docs/ai/summarizer-api), published November 11, 2024; displayed update July 30, 2025. This is research and proposed future work only. No browser execution, model download, implementation, or quality measurement was performed.

Read `AGENTS.md`, `INTENT.md`, `DESIGN.md`, and `ChromeAI.md` first. Sources below distinguish Chrome's public guide, the evolving [Writing Assistance explainer][explainer] and [draft source][draft], and Chromium source at **`578db53b7ff6a3eaa28e561e25cb6b1e4878da3a`**. The explainer/draft were read at `main` on the research date, not a release tag. Demo source is pinned to **`d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c`**. Neither source snapshot establishes the installed Chrome build's behavior.

## Recommendation and product fit

Use Summarizer as an **optional, read-only specialist** for proposed summaries of lengthy descriptions, completed review discussions, or older historical prose. Its task-specific interface can avoid manually engineering a Prompt API summarization prompt. It does not provide tools, conversational memory, structured argument validation, item lookup, or authorization. Output should help a person or the orchestrating Prompt agent understand source material; only the existing tool harness may propose and execute list changes.

Keep the static, browser-only design: no server fallback, remote model, package installation, build step, or additional mandatory startup gate. Existing Prompt API and WebMCP requirements remain separate. Missing Summarizer should hide/disable the optional action or retain original prose. Do not automatically replace task descriptions or mark weekly review steps complete because a summary claims completion.

The current repository already bounds historical model input. [`harness.js`](../../harness.js), `conversationForModel()` around line 262, groups messages, excludes failed/denied turns, then supplies six messages capped at 1,000 characters each. [`app.js`](../../app.js), `promptContext()`/`bridgeContext()` around lines 331/337, distinguishes history from the current request; `chat()` uses a fresh native session or a bridge clone, and releases temporary sessions. Summarizer would improve **selected historical context**, not automatically shrink an indefinitely growing native conversation. `stop()` around line 326 preserves committed receipts while aborting work. Any optional maintenance must respect that boundary. See [session compaction](chrome-session-compacting.md) for the proposed checkpoint/replacement design.

## Public support, eligibility, and preparation

Chrome documents stable support from 138 and languages `en`, `ja`, `es`, `de`, `fr`. Eligible desktop systems need the documented OS, storage, and CPU/GPU requirements; mobile and ordinary ChromeOS devices are excluded. Initial download needs an unmetered connection; subsequent inference is local/offline. Model eviction under storage pressure can require preparation again. [Chrome guide](https://developer.chrome.com/docs/ai/summarizer-api); full shared requirements: [prerequisites](chrome-ai-prerequisites.md), [downloads](chrome-model-downloads.md).

Feature detection (`'Summarizer' in self`) only establishes interface exposure. The [pinned IDL][idl] requires a secure context. Query `Summarizer.availability(coreOptions)` for the desired language/type/format/length combination; do not infer availability from a ready Prompt session. The [explainer][explainer] defines four results:

| Result | Meaning and proposed handling |
| --- | --- |
| `unavailable` | Configuration cannot be supported; retain original material and explain that summarization is unavailable. |
| `downloadable` | Additional resources are needed; offer explicit preparation with download consent. |
| `downloading` | Resources are being prepared; offer progress/cancellation and handle creation failure. |
| `available` | No further download is needed for these core options; creation can still fail. |

The [draft's availability algorithm][draft] allows masking actual download status for privacy. Availability is not a hardware fingerprint, storage meter, proof of performance, or permanent capability promise. Query only relevant options, handle an unexpected value conservatively, and catch creation errors.

The [pinned creation client][create-client] calls the shared activation helpers after its availability result. At this pin they check the downloadable case and accept sticky activation by default; the stricter configuration consumes transient activation. This is not a universal transient-activation requirement. See [the exact helper/default comparison](chrome-ai-prerequisites.md#user-activation-guide-wording-versus-current-source). In this prototype use a deliberate **Prepare summaries** click, with options checked ahead of time; if a stricter configuration's activation expires while work awaits, restore an explicit retry button. Browser activation is a technical prerequisite, not the application's consent decision. A click elsewhere must not become permission to download. Model-download consent also does not grant WebMCP tools or approve a write.

`create({monitor(m) { ... }})` supplies a monitor on which to register `downloadprogress`. The [explainer][explainer] defines normalized `loaded` between 0 and 1, with `total` 1, aggregated across required resources rather than exposed byte counts. Show bounded percentage plus a preparing state; completion of an event is not successful creation. Wait for the creation promise. Abort, network failure, or initialization failure can reject it; do not spin or silently redownload.

## Configuration and actual contract

The [IDL][idl] separates **core options** accepted by `availability()` from creation-only `sharedContext`, `signal`, and `monitor`. Passing one core-options object to both availability and creation keeps capability checks honest. Availability does not validate the size or semantic suitability of a creation-time shared context or a future input.

| Option | Allowed values/default and purpose |
| --- | --- |
| `type` | `key-points` (default), `tldr`, `teaser`, `headline`; respectively extraction, concise overview, invitation to read more, or title-like main point. |
| `format` | `markdown` (default) or `plain-text`; output representation, not an HTML safety guarantee. |
| `length` | `short` (default), `medium`, `long`; qualitative output guidance, not a token budget. |
| `preference` | `auto` (default), `speed`, `capability`; balances latency versus richer summarization, with important exposure/support caveats below. |
| `expectedInputLanguages` | BCP 47 language-tag sequence describing likely source languages. |
| `expectedContextLanguages` | Language-tag sequence covering both shared context and per-call context. |
| `outputLanguage` | Requested output language; explicit selection reduces ambiguous multilingual behavior. |
| `sharedContext` | Background relevant to every call, fixed at creation. Keep it small and relevant. |
| `signal`, `monitor` | Creation cancellation/lifetime and preparation observation; neither is a text-generation parameter. |

The draft canonicalizes/deduplicates tags and may best-fit supported locales; malformed tags and unsupported language combinations are different failures. Expected languages help choose/download capabilities and reject unsupported configurations; they are not a language detector, translator guarantee, or instruction to trust mixed-language output. Without declarations, input/context languages are unknown and output defaults toward the input language; mixed/undetectable input may fail. Prefer explicit expected languages and output language when known. Language detection can itself be optional; preserve original text for short, ambiguous, or unsupported material. [Explainer][explainer], [draft creation/availability][draft]; [detector research](chrome-language-detection.md).

The public guide's Chrome length examples are maxima, not exact promises: `tldr`/`teaser` short/medium/long use 1/3/5 sentences; `key-points` uses 3/5/7 bullets; `headline` uses 12/17/22 words. Results may be shorter. Remove unnecessary HTML and summarize source text. [Chrome guide](https://developer.chrome.com/docs/ai/summarizer-api).

Settings are immutable per instance; readonly getters expose shared context, type, format, length, language settings, and quota. Create a new object when settings change. Reuse an instance for repeated calls with the same configuration: **previous inputs and outputs do not accumulate**. A later `summarize()` cannot remember an earlier summary unless the application explicitly passes that material again. There is no clone/history/append API. [IDL][idl], [explainer repeated usage][explainer]. Cache only a bounded number of configurations, including language and shared-context identity, with explicit destruction on eviction.

### Preference is a version-sensitive optimization

The public guide describes preferences broadly, but the [pinned IDL][idl] separately runtime-gates `preference` with `AISummarizationPerformancePreference`; the current [draft][draft] marks it experimental. The IDL does not expose a readonly preference getter although the draft does. Unsupported dictionary members can be ignored by Web IDL, so acceptance of `{preference:'speed'}` or non-`unavailable` alone does not prove that Chrome selected a faster model.

The [pinned browser manager][manager] additionally restricts speed to supported English language settings, `tldr`/`key-points`, and `short`/`medium`, with no nonempty shared context; it depends on a suitable manifest/model path and warns about limited Markdown support. The [pinned summarizer backend][backend] rejects nonempty **per-call** context under speed and selects a different input limit. In that snapshot auto/capability resolve through the default use case; capability does not establish a universally distinct model.

These are source observations, not stable web guarantees or instructions to change flags. Start with default behavior, plain text, and explicit languages. If later experimenting with preference, recheck the full configuration, record target Chrome/model, test the complete operation, and use bounded fallback to default/auto without losing originals. The compaction demo's speed-first creation followed by contextual summarization can conflict with the pinned backend. This qualifies the general preference description in [session compaction's supporting-API section](chrome-session-compacting.md#summarizer).

## Input, output, quota, and failure

`await instance.summarize(input, {context, signal})` returns one string after completion. `context` adds call-specific background; it does not change fixed settings. `summarizeStreaming(input, {context, signal})` returns a `ReadableStream` of string chunks immediately. Both take a **complete string input**; streaming describes output, not incrementally supplied input. Appending more source requires a new invocation. Concatenate chunks and treat the result as provisional until the stream closes successfully. [Explainer][explainer], [pinned responder][responder].

The [draft summarization algorithm][draft] instructs implementations to produce a summary rather than answer source questions or obey instructions embedded in source/context. `sharedContext` and `context` provide summarization background; they are not general system prompts. The [pinned base implementation][base] trims input/per-call context, returns an empty string for whitespace-only batch input, and an empty stream for whitespace-only streaming input. An empty summary is not evidence that no work, blockers, or constraints exist.

`inputQuota` and `measureInputUsage(input, {context, signal})` are separate from Prompt API context accounting. The measured request incorporates the instance's configuration and relevant contexts according to its implementation. The [draft][draft] explains that some options may already reduce quota at initialization, or may be encoded with each call. **Do not manually add a second token estimate for shared context.** Compare the returned measurement to that instance's quota. No hardcoded input size, character count, or reuse of another API's token count is correct. The [pinned backend][backend] constructs a request with article, settings, shared context, and per-call context for both measurement and inference.

Oversized shared context can fail creation; oversized summarization can reject the promise or error the stream with `QuotaExceededError`. Optional `requested`/`quota` fields help diagnostics; check their existence rather than assuming all builds expose them. The draft permits unlimited implementations (`inputQuota === Infinity`, measurement 0). Measurement can itself fail and is not a reservation of future resources. [Explainer][explainer], [draft][draft].

Official explainer guidance warns against always measuring immediately before an operation: it adds a model round trip when inference already checks quota. Use measurement for a debounced UI budget, choosing safe prose segments, or a deliberate preflight; otherwise catch inference's quota failure. Compaction can justify preflight because it must avoid discarding context before discovering an oversize candidate. Summarizer fit also does not prove the resulting checkpoint fits a Prompt session: measure the actual target Prompt input separately.

Handle both synchronous throws and asynchronous rejection/stream failure. Draft error categories include policy/user denial (`NotAllowedError`), unsupported language (`NotSupportedError`), filtered output (`NotReadableError`), initialization/measurement failure (`OperationError`), general resource failure (`UnknownError`), and cancellation (`AbortError` or the abort reason), alongside quota and invalid input errors. This is a draft taxonomy, not an exhaustive tested Chrome exception table. Treat a failed summary as absent, preserve sources, and provide bounded retry/manual fallback; do not relax safety checks to obtain output. [Draft errors][draft], [base][base].

## Cancellation, concurrency, frames, and safe rendering

Supply a per-operation `AbortSignal` to summarization/measurement. `destroy()` rejects/errors outstanding operations and permits resource release; the model may remain loaded for another API/tab. In the [pinned base][base], aborting the **creation signal after successful creation destroys the instance**, so separate a cached instance's lifetime controller from a single request's Stop controller. Aborting preparation stops the caller's progress observation but does not guarantee that the browser stops a shared download. [Explainer][explainer].

Repeated calls are independent, but independence is not a promise of simultaneous hardware execution, unlimited throughput, or completion order. Serialize optional maintenance or use a small bounded queue. Cancellation plus a monotonically increasing generation prevents old results overwriting newer summaries; check generation after every await and before rendering/saving. A one-second debounce does not cancel a request already running. Destroy stale returned instances and clean up in `finally`; do not allow stale cleanup to enable controls belonging to another operation.

Chrome documents top-level/same-origin access by default, cross-origin delegation through `allow="summarizer"`, and no Web Worker support. [Chrome guide](https://developer.chrome.com/docs/ai/summarizer-api). The [IDL][idl] contains a separately gated worker path, while the draft exposes Window; source presence is not shipped worker support. Do not move it into this PWA's service worker. Permissions Policy governs API access, not user approval to run item tools. The [base][base] returns unavailable for blocked policy and rejects creation.

Render plain text using `textContent`. Markdown output is still untrusted; any future Markdown renderer must sanitize HTML, URLs, and generated links. Do not pass output into `innerHTML`, executable code, model system policy, or tool arguments without independent validation. Input may contain prompt injection; the explainer acknowledges robustness remains an active problem. A well-formed summary can invent facts, erase negation, attribute a proposal as completed work, change numbers/dates, or omit low-frequency but decisive constraints. The task API and output type do not establish factual correctness. [Explainer adversarial-input section][explainer], [draft algorithm][draft].

Chrome's local inference property does not make all implementations of the proposal local; the [draft][draft] permits other implementation strategies. Keep this prototype's Chrome-local requirement and forbid a silent cloud fallback. The draft also discusses cross-site isolation of user input, resource contention, and storage-pressure eviction. Preserve ordinary application privacy controls and avoid logging source text merely to diagnose quota or performance.

## Optional compaction and specialist-summary boundaries

The [pinned compaction helper][compact] caches language/format summarizers, keeps matched code fences, falls back when a summary is longer in characters, and renews its Prompt conversation. Useful patterns are explicit configuration and retention of originals. Limits: fenced-code matching does not protect unfenced JSON, IDs, approvals, quoted titles, or negations; fewer characters do not prove token savings or faithful continuity. The [playground][playground] shows language-matched creation, input measurement, debounce, and safe `textContent`; its successful-path destruction lacks robust failure/staleness cleanup. Adopt the lifecycle concept, not the entire demo.

For this repository, keep canonical items, preferences, review progress, exact user constraints, record IDs, tool-call IDs, structured calls/results, permission decisions, denied/cancelled outcomes, and verified committed receipts outside lossy summarization. Historical approvals are never current authority. Preserve originals plus source/version provenance and a recent exact tail. Generate summaries only from eligible **completed prose**, fence them as historical data, and re-read current records before action. A read-only specialist summary may inform an orchestrator; it cannot mutate IndexedDB, advance review, replay a tool, or report a write as verified.

Use a closed-turn maintenance boundary with no pending tool/approval/continuation. Save authoritative source material first; reject stale source revisions and late generations. Retain an old checkpoint or bounded original prose on unavailable model, unsupported language, quota failure, filtered/empty/nonshorter output, or cancellation. Avoid recursive summary-of-summary erosion. A replacement Prompt session must pass its own measured capacity/fidelity checks; creating a Summarizer never changes the old Prompt session's retained context. See [session compaction](chrome-session-compacting.md) for recovery and receipt preservation.

## Original browser sketch, unexecuted

This illustrative function uses only browser APIs; it is not connected to the application. Its caller has already selected eligible prose, checked availability, and obtained explicit preparation consent when needed. `isCurrent` represents the proposed generation/source guard. Protected facts and originals remain outside its return value.

```js
const summaryCore = Object.freeze({
  type: 'tldr', format: 'plain-text', length: 'medium',
  expectedInputLanguages: ['en'],
  expectedContextLanguages: ['en'], outputLanguage: 'en'
});

async function optionalProseSummary(text, signal, isCurrent, showProgress) {
  // Caller checked Summarizer.availability(summaryCore) ahead of the
  // explicit Prepare/Summarize click. It retains the original text.
  if (!('Summarizer' in self) || signal.aborted || !isCurrent()) return null;
  let instance;
  try {
    instance = await Summarizer.create({
      ...summaryCore, signal, // One-operation lifetime, never cached here.
      sharedContext: 'Historical conversation prose for a weekly review.',
      monitor(m) {
        m.addEventListener('downloadprogress', event => {
          if (!signal.aborted && isCurrent()) {
            showProgress(Math.max(0, Math.min(1, event.loaded)));
          }
        });
      }
    });
    if (signal.aborted || !isCurrent()) return null;
    let proposed = '';
    const stream = instance.summarizeStreaming(text, {
      context: 'Describe the conversation as history, retaining negations.',
      signal
    });
    for await (const chunk of stream) {
      if (signal.aborted || !isCurrent()) return null;
      proposed += chunk; // No persistent checkpoint from partial output.
    }
    if (signal.aborted || !isCurrent() || !proposed.trim()) return null;
    return proposed.trim(); // Caller still evaluates fidelity and Prompt fit.
  } catch (error) {
    // Report error.name as appropriate; original text remains usable.
    return null;
  } finally {
    instance?.destroy();
  }
}
// Display only a current accepted suggestion: output.textContent = suggestion.
// No item mutation or authorization is derived from this result.
```

## Proposed evaluation and remaining uncertainty

Before future adoption, record exact browser/channel/model when exposed, core options, availability, preparation progress, quota, measured input, latency, output, and accepted/rejected fidelity judgments. Separate real-model evaluation from deterministic lifecycle checks. No such execution was performed here.

| Evaluation | Required outcome |
| --- | --- |
| Languages, preference, and setup | Unsupported/malformed/mixed languages and speed/context combinations degrade gracefully; interface exposure alone never asserts capability; consent remains explicit. |
| Source fidelity | Negations, dates, counts, quoted titles, speaker attribution, proposals versus completed work, and denied outcomes survive or the candidate is rejected; exact protected material remains authoritative. |
| Streaming/errors | Empty, filtered, oversized, interrupted, or partial output never becomes a checkpoint or overwrite; originals remain accessible. |
| Races/resources | Stop/reset/tab teardown/newer requests/source edits invalidate late work; destruction and controller ownership are correct; bounded caches/queues avoid resource churn. |
| Compaction benefit | Compare actual target Prompt usage and usable headroom before/after; reject character-only savings, larger tokenized output, or reduced continuity. |
| Specialist role | Summary displays/projections trigger zero writes and zero review advancement; existing tool permission, stale-record checks, receipts, and replay prevention still govern all actions. |

The exact installed-build preference/worker exposure, error fields, practical concurrency/cancellation behavior, model identity/quality, and device latency remain unverified. This document provides a contract and evaluation plan, not a claim that local summarization preserves every important fact.

[explainer]: https://github.com/webmachinelearning/writing-assistance-apis/blob/main/README.md
[draft]: https://github.com/webmachinelearning/writing-assistance-apis/blob/main/index.bs
[idl]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/summarizer.idl
[base]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/ai_writing_assistance_base.h
[create-client]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/ai_writing_assistance_create_client.h
[backend]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/chrome/browser/ai/ai_summarizer.cc
[manager]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/chrome/browser/ai/ai_manager.cc
[responder]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/model_execution_responder.cc
[playground]: https://github.com/GoogleChromeLabs/web-ai-demos/blob/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/summarization-api-playground/src/main.ts
[compact]: https://github.com/GoogleChromeLabs/web-ai-demos/blob/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/prompt-api-session-compacting/script.js
