# Natural-language model/tool harness

Researched and updated on 2026-10-11. The app remains static, browser-only and dependency-free.

## Research

The [GoogleChromeLabs extension](https://github.com/GoogleChromeLabs/webmcp-extension/tree/6f627070736a8ca451d5acb02b70f63a1e072f92) was inspected at commit `6f627070736a8ca451d5acb02b70f63a1e072f92`.

- Its [on-device backend](https://github.com/GoogleChromeLabs/webmcp-extension/blob/6f627070736a8ca451d5acb02b70f63a1e072f92/extension/sidepanel/services/promptApiBackend.ts) uses typed Prompt API tool calls. The wrapper pauses at each round; the application supplies the actual outcome with the matching opaque call identifier. Results are bounded and fenced as untrusted data. It preserves conversation context and avoids replaying turns that already dispatched tools.
- Its [agent loop](https://github.com/GoogleChromeLabs/webmcp-extension/blob/6f627070736a8ca451d5acb02b70f63a1e072f92/extension/sidepanel/hooks/useAgentSession.ts) discovers tools, checks permission, executes on the page, refreshes discovery and sends results back until the model finishes or reaches a limit.
- The [Prompt API proposal](https://github.com/webmachinelearning/prompt-api#tool-use) specifies open-loop tool declarations, typed calls and matching success/error replies. The application retains control over execution. The pinned extension uses `callID`; the current proposal uses `callId`.
- [Chrome documentation](https://developer.chrome.com/docs/ai/prompt-api#pass_a_json_schema) supports constrained JSON output and `omitResponseConstraintInput`, which avoids adding a second copy of the schema to model context when the application already supplies instructions.

We adopt these interfaces and control-flow patterns directly using native browser APIs. The extension's server backend, build system and EasyLanguageModel dependency are not needed by this app.

## App behavior

The system instruction describes list semantics and natural-language workflows. Two focused tools resolve names in application code; the original ten primitives remain available through native WebMCP:

| User request | Expected operations |
| --- | --- |
| Add bananas to shopping list | `add_shopping_item` resolves the intended Shopping List and matching child Task. If no list exists, create the default Shopping List and its child in one transaction. Ask which list when ambiguous. Reopen a matching completed entry instead of duplicating it. |
| Completed research for new car | `complete_task` resolves the existing Task by title and changes only status. Ask which item when ambiguous, report a missing match, and avoid another write when already completed. |

Model-facing schemas use readable enum choices for item references, existing Task titles and Shopping List names. Storage IDs are projected out of schemas, workspace context, results and historical strings. The application translates a selected reference back to its actual ID immediately before native execution. Unknown choices and changed targets are rejected. Opaque model call identifiers remain intact; they identify a tool response, not a stored item.

Choices remain fixed throughout a logical request, including result feedback. Regenerating numbered labels mid-turn could retarget an old choice when a new record sorts before it. Newly created records become selectable on the next user turn; the shopping workflow handles its own parent/child creation atomically. The JSON bridge and typed native path share this boundary. The native WebMCP descriptors, activity cards and stored records retain their actual IDs.

Each native user request creates a local session with current choices; the bridge clones the prepared session where supported. Both receive bounded historical/context data and the current human request as a separate user message. Whole failed or denied historical turns are omitted from model context while remaining visible and stored. A partially successful turn ending in error is also omitted; a later retry may need clarification or a state lookup. Both paths discover and execute the page's native WebMCP tools, validate inputs, and preserve callback-level approval, cancellation and stale-write protection.

1. When `LanguageModelToolCall`, `LanguageModelToolSuccess` and `LanguageModelToolError` are exposed, sessions declare the currently usable tools with native tool input/output modalities. Required-item tools are omitted when no items exist, and completion is omitted when no Tasks exist. Replies correlate actual outcomes with the original call IDs; batched calls execute sequentially through normal permission cards. Duplicate IDs are rejected before execution. A solitary empty ID and plain-string final replies remain supported for observed Chrome 154 behavior.
2. Otherwise the existing constrained JSON bridge remains available. Its grammar now binds each tool name to the corresponding argument field types, required fields and enums. Continuations send the most recent verified result, without repeating the full catalog or user request.

Chrome 154 rejected the complete model grammar with `NotSupportedError`, but accepted a projection excluding `oneOf`, `not` and `minProperties`. Both model paths use that compatible projection. Mixed null/string enums also failed native schema serialization; nullable model references use `anyOf` with separate null and string-enum alternatives. The full native WebMCP schemas and application validators retain the stronger rules, including nonempty patches and exclusive view/item selection; only the model decoder is simplified.

Workflow approval cards show the resolved effects before saving. Storage re-resolves the plan inside one read/write transaction and compares its approved snapshot. New ambiguities, edited targets and duplicate purchases introduced while awaiting permission stop the transaction. A missing list and its purchase commit together, with actual generated IDs; no partial list is announced as success. Clean detail forms refresh after a tool changes their item, while dirty drafts keep their revision and conflict protection.

The native path requires **Prompt API tool use** at `chrome://flags/#prompt-api-tool-use`, separate from **WebMCP for testing** at `chrome://flags/#enable-webmcp-testing`. Tools & diagnostics identifies the active path. Enabling the additional flag is optional for the app's existing two-interface startup gate.

Results sent to the model are bounded to 8,000 serialized characters; large strings/arrays are projected with an explicit truncation marker. The full result remains in activity, and stored data is unchanged. Native results use text payloads inside a random per-turn fence, preserving JSON `null` values without relying on experimental object-result conversions.

A turn dispatches at most six tools. Canonical signatures stop immediately repeated successful calls and repeated writes within the same continued request. Denial stops further dispatch; native callers receive correlated errors for denied and skipped calls. Any subsequent model proposal after that terminal feedback is not executed. Stop aborts pending work. A dispatched write is never automatically retried after a lost response.

Workflow-only turns display the verified tool receipts as their final confirmation after the model receives the results. This prevents a model acknowledgement from describing an already-listed purchase as a new addition. Model prose attached to workflow proposals is withheld before approval, and a denied workflow cannot display a subsequent invented success. Clarification results display the actual question and stop further dispatch until another user message; a model cannot guess an option and write after receiving ambiguity.

## Verification

The focused natural-workflow regression uses scripted model decisions, production callbacks, real DOM and IndexedDB. It covers atomic container/child creation, a second add request without duplicate creation, completion preserving other attributes and refreshing clean details, both native ID spellings, typed batch denial and replay prevention. Workflow transaction checks cover stale approval, ambiguity, cancellation and rollback after a failed second write. The catalog continuation regression deliberately inserts a same-title record before the original record and checks that an old readable choice still selects the original. These establish harness behavior, not model language understanding.

```sh
node tests/harness-check.mjs
node tests/natural-workflows.cjs
node tests/workflow-operations.cjs
node tests/catalog-continuation.cjs
node tests/native-contract.cjs
node tests/browser-review.cjs
node tests/reviewer-check.cjs
node tests/pwa-check.cjs
node tests/self-check.mjs
```

Real-model observations and evidence are recorded in [natural-language review](natural-language-review.md).

## Prototype limits

The catalog contains choices from all stored items; filtering the UI does not reduce its size. Repeated enum declarations grow with the workspace: a measured synthetic catalog was about 61 KB at 100 short-title items and 560 KB at 1,000. Large catalogs can exceed the local model's capacity. No records are silently dropped; the existing manual controls remain available. Catalog scoping or compaction is future work. Native choices are refreshed between user turns, so a newly created record cannot be targeted by a primitive within that same turn.
