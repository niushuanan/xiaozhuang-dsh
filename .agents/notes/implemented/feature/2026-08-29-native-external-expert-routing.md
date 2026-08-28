# Agent Note: Native external expert routing

Status: implemented

English | [中文](2026-08-29-native-external-expert-routing.zh.md)

## Problem

Codex and Z Code appeared as configurable external experts, but their configured Providers did not make them callable from the shipped Agent presets. Teamwork also described both products statically, even when one was disabled or unavailable, and counted only delegations issued directly by the root Session. A native child could therefore escalate again without consuming the root Teamwork concurrency budget.

The existing subagent runtime already owns Provider discovery, lifecycle events, run settlement, parent ownership, and model-visible tools. Adding a parallel external-agent scheduler or a second roster would duplicate those contracts and let UI state drift from executable capability.

## Decision

Codex and Z Code integrate through the existing `ctx.subagents` Provider registry and `dsh-tool-subagent` consumer. Their Providers remain shared Host registrations under the [shared-host placement](../architecture/2026-08-10-product-subagent-providers-in-shared-host.md); Agent presets own model-visible tool exposure. The shipped `standard`, `ptc`, and `cordis` presets contain active `subagent_codex` and `subagent_zcode` consumers. `minimal` and `chat` intentionally expose neither expert.

`dsh-tool-subagent` accepts optional `routingGuidance`. It appends that stable, instance-specific purpose to the Provider-derived description every time the Provider mounts. The existing [Provider lifecycle](../architecture/2026-07-05-subagent-provider-lifecycle-events.md) remains authoritative: a missing or disabled Provider means no tool, and restoring the Provider recreates the tool with its complete description. Tool calls cannot choose a Provider, permission mode, executable, credential, or deployment path.

Teamwork derives its external roster from `ctx.subagents` during every prompt assembly. Native `subagent` and `subagent_fork` are the routine execution pool; external experts are selective escalation lanes for difficult implementation, a blocked native attempt, explicit user choice, or materially useful independent review. The policy names only currently callable Providers and gives every external run a standalone prompt.

Teamwork resolves a delegated caller back to its nearest Teamwork root with `ctx.agents.isOwnedBy`. Native descendants and external calls share the root's five-worker concurrency budget, so nested delegation cannot bypass the cap. Review defaults to a lane different from implementation and does not automatically call both external products.

### Executable capability boundary

| Concern | Owner | Observable result |
| --- | --- | --- |
| Product installation, authentication, and process lifecycle | Host Provider row | A dormant named Provider exists only while enabled |
| Tool visibility and expert purpose | Agent preset plus `dsh-tool-subagent` | The expert is callable only in tool-bearing presets and only while its Provider exists |
| Teamwork candidate list and routing policy | Teamwork prompt assembly | The model sees only callable experts and keeps native workers as the default |
| Delegation accounting | Teamwork root ownership | Native descendants and external calls share one five-worker limit |
| Distribution | Teamwork export catalog | The standalone payload includes Provider adapters, tool consumer, and tool-bearing preset grants |

## External precedents

[OpenAI Agents SDK](https://github.com/openai/openai-agents-python/blob/main/src/agents/agent.py) exposes a specialist as a manager-owned tool with a stable name, description, runtime availability predicate, and returned result. [AutoGen SelectorGroupChat](https://github.com/microsoft/autogen/blob/main/python/packages/autogen-agentchat/src/autogen_agentchat/teams/_group_chat/_selector_group_chat.py) filters candidates before selection and relies on stable participant descriptions. [CrewAI delegation tools](https://github.com/crewAIInc/crewAI/blob/main/lib/crewai/src/crewai/tools/agent_tools/agent_tools.py) build the model-facing coworker roster from available agents and require explicit task context. [A2A](https://github.com/a2aproject/A2A/blob/main/docs/specification.md) separates discovery metadata from task transport and lifecycle.

DSH adopts the shared manager-as-tool and live-discovery principles, but retains its own Provider/run contract. This keeps local product adapters hot-pluggable without introducing a network Agent Card, handoff protocol, or second task state machine.

## Verification

Focused tests pin routing guidance across Provider removal and restoration, active expert rows in every tool-bearing shipped preset, omission from `minimal` and `chat`, active-only Teamwork roster text, and root concurrency enforcement for a nested native child. Catalog coverage pins the preset source closure and expert routing descriptions in the exported Teamwork package. Package type checks, bundles, documentation gates, and a live Web composition verify the shipped faces and hot-plug behavior.

## Alternatives considered

**Build a separate external-agent scheduler.** The subagent runtime already owns provider registration, runs, cancellation, settlement, and lifecycle events. A second scheduler would create conflicting execution truth and separate tooling.

**Use an A2A Agent Card and network protocol for local products.** Agent Cards are useful across deployment boundaries, but Codex and Z Code are local Profile-owned adapters. Adding discovery endpoints, task ids, streaming transport, and artifact negotiation would not remove a current user obstacle.

**Put product tools only on the shared Host.** Per-Session Agent presets own the model-visible tool set. Host-only rows can make a setting look enabled while leaving the selected Agent without an executable tool.

**Always call both external experts in Teamwork.** Mandatory fan-out increases latency, cost, and contradictory output for ordinary work. The policy keeps one independent reviewer as the normal high-risk path and uses both only when cross-cutting risk or conflicting evidence justifies it.

**Read the external roster from UI settings.** UI intent is not executable capability. The Provider registry is the runtime source of truth and automatically follows hot removal and restoration.

## Consequences

External experts are now ordinary, statically authorized subagent tools rather than decorative settings entries. Agentic Coding can call them without Teamwork; Teamwork adds plan-first selection, independent review, and shared concurrency instead of another runtime. Provider removal is fail-closed and immediately removes the corresponding tool.

The design deliberately adds no arbitrary Provider picker, automatic fallback chain, cross-product context inheritance, remote Agent Card endpoint, external-expert quota, or separate external-task history. Adding another expert requires a named Provider, a purpose-specific tool row in the intended presets, and an optional Teamwork roster descriptor; it does not require changing the execution service.
