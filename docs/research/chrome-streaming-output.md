# Chrome streaming output and safe rendering

Research date: **2026-10-12**. This chapter covers [Chrome's streaming-rendering article][chrome-render], linked primary references, current Prompt API contracts, and the implications for this repository. It is research only: no implementation, dependency installation, browser settings, inference, or tests were changed or run. `AGENTS.md`, `INTENT.md`, `DESIGN.md`, and `ChromeAI.md` were read before the comparison.

## Findings and evidence boundaries

**Source summary.** Chrome's article, published/updated **2025-01-21**, recommends appending plain text instead of repeatedly replacing the output. It identifies whole-response Markdown/HTML reparsing as expensive, treats model output as untrusted, and recommends sanitization plus a streaming Markdown parser. Combined input matters because markup can span chunks. Its example inspects accumulated source with DOMPurify, checks `removed`, then feeds each original chunk to streaming-markdown. [Rendering article][chrome-render]

**Assessment.** Preserve those performance and trust-boundary principles, but do not copy its security gate as a complete safe pipeline. DOMPurify expressly says `removed` must not drive security-critical decisions and warns that later transformations can defeat sanitization. Marked likewise says to sanitize its **output HTML**. Checking Markdown source with one parser and rendering it with another does not prove the resulting DOM/URLs safe. [DOMPurify usage guidance][purify], [Marked security guidance][marked]

The Prompt proposal is a **Draft Community Group Report**, dated 2026-10-06, not a W3C Standard. Its reproducible source here is **dfcddb444a2763a823e1a7a8bb0af7c54009536a**. Chromium evidence uses **578db53b7ff6a3eaa28e561e25cb6b1e4878da3a**. Those pins describe source snapshots, not the exact Chrome 154 build previously observed locally. [Draft status][draft], [generation algorithm][generation], [Chromium responder][responder]

The comprehensive demo audit uses **d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c**; reuse its [streaming and safe-display analysis](chrome-ai-demos.md#streaming-and-safe-display). Library setup and Sanitizer example drift are covered in [AI guidelines](chrome-ai-guidelines.md#current-sanitizer-authority-and-example-drift). This chapter adds the rendering contract and an original dependency-free sketch rather than adopting demo code.

## A stream is a transport contract, not a finished answer

Chrome documents `prompt()` for a complete result and `promptStreaming()` for a `ReadableStream` of partial results; both take an inference `signal`. A text-only response can be accumulated as a string. Streaming consumers must catch errors during consumption as well as synchronous setup failures. [Prompt guide][chrome-prompt]

At the pinned Chromium responder, `OnStreaming(text)` forwards the received string unchanged; the responder does not itself aggregate text. `OnCompletion()` closes the stream, while `OnError()` errors it. The draft generation algorithm similarly produces text strings or tool-call content dictionaries. Chrome's rendering examples append each incoming fragment, so delta accumulation is the intended text-rendering pattern. Verify the complete source/wrapper contract before adapting a different build. [Responder][responder], [draft generation][generation], [rendering examples][chrome-render]

**Original adapter recommendation.** Name the supported contract explicitly: delta strings, cumulative strings from a separate legacy/wrapper source, or typed native content. Do not guess by asking whether the next string begins with the previous one. Repeated natural text, empty chunks, shared prefixes, and wrapper changes make that unreliable. For example, deltas `ha`, `ha` mean `haha`; cumulative snapshots `ha`, `haha` must replace the snapshot. Keep any cumulative adapter separate and test it against the exact source/build that needs it. A chunk is not necessarily a token, word, sentence, Markdown block, or UTF-8 byte sequence; do not add token-decoding machinery to a string stream.

### Native tools require a separate consumer

At the same Chromium pin, the IDL comment says streaming tool output yields dictionary sequences, but the responder actually enqueues ordinary text as **strings** and **each tool call as one content dictionary**. This is an implementation/comment mismatch. Complete `prompt()` results and streaming chunks must not share a shape assumption. [IDL comment][idl], [actual enqueue operations][responder], [tool-use comparison](chrome-prompt-api-tool-use.md#success-error-batches-streaming-and-stopping)

**Original host boundary.** A future native consumer should discriminate each value before display: strings go to the text renderer; verified `{type: 'tool-call', value: ...}` records go to the pending-call collector; unknown values fail visibly. A dictionary is not a text delta, and stringifying it into chat is not tool validation. Collect full calls, validate names/arguments/IDs and batch integrity, and then enter the existing authorization/execution path. A closed stream containing calls means a model proposal batch has arrived; it does not mean the user's operation succeeded. Preserve actual receipts separately from assistant prose.

Never dispatch a tool because a partly streamed JSON object happens to parse, because a Markdown task checkbox appeared, or because text says an operation was completed. Even a complete schema-conforming proposal needs app validation and permission. Rendering and parser callbacks must have no database, navigation, review-advancement, or tool-execution side effects. See [structured output](chrome-structured-output.md) and [browser-agent architecture](browser-agent-architecture.md).

### Completion, interruption, and cancellation

**Source distinction.** The Prompt explainer says aborting an active prompt removes that prompt/response pair from session context; aborting an already completed prompt does nothing. Overflowed older messages are not restored by abort. Session destruction is broader than prompt cancellation. [Pinned cancellation explanation][abort]

The Streams Standard says exiting async iteration normally cancels the stream unless `preventCancel` is selected. However, at this Chromium responder pin, its underlying `Cancel()` simply resolves; its `OnAborted()` handles the supplied AbortSignal and cleans up. Therefore stopping consumption must not be treated as a guaranteed inference-stop mechanism across builds. Explicitly abort the request controller. [Streams iteration][streams], [Chromium cancellation/abort source][responder]

**Original state model.** Track `generating`, `complete`, `stopped`, `failed`, `superseded`, and an app-imposed output-limit failure. Preserve already accepted text as an explicitly partial draft when interrupted. Persist that status if keeping a transcript; do not restore a partial answer as a complete assistant message without an intentional history policy. Natural stream exhaustion establishes API completion, not factual correctness or semantic completeness: an answer may still omit a requested step or end with an unclosed code fence. No general finish-reason field was established by the inspected stream contract.

Cancellation cannot roll back a separately committed IndexedDB write. A late result must not append to a replacement response, erase a receipt, or trigger an automatic replay. Tie each renderer, parser, controller, and output node to one request/generation identifier. The owning host should serialize turns and release disposable cloned sessions in `finally`; this sketch does not own a model session.

## Original static-browser plain-text sketch

**Proposed, unexecuted example.** This assumes a prepared **text-only, delta-string** session and ordinary DOM nodes. It needs no imports, server, package manager, or build step. The caller supplies a fresh controller per response, binds Stop to `controller.abort()`, and makes `isCurrent()` false when the response is superseded. The limit is an illustrative UTF-16 code-unit cap, not a token budget or universal product setting.

```html
<p id="response-state" role="status" aria-atomic="true"></p>
<pre id="response-text" aria-live="off"></pre>
```

```js
async function displayTextResponse({
  model, input, output, status, controller, isCurrent,
  maxCodeUnits = 100_000,
}) {
  const { signal } = controller;
  const textNode = document.createTextNode('');
  const accepted = [];
  let size = 0;
  let pending = '';
  let frame = null;
  let outcome = 'generating';
  let failure = null;

  function flush() {
    frame = null;
    if (isCurrent() && pending) textNode.appendData(pending);
    pending = '';
  }
  function requireCurrent() {
    signal.throwIfAborted();
    if (!isCurrent()) throw new Error('Response superseded');
  }

  try {
    requireCurrent();
    output.replaceChildren(textNode); // Once for this response.
    output.dataset.state = outcome;
    status.textContent = 'Generating response; text is provisional.';
    const stream = model.promptStreaming(input, { signal });
    for await (const delta of stream) {
      requireCurrent();
      if (typeof delta !== 'string') {
        throw new TypeError('This renderer requires text-only chunks');
      }
      if (size + delta.length > maxCodeUnits) {
        throw new RangeError('Response exceeded the display limit');
      }
      accepted.push(delta);
      size += delta.length;
      pending += delta;
      if (frame === null) frame = requestAnimationFrame(flush);
    }
    requireCurrent();
    outcome = 'complete';
  } catch (error) {
    failure = error;
    outcome = !isCurrent() ? 'superseded'
      : signal.aborted ? 'stopped' : 'failed';
    // Also stop inference on renderer/limit failures.
    if (!signal.aborted) controller.abort(error);
  } finally {
    if (frame !== null) cancelAnimationFrame(frame);
    flush(); // Accepted text must not wait for another paint callback.
    if (isCurrent()) {
      output.dataset.state = outcome;
      status.textContent = outcome === 'complete'
        ? 'Response ready.'
        : outcome === 'stopped'
          ? 'Stopped; the displayed response is partial.'
          : 'Response failed; the displayed response is partial.';
    }
  }
  return { outcome, text: accepted.join(''), error: failure };
}
```

`CharacterData.appendData()` extends an existing text node rather than interpreting HTML. Animation-frame APIs schedule/cancel callbacks. Those are native DOM/platform facilities, independent of AI readiness. [DOM character data][dom], [animation-frame interface][frames]

**Original integration advice.** Consume without awaiting a frame for every chunk; buffer visual writes, then flush once on completion/failure. Keep the display limit, because background tabs and long answers can accumulate data. Cap response size, DOM nodes, transcript retention, and diagnostic logging separately. Check current-generation ownership before every write. The array avoids repeatedly rebuilding the canonical complete string during collection; it still consumes memory proportional to accepted output. This is not a performance benchmark or a backpressure guarantee for model generation.

Batch scrolling too, and scroll only if the user was already following the bottom. Do not recreate the message or steal focus per chunk. Avoid artificial per-character animation and defer expensive syntax highlighting until completion. Measure long answers on the actual target device; requestAnimationFrame does not make an expensive parser cheap. Failure details may be shown as text in a diagnostic view; the user-facing status should explain whether an answer is complete.

## Markdown: choose and verify a real end-to-end boundary

**Library fact.** `streaming-markdown` describes an optimistic parser, exposes `parser_write()` and `parser_end()`, and lets a renderer set token attributes. Ending flushes remaining parser state; that is parser finalization, not proof that generation completed. The pinned library README is **6beb92d991ed5a16f62cdfefac739b6eee45555f**. [Pinned parser contract][smd]

**Original incremental-design recommendation.** Markdown syntax spans chunks: backticks, emphasis, entities, link labels/destinations, reference definitions and nested lists can remain ambiguous. Keep one parser state per answer; an independent parse of each chunk loses that context. Decide which constructs can be shown provisionally and which must remain inert until fully known. Parser cleanup on abort must not activate a partial link or silently upgrade an interrupted answer to complete. Do not merge parser state across responses.

Two reasonable future experiments are:

1. **Plain text while generating; format once after completion.** Collect a bounded canonical string, parse the completed Markdown, sanitize the resulting HTML/DOM under an explicit small policy, apply link/image policy before live insertion, then replace the response once. On stop/error retain the partial plain text. This minimizes incremental rich-rendering complexity, although final replacement can affect selection.
2. **Incremental rich rendering.** Use a parser with reviewed token semantics and a renderer that constrains tag/attribute creation before attachment. If a sanitizer is used, sanitize the actual generated representation in its intended context before connecting it. Validate URL attributes before they can navigate or initiate loads; never allow arbitrary model token streams into a supposedly safe token renderer. Finalize and verify the complete result. This requires more boundary tests than plain text.

Do not sanitize isolated chunks and join them later, discard a sanitizer's returned value, attach an unsafe fragment and clean it afterward, or pass supposedly clean output through a renderer/highlighter that reintroduces unsafe HTML. The `removed` list can support diagnostics, but is not an XSS detector or authorization decision. A policy may reject rich formatting and retain literal source when content cannot be represented safely. Explain any formatting changes without claiming a sanitized answer exactly preserves all original markup. [DOMPurify caveats][purify]

WHATWG's current HTML Standard provides safe parsing/insertion methods such as `setHTML()` and configuration keys `elements`/`attributes`; the older example's `Sanitizer.sanitize(fragment)` interface is not its current IDL. `Unsafe` methods have different defaults. Specification presence does not prove runtime support. Feature-check a chosen safe sink and fail back to text if unavailable. Use the [guidelines chapter's current Sanitizer comparison](chrome-ai-guidelines.md#current-sanitizer-authority-and-example-drift) rather than inventing a compatibility polyfill. [HTML sanitization][html]

### Links, images, and executable-looking content

**Original local-app policy.** Permit a small formatting vocabulary first: paragraphs, lists, emphasis, and literal code. Exclude forms, embedded documents, style/event attributes, custom elements, and model-provided IDs/names. Rich output is display data; pasted JavaScript, HTML, shell commands, tool names, and checkboxes do not become executable UI.

Prefer app-owned task navigation constructed from verified record IDs. If external links are added, validate the complete URL with an explicit protocol/destination policy before setting `href`; show the destination, require a user click, and configure new-tab relationship/referrer behavior deliberately. A safe-looking label does not verify its target. Do not automatically fetch generated links or render remote images. Sanitized HTTP(S) image URLs can still produce network requests, tracking, unwanted content, or offline failures. Rendering policy must protect the local-only product's behavior as well as the HTML execution boundary. No new CDN/library/image dependency is recommended by this research.

Native Prompt API, DOM text nodes and supported safe HTML sinks are platform APIs. Marked, streaming-markdown, DOMPurify and sanitize-html are optional developer-supplied libraries. Their mention in Chrome guidance does not make them built-in browser globals or required dependencies. The no-build prototype can keep plain text; any future locally supplied module needs explicit version, license, PWA/offline, update and security decisions. See [demo renderer/URL audit](chrome-ai-demos.md#streaming-and-safe-display).

## Provisional display and screen-reader behavior

W3C guidance calls for programmatically identifiable status messages and warns that excessive live updates can be too chatty. It also discusses retaining context in atomic announcements and announcing the end of a waiting state. [WCAG status-message explanation][wcag]

**Original UX proposal.** Use a polite, concise status region for Generating, Stopped, Failed, and Ready; keep the per-chunk answer region quiet. Offer deliberate reading/copying of the finished answer, preserve keyboard focus and selection, and test the experience with actual assistive technology. If sentence/paragraph announcements are offered, throttle them and make the setting optional. Do not announce every token or mark the full expanding response as an assertive live region. A partial answer must remain visibly and programmatically identified as partial. Reduced-motion preferences should also apply to decorative typing effects.

Keep generation status distinct from download progress, tool permission, tool running, and Saved. A word appearing on screen is evidence only that text arrived. Verified execution receipts establish application effects. A cancelled generation may coexist with a saved tool result; the UI should preserve both facts.

## Repository comparison and proposed evaluation

Read-only observation: `app.js` currently calls complete `prompt()` for native turns and constrained routing/arguments/replies. `appendMessage()` creates text nodes; `harness.js` parses complete native turns. There is no existing production `promptStreaming()` path in those files. Plain-text display already fits the minimal side panel; adding streaming should be a separate experiment, initially for longer explanation text, without replacing the guarded mutation loop. [App](../../app.js), [harness](../../harness.js)

The following is a **future evaluation matrix, not executed tests or measured results**. Record browser/channel, source or wrapper contract, model configuration, sample length, error stage, chunk kinds, and observed outcome without leaking task content into diagnostics.

| Experiment | Evidence to collect | Expected boundary |
| --- | --- | --- |
| Repeated strings, empty chunks, many small/large chunks | Exact assembled text; DOM-write count | No prefix heuristics, duplication, or dropped deltas |
| Normal close, empty answer, malformed final Markdown | Outcome/history record | API completion distinguished from semantic quality |
| Stop before first output, mid-answer, after close | Signal/error and displayed state | Partial stays partial; completed answers remain complete |
| Break/cancel iteration versus abort supplied signal | Backend/request behavior on exact build | No assumed cancellation equivalence |
| Navigation, new generation, detached output | Late callbacks and state ownership | No stale write into a newer answer |
| Large output and background-tab suspension | Memory, pending-buffer size, final flush | Bounded output; no dependence on a final frame firing |
| Long Markdown, code fences, lists split at every boundary | Whole-input versus split-input results | Predictable parser finalization and bounded rendering work |
| Split HTML/events/entities and dangerous URL schemes | Generated DOM/attributes before attachment | No unsanitized sink or partial-URL activation |
| Allowed external link and remote image | Actual network/navigation behavior | Explicit link policy; no automatic remote loads |
| Native text + multiple tool dictionaries | Actual chunk shapes and pending calls | No object coercion; validation before dispatch |
| Parser/highlighter failure and output cap | Failure state, abort, partial display | Stop work visibly; no mutation/retry from renderer |
| Keyboard, selection, scroll, screen reader, reduced motion | User-visible and AT feedback | Stable focus; restrained announcements; honest state |

Prioritize the delta/plain-text experiment and cancellation/ownership checks first. Evaluate rich formatting only if user comprehension benefits justify its larger trust boundary. For tooling, retain deterministic validation, permission and receipts outside all renderers.

[chrome-render]: https://developer.chrome.com/docs/ai/render-llm-responses
[chrome-prompt]: https://developer.chrome.com/docs/ai/prompt-api#streamed_output
[draft]: https://webmachinelearning.github.io/prompt-api/#sotd
[generation]: https://github.com/webmachinelearning/prompt-api/blob/dfcddb444a2763a823e1a7a8bb0af7c54009536a/index.bs#L707-L753
[abort]: https://github.com/webmachinelearning/prompt-api/blob/dfcddb444a2763a823e1a7a8bb0af7c54009536a/README.md#aborting-a-specific-prompt
[responder]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/model_execution_responder.cc#L315-L419
[idl]: https://github.com/chromium/chromium/blob/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a/third_party/blink/renderer/modules/ai/language_model.idl#L59-L76
[streams]: https://streams.spec.whatwg.org/#rs-asynciterator
[dom]: https://dom.spec.whatwg.org/#dom-characterdata-appenddata
[frames]: https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html#animation-frames
[purify]: https://github.com/cure53/DOMPurify#is-there-any-foot-gun-potential
[marked]: https://marked.js.org/#usage
[smd]: https://github.com/thetarnav/streaming-markdown/blob/6beb92d991ed5a16f62cdfefac739b6eee45555f/readme.md#usage
[html]: https://html.spec.whatwg.org/multipage/dynamic-markup-insertion.html#html-sanitization
[wcag]: https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html
