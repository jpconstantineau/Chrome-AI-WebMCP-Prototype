# Implementation plan

Prepared 2026-10-11 from [app-design.md](app-design.md), [flows.md](flows.md), `AGENTS.md`, `INTENT.md`, the current `DESIGN.md`, the ponytail skill, and the existing static app. This is the handoff to the implementation agent, followed by a separate review agent. The root orchestrator owns final acceptance, the main-branch commit, and push. Preserve the maintainer's existing uncommitted `DESIGN.md` change and exclude it from the final commit.

## Scope and deliverable

Replace the prompt playground with the designed local list manager: strict native capability/model startup gate, persistent hierarchy and item forms, native page tools, approval-controlled chat, eleven-step weekly review, diagnostics, and safe PWA shell. Use vanilla browser files with relative URLs. No package install, framework, build, application server, remote AI, API key, or runtime demo mode.

The present implementation has no item data to migrate. Its `app.js` uses database version 1 with preferences/history stores; it guesses obsolete AI interfaces, substitutes local WebMCP stubs, and reports prompt success after failure. The manifest's local icons need installability verification; the service worker deletes unrelated caches and returns HTML for any failed asset. These are replacement/fix targets, not behaviors to retain.

## File ownership and practical structure

One implementation agent owns runtime changes, so no concurrent edits are necessary. Keep the runtime small enough to read directly:

| File | Responsibility |
| --- | --- |
| `index.html` | Startup card, hidden ready workspace, named navigation/content/assistant regions, real labeled forms, reusable native dialogs, module entrypoint. |
| `styles.css` | DESIGN-derived dark tokens, compact three-column workspace, visible focus, light theme, responsive panel controls and stacked mobile forms/rows. |
| `app.js` | Startup/session lifecycle, rendering and events, draft navigation, approvals, tool registration/discovery, bounded chat loop, weekly-review presentation, diagnostics/install. |
| `workspace.js` (new ES module) | Small shared pure item validation, hierarchy/filter/descendant helpers, tool argument/envelope validation, and weekly-review step definitions. Export only what production and self-checks use. |
| `storage.js` (new ES module) | IndexedDB v2 open/read/write transactions, safe upgrade, preferences/history/review persistence, version/conflict handling. No replacement storage fallback. |
| `service-worker.js` | Versioned app-owned shell caching, limited same-scope interception, navigation-only HTML fallback. Add both new modules to shell assets. |
| `manifest.webmanifest`, icons | Verify existing icon references; use bundled/local icons, matching dark browser colors, relative scope/start URL. Add local raster icons if installability requires them. |
| `README.md` | Accurate native API/setup expectations, localhost/HTTPS serving, no direct-file recommendation, usage, local-data limitations, checks and evidence links. |
| `tests/self-check.mjs` (new) | Built-in Node assertions against shared pure production logic; no test framework dependency. |
| `tests/browser-review.cjs` (new) | Dev-only browser fixture/interaction checks using an already available Playwright installation; injectable doubles in a fresh browser context only. Runtime imports no tests. |
| `docs/review.md` (new, reviewer-owned) | Native and mocked results, commands/environment, browser interactions, findings/fixes, remaining restrictions and screenshots when useful. |

This module split keeps integrity rules testable without a browser DOM; do not turn it into a framework or a generic state/store/tool abstraction. Prefer a few named functions and ordinary objects/arrays. A single-file implementation is acceptable only if its meaningful self-check can still exercise the same production validator rather than a copied validator.

## Implementation order and exit checks

### 1. Shared data rules and safe persistence

Define the six types and five statuses exactly as the design. Implement a normalized committed item record:

```js
{ id, type, title, description, status, context, parentId, createdAt, updatedAt }
```

IDs are UUIDs, parent is an existing item ID or `null`, timestamps ISO strings. Creation defaults Task/Open/empty description/empty context/Inbox. Editable fields are only type, title, description, status, context, parentId. Preserve id/createdAt on updates. Trim/require title; cap title/context at 200 and description at 10,000. Reject unknown fields, invalid enums/types, missing parents, self-parent, cycles, and empty patches. Compute eligible parents by excluding self/descendants. A Task can itself have children.

Use the same validator for manual forms and native callbacks. Never interpolate user content into executable HTML; title, description, context, transcript, and tool JSON use text nodes or textContent. Shared helpers must distinguish omitted `parentId` (all items) from explicit `null` (Inbox).

Open the existing database name at version 2. Preserve `preferences` keyPath `id` and `history` keyPath `id`/autoIncrement exactly; add `items` keyPath `id` and `reviews` keyPath `id`. Keep old records instead of transforming or replaying them. New chat entries can be additive tagged records; read legacy prompt/response only as historical text. New preferences merge existing records rather than discarding obsolete fields. Read the existing localStorage preference key defensively; invalid JSON cannot crash startup. Never downgrade the database, clear it on startup failure, or overwrite saved items with samples.

Resolve writes and deletes only on transaction completion. Abort/errors reject and leave the form draft intact. Read/validate current parent/target data and apply mutation within one transaction; snapshot subtree deletion and compare in that transaction after approval. Updating in-memory items or displaying Saved occurs only after commit. Prefer expected `updatedAt` checks for form edits and approved writes; use an additional monotonic timestamp/revision only if needed to distinguish same-millisecond writes. On stale data, reject with a visible reload/review message instead of overwriting.

Handle `onblocked` with a close-other-tabs message and `versionchange` by closing/requiring reload. A lightweight BroadcastChannel invalidation is sufficient for multi-tab edits: reload committed lists when safe; if a draft is dirty, mark a conflict and preserve the draft. Store review progress under a fixed record ID and preferences under existing settings ID. Do not persist permission grants.

Exit: self-check rejects invalid/cyclic updates, preserves descendants on move, distinguishes Inbox/all queries, and produces the exact deletion subtree. Browser upgrade fixture keeps v1 preferences/history intact. Injected transaction failure produces no success claim or lost draft.

### 2. Strict startup and native lifecycle

Render a usable startup error/consent UI before exposing the workspace. Require secure context, `LanguageModel.availability/create`, and `document.modelContext.registerTool/getTools/executeTool`; list each absent method/API. Remove demo selector and fallback actions completely.

Implement explicit checking, unsupported, unavailable, consent, downloading, ready-to-continue, storage/tool-error, and ready states. Use matching text/English capability options for availability/create. Invoke create immediately from the Continue/Download click, with initial system prompts, signal, and monitored progress. Consent is required for downloadable/downloading; available still gets Continue for user activation. Not now/Cancel leaves the workspace blocked. Explain that browser-managed downloads may continue after cancellation.

Open/upgrade storage, load committed state, and register all own tools after session creation. Reveal workspace only when all succeed. Keep startup generation/abort state so a late async result from a cancelled/retried attempt cannot reveal the workspace or overwrite a newer session. Destroy discarded sessions; unregister partial tool registrations through a registration AbortController. Retry must not produce duplicate tool registrations or keep orphan model sessions. A failure must identify model, storage, or tool registration accurately.

Exit: absent either API never reveals forms; no runtime URL flag, preference, or mock switch can bypass this. Test consent decline/cancel, progress/failure, retry, unavailable, failed storage, partial registration, and late-resolving cancelled setup.

### 3. List workspace and hierarchy

Implement virtual groups and real nested items from committed data. Inbox is `parentId: null`; type groups select top-level containers and descendants; All items is global; Someday/Maybe filters context. Separate expand/collapse controls from selection with named native buttons and semantic nested lists. Remember expanded IDs and selection safely; a deleted/stale selection falls back to Inbox.

A container type or any item with children opens its child list; a leaf Task opens details. Containers have Edit details. Add list search/status/context filters and empty-state creation. New item defaults to selected real container, otherwise Inbox. Implement explicit Save, visible unsaved state, validation next to fields, and Save/Discard/Cancel before navigation, including tool-driven `show_view`. Failed saves leave draft and selection intact. A filtered list must not silently hide creation success; show a saved message or select the new item.

Complete/reopen uses the ordinary shared update path. Parent selection excludes self/descendants and supports Inbox. Manual delete requires an exact subtree dialog; Cancel is read-only. Save/delete refresh tree, selected list/detail, counts, and parent options from committed data. Ask before reset/clear chat; neither may alter task/review data.

Apply the design's compact dark tokens and system font fallback. Use mobile navigation/content/assistant buttons that preserve DOM draft/chat state. Tools and approval controls remain usable at 320px. Restore focus after closing a dialog; keep 44px touch controls and live save/error announcements. Respect reduced motion.

Exit: browser create Project → Task → child, Shopping List → item; edit all attributes; select/filter tree and list; reparent/unlink; reload; reject cycles/blank titles; cancel/delete with correct count; exercise keyboard navigation, dirty navigation, 320px layout and theme persistence.

### 4. Native tools, validation, and app-owned approvals

Register ten tool names from the design: list_items, read_item, create_item, update_item, delete_item, list_attributes, read_attribute, update_attribute, set_parent, show_view. Schemas must explicitly reject additional properties. No arbitrary DOM selector, remote URL, calendar access, approval boolean, or unrestricted patch. Read attribute accepts only documented item attributes; update attribute accepts editable fields only. `show_view` accepts a known virtual view or an existing item ID, plus known filters.

Use a common result shape internally and return it as a JSON string from native callbacks if needed for the text-oriented bridge:

```js
{ ok: true, data: committedResult }
{ ok: false, error: { code: 'invalid|denied|cancelled|stale|storage|unavailable|busy', message } }
```

Structured denial/cancellation is a tool result, not a success or an automatic retry. Delete returns deleted IDs/count; list returns summaries/total/truncated with bounded limit 1–100. Read returns the committed item and immediate child IDs. Tool output may contain hostile user text, so delimit it in model context and mark appropriate untrusted-content hints.

Validate again in every callback, including external native calls. First-use card offers Allow once/Allow for this chat/Deny, showing exact arguments. A chat grant covers ordinary tools; deletion always needs its separate exact subtree confirmation. Manual form edits do not need tool permission. Keep at most one pending approval; reject concurrent calls as busy rather than replacing the visible card. Revoke/reset cancels unresolved cards and removes grants.

Create approval snapshots of targets/current versions; re-read after approval. Delete snapshot covers root and all descendants; if membership/version changed, stop and ask again. Before each transaction, check caller abort and app turn generation. In-flight transaction abort prevents commit where possible; a committed operation must still be shown as committed if cancellation arrives afterward. Callback cancellation must work both for app turns and externally supplied native signals.

Exit: discovered tools match registrations; an external callback call receives the same app permission; malformed/unknown arguments, denial, concurrent approvals, stale approval, cancellation, cycles, and injected storage failures cannot mutate. Revoke never retroactively claims committed writes were undone.

### 5. Real Prompt API bridge and bounded chat

Use one local session, a bounded transcript/context, and a JSON `responseConstraint` envelope `{ message: string, tool: null | { name, arguments } }`. Include only exact own registered tool schemas, current view and weekly-review step, and relevant bounded local data. Keep tool results as delimited data. Validate parsed envelope and tool-specific input before native execution. Unknown/malformed output exits visibly without effects. Empty/unexpected response is a failure; never synthesize completion text.

Discover with getTools and resolve by allowlisted name, own origin and descriptor window equal to this window. Execute the descriptor with the arguments object and optional signal; rediscover before each call. An absent registered tool is unavailable, not a cue to invoke a local callback directly. Show requested/approval/running/succeeded/failed/denied/cancelled activity and expandable real output. Feed structured tool output back for the next constrained response. Cap each user turn at six tool executions, preserving a visible continuation choice; stop repeated invalid output and avoid retrying uncertain writes.

One turn at a time; Enter sends, Shift+Enter inserts newline. Stop aborts prompt/execution/pending permission and protects against late continuations. Session recreation/reset destroys the old session, revokes grants and never replays old calls. Keep user text on inference failure; retry is explicit and cannot repeat an already committed mutation. Persist chat as historical text, with no approval/action replay on load. Save-status failures are reported honestly.

Exit: deterministic mock model proposes a create through native-double discovery/execution, receives committed result, and replies. Inspect actual call arguments and DOM transcript. Cover unknown proposal, malformed JSON, native execution failure, late completion after Stop, denied write, every-delete permission, six-call cap, and model failure without “completed” wording.

### 6. Weekly review and diagnostics

Use the eleven step definitions in app-design.md, with phase, ID, title, view/filter, and concise model instruction. Explicit Start/Resume selects the step view and starts the normal real chat path. Back, Complete step, Skip and Pause update persisted review progress; only user clicks advance completion. Reload restores progress without replaying prompt/tool actions. Calendar steps ask users to consult their own calendar and state that no calendar connection exists. Show completed/skipped steps and time at finish; new review resets that review record only.

Tools diagnostics list currently discovered own tools and real annotations/schema/activity. Include native interface identity, model availability/session, storage state, offline/service-worker/install status, Revoke permission and Reset chat. Do not show a static pretend registration list before startup succeeds.

Exit: walk all eleven steps and confirm initial filters; pause/reload/resume keeps progress and does not mutate/re-prompt; calendar limitation is visible; view and chat step context stay in sync; review reset leaves lists intact.

### 7. PWA shell, documentation, and release review

Give the new shell a versioned cache with existing app prefix. Activation removes only older versions of that prefix and retains unrelated caches. Cache a fixed set of local shell/module/icon assets. Intercept only GET requests within same origin and service-worker scope; avoid external/model downloads and runtime data. Never cache non-ok responses. Fetch navigation with cached index fallback; a failed JavaScript/image response must not receive HTML. Verify the behavior under a subpath as well as root localhost. Account for the old v1 service worker during review by allowing replacement/activation and reloading, rather than mistaking stale old UI for new behavior.

Update manifest name/colors/icons consistently; verify every referenced icon actually exists. Install button appears only when beforeinstallprompt is available. Service-worker failure can be diagnostic while a ready workspace remains usable online; it must not masquerade as guaranteed offline readiness. README explains that HTTPS/localhost and compatible native experimental APIs/model are required, lists official setup links, and points to docs/check commands.

Exit: shell assets all return correct types, unrelated cache survives activation, cached offline navigation works, missing assets remain failed assets, no runtime dependency on tests or third-party resources, no build/runtime server dependency is introduced.

## Current native API contract

Verify evolving APIs against official sources before implementation. The checked documents on 2026-10-11 show registration callbacks named `execute`; native annotations include readOnlyHint, untrustedContentHint and consequentialHint. Discovered descriptors include origin/window; executeTool receives the descriptor and object arguments, with an optional signal. Use registration abort for cleanup and callback abort for cancellation. [Chrome imperative WebMCP API](https://developer.chrome.com/docs/ai/webmcp/imperative-api).

Prompt availability/create use LanguageModel, user activation, initialPrompts, download monitoring, signal and constrained session.prompt output. Use supported text/English options consistently and omit sampling parameters and experimental native tool-use options. [Chrome Prompt API](https://developer.chrome.com/docs/ai/prompt-api).

If the installed browser lacks this shape, keep the startup block. Do not alias guessed legacy APIs, use navigator.modelContext without checking current documentation, or claim compatibility from a mock.

## Verification harness and review evidence

The user requires trying the app. A separate reviewer must interact with it in an actual browser, not only read source or execute assertions.

1. Run a no-dependency Node self-check against shared production logic. Use `node tests/self-check.mjs`; if `.js` modules lack a package type, import the pure module source through a data URL in that test instead of adding package/build config. Cases should target integrity and effect semantics rather than repeat implementation line by line: forbidden field, invalid enum, nonexistent/self/descendant parent, move preserves descendants, null versus omitted parent, subtree delete, model-envelope allowlist and step IDs/count.
2. Open `http://127.0.0.1:8765` unmodified in installed Chrome. Record current exposed globals/methods and visible startup state; click Retry and relevant consent/Continue controls. Try an actual native prompt/tool flow if availability permits. The baseline browser currently reports the old implementation's Prompt API as unsupported; the new gate must determine the actual current interfaces. No success claim is justified solely by that old status.
3. Use a separate fresh Playwright browser context for deterministic coverage. Test runner injects LanguageModel and document.modelContext doubles via addInitScript before app loading, with window/origin descriptors, registered callbacks, monitored progress, and scripted constrained model responses. Runtime production files contain no injectable dependency/mock switch. Fixture records calls and can simulate failures/delays/cancellation. Test browser-double discovery/execution across the real app callbacks and real IndexedDB, not a mocked storage-only workspace.
4. Seed a separate context's IndexedDB v1 with legacy preference/history records before reload, then run startup through the test doubles. Assert preserved old records, v2 stores, and no sample items. Simulate DB blocked/transaction failure and inspect visible results.
5. Drive the actual UI flows in phases 3–6: form creation/update, nesting, filters, persistence, approvals/denial/delete, Stop, review resume, keyboard/dialog and narrow layout. Include external WebMCP-double calls to registered callbacks to ensure permissions are callback-owned. Capture screenshots of startup and ready desktop/mobile for visual QA, but do not treat screenshots alone as functional checks.
6. Run service-worker shell/cache checks in a context that allows the worker, including unrelated sentinel cache, failed asset and offline reload. Test same app beneath a relative subpath without editing runtime paths. Keep this separate from API fixture contexts when service-worker isolation could obscure failure behavior.
7. Report exact native results separately from injected-double results in docs/review.md. Record commands, browser/URL, checks actually attempted, and any untested native integration. No fixture demonstration is evidence of a downloaded native model or native WebMCP success.

Development tooling may use the already installed Node and bundled Playwright without adding a dependency to the repository. In this environment Node is `C:\Program Files\nodejs\node.exe`; the available Playwright module root is `C:\Users\jpcon\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules`. Make the runner accept an environment-provided module path or NODE_PATH rather than embedding this user's machine path in production. The local static review server already serves the workspace at port 8765; it is development-only.

## Explicit design interpretation and limitations

- No licensed font is provided; use system sans fallback. A light theme can be retained to preserve useful existing behavior, with no additional theme machinery.
- The bridge is a constrained text orchestration loop over native WebMCP, as designed. It does not depend on a further experimental native Prompt API tool-call feature.
- Modern unsupported Chrome remains blocked even though manual list management could technically function alone; this follows the maintainer's explicit two-API startup requirement.
- Browser-only calendar review remains user-supplied. No calendar backend, second autonomous agent, demo inference, seeded user data, or unrelated infrastructure is necessary.
- The plan's small module split is an implementation choice to keep production validators directly testable. Development assertions/browser automation are optional tooling, never a runtime or build requirement.
- If native APIs/model cannot be exercised on this machine, implemented behavior may be reviewed through isolated doubles, but native end-to-end support remains unverified. State the exact restriction in the final review/release report; do not weaken the gate to conceal it.

## Final handoff and commit criteria

Implementation agent reports changed files, checks run, deviations and remaining native limitations without committing. Separate review agent compares runtime against INTENT/design/this plan, tries the browser, records evidence, and returns actionable findings; implementation fixes all substantive issues, followed by targeted rechecks. Root orchestrator independently inspects final diff, confirms correct tracked/untracked files, checks required automated/browser review evidence and error behavior, and stages only authorized runtime/tests/docs changes. Preserve uncommitted DESIGN.md. Commit to main and push origin only after review findings are resolved and the documented native/mock distinction is truthful. The user's instruction already authorizes that commit and push; no extra approval step is needed.
