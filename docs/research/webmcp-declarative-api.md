# WebMCP declarative API research

Research date: **2026-10-12**. This chapter reviews sources only. No browser experiment, application change, dependency installation, build, flag change, or runtime test was performed. It follows the static, browser-only constraints in [AGENTS.md](../../AGENTS.md), [INTENT.md](../../INTENT.md), and [DESIGN.md](../../DESIGN.md).

## Evidence and version boundaries

| Source | Reviewed snapshot | Authority and limits |
| --- | --- | --- |
| [Chrome declarative guide][guide] | Published 2026-05-18; updated 2026-09-25 | Public guidance, including Chrome 156 event changes; experimental and subject to change |
| [WebMCP Community Group draft][draft] and [declarative explainer][explainer] | `d0e4e0e0f039358cc9d93f90074116622bfebd53` | Proposed semantics; the declarative explainer leaves synthesis and cross-document responses unresolved |
| [Chromium form implementation][form], [schema implementation][schema], [ModelContext][context], and checked-in tests | `578db53b7ff6a3eaa28e561e25cb6b1e4878da3a` | Exact source behavior; not verification of the user's installed Chrome |
| [GoogleChromeLabs examples][demos] | `04732fb849ab5eff0cd8d13c6f153e26ebb7bcad` | Demonstrations, including polyfill and remote-model paths; not normative contracts |

The draft's `index.bs` specifies the shared imperative/event machinery but does **not** contain declarative form algorithms at this pin. The separate explainer is necessary, and its open questions must not be represented as settled API rules. Shared discovery, owner/window identity, secure contexts, Permissions Policy, cancellation, annotations, serialization differences, and host approval belong to [imperative API research](webmcp-imperative-api.md). This chapter concentrates on forms.

## Declaring and discovering a form tool

The Chrome guide presents `toolname` and `tooldescription` as form annotations, `toolparamdescription` as optional parameter guidance, manual submission as the default, and `toolautosubmit` as automatic submission. It places activation/cancellation events on `document.modelContext`, removes the old window handlers from Chrome 156, and describes active-form/submit-button CSS states. These are the public authoring entry points. [Chrome guide][guide].

Chromium additionally implements optional **`tooltitle`**, a human-facing title independent of the identifier and description. `toolautosubmit` is a boolean HTML attribute: presence enables it, including `toolautosubmit="false"`; remove the attribute to disable it. A connected form must have both required annotations. The implementation also needs an active frame, script execution capability, both WebMCP runtime features, and the `tools` Permissions Policy. A sandbox without `allow-scripts` cannot register it. Merely seeing attributes in the DOM establishes none of those capabilities. [Form, lines 361–480][form-registration]; [ModelContext, lines 320–324 and 823–865][context].

Names follow the shared identifier constraints: 1–128 ASCII letters/digits, underscore, hyphen, or period. Do not copy the explainer's illustrative `toolname="Search flights"`: its space fails the pinned implementation. A duplicate declarative name silently fails registration; the first registered definition remains. A collision with an imperative tool does not replace that tool, and subsequently removing the rejected form must not unregister the existing owner. Declarative failures have TODOs for better reporting, so waiting indefinitely for `toolchange` after a rejected registration is unsafe. [Registration implementation][context-registration]; [duplicate tests][duplicates]; [imperative collision tests][collision].

Insertion and valid updates schedule registration through a DOM task; removal or loss of a required annotation unregisters immediately. Changes to `toolname`, `tooldescription`, `tooltitle`, `toolautosubmit`, or the computed schema can replace the definition and cancel a pending invocation. An unchanged computed schema avoids a redundant replacement; unrelated attributes do not imply a catalog change. Consumers should invalidate their catalog on `toolchange`, then rediscover, rather than cache a form's first schema forever. Existing mutation tests cover attributes, controls, and names. [Form registration][form-registration]; [attribute mutation tests][mutations]; [declarative test directory][tests].

## Schema synthesis and field meaning

The parameter key comes from the control's trimmed **`name`**, not its `id`, label, placeholder, or visible text. Associate labels correctly for accessibility and descriptions, but labels do not supply missing parameter names at this pin. The browser traverses associated `ListedElements`, so form ownership matters, including controls associated through `form=`, rather than only descendants. Disabled and readonly ordinary controls are excluded. Unsupported control/group combinations do not become schema properties. Missing names/descriptions can generate DevTools issues. [Control name, lines 405–409][control]; [schema, lines 121–204 and 1238–1287][schema].

For a single control, nonempty `toolparamdescription` wins; otherwise Chromium concatenates associated label text, omitting labelable descendants, then uses `aria-description`. Multiple labels are separated with semicolons. For a radio group or multiple same-name checkboxes, the group description comes from `toolparamdescription` on the nearest common ancestor `fieldset` within the form; it does not combine the members' descriptions. Member labels still describe individual choices. [Description synthesis, lines 1147–1235][schema-description].

| Control or group | Schema at the Chromium pin | Important boundary |
| --- | --- | --- |
| Text, textarea, email, search, tel, URL, password | `type: "string"`; valid `pattern` included; `required` contributes to the root required list | The synthesizer does not export every HTML constraint; do not assume `minlength`, `maxlength`, or email/URL formats appear in JSON |
| Number/range | `type: "number"`, min/max, and `multipleOf` when step and step base permit it | Number remains number rather than integer; range supplies defaults of 0 and 100 |
| Date | String with `format: "date"` and date-format description | Date min/max are not numeric JSON Schema bounds; HTML validation remains relevant |
| Datetime-local/month/week/time | Strings with format/pattern/context synthesized for the relevant control | Inspect the actual generated schema; local datetime does not silently acquire a timezone |
| Single select | String; `enum` of option values plus `anyOf` entries carrying `const` and `title` | Send `value`, not display title; `"6"` is a string even when it means six people |
| Multiple select | Array of strings, the same choice metadata under `items`, `uniqueItems: true` | Repeated selections are invalid |
| One checkbox | Boolean | This means checked state, not its HTML string `value` |
| Same-name checkboxes | Array of unique checkbox values | The supplied set checks members in the set and unchecks other members |
| Same-name radios | String choice with `enum`/`anyOf` and label-derived choice titles | Mixed control types under one name are not a generic object representation |
| Hidden input | String only when explicitly exposed with a nonempty `toolparamdescription` | Do not turn internal IDs or grants into model-controlled parameters accidentally |
| Color | String constrained to the implemented six-digit hexadecimal form | Not a general CSS color interface |
| Form-associated custom element/file | Special custom-element schema/fill hooks; file support behind an additional feature | These are additional experimental surfaces, not needed by this prototype; a path is not arbitrary file-read permission |

These are **implementation observations**, not a finalized portable synthesis specification. File filling checks granted accessible paths; custom elements need the supported internals schema/callback machinery. Ordinary duplicate-name text controls are not automatically arrays. [Schema, lines 491–929 and 1270–1438][schema]; [unit source tests][unit-tests].

Select choices preserve two meanings: the machine value in `enum` and `const`, and the human option text in `title`. A local status selector could therefore expose `value="in_progress"` with title `In Progress`. The model should pass `in_progress`; the result/UI can display `In Progress`. In contrast, descriptive phrases are guidance, not constraints: saying “today or later” does not enforce a date limit. Keep actual HTML constraints and application rules authoritative. [Select synthesis, lines 733–768][schema-select].

## Invocation, review, and submission

The pinned path parses object input, checks every supplied parameter/value before assigning any supplied values, then fills controls and sends normal input/change events. Unknown parameters, invalid choices, invalid types, or malformed internal JSON reject. The preliminary pass prevents a bad later parameter from causing partial field assignment, but user event handlers can still perform side effects during filling. **Omitted properties retain existing form values**; `{}` does not clear the form or establish that required fields were freshly provided. This matters when a user has already started editing. Flexible type conversion exists, so validate domain values rather than equating the generated schema with a strict JSON Schema validator. [Fill, lines 208–300][schema-fill]; [partial/transactional tests, lines 248–278 and 420–453][unit-tests].

Without `toolautosubmit`, execution needs an enabled successful submit button. After filling, Chromium activates pseudo-classes, focuses that button, pauses the agent operation, and waits for user submission; the execute promise remains pending. Missing a submit button fails execution even if the form appeared in discovery. A later human click completes this agent-originated invocation, so its submit event can have `agentInvoked === true`. An independent ordinary submission has false. **The flag identifies invocation context, not authorization or proof of a trusted human gesture.** [Form execution, lines 175–269][form-execution]; [manual submission tests][manual].

With `toolautosubmit`, Chromium immediately runs normal submission preparation. A submit button is optional. Interactive HTML validation precedes the submit event unless normal validation-bypass rules apply, including `novalidate`/`formnovalidate`. Invalid required/min/pattern values fail the pending tool before the app's submit handler runs; the implementation includes field validation messages. Business validation belongs in the handler as well. Setting `novalidate` requires replacing the skipped rules deliberately, as the Bistro example does. [Form validation, lines 734–854][form-validation]; [invalid-input tests][invalid].

For same-document completion, the essential ordering is:

1. In the synchronously dispatched submit listener, call `preventDefault()`.
2. Build the promise that will validate, apply the authorized operation, update visible state, and produce its outcome.
3. If `agentInvoked`, call `respondWith(promise)` **during that listener, before any await**.
4. Let the promise settle later. Return committed state or a bounded structured error.

`respondWith` throws `InvalidStateError` for an ordinary submit, if default was not prevented first, or after dispatch ended. Preventing an agent submit without supplying a response produces an execution error. A rejected response promise fails execution; a circular result fails serialization. Object results are JSON-stringified, while primitive results follow the form-specific conversion path; use explicit JSON-compatible object envelopes and treat the caller's result as transport data. Avoid inventing a universal MCP `content`/`isError` result requirement. [SubmitEvent, lines 53–94][submit-event]; [form response, lines 301–338][form-response]; [respondWith tests][respond-tests].

Normal submission/navigation instead resolves the in-page execution with **`null`**. That signals a navigation path, not successful persistence or a booking receipt. `form.submit()` bypasses the ordinary submit event/validation and also resolves a pending form tool with null. It is unsuitable for this app's same-document approval and IndexedDB transaction path. The explainer's destination JSON-LD extraction remains a debated proposal; a demo's JSON-LD or `resumeTool` path does not establish that contract for the current app. [Form, lines 856–880][form-navigation]; [navigation tests][navigation]; [explainer response discussion][explainer].

## Events, cancellation, and visible state

The current names are **`toolactivated`** and **`toolcancel`**, subscribed on **`document.modelContext`**. They carry `toolName`, are non-cancelable, and also apply to imperative executions in the pinned implementation. The declarative explainer still says `toolcanceled` and raises target questions; that wording is stale relative to the guide, current shared draft interfaces, and Chromium. Use the current names and owner rather than copying old window fallbacks. [Chrome guide][guide]; [draft event interfaces][draft]; [ModelContext event dispatch][context-events].

Activation means filling has run; it is not completion. **For autosubmit, the pinned implementation calls submission preparation before dispatching `toolactivated`.** Therefore activation is not a reliable pre-submit validation or approval gate. A detach caused by input handling suppresses activation. For manual review, it is useful for status text and highlighting, but authorization belongs inside the actual operation. [ModelContext, lines 541–588][context-events]; [detach test][detach].

Use `form:tool-form-active` and `button:tool-submit-active` (or the relevant submit input) to show the active form and selected submit control. Pending asynchronous `respondWith` can retain the active state until completion; invocation cancellation and reset clear it. Keep keyboard focus visible and explain the pending review in ordinary text. Activation is not an invitation to move focus repeatedly, replace the form, or erase user edits. [Form active-state methods and callback, lines 156–286][form-execution]; [pseudo-class tests][pseudo].

Cancellation has several paths, with a material source discrepancy:

| Cause | Source observation | Host consequence |
| --- | --- | --- |
| Caller abort signal | Execute promise rejects with `AbortError`; then the owner receives `toolcancel`; pseudo-classes are cleared | Handle rejection immediately; the event is UI notification, not rollback |
| Successful form reset | Form callback is rejected and active state cleared; checked-in test expects `UnknownError` | Reset is cancellation, never a successful result |
| Removal/definition or schema replacement | Pending form execution is cancelled unless protected during active submit handling | Avoid mutating the declaration while awaiting review/result |
| Destination/owner document detachment | May terminate the invocation or abandon its JavaScript result | Preserve committed local records; do not infer rollback |

The Chrome guide says reset fires `toolcancel`, but the pinned `HTMLFormElement::reset()` directly calls the completion callback and contains no such dispatch. The explainer also distinguishes site-driven cancellation from agent-driven cancellation. Do not rely on `toolcancel` to observe **every** form reset/removal; observe the form's `reset`/lifecycle and the execution promise too. A prevented reset does not execute its cancellation path. [Reset, lines 1115–1145][form-reset]; [manual/reset tests][manual]; [abort test][abort]; [ModelContext cancellation, lines 593–658][context].

Most source-side form failures reach `executeTool` as `UnknownError` at this Chromium pin, while the shared draft describes more granular errors. Record the exception name and useful bounded message without building recovery entirely around a future draft mapping. Cancellation of a response does not automatically abort an IndexedDB operation already started by site JavaScript. The operation must enforce its own commit boundary; report success only after commitment. [Result mapping, lines 1190–1206][context]; [imperative lifecycle research](webmcp-imperative-api.md).

## Illustrative static form

This is documentation, not a proposed runtime patch. It shows a benign same-document local list filter, with no backend action or navigation. `items` represents the existing in-memory records; normal UI submissions and agent submissions share the same path.

```html
<form id="research-filter" toolname="research_filter_items"
  tooldescription="Display local items with the chosen status." toolautosubmit>
  <label for="research-status">Status</label>
  <select id="research-status" name="status" required
    toolparamdescription="Status to display from the local list.">
    <option value="Open">Open</option>
    <option value="In Progress">In Progress</option>
    <option value="Completed">Completed</option>
  </select>
  <button type="submit">Apply filter</button>
</form>
<output id="research-result" aria-live="polite"></output>
<script>
const items = []; // Use the app's already-loaded local records.
const form = document.querySelector('#research-filter');
const output = document.querySelector('#research-result');
form.addEventListener('submit', event => {
  event.preventDefault();
  const status = new FormData(form).get('status');
  const result = ['Open', 'In Progress', 'Completed'].includes(status)
    ? { ok: true, data: { status, count: items.filter(i => i.status === status).length } }
    : { ok: false, error: { code: 'invalid_status', message: 'Choose a listed status.' } };
  output.textContent = result.ok ? `${result.data.count} items match.` : result.error.message;
  if (event.agentInvoked) event.respondWith(Promise.resolve(result));
});
</script>
```

A mutating variant would need the app's existing validated domain operation, grant checks, exact destructive-action confirmation where applicable, and transaction completion inside the response promise. Merely dropping `toolautosubmit` adds user form review; it does not implement the whole permission policy.

Tool metadata, labels, options, submitted arguments, and returned user-entered text cross different trust boundaries. Keep metadata developer-owned: an imported item title should not become `tooldescription` or a command embedded in a label. Treat returned descriptions and requests as data, including instructions planted in them. Ask only for fields needed by the visible task; a persuasive parameter description does not authorize disclosure of personalization, other-origin data, or private browsing context. The draft explicitly discusses metadata/output injection and over-parameterization. Schema presence and `agentInvoked` are not permissions. Preserve the app's tool allowlist, owner checks, first-use grant, and exact destructive-effect approval in the domain operation, including when an external caller invokes the visible form. [Draft security considerations][draft]; [imperative approval boundaries](webmcp-imperative-api.md).

## Official example trace and prototype decision

The relevant static example is **`demos/french-bistro`**, titled **Le Petit Bistro**; there is no `le-petit-bistro` directory in this pinned collection. Its form registers `book_table_le_petit_bistro`; `guests` demonstrates string values and readable option titles. `script.js` validates, returns a field-error array or modal text through `respondWith`, optionally adds autosubmit, and optionally navigates to `result.html`. Closing the modal resets the form. [Bistro form][bistro-form]; [script][bistro-script]; [README][bistro-readme].

The source is useful for flow comparison, but imports DOMPurify/CDN assets, loads a polyfill, and offers a Gemini API-key agent. Its imperative conversion contains a compatibility branch for string schemas; that comment is not evidence against the current structured-schema contract. Its result page experiments with JSON-LD and continuation tokens. The displayed reservation confirmation is simulated, not evidence of a real reservation transaction. Do not adopt its remote inference, polyfill, continuation, or network dependencies for this prototype. [Bistro result][bistro-result]; [tools/demo inventory](webmcp-tools.md).

`doors` exposes static navigation forms `openDoor1`, `openDoor2`, and `openDoor3`; `order-tracking` exposes `get_order_status` then `initiate_return`. These make navigation and changing catalogs concrete, but do not establish local persistence success. The complete inventory, including Angular declarative forms and mixed imperative/declarative examples, belongs to [WebMCP tools research](webmcp-tools.md). No demo build or provider evaluation was run.

**Prototype recommendation:** retain the current imperative dispatcher and domain-operation/approval gates. Declarative tools could later improve an existing visible add/edit/review form when browser measurements show reliable schema, focus, manual review, result, and cancellation behavior. That is an experimental option, not an implementation requirement. A future comparison should cover omitted/stale fields, invalid/disabled choices, manual correction, abort/reset/removal, schema changes during review, late responses, duplicate names, ordinary versus agent submit, and successful/failed IndexedDB commit. This chapter defines those evaluation questions without running them.

[guide]: https://developer.chrome.com/docs/ai/webmcp/declarative-api
[draft]: https://github.com/webmachinelearning/webmcp/blob/d0e4e0e0f039358cc9d93f90074116622bfebd53/index.bs
[explainer]: https://github.com/webmachinelearning/webmcp/blob/d0e4e0e0f039358cc9d93f90074116622bfebd53/declarative-api-explainer.md
[demos]: https://github.com/GoogleChromeLabs/webmcp-tools/tree/04732fb849ab5eff0cd8d13c6f153e26ebb7bcad/demos
[form]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/core/html/forms/html_form_element.cc
[form-registration]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/core/html/forms/html_form_element.cc#L361-L480
[form-execution]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/core/html/forms/html_form_element.cc#L156-L286
[form-validation]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/core/html/forms/html_form_element.cc#L734-L854
[form-response]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/core/html/forms/html_form_element.cc#L301-L338
[form-navigation]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/core/html/forms/html_form_element.cc#L856-L880
[form-reset]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/core/html/forms/html_form_element.cc#L1115-L1145
[schema]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/core/html/forms/form_mcp_schema.cc
[schema-description]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/core/html/forms/form_mcp_schema.cc#L1147-L1235
[schema-select]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/core/html/forms/form_mcp_schema.cc#L733-L768
[schema-fill]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/core/html/forms/form_mcp_schema.cc#L208-L300
[context]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/core/script_tools/model_context.cc
[context-registration]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/core/script_tools/model_context.cc#L823-L865
[context-events]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/core/script_tools/model_context.cc#L541-L588
[control]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/core/html/forms/html_form_control_element.cc
[submit-event]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/core/html/forms/submit_event.cc#L53-L94
[unit-tests]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/core/html/forms/html_form_mcp_tool_test.cc
[tests]: https://github.com/chromium/chromium/tree/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/web_tests/external/wpt/webmcp/declarative
[duplicates]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/web_tests/external/wpt/webmcp/declarative/duplicate-tool-name.https.html
[collision]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/web_tests/external/wpt/webmcp/declarative/name-collision-with-imperative-tool.https.html
[mutations]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/web_tests/external/wpt/webmcp/declarative/toolchange-on-attribute-mutation.https.html
[manual]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/web_tests/external/wpt/webmcp/declarative/executeTool-no-autosubmit.https.html
[invalid]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/web_tests/external/wpt/webmcp/declarative/executeTool-invalid-input.https.html
[respond-tests]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/web_tests/external/wpt/webmcp/declarative/executeTool-respondWith.https.html
[navigation]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/web_tests/external/wpt/webmcp/declarative/executeTool-navigation.https.html
[detach]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/web_tests/external/wpt/webmcp/declarative/executeTool-detach-toolactivated.https.html
[pseudo]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/web_tests/external/wpt/webmcp/declarative/executeTool-pseudo-classes.https.html
[abort]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/web_tests/external/wpt/webmcp/declarative/executeTool-abort.https.html
[bistro-form]: https://github.com/GoogleChromeLabs/webmcp-tools/blob/04732fb849ab5eff0cd8d13c6f153e26ebb7bcad/demos/french-bistro/index.html
[bistro-script]: https://github.com/GoogleChromeLabs/webmcp-tools/blob/04732fb849ab5eff0cd8d13c6f153e26ebb7bcad/demos/french-bistro/script.js
[bistro-readme]: https://github.com/GoogleChromeLabs/webmcp-tools/blob/04732fb849ab5eff0cd8d13c6f153e26ebb7bcad/demos/french-bistro/README.md
[bistro-result]: https://github.com/GoogleChromeLabs/webmcp-tools/blob/04732fb849ab5eff0cd8d13c6f153e26ebb7bcad/demos/french-bistro/result.html
