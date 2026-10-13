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

Speak naturally to the assistant, for example **add bananas to shopping list** or **completed research for new car**. The page's tools resolve existing names and relationships and return questions for ambiguous targets. Shopping entries are Tasks beneath a Shopping List; completion updates an existing task's status. The local model can still choose the wrong operation or fail to ask for clarification. Inspect the proposed effect before allowing it; the [real Chrome trial](docs/harness-v2-trial.md) records successful operations and rejected mistakes.

The model selects readable schema enum choices for existing items and lists. Storage IDs stay inside the app and its native callbacks. New titles normally remain free text; explicit quoted capture titles use the exact choices described below. Newly created items become selectable on the next request. Shopping creation handles its container and entry together in one transaction.

For a mind dump, say **capture compare car insurance, book a test drive, and renew passport**. The assistant captures separate Inbox Tasks together, reuses matching unfinished Tasks, and reopens matching completed Tasks by changing only status. Say **move the insurance comparison and test drive under a new Buy new car project** to create the Project and move those Tasks atomically, or choose an existing destination. **I started comparing car insurance**, **waiting for the dealer quote**, and **that task is blocked** change the existing Task's status while preserving its other attributes. Ambiguous names ask for clarification before a batch is saved.

For a strict new-Project choice, say **move Book a test drive under a new Project named "Choose a new car"**. The unambiguous supplied name becomes the required new destination, excluding existing destinations. Explicitly named known Tasks also narrow the title choices for capture-independent move/completion/status workflows. Broad task scopes remain available. These schema guards reduce wrong proposals; inspect the permission card because local-model routing can still make mistakes.

The assistant starts with the constrained JSON bridge. Recognized requests provide a finite operation plan; the local model fills each operation's narrowed argument schema and receives its verified result. Unrecognized actionable wording uses bounded model routing, while explicit clarification can be answered directly without inference or tools. Both transports execute through the page's native WebMCP interface. Standard mode exposes thirteen model operations; Full mode exposes all seventeen for experiments. All seventeen remain registered with WebMCP. Tools & diagnostics reports the active path and offers a Chromium-compatible schema profile or a profile retaining parameter descriptions. See [harness behavior](docs/harness.md) and [natural-language review](docs/natural-language-review.md).

Native Prompt API proposals require exposed typed interfaces and an explicit **Test native tool calls** canary. The canary requests one read-only tool and requires **Allow once**, independently of chat grants. Only a successful test enables **Use native proposals**. The experimental `chrome://flags/#prompt-api-tool-use` flag alone does not establish support or stability; see the [flag research](docs/research/chrome-prompt-api-tool-use.md).

To preserve supplied wording exactly, use an explicit quoted list, such as **capture these exact titles: "Compare car insurance", "Book a test drive"** or **capture tasks named "Renew my passport", "Chase dealer quote"**. These literal titles become the allowed capture choices, and a shortened, missing, duplicate or invented title is rejected before tool dispatch. Ordinary freeform mind dumps still let the model extract separate commitments.

If native session creation or the first native prompt fails before any tool is dispatched, the app can retry that fresh request through the constrained JSON bridge using Chrome's local Prompt API and native WebMCP. It does this only before a continuation and when the request was not cancelled or aborted. A dispatched call is never automatically retried. Tools records the native failure. If replacement model creation fails, a model-unavailable startup screen provides Retry. Chrome feature configuration may select different model weights; the app cannot promise identical weights across modes.

Tool permissions are enforced inside callbacks for external callers too. **Always allow tool_name** remembers that specific tool in this browser; other tools still ask unless you separately chose the existing chat-wide grant. Tools offers individual and combined revocation of remembered permissions. Saved permission is checked at callback entry and before an operation using it; New chat and reload retain per-tool choices. Allow once and the chat-wide grant remain available. Every deletion still needs separate confirmation. Stop cancels pending work; committed changes remain saved and retain factual receipts even if rendering or the tool response fails. A run permits at most 24 inference stages, 18 dispatch attempts and 180 seconds of active work. Permission, question and draft waits pause that clock. Each segment permits six dispatches; **Continue turn** resumes the same budget, aliases and receipts. Completed writes are never automatically replayed.

One inference runs at a time. Each disposable worker receives bounded context with the current request, unresolved question, results and receipts preserved. Where Chrome provides usage measurements, input plus current session usage must fit within 75% of the context window; unknown usage is reported as unknown. Whole historical turns and optional workspace facts are trimmed first, followed by remeasurement. Protected context that cannot fit ends the run safely.

Use **Ask reviewer** in Inbox or a Project, or explicitly request its review in chat, to obtain advice from a fresh tool-free local session. Its typed report is checked against the captured scope and workspace revision. It cannot edit items, delegate further or inherit permissions. Applying advice requires a new instruction from you.

The harness plans the current request before inference, narrows each operation's target and value choices, and ends after the requested effects are fulfilled. **add Home Maintenance to Areas of Responsibilities** creates an Area container; **add repair shower to home maintenance** creates a Task under that existing named container. Missing or ambiguous containers ask for clarification. Historical turns cannot add work. Explicit clarification and no-tools requests produce grounded questions without dispatching tools. An undecided Project move can continue by clicking a Project button or typing **Use Home improvements**, followed by ordinary permission; Stop, New chat and reload discard that pending authority. Ambiguous or contradictory changes require clarification.

The model can use **ask_user** to display 2–8 answer buttons plus a text box for a different answer. The selected or typed answer returns to the model; Cancel, Escape and Stop end the question. An answer is separate from tool approval and cannot expand a planned mutation. Native proposals can insert a question before a remaining declared action; the bridge supports explicit question turns and conversational routing, while recognized write turns go directly to their narrowed argument schema. A completed turn cannot discover extra work.

For context edits, say **Set the context of Sketch a reading nook layout to "@Someday/Maybe"**. The model receives a context-only patch and the exact supplied value as an enum choice. Quoted values preserve spaces, case, punctuation and the `@` marker; **clear the context of Sketch a reading nook layout** saves an empty string. The permission preview shows the old and new context. These assignments are separate from substring view filters.

Weekly review has all eleven Get clear / Get current / Get creative steps. Start or resume from the review controls, or say **start my weekly review**. The assistant can complete or skip the current step only when you ask; those actions require fresh permission unless you remembered permission for weekly_review (a chat-wide grant alone does not bypass it). Only one review transition can execute per user turn. After a successful item operation, send a separate message to change the review; remaining requested item operations or reads can finish in the same turn. Saved changes retain factual receipts when a later proposal is blocked or fails. UI-generated step guidance displays the current step's instruction and question without model inference or tools. Pause and reload preserve progress; reload pauses an active review without replaying model work. Resume returns to the saved step. Calendar review asks you to consult your own calendar; this app has no calendar connection.

Tools shows native discovery, schemas, session capabilities, usage, bounded run events and optional local diagnostic export. **Back to workspace**, or pressing Tools again, restores the previous view and filters. Desktop navigation uses 12.5% of the viewport and the assistant uses 15%; mobile retains the panel tabs. All items follows Inbox and Checklists is last. The composer regains focus after a chat turn. Build notes are manually supplied because Chrome does not expose every relevant configuration detail. Startup includes Chrome setup instructions and opens them when a required API is missing. IndexedDB opens existing data on reload and creates/upgrades stores only on a version change. A page still needs its own model session and tool registration. Download progress reaching 100% still shows preparation until session creation succeeds. In native proposal mode, **Use JSON proposals** returns to the compatibility path for this page session. Use the mobile Lists / Content / Assistant buttons to switch panels while preserving drafts. Theme and hierarchy selection are saved locally. Install appears when Chrome offers its native installation prompt. The cached shell includes both agent modules and can load offline; a compatible browser and an available local model are still required. Shell updates revalidate network assets to avoid retaining old code in a new cache.

Clearing browser site data removes local lists/history. There is no sync or automatic backup. Existing v1 preferences/history are preserved by the v2 database upgrade. Concurrent item edits reject stale writes rather than silently overwriting them. Review progress also uses an atomic comparison against the saved record for UI controls, model controls and startup pausing, so a stale tab cannot erase newer completed/skipped marks.

## Design and checks

- [App design](docs/app-design.md), [flows](docs/flows.md), [implementation plan](docs/implementation-plan.md).
- [Harness v2 design](docs/harness-design-v2.md), [committed implementation plan](docs/harness-implementation-plan-v2.md), and [Chrome/Pi research](docs/research/README.md).
- [Harness v2 implementation checks](docs/harness-v2-implementation.md) and [real Chrome trial](docs/harness-v2-trial.md).
- [Routing fix plan](docs/routing-fix-plan.md) and [real Chrome routing retest](docs/routing-fix-trial.md).
- [Routing implementation checks](docs/routing-fix-implementation.md) record current-request scope and clarification regressions.
- [Usability and conversation improvements](docs/usability-improvements.md) document layout, permissions, questions and the real Chrome follow-up.
- [Maintainer intent](INTENT.md), [design guidance](DESIGN.md), [agent instructions](AGENTS.md).
- [Independent review evidence](docs/review.md) records release checks and native browser limitations.

Shared production logic has a built-in Node assertion check:

```sh
node tests/self-check.mjs
node tests/harness-check.mjs
node tests/agent-host-check.mjs
node tests/agent-context-check.mjs
node tests/request-policy-check.mjs
node tests/conversation-domain-check.mjs
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
node tests/harness-v2-lifecycle.cjs
node tests/harness-v2-context.cjs
node tests/harness-v2-reviewer.cjs
node tests/harness-v2-focus.cjs
node tests/harness-v2-guidance.cjs
node tests/routing-fix-browser.cjs
node tests/routing-mind-dump.cjs
node tests/routing-restatements.cjs
node tests/usability-check.cjs
```

`APP_URL` defaults to `http://127.0.0.1:8765`; `BROWSER_CHANNEL` defaults to installed `chrome`. The browser runners inject isolated Prompt API/WebMCP doubles before loading production files and use real IndexedDB and DOM interactions. They write desktop/320px screenshots under `docs/review-assets`; the independent reviewer check also verifies the native startup gate without injection. The PWA runner serves these same static assets under a temporary localhost subpath solely for cache/offline verification. Doubles verify app behavior; they do not prove native model inference or native WebMCP compatibility. Review must also open the unmodified app in a real browser and report any absent native interface.

The [native Chrome retest](docs/native-review.md) records real model/tool execution, permission approval, persisted data, compatibility fixes and remaining evidence limits.

The weekly-workflow runners exercise scripted decisions, atomic batch/status operations, all eleven chat-driven steps, stale review controls, the pre-dispatch proposal fallback and staged JSON routing. The routing checks include the selected-operation grammar, approval, invalid proposals, Stop between stages and failure after a committed write without replay. [Weekly-review evidence](docs/weekly-review.md) separately records a full eleven-step walkthrough with the real Chrome local model and native WebMCP through the JSON bridge. It required clarifications and rejected incorrect proposals; experimental typed native tool-call generation still failed before dispatch with array and numbered scalar capture attempts.
