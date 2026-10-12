# Chrome Language Detector API research

Research date: **2026-10-12**. Scope: the official [Language Detector guide](https://developer.chrome.com/docs/ai/language-detection), its API contract, Chromium implementation, and the linked playground. This is research documentation. Examples below are original, untested browser sketches; no implementation, dependencies, browser settings, models, or tests were changed.

Read with [prerequisites](chrome-ai-prerequisites.md), [model preparation and downloads](chrome-model-downloads.md), [session compaction](chrome-session-compacting.md), and [Summarizer research](chrome-summarizer.md). Language detection is an optional experiment in this prototype; `INTENT.md` requires Prompt API and WebMCP at startup, and does not require a detector.

## Sources and their authority

- **Chrome guidance:** Thomas Steiner's guide displays publication **2024-09-24** and update **2025-05-20**. It describes desktop availability, on-demand model preparation, ranked detection, short-text limitations, and embedding rules. These are documentation claims, not observations of the user's installed browser. [Official guide](https://developer.chrome.com/docs/ai/language-detection).
- **Proposal and community draft:** the Translator/Language Detector repository is pinned here to **4334048603a5f8e5572d5ea77cef641f83712c4a**, whose commit date is **2026-09-30**. `index.bs` declares `CG-DRAFT`; this is not a W3C Standard. The README's historical “not approved to ship” language is proposal context, not a current Chrome release statement. [Pinned explainer](https://github.com/webmachinelearning/translation-api/blob/4334048603a5f8e5572d5ea77cef641f83712c4a/README.md), [pinned draft source](https://github.com/webmachinelearning/translation-api/blob/4334048603a5f8e5572d5ea77cef641f83712c4a/index.bs).
- **Implementation observations:** Chromium is pinned to **578db53b7ff6a3eaa28e561e25cb6b1e4878da3a**. Source details below describe that revision, not a guaranteed behavior across every shipped channel or model update. [Detector IDL](https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/on_device_translation/language_detector.idl).
- **Demo observations:** GoogleChromeLabs' combined playground is pinned to **d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c**. Its code is useful for API wiring, but its interaction and confidence presentation are example choices. [Playground source](https://github.com/GoogleChromeLabs/web-ai-demos/blob/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/translation-language-detection-api-playground/script.js).

Labels distinguish official behavior, pinned implementation observations, and original repository recommendations. No quality benchmark or device-level verification was performed.

## What the API does

**Official contract:** `LanguageDetector` classifies a string into language candidates. It does not translate, summarize, choose a UI locale, or verify that another AI API supports the detected language. Detection and translation capabilities may differ. The explainer identifies language labeling and choosing a language-specific model as possible uses; it deliberately does not guarantee identical accuracy across browsers or model versions. [Explainer goals and detection examples](https://github.com/webmachinelearning/translation-api/blob/4334048603a5f8e5572d5ea77cef641f83712c4a/README.md#goals).

The current surface is:

| Member | Contract and important boundary |
| --- | --- |
| `LanguageDetector.availability(options?)` | Promise for readiness of a requested configuration; core option is `expectedInputLanguages`. |
| `LanguageDetector.create(options?)` | Promise for a ready detector; additionally accepts `monitor` and `signal`. Can initiate model preparation. |
| `detector.detect(input, options?)` | Promise for an array of `{ detectedLanguage, confidence }`; operation option is `signal`. |
| `detector.expectedInputLanguages` | Read-only frozen array of negotiated language tags, or `null` when none were specified. |
| `detector.measureInputUsage(input, options?)` | Promise for implementation-defined usage; accepts an operation signal. |
| `detector.inputQuota` | Read-only usage limit; may be positive infinity. |
| `detector.destroy()` | Ends this object's lifetime and aborts pending operations. |

[Pinned API declarations](https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/on_device_translation/language_detector.idl), [explainer lifecycle and quotas](https://github.com/webmachinelearning/translation-api/blob/4334048603a5f8e5572d5ea77cef641f83712c4a/README.md#too-large-inputs).

There is no detector prompt, system instruction, temperature, `topK`, streaming result, clone, or conversation context in this surface. **Repository recommendation:** keep any app-side classification policy separate from API options; language tags and confidence do not become authoritative application facts merely because a model returned them.

## Availability, creation, and model preparation

**Official guidance:** feature-detect `'LanguageDetector' in self`; Chrome documents the expert Language Detector and Translator APIs for desktop, excluding mobile. Its detector model is small relative to other built-in models and may already exist because Chrome uses it elsewhere. This is a separate resource from Gemini Nano. [Chrome getting-started and download sections](https://developer.chrome.com/docs/ai/language-detection#get_started).

**Official contract:** `availability()` does not initiate the download; `create()` can. Query the same core options that creation will use. Handle all four shared readiness states:

| State | Meaning | Repository recommendation |
| --- | --- | --- |
| `unavailable` | Requested capability cannot currently be supported. | Leave the optional detector disabled and preserve ordinary workflows. |
| `downloadable` | Resources can be acquired. | Offer explicit preparation through a real user action. |
| `downloading` | Resources are being acquired. | Expose preparation status and allow cancellation of this request. |
| `available` | Resources are ready without download. | Attempt creation; still handle rejection. |

[Explainer readiness and downloading](https://github.com/webmachinelearning/translation-api/blob/4334048603a5f8e5572d5ea77cef641f83712c4a/README.md#checking-before-creation-and-a-more-realistic-combined-example).

**Pinned implementation observation:** the detector's model-status mapping produces `available`, `downloadable`, or `unavailable`; this path does not emit `downloading` at this revision. Code should still understand the full public contract. Policy blocking also resolves availability to `unavailable`, so the value is not exclusively a hardware or language diagnosis. [Readiness mapping](https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/availability.cc#L117), [detector availability](https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/on_device_translation/language_detector.cc#L247).

**Pinned preparation behavior:** `monitor(m)` receives a monitor object; attach a `downloadprogress` listener inside that callback. `event.loaded` is normalized from zero to one, and `total` is one; it is not a byte count. Resolution of `create()` is the usable-model boundary, including loading. Do not infer readiness solely from a progress display reaching 100%. This detector sends zero and completion events even for creation without a download. [Normalized monitor implementation](https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/create_monitor.cc#L43), [creation completion](https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/on_device_translation/language_detector.cc#L138).

**Pinned implementation observation:** detector monitoring sends normalized zero and completion events after model loading; it does not provide a detailed byte-progress stream in this creation path. An immediate jump is legitimate. It invokes the monitor before initiating model retrieval; a thrown monitor callback prevents that retrieval. [Create task](https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/on_device_translation/language_detector.cc#L71).

Chrome requests user activation before preparation. The pinned create task requires activation for its after-download status, using the shared helper: sticky activation when relaxation is enabled, otherwise consumed transient activation. **Repository recommendation:** keep optional download approval attached to an explicit preparation button and handle `NotAllowedError`; synthetic events and a programmatically called handler do not create activation. See [detector activation check](https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/on_device_translation/language_detector.cc#L106), [activation helper](https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/ai_utils.cc#L427), and the [download chapter](chrome-model-downloads.md).

## Language tags and expected languages

**Official contract:** languages are BCP 47 tags, compatible with `Intl` and HTML `lang`, rather than localized display names. `expectedInputLanguages: ['en', 'ja']` means the application needs detection support for those languages. Unsupported requirements can reject creation with `NotSupportedError`. Best-fit matching may negotiate broader tags; requesting a region does not establish region-level classification accuracy. Use `Intl.DisplayNames` to display names while retaining tags as identifiers. [Explainer language tags and expected inputs](https://github.com/webmachinelearning/translation-api/blob/4334048603a5f8e5572d5ea77cef641f83712c4a/README.md#language-detection-with-expected-input-languages).

**Pinned implementation observation:** supplied tags are validated and canonicalized, with invalid tags producing `RangeError`; duplicate canonical tags are removed. Supported tags are currently a fixed source set, including script variants such as `zh-Hans`, `zh-Hant`, and some Latin transliterations. That source set is not a lasting model-quality guarantee or an appropriate app hard-coded registry. `availability({expectedInputLanguages: [tag]})` is a runtime capability check for a relevant tag. [Validation helper](https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/ai_utils.cc#L402), [supported set and negotiation](https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/on_device_translation/language_detector.cc#L31).

Expected languages **do not restrict inference to that list** in this source: detection calls the model without passing the expected-language array. Omitting the option, or supplying an empty array, yields a `null` expected-language property. **Repository recommendation:** do not use `['en']` to force uncertain text into English; do not equate detector support with Summarizer or Prompt support. Check each downstream API independently. [Creation negotiation](https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/on_device_translation/language_detector.cc#L138), [inference path](https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/on_device_translation/language_detector.cc#L355).

## Ranked results, uncertainty, and multilingual text

**Official contract:** results contain numeric confidence in `[0, 1]`. The highest candidate is a hypothesis. The explainer specifies a final `und` entry for undetermined language, at least one result, and omission of low-probability candidates; returned scores can therefore sum to less than one. Do not renormalize an incomplete list into invented certainty. [Result semantics](https://github.com/webmachinelearning/translation-api/blob/4334048603a5f8e5572d5ea77cef641f83712c4a/README.md#language-detection).

**Pinned implementation observation:** known candidates are sorted, candidates with zero scores or scores below the unknown score are omitted, collection stops at cumulative confidence of at least `0.99`, and `und` is appended. Empty input becomes `{detectedLanguage: 'und', confidence: 1}`. The wrapper corrects Hebrew's legacy `iw` code to `he`. Despite a nearby source comment about adding to one, it uses the actual unknown score rather than the omitted probability mass. [Result conversion](https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/on_device_translation/language_detector.cc#L444).

Chrome cautions against single words and very short phrases and recommends experimenting with the relevant languages and returning unknown below an appropriate threshold. There is no universal reliable minimum word count or official universal acceptance threshold. [Short-text caution](https://developer.chrome.com/docs/ai/language-detection#run_the_language_detector).

**Original repository recommendations:** preserve full candidates for diagnostics; use a configurable confidence threshold and, where useful, a margin over the next candidate. Evaluate them on representative task descriptions, negations, names, copied notes, and actual language pairs. Do not infer a user's locale from a shopping item such as “pain,” a person's name, punctuation, code, emoji, or an issue identifier. Missing evidence remains unknown. Confidence is not a benchmarked probability that an application decision is correct.

**Proposal intent:** multilingual confidence should reflect the amount of text in each language, using an implementation-defined segmentation/weighting scheme. The API returns no spans or offsets. **Pinned implementation observation:** Chrome's wrapper invokes `PredictWithScan`, which scans fixed-size UTF-16 windows and averages predictions by window count. This is an internal strategy, not a semantic sentence splitter or exact percentage of words in each language. Chinese script refinement is a separate classifier step. [Explainer multilingual discussion](https://github.com/webmachinelearning/translation-api/blob/4334048603a5f8e5572d5ea77cef641f83712c4a/README.md#multilingual-text), [scan implementation](https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/components/language_detection/core/language_detection_model.cc#L172), [wrapper and script refinement](https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/platform/language_detection/language_detection_model.cc#L67).

**Repository recommendation:** a dominant whole-history result must not erase minority-language messages. If language matters to an optional summary, inspect meaningful message/paragraph groups and retain ambiguous or mixed segments. Joining unrelated short titles can produce a confident classification of an artificial aggregate. Detection cannot prove that every segment is safe to summarize in a chosen language.

## Cancellation, destruction, quotas, and errors

**Official lifecycle contract:** `create({signal})` and `detect(text, {signal})` accept abort signals. Creation cancellation rejects its promise and stops monitoring; it need not stop a browser-shared download. `destroy()` rejects pending calls and allows resource release when no other consumer needs the model. It does not uninstall downloaded assets. [Explainer destruction and aborting](https://github.com/webmachinelearning/translation-api/blob/4334048603a5f8e5572d5ea77cef641f83712c4a/README.md#destruction-and-aborting).

**Pinned implementation observation:** creation's signal remains attached to the resulting detector: aborting it later destroys the detector and propagates its reason. A detection signal aborts that request without destroying a reusable detector. Cancellation rejects the resolver and prevents late completion from publishing results; it does not establish immediate termination of all scheduled model computation. [Lifetime and operation signals](https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/on_device_translation/language_detector.cc#L323), [abort-aware resolver](https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/on_device_translation/resolver_with_abort_signal.h).

**Repository recommendation:** separate detector lifetime and per-request controllers when reusing an instance. On reset/teardown, invalidate the operation generation, abort, and destroy. For editable inputs, snapshot the text and discard results from superseded requests; cancellation alone does not associate results with the latest UI state. Treat a custom abort reason as cancellation too, rather than requiring every rejected value to have `name === 'AbortError'`.

The generic contract includes usage measurement and `QuotaExceededError` for excessive inputs. At this Chromium pin, however, detector `inputQuota` is **Infinity** and measurement asynchronously resolves **0** after state/abort checks. This is not Prompt API token accounting, and does not imply unlimited memory or negligible latency. **Repository recommendation:** bound retained input, avoid redundant measurement before every detection, and handle real failures without assuming Nano's context limit applies. [Current quota implementation](https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/on_device_translation/language_detector.cc#L410).

Relevant failures include invalid tags (`RangeError`), policy/activation denial (`NotAllowedError`), unsupported languages or unavailable model (`NotSupportedError`), and cancellation. The draft also rejects detection in an inactive document with `InvalidStateError` and permits `UnknownError` for other implementation failures. Generic proposal download examples describe `NetworkError`, but the pinned detector's model-load failure is exposed as `NotSupportedError`; do not promise a specific network diagnosis. Catch both availability and creation failures and avoid an automatic retry loop. [Creation checks and load errors](https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/on_device_translation/language_detector.cc#L138), [draft detection and errors](https://github.com/webmachinelearning/translation-api/blob/4334048603a5f8e5572d5ea77cef641f83712c4a/index.bs).

## Secure contexts, embedding, local execution, and PWA use

**Pinned API declaration:** the interface requires a secure context. **Chrome guidance:** normal access belongs to the top-level window and same-origin frames; cross-origin delegation uses `allow="language-detector"`. Workers are not supported by the documented web API. The source contains a separate worker gate and references extension service workers; this does not authorize a PWA service-worker inference design. [Chrome embedding and workers](https://developer.chrome.com/docs/ai/language-detection#permission_policy_iframes_and_web_workers), [IDL gates](https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/on_device_translation/language_detector.idl#L26).

The Chrome implementation is client-side: source loads a model file into a TensorFlow Lite classifier and calls it locally. Initial preparation can need a connection; inference with a ready detector does not call a translation cloud service. The broader proposal permits other implementation strategies, so the interface name alone is not a cross-browser privacy guarantee. [Local model loading and classification](https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/components/language_detection/core/language_detection_model.cc#L65), [explainer implementation alternatives](https://github.com/webmachinelearning/translation-api/blob/4334048603a5f8e5572d5ea77cef641f83712c4a/README.md#goals).

**Repository recommendations:** retain browser-only processing and IndexedDB persistence. Keep raw text out of diagnostic logs by default. App telemetry, tool calls, or exports can still transmit data independently of the detector. Service-worker app-shell caching does not cache Chrome's model assets or guarantee a first offline detection. Keep inference in the window and report optional readiness independently of offline shell/data status. Do not inherit Nano hardware/storage thresholds or assume installing the PWA changes API eligibility.

## Original browser example: classify only when resources are ready

This standalone JavaScript function is an **untested original example**, suitable for a deliberate diagnostic action. It declines creation when the readiness query reports preparation is needed. `0.8` is an illustrative application threshold requiring evaluation, not an official reliability guarantee. The creation signal governs this one-shot detector's whole lifetime; `finally` destroys it. Availability is a snapshot: the API has no atomic create-without-download option, so strict no-download background work should receive an already prepared detector instead of creating one here.

```js
async function detectPreparedText(text, {
  signal,
  threshold = 0.8,
  onProgress = () => {}
} = {}) {
  if (!isSecureContext || !('LanguageDetector' in self)) {
    return { status: 'unsupported' };
  }
  signal?.throwIfAborted();
  if (!text.trim()) return { status: 'unknown', candidates: [] };
  const options = {}; // No inferred or forced expected-language list.
  const state = await LanguageDetector.availability(options);
  signal?.throwIfAborted();
  if (state !== 'available') return { status: state };

  let detector;
  try {
    detector = await LanguageDetector.create({
      ...options,
      ...(signal ? { signal } : {}),
      monitor(m) {
        m.addEventListener('downloadprogress', e => onProgress(e.loaded));
      }
    });
    const candidates = await detector.detect(text, signal ? { signal } : {});
    signal?.throwIfAborted();
    const best = candidates[0];
    if (!best || best.detectedLanguage === 'und' ||
        best.confidence < threshold) {
      return { status: 'unknown', candidates };
    }
    return { status: 'candidate', language: best.detectedLanguage, candidates };
  } finally {
    detector?.destroy();
  }
}
```

The caller catches errors, supplies an operation-specific controller, and verifies that the text/revision is still current before displaying results. It can show a preparation action for `downloadable` or `downloading`; approving that action belongs to the separate [download workflow](chrome-model-downloads.md). A production feature can reuse one prepared detector rather than repeatedly create it, with a distinct lifetime controller. A candidate result alone should not mutate item fields or enable a downstream model.

## Optional role in compaction and demo lessons

**Original recommendation:** detection may provide advisory evidence when deciding which historical prose is eligible for a language-specific summarization experiment. It remains optional: uncertain, unsupported, mixed, or unprepared detection can retain the original segment or skip optional compaction. Preserve exact task identifiers, receipts, approvals, and current human requests independently; a detected language cannot validate a summary or authorize actions. See the [compaction chapter](chrome-session-compacting.md) for closed-turn boundaries and recovery behavior.

Avoid mandatory detector creation on startup, hidden downloads during compaction, automatic translation of unsupported input, switching Prompt session language from a single result, and converting a high-confidence aggregate into a claim that all history is monolingual. These are application boundaries chosen for this static prototype, not additional browser API requirements.

**Demo observation:** the playground checks exposure/readiness, waits for interaction when resources are missing, installs progress listeners, renders names with `Intl.DisplayNames`, and checks Translator availability separately. It takes the first candidate, detects on each input event, and displays a percentage. **Repository recommendation:** adapt the API wiring while adding debounce/cancellation, stale-result suppression, an unknown/mixed state, explicit optional preparation, and cleanup. The demo's top-candidate translation flow and lack of application-specific confidence checks are not suitable evidence for automatic language routing here. [Pinned playground](https://github.com/GoogleChromeLabs/web-ai-demos/blob/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c/translation-language-detection-api-playground/script.js).

Future verification should record browser/channel, requested and negotiated tags, readiness, candidate distributions on representative complete prose and short/mixed inputs, cancellation, policy denial, and prepared offline inference. This is a proposed verification scope; no such measurements were performed for this research chapter.
