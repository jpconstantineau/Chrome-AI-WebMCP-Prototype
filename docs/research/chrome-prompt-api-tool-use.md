# What chrome://flags/#prompt-api-tool-use does

Research date: **2026-10-12**. This is a read-only investigation of public documentation and pinned source, plus the existing repository's recorded observations. No browser flags were changed and no application or model experiment was run.

## Answer

The flag enables the experimental **function-calling extension of Chrome's Prompt API**: a local language-model session receives tool descriptions and can propose structured calls; the application decides whether to execute them and returns correlated results. It does not automatically discover or execute WebMCP tools. The Prompt API explainer calls this open-loop operation; automatic execution inside a single native prompt is future work. [Prompt API explainer][P1]

There is a material implementation detail: at the Chromium revision below, selecting **Enabled** adds three features, not just the tool-use feature:

```text
AIPromptAPIToolUse
OnDeviceModelConversationBackend
AIApiFoundationalModel:model_version/v4
```

The registered flag identifier is `prompt-api-tool-use`, desktop-only, with `MULTI_VALUE_TYPE(kPromptAPIToolUseChoices)`. The current choices array contains Default and Enabled; Default adds no switch. It has no explicit Disabled choice in this revision. Therefore an earlier Chrome 154 UI or its setting must be described as an observation of that build, not reconstructed from today's source. [Flag choices and registration][C1]

The display name is “Prompt API Tool Use”; the description identifies function calling. [Flag description][C2] The conversation-backend feature itself defaults off. [Backend feature declaration][C3] The `v4` parameter is looked up in model configuration's experimental use-case map; the literal does **not** by itself establish the downloaded model's marketing name, exact weights or version on this machine. [Model selection][C4]

## Sources and version boundaries

| Evidence | Pinned revision or publication |
| --- | --- |
| Chromium public main snapshot | `578db53b7ff6a3eaa28e561e25cb6b1e4878da3a` |
| Web Machine Learning Prompt API proposal | `dfcddb444a2763a823e1a7a8bb0af7c54009536a` |
| GoogleChromeLabs Example Agentic Chrome Extension | `6f627070736a8ca451d5acb02b70f63a1e072f92` |
| Chrome Prompt API documentation | Updated 2026-08-26, read 2026-10-12 |
| Chrome WebMCP documentation | Updated 2026-10-07, read 2026-10-12 |
| Local walkthrough | `docs/weekly-review.md`, verification 2026-10-11, Chrome 154 |

A Chromium main snapshot is not the installed browser's exact release branch. The CG draft is a developing proposal, and the example extension is application code. Statements below distinguish these evidence types; compatibility must be measured on the actual browser version.

## What is exposed, and what remains independent

Blink declares `AIPromptAPIToolUse` experimental on Windows, macOS, Linux and ChromeOS. Its comment explicitly says this feature alone does not expose base `AIPromptAPI`. Base Prompt API, structured output, multimodal input and sampling parameters have separate runtime entries. “Experimental” is a runtime-feature status, not a guarantee of a working model on every desktop. [Runtime feature definitions][C5]

The tool-use gate covers the `tools` creation option and the three secure-context interfaces `LanguageModelToolCall`, `LanguageModelToolSuccess`, `LanguageModelToolError`. Their current IDL uses `callId`. Tool declarations have `name`, `description`, and object `inputSchema`; there is no native `execute` member. Message types add `tool-call` and `tool-response`, with typed call/result values. The interfaces' Window/Worker exposure annotations also depend on the corresponding base Prompt API context gates. [Tool-use IDL][C6]

`LanguageModel` itself is separately gated and requires a secure context. [Base interface IDL][C7] Chrome's public documentation describes ordinary web support from Chrome 148 and extension support from Chrome 138, separately from experimental tool use; it says workers are not generally available. These release numbers do not promise tool calling. Model download, hardware, disk space and policy still matter. Initial model download requires network and user activation; ordinary subsequent local inference can work offline. [Chrome Prompt API documentation][D1]

WebMCP is a different surface: `document.modelContext` registers, discovers and executes page tools. Chrome's WebMCP guide separately describes `enable-webmcp-testing` and suggests `prompt-api-tool-use` for the Example Agentic Chrome Extension's local-model provider; its remote-model provider is another option. [Chrome WebMCP guide][D2] PWA installation, service-worker caching, IndexedDB and local preferences are application facilities, not tool-use features. In this repository the flag's absence selects the existing JSON proposal bridge while page operations still use WebMCP; prior saved records surviving restart are local observations. [Repository app][L1] [Recorded walkthrough][L3]

The example extension's permissions (`sidePanel`, `scripting`, `webNavigation`, `favicon`, host access) belong to the extension, not this flag or this ordinary website. [Extension manifest][E1] An extension is not required to write a page-hosted tool loop.

## Session options and validation

Use explicit text plus tool modalities:

```js
const options = {
  expectedInputs: [{ type: 'text', languages: ['en'] },
                   { type: 'tool-response' }],
  expectedOutputs: [{ type: 'text', languages: ['en'] },
                    { type: 'tool-call' }],
  tools: [{
    name: 'read_count',
    description: 'Read the number of locally stored items.',
    inputSchema: { type: 'object', properties: {},
                   additionalProperties: false }
  }]
};
```

This is an original minimal declaration, not a proposed repository change. If restoring assistant-role tool calls in `initialPrompts`, `append()` or `prompt()`, also request `tool-call` in `expectedInputs`. [Draft input validation][P3]

In current renderer creation code, nonempty `tools` requires `tool-call` in expected outputs. Names must be nonempty and unique; descriptions nonempty; the schema must say `type: "object"`, optional `properties` must be an object, optional `required` must be an array. Property/getter and serialization exceptions propagate; circular references, functions, BigInt and unsupported values can fail conversion. Invalid declarations fail creation with TypeError, not an application tool-execution result. Creation rejects tool modalities when the runtime feature is unavailable and rejects unsupported output modalities. Empty `tools: []` does not activate a tool capability. This validation is not a complete promise of support for every JSON Schema keyword or successful model-generated arguments. [Renderer creation validation][C8]

Browser-side capability selection is driven by **nonempty tool declarations**, not merely expected tool input/output types. It requests `kToolUse` and checks feature enablement and the selected model's capabilities. Output types are text or tool calls; image/audio/tool-response outputs are rejected. [Browser creation/capability checks][C9]

### Availability is a preflight, not proof

Ask `LanguageModel.availability(options)` with the intended core options, then attempt `create(options)`, handling both failure stages. Chrome documents `unavailable`, `downloadable`, `downloading`, `available`; do not interpret a text-only preflight as a tool-session preflight. [Chrome Prompt API documentation][D1]

However, **this pinned Chromium implementation has a preflight gap**: `LanguageModel::ExecuteAvailability` converts expected inputs/outputs but constructs an empty tools vector, and sends that to `CanCreateLanguageModel`. Thus even supplying `options.tools` to availability does not exercise the manager's tool capability check through this path. The repository's initial preflight is text-only anyway. Constructor presence, “available”, successful text creation and successful tool-enabled creation are four separate observations. [Renderer availability implementation][C10] [Repository startup][L1]

Do not conclude that flag enablement downloads a tool-capable model successfully, repairs a blocked model process, or proves inference works. A small tool-enabled `create` and one inference are required to establish that on a specific build.

## Open-loop execution and call identity

The intended cycle is:

```text
User request
  → local Prompt API session (declared tool catalog)
  → proposed tool-call(s)
  → application validates names/arguments and asks for approval as needed
  → WebMCP executeTool → page callback → actual local result
  → user-role tool-response(s) sent back to the same session
  → model continuation, final text, or another bounded round
```

The host owns authorization, side effects, error reporting and loop limits. Tool registration alone does not place a catalog in a model session. Tool annotations or model prose do not establish user permission. The repository discovers only its own-origin, own-window known tools, maps readable model references to actual records and checks current state before dispatch. [Repository host loop][L1] [Repository catalog/results][L2]

The proposal treats call identifiers as opaque; copy the returned ID and name into the success/error response, and place the response immediately after the model's call turn. Handle every call in a batch, with a corresponding outcome for skipped or denied calls. The explainer's discussion of automatic concurrent `execute()` callbacks is under future closed-loop work; it is not evidence that native Prompt API executes page functions. [Open-loop explainer][P1]

Current Blink conversion uses `callId`, forwards model IDs without inventing a format, and creates typed call objects. [Output conversion][C11] Constructors require the ID/name fields but do not prohibit an empty ID; omitted arguments return null. [Call constructor][C12] Chromium's browser transport requires string ID/name, object call arguments, and exactly one success result or error message. It embeds declarations into model input and forwards generated calls through Mojo. [Browser transport][C13]

There is a further implementation limitation: the public model executor blocks generation while waiting for responses, but clears that state upon **any** tool-response input; its TODO explicitly calls for counting expected responses and validating IDs. Applications must maintain their own pending-call correlation and batch integrity. The draft's generation algorithm calls for nonempty IDs, but that does not make every experimental build produce them. [Executor state and TODO][C14] [Draft generation algorithm][P2]

The Example Agentic Chrome Extension still declares and consumes `callID`, capital D. Its backend uses `EasyLanguageModel`: wrapper callbacks suspend until the extension's agent loop supplies outcomes, and matching can fall back to name when IDs are empty. That wrapper behavior is application/library machinery, not implemented native closed-loop execution. [Example extension backend][E2] [Example extension typings][E3] This is distinct from the Model Context Tool Inspector; see [the reference harness comparison](chrome-reference-harness.md). The repo accepts both spellings and records which key arrived; its solitary empty-ID handling is explicitly tied to the Chrome 154 observation, with duplicate identities rejected. [Repository parser][L2]

## Success, error, batches, streaming and stopping

A success uses `new LanguageModelToolSuccess({callId, name, result: [...]})`; an execution failure/denial can use `new LanguageModelToolError({callId, name, errorMessage})`. Wrap either instance in `{type: 'tool-response', value}`, in a **user** message. Plain look-alike objects are not those interfaces. Chromium rejects wrong roles, undeclared input modalities and incorrectly typed values. Although the IDL lists text/object/image/audio result content, the current prompt builder explicitly rejects image/audio tool results; text and serializable object results are the supported path. Serialization failures are DataError; wrong instance types are SyntaxError in this implementation. [Prompt builder][C15] Constructors themselves store success/error fields; successfully constructing a multimodal result does not prove the prompt accepts it. [Success constructor][C16] [Error constructor][C17]

`prompt()` aggregates pending calls, appends them after text, and resolves a content array when the session reports nontext output types; text-only sessions resolve a string. [Prompt completion][C18] There is an observable documentation/code mismatch for streaming: the interface comment says dictionary sequences, but current `ModelExecutionStreamingResponder` enqueues ordinary text as **strings** and each tool call as an individual **content dictionary**. Consume actual chunks by type and preserve all calls; do not assume every chunk is an array or JSON text. [Streaming responder][C19] [Interface comment][C7]

An AbortSignal can cancel model prompting and session creation. Chromium's browser tests cover aborting create, clone, prompt and streaming. [Abort tests][C20] WebMCP execution has its own AbortSignal and callback cancellation contract; stopping inference is not a rollback of an already committed page/IndexedDB write. [WebMCP imperative guide][D3] The app propagates its signal, records actual receipts, caps dispatched calls, and only retries via JSON after a first native inference failure **before any dispatch**; it does not automatically replay writes after failure or Stop. [Repository host loop][L1]

## What tests establish

The Chromium tool-use web-platform tests use an **echo model**, including explicit trigger strings and argument hints; they test API plumbing rather than natural-language intelligence. Coverage includes invalid declarations, getter/circular serialization failures, output declaration requirements, supplied call history, role/modality errors, success/error responses, rejected image/audio results, cloning, mixed text and calls, and multiple batches in both prompt and streaming. IDs in these echo tests are nonempty; that is not a guarantee about a real model. [Tool-use WPT][C21]

Browser unit tests simulate calls and verify forwarding, structured history/clone/overflow behavior, successful result/error continuations, absent capability rejection and the open-loop sequence. Renderer tests also cover the structured prompt result. These are source tests reviewed, **not tests executed during this research**. [Browser tool tests][C22] [Renderer result test][C23] The example extension's tests similarly stub LanguageModel and cover batch results, changed catalogs, stopping, retries and text-only operation without tool constructors. [Example extension tests][E4]

## Interpreting the earlier Chrome 154 failures

The local report records successful natural-language review start/resume with tool use enabled, plus pre-dispatch `kErrorUnknown` during array capture, another failing scalar adapter, and later “model process crashed too many times”. After restart with experimental tool use disabled, the staged JSON path executed real WebMCP operations and retained saved data. These establish what happened in that walkthrough, not a controlled causal comparison. [Recorded walkthrough][L3]

Chromium's access controller increments a crash count on remote disconnect, blocks new sessions after a threshold until the next attempt time, and computes capped exponential backoff; successful responses reset the count. This explains a possible browser recovery gate after repeated failures, but neither proves why those earlier disconnections occurred nor attributes the crash to this flag or array schemas. [Access controller][C24] A source TODO, generic error, or correlation with one flag is insufficient to identify the root cause. No exact installed Chrome 154 source revision, model logs or crash trace was collected here.

## Recommended diagnostic matrix (proposed, not run)

Run future checks in a controlled browser profile and use a read-only toy tool first. Record full Chrome version/channel, OS/hardware, all relevant flags, origin/security context, model status/version from `chrome://on-device-internals`, exact declarations, actual IDs/chunk types, and stage/error details. Preserve production IndexedDB; do not reset browser state as a diagnostic shortcut.

| Check | Hold fixed / vary | Record or expected discriminator |
| --- | --- | --- |
| Base text | Tool use off/on, WebMCP constant | LanguageModel presence, text availability/create/inference; distinguishes base failures |
| Exposure | Same profile and build | Three constructor types and observed ID spelling; presence is only an exposure check |
| Tool preflight | Same small catalog and modalities passed to availability/create | Compare both outcomes; account for pinned availability omission |
| Toy native call | One read-only no-argument declaration | Raw response, name, arguments, ID, all calls; isolates function-calling plumbing |
| Result round | Text result, then structured object; separately error/denial | Correlated continuation, no unauthorized side effects |
| Schema growth | No args → one scalar → enum → array → nested/branch grammar, one change at a time | Separate declaration rejection, inference failure and bad arguments |
| Batching | Two distinguishable read-only calls | Every ID/outcome retained; duplicate/empty-ID behavior explicitly logged |
| Streaming | Same prompt via prompt and promptStreaming | Raw string/dictionary/array chunk types, order, completion, batch count |
| Cancellation | Before inference, while waiting approval, during page callback, after commit | No later dispatch; persisted outcomes remain truthful |
| WebMCP isolation | Invoke toy page tool manually with native tool use absent/present | Separates discovery/execution from model proposals |
| Host comparison | Native proposal path vs existing JSON bridge, WebMCP fixed | Same requests/data/catalog; report model/backend confounding |
| Browser isolation | Repeat in another supported build/profile, log model selection | Establish reproducibility rather than extrapolate main source to Chrome 154 |
| Offline/PWA | After successful model download, ordinary tab vs installed/offline | Check app cache/model readiness separately from tool use |

Keep the JSON bridge as the existing experimental comparison path. Prefer the smallest native schema for new diagnostics, increase complexity only after basic result rounds succeed, and stop repeated inference attempts if the browser reports a crash gate. File an upstream reproducer only with the exact failure stage, minimal schema/prompt, version and relevant diagnostics; label unknown causes honestly. Recommendations here require no server, dependency installation or build step.

## Source pointers

The linked line ranges are pinned and were inspected directly. The source evidence is scoped to public code; it does not inspect proprietary model weights or establish this machine's exact loaded model. Additional navigation points in the pinned sources: `about_flags.cc` 10412–10415 registers the flag; `language_model_create_client.cc` 300–394 gates modalities and converts declarations; `ai_manager.cc` 818–826 handles browser-side tool availability; tool-use WPT 548–592 checks creation/results, 922–1070 checks unsupported multimodal results, and 1530–1688 checks batches.

[P1]: https://github.com/webmachinelearning/prompt-api/blob/dfcddb444a2763a823e1a7a8bb0af7c54009536a/README.md#L174-L381
[P2]: https://github.com/webmachinelearning/prompt-api/blob/dfcddb444a2763a823e1a7a8bb0af7c54009536a/index.bs#L726-L753
[P3]: https://github.com/webmachinelearning/prompt-api/blob/dfcddb444a2763a823e1a7a8bb0af7c54009536a/index.bs#L890-L932
[C1]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/chrome/browser/about_flags.cc#L4795-L4799
[C2]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/chrome/browser/flag_descriptions.h#L5271-L5273
[C3]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/services/on_device_model/public/cpp/features.cc#L15-L16
[C4]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/chrome/browser/ai/ai_manager.cc#L312-L325
[C5]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/platform/runtime_enabled_features.json5#L455-L524
[C6]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/language_model_create_options.idl#L36-L153
[C7]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/language_model.idl#L21-L76
[C8]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/language_model_create_client.cc#L66-L210
[C9]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/chrome/browser/ai/ai_manager.cc#L1016-L1043
[C10]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/language_model.cc#L659-L685
[C11]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/ai_utils.cc#L453-L506
[C12]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/language_model_tool_call.cc#L13-L41
[C13]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/chrome/browser/ai/ai_language_model.cc#L64-L177
[C14]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/services/on_device_model/ml/on_device_model_executor.cc#L547-L607
[C15]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/language_model_prompt_builder.cc#L605-L718
[C16]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/language_model_tool_success.cc#L14-L26
[C17]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/language_model_tool_error.cc#L12-L24
[C18]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/language_model.cc#L1060-L1105
[C19]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/model_execution_responder.cc#L323-L400
[C20]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/web_tests/external/wpt/ai/language-model/language-model-abort.tentative.https.window.js#L9-L39
[C21]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/web_tests/external/wpt/ai/language-model/language-model-tool-use.tentative.https.window.js#L9-L44
[C22]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/chrome/browser/ai/ai_language_model_unittest.cc#L1835-L2526
[C23]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/language_model_test.cc#L473-L504
[C24]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/components/optimization_guide/core/model_execution/on_device_model_access_controller.cc#L35-L113
[E1]: https://github.com/GoogleChromeLabs/webmcp-extension/blob/6f627070736a8ca451d5acb02b70f63a1e072f92/extension/manifest.json#L7-L15
[E2]: https://github.com/GoogleChromeLabs/webmcp-extension/blob/6f627070736a8ca451d5acb02b70f63a1e072f92/extension/sidepanel/services/promptApiBackend.ts#L14-L22
[E3]: https://github.com/GoogleChromeLabs/webmcp-extension/blob/6f627070736a8ca451d5acb02b70f63a1e072f92/extension/sidepanel/types/promptApiTools.d.ts#L14-L40
[E4]: https://github.com/GoogleChromeLabs/webmcp-extension/blob/6f627070736a8ca451d5acb02b70f63a1e072f92/tests/extension/promptApiBackend.test.ts#L173-L250
[D1]: https://developer.chrome.com/docs/ai/prompt-api
[D2]: https://developer.chrome.com/docs/ai/webmcp
[D3]: https://developer.chrome.com/docs/ai/webmcp/imperative-api
[L1]: ../../app.js
[L2]: ../../harness.js
[L3]: ../weekly-review.md

