# Chrome built-in AI prerequisites research

Research date: **2026-10-12**. Scope: Chrome's current getting-started guidance and the primary references needed to distinguish browser API exposure, device eligibility, model readiness, and session creation. This is research documentation; no browser settings, models, implementation, dependencies, or tests were changed.

Read alongside [Prompt API](chrome-prompt-api.md), [model preparation and downloads](chrome-model-downloads.md), [streaming output](chrome-streaming-output.md), [Summarizer](chrome-summarizer.md), and [Language Detector](chrome-language-detection.md). Consent UI and progress mechanics belong to the download chapter; generation/rendering mechanics belong to the streaming chapter.

## Evidence boundaries and inconsistent metadata

**Official guidance:** get-started's header says updated **2025-05-20**; its footer says **2024-05-20**; its body ties five-language support to **Chrome 149**. These conflicting dates cannot reliably date that claim. [Get started](https://developer.chrome.com/docs/ai/get-started).

The more specific Prompt API guide displays **2026-08-26** and labels ordinary web availability Chrome **148**, extension availability Chrome **138**, and web sampling an origin trial. Its language list includes `en`, `es`, `ja`, `de`, and `fr`. These labels establish documentation claims, not a guarantee about the installed channel, hardware, flags, or model. [Prompt API status and languages](https://developer.chrome.com/docs/ai/prompt-api).

**Source cross-check:** Chromium implementation observations below are pinned to **578db53b7ff6a3eaa28e561e25cb6b1e4878da3a**, fetched through the connected GitHub reader. The rendered Prompt API community draft is dated **2026-10-06**; it is explicitly not a W3C Standard. Source and drafts help resolve wording, but neither establishes deployed behavior in the user's Chrome. [Draft status](https://webmachinelearning.github.io/prompt-api/#sotd).

**Repository recommendation:** retain runtime checks and separately record observed browser version/channel. Do not invent release guarantees from milestone labels or infer the user's device eligibility from the presence of an API name.

## Required hardware, operating system, and network

These **official Chrome prerequisites** cover Prompt, Summarizer, Writer, Rewriter, and Proofreader. [Required hardware](https://developer.chrome.com/docs/ai/get-started#required_hardware).

| Gate | Documented requirement |
| --- | --- |
| Windows | Windows 10 or 11. |
| macOS | Version 13 or later. |
| Linux | Supported. |
| ChromeOS | Chromebook Plus, platform **16389.0.0** or later. |
| Excluded foundation-model platforms | Android, iOS, and non-Chromebook Plus ChromeOS. |
| Initial free space | **22 GB** minimum on the Chrome profile volume. |
| GPU execution | **Strictly more than 4 GB VRAM**. |
| CPU alternative | **16 GB RAM** minimum and **four CPU cores** minimum. |
| Audio input | Prompt audio requires GPU. |
| Download connection | Unlimited data or an unmetered connection. |
| Later inference | Offline after resources are ready. |
| Low-space removal | Below **10 GB** free after download. |

**Repository recommendation:** treat 22 GB as free-space headroom, not model size; exactly 4 GB VRAM misses the documented GPU threshold. Explain eligibility without claiming a precise download size, GPU selection, minimum performance, or Linux distribution/architecture matrix that the page does not establish. The public API's availability result remains the operational check. Display desktop-only eligibility separately from responsive mobile layout: a usable-looking mobile UI cannot establish local model support.

Chrome states that model inference sends no data to Google or third parties. This describes the browser model; **repository recommendation:** separately assess application network activity, tools, logging, and explicit exports. [Chrome network guidance](https://developer.chrome.com/docs/ai/get-started#required_hardware).

Translator and Language Detector use expert models; their requirements must be assessed independently. Their Chrome guidance is desktop-only. **Repository recommendation:** do not inherit Nano's RAM/VRAM thresholds without API-specific evidence. See [Language Detector research](chrome-language-detection.md), [Chrome model types](https://developer.chrome.com/docs/ai/built-in/overview#benefits_of_built-in_ai_for_web_developers), and [expert API desktop guidance](https://developer.chrome.com/docs/ai/language-detection#get_started).

## Exposure, availability, and successful creation are separate

**Official implementation observation:** `LanguageModel` is a secure-context, runtime-gated interface. The source marks desktop platform exposure stable but has a separate worker gate. This is JavaScript exposure, not evidence that a model is installed or that a session's requested capabilities work. [Pinned IDL](https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/language_model.idl#L21), [pinned runtime features](https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/platform/runtime_enabled_features.json5#L454).

**Official shared API contract:** availability is a promise describing the requested configuration. Its four outcomes are:

| State | Interpretation | Repository response recommendation |
| --- | --- | --- |
| `unavailable` | Requested configuration cannot currently be supported. | Show a specific preparation failure; do not call it simply “model missing.” |
| `downloadable` | Required resources can be acquired. | Route to explicit preparation/consent. |
| `downloading` | Resources are being acquired. | Join preparation and expose progress. |
| `available` | Required resources are ready for creation. | Create a session and handle failure. |

The shared draft also permits privacy masking of actual `available`/`downloading` status as `downloadable`. Availability is not a universal hardware diagnosis or a way to determine another origin's activity. [Shared availability](https://webmachinelearning.github.io/writing-assistance-apis/#availability), [download masking](https://webmachinelearning.github.io/writing-assistance-apis/#download-masking).

**Repository recommendation:** use a layered gate: secure context, required API/functions exposed, requested language/modality configuration available, successful session creation, then successful inference. Keep WebMCP exposure/capability checking independent. Optional Summarizer or Language Detector capabilities should have their own readiness records. This preserves `INTENT.md`'s hard gate for Prompt API and WebMCP without confusing an absent interface with a pending model.

Match `expectedInputs`/`expectedOutputs` between availability and creation, including system/user languages and modalities. Ordinary Prompt output is text; unsupported requests can reject with `NotSupportedError`. The Chrome guide's instruction to use the “same options” with prompting is best read as keeping session capability declarations consistent with intended requests, rather than copying prompt cancellation options into capability declarations. [Expected input/output](https://developer.chrome.com/docs/ai/prompt-api#add_expected_input_and_output).

**Repository recommendation:** retain English text as a deliberate experiment boundary if desired. Do not equate UI/browser language, a language tag's syntactic validity, or plausible model output with supported declared languages. The five-language Chrome 149 qualifier deserves a fresh runtime check, especially on older releases.

## Secure contexts, localhost, embedding, and PWA execution

**Official platform rule:** HTTPS origins and loopback addresses are potentially trustworthy. Localhost names qualify when the browser guarantees loopback resolution. The standard also treats `file:` as potentially trustworthy; that alone does not establish a complete working PWA deployment. An insecure ancestor can affect a nested document's secure-context status. Check `isSecureContext` in the actual document. [Secure Contexts](https://www.w3.org/TR/secure-contexts/#is-origin-trustworthy).

**Repository recommendation:** use a top-level HTTPS static origin or ordinary trustworthy localhost static origin. A development server serving static files does not introduce an application backend or build requirement. Do not declare all HTTP origins secure because one works on localhost, or recommend security overrides as the default setup.

**Official Chrome guidance:** Prompt access defaults to top-level windows and same-origin frames; cross-origin frames need delegation such as `allow="language-model"`. The community draft assigns a `self` default allowlist. [Chrome embedding guidance](https://developer.chrome.com/docs/ai/prompt-api#permission_policy_iframes_and_web_workers), [draft permission policy](https://webmachinelearning.github.io/prompt-api/#permissions-policy-integration).

**Pinned implementation observation:** a policy-blocked `availability()` resolves `unavailable`, while `create()` rejects `NotAllowedError`. Thus the same unavailable state can reflect embedding policy rather than insufficient hardware. [Pinned policy checks](https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/language_model.cc#L516).

The Chrome guide says Prompt is unavailable in web workers. The pinned IDL contains a separately gated worker surface and the create client comments distinguish extension workers. That is not ordinary web-worker or PWA-service-worker support. [Pinned worker exposure](https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/language_model.idl#L22), [pinned create client](https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/language_model_create_client.cc#L282).

**Repository recommendation:** keep inference owned by the app window. Installing the PWA does not bypass API, device, language, policy, or model gates. Cache the app shell through the service worker and keep app data in IndexedDB; treat the Chrome-managed model as a separate prerequisite. Offline launch, offline data access, and offline inference are three separate capabilities. A cached app shell cannot compensate for absent model resources.

## User activation: guide wording versus current source

**Official guide wording:** get-started requests interaction before `create()` for `downloadable`/`downloading`, but recommends `isActive` while linking sticky activation. [Guide activation section](https://developer.chrome.com/docs/ai/get-started#user_activation).

**Official web-platform definitions:** `isActive` reports transient activation; `hasBeenActive` reports sticky activation. A synthetic event or calling a handler is not evidence of a real user activation. [HTML user activation](https://html.spec.whatwg.org/multipage/interaction.html#the-useractivation-interface).

**Current pinned Chromium behavior:** `RequiresUserActivation()` checks **only `downloadable`**. `MeetsUserActivationRequirements()` uses sticky activation when `kAIRelaxUserActivationReqs` is enabled, and otherwise consumes transient activation. The relaxation is enabled by default in the pinned source. This is source evidence, not a measurement of every released Chrome configuration. [Pinned activation helpers](https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/ai_utils.cc#L423), [pinned feature default](https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/ai_features.cc#L9).

**Draft distinction:** Prompt passes `requireTransientActivation=false` to shared creation. Shared creation checks sticky activation in that mode when starting a downloadable resource; consumption belongs to the stricter transient branch. It does not require this activation again merely to join `downloading`. Consequently, a blanket statement that every Prompt download requires and consumes transient activation is inaccurate for this source/draft snapshot. [Prompt creation](https://webmachinelearning.github.io/prompt-api/#dom-languagemodel-create), [shared creation algorithm](https://webmachinelearning.github.io/writing-assistance-apis/#create-an-ai-model-object).

**Repository recommendation:** start preparation from the existing explicit Download and continue action and avoid unrelated asynchronous work before necessary creation. This accommodates stricter configurations and communicates consent even where sticky activation suffices. A stored app consent preference is not browser activation. Record activation state for diagnosis; do not claim the application tested or controlled Chrome's activation mode. Preparation remains fallible after an availability check.

## Browser-managed models, sharing, offline use, and eviction

**Official lifecycle guidance:** Chrome selects a suitable Nano variant after hardware evaluation; a GPU performance check can lead to a larger/smaller model or CPU fallback. Downloads survive tab closure and interrupted connections; browser restart resumes within a documented 30-day window. Updates can replace the model during use; JavaScript cannot query the model version. An update is a full model download, with possible failure at a hot swap. Purges can occur mid-session for low disk space, enterprise disabling, or 30 days without other eligibility criteria. After purge, **a new `*.create()` call must trigger download**. [Model management](https://developer.chrome.com/docs/ai/understand-built-in-model-management).

That guide records an exception: `availability()` shortly after a fresh profile starts can sometimes trigger download when Nano-powered scam detection is active. Treat probing as a browser call with documented exceptions; this research did not execute it. [Initial model lifecycle](https://developer.chrome.com/docs/ai/understand-built-in-model-management#initial_model_download).

This more specific lifecycle statement qualifies get-started's shorthand about redownloading once requirements return. Meeting hardware/storage requirements does not itself prove an app-owned redownload occurred.

**Official shared-resource distinction:** the Prompt draft describes model sharing. Shared infrastructure permits per-origin/options masking and resources beyond a base model; one site's readiness does not establish all other configurations' readiness. This research does not establish that all Chrome profiles, APIs, or customizations share one permanent download. [Prompt introduction](https://webmachinelearning.github.io/prompt-api/#intro), [shared privacy discussion](https://webmachinelearning.github.io/writing-assistance-apis/#model-availability).

**Repository recommendation:** never put a “model installed forever” flag in local preferences, promise that PWA cache persistence pins Nano, or treat an earlier successful session as a lifetime entitlement. Recheck on preparation/recovery and preserve app records independently of AI session failure. Keep model preparation recoverable, including when offline after eviction. An app-level cancel means preparation is no longer wanted; shared download cancellation details belong to [model downloads](chrome-model-downloads.md).

**Official enterprise gate:** `GenAILocalFoundationalModelSettings=1` prevents download and deletes an existing model; desktop `ComponentUpdatesEnabled=false` can also disable downloading. A policy-supported platform such as Android is not evidence that the web Prompt API is exposed there. [Chrome Enterprise policy](https://chromeenterprise.google/intl/en_au/policies/gen-ai-local-foundational-model-settings/).

## Debugging and feature gating without changing the environment

**Official troubleshooting:** use `chrome://on-device-internals` for installed size/version and Broker State errors. The debugging guide directs developers to Event Logs and optionally a JSON Dump for a Chromium bug report. Its February 2025 Prompt example and statement that structured output was not implemented are historical; use current Prompt/structured-output documentation for API syntax. [Localhost troubleshooting](https://developer.chrome.com/docs/ai/get-started#troubleshoot_localhost), [model version inspection](https://developer.chrome.com/docs/ai/understand-built-in-model-management#automatic_model_updates), [debug built-in models](https://developer.chrome.com/docs/ai/debug-built-in-model), [current structured output](https://developer.chrome.com/docs/ai/structured-output-for-prompt-api).

**Repository recommendation:** inspect context/exposure first, then actual options and availability, then creation error name/message, policy, model state, and logs. An `unavailable` result supplies no complete hardware diagnostic. Record a bounded diagnostic snapshot rather than a success boolean: origin/security, interface/function presence, requested configuration, availability state, browser version/channel supplied by the user, activation state, and errors. Logs can contain prompt content; review before deliberately sharing them. No logs were exported or sent during this research.

**Pinned implementation observation:** native tool use and web sampling have separate experimental gates; structured output has a separate stable gate. Additional feature gates do not themselves expose the base Prompt API. [Pinned runtime definitions](https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/platform/runtime_enabled_features.json5#L491).

**Repository recommendation:** distinguish baseline text Prompt eligibility from native tool use, sampling, optional task APIs, and WebMCP. A browser version string or successful English text creation does not prove the whole agent harness works. Keep unsupported-native-feature messages actionable; do not silently introduce a cloud fallback, polyfill, SDK, API key, or backend under this repository's local-only intent.

## Do and don't, with authority made explicit

| Authority | Do | Don't |
| --- | --- | --- |
| Chrome best-practice guidance | Prepare sessions after clear user intent, with `initialPrompts` ready; destroy unused sessions. | Wait needlessly for first generation to begin all preparation, or retain unnecessary sessions. |
| Prototype recommendation | Retain explicit consent and separate exposure, eligibility, preparation, and operational failure states. | Convert a model pending state into “browser unsupported.” |
| Prototype recommendation | Use current configuration checks and recover when resources disappear. | Infer readiness from a remembered download, PWA installation, or another API's success. |
| Prototype recommendation | Follow API-specific primary guidance for each optional capability. | Apply Nano requirements to every expert model or assume every experimental option is shipped. |
| Prototype recommendation | Keep diagnostics separate from ordinary minimal UI. | Expose internal source gates as product controls or change browser flags during research. |

The first row summarizes [Chrome's official do/don't guidance](https://developer.chrome.com/docs/ai/built-in-ai-dos-donts#prepare_the_model_at_a_reasonable_time). Remaining rows are our deductions for `INTENT.md`'s static, browser-only prototype, not additional browser requirements.

## Questions requiring later runtime evidence

- Which exact APIs and optional features the user's installed Chrome exposes, on its current channel and origin.
- Whether its current hardware, model variant, languages, modalities, enterprise policies, and connection permit the intended session configuration.
- Actual latency, cancellation, update/purge recovery, and offline behavior with the cached app and current model resources.
- Whether a particular release/configuration uses the pinned source's default sticky activation behavior.

These remain intentionally untested. Research does not require installs, flags, model downloads, origin-trial registration, inference, or implementation changes.
