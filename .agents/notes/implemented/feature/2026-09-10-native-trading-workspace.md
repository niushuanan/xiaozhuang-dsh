# Agent Note: Native trading workspace

Status: implemented

## Problem

The integrated product needs trading research without a separate plugin installation or a second application shell. Upstream trading targets a newer DSH API and owns defaults and data paths that conflict with the existing workbench.

## Decision

[Trading](../../../../plugins/trading/README.md) owns its source, build, assets and Cordis patch in one native product directory. The sidebar opens a trading workspace inside the existing Web application. Settings and conversation drafts use the host APIs; sending a chart to the Agent appends to the draft and returns to the conversation without submitting a message.

Four optional trading roles supplement the existing presets. Trading storage stays in the active DSH Home's `trading` directory. Default presets, model settings and existing conversations retain their owners. The integration adapts role loading, command execution, attachments and tool-result cards to the local DSH version.

The [upstream license and attribution](../../../../plugins/trading/UPSTREAM.md) remain with the source. The trading component uses PolyForm Noncommercial 1.0.0 and is intended for personal noncommercial use. It is shipped with the integrated repository and has no separate distribution repository.

## Alternatives considered

**Install the upstream product bundle unchanged.** Its shell replacement, default-role override, management plugins and newer host assumptions interfere with the existing product. The integration selects the trading capabilities and retains the local host.

**Copy trading code into core packages.** This would tie the host to a specific product capability and break folder-level removal. Source and runtime assets instead stay in the native trading directory.

## Consequences

Trading research shares the user's conversation and workspace flow. Removing the trading directory removes its discovery and composition while retaining user data. Provider credentials and network availability still determine access to external data. Simulated execution remains the default, and real execution retains explicit approval; live orders are outside integration acceptance.

## Testing

The owned source tests cover market research, strategy and knowledge views, role resources, command dispatch and draft attachments. Native builds and isolated Web acceptance exercise sidebar entry and return, market charts, watchlists, settings, roles and draft handoff without modifying the running product's DSH Home.
