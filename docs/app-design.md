# App design: local lists and weekly review

Design baseline: 2026-10-11. This document translates `INTENT.md` into a complete, deliberately small app. `AGENTS.md`, the repository's ponytail skill, the existing code, and the current (locally modified) `DESIGN.md` were read. Preserve the maintainer's root design file. Keep vanilla HTML, CSS, and JavaScript, relative asset URLs, no dependencies, no build, and no application server. A static HTTP server is only a way to serve files locally; HTTPS or localhost is the supported runtime.

## Existing app and required change

The existing app is a prompt playground with preferences and history in IndexedDB. Its three page-action stubs are not a list manager. It guesses obsolete AI interfaces and imaginary WebMCP globals, silently substitutes local actions, and can announce success after inference fails. Its service worker caches arbitrary requests, substitutes HTML for failed assets, and deletes unrelated caches. Replace those behaviors with an explicit startup gate, a real persistent list workspace, registered native tools, and an honest local agent loop. Preserve existing preference/history stores during a database upgrade.

The smallest complete product has one workspace, one chat, one weekly review, and one tools/diagnostics view. No accounts, sync, remote models, external APIs, project collaboration, drag-and-drop, rich text editor, due dates, attachments, calendar integration, or separate multi-agent runtime.

## Native capability and application responsibility

Use global `LanguageModel.availability()` and `LanguageModel.create()` with matching text/English capabilities, `initialPrompts`, and a download `monitor`. Use `session.prompt()` with `responseConstraint` for an object containing an assistant message and at most one proposed tool call. Destroy discarded sessions and support aborting a request. Model download requires a user gesture; model inference is local after preparation. [Chrome Prompt API](https://developer.chrome.com/docs/ai/prompt-api).

Use current `document.modelContext.registerTool()`, `getTools()`, and `executeTool(discoveredTool, argumentsObject)`. Registration takes a name, description, input schema, callback, and optional annotations; discovery returns descriptors used for execution. WebMCP is experimental and its shape may change. [Chrome imperative WebMCP API](https://developer.chrome.com/docs/ai/webmcp/imperative-api).

These APIs do not imply an automatic bridge between a text prompt and page operations. The app implements that bridge: discover its own registered tools, describe them to the model, validate the constrained proposal, execute through native WebMCP, feed the result back, and ask for a final answer or another tool. This is **application orchestration using native APIs**, not an invented WebMCP implementation. Do not require the experimental native Prompt API tool-use flag for this minimal harness. No runtime demo selection or fallback may bypass missing APIs. Test doubles belong exclusively in an isolated test harness and must be reported as such.

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

The sidebar starts with virtual navigation groups: Inbox, Projects, Roles, Areas of responsibility, Checklists, Shopping lists, All items, and Someday/Maybe. These are filters, not persisted item types. Inbox means no parent; type groups contain matching top-level containers, with real descendants nested beneath them. Someday/Maybe is a view of items whose Context includes `@Someday/Maybe`, keeping the required six types unchanged.

An item with children or a container type opens a direct-child list. A leaf Task opens its detail. Each container list has “Edit details” for its own attributes; container items must not lose their description/status/context. Distinguish expand/collapse from select. Keep selection and expansion local preferences. A compact “New item” action uses the selected container as default parent, or Inbox when viewing a virtual group.

Use semantic nested lists and disclosure buttons unless implementing the full ARIA tree keyboard pattern. Expansion buttons say “Expand [title]”; selection buttons expose current selection. Users must be able to traverse, expand, and select with a keyboard, without relying on hover or tiny unlabeled chevrons.

### Lists and details

List header: breadcrumb, title, count, New item, and Edit details where applicable. Toolbar: plain text search, Status filter, Context filter. Rows show title/type, status, context, and child count; opening the title follows hierarchy behavior. A status control can mark an item Completed without deleting it. Empty lists explain the current filter and offer creation. No sample user data is silently inserted; an empty first workspace is valid.

Details use a two-column form on desktop: title/description on the larger side, Type, Status, Context, and Parent on the other. Fields are always labeled. Types: Project, Role, Area of Responsibility, Checklist, Shopping List, Task. Statuses: Open, In Progress, Completed, Waiting For, Blocked. Context accepts a freeform string (examples `@Home`, `@Work`, `@Someday/Maybe`). Description is plain text. Save is explicit; unsaved changes have a visible indication and navigation must offer Save, Discard, or Cancel. A parent select lists eligible items and includes Inbox (no parent). Exclude the current item and its descendants.

Manual deletion opens a dialog naming the item and number of descendants. The single defined delete behavior is removal of the entire subtree; Cancel keeps everything. Parent movement never implicitly deletes descendants. Validation errors attach to fields and keep entered text. After a successful save, update list/tree/detail together; after a failure, keep the draft and report that it was not saved.

## Persistence and integrity

Retain database name `chrome-ai-webmcp-prototype`; increment its version and add `items` and `reviews` stores while preserving v1 `preferences`/`history`. Resolve writes on transaction completion, not merely the individual request's success. Only update committed in-memory state after the transaction succeeds.

An item is `{ id, type, title, description, status, context, parentId, createdAt, updatedAt }`. Use a generated UUID; empty parent is `null`; timestamps are ISO strings. Require a trimmed nonempty title, known type/status, string description/context, an existing parent, and no self-parent or ancestry cycle. Suggested bounded inputs: title 200 characters, context 200, description 10,000. Use one shared validator for forms, tools, and stored updates. Reject unknown patch fields. Preserve creation timestamp and id on update. A container is a view concept; any item can have children because intent permits sub-items.

Persist selected view/item, theme, tree expansion, and weekly-review progress locally. Do not persist tool approval grants. Chat/history can persist as local text records, but app startup must not automatically replay old prompts or proposed actions. Clear chat requires confirmation and never clears task data. Store review step index, completed/skipped step IDs, and completion time; a new review resets the review session only. Report local storage limitations honestly: clearing browser site data removes lists and history. Multi-tab database changes should reload committed data or report conflicts rather than silently overwrite a draft.

## Tool surface and authorization

Use a small consistent surface that covers the intent's list, attribute, and relationship operations:

| Tool | Input | Output / effect |
| --- | --- | --- |
| `list_items` | Optional parentId, type, status, context, search; limit 1–100 | Matching item summaries plus total/truncated indicator. Omitted parent searches all; explicit null means Inbox. |
| `read_item` | id | All item attributes and immediate child IDs. |
| `create_item` | Required title; other known fields optional | Committed new item; defaults Task, Open, empty text, Inbox. |
| `update_item` | id and nonempty patch of known editable attributes | Committed updated item; id/timestamps not patchable. |
| `delete_item` | id | Delete exact approved subtree; return deleted IDs/count. Always consequential. |
| `list_attributes` | No arguments | Type/status enums, editable names, defaults and parent rules. |
| `read_attribute` | id, attribute enum | Exact stored value. |
| `update_attribute` | id, attribute enum, value | Uses the same update validator. |
| `set_parent` | id, parentId (id or null) | Link/reparent/unlink; preserves subtree and validates cycles. |
| `show_view` | Named view or itemId; optional known filters | Adjust visible app selection; return current view. No arbitrary selector or URL. |

All schemas use `type: object`, explicit properties/required fields, and `additionalProperties: false`; validate again at the callback boundary because schemas/hints are not authorization. Read tools use read-only annotations; content tools mark user-supplied output untrusted; deletion uses consequential annotation. Set parent/update/create are writes. Tools stay registered throughout a ready workspace; individual commands reject invalid/currently unavailable targets rather than constantly changing names with selection.

Before the first agent tool execution, show a permission card in chat: the tool, its purpose, and readable arguments. Choices: Allow once, Allow for this chat, Deny. A grant lasts only until chat reset, page close, or explicit revocation in Tools. “Allow for this chat” permits regular tools but never deletion. For each deletion, show a separate danger confirmation with item titles/count and exact effect, Allow delete / Cancel. Do not trust a model-provided `approved` field; approval is an app-owned interaction.

Enforce the same checks inside registered callbacks for external tool calls. One pending approval/action at a time; reject or queue additional calls without losing the active card. Snapshot target IDs/version before approval and re-check after approval. If the target or subtree changed, require a new confirmation. Denial produces a structured denied result; it never retries automatically. Abort/reset settles pending approvals as cancelled and prevents later execution. After a write transaction has committed, cancellation cannot claim it was undone.

## Chat and local agent loop

Assistant panel has a compact header with Local model status, Chat / Tools switch, New chat, transcript, and a bottom composer. User/assistant text is rendered as text nodes. Enter submits; Shift+Enter adds a line. During inference show Working and Stop, allow one turn at a time, and disable duplicate submission.

The model envelope is conceptually `{ message: string, tool: null | { name: allowedName, arguments: object } }`. Send the current selected view, review context, tool descriptions/schemas, and a bounded conversation. Feed results into the next prompt as delimited data, never as instructions. Parse/validate the model proposal and schema before execution; malformed/unknown proposals produce an error without side effects. At most six consecutive tool calls per user turn; stop visibly and ask the user to continue when the cap is reached. Re-discover native tools before calls and fail if a registered tool disappeared. Do not retry writes after ambiguous failures. Read failures can be reported to the model once; repeated invalid output ends the turn.

Tool activity appears inline: requested, awaiting approval, running, succeeded, denied, cancelled, failed. Keep the exact result or error in a collapsible details area. A model answer does not prove that a write succeeded; only committed tool output allows success wording. Inference errors keep the user's message and offer retry. Reset destroys/recreates the session and removes grants; a failed model recreation prevents further chat instead of substituting canned responses.

This loop is intentionally one local session. Weekly review is a controlled app state supplied to that session, not a second hidden autonomous agent.

## Weekly review

Weekly review opens a compact progress card above chat and a step checklist in main content. Start/resume is explicit. Each step selects the useful list, sends a small step-specific instruction to the real model, and asks a question. User answers use the ordinary chat/tools loop with the same permission and deletion controls. Provide Back, Complete step, Skip, and Pause. The user completes steps; the model cannot silently advance progress or claim completion. Pausing preserves progress; resume never replays an old mutation.

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

## Reference use

`INTENT.md` supplies the hierarchy and attribute requirements and its Asana/Jira list/detail references. [Jira issue article](https://tomitribe.com/blog/its-easy-the-anatomy-of-a-jira-issue/) provides task-detail context. The [GoogleChromeLabs example extension](https://github.com/GoogleChromeLabs/webmcp-extension) supplies the chat, consent, permission, consequential-action, and tools patterns; only the interaction patterns are relevant, not its server/build architecture. Its on-device example also illustrates that an agent loop and permission policy live in application code.

The linked raw screenshot URLs in `INTENT.md` were attempted, but the web tool could not retrieve them. No claim of pixel-matching those images is made. Use the specified interaction content and current `DESIGN.md` tokens as the implementable visual source. This design remains valid without loading remote fonts, images, or runtime content.
