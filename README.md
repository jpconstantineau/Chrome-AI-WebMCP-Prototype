# Local lists · Chrome AI + WebMCP

A static, browser-only list manager and local AI weekly-review harness. Vanilla HTML, CSS and JavaScript; no build, dependencies, accounts, backend or remote AI service. Lists, preferences, review progress and chat history live in IndexedDB in this browser.

## Run

Serve this folder over HTTPS or localhost, for example:

```sh
python -m http.server 8000
```

Open `http://localhost:8000`. Direct `file://` opening is unsupported: ES modules, service workers and these native APIs need a served secure context. The static server is development tooling only. The included GitHub Pages workflow can publish the same files under a relative subpath.

Both native interfaces are required before the editable workspace opens:

- [`LanguageModel.availability()` / `create()` (Chrome Prompt API)](https://developer.chrome.com/docs/ai/prompt-api).
- [`document.modelContext.registerTool()` / `getTools()` / `executeTool()` (experimental WebMCP)](https://developer.chrome.com/docs/ai/webmcp/imperative-api).

Follow the official setup and model/device requirements above. A recent Chrome version alone does not guarantee the experimental WebMCP interface is exposed. Missing interfaces show a blocking error with Retry. Downloadable models require an explicit approval and Chrome manages their download. Continue creates the local session even when the model is already available.

For local WebMCP testing, open `chrome://flags/#enable-webmcp-testing`, set **WebMCP for testing** to **Enabled**, then relaunch Chrome. The app accepts Chrome 154's serialized tool schemas/arguments and the newer object contract; it uses the native discovered descriptor to select the format without retrying a dispatched write.

## Use

Create Projects, Roles, Areas of Responsibility, Checklists, Shopping Lists or Tasks. Any item can have children; a container opens a child list and a leaf Task opens its labeled detail form. Save is explicit. Parent selection moves an entire subtree and prevents cycles. Delete permanently removes the exact confirmed subtree. Navigation offers Save, Discard or Cancel when a draft is dirty.

Inbox shows unfinished Tasks with no parent, in both navigation and list rows. Completing or organizing them clears that actionable view. Completed Tasks and parentless containers remain stored and accessible through All items and the type groups.

Speak naturally to the assistant, for example **add bananas to shopping list** or **completed research for new car**. It resolves existing names and relationships, asks when a target is ambiguous, and uses the page's tools to perform the requested operations. Shopping entries are Tasks beneath a Shopping List; completion updates an existing task's status.

The model selects readable schema enum choices for existing items and lists. Storage IDs stay inside the app and its native callbacks. New titles normally remain free text; explicit quoted capture titles use the exact choices described below. Newly created items become selectable on the next request. Shopping creation handles its container and entry together in one transaction.

For a mind dump, say **capture compare car insurance, book a test drive, and renew passport**. The assistant captures separate Inbox Tasks together, reuses matching unfinished Tasks, and reopens matching completed Tasks by changing only status. Say **move the insurance comparison and test drive under a new Buy new car project** to create the Project and move those Tasks atomically, or choose an existing destination. **I started comparing car insurance**, **waiting for the dealer quote**, and **that task is blocked** change the existing Task's status while preserving its other attributes. Ambiguous names ask for clarification before a batch is saved.

The assistant uses native Prompt API tool calls when `chrome://flags/#prompt-api-tool-use` is enabled and the typed interfaces are exposed. Otherwise the local model first selects an operation from its available names/descriptions, then fills only that operation's constrained argument schema. A separate reply path handles conversation and clarification, with a 600-character limit. Both paths discover this page’s sixteen native WebMCP tools: ten primitives, five item workflows and one weekly-review control. They validate proposals, execute through WebMCP and return verified results to the model. Tools & diagnostics reports the active path. See [harness research and behavior](docs/harness.md) and [natural-language review](docs/natural-language-review.md).

To preserve supplied wording exactly, use an explicit quoted list, such as **capture these exact titles: "Compare car insurance", "Book a test drive"** or **capture tasks named "Renew my passport", "Chase dealer quote"**. These literal titles become the allowed capture choices, and a shortened, missing, duplicate or invented title is rejected before tool dispatch. Ordinary freeform mind dumps still let the model extract separate commitments.

If the first native prompt rejects before any tool is dispatched, the app retries that fresh request through the existing constrained JSON bridge using the same local Chrome model and native WebMCP. It does this only before a continuation and when the request was not cancelled or aborted. A dispatched call is never automatically retried. The app stays on the bridge until reload, and Tools records `nativeProposalFailure`. If replacement model creation fails, a model-unavailable startup screen provides Retry.

Tool permissions are enforced inside callbacks for external callers too. Allow once or for this chat, revoke permission in Tools, and confirm every deletion separately. Stop cancels pending work; a previously committed change remains saved. Each user turn executes at most six tools, and repeated completed writes are stopped. Native sessions receive current parameter choices in a fresh session per user request. The JSON bridge uses cloned turns where supported; otherwise start a new chat after ten turns.

Weekly review has all eleven Get clear / Get current / Get creative steps. Start or resume from the review controls, or say **start my weekly review**. The assistant can complete or skip the current step only when you ask; each such tool action requires fresh permission even after Allow for this chat. Only one review transition can execute per user turn. After a successful item operation, send a separate message to change the review; remaining requested item operations or reads can finish in the same turn. Saved changes retain factual receipts when a later proposal is blocked or fails. UI-generated step guidance omits the review-control tool. Pause and reload preserve progress; reload pauses an active review without replaying model work. Resume returns to the saved step. Calendar review asks you to consult your own calendar; this app has no calendar connection.

Tools shows real native discovery, input schemas and capabilities. In native proposal mode, **Use JSON proposals** selects the compatibility path for this page session, keeping saved lists and history and returning to Continue. This avoids changing Chrome flags when comparing the two paths. Use the mobile Lists / Content / Assistant buttons to switch panels while preserving drafts. Theme and hierarchy selection are saved locally. Install appears when Chrome offers its native installation prompt. A previously cached PWA shell can load offline; a compatible browser and already available local model are still required.

Clearing browser site data removes local lists/history. There is no sync or automatic backup. Existing v1 preferences/history are preserved by the v2 database upgrade. Concurrent item edits reject stale writes rather than silently overwriting them. Review progress also uses an atomic comparison against the saved record for UI controls, model controls and startup pausing, so a stale tab cannot erase newer completed/skipped marks.

## Design and checks

- [App design](docs/app-design.md), [flows](docs/flows.md), [implementation plan](docs/implementation-plan.md).
- [Maintainer intent](INTENT.md), [design guidance](DESIGN.md), [agent instructions](AGENTS.md).
- [Independent review evidence](docs/review.md) records release checks and native browser limitations.

Shared production logic has a built-in Node assertion check:

```sh
node tests/self-check.mjs
node tests/harness-check.mjs
```

Development-only browser checks use an existing Playwright installation. No runtime or repository dependency is added. Set `PLAYWRIGHT_MODULE_PATH` to its module directory (or configure `NODE_PATH`), serve the app, then run:

```sh
node tests/browser-review.cjs
node tests/native-contract.cjs
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
node tests/reviewer-check.cjs
node tests/pwa-check.cjs
```

`APP_URL` defaults to `http://127.0.0.1:8765`; `BROWSER_CHANNEL` defaults to installed `chrome`. The browser runners inject isolated Prompt API/WebMCP doubles before loading production files and use real IndexedDB and DOM interactions. They write desktop/320px screenshots under `docs/review-assets`; the independent reviewer check also verifies the native startup gate without injection. The PWA runner serves these same static assets under a temporary localhost subpath solely for cache/offline verification. Doubles verify app behavior; they do not prove native model inference or native WebMCP compatibility. Review must also open the unmodified app in a real browser and report any absent native interface.

The [native Chrome retest](docs/native-review.md) records real model/tool execution, permission approval, persisted data, compatibility fixes and remaining evidence limits.

The weekly-workflow runners exercise scripted decisions, atomic batch/status operations, all eleven chat-driven steps, stale review controls, the pre-dispatch proposal fallback and staged JSON routing. The routing checks include the selected-operation grammar, approval, invalid proposals, Stop between stages and failure after a committed write without replay. [Weekly-review evidence](docs/weekly-review.md) separately records a full eleven-step walkthrough with the real Chrome local model and native WebMCP through the JSON bridge. It required clarifications and rejected incorrect proposals; experimental typed native tool-call generation still failed before dispatch with array and numbered scalar capture attempts.
