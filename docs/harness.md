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

The system instruction describes list semantics and natural-language workflows. Sixteen native WebMCP tools remain registered: the original ten primitives, five item workflows that resolve names in application code, and weekly_review for explicit progress control. Model declarations expose only tools/choices usable in the current request.

| User request | Expected operations |
| --- | --- |
| Add bananas to shopping list | `add_shopping_item` resolves the intended Shopping List and matching child Task. If no list exists, create the default Shopping List and its child in one transaction. Ask which list when ambiguous. Reopen a matching completed entry instead of duplicating it. |
| Completed research for new car | `complete_task` resolves the existing Task by title and changes only status. Ask which item when ambiguous, report a missing match, and avoid another write when already completed. |
| Capture compare car insurance, book a test drive, and renew passport | `capture_tasks` receives separate titles, up to twenty, and creates missing Inbox Tasks in one transaction. Reuse exact matching unfinished parentless Tasks; reopen matching completed Tasks by changing only status. Existing context and description remain intact. |
| Move insurance comparison and test drive into a new Buy new car project | `organize_tasks` receives the existing title array and newProjectTitle. Resolve every source, create/reuse the Project, and move all selected Tasks atomically. An existing destination uses the readable parentId choice; null unlinks to Inbox. Preserve attributes and descendants. |
| I started comparing car insurance; waiting for the dealer quote | `set_task_status` selects the existing Task title and requested allowed status, changing status only. Missing/ambiguous matches ask a question; already matching status is a no-op. |
| Start my weekly review; this step is done, move on; pause my review | `weekly_review` starts/resumes, completes/skips the current step, goes back, or pauses. A complete/skip call always needs fresh user permission; one review transition ends the current turn. |

Model-facing schemas use readable enum choices for item references, existing Task titles, organization-title arrays and Shopping List names. Review action choices match current progress. New capture/project/purchase titles normally remain free text. Storage IDs are projected out of schemas, workspace context, results and historical strings. The application translates a selected reference back to its actual ID immediately before native execution. Unknown choices and changed targets are rejected. Opaque model call identifiers remain intact; they identify a tool response, not a stored item.

Choices remain fixed throughout a logical request, including result feedback. Regenerating numbered labels mid-turn could retarget an old choice when a new record sorts before it. Newly created records become selectable on the next user turn; shopping creation, mind-dump capture and new-Project organization perform their composite changes atomically without asking the model to target newly generated IDs. The JSON bridge and typed native path share this boundary. The native WebMCP descriptors, activity cards and stored records retain their actual IDs.

Each native user request creates a local session with current choices; the bridge clones the prepared session where supported. Both receive bounded historical/context data and the current human request as a separate user message. Whole failed or denied historical turns are omitted from model context while remaining visible and stored. A partially successful turn ending in error is also omitted; a later retry may need clarification or a state lookup. Both paths discover and execute the page's native WebMCP tools, validate inputs, and preserve callback-level approval, cancellation and stale-write protection.

1. When `LanguageModelToolCall`, `LanguageModelToolSuccess` and `LanguageModelToolError` are exposed, sessions declare the currently usable tools with native tool input/output modalities. Required-item tools are omitted when no items exist; completion, status changes and organization are omitted when no Tasks exist. Replies correlate actual outcomes with the original call IDs; batched calls execute sequentially through normal permission cards. Duplicate IDs are rejected before execution. A solitary empty ID and plain-string final replies remain supported for observed Chrome 154 behavior.
2. Otherwise the constrained JSON bridge uses two stages. First the local model chooses one available operation-name enum or respond from names/descriptions and bounded context, without receiving every input schema. Then it fills only the selected operation's complete projected inputSchema. That prompt returns only the argument object: no other operation, tool:null branch or prose envelope. respond instead uses a separate `{ message }` grammar capped at 600 characters. After an actual nonterminal tool result, the model routes again to finish or choose a remaining operation within the existing six-dispatch cap. Typed native proposals retain their declared-tool/correlated-result protocol; a safe pre-dispatch native failure enters this staged bridge.

For every post-result bridge stage, message order is the original human request first, projected verified context next, and the stage-specific continuation instruction last. Route/arguments stages ask for only the remaining operation; respond asks for a result-based answer. This keeps the already-fulfilled imperative from becoming the final instruction while retaining the request needed to finish compound item work.

Routing examples distinguish review-step completion from Task completion and organization from status changes. Saved review context includes its active flag, position, marks and current step even while paused. Organization's model schema uses two complete exclusive `anyOf` object branches: existing parent or Inbox, or a new Project name. The full public schema and callback validation still enforce exactly one destination.

Capture preserves a recognized, well-formed quoted title list after exact title(s): or task(s) named/called/titled, within twenty titles and 200 characters per title. Lossless literal extraction supplies an exact model enum and a pre-dispatch exact-set check, rejecting shortened, missing, duplicate or invented entries. Distinct literals that collide under workflow normalization or model projection reject before inference. It does not select an operation through regex: routing remains a model decision. Malformed or over-bound lists and freeform mind dumps retain ordinary model extraction and the normal permission/validation boundary; this is not a universal guarantee for every quoted format. Context remains a supplied place or condition rather than a copy of task text.

Actual Chrome capture proposals with an array and a numbered scalar alternative both rejected with kErrorUnknown before dispatch. The numbered adapter is not retained. The error alone does not identify an underlying browser cause; the compatible response is to use the existing constrained JSON proposal path on the same local Chrome model and native WebMCP.

Tools also offers Use JSON proposals while native mode is active. This stops pending work and returns to the normal preparation consent using the selected bridge format. The choice lasts until reload, preserves saved data/history and does not masquerade as a native inference failure in diagnostics. Startup pauses the saved review without replaying any model request.

The automatic switch occurs only when the first native prompt rejects on a fresh user request, with zero dispatched calls, no continuation and no cancellation or AbortError. It destroys the rejected session, prepares a bridge session and retries the still-undispatched request. A dispatched call, continuation failure, cancelled prompt or invalid parsed response cannot trigger this retry. The bridge remains active until reload, including after chat reset. Tools & diagnostics exposes nativeProposalFailure and the active loop. If replacement model creation fails, the workspace returns to a useful model-unavailable startup screen with Retry. Every callback permission, stale check and transaction boundary remains in force.

Chrome 154 rejected the complete model grammar with `NotSupportedError`, but accepted a projection excluding `oneOf`, `not` and `minProperties`. Both model paths use that compatible projection. Mixed null/string enums also failed native schema serialization; nullable model references use `anyOf` with separate null and string-enum alternatives. The full native WebMCP schemas and application validators retain the stronger rules, including nonempty patches and exclusive view/item selection; only the model decoder is simplified.

Workflow approval cards show the resolved effects before saving. Storage re-resolves the plan inside one read/write transaction and compares its approved snapshot. New ambiguities, edited targets and duplicate purchases introduced while awaiting permission stop the transaction. A missing list and its purchase, all captured Tasks, or a new Project and all selected moves commit together; no partial batch is announced as success. Reopening a captured completed Task changes only status; organizing changes only parent; status workflows preserve every other attribute. Clean detail forms refresh after a tool changes their item, while dirty drafts keep their revision and conflict protection.

The UI's Inbox tree and rows show only unfinished parentless Tasks. Parentless containers and completed Tasks are still stored and accessible through All items/type groups. Native list_items with parentId:null remains a general parentless query, so agent queries can still inspect those records instead of confusing UI filtering with deletion.

The native path requires **Prompt API tool use** at `chrome://flags/#prompt-api-tool-use`, separate from **WebMCP for testing** at `chrome://flags/#enable-webmcp-testing`. Tools & diagnostics identifies the active path. Enabling the additional flag is optional for the app's existing two-interface startup gate.

Results sent to the model are bounded to 8,000 serialized characters; large strings/arrays are projected with an explicit truncation marker. The full result remains in activity, and stored data is unchanged. Native results use text payloads inside a random per-turn fence, preserving JSON `null` values without relying on experimental object-result conversions.

Model schemas omit repeated description metadata while native discovery retains it. The projection treats properties as a map of field names, so the actual description attribute and its input rules remain available; only schema metadata is compacted. Tool descriptions and parameter names/types/enums remain. The router omits full schemas, the argument stage receives only its selected schema, and generated replies are capped at 600 characters. Retained model history is six messages of at most 1,000 characters each. This reduces local context pressure without dropping stored records or weakening callback validation; full chat history remains in IndexedDB and the UI.

A turn dispatches at most six tools. Canonical signatures stop immediately repeated successful calls and repeated writes within the same continued request. Denial stops further dispatch; native callers receive correlated errors for denied and skipped calls. Any subsequent model proposal after that terminal feedback is not executed. Stop aborts pending work. A dispatched write is never automatically retried after a lost response.

Workflow-only turns display the verified tool receipts as their final confirmation after the model receives the results. This prevents a model acknowledgement from describing an already-listed purchase as a new addition. Model prose attached to workflow proposals is withheld before approval, and a denied workflow cannot display a subsequent invented success. Clarification results display the actual question and stop further dispatch until another user message; a model cannot guess an option and write after receiving ambiguity.

Successful primitive item writes also retain saved/deleted receipts. If later routing repeats an operation, rejects a review control or fails inference, those receipts report the verified changes before the error/boundary message. Receipt bookkeeping avoids showing an already-reported workflow or review outcome twice, including resumed capped turns. A later failure does not undo committed data.

An exact fulfilled proposal is recognized against the turn's fixed catalog before current-record validation and skipped with an informational stop. Native skipped calls receive correlated feedback; distinct queued operations still run through current-record checks. A different operation against a changed record remains stale and cannot write. Stop synchronously reports known committed receipts before aborting, without accepting late acknowledgements.

## Weekly-review control

weekly_review accepts start, resume, complete_step, skip_step, back and pause. It reads persisted progress, plans the transition, and compares the observed record inside the write transaction before saving. UI controls and startup pausing use the same comparison rule, preventing a stale cached review card from erasing newer completed/skipped marks. Chat start resumes an unfinished review and preserves a finished one; the explicit New review UI can reset review progress without touching lists.

Review completion belongs to the user. The model can propose complete/skip only after the user's current-step instruction, and callbacks ask for fresh permission even when ordinary tools already have a chat grant. Capturing, organizing and updating Tasks do not advance the review. After one weekly_review result, the turn stops with its factual receipt/question and pending calls are skipped; the next step requires another user answer.

After a successful item operation, every chat-driven review control requires a fresh human message. Post-item bridge routing removes weekly_review from both names and enum; attempting it still produces explicit boundary feedback. Typed native batches and later rounds guard it before dispatch and preserve correlated call responses, including when a review call is followed by remaining item work. Remaining requested item operations and reads can finish in the same turn; a read-only operation does not create the boundary. Continue turn carries it forward rather than authorizing review progress. Show verified receipts and ask for the separate review request, with no claim that the review advanced.

UI-started automatic step guidance passes a catalog without weekly_review, so asking a focused question cannot dispatch a progress control. The normal user-request catalog includes only applicable review actions. All eleven steps have useful initial views and stable questions; both calendar steps explicitly ask the user to consult their own calendar. Reload persists an active review as paused and does not replay model prompts or tools. Resume restores the saved step and its marks.

## Verification

The focused natural-workflow regression uses scripted model decisions, production callbacks, real DOM and IndexedDB. It covers atomic container/child creation, a second add request without duplicate creation, completion preserving other attributes and refreshing clean details, both native ID spellings, typed batch denial and replay prevention. Workflow transaction checks cover stale approval, ambiguity, cancellation and rollback after a failed second write. The catalog continuation regression deliberately inserts a same-title record before the original record and checks that an old readable choice still selects the original. These establish harness behavior, not model language understanding.

The review-workflow runner exercises production schemas/planners and real IndexedDB for atomic multi-capture, completed-task reopening, all-or-nothing Project moves, status preservation, stale approvals and transaction rollback. The weekly-chat runner scripts all eleven review steps across constrained JSON and both native call-ID contracts, including mind dumps, new Projects, moves, Waiting For, actionable Inbox and pause/reload/resume. The review-UI integrity runner checks stale Complete/Pause controls preserve newer marks and automatic guidance excludes review controls. These test scopes describe deterministic coverage; they are not a claim that a real native model has completed the new weekly workflow.

```sh
node tests/harness-check.mjs
node tests/natural-workflows.cjs
node tests/workflow-operations.cjs
node tests/review-workflow-operations.cjs
node tests/weekly-chat.cjs
node tests/review-ui-integrity.cjs
node tests/native-proposal-fallback.cjs
node tests/bridge-routing.cjs
node tests/bridge-receipts.cjs
node tests/review-chat-boundary.cjs
node tests/catalog-continuation.cjs
node tests/native-contract.cjs
node tests/browser-review.cjs
node tests/reviewer-check.cjs
node tests/pwa-check.cjs
node tests/self-check.mjs
```

The native-proposal-fallback runner checks the narrow pre-dispatch retry boundary; failures after dispatch, continuations and cancellations must not replay an operation. This is deterministic compatibility coverage, not evidence that native proposal generation itself succeeded.

The independent reviewer added bridge-routing.cjs to test the actual staged boundary: routing gets names/descriptions only; argument generation gets the selected schema; inference cannot save before approval; unknown operations, old envelopes, null arguments and invalid replies fail without execution. Stop during either inference stage prevents late permission cards, and a routing failure after a committed write preserves the single commit without a retry affordance. harness-check.mjs separately protects the real description field from metadata compaction. Scripted responses make these meaningful application checks, while real model behavior remains separately reported.

bridge-receipts.cjs checks post-result message ordering, preserved receipts after repeat/inference failure, compound item operations and no duplicate review receipt. review-chat-boundary.cjs checks bridge choices and queued/later native review calls after workflow/primitive writes, correlated feedback, preserved review progress and a separately confirmed fresh request. These checks also keep read-then-review available.

Real-model observations and evidence are recorded in [natural-language review](natural-language-review.md) and [weekly-review evidence](weekly-review.md). The latter records a full eleven-step assisted walkthrough using the real local model and native WebMCP through the JSON bridge, including clarifications, denied proposals and persistence checks. Experimental typed native proposal generation did not complete that walkthrough; scripted native decisions establish application behavior separately.

## Prototype limits

The catalog contains choices from all stored items; filtering the UI does not reduce its size. Earlier synthetic full-catalog measurements were about 61 KB at 100 short-title items and 560 KB at 1,000. Typed native declarations still scale with the catalog. The JSON router avoids sending every schema, but its selected schema can still grow with reference/title choices. Large catalogs can exceed the local model's capacity. No records are silently dropped; the existing manual controls remain available. Further catalog scoping is future work. Choices refresh between user turns, so a newly created record cannot be targeted by a primitive within that same turn.
