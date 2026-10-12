# Chrome AI, WebMCP, and browser-agent research

Research date: **2026-10-12**. This collection answers the maintainer's research request for [ChromeAI.md](../../ChromeAI.md), the Prompt API tool-use flag, Pi's main loop, and Pi Subagents. Each primary page/repository was assigned to its own research agent. Supporting pages received separate agents where they introduced a distinct feature or usage contract. Source code and tests were read; this research did not run examples, install packages, change Chrome flags, or test a local model.

The intended consumer is the next design and implementation pass. Read [nextactions.md](../../nextactions.md) for priorities, then [the proposed browser architecture](browser-agent-architecture.md). Use individual chapters when working on a specific contract. The app's current [design](../app-design.md), [implementation plan](../implementation-plan.md), and [harness notes](../harness.md) remain historical/current implementation context; they have not been revised by this research.

## Coverage of the requested sources

| Requested page or source | Research chapter | Dedicated agent |
| --- | --- | --- |
| [Prompt API](https://developer.chrome.com/docs/ai/prompt-api) | [Chrome Prompt API](chrome-prompt-api.md) | `research_prompt_api` |
| [Session management](https://developer.chrome.com/docs/ai/session-management) | [Session lifecycle, cloning, context, and cancellation](chrome-session-management.md) | `research_sessions` |
| [Session compacting](https://developer.chrome.com/docs/ai/session-compacting) | [Application-managed compaction](chrome-session-compacting.md) | `research_compaction` |
| [Structured output](https://developer.chrome.com/docs/ai/structured-output-for-prompt-api) | [Constraints, accounting, validation, and schema drift](chrome-structured-output.md) | `research_structured_output` |
| [GoogleChromeLabs/web-ai-demos](https://github.com/GoogleChromeLabs/web-ai-demos) | [Complete directory inventory and representative source traces](chrome-ai-demos.md) | `research_chrome_demos` |
| [WebMCP](https://developer.chrome.com/docs/ai/webmcp) | [Platform overview, gates, trust, and lifecycle](webmcp-overview.md) | `research_webmcp_overview` |
| [Imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api) | [Registration, discovery, execution, and source contracts](webmcp-imperative-api.md) | `research_webmcp_imperative` |
| [Build effective tools](https://developer.chrome.com/docs/ai/webmcp/build-tools) | [Workflow design, tool audit, guidelines, and evaluation](webmcp-effective-tools.md) | `research_effective_tools` |
| [GoogleChromeLabs/webmcp-tools](https://github.com/GoogleChromeLabs/webmcp-tools) | [Demo/tool/skill inventory and evaluation limitations](webmcp-tools.md) | `research_webmcp_tools` |
| `chrome://flags/#prompt-api-tool-use` | [Exact flag expansion and native open-loop protocol](chrome-prompt-api-tool-use.md) | `research_tool_use_flag` |
| [earendil-works/pi](https://github.com/earendil-works/pi) | [Actual entry path, core scheduler, events, and policies](pi-agent-loop.md) | `research_pi_loop` |
| [nicobailon/pi-subagents](https://github.com/nicobailon/pi-subagents) | [Child modes, capabilities, supervision, structured output, and recovery](pi-subagents.md) | `research_pi_subagents` |

The demo chapters inventory the complete pinned collections and deeply trace representative features relevant to this app. They do not claim every unrelated demo has been executed or exhaustively verified. Their value is a source map and a reasoned account of what to adapt or avoid.

## Supporting feature chapters

| Topic | Research chapter | Reason for following this source |
| --- | --- | --- |
| [Built-in AI do/don't guidance](https://developer.chrome.com/docs/ai/built-in-ai-dos-donts) | [Recommended AI usage and output practices](chrome-ai-guidelines.md) | Quality, output limits, untrusted generated content, and current safe rendering |
| [Get started](https://developer.chrome.com/docs/ai/get-started) | [Prerequisites and readiness](chrome-ai-prerequisites.md) | Hardware, platform, language, storage, permissions, and capability diagnostics |
| [Model-download UX](https://developer.chrome.com/docs/ai/inform-users-of-model-download) | [Consent, activation, progress, and failure](chrome-model-downloads.md) | Required first-use preparation without misleading percentages or silent downloads |
| [Streamed response rendering](https://developer.chrome.com/docs/ai/render-llm-responses) | [Streaming output](chrome-streaming-output.md) | Safe display of incremental output, distinct from executable proposals |
| [Summarizer API](https://developer.chrome.com/docs/ai/summarizer-api) | [Optional Summarizer](chrome-summarizer.md) | The compaction guide relies on a separate optional API |
| [Language Detector API](https://developer.chrome.com/docs/ai/language-detection) | [Optional language detection](chrome-language-detection.md) | Language selection in the recommended compaction flow has its own model/readiness requirements |
| [Declarative WebMCP](https://developer.chrome.com/docs/ai/webmcp/declarative-api) | [Forms as tools](webmcp-declarative-api.md) | Form-generated choices, submission lifecycle, and visible user interaction |
| [Example Agentic Chrome Extension](https://github.com/GoogleChromeLabs/webmcp-extension) and [Model Context Tool Inspector](https://github.com/beaufortfrancois/model-context-tool-inspector) | [Reference browser harnesses](chrome-reference-harness.md) | Actual model↔permission↔page-tool↔result loops, not just screenshots |

Security, best practices, user journeys, draft specifications, Chromium tests, demo helpers, and relevant Pi source files are followed within these chapters. This is not a survey of unrelated AI APIs, cloud providers, GPU runtimes, or all transitive libraries. Their presence in examples does not change the app's static, local-only scope.

## How to weigh the evidence

Different sources answer different questions:

1. **A controlled observation of the exact browser/model/options** establishes what that environment did. This research performed no such run. Earlier observations in [weekly-review.md](../weekly-review.md) and [native-review.md](../native-review.md) belong to their recorded builds and fixtures.
2. **Pinned implementation and test code** establishes the inspected code path and intended regression contract. Chromium main is not automatically the user's installed release branch. Echo-model tests establish plumbing, not ordinary-language competence.
3. **Official Chrome guides** establish vendor guidance and stated support. Check their visible dates and compare with implementation when contracts disagree.
4. **Community Group specifications/explainers** establish a developing proposal. They are not final W3C standards or proof of shipped behavior.
5. **Demo/helper/extension code** establishes that example's design. It can contain outdated API names, unsafe shortcuts, dependencies, polyfills, and evaluation gaps.
6. **Our adaptation/recommendation/pseudocode** is original design inference. It must be reviewed and tested before implementation.

These categories are not a single universal ranking: a current guide can be correct for stable while main implements a future contract. Record disagreement instead of merging incompatible claims into one invented API.

## Contract differences that affect the next code pass

| Area | Evidence or disagreement | Practical consequence | Chapter |
| --- | --- | --- | --- |
| Native tool flag | Enabled expands to three features: tool use, conversation backend, and foundational-model parameter `v4`; current source offers Default/Enabled | Record the whole configuration; do not treat turning off the override as guaranteed feature absence or a proven crash diagnosis | [Flag](chrome-prompt-api-tool-use.md) |
| Capability preflight | Pinned renderer availability path supplies an empty tool vector | Text availability and exposed constructors are insufficient; verify creation and a harmless native call | [Flag](chrome-prompt-api-tool-use.md) |
| Context overflow | Guides/explainer discuss evicting old pairs; pinned draft has a rejecting prefill path | Measure actual behavior; overflow is not a safe last-minute compaction boundary | [Sessions](chrome-session-management.md), [compaction](chrome-session-compacting.md) |
| Quota vocabulary | Current web surface uses `contextUsage`, `contextWindow`, `measureContextUsage`, and `contextoverflow` | Avoid obsolete extension aliases as the new baseline | [Prompt API](chrome-prompt-api.md) |
| Constraint accounting | Draft includes constraint guidance in measurement; pinned implementation does not pass JSON schema in that path | Keep reserve margin and label estimates; do not promise exact constraint budgeting | [Structured output](chrome-structured-output.md) |
| Grammar support | Pinned decoder has keywords including minProperties; earlier local build needed a smaller projection | Preserve public validation; select decoder projection by measured compatibility rather than permanent unsupported claims | [Structured output](chrome-structured-output.md) |
| Output limits | Official guidance warns hard prose maxLength can distort output | Evaluate soft reply guidance separately from exact enums and domain/storage bounds | [Guidelines](chrome-ai-guidelines.md) |
| Native feedback | Current source uses `callId`, streaming shapes differ from an IDL comment, executor has identity/count TODOs | Adapter must account for all finalized calls and results itself; old `callID` examples are version-specific | [Flag](chrome-prompt-api-tool-use.md) |
| WebMCP execution | Imperative input-schema structure is not enforced in pinned execution | Keep strict callback validation and post-approval state checks | [Imperative API](webmcp-imperative-api.md) |
| WebMCP human interaction | Some guidance describes requestUserInteraction; current callback options expose only signal | Preserve the app's permission UI; do not code an absent callback client API | [Imperative API](webmcp-imperative-api.md) |
| WebMCP return/error/navigation | Draft serialization and errors differ from Chromium; declarative navigation null differs from imperative owner-loss rejection | Pin/test one result contract; null or transport failure does not prove a successful mutation | [Imperative API](webmcp-imperative-api.md) |
| Lifecycle | Registration cancellation does not cancel running callbacks; abort is not rollback | Own registration, invocation, inference, and committed effects separately | [Imperative API](webmcp-imperative-api.md), [sessions](chrome-session-management.md) |
| Download completion | Normalized progress can reach one before session preparation finishes; already available creation can also emit completion | Show download, AI preparation, and workspace readiness separately; app cancellation does not own Chrome's model download | [Downloads](chrome-model-downloads.md) |
| Stream stopping | Pinned responder cancellation is not equivalent to signalling inference abort | Stop must explicitly abort the owned request, preserve committed effects, and reject late output | [Streaming](chrome-streaming-output.md) |
| Reference harness provenance | Example Agentic Extension and Inspector are separate; extension wrapper lock is 0.2.1 while the researched demo helper is 0.2.6 | Trace the actual version and host loop; do not equate helper samples, extension privileges, or screenshot names | [Reference harnesses](chrome-reference-harness.md) |
| Declarative form events | Pinned autosubmit path can run before toolactivated; reset/error behavior differs from guide wording | Validate and authorize in the real execution/submission path; do not use an activation event as an approval barrier | [Declarative API](webmcp-declarative-api.md) |
| Optional summary settings | Base API status does not make performance preference stable; source separately gates/restricts speed | Probe the requested configuration and keep companion API preparation optional | [Summarizer](chrome-summarizer.md) |
| Pi batches | Parallel default; terminate is not immediate sibling cancellation; validated args may be mutated by a hook | Borrow lifecycle structure while retaining serial effects and immutable approved plans | [Pi loop](pi-agent-loop.md) |
| Pi recovery | Plain core loop does not consume the durable replay policy field | A transcript or imported type does not deliver exactly-once writes | [Pi loop](pi-agent-loop.md) |
| Specialists | Fresh/fork context, capability limits, and host supervision are distinct; desktop runner defaults differ | Start with one read-only child, host identity, shared local compute budget, and root mutation authority | [Pi Subagents](pi-subagents.md) |
| Examples/evals | Polyfills can synthesize APIs; echo/mock/no-tool tests can pass without proving semantics | Report host, fixture, real-model, and native-platform evidence separately | [AI demos](chrome-ai-demos.md), [WebMCP tools](webmcp-tools.md) |

## Source revision ledger

Repository commits are immutable source anchors, not file blob IDs. Official webpages were retrieved on the research date; each chapter records displayed update dates and relevant drift. Recheck moving sources before implementing.

| Repository | Inspected revision |
| --- | --- |
| [earendil-works/pi](https://github.com/earendil-works/pi/tree/19cb534c3b6e3871458a8fa59e98f0312c50e995) | `19cb534c3b6e3871458a8fa59e98f0312c50e995` |
| [nicobailon/pi-subagents](https://github.com/nicobailon/pi-subagents/tree/8fcc3c787a6e7d9da0f21bafb604fe937084c21b) | `8fcc3c787a6e7d9da0f21bafb604fe937084c21b` |
| [GoogleChromeLabs/web-ai-demos](https://github.com/GoogleChromeLabs/web-ai-demos/tree/d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c) | `d286f1eb9585edb5cd95d8a7e23f1c19f7a7596c` |
| [GoogleChromeLabs/webmcp-tools](https://github.com/GoogleChromeLabs/webmcp-tools/tree/04732fb849ab5eff0cd8d13c6f153e26ebb7bcad) | `04732fb849ab5eff0cd8d13c6f153e26ebb7bcad` |
| [GoogleChromeLabs/webmcp-extension](https://github.com/GoogleChromeLabs/webmcp-extension/tree/6f627070736a8ca451d5acb02b70f63a1e072f92) | `6f627070736a8ca451d5acb02b70f63a1e072f92` |
| [Chromium main snapshot](https://github.com/chromium/chromium/tree/578db53b7ff6a3eaa28e561e25cb6b1e4878da3a) | `578db53b7ff6a3eaa28e561e25cb6b1e4878da3a` |
| [Prompt API proposal](https://github.com/webmachinelearning/prompt-api/tree/dfcddb444a2763a823e1a7a8bb0af7c54009536a) | `dfcddb444a2763a823e1a7a8bb0af7c54009536a` |
| [WebMCP proposal](https://github.com/webmachinelearning/webmcp/tree/d0e4e0e0f039358cc9d93f90074116622bfebd53) | `d0e4e0e0f039358cc9d93f90074116622bfebd53` |
| [Translation and language-detection proposal](https://github.com/webmachinelearning/translation-api/tree/4334048603a5f8e5572d5ea77cef641f83712c4a) | `4334048603a5f8e5572d5ea77cef641f83712c4a` |
| [Inspector gitlink in the tools collection](https://github.com/beaufortfrancois/model-context-tool-inspector/tree/c9fbf9a7314ebfbb3ddb539d707548788435f059) | `c9fbf9a7314ebfbb3ddb539d707548788435f059` |
| [Inspector independent main snapshot](https://github.com/beaufortfrancois/model-context-tool-inspector/tree/ad93e8a27f2abea443af1d744c774b34f968c253) | `ad93e8a27f2abea443af1d744c774b34f968c253` |

Individual chapters provide more precise file/line anchors, source inventories, original examples, and later test proposals. None of the source repositories is introduced as an application dependency.

## Scope and validation of this research

Research documents and recommendations are the only authored outputs. Existing implementation files and maintainer guidance were read for applicability. Existing dirty maintainer files were preserved. Documentation review checks source distinctions, revision consistency, local links, examples, and actionable recommendations; no runtime success is claimed by those checks.

When work returns to code, use [the acceptance criteria in nextactions.md](../../nextactions.md), with the actual Chrome/model build and a full natural-language weekly review. Research uncertainty is an explicit test input, not a reason to quietly assume a platform behavior.

An independent research reviewer checked the completed chapters and recommendations, re-fetched critical source claims, and reported no remaining substantive findings after corrections. Documentation checks cover all 23 new Markdown files, including reference labels, local targets, code fences, and JSON examples. These are documentation checks; they do not constitute a browser test or implementation approval.
