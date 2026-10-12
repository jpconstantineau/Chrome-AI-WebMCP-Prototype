# Chrome model downloads and preparation research

Research date: **2026-10-12**. Primary page: [Inform users of model download](https://developer.chrome.com/docs/ai/inform-users-of-model-download), published/updated **2025-10-01**. Scope: download notification, readiness, consent, cancellation, and recovery for this static browser-only prototype. Examples are original, illustrative, and **unexecuted**. This chapter does not report a model download or a successful browser experiment.

Read with [prerequisites and eligibility](chrome-ai-prerequisites.md), [Prompt API](chrome-prompt-api.md), [session management](chrome-session-management.md), [native Prompt tool use and flags](chrome-prompt-api-tool-use.md), and [native WebMCP](webmcp-overview.md). Those chapters own hardware/release details, session context, and tool capability checks.

## Authority and repository boundaries

**Official Chrome guidance** distinguishes resource download, extraction, and memory loading. The `create()` monitor combines the base model and required customizations into one progress resource. For client-only processing, the guide shows download progress followed by an indeterminate preparation indicator. Its alternative hybrid demo uses cloud inference while local preparation runs. Joining an existing download reports the still-missing portion. [Download guide](https://developer.chrome.com/docs/ai/inform-users-of-model-download#monitor_and_share_download_progress).

**Repository requirement:** [INTENT.md](../../INTENT.md) requires both Prompt API and native WebMCP before proceeding, a visible error when either is absent, and user permission before a missing AI model is downloaded. Approval precedes model preparation and IndexedDB preparation. [AGENTS.md](../../AGENTS.md) requires browser-only operation with no backend or build step; [DESIGN.md](../../DESIGN.md) calls for a minimal interface. Consequently, this prototype follows the client-only preparation path. It should keep its required APIs as hard gates and avoid adding the article's SDK, cloud fallback, credentials, or external inference service.

**Draft/source boundary:** the [Prompt community draft](https://webmachinelearning.github.io/prompt-api/#sotd) is dated **2026-10-06** and is not a W3C Standard. It delegates common creation to the writing-assistance infrastructure. Chromium observations below are pinned to commit **578db53b7ff6a3eaa28e561e25cb6b1e4878da3a**, fetched through the connected GitHub reader. A draft or source snapshot does not prove the user's installed Chrome behaves identically.

## Availability is configuration-specific

**Official contract:** `availability()` resolves one of four values; the requested options affect the result. It supplies a preparation decision, not a guaranteed future session. [Get-started states](https://developer.chrome.com/docs/ai/get-started#model_download).

| Value | Meaning | Prototype recommendation |
| --- | --- | --- |
| `unavailable` | The device or requested configuration cannot currently be supported. | Show an actionable failure; do not describe every failure as a missing model. |
| `downloadable` | Additional required resources can be downloaded. | Show explicit consent, then start creation from a real user action. |
| `downloading` | Required downloads are ongoing. | Join creation after the app's approved preparation action and attach a monitor. |
| `available` | A session can be created without additional downloads. | Create the session; keep a preparation state until creation succeeds. |

**Official Prompt guidance:** declare expected input/output languages and modalities consistently with the intended prompts. Ordinary output is text, and unsupported requests can produce `NotSupportedError`. Its `create()` accepts `monitor` and `signal`. [Prompt creation and options](https://developer.chrome.com/docs/ai/prompt-api#use_the_prompt_api), [expected input/output](https://developer.chrome.com/docs/ai/prompt-api#add_expected_input_and_output).

**Repository recommendation:** retain one capability configuration for availability and creation, including experiment-specific tool declarations where supported. A successful default English text session does not establish tool-call support, audio readiness, or another API's resources. Keep `monitor`, cancellation signals, and per-prompt response constraints distinct from the core capability options. Recheck after failures or a changed configuration; do not run a perpetual availability polling loop or persist an authoritative `modelInstalled=true` preference.

**Draft nuance:** availability can mask `available`/`downloading` as `downloadable` for privacy. Progress can be privacy-preserving rather than a raw network measurement. See [shared availability and masking](https://webmachinelearning.github.io/writing-assistance-apis/#privacy-availability-masking). Therefore, an observed state is unsuitable for diagnosing other sites' usage or inferring model identity.

## Progress-event contract and truthful percentages

**Pinned Chromium observation:** `CreateMonitor` is an `EventTarget` with an `ondownloadprogress` handler. The implementation dispatches `ProgressEvent` objects with `lengthComputable=true`, `loaded` normalized to **0–1**, and `total=1`. It requires a zero first update, suppresses duplicate/decreasing updates, and stops emitting when the supplied signal has aborted. [Monitor IDL](https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/create_monitor.idl#L9), [monitor implementation](https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/create_monitor.cc#L43).

**Pinned creation observation:** the Prompt create client constructs and calls the monitor before its creation checks. A thrown monitor callback prevents starting download. On successful browser creation, it ensures zero/completion notifications before resolving the session, with abort checks between those steps. Even an already available session can produce immediate completion events; an event does not prove new network transfer occurred. [Create client setup](https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/language_model_create_client.cc#L236), [completion handling](https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/language_model_create_client.cc#L430).

**Draft contract:** progress is relative to the bytes still needed when joining, uses fractions rather than exposed file size, quantizes to 1/65,536, and schedules changed updates after roughly 50 ms or at completion. These are algorithm details, not a promised event frequency in a busy page. [Shared creation algorithm](https://webmachinelearning.github.io/writing-assistance-apis/#create-an-ai-model-object).

**Repository recommendations:**

- Use `<progress max="1">`; display `loaded * 100` as approximate download progress. Do not treat `loaded` as bytes, multiply by a guessed model size, or promise a transfer speed/ETA from it.
- Label the meter **Model download**, rather than **App setup**, because IndexedDB, extraction, initialization, and memory loading have separate completion conditions.
- At download completion, remove the progress element's `value` and say **Preparing local AI…**. Do not invent extraction/loading percentages or announce **Ready** from the event.
- Wait for `create()` to resolve before retaining a session; also require successful app data preparation before opening the main screen. A successful session remains fallible on later prompts.
- For `available`, show a short generic preparation state without claiming a download occurred. Fast zero-to-one events should not flash an unnecessary download screen.
- Keep numeric progress scoped to one preparation attempt. A resumed/joined attempt can begin at zero because it measures remaining work, not lifetime installation progress.
- Keep phase text readable and use a polite status region. Avoid announcing every fraction to assistive technology; announce phase changes and coarsely throttled milestones.

## Consent, activation, and the documented discrepancy

**Recommended app state machine:** browser availability and app preparation are different state machines. The app can enter a generic preparation phase even when browser availability is already `available`.

| App phase | Entry/exit condition |
| --- | --- |
| Checking required APIs | If either native Prompt or native WebMCP is absent, enter the required-API error state. Otherwise inspect the requested AI configuration. |
| Awaiting permission | Missing resources require the repository's consent action. Decline stays at the gate. |
| Downloading | Show this attempt's observed progress after approved creation begins. Completion enters AI preparation. |
| Preparing local AI | Wait for successful session creation; no fabricated loading percentage. |
| Preparing local data | Prepare IndexedDB after approval and before exposing the main screen. |
| Ready | Both session and local data preparation succeeded; app owns the resulting session. |
| Canceled or failed | Keep a visible recovery state, release owned resources, and permit a deliberate new attempt. |

A future implementation may overlap approved local preparations, but must preserve their separate ownership and completion conditions. The example below deliberately sequences them to make that boundary explicit.

**Chrome guide wording:** get-started requests meaningful interaction for `downloadable` **or** `downloading`, and recommends `navigator.userActivation.isActive` while linking sticky activation. That wording mixes distinct activation concepts. [Chrome activation guidance](https://developer.chrome.com/docs/ai/get-started#user_activation).

**Pinned source behavior:** `RequiresUserActivation()` checks **only `downloadable`**. `MeetsUserActivationRequirements()` uses sticky activation when `kAIRelaxUserActivationReqs` is enabled; otherwise it consumes transient activation. The feature is enabled by default in this snapshot. The Prompt create client applies these checks to window contexts. [Activation helpers](https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/ai_utils.cc#L423), [feature default](https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/ai_features.cc#L9), [creation check](https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/language_model_create_client.cc#L282).

**Draft behavior:** Prompt passes `false` for the common creation algorithm's transient-activation requirement. Its downloadable branch then checks sticky activation; consuming activation belongs to the stricter transient branch. Joining `downloading` does not repeat that branch. [Prompt creation](https://webmachinelearning.github.io/prompt-api/#dom-languagemodel-create), [shared creation](https://webmachinelearning.github.io/writing-assistance-apis/#create-an-ai-model-object).

**Repository recommendation:** keep the explicit **Download and continue** consent action despite the relaxed source default. Call necessary creation directly from the real click/keyboard action, with options prepared beforehand; avoid unrelated asynchronous IndexedDB work ahead of that call. This accommodates stricter configurations without claiming every Chrome call consumes transient activation. A stored consent preference is an app decision and cannot manufacture browser activation. Do not invoke `.click()` or synthesize input to bypass a requirement.

Recommended consent copy: **“Chrome needs to prepare a local AI model. This may download a large file and take some time. Your app data will be processed on this device. Download and continue?”** Offer a decline action that stays at the preparation gate. Describe Chrome's required disk headroom separately from download size; see [prerequisites](chrome-ai-prerequisites.md). Model download consent also remains distinct from WebMCP tool permissions and approval of consequential actions.

## Ownership, cancellation, concurrency, and timeouts

**Draft cancellation contract:** aborting `create()` means the page no longer wants a model object and rejects its promise. The user agent **should** preserve the underlying download/progress, including page-controlled navigation. This is a should-level privacy requirement, not an app power to cancel Chrome networking. [Download cancellation](https://webmachinelearning.github.io/writing-assistance-apis/#privacy-availability-cancelation).

**Pinned renderer behavior:** the context observer rejects with the signal's abort reason, releases its receiver/resolver, and removes its abort handler. This proves cancellation of the renderer's outstanding request; it does not establish deletion of Chrome's shared model. [Context observer](https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/ai_context_observer.h#L62).

**Repository recommendations:**

| App action | Meaning and required handling |
| --- | --- |
| Cancel preparation | Abort this pending creation attempt and suppress its UI updates. Say **Preparation canceled; Chrome may continue downloading**. |
| Cancel after session creation | Explicitly destroy any session still owned by preparation; do not let a stale promise publish it as ready. |
| Retry | Recheck the same configuration, use a fresh controller, and allow Chrome to reuse its download. Do not promise a restart from zero. |
| Timeout | Treat this as an app waiting policy. Abort the outstanding attempt or offer continued waiting; retain the real error/reason. A UI timer cannot prove Chrome's download stopped. |
| IndexedDB fails after AI preparation | Release the newly created session and show data-preparation failure. Do not announce app readiness or erase existing records as recovery. |
| Navigate away | Stop app updates and release sessions. Do not describe it as uninstalling or stopping the shared model download. |

Use one pending preparation promise per app configuration, reset its guard in `finally`, and disable duplicate prepare buttons. Scope each callback to an attempt token or controller, so a canceled attempt cannot overwrite a later one. Across tabs, sharing Chrome's resources does not mean sharing JavaScript sessions or app locks. Avoid spawning many sessions to make one download appear faster, averaging several monitors into an invented percentage, or aborting unrelated consumers.

Do not use `Promise.race()` alone for timeout: the underlying create request could still settle later, leaving an unwanted session. A timer should signal the controller, and code should destroy any session that arrives after cancellation. Choose timeout/idle thresholds as product decisions and show continued waiting/retry; this research establishes no universal safe timeout. Long extraction, hardware evaluation, or suspended-page behavior can resemble a stalled transfer.

**Pinned error observations:** the Prompt create client rejects unsupported availability with `NotSupportedError`, failed activation with `NotAllowedError`, unsuccessful session creation/disconnection with `InvalidStateError`, and excessive initial input with `QuotaExceededError`. A monitor callback can reject with its own thrown exception. [Creation checks and failures](https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/language_model_create_client.cc#L264), [result/error handling](https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/language_model_create_client.cc#L469). **Recommendation:** classify by stage and actual reason; `NotAllowedError` need not always mean activation, and a creation failure is not necessarily a network failure. An aborted attempt can carry a custom reason. Preserve those details for diagnosis and offer suitable recovery without promising that retry can fix unsupported hardware, policy, or invalid options.

## Resumption, updates, eviction, redownload, and offline use

**Chrome lifecycle guidance:** Chrome selects the appropriate Nano variant after hardware evaluation. Interrupted connections resume; closing the triggering tab does not stop download; browser restart resumes if reopened within 30 days. A fresh-profile scam-detection path can make `availability()` trigger download. LoRA resources are API-specific. Updates are full downloads and can cause a prompt failure during hot swap. Purges can occur mid-session because of storage pressure, enterprise policy, or 30-day ineligibility; redownload requires a new `*.create()` call. JavaScript cannot query model version. [Model management](https://developer.chrome.com/docs/ai/understand-built-in-model-management).

**Chrome requirements:** initial download needs an unlimited/unmetered connection; subsequent local use can work offline. The documented initial free-space requirement is **22 GB**; below **10 GB** free after download, Chrome removes the model. These are storage thresholds, not its file size. [Hardware and network requirements](https://developer.chrome.com/docs/ai/get-started#required_hardware).

**Repository recommendations:** cache the static PWA shell independently, keep app records in IndexedDB, and treat browser-managed AI resources as a recoverable prerequisite. PWA installation, an origin storage-persistence grant, clearing app data, or destroying a session should not be described as controlling Nano installation/eviction. Offline app launch, offline app data, and offline inference need separate states. If resources disappear while offline, preserve the user's records and show preparation/retry guidance; a cached shell cannot redownload the model.

When a generation or creation fails, record a bounded diagnostic snapshot: configuration, observed availability, phase, last normalized progress, elapsed time, activation state, error name/message, and browser version/channel if supplied. Re-enter preparation deliberately after actionable recovery; avoid silently retrying downloads forever. Use the manual Broker State/Event Logs workflow in [prerequisites](chrome-ai-prerequisites.md) for diagnosis. No internals pages, flags, temporary profiles, logs, downloads, or tests were opened/executed for this research.

## Original unexecuted browser example

This is a preparation primitive, not a replacement implementation or a whole startup flow. The caller must first pass the repository's **native Prompt + native WebMCP gate**, display missing-resource consent, and invoke it from the approved real user action. `configuration` is the already checked session capability configuration. `prepareAppData` is the app's browser-only IndexedDB preparation hook; it must honor cancellation at its own safe boundaries. No build, SDK, backend, fallback, flag, or model deletion operation is implied.

```js
// Original sketch: not run or added to the application.
let activePreparation = null;

function prepareLocalApp({ configuration, prepareAppData, render }) {
  if (activePreparation) return activePreparation.promise;

  const attempt = { controller: new AbortController(), promise: null };
  const signal = attempt.controller.signal;
  activePreparation = attempt;
  const ownsUI = () => activePreparation === attempt && !signal.aborted;
  const show = (view) => { if (ownsUI()) render(view); };

  attempt.promise = (async () => {
    let session = null;
    let handedOff = false;
    try {
      show({ phase: "preparing-ai", indeterminate: true });

      // Called before unrelated app preparation so the user action is fresh.
      session = await LanguageModel.create({
        ...configuration,
        signal,
        monitor(monitor) {
          monitor.addEventListener("downloadprogress", (event) => {
            if (!ownsUI()) return;
            const fraction = Number(event.loaded);
            if (!Number.isFinite(fraction) || event.total !== 1) return;
            if (fraction >= 1) {
              show({ phase: "preparing-ai", indeterminate: true });
            } else {
              show({ phase: "download", fraction: Math.max(0, fraction) });
            }
          }, { signal });
        },
      });

      signal.throwIfAborted();
      show({ phase: "preparing-data", indeterminate: true });
      await prepareAppData({ signal });
      signal.throwIfAborted();
      show({ phase: "ready" });
      handedOff = true;
      return session; // App now owns this session and its later destruction.
    } finally {
      if (!handedOff) session?.destroy();
      if (activePreparation === attempt) activePreparation = null;
    }
  })();

  return attempt.promise; // Caller must catch/report rejection.
}

function cancelPreparation() {
  activePreparation?.controller.abort(
    new DOMException("App preparation canceled", "AbortError")
  );
  // Caller renders cancellation separately: show() suppresses aborted updates.
}
```

**Limitations:** the monitor is a progress observer, not a complete phase API. This sketch shows generic AI preparation at completion without claiming knowledge of extraction versus loading. A real UI should suppress download flashing when the prior availability is `available`, use consistent availability/create options, distinguish cancellation from failure, and call `session.destroy()` when the app releases the resulting session. Verify the installed Chrome's create-signal lifetime behavior before treating that controller as the final session's permanent lifetime controller; explicitly destroying an owned session avoids depending on draft/source differences.

The guide's sample guard is cleared on success but not its error path; a literal reuse can leave retries blocked. Treat that as a sample-level issue and keep attempt cleanup in `finally`. [Guide sample](https://developer.chrome.com/docs/ai/inform-users-of-model-download#client-side_only). This research example adds ownership and cancellation checks as repository recommendations; it has not been tested.

## Future evidence checklist

These are **proposed observations**, not performed validation:

- Record actual channel/version and requested options; compare exposed APIs, all four availability paths, and creation success separately.
- With user-authorized download testing, observe normalized progress, join an existing download, and confirm that completion precedes app readiness.
- Exercise decline, cancellation, failure, retry, timeout, repeated clicks, and IndexedDB failure; verify no stale attempt opens the main screen.
- Observe offline inference after successful preparation and offline recovery after browser-managed resource loss, without deleting app records.
- Compare native WebMCP/tool-use experimental gates with base Prompt readiness using the [flag/tool notes](chrome-prompt-api-tool-use.md). Avoid treating flags as routine user setup or as proof of installed behavior.

The official guide mentions an empty temporary Chrome profile for fresh-download UX testing. That is a future opt-in experiment, not an instruction executed here. No browser profile or repository implementation was modified.
