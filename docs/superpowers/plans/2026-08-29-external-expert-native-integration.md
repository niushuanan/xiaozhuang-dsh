# Native External Expert Integration Implementation Plan

English | [中文](2026-08-29-external-expert-native-integration.zh.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Codex and Z Code callable through DSH's native subagent tools in ordinary Agentic Coding and Teamwork, with Provider-driven hot plugging.

**Architecture:** Product Providers remain Host-owned. Agent presets mount provider-bound `dsh-tool-subagent` consumers, and Teamwork derives its candidate roster and shared concurrency owner from the live subagent registry.

**Tech Stack:** TypeScript, Cordis lifecycle events, Schemastery config, YAML Agent presets, Node test runner, Vitest.

**Spec:** [`docs/superpowers/specs/2026-08-29-external-expert-native-integration-design.md`](../specs/2026-08-29-external-expert-native-integration-design.md)

## Global Constraints

- Keep Provider instances on the shared Host and model-visible tools inside Agent presets.
- Keep native `subagent` and `subagent_fork` as the default Teamwork route.
- Do not expose credentials, executable paths, permission modes, or dynamic Provider selection to the model.
- Preserve hot removal: an absent Provider must mean an absent tool.
- Do not restart the running local DSH process.

---

### Task 1: Provider-specific routing guidance

**Files:**
- Modify: `packages/subagent/tool-subagent/src/index.ts`
- Test: `packages/subagent/tool-subagent/tests/tool-subagent.spec.ts`
- Modify: `packages/subagent/tool-subagent/README.md`
- Modify: `packages/subagent/tool-subagent/README.zh.md`

**Interfaces:**
- Consumes: `Config.provider`, `Config.toolName`, and `SubagentProvider.inheritsParentContext`.
- Produces: optional `Config.routingGuidance: string` appended to the generated tool description on each Provider mount.

- [ ] Write a test that mounts a Provider with `routingGuidance`, verifies the sentence in the tool schema, removes the Provider, re-adds it, and verifies the regenerated description.
- [ ] Run `pnpm vitest run packages/subagent/tool-subagent/tests/tool-subagent.spec.ts` and confirm the assertion fails because the sentence is absent.
- [ ] Add the typed config field, Schemastery parser entry, and description composition without changing prompt-parameter or execution semantics.
- [ ] Re-run the focused test and the package type check.
- [ ] Update the bilingual package reference and pairing record.

### Task 2: Preset-owned expert tools

**Files:**
- Modify: `packages/preset/agent-presets/presets/standard/agent.cordis.yml`
- Modify: `packages/preset/agent-presets/presets/ptc/agent.cordis.yml`
- Modify: `packages/preset/agent-presets/presets/cordis/agent.cordis.yml`
- Test: `packages/preset/agent-presets/tests/shipped-root.spec.ts`

**Interfaces:**
- Consumes: Host Provider names `codex` and `zcode`.
- Produces: model tools `subagent_codex` and `subagent_zcode` with one-shot background support and provider-managed depth.

- [ ] Write a shipped-preset test that requires active, uniquely named Codex and Z Code rows with routing guidance in `standard`, `ptc`, and `cordis`, and confirms `minimal` and `chat` do not contain them.
- [ ] Run the focused preset test and confirm it fails on disabled or missing rows.
- [ ] Enable Codex rows, add Z Code rows, and keep Claude Code opt-in.
- [ ] Re-run the focused test and preset package type check.

### Task 3: Teamwork dynamic roster and shared owner

**Files:**
- Modify: `$DSH_HOME/profiles/web/packages/team-work/lib/index.js`
- Test: `$DSH_HOME/profiles/web/packages/team-work/test/external-agents.test.mjs`
- Test: `$DSH_HOME/profiles/web/packages/team-work/test/plan-mode-lifecycle.test.mjs`

**Interfaces:**
- Consumes: `ctx.subagents.getProvider(name)` and `ctx.agents.isOwnedBy(childId, parent)`.
- Produces: a per-assembly callable expert list and one Teamwork owner id for native and external concurrency accounting.

- [ ] Extend the profile tests to require active-only expert guidance and to prove a nested native child consumes the root Teamwork concurrency budget.
- [ ] Run the profile Node tests and confirm the new expectations fail.
- [ ] Generate Teamwork policy from the live Provider roster and resolve nested callers to their Teamwork owner.
- [ ] Re-run all Teamwork profile tests.

### Task 4: Distribution and durable design record

**Files:**
- Modify: `packages/client/ui-plugin-catalog/src/catalog.ts`
- Modify: `README.md`
- Modify: `README.zh.md`
- Modify: `README.i18n.yaml`
- Create: `.agents/notes/implemented/feature/2026-08-29-native-external-expert-routing.md`
- Create: `.agents/notes/implemented/feature/2026-08-29-native-external-expert-routing.zh.md`
- Create: `.agents/notes/implemented/feature/2026-08-29-native-external-expert-routing.i18n.yaml`
- Modify: `PROJECT_CONTEXT.md`

**Interfaces:**
- Consumes: the Teamwork export catalog and root product capability summary.
- Produces: an installable source closure containing the preset-owned tool grants and a current architecture decision.

- [ ] Add the three tool-bearing preset directories to the Teamwork export sources and add a catalog regression.
- [ ] Update root bilingual product prose, the implemented Agent Note, and `PROJECT_CONTEXT.md`.
- [ ] Re-record all changed bilingual pairs and run focused documentation checks.

### Task 5: Product verification and publication

**Files:**
- Verify: changed source, package builds, Web composition, and generated independent repository payload.

**Interfaces:**
- Consumes: the completed implementation and the running authenticated Web profile.
- Produces: verified main and `dsh-teamwork` commits whose remote `master` refs match local commits.

- [ ] Run focused subagent, preset, Teamwork, catalog, type, bundle, documentation, and diff checks.
- [ ] Verify the live tool roster and Provider hot disable/enable without restarting DSH; run one external delegation when the configured product is authenticated.
- [ ] Update plan checkboxes and commit the scoped main-repository changes.
- [ ] Push `origin/master`, regenerate `dsh-teamwork` from the pushed commit, push its `master`, and verify both remote refs.
