# Agent Note: Local browser entry without launch tokens

Status: implemented

English | [中文](2026-10-06-local-browser-entry.zh.md)

## Problem

A personal desktop window stops at a launch-token form when its browser cookie expires or Safari omits the saved cookie. Recovering an ordinary local application requires finding a credential in a background service log.

## Decision

Connection opens loopback URLs without a token. A root GET establishes or renews the existing signed browser cookie only when the direct TCP peer is loopback and the existing Host/Origin/Fetch-Metadata checks accept a loopback authority. The response redirects to the clean root. Neither forwarded headers nor a loopback Host supplied by a remote peer grants local entry. API requests and WebSocket upgrades continue to require the cookie and browser request checks.

Non-loopback authorities retain their process-token exchange. This partially supersedes local session establishment in [browser token authentication](2026-08-24-browser-token-authentication.md) and local recovery in [Safari history recovery](../bug-fix/2026-09-05-safari-agent-history-json.md). Both remain active for their remote authentication, cookie validation, and history-reading decisions.

## Alternatives considered

**Extend the cookie lifetime.** A later expiration, cleared browser data, or omitted cookie still leaves the same manual recovery step.

**Remove all API authentication.** Automatic local browser entry can reuse the existing cookie flow while preserving uniform API and WebSocket verification.

## Consequences

Processes on the local machine can establish a browser session without possessing the startup log. A local proxy or tunnel is also a local peer; this personal application must not be exposed through an untrusted local forwarder. Clearing cookies does not lock out local access: opening the root establishes a new session. The service remains loopback-bound and adds no network deployment mode.

Verification covers first local entry, expiration and renewal, obsolete launch links, remote and cross-site rejection, the assembled frontend, and the real source CLI before and after restart. Desktop acceptance covers opening, refreshing, quitting, reopening, and reading existing conversations without token entry.
