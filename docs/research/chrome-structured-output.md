# Chrome Prompt API structured output research

Research date: **2026-10-12**. This is documentation only; no implementation, browser state, dependencies, or test fixtures were changed. Repository context reviewed: `AGENTS.md`, `INTENT.md`, `DESIGN.md`, `app.js`, `harness.js`, `workspace.js`, and `docs/harness.md`.

Structured output is appropriate for this prototype's operation router and argument proposals. It reduces parsing uncertainty, but does not establish that a selected task is the intended task, that a proposed action is authorized, or that a write succeeded. Keep the application boundary authoritative.

## Evidence and version boundaries

The [Chrome guide][guide] was published and last updated **2025-05-13**. Its Chrome 137 availability statement describes structured output, not universal support for every JSON Schema keyword or the separate experimental native tool-call protocol. The later [Do and don't guide][dos] was published and last updated **2026-04-30**.

Source snapshots used below:

- Prompt API explainer and draft: `webmachinelearning/prompt-api` at `dfcddb444a2763a823e1a7a8bb0af7c54009536a`.
- Chromium: `chromium/chromium` at `578db53b7ff6a3eaa28e561e25cb6b1e4878da3a`.
- Demo repository inventory: `GoogleChromeLabs/web-ai-demos` at `d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c`; the structured-output guide's schema tester is a separate `GoogleChrome/samples` page.

**Source facts** below describe the named guide, draft, source, or tests. **Application observations** describe this checkout and its recorded Chrome 154 evidence. **Recommendations and original examples** are derived guidance for this static, browser-only app. Reading upstream tests is evidence of their intended coverage, not a claim that those tests were run here.

## What the linked Chrome guide teaches

The guide passes `responseConstraint` to `prompt()` or `promptStreaming()`. Its examples are a boolean classifier and a closed object holding at most three patterned hashtags. Decode the returned string with `JSON.parse()`. It links JSON Schema background, validators, optional typings, and a [schema tester][tester]. [Chrome structured-output guide][guide].

The tester checks compatibility with llguidance. For this repository, use it as investigation support, followed by a probe of the actual browser/model; no build step or dependency is required. [Tester][tester].

An original adaptation of both guide shapes, suitable for a browser console after the app's model preparation/consent flow:

```js
const session = await LanguageModel.create();
try {
  const isTask = JSON.parse(await session.prompt(
    'Does “Renew my passport” describe a task?',
    { responseConstraint: { type: 'boolean' } }
  ));
  const tagsSchema = {
    type: 'object',
    properties: {
      tags: {
        type: 'array', maxItems: 3,
        items: { type: 'string', pattern: '^#[^\\s#]+$' }
      }
    },
    required: ['tags'], additionalProperties: false
  };
  const tags = JSON.parse(await session.prompt(
    'Suggest tags for a passport-renewal task.',
    { responseConstraint: tagsSchema }
  ));
  console.log({ isTask, tags });
} finally {
  session.destroy();
}
```

This example illustrates shapes, not a task classifier that is reliable enough to route writes. The hashtag expression is a JSON Schema string: the JavaScript literal needs a doubled backslash to deliver `\s` to the schema. `maxItems: 3` permits an empty array; add a minimum only if the application actually requires one.

## API contract: constraint, instructions, and context are separate

The pinned [explainer][explainer-structured] supports a JSON Schema object or `RegExp` as `responseConstraint`. JSON Schema output is JSON text; a regex returns matching text, which need not be JSON. The draft default for `omitResponseConstraintInput` is `false`. Constraint guidance may therefore be inserted into model input. Setting it to `true` suppresses that added guidance, while retaining the output constraint; the developer should describe the expected output in the prompt. The explainer specifies `TypeError` for an invalid constraint value or an omit flag without a constraint, `NotSupportedError` for unsupported schema features, and `SyntaxError` when a compliant output cannot be produced. [Pinned explainer, lines 473–530][explainer-structured]; [draft options, lines 147–152][draft-options].

**Chromium implementation detail:** Blink serializes an object schema or extracts a regex's **source**; this path does not transmit its JavaScript flags. Its schema-input helper returns no guidance for regex constraints, and no guidance when the omit flag is true. Otherwise the prompt builder adds JSON guidance to the last user message, preserving an assistant prefix at the end. Do not assume every JavaScript regex feature/flag has identical decoder semantics. Use an anchored, simple pattern and verify it on the target browser. [Constraint parsing][blink-constraint]; [prompt-builder input insertion][builder].

An original regex example for a small textual classifier:

```js
const allowed = /^(capture|clarify)$/;
const label = await session.prompt(
  'Classify this request as capture or clarify. Return that word only. '
    + 'Request: Save “Renew passport” in Inbox.',
  { responseConstraint: allowed, omitResponseConstraintInput: true }
);
if (!allowed.test(label)) throw new Error('Unexpected classification');
// This is text, so do not call JSON.parse(label).
```

This is an illustration, not a replacement for the repository's JSON string enum router. Regex validity cannot determine whether capture is the correct interpretation of a human request.

### Measurement: use the real stage, and note a source discrepancy

The pinned [draft measurement algorithm][draft-measure] allows `measureContextUsage(input, options)` to include inserted constraint guidance. The matching call should carry the **actual** route/argument/reply constraint and the same omit setting; measuring only an unrelated prompt or a generic schema misses the selected stage's cost. Measurement describes input usage, not a guaranteed output reservation or proof that inference will succeed.

However, at the pinned Chromium revision, [Blink's measurement implementation][blink-measure] passes `json_schema = ""` to prompt conversion and does not process `responseConstraint`. It therefore does not add the schema guidance counted by the draft algorithm. This is a concrete draft/source divergence; do not report schema-aware measurement as verified in that source. The current app uses `omitResponseConstraintInput: true` and includes the selected schema in its own argument-stage context, so that manual schema text is part of the input being measured. The router includes names/descriptions, not every tool schema.

Original research instrumentation pattern, deliberately outside the app:

```js
// messages must be the exact messages for this inference stage.
const options = {
  responseConstraint: selectedSchema,
  omitResponseConstraintInput: true,
  signal: controller.signal
};
const inputUsage = await session.measureContextUsage(messages, options);
console.log({
  inputUsage,
  contextUsage: session.contextUsage,
  contextWindow: session.contextWindow,
  schemaCharacters: JSON.stringify(selectedSchema).length
});
const text = await session.prompt(messages, options);
```

For a comparison with omit=false, record the browser/model and this source caveat. A separate string-length total is useful diagnostic metadata but is not a token count. Prompt text, history, already retained session context, generated output, schema-compilation work, and the decoder grammar are distinct costs.

The draft also rejects omit=true without a constraint. At the pinned Chromium revision, [ParseConstraint returns immediately when the constraint is absent][blink-constraint], and [ValidateAndProcessPromptInput][blink-process] has no corresponding omit guard. Measurement has no such guard either. Follow the draft's valid calling pattern; do not rely on that implementation gap as an intentional API feature.

## Chromium schema support: implemented vocabulary is not full conformance

Chromium's [constraint factory][factory] passes JSON schema/regex to its vendored llguidance decoder, using default initialization and failing constraint creation when the decoder reports an error. The vendored [Cargo metadata][cargo] identifies llguidance **1.9.1**. The following is the source's implemented vocabulary, not a portable browser-wide promise:

| Group | Keywords present in the pinned schema compiler |
| --- | --- |
| Core/composition | `type`, `enum`, `const`, `$ref`, `anyOf`, `allOf`, `oneOf` |
| Arrays | `items`, `additionalItems`, `prefixItems`, `minItems`, `maxItems` |
| Objects | `properties`, `additionalProperties`, `patternProperties`, `required`, `minProperties`, `maxProperties` |
| Strings | `minLength`, `maxLength`, `pattern`, `format` |
| Numbers | `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf` |

The source separately classifies metadata such as `description`, `title`, `default`, `examples`, `$defs`, and `$schema`. A `default` annotation does not make the model or app insert that default value. Known unimplemented validation keywords are rejected in strict mode; unknown extension names can be ignored. Thus adding an arbitrary keyword is not evidence that it was enforced. [Implemented/annotation lists][schema-keywords]; [keyword recognition and rejection][schema-rejection].

The pinned compiler has important qualifications:

- `oneOf` is listed and some normalized cases have tests, but the grammar path for a remaining `OneOf` rejects by default; optional coercion approximates it with `anyOf` and warns about validation errors. `anyOf` itself means at least one valid alternative. Exclusivity must come from disjoint branches or application validation. [Compiler defaults][compiler-defaults], [`process_one_of`][compiler-oneof]; [combination tests][combination-tests].
- `not` and `uniqueItems` are known schema keywords outside the implemented list. Other familiar keywords such as conditional and unevaluated constraints are not automatically available. Keep exact-set/no-duplicates validation in application code. [Draft keyword recognition][recognized-keywords]; [strict compiler checks][schema-rejection].
- `minProperties` and `maxProperties` **are implemented** at this snapshot. That does not prove every nested combination works in a released Chrome build. [Object compilation][schema-object].
- `format` is a finite regex lookup, including `date-time`, `time`, `date`, `duration`, `email`, `hostname`, `ipv4`, `ipv6`, `uuid`, and `uri`. An unknown format can fail in strict mode. A format check establishes syntax, not reachability, ownership, calendar validity, or domain authorization. [Format lookup][formats].
- String length and patterns have compiler-specific handling of JSON escapes and Unicode. The source handles supplementary characters for length bounds but documents limitations for decoding escaped characters during pattern matching. Existing app validators use JavaScript `.length`, which counts UTF-16 code units; retain that post-parse boundary. [String compilation and escape handling][compiler-strings]; [local item validation](../../workspace.js#L20).

### Limits and unsupported shapes

The compiler's internal defaults include 50,000 compiled schema entries and stack level 128. Its parser defaults include grammar size 500,000 symbols, initial lexer fuel 1,000,000, per-step lexer fuel 200,000, 50,000 step items, 250,000 lexer states, and 2,000 items in a row. These are internal resource limits, **not** a supported catalog size, byte allowance, token budget, or website option to tune. [Schema builder defaults][schema-limits]; [parser limits][parser-limits]; [grammar-size checks][grammar-limits].

A large enum, deep nesting, conflicting bounds, complex intersections, or an assistant prefix incompatible with the constraint can fail before a valid response is available. Do not infer that JSON syntax alone implies supported/affordable generation. The source's simple reference context restricts lookup to local root references; do not design this browser-only app around downloading remote schema definitions. [Local reference lookup][ref-context]; [unsatisfiable combination tests][combination-tests].

The guide's tester is useful for a schema investigation, but a successful result should be followed by a target-browser probe of the **whole actual projected schema**, then validation of the output. Changing unsupported composition to a looser object may create a gap that the app must still reject.

## Streaming and errors

For a text-output session, `promptStreaming()` emits text fragments. The pinned [stream responder][stream-responder] enqueues the received fragment; the [streaming test][stream-test] joins fragments with `''`. A fragment may end in the middle of a property name, string escape, number, or object. It is not independently valid JSON. Typed tool-output sessions have a different message-content stream and need the native protocol parser.

Original safe collection example for a selected tool's argument object:

```js
let raw = '';
const stream = session.promptStreaming(messages, {
  responseConstraint: selected.inputSchema,
  omitResponseConstraintInput: true,
  signal: controller.signal
});
for await (const fragment of stream) {
  if (typeof fragment !== 'string') throw new Error('Expected text session');
  raw += fragment;
  if (raw.length > 25000) {
    controller.abort();
    throw new Error('Proposal exceeds the application limit');
  }
}
if (controller.signal.aborted || !isCurrent()) return;
const proposal = parseBridgeArguments(raw, selected.name, catalog);
// Pass the complete validated proposal to the app's normal dispatch boundary.
// Do not execute from a fragment or bypass its permission/stale checks.
```

The app currently uses non-streaming `prompt()` for bridge proposals. There is no need to introduce proposal streaming just to follow the guide; a short operation or argument object benefits from one complete validation point.

| Failure | Evidence | Application implication |
| --- | --- | --- |
| Invalid constraint value / omit flag without constraint | Pinned explainer contract specifies `TypeError`; Chromium gaps described above | Treat as a caller/configuration issue; do not dispatch |
| Unsupported schema or invalid decoder constraint | Pinned explainer; Chromium maps invalid constraints to `kErrorInvalidRequest`, then `NotSupportedError` | Capture browser version and full projected schema in bounded diagnostics |
| Circular **JavaScript object** | Chromium stringify path and WPT rejection | Use serializable plain schema data; distinguish this from recursive `$ref` |
| Invalid schema `type` | WPT uses `{ type: 'soup' }` and expects `NotSupportedError` | Validate authored schemas and probe actual browser support |
| Unable to produce compliant output | Explainer specifies `SyntaxError` | Stop proposal processing; no mutation follows incomplete inference |
| Cancelled generation, overflow, destroyed session, or other model failure | Independent session/model failures | Preserve cancellation and receipt handling; a constraint does not remove them |

Sources: [explainer errors][explainer-structured], [browser invalid-constraint mapping][browser-errors], [Blink mapping/stringification][exceptions], [invalid-type test][invalid-type-test], [circular-object test][circular-test]. Error messages can be less specific than the underlying cause. An observed `kErrorUnknown` does not identify a particular unsupported keyword.

## How the current prototype uses these mechanisms

The app maintains three related schema boundaries. They are deliberately different:

| Boundary | Current behavior | Why it matters |
| --- | --- | --- |
| Native WebMCP/public tools | `workspace.js` declares the complete input schemas, including destination/view exclusivity and nonempty patches; `app.js` registers them unchanged | This is the application contract and callback validation boundary |
| Model-facing tools | `modelCatalog()` projects storage IDs into readable choices, filters unavailable operations, specializes title/status/review choices, and applies `decoderSchema()` | The model proposes from an applicable catalog without inventing storage IDs |
| JSON bridge inference | Route string enum → selected tool's argument object, or a separate reply object | Only one stage grammar is sent to each inference, avoiding one giant prose/tool envelope |

References: [public schemas and validator](../../workspace.js#L44), [tool registration](../../app.js#L223), [model catalog](../../harness.js#L78), [bridge prompts](../../app.js#L337), [bridge parser](../../harness.js#L239).

The actual routing schema is `{ type: 'string', enum: ['respond', ...availableToolNames] }`. The result is JSON text such as `"organize_tasks"`, not an object and not unquoted text. The selected argument stage receives only that operation's projected `inputSchema`. The respond stage receives a closed `{ message }` object with `maxLength: 600`. Every bridge prompt passes `omitResponseConstraintInput: true`; instructions and, for arguments, the selected schema are already in the application-authored context. [Current bridge loop](../../app.js#L356).

`decoderSchema()` recursively removes `oneOf`, `not`, `minProperties`, and schema metadata `description`. It treats `properties` as a map: a real field named **description** and that field's string/length rules survive. Do not implement metadata compaction by blindly deleting every key called `description`, which would erase the item attribute. The complete public schema and callback rules remain stronger. [Current decoder projection](../../workspace.js#L191).

`organize_tasks` compensates for removal of `oneOf`/`not` with two complete `anyOf` object branches: one requires `titles` plus `parentId`, the other `titles` plus `newProjectTitle`. Each has `additionalProperties: false` and exposes only its own destination property. An object containing both destination keys satisfies neither branch. This construction enforces exclusivity through the shapes even though generic `anyOf` does not mean exactly one. The callback separately checks exactly one destination. [Catalog branches](../../harness.js#L139); [callback validation](../../workspace.js#L90).

The catalog constrains completion/status/organization to existing Task titles and Shopping List names to existing choices (or the default list name if no list exists). Recognized literal capture-title lists get exact title enums and equal minimum/maximum array sizes. That schema still allows repetition: the application additionally checks cardinality, set membership, duplicates, projection collisions, and normalized-title collisions. New freeform capture/project/purchase titles remain text; an enum cannot cover things the user has not yet created. [Literal extraction](../../harness.js#L42); [literal catalog checks](../../harness.js#L120); [resolution](../../harness.js#L186).

Readable references are fixed for a logical user request, including tool feedback. The app maps them back to real IDs immediately before native execution and rejects changed/unknown targets. Enum membership alone does not establish stable identity: regenerating numbered labels halfway through a turn could silently redirect a previous choice. Do not confuse native call IDs, which correlate tool results, with storage item IDs. [Catalog snapshot/mapping](../../harness.js#L78); [fresh resolution before execution](../../app.js#L424).

### Recorded compatibility evidence is narrower than the source vocabulary

[The existing harness report](../harness.md#app-behavior) and [natural-language review](../natural-language-review.md) record Chrome **154** rejecting the complete grammar with `NotSupportedError` and accepting a projection excluding `oneOf`, `not`, and `minProperties`. They separately record mixed null/string enums failing native tool-schema serialization, after which nullable references used `anyOf` with distinct null and string-enum alternatives.

These observations justify the current compatibility projection. They do **not** establish that `minProperties` is universally unsupported, that all mixed enums fail response constraints, or that every native tool-use failure has a schema cause. Native schema serialization, JSON response decoding, and actual model behavior are different paths. The recorded array and numbered-capture `kErrorUnknown` failures before dispatch likewise do not establish a universal prohibition on arrays. [Harness observations](../harness.md#app-behavior); [weekly-review evidence](../weekly-review.md).

No new real-model probes were run for this research. Keep those historical findings versioned and separate from the pinned draft and current source evidence.

## Original argument-schema and validation examples

The following illustrative schema adapts the app's organization workflow without opaque IDs or backend services. Choices represent a fixed snapshot for one human request. It is example documentation, not a proposed implementation patch.

```js
const exactTitles = ['Compare car insurance', 'Book a test drive'];
const parentChoices = ['Item 4: Buy new car (Project)'];
const titles = {
  type: 'array', minItems: 1, maxItems: 20,
  items: { type: 'string', enum: exactTitles }
};
const destinationSchema = {
  anyOf: [
    {
      type: 'object',
      properties: {
        titles,
        parentId: {
          anyOf: [
            { type: 'null' },
            { type: 'string', enum: parentChoices }
          ]
        }
      },
      required: ['titles', 'parentId'], additionalProperties: false
    },
    {
      type: 'object',
      properties: {
        titles,
        newProjectTitle: { type: 'string', minLength: 1, maxLength: 200 }
      },
      required: ['titles', 'newProjectTitle'], additionalProperties: false
    }
  ]
};
const raw = await session.prompt(
  'Move Compare car insurance and Book a test drive into the existing '
    + 'Buy new car project. Return only the argument object. '
    + 'Choose exact titles and the readable parent choice; omit newProjectTitle.',
  { responseConstraint: destinationSchema, omitResponseConstraintInput: true }
);
const args = JSON.parse(raw);
// Still required: validate the whole object, resolve the fixed choices,
// detect ambiguity/current-record changes, show the approved effects,
// and commit through the existing native WebMCP callback.
```

For integration-oriented pseudocode, reuse the production parser and resolution boundary rather than writing a second permissive validator:

```js
import {
  routeSchema, parseRoute, parseBridgeArguments
} from '../../harness.js';

const operation = parseRoute(await session.prompt(routeMessages, {
  responseConstraint: routeSchema(catalog),
  omitResponseConstraintInput: true,
  signal: controller.signal
}), catalog);

if (operation !== 'respond') {
  const selected = catalog.tools.find(tool => tool.name === operation);
  const raw = await session.prompt(argumentMessages, {
    responseConstraint: selected.inputSchema,
    omitResponseConstraintInput: true,
    signal: controller.signal
  });
  if (controller.signal.aborted || !isCurrent()) return;
  const proposal = parseBridgeArguments(raw, operation, catalog);
  const call = catalog.resolve(proposal, await read(db, 'items'));
  // Continue through app.js's discovered native tool, normal approval,
  // stale checks, cancellation, and transaction path.
  // This example intentionally does not implement a second dispatch path.
}
```

`routeMessages`, `argumentMessages`, `session`, `catalog`, `controller`, `isCurrent`, `read`, and `db` are existing-flow placeholders, not a standalone runnable module. The actual app does both initial validation and fresh resolution before executing the discovered native tool. Parse failures, unsupported schemas, denied permission, ambiguity, stale targets, and cancellation all terminate the proposal before a write.

## Reconciling constraints with Chrome's length guidance

**Source fact:** the later [Do and don't guide, “Decouple generation from length constraints”][dos-length] advises generating prose naturally and fitting it to the UI afterward. It warns that a strict schema `maxLength` can cause the model to compress meaning into foreign-language tokens or emoji, producing poor output.

**Derived recommendation:** distinguish a UI display preference from a storage/protocol requirement. Preserve title/description domain validation, bounded JSON parsing, array/call caps, and exact enum choices. An existing title selected from an enum is not being freely compressed to fit a box. Never truncate a selected item reference or literal task title after generation: that could change identity or user intent.

The current 600-character reply decoder constraint governs free prose, so it is a concrete tension with the newer guidance. Its application parser also rejects replies longer than 600. A later experiment could compare a closed reply schema with an unbounded message string, a soft concise instruction, and client-side display fitting. That would require an intentional coordinated change to the parser/UI and measurements of response quality and resource use. It is not a reason to silently remove all bounds in this research pass. Preserve full factual receipts; trimming a confirmation should not hide a partial success, denial, or clarification.

The app already limits model result serialization to 8,000 characters, retained history to six messages of at most 1,000 characters, and a turn to six tool dispatches. Those resource and execution safeguards serve different purposes from forcing short prose through decoder `maxLength`. [Result/history projection](../../harness.js#L263); [dispatch cap](../../app.js#L430); [current harness limits](../harness.md#prototype-limits).

## Derived recommendations for future experiments

1. Retain the staged router/selected-arguments/reply architecture. A route enum guarantees a member of the currently allowed names; it does not guarantee the right operation. Evaluate interpretation separately from parsing.
2. Treat `omitResponseConstraintInput` as removing duplicate browser-supplied instructions, not as making schemas cost-free. Explicit schema text in argument prompts still consumes context, and grammar compilation still consumes resources.
3. Keep the public WebMCP contract and runtime validators stronger than any compatibility projection. When a decoder feature is removed, identify the precise validation rule that still enforces it.
4. Preserve stable readable catalogs, exact literal-title recovery, ambiguity checks, and fresh resolution before dispatch. Schema membership proves neither identity nor current validity.
5. Log the actual stage/schema and browser version for rejected constraints; separate serialization failure, decoder compilation failure, model inference failure, JSON parsing failure, and application validation failure.
6. Evaluate complete outputs before any action. A valid grammar cannot prove truthfulness, authorize deletion, certify review-step completion, override permission cards, or justify replaying a dispatched write after an uncertain response.
7. Compare real-model task outcomes with deterministic harness checks separately. Existing tests validate application boundaries; recorded real-model success/failure describes the particular tested setup.

Useful future probes, **not run here**: route enum vs prose routing; exclusive destination branches with both/neither field; exact capture-title permutations and duplicates; large enum/context pressure; nullable reference shapes on each model path; cancellation during argument generation; invalid/circular schemas; escaped Unicode length cases; complete streamed JSON collection; and reply quality with/without decoder prose length caps. These can remain browser-local and require no server API or build step.

## Sources

[guide]: https://developer.chrome.com/docs/ai/structured-output-for-prompt-api
[dos]: https://developer.chrome.com/docs/ai/built-in-ai-dos-donts
[dos-length]: https://developer.chrome.com/docs/ai/built-in-ai-dos-donts#decouple_generation_from_length_constraints
[tester]: https://googlechrome.github.io/samples/json-schema-tester/
[explainer-structured]: https://github.com/webmachinelearning/prompt-api/blob/dfcddb444a2763a823e1a7a8bb0af7c54009536a/README.md#L473-L530
[draft-options]: https://github.com/webmachinelearning/prompt-api/blob/dfcddb444a2763a823e1a7a8bb0af7c54009536a/index.bs#L147-L152
[draft-measure]: https://github.com/webmachinelearning/prompt-api/blob/dfcddb444a2763a823e1a7a8bb0af7c54009536a/index.bs#L618-L631
[blink-constraint]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/language_model.cc#L396-L449
[blink-process]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/language_model.cc#L924-L942
[blink-measure]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/language_model.cc#L1009-L1042
[builder]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/language_model_prompt_builder.cc#L344-L370
[factory]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/services/on_device_model/ml/constraint_factory.cc#L115-L154
[cargo]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/rust/chromium_crates_io/vendor/llguidance-v1/Cargo.toml#L14-L16
[schema-keywords]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/rust/chromium_crates_io/vendor/llguidance-v1/src/json/schema.rs#L15-L70
[schema-rejection]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/rust/chromium_crates_io/vendor/llguidance-v1/src/json/schema.rs#L606-L630
[recognized-keywords]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/rust/chromium_crates_io/vendor/llguidance-v1/src/json/context_simple/draft.rs#L77-L150
[compiler-oneof]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/rust/chromium_crates_io/vendor/llguidance-v1/src/json/compiler.rs#L222-L229
[compiler-defaults]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/rust/chromium_crates_io/vendor/llguidance-v1/src/json/compiler.rs#L86-L99
[combination-tests]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/rust/chromium_crates_io/vendor/llguidance-v1/tests/test_json_schema_combinations.rs
[schema-object]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/rust/chromium_crates_io/vendor/llguidance-v1/src/json/schema.rs#L1090-L1168
[formats]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/rust/chromium_crates_io/vendor/llguidance-v1/src/json/formats.rs#L1-L124
[compiler-strings]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/rust/chromium_crates_io/vendor/llguidance-v1/src/json/compiler.rs#L735-L883
[schema-limits]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/rust/chromium_crates_io/vendor/llguidance-v1/src/json/schema.rs#L536-L551
[parser-limits]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/rust/chromium_crates_io/vendor/llguidance-v1/src/api.rs#L264-L324
[grammar-limits]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/rust/chromium_crates_io/vendor/llguidance-v1/src/grammar_builder.rs#L187-L200
[ref-context]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/rust/chromium_crates_io/vendor/llguidance-v1/src/json/context_simple/context.rs#L72-L107
[stream-responder]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/model_execution_responder.cc#L323-L336
[stream-test]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/web_tests/external/wpt/ai/language-model/prompt/streaming/prompt-streaming.tentative.https.window.js#L10-L18
[browser-errors]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/chrome/browser/ai/ai_language_model.cc#L351-L363
[exceptions]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/exception_helpers.cc#L178-L218
[invalid-type-test]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/web_tests/external/wpt/ai/language-model/response-constraint/json-schema/invalid-type-rejection.tentative.https.window.js#L10-L19
[circular-test]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/web_tests/external/wpt/ai/language-model/response-constraint/json-schema/circular-references-rejection.tentative.https.window.js#L10-L20
