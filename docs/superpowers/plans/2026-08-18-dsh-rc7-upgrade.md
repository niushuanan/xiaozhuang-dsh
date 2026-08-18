# DSH rc.7 Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the live local DeepSeek Harness source checkout from rc.5 to rc.7 while preserving local behavior, user data, and both profile plugins.

**Architecture:** Merge official `origin/master` into the existing local `master` because the launcher and local feature commit already depend on that checkout. Protect the pre-upgrade source and profile first, reconcile only the known local surfaces, then validate the assembled application before restarting the single launchd-owned service.

**Tech Stack:** Node.js 24, pnpm 11, TypeScript, Vitest, Cordis, React/Vite, launchd.

**Spec:** `docs/superpowers/specs/2026-08-18-dsh-rc7-upgrade-design.md`

## Global Constraints

- Preserve `/Users/zhuanghongkai/.dsh/sessions`, `attachments`, `storages`, `.env`, uploads, and settings in place.
- Keep `team-work` and `vision-local`; do not replace the source launcher with a clean npm-only installation.
- Do not push any branch or commit to a remote.
- Run only one DSH process against the real profile and data directory.
- Use test-first fixes if the merge or runtime exposes a behavior regression; do not add speculative compatibility shims.

---

### Task 1: Capture rollback state

**Files:**
- Read: `package.json`
- Read: `/Users/zhuanghongkai/.dsh/settings.yaml`
- Copy: `/Users/zhuanghongkai/.dsh/profiles/web/`

**Interfaces:**
- Consumes: current local `master`, current launchd process, current Web profile.
- Produces: one immutable local backup branch and one timestamped profile/settings backup directory.

- [ ] **Step 1: Verify the live checkout and service identity**

```bash
git status --short --branch
git rev-parse HEAD
launchctl print gui/$(id -u)/com.deepseek.harness.web
```

- [ ] **Step 2: Create the source rollback reference**

```bash
git branch backup/pre-rc7-20260818 HEAD
git show-ref --verify refs/heads/backup/pre-rc7-20260818
```

- [ ] **Step 3: Back up settings and the Web profile without copying sessions or attachments**

```bash
mkdir -p /Users/zhuanghongkai/.dsh/backups/rc5-20260818
cp -p /Users/zhuanghongkai/.dsh/settings.yaml /Users/zhuanghongkai/.dsh/backups/rc5-20260818/settings.yaml
cp -R /Users/zhuanghongkai/.dsh/profiles/web /Users/zhuanghongkai/.dsh/backups/rc5-20260818/web
```

- [ ] **Step 4: Verify backup contents and absence of session copies**

```bash
find /Users/zhuanghongkai/.dsh/backups/rc5-20260818 -maxdepth 3 -type f | sort
test ! -e /Users/zhuanghongkai/.dsh/backups/rc5-20260818/sessions
test ! -e /Users/zhuanghongkai/.dsh/backups/rc5-20260818/attachments
```

### Task 2: Merge official rc.7

**Files:**
- Modify: repository files changed by official `origin/master` since `47f9438`
- Resolve: `packages/llm/llm-deepseek/README.i18n.yaml`

**Interfaces:**
- Consumes: official `origin/master` at the live remote SHA and local commits through the design/plan baseline.
- Produces: local `master` containing official rc.7 plus preserved local changes.

- [ ] **Step 1: Fetch and verify the exact upstream release**

```bash
git fetch origin master --tags
git rev-parse origin/master
git show origin/master:package.json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const p=JSON.parse(s);if(p.version!=='0.1.0-rc.7')process.exit(1);console.log(p.version)})"
```

- [ ] **Step 2: Merge upstream while preserving local history**

```bash
git merge --no-ff origin/master
```

Expected: only `packages/llm/llm-deepseek/README.i18n.yaml` may require manual resolution, as shown by the disposable merge rehearsal.

- [ ] **Step 3: Resolve the translation metadata conflict**

Keep rc.7 metadata keys and the local image-attachment wording represented in the paired English and Chinese README files, then stage the resolved file:

```bash
git add packages/llm/llm-deepseek/README.i18n.yaml
git diff --check
git commit
```

- [ ] **Step 4: Confirm version and ancestry**

```bash
node -e "const p=require('./package.json');if(p.version!=='0.1.0-rc.7')process.exit(1);console.log(p.version)"
git merge-base --is-ancestor origin/master HEAD
git log --oneline --decorate -6
```

### Task 3: Reconcile local image and team-work behavior

**Files:**
- Review/modify if required: `packages/host/apiproxy/src/api-proxy.ts`
- Review/modify if required: `packages/host/apiproxy/tests/api-proxy-models.spec.ts`
- Review/modify if required: `packages/llm/llm-deepseek/src/serialize.ts`
- Review/modify if required: `packages/llm/llm-deepseek/tests/serialize.spec.ts`
- Review/modify if required: `packages/client/ui-conversation/src/client/skeleton/ConversationSession.tsx`
- Review/modify if required: `packages/client/ui-conversation/src/client/skeleton/PermissionSelect.tsx`
- Review/modify if required: `/Users/zhuanghongkai/.dsh/profiles/web/packages/team-work/lib/index.js`
- Review/modify if required: `/Users/zhuanghongkai/.dsh/profiles/web/packages/team-work/lib/client.js`
- Review/modify if required: `/Users/zhuanghongkai/.dsh/profiles/web/packages/vision-local/lib/index.js`
- Review/modify if required: `/Users/zhuanghongkai/.dsh/profiles/web/packages/vision-local/lib/client.js`

**Interfaces:**
- Consumes: rc.7 `Agent`, `planMode`, `permissionPresets`, `agentPresets`, `attachments`, `sessionPersistence`, client sessions and slot services.
- Produces: preserved team-work and local-vision behavior on rc.7 without a second workflow or attachment representation.

- [ ] **Step 1: Compare every local API use with rc.7 definitions and assembled profile configuration**

```bash
rg -n "defineTool|readImage|readFrom|permissionPresets|agentPresets|planMode|slots|openSubagent|createDraftImages" packages /Users/zhuanghongkai/.dsh/profiles/web/packages
git diff backup/pre-rc7-20260818..HEAD -- packages/host/apiproxy packages/llm/llm-deepseek packages/client/ui-conversation
```

- [ ] **Step 2: Run existing focused tests before changing behavior**

```bash
pnpm exec vitest run packages/host/apiproxy/tests/api-proxy-models.spec.ts packages/llm/llm-deepseek/tests/serialize.spec.ts
```

- [ ] **Step 3: If a real incompatibility fails, add the smallest regression test and verify RED**

Use the affected existing test file or a profile plugin `test/*.test.mjs` file. The test must exercise the real behavior and fail for the observed rc.7 incompatibility:

```bash
pnpm exec vitest run packages/host/apiproxy/tests/api-proxy-models.spec.ts packages/llm/llm-deepseek/tests/serialize.spec.ts
plugin_tests=$(find /Users/zhuanghongkai/.dsh/profiles/web/packages -path '*/test/*.test.mjs' -type f)
if [ -n "$plugin_tests" ]; then node --test $plugin_tests; fi
```

Expected: FAIL for the observed compatibility break, not for setup or import resolution.

- [ ] **Step 4: Implement only the proven compatibility fix and verify GREEN**

```bash
pnpm exec vitest run packages/host/apiproxy/tests/api-proxy-models.spec.ts packages/llm/llm-deepseek/tests/serialize.spec.ts
plugin_tests=$(find /Users/zhuanghongkai/.dsh/profiles/web/packages -path '*/test/*.test.mjs' -type f)
if [ -n "$plugin_tests" ]; then node --test $plugin_tests; fi
```

Expected: PASS, followed by the focused rc.7 image tests from Step 2 still passing.

### Task 4: Install and verify the assembled source tree

**Files:**
- Generated locally: `node_modules/` workspace links and build outputs ignored by Git.

**Interfaces:**
- Consumes: merged rc.7 lockfile and reconciled local sources.
- Produces: runnable source and built package artifacts for the local launcher.

- [ ] **Step 1: Install the exact lockfile dependencies**

```bash
pnpm install --frozen-lockfile
```

- [ ] **Step 2: Re-run focused image and UI regression tests**

```bash
pnpm exec vitest run packages/host/apiproxy/tests/api-proxy-models.spec.ts packages/llm/llm-deepseek/tests/serialize.spec.ts packages/client/ui-conversation/tests
```

- [ ] **Step 3: Run typecheck and build**

```bash
pnpm run typecheck
pnpm run build
```

- [ ] **Step 4: Run the repository unit suite once on the final tree**

```bash
pnpm run test
```

### Task 5: Restart the single service and perform product acceptance

**Files:**
- Read: `/tmp/dsh-web-autostart.log`
- Read: `/Users/zhuanghongkai/.dsh/sessions/`
- Read/write through product: one new acceptance session and one image attachment.

**Interfaces:**
- Consumes: launchd label `com.deepseek.harness.web`, rc.7 source launcher, existing profile and user data.
- Produces: one rc.7 process on port 3080 with verified text, team-work, subagent navigation, vision, and history paths.

- [ ] **Step 1: Restart through launchd and wait for the actual listener**

```bash
launchctl kickstart -k gui/$(id -u)/com.deepseek.harness.web
lsof -nP -iTCP:3080 -sTCP:LISTEN
curl -fsS http://127.0.0.1:3080/ >/dev/null
```

- [ ] **Step 2: Inspect new boot logs for both local plugins and rc.7 errors**

```bash
tail -n 300 /tmp/dsh-web-autostart.log
```

- [ ] **Step 3: Verify the real browser paths**

Open `http://127.0.0.1:3080` and confirm:

1. Existing sessions load and one pre-upgrade session opens.
2. A new ordinary text prompt completes without HTTP 500.
3. Team Work can be selected; plan-first state activates; the subagent drawer opens and a child session can return to the main session.
4. A known local image can be attached; `image_vision` reads the durable attachment and returns content consistent with the image.

- [ ] **Step 4: Verify one process and durable postconditions**

```bash
lsof -nP -iTCP:3080 -sTCP:LISTEN
launchctl print gui/$(id -u)/com.deepseek.harness.web
git status --short --branch
```

### Task 6: Record and hand off the completed upgrade

**Files:**
- Modify: `PROJECT_CONTEXT.md`
- Modify if compatibility code changed: affected repository sources and tests listed in Task 3.

**Interfaces:**
- Consumes: verified source SHA, plugin changes, test outputs and product acceptance evidence.
- Produces: current project context and a local commit containing the final compatibility state.

- [ ] **Step 1: Reassess project context sections 1-3 and append the rc.7 upgrade record**

Record the exact files, reason, affected modules, test commands, service restart and real product paths in `PROJECT_CONTEXT.md`.

- [ ] **Step 2: Check the complete local diff**

```bash
git status --short
git diff --check
git diff --stat backup/pre-rc7-20260818..HEAD
```

- [ ] **Step 3: Commit only final local compatibility and context changes**

```bash
git add PROJECT_CONTEXT.md \
  packages/host/apiproxy/src/api-proxy.ts \
  packages/host/apiproxy/tests/api-proxy-models.spec.ts \
  packages/llm/llm-deepseek/src/serialize.ts \
  packages/llm/llm-deepseek/tests/serialize.spec.ts \
  packages/client/ui-conversation/src/client/skeleton/ConversationSession.tsx \
  packages/client/ui-conversation/src/client/skeleton/PermissionSelect.tsx
git commit -m "chore: upgrade local DSH to rc7"
```

- [ ] **Step 4: Run final verification on the committed tree**

```bash
pnpm exec vitest run packages/host/apiproxy/tests/api-proxy-models.spec.ts packages/llm/llm-deepseek/tests/serialize.spec.ts
pnpm run typecheck
git status --short --branch
```
