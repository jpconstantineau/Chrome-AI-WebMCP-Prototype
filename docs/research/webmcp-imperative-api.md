# WebMCP imperative API research

Research date: **2026-10-12**. Scope: the [Chrome imperative API guide][guide], the current pinned Community Group draft, Chromium implementation/tests, and official demos. This is a research artifact; no runtime, tests, flags, dependencies, or Git state were changed or exercised for this investigation.

## Evidence and version boundaries

| Evidence | Snapshot | What it establishes |
| --- | --- | --- |
| Chrome guide | Published 2026-05-18; updated 2026-09-21; retrieved 2026-10-12 | Public usage guidance and version notes. |
| `webmachinelearning/webmcp` | `d0e4e0e0f039358cc9d93f90074116622bfebd53` | Proposed semantics, not a shipped-browser guarantee. |
| `chromium/chromium` | `578db53b7ff6a3eaa28e561e25cb6b1e4878da3a` | Exact implementation and checked-in tests at this revision; not proof about the user's installed Chrome. |
| `GoogleChromeLabs/webmcp-tools` | `04732fb849ab5eff0cd8d13c6f153e26ebb7bcad` | Example implementation patterns; demos are not normative contracts. |

The guide illustrates registration, discovery, execution, annotations, events, and iframe sharing. Its version notes date independent in-flight execution after unregistration to Chrome 153, string-argument deprecation to Chrome 155, and debugging to Chrome 156. Some examples omit persistence; their success text is not transaction evidence. [Guide][guide].

The findings below distinguish **source behavior**, **source recommendations**, and **prototype recommendations derived from those sources**. An API being present does not prove model availability, authorization, or transaction success.

## Current API surface

The namespace is **`document.modelContext`**. It is a same-object, secure-context document attribute. The interface is exposed to `Window`, guarded by Chromium's `WebMCP` runtime feature. It is not a worker API. The current pins provide no `navigator.modelContext`, public `unregisterTool`, `provideContext`, `clearContext`, or `updateTool` method. Chromium's C++ `UnregisterTool` is internal. [Document IDL, lines 6–13][document-idl]; [ModelContext IDL, lines 65–81][context-idl].

| Call | Exact current argument/result shape | Meaning |
| --- | --- | --- |
| `registerTool(tool, options = {})` | Promise resolving to `undefined`; options have optional `signal` and `exposedTo` | Registers one tool; lifetime belongs to the document/registration signal. |
| `getTools(options = {})` | Promise of an array of `RegisteredTool`; options have optional `fromOrigins` | Obtains a current discovery snapshot. |
| `executeTool(descriptor, inputObject?, options = {})` | Promise of string or `null` in Chromium; execution options have optional `signal` | Browser-mediated invocation of the descriptor's owner. Omitted/undefined input means `{}`. |
| `addEventListener('toolchange', listener)` / `ontoolchange` | EventTarget subscription | Invalidates the consumer's discovery snapshot. |

These shapes come from [ModelContext IDL, lines 7–81][context-idl]. Object input is independently covered by [object-arguments test, lines 7–74][object-test]. Primitives, including stringified JSON and `null`, fail the current object argument contract; arrays are JavaScript objects and are accepted by the platform, so an application's object schema must reject them when inappropriate. Circular/BigInt inputs and an object whose `toJSON()` produces `undefined` fail serialization. [Invalid-dictionary test, lines 39–75][dictionary-test].

### Registration definition and discovered descriptor

The registration dictionary requires `name`, `description`, and the `execute` callback; `title`, `inputSchema`, and `annotations` are optional in the pinned IDL. The callback shape is `execute(inputObject, { signal })`, with a promise-compatible result of any JavaScript value. It runs in the owner document. The IDL explicitly states that declared input-schema structure is **not enforced during execution**. [Tool IDL, lines 6–36][tool-idl].

The guide describes input schema as required; the implementation accepts registration without one. Supplying an explicit object schema remains the useful prototype convention, but distinguish that design choice from the IDL requirement. [No-schema test, lines 11–21][no-schema-test]. Schema registration checks JSON serializability; it does not establish a complete JSON Schema validator. The malformed-schema cases tested are serialization failures, including cycles, BigInt, and invalid `toJSON()` output. [Schema serialization test, lines 12–71][schema-test].

Tool names are 1–128 characters using ASCII letters/digits, underscore, hyphen, or period; empty/illegal names reject. A name is unique within its registering document: registering the same name twice rejects with `InvalidStateError`. Names are not globally unique across frames. [Name validation test, lines 11–79][name-test]; [Duplicate-registration test, lines 11–27][duplicate-test].

An empty description also rejects registration with `InvalidStateError`. Registration can reject with `NotAllowedError` for Permissions Policy or `SecurityError` for invalid exposure origins. [Registration implementation, lines 352–423][chromium-registration]. Inactive documents reject registration, discovery, and execution with `InvalidStateError`; reading the same-object attribute does not make a detached/inactive document usable. [Model-context test, lines 46–70][inactive-test]. Invalid schema serialization is checked before an already-aborted registration signal in the pinned tests, so cancellation does not bypass validation. [Schema serialization test, lines 46–71][schema-test].

`title` is a human display label, independent of the model-facing name/description. Chromium returns an empty string if omitted and replaces unmatched surrogates in a provided title. [Title test, lines 14–56][title-test]. `getTools()` returns schema properties/required fields as structured data, together with name/description. [Schema discovery test, lines 9–60][discovery-schema-test].

A descriptor contains `name`, `description`, optional `inputSchema`/`annotations`, `title`, **`origin`**, and **`window`**, without callback or public registration ID. [ModelContext IDL, lines 28–49][context-idl]. Keep it in host memory for dispatch. For this app the identity policy is `(allowlisted name, location.origin, window === current window)`. A name-only lookup would allow a same-origin iframe's identically named tool to be selected.

**Derived caution:** the descriptor is not a durable capability for one historical registration. The browser resolves the current owner/window/origin and current tool name. Unregistering and rapidly re-registering the same name can make stale arguments target the replacement definition; the draft calls out that race. Rediscovery reduces stale use but does not replace callback validation. [Draft `index.bs`, lines 480–511][draft-race].

### Annotations and result contracts

| Annotation | Meaning for a consumer | App action |
| --- | --- | --- |
| `readOnlyHint` | Claimed absence of state changes | Mark true only for actual reads; verify the callback behavior. |
| `untrustedContentHint` | Output can contain data the tool author does not trust | Treat titles, descriptions, imported/user content, and result text as data. |
| `consequentialHint` | Claimed significant or irreversible effects | Require the app's exact effect confirmation for subtree deletion. |
| `debugging` | Tool intended for developer inspection | A consumer may exclude it from the end-user catalog. |

All four default to `false` inside a supplied annotations dictionary. An empty dictionary gets all four defaults; omission of the entire dictionary yields `undefined` annotations in discovery. [Annotation discovery test, lines 9–105][annotations-test]. The guide's Chrome 156 note is release guidance; the pinned source has the member, which alone does not prove availability in an older installed browser. [Guide][guide].

These are **hints**, not application permissions. The browser's in-page dispatch checks feature access, target frame tree, current target origin, tool existence, and origin exposure; its dispatch path does not prompt based on `consequentialHint`. [Browser broker, lines 276–398][broker-execute]. The guide's wording about enabling mandatory confirmation describes a consumer capability, not a promise that every caller gets a Chrome dialog. A callback must enforce the app's grants and destructive confirmation itself, including for callers outside the local chat harness.

The pinned registration IDL contains no `outputSchema`, MCP `content` requirement, resource protocol, binary/streaming result contract, or `isError` flag. [Tool IDL][tool-idl]. The `{ ok, data/error }` envelope is this application's protocol, not WebMCP's protocol. Explicit structured outcomes avoid confusing an application denial with a successful transport. Return bounded, JSON-compatible information with the committed record/revision and a clear truncation marker when needed.

## Scope, browser authorization, and tool identity

`getTools()` defaults to tools in same-origin documents within the caller's frame tree, not only the calling document. Results are sorted lexicographically by name. Same-origin iframe tools remain discoverable even with omitted/empty `exposedTo`. [Same-origin exposure test, lines 23–196][same-origin-test]; [Sorting test, lines 11–36][sorting-test]. Sorting does not make duplicate names from multiple frames a unique identity.

Cross-origin discovery requires all applicable gates:

1. The embedding document delegates the `tools` Permissions Policy to a cross-origin iframe, e.g. `<iframe src="https://partner.example/" allow="tools"></iframe>`.
2. The tool owner opts in to the caller's origin through registration options `{ exposedTo: ['https://host.example'] }`.
3. The caller queries `{ fromOrigins: ['https://partner.example'] }`.

Default cross-origin exposure is empty; even a known unexposed tool cannot be executed by fabricating a descriptor. [Cross-origin default test, lines 28–149][cross-default-test]; [Unauthorized dispatch test, lines 28–59][unauthorized-test]. `fromOrigins` adds requested origins to the default same-origin set; it does not exclude same-origin tools. Insecure origins reject with `SecurityError`. [Filtering test, lines 28–100][filtering-test]. The implementation uses potentially trustworthy origins, which includes relevant localhost contexts; for sharing, use exact intended origins rather than URL/path or wildcard assumptions. [Exposure-origin tests, lines 26–94][origin-test].

Permissions Policy affects registration, discovery, and dispatch. Changing navigation origin can invalidate delegation; changing exposure invalidates previously discovered descriptors. [Permissions-policy test, lines 15–169][policy-test]. Cross-origin allowlisting does not authorize every business action, import foreign tool metadata into the system prompt, or trust foreign return values.

Tools belong to documents in a current frame tree. A separate top-level window/tab is not included in discovery; even a descriptor obtained from that window rejects through the current dispatch path. [Across-trees test, lines 11–36][trees-test]. On navigation, use the new document's tools. Do not store descriptors in IndexedDB, assume an old window reference still names an old document, or treat same-origin replacement navigation as permission to reuse old arguments.

The prototype's own-window filter is intentionally narrower than platform default discovery. Retaining that policy keeps this list manager browser-only and avoids introducing a foreign-tool authorization surface.

## Registration, invocation, cancellation, and events

### Two different signals

| Signal | Owner | Effect |
| --- | --- | --- |
| `registerTool(..., { signal })` | Page/component registration lifetime | Abort removes tool availability. An already-aborted signal rejects registration with its reason. |
| `executeTool(..., ..., { signal })` | Caller invocation | Abort rejects the caller's promise with that caller signal's reason and requests cancellation in the provider. |
| Callback `{ signal }` | Browser/provider invocation | Communicates cancellation to the implementation; observe/propagate it to work and pending approval. |

Registration abort can also reject a still-pending registration promise; after fulfillment, it removes the registration without undoing that fulfillment. [Registration signal test, lines 17–51][registration-signal-test]. It does **not** abort an already-running imperative callback. Such a callback can still resolve successfully after unregistration, and explicit invocation cancellation still works after self-unregistration. [Unregister-during-execution test, lines 99–165][unregister-test].

Caller and provider abort reasons are not necessarily equal. The pinned cancellation test expects the caller's custom reason at the caller and an `AbortError` at the provider. Each concurrent invocation has its own signal. A callback resolving after cancellation does not turn a rejected caller promise back into success. [Abort test, lines 33–232][abort-test]. JavaScript promise cancellation is cooperative: the platform cannot reverse arbitrary effects in a callback that ignores its signal.

**Derived cleanup rule:** keep a registration controller separate from a component's invocation controllers. Component removal may only withdraw tools; if the app needs to stop in-flight work too, abort its own operation signals explicitly. Unregistering is not rollback, and stopping a chat is not revoking all page tools.

### Async and navigation behavior

Registration/discovery/dispatch are asynchronous, even for a synchronous callback. The provider receives deserialized input, not the caller's original object identity. Completion can race cancellation, document unloading, or replacement registration. Inspect the actual completion, not just that dispatch started.

The imperative target-navigation test expects `UnknownError` when the owner document disappears during execution. Caller navigation/detachment cancels the surviving provider's signal and produces `toolcancel`. [Target navigation test, lines 15–49][target-navigation-test]; [Caller navigation test, lines 28–135][caller-navigation-test]. The guide's nullable navigation result must not be interpreted as an imperative promise that all navigation succeeds: the pinned declarative form path supplies a null result for cross-document submission. [Chromium `model_context.cc`, lines 709–747][chromium-navigation]. This note does not design a cross-navigation result handoff.

### Events and model catalog synchronization

`toolchange` tells a consumer to query again; it is not a replacement descriptor list. Registration and removal produce change notifications, and visibility gates apply to which frame receives them. [Registration toolchange test, lines 17–37][change-test]; [Same-origin exposure test, lines 55–71][same-origin-test]. Subscribe before initial discovery to avoid missing changes during setup.

`toolactivated` and `toolcancel` occur on the **provider's** ModelContext, carry `toolName`, and do not bubble or support cancellation. A parent caller does not receive its iframe provider's activation/cancellation events. [Execution events test, lines 9–150][events-test]. A name-only event is useful for UI feedback but not a durable invocation/commit receipt. `preventDefault()` on these events is not an authorization boundary.

**Derived host policy:** mark the catalog dirty on `toolchange`, refresh discovery, and replace agent-facing metadata at a safe inference boundary. There is no WebMCP event that automatically updates a `LanguageModel` session's tool declarations. Creating a fresh turn session with refreshed tools, or renewing a constrained bridge catalog, is host orchestration. Changes while inference is pending should invalidate the proposed metadata or trigger current validation, not execute an obsolete proposal blindly. Keep this distinct from ordinary item revisions and per-turn readable-reference mappings.

The README recommends unregister/re-register when model-facing metadata changes, permits a changing implementation behind a stable accurate definition, recommends static registration for simple small applications, and warns about tool/context budgets. It does not define in-place updates or grouped/disabled tool states. [README, lines 429–443][readme-strategy]. The prototype's sixteen static tools are therefore not automatically a defect; measuring catalog size and applying a useful model projection is more appropriate than introducing dynamic complexity without need.

### `ModelContextClient.requestUserInteraction`

Do not use it as a current callback contract. Neither pinned IDL includes a callback client: the second argument is `ToolExecuteCallbackOptions` with required `signal` only. [Tool IDL, lines 28–36][tool-idl]. The current README lists prompting/elicitation and `ModelContextClient` as ongoing exploration, with issues #165/#50. [README, lines 523–529][readme-future]. A legacy/example call such as `client.requestUserInteraction(...)` must be identified as a historical proposal rather than silently adapted into this revision.

For this prototype, implement user interaction through its actual page approval controls. The registered callback can await that UI promise. It must stop on denial/cancellation, release listeners, and revalidate the approved effect against current persisted state before committing. That stays valid whether the caller is the local model harness or another permitted browser client.

## Explicit disagreements and unsettled contracts

| Topic | Documentation/draft | Pinned Chromium evidence | Research consequence |
| --- | --- | --- | --- |
| Schema requirement | Guide describes required input schema | IDL optional; no-schema test succeeds | Supply a schema by app convention; do not assert platform-required. |
| Result representation | Draft serializes every fulfillment using JSON serialization | Objects JSON-stringify; primitive/string values convert to text; empty text gets a generic success fallback | A string returned by a callback may be quoted by draft semantics but raw in Chromium. Prefer explicit object outcomes in a future verified integration. |
| Nullable result | Guide describes `null` for navigation; draft method IDL says non-null `DOMString` | Chromium IDL nullable; form navigation path null; imperative owner unloading rejects | Branch on null before parsing, avoid success claims, and rediscover after navigation. |
| Error categories | Draft distinguishes missing tool, invalid input, rejection/unserializable result, and target unloading | Remote completion failure currently maps broadly to `UnknownError` with a TODO for granular errors | Do not make mutation retry depend on a supposed stable DOMException taxonomy. |
| Schema enforcement | Schemas communicate input contracts | Callback IDL explicitly says structure not enforced | Validate authoritatively in callback/domain/storage logic. |
| Mandatory consequential confirmation | Guide describes annotations enabling consumers to enforce prompts | In-page broker dispatch has no hint-driven confirmation branch | Keep callback-owned approval. |
| User interaction client | Current README calls elicitation exploratory | Callback options only include signal | Keep app-owned UI; no guessed client method. |

Result/error comparison sources: [Draft error table, lines 240–277][draft-conflicts], [result serialization, lines 577–595][draft-result], and [method IDL, lines 663–668][draft-methods]; [Chromium result callback, lines 254–282][chromium-result] and [remote completion, lines 1188–1206][chromium-errors]; [Circular-return/error test, lines 42–73][return-error-test]. Release claims were not tested in an installed browser.

**Derived outcome rule:** a WebMCP transport rejection, abort, null navigation result, or parsing failure means the host lacks a verified receipt. It does not prove no mutation occurred. A callback may have committed before the response was lost or before cancellation won the promise race. Maintain an app-side committed receipt and inspect current state on an explicit new attempt; never automatically replay an uncertain write. Conversely, an application `{ ok: false }` returned over a fulfilled platform promise is not a success.

## Source recommendations versus prototype decisions

Source recommendations here are deliberately narrow: accurate semantic descriptions, single-purpose operations, bounded tool budget, execution-time validation, metadata refresh, and simple static registration where sufficient. [README, lines 429–448][readme-strategy]. The pizza demo demonstrates callback checks against allowed topping/size values and a bounded count. It is a useful illustration of application logic, not a complete authorization/transaction template. [Pizza demo, lines 282–313][pizza-demo].

The page-agent demo discovers iframe origins, declares model functions, rediscoveries before dispatch, and supplies outcomes to a chat loop. It also imports a hosted SDK, asks for an API key, and contains a compatibility retry with stringified arguments. [Page-agent script, lines 6, 51–94, 113, 163–210][page-agent]. Adapt the discovery/dispatch boundary; do not adopt its remote inference, arbitrary URL loading, name-only foreign dispatch, batch executor, or fallback write retry for this repository. Those choices conflict with its local-only product intent or its stronger existing permission/receipt rules.

Prototype-derived DO/DON'T guidance:

| Do | Do not |
| --- | --- |
| Discover and allowlist exact own-window descriptors before dispatch. | Route solely by name across frames or manufacture descriptor/window/origin fields from model text. |
| Validate types, unknown fields, domain rules, parent existence/cycles, and revisions inside the callback/transaction. | Treat a model grammar, schema registration, or read-only hint as enforced authorization. |
| Show the actual effect in page UI and compare it after approval. | Accept an `approved: true` argument or infer approval from metadata. |
| Return explicit committed outcomes and retain receipts independently of inference. | Announce success after `store.put()` request success or after dispatch begins. |
| Distinguish withdrawal, operation abort, permission revocation, and persisted changes. | Treat unregister, Stop, or chat reset as rollback. |
| Refresh tools at safe boundaries and keep stable readable references for one logical turn. | Renumber references mid-turn or keep stale metadata after tool replacement. |
| Fence/bound result data and render it with `textContent`. | Execute result content, inject HTML, or promote tool descriptions/results into trusted instructions. |
| End the turn on denial, malformed results, or uncertain transport failures. | Automatically retry a write using an alternate argument encoding. |

## Original browser-only adaptation examples

These are documentation examples, not installed code or test doubles. They reuse this repository's actual validators and IndexedDB functions. Run such an isolated registration module only instead of the app's normal registration of the same names. No backend, package, build process, remote fetch, mock persistence, or automatic inference is involved.

### Actual approval UI

This illustrative approval dialog shows exact data as text, settles once, and removes abort/UI listeners. A production integration should use the existing styled approval card and accessibility behavior in `app.js`.

```js
function approveEffect(effect, signal) {
  if (signal.aborted) return Promise.resolve(false);
  const dialog = document.createElement('dialog');
  const details = document.createElement('pre');
  details.textContent = JSON.stringify(effect, null, 2);
  const allow = document.createElement('button');
  const deny = document.createElement('button');
  allow.type = deny.type = 'button';
  allow.textContent = 'Allow this exact change';
  deny.textContent = 'Deny';
  dialog.append(details, allow, deny);
  document.body.append(dialog);
  return new Promise(resolve => {
    const priorFocus = document.activeElement;
    let settled = false;
    const finish = approved => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('close', onClose);
      allow.removeEventListener('click', onAllow);
      deny.removeEventListener('click', onDeny);
      dialog.close();
      dialog.remove();
      priorFocus?.focus();
      resolve(approved);
    };
    const onAbort = () => finish(false);
    const onCancel = event => { event.preventDefault(); finish(false); };
    const onClose = () => finish(false);
    const onAllow = () => finish(true);
    const onDeny = () => finish(false);
    signal.addEventListener('abort', onAbort, { once: true });
    dialog.addEventListener('cancel', onCancel);
    dialog.addEventListener('close', onClose);
    allow.addEventListener('click', onAllow);
    deny.addEventListener('click', onDeny);
    try { dialog.showModal(); deny.focus(); }
    catch { finish(false); }
  });
}
```

### Register a read and an approved write

The read/write callbacks use full production schemas and validation. The write takes a revision snapshot, gets approval, checks again, and lets `mutate` re-read and validate **inside** its transaction. No external promise/UI wait occurs inside an IndexedDB transaction. Object results avoid Chromium's raw-string versus draft-quoted-string distinction.

```js
import { TOOLS, validateTool, validateItem, fail } from './workspace.js';
import { read, mutate } from './storage.js';

async function installResearchExampleTools(db) {
  const registration = new AbortController();
  const shutdown = new AbortController();
  const receipts = new Map(); // App-side facts, not the model's acknowledgements.
  let writeBusy = false;
  const definition = name => TOOLS.find(tool => tool.name === name);
  const failure = error => ({
    ok: false,
    error: { code: error.code || (error.name === 'AbortError' ? 'cancelled' : 'storage'),
      message: error.message || 'Operation stopped.' }
  });

  try {
    await document.modelContext.registerTool({
      ...definition('read_item'), title: 'Read local item',
      execute: async (args, { signal: nativeSignal }) => {
        const signal = AbortSignal.any([nativeSignal, shutdown.signal]);
        try {
          signal.throwIfAborted();
          validateTool('read_item', args);
          const item = await read(db, 'items', args.id);
          signal.throwIfAborted();
          if (!item) fail('Item no longer exists.', 'stale');
          return { ok: true, data: item };
        } catch (error) { return failure(error); }
      }
    }, { signal: registration.signal });

    await document.modelContext.registerTool({
      ...definition('update_item'), title: 'Update local item',
      execute: async (args, { signal: nativeSignal }) => {
        const signal = AbortSignal.any([nativeSignal, shutdown.signal]);
        let ownsWrite = false;
        try {
          signal.throwIfAborted();
          validateTool('update_item', args);
          if (writeBusy) fail('Another write is awaiting approval or running.', 'busy');
          writeBusy = ownsWrite = true;
          const before = await read(db, 'items');
          const target = before.find(item => item.id === args.id);
          if (!target) fail('Item no longer exists.', 'stale');
          const candidate = validateItem(args.patch, before, target);
          const parent = candidate.parentId
            ? before.find(item => item.id === candidate.parentId) : null;
          const approved = await approveEffect({
            tool: 'update_item', item: target,
            changes: args.patch, destination: parent
          }, signal);
          signal.throwIfAborted();
          if (!approved) fail('Permission denied.', 'denied');
          validateTool('update_item', args);
          const saved = await mutate(db, {
            kind: 'update', id: args.id, patch: args.patch,
            expected: target.updatedAt, parentExpected: parent?.updatedAt
          }, signal);
          // mutate resolves at tx.oncomplete. Never turn a late abort into
          // a claim that this committed revision was rolled back.
          const receipt = { ok: true, data: saved, committed: true };
          receipts.set(saved.id, receipt);
          return receipt;
        } catch (error) { return failure(error); }
        finally { if (ownsWrite) writeBusy = false; }
      }
    }, { signal: registration.signal });
  } catch (error) {
    registration.abort(); // Removes any partially registered catalog.
    shutdown.abort();
    throw error;
  }
  return {
    receipts,
    withdraw: () => registration.abort(), // Running callbacks may finish.
    dispose: () => { registration.abort(); shutdown.abort(); }
  };
}
```

This example adds no chat-wide grant: each write gets a concrete decision. The production callback additionally has first-use/session grants, exact subtree deletion, review-control boundaries, richer receipts, and stale workflow snapshots. Preserve those when adapting. An authoritative permission revocation during the awaited approval must cancel its signal, just as existing app revocation does. Read access may also need app approval; this isolated read deliberately demonstrates a policy that allows local reads, rather than pretending the annotation supplies permission.

### Host discovery and dispatch loop

This loop uses real native discovery/execution. `proposals` must come from the existing local Prompt API harness after its validation, not arbitrary external instructions. `validateTool` alone does not prove the user requested a write; the registered callback supplies the actual approval boundary. It keeps the full descriptor in host memory, forwards only serializable metadata to model-facing code, and refuses unknown/foreign tools.

```js
import { TOOLS, validateTool } from './workspace.js';

async function dispatchLocalProposals(proposals, signal) {
  const allowed = new Set(TOOLS.map(tool => tool.name));
  let dirty = true;
  let descriptors = [];
  const onChange = () => { dirty = true; };
  document.modelContext.addEventListener('toolchange', onChange);
  const outcomes = [];
  try {
    for await (const call of proposals) {
      signal.throwIfAborted();
      // Rediscover before each dispatch even if an event was missed/queued.
      descriptors = (await document.modelContext.getTools()).filter(tool =>
        allowed.has(tool.name) && tool.origin === location.origin &&
        tool.window === window);
      dirty = false;
      signal.throwIfAborted();
      validateTool(call.name, call.arguments);
      const tool = descriptors.find(tool => tool.name === call.name);
      if (!tool) throw new Error('Own-page tool is unavailable.');
      let raw;
      try {
        raw = await document.modelContext.executeTool(tool, call.arguments, { signal });
      } catch (error) {
        // Outcome may be unknown. Do not retry a dispatched write here.
        throw new Error(`Dispatch stopped; inspect committed activity: ${error.message}`);
      }
      if (raw === null) throw new Error('Navigation interrupted the receipt. Rediscover.');
      const outcome = JSON.parse(raw); // Object-return example yields JSON text.
      if (!outcome || typeof outcome.ok !== 'boolean')
        throw new Error('Unexpected result; inspect committed activity.');
      outcomes.push({ name: call.name, result: outcome });
      // Feed this as bounded, fenced DATA to the existing local model loop.
      // Never execute embedded text or retry a denied operation.
      if (!outcome.ok) break;
      if (outcomes.length >= 6) break;
      if (dirty) descriptors = []; // Next model round must refresh metadata too.
    }
    return outcomes;
  } finally {
    document.modelContext.removeEventListener('toolchange', onChange);
  }
}
```

The example returns outcomes for the existing harness to correlate and feed back. It does not replace native Prompt API call IDs, stable readable item references, refusal handling, or session renewal. A complete local host must present known commit receipts even if Stop ends inference afterward, and show a distinct unknown-outcome state when no receipt is available.

## Comparison with this repository

Read-only inspection covered `AGENTS.md`, `INTENT.md`, `DESIGN.md`, `workspace.js`, `storage.js`, `app.js`, `harness.js`, and related app/harness/flow/implementation documents. Their static browser-only boundary is consistent with imperative tools implemented over local application logic.

| Existing control | Evidence | Preserve because |
| --- | --- | --- |
| Strict current namespace/method gate and awaited registration | [app.js:184, 221–224](../../app.js#L184) | Capability/partial-startup failures remain visible. |
| Registration controller and setup cleanup | [app.js:178, 222–223](../../app.js#L178) | Retry does not accumulate duplicate tools or orphan a partial catalog. |
| Own name/origin/window discovery | [app.js:229](../../app.js#L229) | Same-origin frame tools are excluded intentionally. |
| Callback validation, busy guard, abort forwarding, first-use UI | [app.js:247–280](../../app.js#L247) | Outside callers get the same permission and input boundary. |
| Independent exact subtree deletion approval | [app.js:280–286](../../app.js#L280) | A chat grant never becomes blanket deletion permission. |
| Revision/parent/subtree/workflow checks within transaction | [storage.js:70–121](../../storage.js#L70) | State changed while awaiting approval cannot silently overwrite newer data. |
| Resolve mutation only on transaction completion | [storage.js:120–121](../../storage.js#L120) | A request succeeding is not enough to announce commit. |
| Preserve saved status if view refresh fails | [app.js:33–43](../../app.js#L33) | Rendering failure cannot turn a real commit into a false rollback claim. |
| Dispatch rediscovery, no uncertain write retry, envelope validation | [app.js:434–445](../../app.js#L434) | Proposal text is not an executable trusted capability. |
| Bounded/fenced untrusted model results | [harness.js:303–318](../../harness.js#L303) | User content in successful results stays data. |
| Explicit Stop and known receipt reporting | [app.js:326, 375–379](../../app.js#L326) | Stop retains facts about saved work. |

Research gaps and follow-up candidates, **not implementation requests made by this note**:

1. **Result contract pinning.** Callbacks return `JSON.stringify(result)` at [app.js:315–317](../../app.js#L315), and dispatch parses once at [app.js:442](../../app.js#L442). That fits pinned Chromium's string conversion, but the draft's all-value JSON serialization would produce a JSON string containing JSON text. Verify a deliberate object-result contract against the intended browser before changing it; do not add arbitrary recursive parsing of hostile text.
2. **Legacy argument branch.** [app.js:441](../../app.js#L441) selects stringified arguments if the discovered schema is a string. Current pinned descriptors expose an object schema and current dispatch takes object input. A schema's representation is not a sound general version detector. Document any retained older-browser scope rather than guessing an alternate dispatch after a failed write.
3. **Catalog change subscription.** Current code rediscovers before dispatch but has no `toolchange` listener. Static own registrations make this relatively contained. If dynamic registration or iframe experiments are added, refresh model declarations/diagnostics at safe boundaries and retain current callback validation. Do not confuse item-change broadcasts with tool-definition changes.
4. **Missing human titles.** `workspace.js` defines names/descriptions/schemas/hints but no optional localized titles. Names remain functional; titles could improve native consent/tool presentation without changing identity or introducing a new UI layer.
5. **Lifecycle documentation.** Distinguish setup cleanup's registration abort from `stop()`/revoke's invocation abort. Component unregistration alone does not stop in-flight operations in current Chrome. Document foreign caller cancellation and navigation as separate paths.
6. **Commit knowledge remains an application concern.** Existing activity/receipts and no-retry rule are valuable. Platform cancellation or null results should never be interpreted as proof of rollback. Any future durable operation receipt/idempotency design should be local and scoped to a concrete demonstrated need.
7. **Static versus projected catalog.** Sixteen native tools stay registered while `harness.js` projects relevant model choices. That is consistent with the README's simple-app recommendation. Budget limits documented in [docs/harness.md](../harness.md) are a real scalability concern, not justification for a remote backend or generic batch execution surface.

No installed-browser conformance, feature availability, native registration, model call, or IndexedDB write was tested for this research. Remaining uncertainty centers on release/version rollout, nullable navigation scope, result serialization convergence, granular error convergence, and future elicitation/output schemas. The repository's existing review documents record prior experiments separately; they are not new evidence from this investigation.

## Pinned source index

[guide]: https://developer.chrome.com/docs/ai/webmcp/imperative-api
[document-idl]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/core/script_tools/model_context_supplement.idl#L6-L13
[context-idl]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/core/script_tools/model_context.idl#L7-L81
[tool-idl]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/core/script_tools/model_context_tool.idl#L6-L36
[draft-race]: https://github.com/webmachinelearning/webmcp/blob/d0e4e0e0f039358cc9d93f90074116622bfebd53/index.bs#L480-L511
[draft-conflicts]: https://github.com/webmachinelearning/webmcp/blob/d0e4e0e0f039358cc9d93f90074116622bfebd53/index.bs#L240-L277
[draft-result]: https://github.com/webmachinelearning/webmcp/blob/d0e4e0e0f039358cc9d93f90074116622bfebd53/index.bs#L577-L595
[draft-methods]: https://github.com/webmachinelearning/webmcp/blob/d0e4e0e0f039358cc9d93f90074116622bfebd53/index.bs#L663-L668
[chromium-result]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/core/script_tools/model_context.cc#L254-L282
[chromium-errors]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/core/script_tools/model_context.cc#L1188-L1206
[chromium-registration]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/core/script_tools/model_context.cc#L352-L423
[chromium-navigation]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/core/script_tools/model_context.cc#L709-L747
[broker-execute]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/content/browser/renderer_host/model_context_user_data.cc#L276-L398
[readme-strategy]: https://github.com/webmachinelearning/webmcp/blob/d0e4e0e0f039358cc9d93f90074116622bfebd53/README.md#L429-L448
[readme-future]: https://github.com/webmachinelearning/webmcp/blob/d0e4e0e0f039358cc9d93f90074116622bfebd53/README.md#L523-L529
[pizza-demo]: https://github.com/GoogleChromeLabs/webmcp-tools/blob/04732fb849ab5eff0cd8d13c6f153e26ebb7bcad/demos/pizza-maker/script.js#L282-L313
[page-agent]: https://github.com/GoogleChromeLabs/webmcp-tools/blob/04732fb849ab5eff0cd8d13c6f153e26ebb7bcad/demos/page-agent/script.js#L163-L210
[object-test]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/web_tests/external/wpt/webmcp/imperative/object-arguments.https.html#L7-L74
[dictionary-test]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/web_tests/external/wpt/webmcp/imperative/executeTool-invalid-dictionary.https.html#L39-L75
[no-schema-test]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/web_tests/external/wpt/webmcp/imperative/register_tool_no_schema.https.html#L11-L21
[schema-test]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/web_tests/external/wpt/webmcp/imperative/register_tool_invalid_json_schema.https.html#L12-L71
[name-test]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/web_tests/external/wpt/webmcp/imperative/register_tool_name_validation.https.html#L11-L79
[duplicate-test]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/web_tests/external/wpt/webmcp/imperative/duplicate_tool_registration.https.html#L11-L27
[title-test]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/web_tests/external/wpt/webmcp/imperative/register-tool-title.https.html#L14-L56
[discovery-schema-test]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/web_tests/external/wpt/webmcp/imperative/getTools-imperative-schema.https.html#L9-L60
[annotations-test]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/web_tests/external/wpt/webmcp/imperative/getTools-imperative-annotations.https.html#L9-L105
[same-origin-test]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/web_tests/external/wpt/webmcp/imperative/exposedTo-defaults-same-origin.https.html#L23-L196
[sorting-test]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/web_tests/external/wpt/webmcp/imperative/getTools.https.html#L11-L36
[cross-default-test]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/web_tests/external/wpt/webmcp/imperative/exposedTo-defaults-cross-origin.https.html#L28-L149
[unauthorized-test]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/web_tests/external/wpt/webmcp/imperative/executeTool-unauthorized-origin.https.html#L28-L59
[filtering-test]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/web_tests/external/wpt/webmcp/imperative/getTools-filtering.https.html#L28-L100
[origin-test]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/web_tests/external/wpt/webmcp/imperative/exposedTo-invalid-origins.https.html#L26-L94
[policy-test]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/web_tests/external/wpt/webmcp/imperative/permissions-policy.https.html#L15-L169
[trees-test]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/web_tests/external/wpt/webmcp/imperative/executeTool-across-trees.https.html#L11-L36
[registration-signal-test]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/web_tests/external/wpt/webmcp/imperative/register_tool_signal.https.html#L17-L51
[unregister-test]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/web_tests/external/wpt/webmcp/imperative/unregister-during-executeTool.https.html#L99-L165
[abort-test]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/web_tests/external/wpt/webmcp/imperative/executeTool-abort.https.html#L33-L232
[target-navigation-test]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/web_tests/external/wpt/webmcp/imperative/executeTool-target-navigation.https.html#L15-L49
[caller-navigation-test]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/web_tests/external/wpt/webmcp/imperative/executeTool-caller-navigate-abort.https.html#L28-L135
[change-test]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/web_tests/external/wpt/webmcp/imperative/register_tool_toolchange.https.html#L17-L37
[events-test]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/web_tests/external/wpt/webmcp/imperative/executeTool-events.https.html#L9-L150
[return-error-test]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/web_tests/external/wpt/webmcp/imperative/executeTool-error-window-onerror.https.html#L42-L73
[inactive-test]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/web_tests/external/wpt/webmcp/imperative/model_context.https.html#L46-L70
