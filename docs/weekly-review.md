# Weekly review through natural-language chat

Verification date: 2026-10-11 (local time). The app remains static and browser-only, with no build step, backend or remote model.

## Issues found and fixes

The initial real Chrome walkthrough could not start the review from an ordinary request: the model proposed an unknown tool. A three-task mind dump failed with `kErrorUnknown` before tool dispatch. New focused WebMCP tools provide capture, atomic organization under existing or new Projects, status updates and persisted review control. Review questions and next views now come from the saved review step.

Inbox previously mixed root containers and completed Tasks with unfiled commitments. It now shows unfinished parentless Tasks consistently in navigation and rows. Other records remain in All items and their type groups; the general native parent filter is unchanged.

Review writes now compare the approved persisted snapshot inside the same IndexedDB transaction as the update. This covers model actions, manual controls and startup pause, preventing stale controls from erasing newer progress. Completing or skipping a step asks for approval even with a chat grant. One review transition runs per user message, and automatic step guidance cannot call the review control tool.

Recapturing a matching completed Inbox Task reopens it by changing status only. Capture and organization resolve every selected Task before committing the entire batch, preserving existing details and descendants.

## Automated evidence

The isolated browser runners use scripted model decisions with the production DOM, native callbacks and real IndexedDB. They establish application behavior, not local-model language understanding.

- `review-workflow-operations.cjs`: 51 assertions covering schema validation, atomic capture/project/move/status operations, duplicate and completed captures, ambiguity, rollback, cancellation, stale targets and all eleven review steps.
- `weekly-chat.cjs`: all eleven steps in the JSON bridge and both typed native call-ID spellings. Covers mind dump, new and existing Projects, status changes, Inbox clearing, explicit step approval, pause/reload/resume and final saved completion.
- `review-ui-integrity.cjs`: stale manual completion and pause cannot overwrite externally advanced progress; reload preserves marks, pauses without replay, and resumes correctly. Automatic guidance omits the review tool.
- `review-chat-boundary.cjs`: item operations cannot advance a review in the same message; native skipped calls retain their correlated responses, remaining item work can finish, and a fresh review request requires confirmation.
- `bridge-routing.cjs`, `bridge-receipts.cjs` and `native-proposal-fallback.cjs`: staged routing, selected argument grammar, truthful receipts, Stop after commit, bounded continuations and the narrow pre-dispatch compatibility retry.
- The independent reviewer also passed the normal browser review, reviewer checks and PWA cache/offline checks.

## Real Chrome observations

Chrome 154 with WebMCP testing and Prompt API tool-use flags enabled successfully started and resumed the review through natural-language chat and normal permission cards. Array-based capture still failed before dispatch, even when the model declaration was reduced to an array of plain strings. The error alone does not establish the browser's underlying cause. [Failure screenshot](review-assets/weekly-array-failure.png).

Numbered scalar parameters also failed, so that experimental adapter was removed. Chrome subsequently reported that its model process had crashed too many times, temporarily blocking new sessions. Chromium's [access controller](https://raw.githubusercontent.com/chromium/chromium/main/components/optimization_guide/core/model_execution/on_device_model_access_controller.cc) applies exponential backoff after repeated model crashes; the app cannot reset that browser state.

The harness now switches to its existing constrained JSON proposal format only if the first native inference rejects before any page tool has been dispatched. It still uses the local Chrome model and native WebMCP. Cancellation, resumed continuations and failures after dispatch cannot trigger this retry. Diagnostics reports the native failure and active format. Failure to create a replacement session shows a model-unavailable recovery gate.

Tools offers an explicit Use JSON proposals switch for testing without changing browser flags. The real JSON model initially paraphrased a mind dump without a tool and then proposed shortened titles with an invented context. Those writes were denied. The proposal schema now selects the tool before message prose, and capture instructions require meaningful titles and place/condition context only. A corrected proposal was requested before saving.

The user restarted Chrome with experimental native tool use disabled. WebMCP remained enabled and the same IndexedDB records/review survived. The earlier compact JSON path sometimes replied without an operation and an exact-title capture stalled before dispatch. The bridge consequently separates operation selection from argument generation; no incorrect proposal was saved during diagnosis.

The staged bridge correctly resumed the review. A well-formed exact-title list supplies enum choices and an exact-set check before dispatch, keeping `Compare car insurance`, `Book a test drive` and `Renew my passport` intact. All three were approved and saved through real WebMCP. The model subsequently tried the same capture again; the replay guard prevented another dispatch. Continuation prompts distinguish fulfilled work from a distinct remaining operation, and partial-success receipts retain actual saved changes even after a later inference error or Stop.

Real chat created `Buy new car`, `Travel paperwork` and `Prototype QA`, and filed the named tasks under them. Inbox reached zero. An additional mind dump captured `Chase dealer quote` with `@Work` and moved it into the existing car project. Status requests saved insurance as In Progress, test-drive booking as Completed and dealer quote as Waiting For while preserving their parents and contexts. Some first proposals needed natural-language clarification; incorrect completion/capture proposals were denied before writing.

Cross-project moves transferred the passport Task from Travel paperwork to Buy new car and back. Chrome accepted the strict exclusive organization grammar for insurance's existing-destination moves to Travel paperwork and back, preserving In Progress. The new-destination branch created Home ideas and filed `Sketch a reading nook layout` under it, retaining `@Someday/Maybe`. Review progress survived reload at the Inbox, head-emptying and calendar phases; startup paused without replay and chat resumed the saved position. Waiting For selected the real outstanding quote with its `@Work` context.

After creative capture, Stop cancelled an unrequested completion proposal while retaining the committed capture receipt and Task. Other unnecessary continuation proposals stopped at current-record validation; these do not roll back the preceding successful change. The model can still misroute or propose extra work, so a human must inspect permission cards. This was an assisted natural-language walkthrough with clarifications and denials, not evidence of reliable autonomous review completion.

After a successful organization, the model proposed advancing the review even though Inbox still contained tasks. That proposal was denied. The harness now excludes review controls after item changes until a fresh human message, including native queued calls and capped continuations. Paused review context includes the saved step and active flag, avoiding reliance on older transcript questions.

The final chat request completed the review: eleven completed steps, zero skipped, with a saved completion timestamp. The Home ideas continuation also exercised graceful repeat handling in real Chrome: it stopped a repeated organization proposal and kept the factual move receipt. Calendar review uses explicit synthetic user reports; the app has no calendar connection.

After the final reload, the finished card retained all eleven marks and the same timestamp, with no automatic tool replay. The review page showed every phase Completed. All items contained thirteen records; the expanded hierarchy and statuses matched the table below. [Persisted review steps](review-assets/weekly-review-steps.png) · [Final workspace](review-assets/weekly-review-complete.png).

## Final task state

| Captured Task | Parent | Status | Context |
| --- | --- | --- | --- |
| Compare car insurance | Buy new car | In Progress | Empty |
| Book a test drive | Buy new car | Completed | Empty |
| Renew my passport | Travel paperwork | Open | Empty |
| Chase dealer quote | Buy new car | Waiting For | @Work |
| Sketch a reading nook layout | Home ideas | Open | @Someday/Maybe |

All four newly created Projects remain Open. The pre-existing smoke-test Task is filed under Prototype QA, retaining In Progress and @Test. The pre-existing Research for new car, Shopping List and bananas records retain their earlier attributes and relationships.
