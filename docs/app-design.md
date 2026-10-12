# App design: local lists and weekly review

Design baseline: 2026-10-11. This document translates `INTENT.md` into a complete, deliberately small app. `AGENTS.md`, the repository's ponytail skill, the existing code, and the current (locally modified) `DESIGN.md` were read. Preserve the maintainer's root design file. Keep vanilla HTML, CSS, and JavaScript, relative asset URLs, no dependencies, no build, and no application server. A static HTTP server is only a way to serve files locally; HTTPS or localhost is the supported runtime.

## Existing app and required change

The initial app was a prompt playground with preferences and history in IndexedDB. Its three page-action stubs were not a list manager. It guessed obsolete AI interfaces and imaginary WebMCP globals, silently substituted local actions, and could announce success after inference failed. Its service worker cached arbitrary requests, substituted HTML for failed assets, and deleted unrelated caches. The replacement uses an explicit startup gate, a real persistent list workspace, registered native tools, and an honest local agent loop. Preserve existing preference/history stores during a database upgrade. The workflow refinements below describe the current implementation.

The smallest complete product has one workspace, one chat, one weekly review, and one tools/diagnostics view. No accounts, sync, remote models, external APIs, project collaboration, drag-and-drop, rich text editor, due dates, attachments, calendar integration, or separate multi-agent runtime.

## Native capability and application responsibility

Use global `LanguageModel.availability()` and `LanguageModel.create()` with matching text/English capabilities, `initialPrompts`, and a download `monitor`. When typed Prompt API tool use is exposed, declare usable native tools and correlate their result parts with opaque call identifiers. Otherwise constrain a first prompt to the available operation-name enum, then constrain a second prompt to only that selected operation's projected argument schema. A separate respond choice generates a reply of at most 600 characters. Both paths use the same readable catalog and app-controlled native execution. Destroy discarded sessions and support aborting a request. Model download requires a user gesture; model inference is local after preparation. [Chrome Prompt API](https://developer.chrome.com/docs/ai/prompt-api).

Use current `document.modelContext.registerTool()`, `getTools()`, and `executeTool(discoveredTool, argumentsObject)`. Registration takes a name, description, input schema, callback, and optional annotations; discovery returns descriptors used for execution. WebMCP is experimental and its shape may change. [Chrome imperative WebMCP API](https://developer.chrome.com/docs/ai/webmcp/imperative-api).

These APIs do not imply an automatic bridge between a text prompt and page operations. The app implements that bridge: discover its own registered tools, describe them to the model, validate the constrained proposal, execute through native WebMCP, feed the result back, and ask for a final answer or another tool. This is **application orchestration using native APIs**, not an invented WebMCP implementation. Do not require the experimental native Prompt API tool-use flag for this minimal harness. No runtime demo selection or fallback may bypass missing APIs. Test doubles belong exclusively in an isolated test harness and must be reported as such.

A native proposal failure can switch a fresh request to the existing constrained JSON bridge while retaining the local Chrome model and native WebMCP. Retry is limited to rejection of the first prompt before any tool dispatch, with no continuation, cancellation or AbortError. Never retry after a dispatched call, including when the native result is lost. Keep the bridge selected until reload, record nativeProposalFailure in diagnostics, and return to a model-unavailable startup Retry gate if replacement session creation fails. This compatibility path preserves all validation, permissions and storage rules.

Only use tools registered by this page, resolved by exact name and same origin/document. The browser may expose other frame tools; do not include them in this app's allowlist. Registration callbacks enforce validation and permissions themselves, so an external native WebMCP caller cannot bypass the app's controls.

## Startup states

| State | Screen and permitted action |
| --- | --- |
| Checking | Centered compact card: “Preparing your local workspace”; API and storage checks shown as text. Workspace remains hidden. |
| Unsupported | “This browser cannot run this prototype.” List each absent requirement: secure context, Prompt API methods, or usable native WebMCP registration/discovery/execution. Link official setup docs; provide Retry. No app tools or editable workspace. |
| Model unavailable | API exists but availability is `unavailable`; describe browser/hardware/model restriction without guessing its cause. Retry; no fallback. |
| Consent | “Download the local AI model?” Explain Chrome manages the download, it needs network/storage, and lists/chat stay local. Buttons: “Download and continue”, “Not now”. Do not promise an exact download size. |
| Downloading | Progress when supplied by the browser; otherwise indeterminate preparation text. Disable repeated start. Offer Cancel. If the browser was already downloading, explain that and still ask permission before this page starts its session. |
| Model ready | Continue creates/initializes a session; a visible Continue button accommodates browsers requiring activation even when the model is available. |
| Storage/tool failure | Error with Retry. Do not pretend in-memory data is durable. Preserve any existing database; never clear it to repair startup. |
| Ready | Show the workspace only after IndexedDB opens, preferences/data load, the session is ready, and all tools register successfully. |

Declining or cancelling returns to the blocked consent state without preparing editable data. The browser owns downloads already in progress; Cancel stops this page's preparation and is not a promise to remove a browser-managed model. A storage upgrade blocked by another tab explains “Close other tabs of this app, then retry.”

## Workspace layout

The primary desktop composition is a compact 56–64px app bar above three vertical regions: 240px hierarchy, flexible main content (minimum approximately 360px), and 340px assistant. Use a restrained dark floor `#0f0f0f`, surfaces `#181818`/`#222222`, white headings, body `#a8a8a8`, borders `#333333`, primary `#0007cd`, and visible cyan focus. These derive from `DESIGN.md`; use its system sans fallback because no licensed abcDiatype font is supplied. Task UI uses 14px body and 24px view title, not marketing mega-type. Avoid decorative terminal mockups, glows, and oversized hero cards in the working app.

App bar: short product name, local readiness badge, Weekly review, Tools, theme toggle, and Install when a native install prompt is available. A light theme is optional but should retain the same layout and contrast. Show a subtle status line for durable saves, request errors, and offline state.

### Hierarchy

The sidebar starts with virtual navigation groups: Inbox, Projects, Roles, Areas of responsibility, Checklists, Shopping lists, All items, and Someday/Maybe. These are filters, not persisted item types. Inbox shows unfinished Tasks with no parent, consistently in its tree and list rows. This refines the intent's Inbox example into an actionable collection view: completing a Task or moving it into a container clears it from Inbox; parentless containers and completed Tasks remain in All items and applicable type groups. Type groups contain matching top-level containers, with real descendants nested beneath them. Someday/Maybe is a view of items whose Context includes `@Someday/Maybe`, keeping the required six types unchanged.

An item with children or a container type opens a direct-child list. A leaf Task opens its detail. Each container list has “Edit details” for its own attributes; container items must not lose their description/status/context. Distinguish expand/collapse from select. Keep selection and expansion local preferences. A compact “New item” action uses the selected container as default parent, or Inbox when viewing a virtual group.

Use semantic nested lists and disclosure buttons unless implementing the full ARIA tree keyboard pattern. Expansion buttons say “Expand [title]”; selection buttons expose current selection. Users must be able to traverse, expand, and select with a keyboard, without relying on hover or tiny unlabeled chevrons.

### Lists and details

List header: breadcrumb, title, count, New item, and Edit details where applicable. Toolbar: plain text search, Status filter, Context filter. Rows show title/type, status, context, and child count; opening the title follows hierarchy behavior. A status control can mark an item Completed without deleting it. Empty lists explain the current filter and offer creation. No sample user data is silently inserted; an empty first workspace is valid.

Details use a two-column form on desktop: title/description on the larger side, Type, Status, Context, and Parent on the other. Fields are always labeled. Types: Project, Role, Area of Responsibility, Checklist, Shopping List, Task. Statuses: Open, In Progress, Completed, Waiting For, Blocked. Context accepts a freeform string (examples `@Home`, `@Work`, `@Someday/Maybe`). Description is plain text. Save is explicit; unsaved changes have a visible indication and navigation must offer Save, Discard, or Cancel. A parent select lists eligible items and includes Inbox (no parent). Exclude the current item and its descendants.

Manual deletion opens a dialog naming the item and number of descendants. The single defined delete behavior is removal of the entire subtree; Cancel keeps everything. Parent movement never implicitly deletes descendants. Validation errors attach to fields and keep entered text. After a successful save, update list/tree/detail together; after a failure, keep the draft and report that it was not saved.

## Persistence and integrity

Retain database name `chrome-ai-webmcp-prototype`; increment its version and add `items` and `reviews` stores while preserving v1 `preferences`/`history`. Resolve writes on transaction completion, not merely the individual request's success. Only update committed in-memory state after the transaction succeeds.

An item is `{ id, type, title, description, status, context, parentId, createdAt, updatedAt }`. Use a generated UUID; empty parent is `null`; timestamps are ISO strings. Require a trimmed nonempty title, known type/status, string description/context, an existing parent, and no self-parent or ancestry cycle. Suggested bounded inputs: title 200 characters, context 200, description 10,000. Use one shared validator for forms, tools, and stored updates. Reject unknown patch fields. Preserve creation timestamp and id on update. A container is a view concept; any item can have children because intent permits sub-items.

Persist selected view/item, theme, tree expansion, and weekly-review progress locally. Do not persist tool approval grants. Chat/history can persist as local text records, but app startup must not automatically replay old prompts or proposed actions. Clear chat requires confirmation and never clears task data. Store review step index, active state, completed/skipped step IDs, and completion time; a new review resets the review session only. UI progress controls, model transitions and startup pausing compare the previously observed review record inside the same read/write transaction that commits the next record. A stale comparison rejects the change and preserves newer marks. Reload explicitly persists the paused state without replaying guidance or mutations. Report local storage limitations honestly: clearing browser site data removes lists and history. Multi-tab database changes should reload committed data or report conflicts rather than silently overwrite a draft.

## Tool surface and authorization

Sixteen native tools cover the intent's list, attribute, and relationship operations, plus common item workflows and explicit weekly-review controls. Native inputs use storage IDs where specified; model-facing schemas replace those parameters with readable enum references and resolve them only immediately before execution. Existing Task-title arrays and Shopping List names also use current readable choices; new titles normally use free text, except when the human supplies exact quoted capture titles.

| Tool | Input | Output / effect |
| --- | --- | --- |
| `list_items` | Optional parentId, type, status, context, search; limit 1–100 | Matching item summaries plus total/truncated indicator. Omitted parent searches all; explicit null queries all parentless items. The UI's actionable Inbox additionally filters to unfinished Tasks. |
| `read_item` | id | All item attributes and immediate child IDs. |
| `create_item` | Required title; other known fields optional | Committed new item; defaults Task, Open, empty text, Inbox. |
| `update_item` | id and nonempty patch of known editable attributes | Committed updated item; id/timestamps not patchable. |
| `delete_item` | id | Delete exact approved subtree; return deleted IDs/count. Always consequential. |
| `list_attributes` | No arguments | Type/status enums, editable names, defaults and parent rules. |
| `read_attribute` | id, attribute enum | Exact stored value. |
| `update_attribute` | id, attribute enum, value | Uses the same update validator. |
| `set_parent` | id, parentId (id or null) | Link/reparent/unlink; preserves subtree and validates cycles. |
| `show_view` | Named view or itemId; optional known filters | Adjust visible app selection; return current view. No arbitrary selector or URL. |
| `add_shopping_item` | title; optional existing listTitle | Resolve the Shopping List and child Task; create both atomically if absent, reuse an existing purchase, or reopen it by status only. Ask which list when ambiguous. |
| `complete_task` | Existing Task title | Complete the resolved Task by changing status only; an already completed Task is a no-op. |
| `capture_tasks` | Array of 1–20 new commitment titles; optional context | Atomically capture separate Inbox Tasks, reuse exact matching unfinished Tasks, and reopen matching completed Tasks by changing only status. Preserve existing context/description/parent. |
| `organize_tasks` | Array of 1–20 existing Task titles; exactly one of parentId or newProjectTitle | Resolve all sources before any write, then move them to an existing parent/Inbox or create a Project and move them together. Preserve attributes and descendants; ambiguity or failure leaves the whole batch unchanged. |
| `set_task_status` | Existing Task title and allowed status | Change only status to Open, In Progress, Completed, Waiting For or Blocked. Matching status is a no-op; ambiguous or missing title asks for clarification. |
| `weekly_review` | action: start, resume, complete_step, skip_step, back or pause | Persist one explicit review transition, select the next useful view and return its question. Start resumes unfinished progress and does not reset a finished review. |

All schemas use `type: object`, explicit properties/required fields, and `additionalProperties: false`; validate again at the callback boundary because schemas/hints are not authorization. Read tools use read-only annotations; content tools mark user-supplied output untrusted; deletion uses consequential annotation. Set parent/update/create are writes. Tools stay registered throughout a ready workspace; individual commands reject invalid/currently unavailable targets rather than constantly changing names with selection.

Before the first agent tool execution, show a permission card in chat: the tool, its purpose, and readable arguments. Choices: Allow once, Allow for this chat, Deny. A grant lasts only until chat reset, page close, or explicit revocation in Tools. “Allow for this chat” permits regular tools but never deletion; weekly-review complete/skip still require a new permission card every time. Workflow cards describe the resolved batch/status/review effect before approval. For each deletion, show a separate danger confirmation with item titles/count and exact effect, Allow delete / Cancel. Do not trust a model-provided `approved` field; approval is an app-owned interaction.

Enforce the same checks inside registered callbacks for external tool calls. One pending approval/action at a time; reject or queue additional calls without losing the active card. Snapshot target IDs/version before approval and re-check after approval. If the target or subtree changed, require a new confirmation. Denial produces a structured denied result; it never retries automatically. Abort/reset settles pending approvals as cancelled and prevents later execution. After a write transaction has committed, cancellation cannot claim it was undone.

## Chat and local agent loop

Assistant panel has a compact header with Local model status, Chat / Tools switch, New chat, transcript, and a bottom composer. User/assistant text is rendered as text nodes. Enter submits; Shift+Enter adds a line. During inference show Working and Stop, allow one turn at a time, and disable duplicate submission.

Typed native tool use retains its declared tools and correlated results. The constrained JSON bridge separates operation selection from argument generation. Its router receives only available names/descriptions and bounded workspace/history/review context, with a response enum containing those names and respond. After selecting an operation, supply its complete projected inputSchema alone and require only that argument object. This action stage has no tool:null alternative and cannot change the selected operation. respond has a separate `{ message }` schema capped at 600 characters.

After a verified nonterminal result, route again to finish or perform a remaining operation. Keep readable aliases stable throughout the turn and feed results as untrusted data. Model-only prompts do not count as dispatches; the existing cap remains six executed tools per user turn. Malformed/unknown choices or arguments fail before execution. Preserve approvals, stale checks, Stop between stages, and terminal denial/clarification/review behavior. Re-discover native tools before calls and fail if a registered tool disappeared. A routing or reply failure after dispatch must never replay the dispatched write.

Post-result bridge prompts order the original request first, verified context next, and the stage-specific continuation instruction last. The final instruction asks the model to finish from actual results or perform only the remaining operation, rather than ending with the already-fulfilled imperative request.

When the human explicitly supplies a quoted list after exact titles: or tasks named/called/titled, extract those literals losslessly and bind capture choices to that exact set. Reject shortened, missing, duplicate or invented titles before dispatch. This guard constrains title content; the model still selects the operation. Ordinary freeform mind dumps continue to use model extraction. Compact decoder metadata must preserve schema properties maps and the real description attribute; full native/public schemas and callback validation retain their rules.

Tool activity appears inline: requested, awaiting approval, running, succeeded, denied, cancelled, failed. Keep the exact result or error in a collapsible details area. A model answer does not prove that a write succeeded; only committed tool output allows success wording. Retain factual receipts for successful primitive item writes as well as workflows, so a later rejected proposal or inference error can still show what was saved/deleted without repeating its receipt. Inference errors keep the user's message; offer retry only when no call was dispatched. Reset destroys/recreates the session and removes grants; a failed model recreation prevents further chat instead of substituting canned responses.

This loop has one active local conversation. Native sessions refresh their tool choices for each user request; choices remain stable throughout that turn. The constrained JSON path uses the same readable catalog and resolution boundary. Weekly review is controlled app state supplied to the model, with no second hidden autonomous agent.

## Weekly review

Weekly review opens a compact progress card above chat and a step checklist in main content. Start/resume is explicit, through UI controls or the user's chat request via weekly_review. Each step selects its useful list and supplies a focused question. User answers use capture/organization/status tools through the ordinary chat loop, with the same permission and deletion controls. Capturing or updating Tasks never automatically completes a review step.

Provide Back, Complete step, Skip, and Pause. A model may propose complete_step or skip_step only in response to the user completing/skipping the current step; every such proposal requires fresh approval even with a chat grant. A turn stops after one review transition and waits for the user's next answer, preventing a batch from marching through several steps. Automatic guidance started by the UI excludes weekly_review from the model catalog, so generating the next question cannot change progress. Pausing preserves progress; startup/reload persists a pause, and resume never replays an old mutation. A finished review is preserved by chat start/resume; only the explicit new-review UI resets its progress.

After any successful item operation, a chat-driven review control requires a new human message. The bridge removes weekly_review from subsequent routing choices; typed native calls enforce the same rule before dispatch and return correlated boundary feedback. Remaining requested item work or reads can still finish, but neither a queued review call nor Continue turn can cross this boundary. A read alone does not establish it. Show the saved receipts and ask for a separate review request without claiming progress advanced.

| Phase / step | Initial view and assistant purpose |
| --- | --- |
| Get clear: Collect loose papers/materials | Inbox; ask what needs capturing. |
| Get clear: Get “In” to zero | Inbox; clarify each item, propose moving/next actions. |
| Get clear: Empty your head | Inbox; capture additional commitments through create tools. |
| Get current: Review action lists | All incomplete Tasks; inspect next actions and contexts. |
| Get current: Review past calendar | All items; ask user to consult their own calendar and describe follow-ups. |
| Get current: Review upcoming calendar | All items; ask about preparation work from the user's calendar. |
| Get current: Review Waiting For | Status Waiting For; ask what needs chasing/closing. |
| Get current: Review projects/larger outcomes | Projects; inspect outcomes and missing next actions. |
| Get current: Review checklists | Checklists; inspect recurring obligations. |
| Get creative: Review Someday/Maybe | Context @Someday/Maybe; consider activate/keep/delete. |
| Get creative: Be creative & courageous | Inbox; ask about possibilities and capture explicit choices. |

Calendar steps explicitly say the app cannot read a calendar. The final screen shows completed/skipped steps and timestamp, with a new-review action. It must never invent calendar data or a tool that is absent.

## Tools, failures, accessibility, and PWA

Tools view lists native discovered own-page tools, descriptions, input schemas, read/write/destructive badges, approval state, recent real results, and capability status. Show which native WebMCP interface is used. Report model availability/session status, IndexedDB open status, service-worker/install/offline status. Include Revoke permission and Reset chat. Avoid a decorative list that claims tools exist before registration succeeds.

At 900–1100px, reduce sidebar/panel widths or make assistant toggleable. Below roughly 850px, navigation and assistant become named drawers/tabs around a full-width content view. Below 600px, rows become stacked labeled cards and detail fields one column. All views, modal/drawer close buttons, approval choices, and Stop remain reachable at 320px without horizontal page scroll. Preserve draft/chat state when toggling panels. Native buttons/labels/dialogs, sensible focus restoration, Escape to close/cancel, visible focus, 44px touch targets, and live status announcements are required. Color is never the only status cue. Keep contrast readable; don't use DESIGN.md's darkest muted token for essential text. Respect reduced-motion preference.

Cache only the app's same-origin, same-scope static shell/assets under a unique versioned prefix. Delete only this app's older cache versions. Failed scripts/images must fail as assets, never receive `index.html`. Cache the complete shell/icons; app-shell navigation can fall back to its cached index. Do not intercept external/model downloads, do not cache task/chat data, and do not cache failed HTTP responses. Register the service worker from the existing relative scope. Align manifest/browser colors and name with the new workspace. Offer install only on native availability; offline use requires a previously cached shell and browser-ready local model. The strict startup gate still applies offline.

## Acceptance and review evidence

1. Open the unmodified runtime in a browser lacking either API: the visible error identifies the missing requirement, workspace cannot be edited, and no demo fallback is available.
2. With isolated test doubles, exercise unavailable/downloadable/downloading/available, decline, consent, cancellation, failed download, storage upgrade failure, and failed registration. Record mocked versus native evidence separately.
3. In the browser, create a Project, nested Task and Shopping List, edit every required attribute, complete an item, filter/select tree and lists, move/unlink items, reload and verify persistence. Reject blank titles, unknown enums, missing parents, and cycles. Confirm deletion count and no mutation on Cancel.
4. Exercise a real Prompt API prompt if the installed Chrome supports it; otherwise record the native restriction. The user request to try the app is not satisfied by a source review alone.
5. Exercise registered tools through WebMCP discovery/execution where available; use isolated doubles to deterministically inspect arguments, approvals, rejected malformed output, denial, cancellation, failed writes, and call cap. Never present mock inference as proof of native integration.
6. Walk all eleven weekly-review steps, pause/reload/resume, verify their filters and user-owned completion, and confirm honest calendar limitation.
7. Try keyboard form/tree/chat/dialog behavior and narrow layout; inspect focus, visible errors and saved drafts. Test unsupported-startup UI and ready UI, not just a screenshot.
8. Verify app cache scope, offline navigation/assets after first load, relative subpath URLs, manifest/icons, no unrelated cache deletion, and no server/build dependency. Include at least one meaningful assert-based self-check for new nontrivial logic, per ponytail.

Native integration cannot be claimed complete if the only available browser lacks the experimental API/model. Such a limitation belongs explicitly in the review report with the steps actually tried; the production gate must remain intact.

The workflow checks additionally cover separate mind-dump capture, completed-task reopening with status-only changes, atomic new-Project organization, status transitions, consistent actionable Inbox navigation/rows, one review transition per user turn, fresh complete/skip approval, automatic guidance without progress tools, and stale UI/model/startup review comparisons. Run `tests/review-workflow-operations.cjs`, `tests/weekly-chat.cjs`, `tests/review-ui-integrity.cjs`, `tests/native-proposal-fallback.cjs`, and `tests/bridge-routing.cjs` as documented in README. The staged-routing regression checks selection and arguments separately, approval, malformed choices, cancellation between prompts and a failed post-commit route without replay. Scripted browser decisions establish application behavior; a full real native-model weekly-review walkthrough needs separate recorded evidence. Real Chrome capture proposals using arrays and numbered scalar arguments both failed with kErrorUnknown before dispatch; no scalar adapter is part of the current design. See [weekly-review observations](weekly-review.md) for current native evidence and its limits.

## Reference use

`INTENT.md` supplies the hierarchy and attribute requirements and its Asana/Jira list/detail references. [Jira issue article](https://tomitribe.com/blog/its-easy-the-anatomy-of-a-jira-issue/) provides task-detail context. The [GoogleChromeLabs example extension](https://github.com/GoogleChromeLabs/webmcp-extension) supplies the chat, consent, permission, consequential-action, and tools patterns; only the interaction patterns are relevant, not its server/build architecture. Its on-device example also illustrates that an agent loop and permission policy live in application code.

The linked raw screenshot URLs in `INTENT.md` were attempted, but the web tool could not retrieve them. No claim of pixel-matching those images is made. Use the specified interaction content and current `DESIGN.md` tokens as the implementable visual source. This design remains valid without loading remote fonts, images, or runtime content.
