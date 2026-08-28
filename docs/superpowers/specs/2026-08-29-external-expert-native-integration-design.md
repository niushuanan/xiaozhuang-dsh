# Native External Expert Integration Design

English | [中文](2026-08-29-external-expert-native-integration-design.zh.md)

## Product outcome

Codex and Z Code are callable collaborators, not settings-only identities. A normal Agentic Coding session can delegate to either expert through the same subagent tool contract used by native children. Teamwork adds plan-first routing, a shared concurrency limit, and independent review policy without owning a second execution runtime.

An installed expert is available to every newly composed tool-bearing Agent preset. Removing its Provider removes its tool from live prompt assembly; restoring the Provider restores the tool without restarting the browser or rebuilding a session. Existing native `subagent` and `subagent_fork` behavior remains the default path.

## Source research

- [OpenAI Agents SDK](https://github.com/openai/openai-agents-python/blob/main/src/agents/agent.py) exposes a specialist as a tool with a distinct name, routing description, runtime availability predicate, nested stream, and returned final output. DSH uses this manager pattern because the parent must retain the user conversation and final responsibility.
- [A2A](https://github.com/a2aproject/A2A/blob/main/docs/specification.md) separates discovery metadata, transport capability, task lifecycle, streaming updates, and artifacts. DSH keeps its existing `SubagentProvider` execution contract and adopts only the useful discovery principle: routing depends on declared, currently available providers rather than a static UI roster.
- [AutoGen SelectorGroupChat](https://github.com/microsoft/autogen/blob/main/python/packages/autogen-agentchat/src/autogen_agentchat/teams/_group_chat/_selector_group_chat.py) filters candidates before model selection and requires stable participant names and descriptions. Teamwork therefore lists only active Providers and gives each tool a stable, purpose-specific description.
- [CrewAI delegation tools](https://github.com/crewAIInc/crewAI/blob/main/lib/crewai/src/crewai/tools/agent_tools/agent_tools.py) build model-facing coworker descriptions from the available roster and pass an explicit task plus context. DSH already requires a short display description and a standalone prompt, so it extends that existing schema instead of adding another delegation command.

## Architecture

The shared Host remains the only owner of product Provider instances. Codex and Z Code register named implementations on `ctx.subagents`; neither product starts until its tool is called. Each Agent preset owns model-visible access by mounting one `dsh-tool-subagent` instance per external expert.

`dsh-tool-subagent` gains optional `routingGuidance`. The package appends this configured sentence to its provider-derived context, scheduling, and result description. Provider lifecycle still owns registration: absent Provider means absent tool, and re-registration regenerates the complete description.

The shipped `standard`, `ptc`, and `cordis` presets contain active Codex and Z Code tool rows. The rows may exist while Providers do not; they wait on `subagent/provider-added`, disappear on `subagent/provider-removed`, and never grant product access by themselves. `minimal` and `chat` remain intentionally free of delegation tools.

Teamwork resolves its external roster from `ctx.subagents` for every prompt assembly. Its policy names only callable experts, keeps native children as the default lane, and directs independent review to a different available lane. A delegated native child belongs to the same Teamwork owner for concurrency accounting, so nested escalation cannot bypass the five-worker limit.

## Hot-plug and failure behavior

Provider installation and authentication remain deployment responsibilities. A missing Provider produces no model-visible tool; a present but unauthenticated Provider fails only when called and returns the existing provider diagnostic. Disabling Teamwork removes its planning policy and panel but does not remove independently enabled expert Providers or their preset-owned tools.

Tool names and Provider names stay static configuration facts. The model cannot select arbitrary Provider ids, permission modes, executable paths, or credentials. Codex and Z Code remain one-shot external runs, while native spawn and fork children keep their existing continuable behavior.

## Verification

Focused tests cover routing guidance across Provider add/remove, active expert rows in all tool-bearing shipped presets, omission from minimal/chat, Teamwork roster changes, and nested-child concurrency. Package type checks and bundles verify the published faces. A real Web session verifies the current tool roster, one native delegation, one external delegation, Teamwork routing, and live Provider disable/enable without restarting the running DSH process.
