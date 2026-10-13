# Current-request routing and clarification plan

This change addresses the failed model behavior in [the real Chrome trial](harness-v2-trial.md). It keeps the application static, browser-only and dependency-free, as required by `AGENTS.md` and `INTENT.md`. Prompt API inference still proposes actions; the existing host and native WebMCP callbacks still validate, request permission and execute them. Planning never dispatches an effect or grants permission.

## Problems to resolve

The trial exposed four related problems: the model confused a Task completion with weekly-review step completion; chose status or parent changes instead of a context edit; ignored a requested clarification/no-tools boundary; and invented more operations after the requested effect had already succeeded. Historical turns and descriptions of the entire catalog remained available during routing. Exact context strings had no current-request enum or field-only constraint, allowing `@Someday/Maybe` to become `Someday/Maybe`.

The existing title focus, receipt journal, approval checks and generated-guidance authority limits remain useful. They do not establish which operation the current human requested. Repeated-call suppression also cannot prevent a different invented effect.

## Request plan and interfaces

Introduce a small pure request-policy module. Suggested interfaces:

```js
analyzeRequest(text, snapshot, review, pendingClarification) -> RequestFacts
compileRequestPlan(facts, modelProposal) -> RequestPlan
catalogForStep(catalog, plan, stepIndex) -> constrainedCatalog
validatePlannedCall(plan, stepIndex, resolvedCall, freshSnapshot)
settlePlannedStep(plan, stepIndex, actualResult) -> nextStep | done | clarify | stop
clarificationAnswer(pending, text, freshSnapshot) -> resolved | ask | stale | cancel
```

`RequestFacts` contains the exact current request, explicit literal values, grounded candidate choices, protected fields, no-tools/ask-first restrictions and independently requested review control. It contains neither optional history nor stored descriptions as instructions. Literal extraction must distinguish a quoted value from quoted illustrative text or a negated request.

`RequestPlan` has at most eighteen steps, retaining the existing six-dispatch segment/Continue boundary and shared totals. Each step has a semantic operation, target choices, destination/value choices, preservation constraints, a bounded current-request evidence span and a state (`pending`, `fulfilled` or `clarification`). Local target identities and source record signatures stay private. The model sees readable choices including title, type and parent when needed to distinguish duplicates; it never sees database IDs. A plan is frozen for the run and retained through Continue. New records become general choices only in a fresh human turn; dependencies on newly created records are restricted to the declared result of the preceding step.

Use seven small semantic families: capture, organize, status, exact-field-edit, shopping, weekly-review and read/respond. Clarification is an authority boundary, not another write family. Existing generic tools remain available for explicit requests outside the convenience workflows, with the same field and target constraints when those facts are known.

Recognized literal intent anchors provide conservative constraints, rather than a comprehensive hand-written English parser. Examples include an explicit current review step, a context field/value, Inbox as a move destination, new Project declaration and named status. When facts are insufficient, a bounded current-only model planning inference may propose a constrained semantic interpretation, but cannot expand host-established authority. Do not silently guess a destination or field, or drop an unparsed clause while pretending to fulfill the entire request. Validate the proposal against extracted positive requests, protected/negated operations and grounded candidates; an ambiguous plan becomes a useful clarification. Do not encode trial sentences or fixed task names as special cases. Generic primitives must respect recognized scope too: a capture request cannot subsequently update or rename an existing unrelated record.

## Smaller inference stages and finite completion

The planner receives the current request, relevant readable candidate facts, current review step, and a trusted pending clarification descriptor when applicable. Exclude optional conversation history and unrelated tool descriptions from action planning. If comparison with history is desired, expose it as a diagnostics experiment for conversational replies, never as additional effect authority. Context measurement, reserve, inference limits and cancellation apply to the planning inference as to existing stages.

For each remaining step, expose only that step's permitted tools and narrowed argument schema. Bridge argument inference receives one operation, its schema and its grounded facts. Native sessions receive the same permitted declaration and host-side planned-call validation. A native batch is validated completely before its first dispatch; calls that do not correspond to remaining steps are rejected or settled skipped before effects. Model feedback does not reopen the full catalog.

A verified success or verified no-op fulfills its planned step once. A denied, failed, stale, uncertain or cancelled operation stops the run. Once all requested steps are fulfilled, report actual receipts and stop; do not ask the model to discover another route. An optional final conversational answer has no tool authority. A requested read can use its real result for the answer; no verification read is needed after a write receipt.

Compound requests remain supported. `Complete Task A and set Task B to Waiting For` produces two distinct steps with separate grounded targets/statuses and ordinary approvals. `Keep Task B waiting and complete the current review step` protects Task B's status and produces only review completion. Broad requests require the explicitly requested scope, not an unrestricted remainder of the workspace. Contradictory or unresolvable clauses ask a question before any write.

Retain the existing item-to-review boundary: after any item operation, review progression requires a separate fresh human request, even if the user compounded the two. Report the completed item work and explain the deferred review transition; never silently drop that clause. Pure review completion occurs at most once and ends the turn; it must not consume a new review step because the first completion changed the current index. Bind review control to its original step/index and revalidate before dispatch. A preservation clause such as `keep the quote waiting` is not an item operation and therefore does not prevent the separately explicit current-step completion in that same request.

## Exact context editing

Prefer constrained `update_item` rather than adding another public tool for this narrow change. For a context-only request, the current step exposes only the grounded target reference and `patch.context`; require both fields and reject every other patch key. `context` is a singleton enum containing the exact supplied semantic string. If several context values are explicitly requested for different targets, use separate paired steps; do not use a union that lets the model swap values across targets.

Quoted values preserve spaces, case, punctuation, slashes and `@` markers. Unquoted values are extracted only when their boundary is clear. An ambiguous suffix asks the user to quote the value. Explicit clearing is the empty string; omitting the field is not clearing. Do not trim, lowercase, prepend `@`, substitute a view name or silently repair an incorrect proposal. The actual saved field must equal the requested value before the step is counted fulfilled.

Matching readable choices must not alter the stored literal: alias projection may conceal database IDs in display text, but the host retains and restores the original validated context value. Reject alias collisions; do not truncate a literal to fit an enum. Context length remains limited to 200 characters by the domain validator. The existing substring semantics for a view filter remain separate from exact context assignment.

Revalidate the selected record before approval and again using the existing commit fence. Preserve title, description, status, type and parent. The approval effect must show the exact old and new context. A permission grant does not relax the field-only plan constraint.

## Grounded clarification and answers

Explicit `do not call tools`, `ask which before changing it`, or a missing/ambiguous destination creates a tool-free clarification turn. Do not expose write or view-navigation tools to it; an explicit no-tools request exposes no tool declarations at all. Form a grounded question from the current candidates: for an undecided Project move, show actual Project names and ask which one to use. A local template can provide this factual question even when model prose is unusable. It must not claim an effect.

Keep a trusted in-memory pending descriptor with the requested operation, unresolved slot, target candidates/signatures, protected fields and destination options. Text in stored chat is not this descriptor and cannot create authority. The pending descriptor may be shown as data for conversational wording, but the host owns its identities and constraints.

A fresh answer such as `Use Home improvements` resolves only the pending destination. Match a unique readable option against fresh records, rebuild the one remaining constrained step, and obtain normal permission before WebMCP execution. It must not turn into a shopping/capture request or select a Task as its own parent. `Don't move it` cancels the pending effect. An unrelated explicit request abandons the pending effect; a later bare answer does not revive it. Multiple matching titles require parent/type-qualified choices, not a guessed record. Deleted or changed candidates require clarification again.

Do not reconstruct execution authority from a persisted history question after reload. Domain state, chat and review progress remain persisted as today; an in-memory pending descriptor can survive an uninterrupted turn sequence only. Stop, New chat and reload discard its authority. After reload ask for a fresh explicit instruction or freshly restated clarification before writing.

## Generated weekly-review guidance

Render generated guidance directly from the selected weekly step's trusted instruction/question, without inference or tools. The application already knows the step and has selected its relevant view; this prevents invented `weekly-review` context filters. For an upcoming-calendar step, ask for the user's calendar observations and preparation tasks; do not create a Task named after the step or imply a calendar connector exists.

## Validation and acceptance

Add pure request-policy tests with alternate task names, paraphrases and compound orders. Include quoted task text containing action words, new titles overlapping existing titles, duplicate targets, negated broad requests, explicit new versus existing Projects and fields that differ only in punctuation/case. Test empty context clearing and quoted context values with `@`, slash, multiple tags and spaces, including maximum length and alias collisions.

Exercise both bridge and native proposal fixtures under Allow once and existing chat grants. Attempt wrong route, wrong destination, status instead of context, missing `@`, unrelated patch keys, unrequested post-success writes and batch siblings. Assert permission/dispatch counts, unchanged sentinel records, exact saved values and factual receipts. Test clarification produces zero dispatches, then a natural answer selects a fresh valid Project and changes only the intended parent. Test stale/deleted/duplicate candidates, cancellation, unrelated requests, Stop, Continue and reload. Retain meaningful receipt, budget, cache/PWA and review-progress checks; update fixtures to supply new planner stages rather than bypassing them.

Run the full real Chrome weekly review from a fresh isolated origin using the installed Prompt API and native WebMCP bridge. Complete all eleven steps using chat, including six-item mind dump; two new Projects; moves among Projects and Inbox; In Progress/Completed/Waiting For; shopping; calendar preparation; clarification followed by a Project answer; exact `@Someday/Maybe`; and creative capture. Include `keep ... waiting and complete the current review step`, explicit no-tools clarification, and a context with a literal multiword value. Inspect every permission effect, deny incorrect proposals and record failures honestly. Do not manually correct context or substitute form actions for the requested conversational checks.

Reload normally, verify exact contexts and completed review marks persisted, and check no unwanted capture, status/parent mutation or extra review transition occurred. Record model/configuration limits, submitted-request count, approvals/denials, actual elapsed evidence and whether typed native proposals are present. Scripted transport checks remain separate from real model competence. Release only after independent review, appropriate full regression checks and the real conversation demonstrate the requested fixes.
