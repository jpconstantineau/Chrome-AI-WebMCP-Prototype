# Thirteen-item follow-up audit

Audited on October 12, 2026 against the maintainer's repeated checklist, INTENT.md, DESIGN.md, the current source and actual Chrome. Before changes, GitHub Pages served the same runtime source as local main after normalizing line endings; its deployment had succeeded. The gaps were functional, rather than an old deployed release.

| # | Request | Verified result / correction |
| --- | --- | --- |
| 1 | Desktop navigation 12.5% | Already implemented. Measured at 851, 1024, 1280 and 1920px; mobile panel tabs remain at 850px and below. |
| 2 | Desktop assistant 15% | Already implemented. Additional wrapping now keeps permission and review buttons inside the narrow pane. Real Chrome measured 257.25px navigation and 308.6875px assistant against a 2058px grid. |
| 3 | Add Home Maintenance to Areas of Responsibilities | Already routed to create_item with the exact title, Area of Responsibility, Open and null parent. Retested successfully with the real local model and native WebMCP callback. Also corrected analogous Projects, Roles, Checklists and Areas group requests; quoted existing container names take precedence over group aliases. |
| 4 | Add repair shower to home maintenance | Retested successfully: exact Task title under the existing Home Maintenance Area, with no Inbox or shopping fallback. Case-insensitive destination matching preserves the actual saved title. Missing/duplicate/stale destinations still require clarification. |
| 5 | Softer palette in design/CSS | Both tracked design document spellings already contain #1456f0, #1d4ed8 and #3daeff. CSS uses the supplied primary, active and dark accent values. Light focus retains its contrast adjustment. |
| 6 | Return from Tools | Back to workspace and toggling Tools already restore the prior screen, selection and filters. Verified in automated UI and actual Chrome. |
| 7 | All items after Inbox | Already implemented and verified against the rendered navigation. |
| 8 | Checklists last | Already implemented and verified against the rendered navigation. |
| 9 | Remember individual tool approval | Always allow already saved per-tool choices. Fixed the legacy temporary chat grant to cover only that tool, so a different tool asks independently. Preference writes now preserve saved grants atomically; a stale theme/navigation save cannot resurrect a revoked permission. Deletion confirmation remains separate. New chat wording now distinguishes temporary grants from remembered choices. |
| 10 | Reopen saved database | Stores were already created only in onupgradeneeded. Fixed the repeated first-visit flow: returning visits reconnect an available model automatically, then open the existing v2 database. Installed-model startup no longer shows download progress. Chrome builds requiring a gesture fall back to Continue. A downloadable/downloading model still requires approval. No version bump or data reset. |
| 11 | Setup instructions on loading page | Already present, with missing-feature/failure states expanding the guidance: WebMCP testing flag, Prompt API flags where available, hardware/model/policy troubleshooting and optional native tool-use flag. The page detects API availability, not hidden flag settings. |
| 12 | Restore chat input focus | Already restored after Enter, permission completion, answers and Stop. Verified with fixture tests and the real Chrome trial. |
| 13 | Ask-user tool with buttons/custom text | ask_user already registered with 2–8 answer choices and a custom text field. Real Chrome asked permission for this new tool despite remembered create_item, rendered the requested buttons, returned the clicked answer to the local model, and restored composer focus. Fixed Escape cancellation for host-generated clarification cards too, discarding their pending destination authority. |

## Verification

An independent agent reviewed the final application, storage, routing and CSS changes and found no remaining material regression or authority issue.

Six pure runners and all twenty-three browser runners have successful results on the updated runtime. The browser suites exercise real IndexedDB, rendering, native callback contracts and the JSON bridge with isolated model/API fixtures. The weekly-chat suite completes all eleven steps through the bridge and both native call-ID contracts, including mind dump, new projects, moves, statuses, pause, automatic reopening and resume. Workflow tests now explicitly approve newly used tools through the UI instead of relying on a blanket chat grant. Dedicated permission tests still make and assert each decision directly.

New regressions cover temporary per-tool grant isolation, saved revocation followed by an unrelated theme save, host clarification Escape followed by a bare former answer, quoted containers named after sidebar groups, proportional layout and permission buttons immediately above the mobile breakpoint, and returning visits still asking before a new model download. PWA tests verify cache v9, subpath/offline operation and a normal reload across a deployment with still-fresh HTTP cache entries.

Actual Chrome used an isolated empty origin at http://127.0.0.1:8770, its installed local model, default JSON bridge and real document.modelContext registrations/executions. No model responses were injected. Chat created Home Maintenance, repair shower beneath it and Bathroom Repairs as a Project. create_item permission was remembered once; ask_user asked separately. The question contained repair shower / plan Bathroom Repairs buttons and a custom input; clicking repair shower returned the answer and the model replied repair shower. [Real question and saved parent view](review-assets/thirteen-item-question.png).

Reopening the same origin automatically connected the installed model, restored the three records, conversation, selected Area and remembered tool choices. Tools reported IndexedDB v2 opened-existing. The schema setup did not rerun and no prior tool work replayed. [Restored workspace](review-assets/thirteen-item-restored.png).

This audit verifies new routing and persistence; previously misfiled records in the maintainer's existing workspace are not silently rewritten. Existing records can be moved or corrected through their normal controls or an explicit chat request. The local model's wording remains variable; saved-effect receipts and host validation establish what actually happened.
