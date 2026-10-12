# pi-subagents architecture research

Research date: **2026-10-12**. Scope: read-only research for a future Chrome-local orchestrator and specialists. No package installation, implementation, browser configuration, hosted service, backend API, or build step is proposed or performed.

The reference is [nicobailon/pi-subagents](https://github.com/nicobailon/pi-subagents), pinned to **8fcc3c787a6e7d9da0f21bafb604fe937084c21b** (package version **0.77.0**). Links below use that commit, not a moving main branch. The related Pi compatibility investigation uses [earendil-works/pi at 19cb534c3b6e3871458a8fa59e98f0312c50e995](https://github.com/earendil-works/pi/tree/19cb534c3b6e3871458a8fa59e98f0312c50e995); Pi itself is a separate dependency, not browser code this prototype can import. Package peer declarations accept several Pi packages broadly, while the AI peer declares >=0.86.1; development pins use 0.87.0. [Package manifest][package]

**Central finding:** the useful pattern is a code-owned parent coordinating bounded child sessions, with explicit launch contracts, correlated events, structured results, and separate effect evidence. The current project is much more extensive than a subprocess wrapper. Local foreground native children use Pi SDK sessions inside the parent process. Native background children use SDK sessions inside a detached runner. External CLI/job adapters are additional execution backends. These distinctions matter when translating the idea to Chrome. [Entry point][entry] [Child factory][factory] [Background launch][async]

## Evidence and reading method

This document distinguishes:

- **Source behavior:** observed implementation or documented contract at the pinned commit.
- **Derived browser recommendation:** an original design inference for this repository, not an upstream guarantee or implemented feature.
- **Unverified:** runtime behavior that was not exercised in this research.

The recursive Git tree was inspected before choosing source paths. Runtime-critical source, all ten documentation topic files, selected builtin roles, and focused tests were read. Tests are evidence of intended assertions; they were **not run**, and their presence is not proof that the pinned revision passes or that Chrome supports the same behavior. The source is rapidly evolving: old top-level chain/parallel examples and an “every agent spawns a Pi CLI” mental model are misleading for this snapshot.

Local constraints were read from [AGENTS.md](../../AGENTS.md), [INTENT.md](../../INTENT.md), and [DESIGN.md](../../DESIGN.md). The implementation comparison uses [app.js](../../app.js), [harness.js](../../harness.js), and [docs/harness.md](../harness.md). This app remains static, browser-only, local-model-based, IndexedDB-backed, and usable without a build. Companion Chrome research supplies the browser API evidence: [Prompt API](chrome-prompt-api.md), [session management](chrome-session-management.md), and [compacting](chrome-session-compacting.md).

## 1. What a subagent actually is

A named agent is configuration plus instructions, not a separate intelligence or operating-system security boundary. A launch resolves that configuration into a child session with a task, context mode, model, allowed tools, extensions, output contract, limits, and ownership identity.

Builtin names describe useful jobs: scout gathers local context; researcher gathers external evidence; evidence-auditor checks research claims; worker implements; reviewer checks work; oracle advises; delegate coordinates. **Source/docs discrepancy:** the README and agent guide describe reviewer doing small fixes, but this commit's reviewer definition has a read/inspection/coordination allowlist and explicitly prohibits shell commands and repository mutation. Oracle permits bash but instructs inspection/read-only use; worker explicitly declares writer acceptance and edit/write tools. Browser roles should declare capabilities instead of assuming a role name or prose alone enforces safety. [Reviewer definition][reviewer] [Oracle definition][oracle] [Worker definition][worker]

Definitions resolve through builtin, installed package, user, and project sources. Canonical names, optional aliases/package names, disabled definitions, trust decisions, and scope determine selection. Project definitions win ordinary same-name collisions, but declining project trust excludes project-controlled discovery/settings. This is configuration precedence, not a permission to accept arbitrary instructions from task data. [Discovery and scope][agents]

Agent bodies normally replace the child base system prompt. Optional fields add project/global instructions or skills. Fresh context is narrow; fork context carries a parent branch. A clean system prompt does not by itself guarantee an empty inherited transcript. The code separately rewrites prompt sections and removes parent-only orchestration messages from child context. [Child prompt boundary][prompt-runtime]

## 2. Initialization, discovery, and delegation eligibility

The root extension returns early in a marked child process. Parent registration prepares state, tool/rendering surfaces, supervisor and result transports, lifecycle handlers, and lazy executor loading. Session start binds runtime identity, restores run/history state, starts maintenance, and installs ownership. Shutdown disposes transports and sessions. In-memory detached foreground children are stopped on runtime replacement because the next runtime cannot control them. [Extension registration][entry]

Three separate questions should not be conflated:

1. **Is delegation authorized by the human request or applicable instructions?**
2. **Is the delegation tool available to this model/session?**
3. **Is this particular launch admitted by runtime policy and budgets?**

The tool's instructions require authorization and state that complexity alone is insufficient. The loader enables tools; it does not launch a child or grant new authority. The inspected loader accepts no meaningful launch parameters and performs tool-selection checks, not semantic verification of a human authorization record. **Inference:** its natural-language authorization rule should not be mistaken for a complete provenance-based authorization system. [Tool activation implementation][activation]

Default activation is auto. A fresh compatible model starts with a small loader; other models start eagerly because a mid-conversation tool addition can miss provider prompt caching. Compatibility depends on API-specific flags plus mid-conversation system-message support. Recorded cold/warm selections survive resume/reload/tree navigation; switching models does not casually replace the session's tool selection. Incomplete host tool-selection APIs keep eager behavior. [Activation tests][activation-test]

**Derived browser recommendation:** the app should retain an application-owned delegation authorization record derived from the current human action. A specialist's response, stored item description, quoted instruction, task complexity, or previous agent request must not generate one. Decide eligibility before allocating a child. Tool availability and authorization remain distinct even if Chrome eventually supports dynamic declarations.

## 3. Public tool surface and launch normalization

The current model-facing subagent declaration has a small set of top-level fields: agent/task, workflow/args, async/model/cwd/worktree/output, and action/id/message. Additional controls enter through options and are validated against the fuller internal shape. Schema simplification reduces declaration footprint; semantic checks still reject invalid combinations. [Schemas][schemas]

A direct bounded child uses agent plus task. Multi-child execution primarily uses a workflow: a tagged script from the reply, a script path, or a named resource. The public normalizer rejects internal permit/provenance fields, private fanout fields, removed orchestration actions, top-level retained resume, and incompatible execution shapes. Legacy top-level tasks/chain are not the ordinary current interface. When workflow-scripts is disabled, a reduced structured tasks/chain surface replaces scripts. Internal legacy execution code remaining in the repository does not make those inputs public API. [Public normalization][public] [Public boundary tests][public-test]

The executor discovers agents, resolves context/acceptance/model policy, checks depth and capability ceilings, preflights spawn counts, prepares sessions/output paths, reserves admission, and creates run/control identity before execution. Some policy is rechecked after asynchronous preparation so a tightened ceiling cannot be bypassed by an earlier snapshot. [Executor admission][executor]

**Derived browser recommendation:** expose a much smaller declarative specialist request, not arbitrary JavaScript workflow text. Validate role, item scope, output schema, authorized parent turn, current generation, and budgets in ordinary application code. A model-authored field called permit must never be an authority-bearing value.

## 4. Fresh and forked sessions

The native child factory owns creation, event subscription, prompt/steer/follow-up, abort, and disposal. It uses the host SDK's resource loader and createAgentSession, selecting memory/file/directory storage. A shared model runtime can serve multiple sessions; foreground provider inheritance can require a separate runtime. Session context independence does not establish independent model hardware or higher throughput. [Native session factory][factory]

Fresh means a new child conversation with deliberately supplied task/context. Fork means a branch from a persisted parent session at a current leaf. Explicit fork fails if those prerequisites or branch extraction fail. An implicit global/agent fork preference can resolve immediately to fresh when prerequisites are absent. Each child index gets a distinct branch, cached for deterministic reuse. Fork files are nested under the parent so they do not hijack Pi's recent-session discovery. Signed Anthropic thinking blocks are sanitized before replay. [Fork resolver][fork] [Fork tests][fork-test]

An optional pruned-fork mode preserves inherited context while within a 64 KiB session budget, then requests structured summaries and stores recovery references with private sidecars. Pruning failure blocks launch rather than silently reverting to full history. Its recovery references do not constitute a general child recovery command. [Fork pruning configuration][config-fork]

**Derived browser recommendation:** use fresh sessions for distinct instructions/tools, and clone only a settled checkpoint whose inherited context is appropriate. Clone support does not confer tool permission, application IDs, persisted branch history, or the ability to run in a service worker. Destroy unused children in finally paths. Reload restores application records and reconstructs bounded context; it does not revive a native LanguageModel object. Consult the companion session research before choosing create/clone/signal options.

## 5. Tool scope, permissions, and model policy

Capabilities are resolved independently of prose. Strict tool allowlists and exclusions control selected tools; tool providers must also be loaded. Foreground children avoid ambient parent extensions, while detached background children can discover them. Listed child extensions are explicit. Missing tools/provider dependencies produce diagnostics instead of an implicit backend switch. Direct MCP support has host/version and adapter boundaries; these are Pi integration details, not equivalent to browser document.modelContext. [Child tool plan][tool-plan]

Capability ceilings intersect allowed tool/agent sets and accumulate extension denial. Nested requests cannot widen a restriction. A ceiling is session scoped and has recorded sources. An absent allowlist is different from an explicitly empty one. [Capability ceiling][ceiling]

Native permission rules use allow/ask/deny; unspecified rules allow. Agent rules overlay global rules, and explicit allow removes a rule. Bash is delegated to separate guard policy; coordination/structured-output tools are reserved exceptions. Consequently this rule layer is not “deny all writes by default.” Ask decisions are mediated through the watchdog arbiter, with cancellation and timeout failing closed. [Permission rules][permissions] [Runtime permission gate][permission-gate]

AuthorityPolicy separately governs management operations such as discard, cleanup, spawn grants, scheduling, stop, steer, and opening panes. Defaults differ by action; it does not replace tool policy or delegation eligibility. [Authority policy][authority]

Model scope is another independent control: resolved provider/model patterns may warn or reject according to enforce/strict settings and selection origin. An enforced strict scope checks inherited/configured models as well as explicit overrides. Scope constrains selection; it does not choose a cheaper model. [Model scope implementation][model-scope]

**Derived browser recommendation:** every specialist uses the prepared Chrome-local inference path, with recorded capability/options differences rather than a promise of identical underlying model weights. Use explicit read-only tool catalogs, with no external model/CLI fallback. Retain the existing central WebMCP callback as the sole mutation gate. A specialist may propose a change, but its result cannot carry a chat tool grant, approve deletion, or advance weekly-review progress.

## 6. Single, parallel, sequential, and workflow execution

A foreground single attempt builds the launch, creates a child session, subscribes to events, prompts it, and settles output/error/evidence. Abort can arrive during creation; late-created sessions are disposed. Streaming text captured before timeout/error is labeled partial and does not satisfy acceptance or a requested output file. [Foreground execution][execution]

Native background launch persists configuration and starts a detached runner. The runner hosts sessions rather than reading a per-agent stdout JSON protocol. A composite runner can own several native children. External command runners are an additional async-only path with different capabilities. Native foreground detach releases parent waiting but continues inside the same runtime; it is not a new detached operating-system process. [Async launch][async] [Runner][runner]

Background startup also has a correlated ready/acknowledged/confirmed/proceed handshake. Persistence/identity failures before proceed stop startup and attempt termination; process-close observation remains separate. This explains why a run identifier or config file is insufficient evidence that execution began. Workflow scripts normally choose background execution when async is omitted; explicitly selecting foreground blocks the parent, while configuration/forced-async rules can affect the choice. [Startup handshake][startup] [Execution defaults][config-execution]

For independent fanout, runs.all accepts stable keys and returns ordered results. It validates a batch before launch and waits for ordinary failed children alongside successful siblings. runs.run has fail-fast semantics unless the workflow handles its failure. A semaphore bounds active launches; results retain input order even when completion order differs. [Parallel scheduler][parallel] [Workflow batch tests][workflow-test]

Sequential workflow code awaits one child before using its result to launch another. runs.lanes combines parallel lane starts with ordered stages inside each lane; a blocked typed verdict can stop one lane while siblings continue. A reused key returns its original promise when the launch fingerprint agrees; changed parameters reject rather than silently create replacement work. Returned launch promises must be observed. [Workflow runtime][workflow-runtime]

Workflow scripts run in a restricted environment. Their JSON inputs/results cross a host boundary; arguments are deeply frozen. Named resources carry host-resolved provenance and narrowly specified host command authority. Raw scripts/path sources cannot manufacture that authority. This is useful as a contract pattern, but copying the script executor adds unnecessary complexity to this browser prototype. [Trusted resource documentation][extension-api]

A background dispatch receipt is not completion: explicit child async:true yields running, ok:false, empty output, and no final report pointer. Workflow dispatch may finish while children continue. **Derived browser recommendation:** always distinguish “accepted/queued” from “completed/validated,” including in chat wording. Do not turn scheduling acknowledgement into a mutation receipt.

## 7. Results, evidence, artifacts, and parent context

The structured delegation API correlates requestId, ownerRunId, and nodeId across started/update/response/cancel events. Terminal statuses distinguish completion, cancellation, timeout, interruption, exhausted budgets, invalid requests/context, duplicate nodes, structured-output failure, and acceptance failure. Usage can be unavailable rather than zero; progress snapshots do not replace authoritative terminal accounting. [Delegation API][delegation]

A child outputSchema activates a schema-validated structured_output tool. Successful capture terminates the step; missing or invalid submission is a failure rather than fallback to persuasive prose. Validation happens at the host boundary. Structured output can optionally carry a separately validated acceptance report. [Structured output tool][structured-tool] [Schema runtime][structured]

A typed gate is different: the host runs a post-child command, requires successful execution and bounded valid JSON stdout, optionally validates a schema, and uses that value as structuredOutput. It cannot combine with another outputSchema source. A JSON verdict of blocked can still come from a successfully executed classifier; workflow policy then interprets it. Invalid/empty stdout fails. Typed gates are not memoized. [Typed gate tests][gate-test] [Acceptance evaluator][acceptance]

Acceptance separates child claims from structural checks, host verification, and independent review. Declared acceptanceRole influences inference, not capabilities; names/task risk vocabulary do not determine policy. Explicit versus inferred gates have different failure consequences. AgentContract version 1 separates execution, effects, and review projections, so a successful session does not automatically establish desired effects or approval. [Role inference][acceptance-role] [Acceptance resolution][acceptance] [Agent contract][contract]

Artifacts retain full output/transcripts/metadata while the parent can receive a bounded reference. The recorded output binding is authoritative; a path mentioned by child prose is not. File-backed summary capping checks the recorded saved artifact rather than trusting a model-authored pointer. There is no universal hard cap on every inline child output: explicit maxOutput and file-only routing remain relevant. [Output routing][single-output] [Artifact paths][artifacts]

**Derived browser recommendation:** store full local specialist results in IndexedDB with application-owned artifact IDs, and pass the parent a small validated handoff. No filesystem path, Gist upload, or child-authored “saved successfully” string should be trusted. Preserve full artifacts independently from model history. Budget the parent after aggregation: ten small child outputs can still overflow it.

## 8. Progress, supervision, control, and recovery

Session events feed progress and transcript artifacts directly. agent_end with a retry pending is not the final watermark; agent_settled matters. Status includes run identity, lifecycle, activity/attention, outputs, and control receipts. Process-terminal proof is separate from execution success: a result file or missing PID does not prove a runner closed. [Observability][observability]

contact_supervisor carries need_decision, interview_request, or progress_update. Requests belong to the exact spawning session, not every session in the same repository. In A → B → C, C asks B; B must separately escalate to A and then reply to C's original request. Steering is not an answer to a pending question. Ordinary leaves do not acquire downward supervision just by knowing a tool name. [Supervisor implementation][supervisor] [Supervisor scope tests][supervisor-test]

Stop, interrupt, steer, and resume have different meanings. Public stop targets current-session async work and is non-resumable; ordinary foreground/nested targets are rejected. Interrupt can leave a resumable paused child. Resume starts a new child from persisted context rather than continuing the same live object. Steering transport receipts do not promise model compliance. Only a top-level single steer may use bounded pause/revival recovery, and it preserves the child contract and remaining limits; workflow, RPC, nested, and multi-child routes have stricter nonrecovering boundaries. [Control contracts][control-contracts] Resume additionally resolves ownership, recovery metadata, state, and policy; canonical session leases prevent competing revival. [Async resume][resume] [Session leases][lease]

One narrow automatic abort recovery exists: verified compaction settlement plus an empty zero-usage terminal abort, useful previous progress, retained session, and no active/unresolved tool. It is refused after an earlier recovery attempt, stop/interrupt, timeout, budget exhaustion, structured-output failure, or acceptance failure. This is not blanket automatic retry permission. [Abort recovery planner][recovery]

Completion delivery has owner identity and deduplication. Result watcher delivery/acknowledgement can retry without relaunching the child. Reconciliations repair stale lifecycle records from evidence; they do not make uncertain effects successful. **Derived browser recommendation:** retrying a notification is different from retrying an operation. [Delivery ownership][delivery] [Completion dedupe][dedupe] [Result watcher][watcher] [Stale reconciliation][reconcile]

## 9. Budgets and recursion: separate counters

| Control | Upstream behavior | Browser implication |
| --- | --- | --- |
| Active concurrency | Global run limit defaults to 20; a scheduling semaphore queues children. | Start at one active specialist; trial two only with measured memory/latency. |
| Run-tree admissions | Default 64 logical children, including nested/dynamic admissions; completed claims are not refunded. | Count all spawned specialists, not only active ones. |
| Parent-session admissions | Optional cumulative limit; default unlimited; grants are controlled separately. | Keep a small explicit turn/run/session allowance. |
| Active top-level async runs | Optional separate capacity pool; queued/paused/attention states can retain slots. | No detached-browser-runner promise; persisted paused records are not live sessions. |
| Depth | Default two nested levels; descendants can tighten inherited limits. | Start with parent → specialist only; no child delegation tool. |
| Tool calls | Soft nudge, hard block; default blocked set is read/search, not all tools. | Read-only children can use a hard cap; count attempted calls and bound returned data. |
| Reported usage | Soft status, hard stops future launches after reconciliation; no reservation model. | Do not present missing tokens as zero or use reported tokens as a hard preflight guarantee. |
| Runtime/tool deadlines | Distinct outer deadline and per-tool timers; timeout can land during effects. | Abort cannot roll back an already committed IndexedDB transaction. |

The remaining internal top-level parallel path has separate defaults of eight tasks and concurrency four. Those are not the workflow global limit of twenty. Scheduler/admission limits, parent-context capacity, and model/device throughput are three different constraints. [Parallel defaults][parallel-defaults]

Sources: [Semaphore][parallel], [run fanout admission][fanout], [session spawn budget][spawn], [async capacity][capacity], [depth implementation][depth], [tool budget][tool-budget], [usage budget][usage], [control/attention runtime][control]. Atomic batch-admission tests cover exact exhaustion, competing claims, rollback of a failed admission commit, and invalid containment. That rollback concerns admission state, not already executed user work. [Fanout tests][fanout-test]

Upstream deadlines are intentionally uneven: foreground/plain single async launches fall back to a 30-minute run deadline, while async composite roots have no default parent deadline and bound their children separately. Workflow opt-in deadlines can bound child deadlines to remaining time and return a partial terminal outcome with settled receipts. Tool timeouts and reported usage caps do not establish a mutation-safe checkpoint. These are reasons to design a small explicit browser budget, not copy the defaults. [Deadline configuration][config-limits] [Bounded workflow contract][workflow-bounds]

**Derived initial browser policy:** one active child, maximum three logical child admissions per human turn, no recursive delegation, at most two read-only inference stages per child, a bounded input snapshot, bounded result schema, and an explicit overall deadline. These numbers are experiment defaults, not Chrome limits. Tightening child limits must not prevent the parent from reporting known committed receipts.

## 10. Optional subsystems and their portability

| Upstream subsystem | Architectural purpose | Research conclusion for this prototype |
| --- | --- | --- |
| Missions and schedules | Durable logical work, state, run grouping, external-outcome receipts, delayed work. | Persist weekly-review state locally; a future schedule is not a guarantee that Chrome can infer while the app is closed. |
| Watchdog | Opt-in independent review and permission arbitration. | Consider a read-only audit specialist only when authorized; it cannot become a substitute for deterministic validation. |
| Per-role memory/refinement | Bounded role memory and versioned guidance informed by prior evidence. | Defer. If explored, keep provenance, validation, and data/instruction separation; do not automatically promote task text into prompts. |
| Model profiles | Provider catalog/probe-driven role assignments. | Outside scope: all specialists use the same Chrome-local model. |
| Worktrees and lane merging | Isolate repository changes and track merge/cleanup evidence. | No browser filesystem/Git equivalent needed; use immutable snapshots and IndexedDB revision checks. |
| CLI, Herdr, inspector/TUI integrations | Alternate execution/placement and operator observation. | Borrow compact run cards; do not import remote execution, terminal processes, or framework dependencies. |
| Session sharing | Explicit full transcript export/upload using GitHub credentials. | Excluded; do not send local user data to remote services. |

Sources: [Missions][missions], [watchdog][watchdog], [model profiles][models], [runtime integration APIs][extension-api], [agent memory/refinement][agents-memory], [session sharing][sharing].

Standalone support is specifically validated for official Pi 0.86.1 Linux x64; Windows standalone recognition is experimental. npm Pi retains its Node runner. Broad peer ranges and fixture tests do not establish universal compatibility across Pi versions, operating systems, arbitrary extensions, or providers. Source-checkout versus packed distribution entry points also differ. [Standalone boundary][standalone] [Package manifest][package]

## 11. Fit with the existing app

The app already has several of the necessary boundaries:

- A prepared root LanguageModel session; native turns use fresh sessions with a current catalog, while JSON bridge turns clone when possible.
- Application-owned abort controllers and generation checks; separate cleanup of model work and pending tool approval.
- Central registered WebMCP callbacks that validate inputs, request tool permission, check resolved effects, and run revision-sensitive IndexedDB transactions.
- Correlated native tool responses, deterministic readable references, bounded model context/results, duplicate-call protection, and verified receipts.
- A strict separation between task mutation and weekly-review advancement; review controls require fresh human intent and permission.
- Persistent review/chat state; reload pauses a review without replaying model calls.

These are observations of the source, not newly tested guarantees. The app does not currently implement a specialist registry, multi-child scheduler, structured specialist handoff, or durable child-run protocol. [app.js](../../app.js) [harness.js](../../harness.js) [Harness description](../harness.md)

**Derived design:** the existing UI and callback gate should remain the center. During Get Current, an authorized project-health specialist could read a fixed local snapshot and propose missing next-action questions. An independently authorized evidence specialist could check those suggestions against the same snapshot. The parent selects the next conversational question; it alone submits any user-authorized tool proposals through existing callbacks. Specialists do not complete Tasks, alter review marks, or convert advice into permission.

The weekly-review calendar steps remain honest: this browser app does not acquire external calendar access merely because a specialist is named calendar-reviewer. Use the user's supplied calendar notes within the existing intent.

## 12. Original browser protocol sketch

**Derived, non-implemented example.** Fields below are original application concepts, not pi-subagents parameters. The first JSON object is a **private host scheduling envelope**, not a model input. Storage IDs, authority references, and run identities remain host-owned. Authority is created/stored by application code after the human request is accepted; it is not accepted from model JSON.

~~~json
{
  "requestId": "req-17",
  "parentTurnId": "turn-9",
  "runId": "run-4",
  "nodeId": "project-health",
  "role": "project-health",
  "scope": { "reviewStep": "projects", "itemIds": ["p-12"] },
  "snapshotRevision": 31,
  "contextMode": "fresh",
  "authorityRef": "app-owned-grant-5",
  "capabilities": ["read_snapshot"],
  "limits": { "inferenceStages": 2, "resultCharacters": 2400 },
  "resultContract": "project-health/v1"
}
~~~

The specialist instead receives bounded facts and readable closed choices, for example `reference: "Kitchen planning — Project"` and `evidenceRef: "Kitchen planning — immediate children at revision 31"`. Its model-facing finding schema uses those choices, not `itemId`. The host resolves the frozen references against its private map and checks current scope/revision before attaching storage identity.

A **host-assembled result**, after validating and resolving the model's finding, might be:

~~~json
{
  "requestId": "req-17",
  "runId": "run-4",
  "nodeId": "project-health",
  "status": "completed",
  "snapshotRevision": 31,
  "value": {
    "findings": [
      { "itemId": "p-12", "kind": "missing-next-action",
        "evidence": ["snapshot:p-12:children"],
        "question": "What is the next visible action for this project?" }
    ]
  },
  "effects": { "committedReceiptIds": [] },
  "artifactRef": "local-artifact-23"
}
~~~

Host validation checks request/owner correlation, schema/version, role/scope, result size, current generation, and valid evidence references. The application adds identities, resolved private item/evidence IDs, status, artifact/effect fields from its own records; the model cannot certify them. Neither private JSON envelope is passed back to a parent model without projection to readable references. A completed inference can produce an empty finding list; that does not mean the project is completed. A malformed result is failed_contract, not a natural-language instruction to widen permissions.

~~~mermaid
sequenceDiagram
    participant U as User
    participant P as Parent session
    participant H as App harness
    participant S as Read-only specialist
    participant G as Existing tool gate
    participant DB as IndexedDB
    U->>H: Review project health with a specialist
    H->>H: Record authority, scope, generation and budgets
    H->>DB: Read immutable scoped snapshot
    H->>S: Create fresh child with bounded contract
    S-->>H: Structured findings / decision request
    H->>H: Validate correlation, schema and evidence
    H->>DB: Persist local artifact
    H-->>P: Bounded advice and artifact reference
    P-->>U: Ask next-action question
    U->>P: Explicit item change request
    P->>G: Proposed tool call
    G->>U: Existing effect/permission card
    U->>G: Approve
    G->>DB: Revalidate and commit transaction
    DB-->>G: Verified receipt
    G-->>P: Actual result
    P-->>U: Receipt-based confirmation
~~~

This diagram intentionally has no specialist → mutation path. Independence comes from separate contexts and fixed evidence, not a claim that the same local model supplies different underlying knowledge.

## 13. Original lifecycle and failure contract

~~~mermaid
stateDiagram-v2
    [*] --> Proposed
    Proposed --> Rejected: no authority / invalid scope / budget
    Proposed --> Queued: host admission
    Queued --> Running: child allocation
    Queued --> Cancelled: stop before start
    Running --> NeedsDecision: correlated question
    NeedsDecision --> Running: explicit scoped reply
    NeedsDecision --> Cancelled: stop / expiry
    Running --> Validating: completed model result
    Running --> Failed: model/tool/deadline failure
    Running --> Cancelled: abort
    Validating --> Completed: schema + correlation + evidence
    Validating --> Failed: invalid contract / persistence failure
    Completed --> [*]
    Failed --> [*]
    Cancelled --> [*]
    Rejected --> [*]
~~~

**Derived rules:**

1. Persist admission and identity before publishing Running. Queued work acquires a live session only when capacity is available.
2. Model chunks/progress are provisional. Completed means validated result and artifact persistence, not dispatched request or pleasing final prose.
3. Stop invalidates the generation, aborts child prompts and pending approval, settles queued work, and destroys owned sessions. Keep already verified mutation receipts visible.
4. Reload marks surviving nonterminal records interrupted/paused; reconstruct only on a fresh authorized action. Never replay mutation proposals from saved transcripts.
5. Decision replies target an exact pending request and scope. A suggestion, steer acknowledgement, or free-form handoff never grants broader authority.
6. Distinguish failed-before-dispatch, known committed, known rolled back, and uncertain outcome. Before retrying an uncertain write, inspect current records and receipts. Use existing transaction/revision protections; do not promise exactly-once effects from request IDs alone.
7. Reattempt read-only analysis only through explicit host policy, with a new attempt identity and retained error. Never silently switch to remote AI, Node, a CLI agent, or a different tool protocol.
8. Terminal persistence can fail after model completion. Report that distinction without rerunning successful work merely to recreate a missing notification.
9. Retain committed knowledge outside the model: item revision, action receipt, review boundary, artifact version, and remaining requested work. A compacted summary or child confidence score cannot replace them.

## 14. DO / DON'T

| DO, derived from the inspected patterns | DON'T |
| --- | --- |
| Make authorization, availability, and admission separate checks. | Let task complexity or stored instructions auto-enable delegation. |
| Declare a role's tools and scope in code. | Assume reviewer means no writes or acceptanceRole enforces access. |
| Use fresh contexts for distinct roles and clone only suitable checkpoints. | Assume a fork inherits no instructions, permissions, or resource cost. |
| Validate structured handoffs and correlate every lifecycle event. | Treat child prose as approval, dispatch as success, or progress as final output. |
| Keep bounded parent summaries plus full local artifacts. | Dump every transcript/artifact into the parent's limited context. |
| Track cumulative spawns independently of concurrency. | Reset spawn accounting whenever a child finishes or context compacts. |
| Keep mutation permissions and receipts at the existing app gate. | Give specialists direct IndexedDB/WebMCP write access for convenience. |
| Preserve uncertain outcomes and inspect before write retries. | Assume an abort or timeout undoes committed state. |
| Scope supervision and control to the exact parent/run. | Route requests by role name, repository name, or free-form message text. |
| Measure same-model context/memory/latency on real devices. | Promise throughput gains, persistent background inference, or cloud-style agents. |

These are design recommendations. Upstream source provides useful contracts and tests; it does not mandate the browser architecture or authorize an implementation.

## 15. Coverage, gaps, and next research questions

Focused tests inspected cover loader compatibility/restoration, public private-field rejection, fork isolation/strict failures, permission-provider selection, ordered parallel settlement/concurrency, typed JSON gates, exact supervisor ownership, and atomic fanout admission. No upstream test suite or prototype regression suite was executed. No inference latency, clone memory, scheduling behavior, browser lifecycle, or Chrome version compatibility was measured.

Important source surfaces remain worth a separate deeper audit before any implementation depends on them:

- The full acceptance/review ledger, effects projection, structured delegation bridge, preflight launch digest, and workflow receipt recovery.
- Async runner bootstrap/startup authorization, process-terminal proof, result-publication races, delivery replay, retained-child leases, and abandoned-capacity reclamation.
- Every external runner/provider, versioned host integration, builtin MCP selection, extension cache state, and provider lifecycle hook.
- Per-role persistent memory, refinement validation, profile generation, worktree setup/cleanup, schedules, and mission state concurrency.
- Real-device Chrome clone/create/abort/overflow behavior and per-role tool exposure, using the companion primary-source research and a separately authorized experiment.

All ten upstream documentation topics were fetched: agents, configuration, extension-api, missions, models, observability, standalone-background, tool-reference, watchdog, and workflows. No advertised topic was unavailable. Detailed optional subsystems were reviewed for boundaries and relevance rather than line-by-line completeness. The repository has many large runtime modules; this research is an exhaustive architectural map of the requested delegation path, not a claim to have audited every branch of every file.

The smallest useful future experiment is one authorized read-only specialist for one weekly-review step, using a fixed snapshot, a strict small handoff, a local artifact, visible Stop, and the existing parent mutation gate. That is a research conclusion, not an implementation or installation request.

## Pinned source index

[package]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/package.json#L1-L129
[entry]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/src/extension/index.ts#L279-L1166
[factory]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/src/runs/shared/child-session.ts#L405-L688
[async]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/src/runs/background/async-execution.ts#L1469-L1828
[reviewer]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/agents/reviewer.md#L1-L56
[oracle]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/agents/oracle.md#L1-L60
[worker]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/agents/worker.md#L1-L50
[agents]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/docs/agents.md#L15-L34
[prompt-runtime]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/src/runs/shared/subagent-prompt-runtime.ts#L109-L360
[activation]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/src/extension/tool-activation.ts#L35-L146
[activation-test]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/test/unit/tool-activation.test.ts#L93-L306
[schemas]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/src/extension/schemas.ts#L230-L337
[public]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/src/extension/public-execution.ts#L88-L225
[public-test]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/test/unit/public-execution.test.ts#L109-L181
[executor]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/src/runs/foreground/subagent-executor.ts#L7409-L7814
[fork]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/src/shared/fork-context.ts#L54-L240
[fork-test]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/test/unit/fork-context.test.ts#L104-L271
[config-fork]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/docs/configuration.md#L248-L273
[tool-plan]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/src/runs/shared/child-tool-plan.ts#L289-L512
[ceiling]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/src/runs/shared/capability-ceiling.ts#L145-L190
[permissions]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/src/runs/shared/permissions.ts#L4-L50
[permission-gate]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/src/runs/shared/subagent-prompt-runtime.ts#L372-L418
[authority]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/src/policy/authority.ts#L1-L48
[model-scope]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/src/runs/shared/model-scope.ts#L70-L194
[execution]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/src/runs/foreground/execution.ts#L1380-L1609
[runner]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/src/runs/background/subagent-runner.ts#L735-L1866
[parallel]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/src/runs/shared/parallel-utils.ts#L159-L242
[workflow-test]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/test/unit/scripted-workflow.test.ts#L615-L876
[workflow-runtime]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/src/workflows/scripted-workflow.ts#L2277-L2596
[extension-api]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/docs/extension-api.md#L5-L95
[delegation]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/src/api/delegation.ts#L1-L132
[structured-tool]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/src/runs/shared/subagent-prompt-runtime.ts#L443-L480
[structured]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/src/runs/shared/structured-output.ts#L355-L465
[gate-test]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/test/unit/typed-gate-output.test.ts#L89-L139
[acceptance]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/src/runs/shared/acceptance.ts#L469-L566
[contract]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/src/runs/shared/agent-contract.ts#L1-L37
[single-output]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/src/runs/shared/single-output.ts#L156-L239
[artifacts]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/src/shared/artifacts.ts#L129-L257
[observability]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/docs/observability.md#L191-L264
[supervisor]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/src/intercom/native-supervisor-channel.ts#L260-L621
[supervisor-test]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/test/unit/native-supervisor-channel.test.ts#L209-L284
[resume]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/src/runs/background/async-resume.ts#L468-L646
[lease]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/src/runs/shared/session-lease.ts#L110-L280
[recovery]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/src/runs/shared/abort-recovery.ts#L67-L119
[delivery]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/src/runs/background/result-delivery-ownership.ts#L14-L44
[dedupe]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/src/runs/background/completion-dedupe.ts#L23-L57
[watcher]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/src/runs/background/result-watcher.ts#L198-L633
[reconcile]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/src/runs/background/stale-run-reconciler.ts#L383-L420
[fanout]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/src/runs/shared/run-fanout-budget.ts#L204-L265
[spawn]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/src/runs/shared/spawn-budget.ts#L30-L132
[capacity]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/src/runs/background/active-async-capacity.ts#L95-L246
[depth]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/src/shared/types.ts#L2951-L3018
[tool-budget]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/src/runs/shared/tool-budget.ts#L3-L82
[usage]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/src/runs/shared/usage-budget.ts#L14-L64
[control]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/src/runs/shared/subagent-control.ts#L41-L197
[fanout-test]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/test/unit/run-fanout-budget.test.ts#L118-L187
[missions]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/docs/missions.md#L5-L85
[watchdog]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/docs/watchdog.md#L5-L38
[models]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/docs/models.md#L225-L255
[agents-memory]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/docs/agents.md#L457-L505
[sharing]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/docs/tool-reference.md#L531-L543
[standalone]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/docs/standalone-background.md#L1-L15
[startup]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/src/runs/background/async-execution.ts#L570-L638
[config-execution]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/docs/configuration.md#L221-L228
[config-limits]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/docs/configuration.md#L394-L460
[workflow-bounds]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/docs/workflows.md#L118-L140
[control-contracts]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/docs/tool-reference.md#L362-L394
[parallel-defaults]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/src/shared/types.ts#L2870-L2926
[acceptance-role]: https://github.com/nicobailon/pi-subagents/blob/8fcc3c787a6e7d9da0f21bafb604fe937084c21b/src/runs/shared/acceptance.ts#L80-L121

