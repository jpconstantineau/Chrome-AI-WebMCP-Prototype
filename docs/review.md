# Independent implementation review

This initial review preceded enabling Chrome's WebMCP testing flag. See the subsequent [native Chrome retest](native-review.md) for real model/tool execution, compatibility fixes and its current verification status.

Reviewed on 2026-10-11 against the existing code, AGENTS.md, INTENT.md, DESIGN.md, the repository ponytail skill, and the design/flows/implementation plan in this folder. The review agent read the production modules and test fixtures, reran the existing checks, and independently drove browser UI interactions using installed Chrome. The root agent also opened the unmodified app in connected Chrome.

## Release verdict

Ready to commit the reviewed implementation: both actionable mobile layout findings are fixed and independently rechecked, and no substantive review finding remains open. All four commands below passed; the browser suites were rerun after the final CSS repairs and the screenshot assets regenerated. Native Prompt API + WebMCP end-to-end execution remains unverified because the installed browser does not expose WebMCP. This is a disclosed environment limitation; the implementation correctly blocks the workspace instead of substituting a fallback.

## Native browser evidence

The unmodified production app was tried at `http://127.0.0.1:8765` in Chrome 154.0.8037.98. Independent fresh-browser inspection reported:

| Check | Actual result |
| --- | --- |
| Secure context | `true` |
| `LanguageModel` | `function` |
| `document.modelContext` | `undefined` |
| `navigator.modelContext` | `undefined` |
| Visible state | Blocking missing-WebMCP screen naming the three required methods |
| Retry | Rechecks and keeps the editable workspace hidden |

No native model download, native prompt inference, or native WebMCP execution is claimed. The strict startup check exits before preparing the model when WebMCP is absent. The root agent saw the same gate in connected Chrome and inspected its screenshot. [Independent native startup screenshot](review-assets/reviewer-native-gate.png).

## Checks actually run

All tooling is development-only. The app remains vanilla static HTML/CSS/JavaScript with no build or runtime dependency. The existing bundled Playwright module was supplied through `PLAYWRIGHT_MODULE_PATH`. Browser runs required approved execution outside the shell sandbox because it denied localhost network access; every test target was a loopback-only static server.

```sh
node tests/self-check.mjs
node tests/browser-review.cjs
node tests/pwa-check.cjs
node tests/reviewer-check.cjs
```

- Shared production logic: input boundaries, item enums/text, ancestry/cycle prevention, parent moves, descendant deletion, Inbox/all distinctions, filters, model-envelope allowlist, and all eleven review definitions passed.
- Existing browser suite: startup absence/unavailability, consent decline, cancelled delayed preparation, retry, model/partial-registration failure, real v1-to-v2 IndexedDB migration preserving preferences/history, empty first workspace, nested Project/Task and Shopping List, form validation/drafts, permission denial/grants, cancelled/stale subtree deletion, native-double discovery/execution, malformed proposals, inference/bridge failures, Stop, six-call limit, concurrent callbacks, revocation, aborted transactions, committed-write response loss, refresh/preference failure after commit, failed chat reset, all eleven review steps, calendar messaging, pause/reload/resume without replay, filtering, and narrow panels passed.
- Real service-worker suite: shell caching beneath a relative subpath, module/icon MIME types, scope, old application-cache cleanup, unrelated-cache preservation, offline navigation, and missing-asset behavior passed. These checks do not use native API doubles for worker behavior. Replacing the original v1 worker may require activation and another reload; the root agent observed this during its connected-browser attempt.
- Independent browser scenarios: unmodified native gate and Retry; blocked v1 database upgrade and successful recovery after closing the old connection; Enter sends versus Shift+Enter newline; HTML-like chat input remains text; mobile panel switching preserves conversation; transcript geometry and composer scrolling/keyboard sending; externally supplied callback abort cancels permission without mutation; concurrent target/parent edits invalidate approvals; read/edit attribute boundaries; keyboard complete/reopen; dirty navigation Cancel/Discard; stale manual form save keeps its draft. These use isolated native API doubles with production callbacks, real DOM and real IndexedDB. No runtime test switch or fallback was introduced.

## Findings and resolutions

1. **P2: Assistant message inherited the sidebar's mobile layout.** `appendMessage` emits a `message assistant` class; the original `.assistant` selector also styled that message as a sidebar and gave a short reply `min-height:60vh`. At 320 × 780 it became 468px tall, leaving a blank transcript region when scrolled to the bottom. Qualifying sidebar CSS as `aside.assistant` fixes the collision. Independent regression now measures the short reply as 66px high and shows readable text. [Rechecked mobile transcript](review-assets/reviewer-mobile-chat.png).
2. **P2: A valid unbroken 200-character title expanded item details beyond the mobile viewport.** Independently reproduced through the New item / Save item UI, using the actual title bound. Wrapping headings, the saved-status footer, and dialog text, plus constraining view-header/detail children, resolves the overflow. The independent assertion now confirms `document.documentElement.scrollWidth <= innerWidth` after the saved item detail is rendered. The implementation agent also checked long-title Project headers, list rows, hierarchy and manual delete dialogs at 320px; all stayed within the viewport.

The reviewer did not alter production JavaScript, root guidance, or the maintainer's pre-existing DESIGN.md edit. Runtime fixes were coordinated with the implementation agent. No observed integrity, approval, cancellation, persistence, layout, or service-worker finding remains open. [Final desktop workspace](review-assets/workspace-desktop.png) and [final mobile assistant](review-assets/assistant-mobile.png) were regenerated after both repairs and visually inspected.

## Evidence limits

Browser doubles verify the application-owned bridge and approval behavior; they cannot certify compatibility with an experimental native WebMCP implementation or a downloaded native model. PWA shell/offline navigation were exercised, while native install-prompt acceptance was not available in the headless check. Weekly review deliberately relies on the user's own calendar; it has no calendar integration. No hosted deployment or cross-device synchronization was required or attempted.
