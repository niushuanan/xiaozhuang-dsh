# Native trading integration

The user requests integrating dsh-trading into the existing Xiaozhuang DSH product and its normal commit/push delivery, without a separate plugin distribution. The user confirms personal noncommercial use and retention of the upstream PolyForm Noncommercial license.

## Product design

Keep the existing workbench as the landing experience. Add a Trading entry which opens the market workspace and can return to the existing conversation. Reuse upstream watchlists, charts, research, strategies, knowledge, holdings, connectors and simulated execution; use the existing session input to send market context to the agent. Live-order approval remains intact, and acceptance does not place real orders.

Own all trading code, assets, presets and direct trading dependencies in `plugins/trading/`. Reuse host services and published extension points instead of installing another DSH runtime. Do not mount the upstream updater, plugin manager, usage manager, archive manager, IM bot or default-master override. Preserve the root MIT license and separately identify the upstream noncommercial code.

## Implementation and acceptance

- [x] Import upstream trading source and license into the native directory; resolve its internal packages and build against local DSH services. Verify discovery and dependency resolution.
- [x] Adapt host composition, preset registration and trading data paths. Verify the unchanged ordinary preset and file ownership, and run upstream focused tests for the approval and data paths.
- [x] Adapt the browser entry and layout, retaining existing history, workbench, settings and draft state. Verify opening/closing Trading and filling the current composer.
- [x] Run relevant builds and real browser checks in an isolated DSH profile. Check charts, market switching, watchlist persistence, research handoff and return to chat; report unavailable external providers honestly.
- [x] Update root bilingual product documentation, provenance, the Agent Note and PROJECT_CONTEXT. Commit only this task's files, push the main repository, and verify remote file contents without hash comparisons.

## Runtime and scope

The running 3080 process must not be restarted without explicit permission. The current working tree contains pre-existing changes and many untracked remnants; these are excluded from this task. No separate trading repository, release or plugin export is created. No hash comparison is used.
