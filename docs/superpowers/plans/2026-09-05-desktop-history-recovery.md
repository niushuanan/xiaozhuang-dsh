# Desktop history recovery implementation plan

English | [中文](2026-09-05-desktop-history-recovery.zh.md)

> Execute inline using systematic debugging, test-driven development and verification-before-completion. The user authorizes repair, restart, commit and push; preserve unrelated changes and every original session generation.

**Goal:** Restore complete Agent history in the user's actual Safari desktop application and prevent a stale page from silently presenting incomplete history after an upgrade.

**Evidence:** The reported session retains 33 assistant messages, 41 tool calls and 44 tool results in both original and v2 files. Chromium renders them. The actual Safari Web App still has the old title and only initial input/context rows; refreshing reaches an unauthenticated plain-text dead end. The current static index response has no explicit cache control.

**Architecture:** Keep session data unchanged. The existing Connection owner supplies an authenticated recovery form. The existing frontend-static plugin prevents HTML caching and supplies a lightweight restart check, with a user-controlled reload action. Neither behavior depends on a product plugin folder or changes Agent execution.

**Confirmed replay cause:** The fresh Safari page opens its WebSocket but rejects normal assistant chunks because util-values requires V8's single-line native constructor representation. Compare against the executing engine's intrinsic representation instead. The browser-format test fails before the fix and passes after it. Actual Safari verification restores the reported four-turn conversation, expanded Bash output, a five-turn/108-step historical review, older-page loading, and its child Agent report. Original data stays untouched.

## Tasks

- [x] Audit every original/v2 pair by ordered message content, tool-call arguments and tool-result content; record aggregate evidence privately without hashing or writing session files.
- [x] Add failing HTTP tests to `packages/client/connection/tests/browser-auth.host.spec.ts` and `packages/host/frontend-static/tests/frontend-static.spec.ts` for recovery and fresh index responses.
- [x] Implement the same-origin token form in Connection, without changing cookie validation or exposing tokens in responses. Keep HEAD bodyless and unauthorized requests at 401.
- [x] Add a no-store index response and authenticated runtime-start check in frontend-static. Show a reload notice on a different runtime or expired login; do not reload automatically or mutate drafts/history. Verify the emitted script against real DOM and simulated network outcomes.
- [x] Run focused tests, type checks and builds. Restart the existing idle LaunchAgent after warning; authenticate and inspect the actual Safari desktop app, not just the test browser. Verify answers and opened tool results in the reported conversation plus other Agent and imported conversations, including refresh.
- Release sequence: update paired package/root documentation and PROJECT_CONTEXT; obtain independent review, commit this task only, push master and synchronize the affected chat-migration mirror from the pushed commit. Remove only this task's temporary publishing copies.
