# Selective Plugin Export Implementation Plan

English | [中文](2026-08-26-plugin-export.zh.md)

**Goal:** Make every cataloged Xiaozhuang plugin selectively exportable as one AI-installable ZIP from the existing plugin page.

**Spec:** [`docs/superpowers/specs/2026-08-26-plugin-export-design.md`](../specs/2026-08-26-plugin-export-design.md)

## 1. Establish the native package and contracts

Add focused Host tests for a closed selection catalog, repository/profile file exclusions, manifest hashes, installation instructions, and a real unzip round trip. Add Client tests for entering selection, selecting one, selecting all regardless of search, cancelling, and starting a browser download. Confirm they fail before implementation.

## 2. Implement Host export and existing plugin controls

Create `packages/client/ui-plugin-catalog/`. Move the existing local state-toggle and collaborator-configuration behavior into its Host half. Add a loopback-only `POST /plugins/xiaozhuang-plugins/api/export` route that validates ids, collects bounded package files, creates the manifest and AI instructions, and returns an in-memory ZIP without staging data on disk.

## 3. Implement the native catalog UI

Port the existing grouped searchable catalog to React and CSS Modules. Add the hero export action, inline selection controls, explicit all-catalog semantics, selected count, download progress, cancellation, and success/error feedback. Keep plugin switches unchanged outside selection mode.

## 4. Compose, document, and verify

Mount the package in the Web bundle and TypeScript graph; update package/root bilingual READMEs, the implemented Agent Note, pairing records, and `PROJECT_CONTEXT.md`. Build the package and Web UI, run the focused tests, then use the real local plugin page to export one plugin and all plugins. Inspect both ZIPs for required files and excluded private/runtime data before committing and pushing the current branch.
