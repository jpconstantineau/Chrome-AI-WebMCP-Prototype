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

Follow the official setup and model/device requirements above. A recent Chrome version alone does not guarantee the experimental WebMCP interface is exposed. Missing interfaces show a blocking error with Retry; there is no demo or fallback runtime. Downloadable models require an explicit approval and Chrome manages their download. Continue creates the local session even when the model is already available.

For local WebMCP testing, open `chrome://flags/#enable-webmcp-testing`, set **WebMCP for testing** to **Enabled**, then relaunch Chrome. The app accepts Chrome 154's serialized tool schemas/arguments and the newer object contract; it uses the native discovered descriptor to select the format without retrying a dispatched write.

## Use

Create Projects, Roles, Areas of Responsibility, Checklists, Shopping Lists or Tasks. Any item can have children; a container opens a child list and a leaf Task opens its labeled detail form. Save is explicit. Parent selection moves an entire subtree and prevents cycles. Delete permanently removes the exact confirmed subtree. Navigation offers Save, Discard or Cancel when a draft is dirty.

Speak naturally to the assistant, for example **add bananas to shopping list** or **completed research for new car**. It resolves existing names and relationships, asks when a target is ambiguous, and uses the page's tools to perform the requested operations. Shopping entries are Tasks beneath a Shopping List; completion updates an existing task's status.

The model selects readable schema enum choices for existing items and lists. Storage IDs stay inside the app and its native callbacks. New titles remain free text; newly created items become selectable on the next request. Shopping creation handles its container and entry together in one transaction.

The assistant uses native Prompt API tool calls when `chrome://flags/#prompt-api-tool-use` is enabled and the typed interfaces are exposed. Otherwise it uses a constrained JSON proposal with each tool's actual argument schema. Both paths discover this page’s twelve native WebMCP tools, validate proposals, execute through WebMCP and return verified results to the model. Tools & diagnostics reports the active path. See [harness research and behavior](docs/harness.md) and [natural-language review](docs/natural-language-review.md).

Tool permissions are enforced inside callbacks for external callers too. Allow once or for this chat, revoke permission in Tools, and confirm every deletion separately. Stop cancels pending work; a previously committed change remains saved. Each user turn executes at most six tools, and repeated completed writes are stopped. Native sessions receive current parameter choices in a fresh session per user request. The JSON bridge uses cloned turns where supported; otherwise start a new chat after ten turns.

Weekly review has all eleven Get clear / Get current / Get creative steps. The user marks each step complete or skipped. Pause and reload preserve progress without replaying AI actions. Calendar review asks you to consult your own calendar; this app has no calendar connection.

Tools shows real native discovery, input schemas and capabilities. Use the mobile Lists / Content / Assistant buttons to switch panels while preserving drafts. Theme and hierarchy selection are saved locally. Install appears when Chrome offers its native installation prompt. A previously cached PWA shell can load offline; a compatible browser and already available local model are still required.

Clearing browser site data removes local lists/history. There is no sync or automatic backup. Existing v1 preferences/history are preserved by the v2 database upgrade. Concurrent item edits reject stale writes rather than silently overwriting them.

## Design and checks

- [App design](docs/app-design.md), [flows](docs/flows.md), [implementation plan](docs/implementation-plan.md).
- [Maintainer intent](intent.md), [design guidance](DESIGN.md), [agent instructions](agents.md).
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
node tests/catalog-continuation.cjs
node tests/reviewer-check.cjs
node tests/pwa-check.cjs
```

`APP_URL` defaults to `http://127.0.0.1:8765`; `BROWSER_CHANNEL` defaults to installed `chrome`. The browser runners inject isolated Prompt API/WebMCP doubles before loading production files and use real IndexedDB and DOM interactions. They write desktop/320px screenshots under `docs/review-assets`; the independent reviewer check also verifies the native startup gate without injection. The PWA runner serves these same static assets under a temporary localhost subpath solely for cache/offline verification. Doubles verify app behavior; they do not prove native model inference or native WebMCP compatibility. Review must also open the unmodified app in a real browser and report any absent native interface.

The [native Chrome retest](docs/native-review.md) records real model/tool execution, permission approval, persisted data, compatibility fixes and remaining evidence limits.
