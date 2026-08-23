# Agent Note: Publish Xiaozhuang DSH as a plugin-enhanced community distribution

Status: implemented

English | [中文](2026-08-24-xiaozhuang-community-distribution.zh.md)

## Problem

The public `xiaozhuang-dsh` repository carried native Computer Use, provider usage, live session, external-agent, and worktree enhancements, but its root README still described only the upstream DeepSeek Harness project. A reader could not distinguish the community distribution from the upstream release, identify which additions were actually included, or obtain built Web and package artifacts without running the complete repository build.

The repository must preserve upstream attribution and package ownership. Publishing the modified package graph under the upstream npm scope would imply an official release and require a separate version sequence for every package. Bundling local profiles, credentials, account state, or `node_modules` would make the artifact unsafe or machine-specific.

## Decision

The public repository identifies itself as Xiaozhuang DSH, an independent plugin-enhanced distribution built on DeepSeek Harness. The README links the upstream project, keeps the MIT attribution, lists only capabilities present in the repository, and gives separate release-bundle and Git checkout paths.

Community releases use `xiaozhuang-v*` Git tags and GitHub Releases rather than the upstream `dsh-v*` npm sequence. Each release attaches one `xiaozhuang-dsh-v*-prebuilt-source.tar.gz` archive and a SHA-256 checksum. The archive contains the tagged source tree plus the official-profile Host, Client, and Web build artifacts. It excludes `.git`, `node_modules`, local DSH state, credentials, caches, worktrees, test output, and release staging files. Users still install the locked dependencies on their own platform before launching `pnpm dsh web`.

This is a distributable source checkout, not a managed installer. The [source-run decision](../simplification/2026-08-10-source-run-without-managed-installer.md) remains active: the repository does not own atomic upgrades, rollback state, credential setup, or migration of an existing local profile.

## Alternatives considered

**Publish every modified package to npm.** This would provide the shortest install command, but the package names remain in the upstream `@deepseek-ai` scope and the repository modifies a large dependency graph. A community npm fork needs new ownership, names, coordinated versions, and a migration plan before it can represent those packages honestly.

**Rely on GitHub's automatic source archive.** The archive is safe and reproducible, but it omits ignored `lib/` and Web `dist/` output. Every downloader would have to run the full official build before first launch, which defeats the requested direct-download path.

**Attach `node_modules` or a machine image.** This removes dependency installation but multiplies artifact size, captures platform-specific native packages, and risks including local state. The prebuilt-source archive keeps generated application code while letting the lockfile select native dependencies for the downloader's platform.

## Consequences

Readers can identify the distribution, inspect its additions, and download one versioned archive with a checksum. A release bundle skips the repository build but still requires a supported Node.js runtime, Corepack, and dependency installation. Model credentials, ChatGPT or Codex login, macOS permissions, browser-extension pairing, and any optional local plugin remain per-machine setup.

The community release version does not change package manifests or claim npm compatibility with a Xiaozhuang version. Future releases update the README asset name, build from the release commit, verify the extracted checkout, and publish a new `xiaozhuang-v*` tag. Upstream synchronization continues through the separate `origin` remote.
