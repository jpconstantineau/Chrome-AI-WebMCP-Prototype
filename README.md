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

The local assistant discovers this page’s ten registered native tools, asks the model for a constrained proposal, validates it, executes through WebMCP and supplies the actual tool result for the next response. This is an application-owned bridge over the two native APIs. Tool permissions are enforced inside callbacks for external callers too. Allow once or for this chat, revoke permission in Tools, and confirm every deletion separately. Stop cancels pending work; a previously committed change remains saved. Each user turn executes at most six tools. Chat session context is bounded through cloned turns where supported; otherwise start a new chat after ten turns.

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
```

Development-only browser checks use an existing Playwright installation. No runtime or repository dependency is added. Set `PLAYWRIGHT_MODULE_PATH` to its module directory (or configure `NODE_PATH`), serve the app, then run:

```sh
node tests/browser-review.cjs
node tests/native-contract.cjs
node tests/reviewer-check.cjs
node tests/pwa-check.cjs
```

`APP_URL` defaults to `http://127.0.0.1:8765`; `BROWSER_CHANNEL` defaults to installed `chrome`. The browser runners inject isolated Prompt API/WebMCP doubles before loading production files and use real IndexedDB and DOM interactions. They write desktop/320px screenshots under `docs/review-assets`; the independent reviewer check also verifies the native startup gate without injection. The PWA runner serves these same static assets under a temporary localhost subpath solely for cache/offline verification. Doubles verify app behavior; they do not prove native model inference or native WebMCP compatibility. Review must also open the unmodified app in a real browser and report any absent native interface.

The [native Chrome retest](docs/native-review.md) records real model/tool execution, permission approval, persisted data, compatibility fixes and remaining evidence limits.
