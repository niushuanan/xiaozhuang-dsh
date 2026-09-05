# Agent Note: Safari Agent history JSON recognition

Status: implemented

English | [中文](2026-09-05-safari-agent-history-json.zh.md)

## Problem

The Safari desktop application showed only initial user/context rows or an empty conversation while Chromium rendered the same stored history. Its WebSocket opened successfully, but the Session event subscriber threw `Assistant stream raw chunk must be a lossless JSON object`. The shared JSON validator required V8's single-line native constructor text; WebKit emits newlines. Legitimate assistant chunks therefore failed validation before subsequent answers and tool results reached the view. An obsolete desktop page and a plain-text 401 after refresh obscured this separate replay failure.

## Decision

[`hasIntrinsicConstructor`](../../../../packages/util/values/src/index.ts) compares the candidate's native representation with the executing engine's intrinsic Object or Array representation. Name and prototype ownership checks remain required. The fix applies to the shared JSON reader, not individual sessions or product plugins, and changes no durable event or original file.

Connection supplies a same-origin token form in its unauthorized HTML, retaining HTTP 401, bodyless HEAD, existing signed-cookie validation and the root token exchange. Frontend-static serves index HTML with `no-store` and adds an authenticated activation-timestamp probe. A page-owned notice offers an explicit reload after restart or expired login; it does not auto-reload, clear drafts, or certify stream health.

## Alternatives considered

**Rewrite or reimport histories.** The original answers and results are intact. Rewriting data cannot repair an engine-specific validator and risks duplicate or changed conversations.

**Skip invalid assistant chunks.** This hides the common failure and deliberately discards answers. Strict JSON validation stays in place.

**Accept a Chromium-only check.** The reported failure occurs in the user's Safari Web App. Acceptance includes that application, opened tool outputs, older-page loading and a historical subagent report, not merely a test browser or HTTP status.

## Consequences

Normal JSON containers remain portable across supported engines and realms; custom classes, forged prototypes and lossy values remain rejected. An engine-format regression reproduces the failure before the fix. A read-only ordered-content audit covers all 327 original/v2 pairs, preserving 7994 assistant messages, 8454 tool calls and 8483 tool results. Actual desktop verification separately establishes readable answers and results. Temporary local diagnostics contain no shipped telemetry and are removed after inspection.
