# Agent Note: Native Computer Use and browser bridge

Status: implemented

English | [中文](2026-08-21-native-computer-use-and-browser-bridge.zh.md)

## Problem

Desktop control and browser automation need to behave as DeepSeek Harness capabilities rather than external MCP configuration pasted by each user. Globally publishing every action would charge unrelated conversations for tool schemas, while controlling an existing Chrome profile without an explicit authorization step would violate the user's ownership of login state.

## Decision

`@deepseek-ai/dsh-computer-use` owns one native runtime with three providers: Qwen Open Computer Use for macOS applications, Playwright contexts for clean browser work, and an unpacked DSH Browser Bridge extension for the user's existing Chrome profile. `/computer` and `/browser [isolated|real]` register only their tool family in the receiving Agent scope, then append a task-specific steering message. The Web bundle composes the Host runtime and `@deepseek-ai/dsh-client-ui-computer-use`; Settings and tool rows are therefore plugin registrations rather than shell conditionals.

## Provider ownership

Qwen's nine wire tools use stable DSH `computer_*` names. DSH narrows `computer_click` to an accessibility `element_index`; global coordinates remain only on the explicit drag fallback. For click, secondary action, indexed scroll, and set-value, the runtime captures the target's accessibility ID or exact signature from the planning snapshot, serializes all desktop calls, fetches the application's live tree immediately before execution, and resolves the current index again. A moved, hidden, or minimized window therefore remains attached to its semantic target instead of leaving the action at an obsolete screen coordinate. Ambiguous or missing targets fail closed and require a fresh inspection. A single desktop lease belongs to the calling Session until `turn/end`, when DSH sends `notifications/turn-ended` and releases it. Native permission status uses one in-flight probe and one Host-lifetime result; starting or completing permission setup invalidates that result so the next Settings refresh probes exactly once. Playwright owns one non-persistent browser context per Session and closes it with that Session. The Chrome bridge tracks controlled tabs separately from DSH-created tabs: session cleanup closes only created tabs, never a user's adopted existing tab.

## Bridge authorization

The Host copies versioned extension assets to `<DSH_HOME>/browser-bridge-extension` and persists a random pairing secret at `<DSH_HOME>/computer-use/bridge-token` with mode `0600`. The active Web server owns the exact upgrade route; it accepts only a `chrome-extension://` origin and requires the secret in the first message. Status, permission setup, and extension-folder routes require a loopback peer. One authenticated extension connection is active at a time, and replacing it rejects pending requests from the older connection.

## Visual results

Every browser action returns a bounded DOM snapshot; Qwen returns its accessibility state. A screenshot is persisted as a normal DSH attachment only when the active model route explicitly declares image input, so text-only routes keep a valid continuation while native vision routes receive the same visual state used for the action. The connected Chrome bridge downscales high-resolution visible-tab screenshots to a 1600px maximum side. Capture or resizing failures preserve the DOM result, so an optional visual attachment cannot fail the whole browser action.

## Conversation browser workspace

The conversation skeleton exposes the single-occupancy `conversation.session.workspace` seam. Computer Use registers a full-height browser workspace there and a deliberate `Browser` trigger in session header utilities. Wide containers keep conversation and browser side by side with a draggable divider; narrow containers use a right overlay without reflowing the conversation into a thin column. Every mounted workspace polls only its current Session's lightweight state so active browser work can open automatically; native permission polling starts only while that workspace is visible. It neither embeds arbitrary sites in an iframe nor creates another provider stack.

Loopback workspace routes reuse the same `BrowserRuntime`. Model tools, address navigation, back/forward/reload, pause/resume, and user point clicks all enter one serialized action path. The latest twelve steps, pause state, DOM summary, and screenshot version are projected per Session. Takeover clicks are normalized to 0–1 screenshot coordinates before Playwright or the Browser Bridge maps them onto the actual visible surface. Session disposal clears its browser context, DSH-created Chrome tab, and projection together.

## Alternatives considered

**Configure the upstream Qwen MCP package directly.** This exposes implementation vocabulary, produces qualified MCP tool names, cannot register tools only after a slash command, and provides no DSH Settings or result presentation.

**Use one persistent Playwright profile for every task.** It mixes login and browser state across Sessions and weakens reproducibility. Clean contexts are the default; existing login state requires the separate user-paired bridge.

**Attach Chrome through its debugging port.** Launch flags and remote debugging expose a broader browser-control boundary and do not provide a product-visible authorization step. The extension limits access to the browser profile where the user explicitly loaded and paired DSH.

## Consequences

Ordinary conversations pay no Computer Use schema cost, while a command-activated Agent can continue with the same tools over follow-up turns. The `browserEnabled` preference gates both `/browser` and the conversation workspace; when disabled, the Host rejects new browser actions. Desktop control requires macOS Accessibility and Screen Recording authorization. Connected Chrome page actions are synthetic and cannot defeat `isTrusted` checks, CAPTCHAs, browser-internal pages, or inaccessible cross-origin frames. The isolated provider remains the deterministic fallback for those sites when login state is unnecessary.

## Verification

The package tests drive system Chrome through a real isolated Playwright context, address an element through both a returned DSH ref and normalized screenshot coordinates, and verify the post-click snapshot, PNG, and step projection. Desktop target regressions verify that a stable accessibility ID follows an element when its numeric index changes and that an ambiguous replacement fails closed. A direct MCP smoke test connects to the bundled Qwen 0.2.3 native runtime and confirms all nine upstream tools. A provider-lifecycle regression proves connected sessions receive a close request at DSH session disposal. The Web component test covers capability switches and browser-source controls. The full library and official Web builds pass. In the live `127.0.0.1:3080` product, the session header opened the browser workspace, its address bar loaded `example.com`, a live screenshot returned, pause/resume and takeover point-click worked, and the source switched from isolated to the paired Chrome provider and back. The authorized Chrome bridge 1.1.0 reconnects automatically.
