# Agent Note: Export selected Xiaozhuang plugins as AI-installable archives

Status: implemented

English | [中文](2026-08-26-selective-plugin-export.zh.md)

## Problem

Xiaozhuang DSH presents a curated plugin catalog, but a user who wants the same capability in another DSH installation has to locate package code, infer composition rows, avoid local account state, and reconcile whichever breaking upstream version the target uses. A repository archive is too broad for one plugin, while copying a local Profile folder can include dependencies or omit native source. The transfer unit needs to be selective, understandable by an installing AI, and bounded enough that exporting all capabilities does not duplicate development caches or old media generations.

## Decision

The existing **小庄的插件** page owns export as a catalog action. **导出插件** changes the list into inline selection; users may select rows individually or select all 15 capabilities. Select all means the complete exportable catalog regardless of search and enabled state. Runtime switches disappear during selection, and the catalog infrastructure package never exports itself.

The native `ui-plugin-catalog` Host accepts only catalog ids at its loopback same-origin endpoint. Each id maps to explicit repository or Profile package roots and the Cordis rows that install the capability. Repository packages contribute source, built code, manifests, and only assets admitted by their package `files` field. Profile packages contribute their portable code. The collector rejects path escape and excludes dependencies, Git metadata, tests, caches, credentials, settings, sessions, and histories. It creates the ZIP in memory and leaves no staging archive behind.

Each archive carries human and Agent instructions, a machine-readable manifest, SHA-256 for every payload file, and per-plugin payload roots. The installing AI merges packages and rows into the target rather than replacing its checkout or Profile. If direct installation conflicts with a newer DSH layout, the AI may adapt plugin paths, imports, manifests, Slots, and Cordis rows narrowly, must preserve the manifest's user behavior and target data, and records every adaptation. An unsafe merge stops without an enabled half-installation.

## Alternatives considered

**Export the full repository for every request.** This guarantees dependency availability but defeats per-plugin selection, produces a much larger transfer, and asks the installer to distinguish product code from unrelated upstream code.

**Export only compiled local Profile folders.** This is quick for the out-of-tree plugins but omits TypeScript needed to adapt native packages after breaking upstream changes and cannot represent bundle-owned composition reliably.

**Ship a deterministic one-click installer.** A fixed installer would be faster on one known commit, but early DSH releases change package layouts and extension contracts frequently. The archive provides deterministic facts and a direct path first, while explicitly delegating version-specific conflict resolution to the installing AI.

**Store generated archives for later reuse.** Caching avoids repeating compression but makes storage grow across selections and versions. In-memory generation keeps the only persistent copy under the user's browser download control.

## Consequences

Users can transfer one, several, or all catalog capabilities from the page they already use. The archive is inspectable, versioned by source commit, and gives an AI both installable JavaScript and adaptation source without carrying private runtime state. Runtime-asset allowlists keep the all-plugin export materially smaller than the repository's development tree.

Installation is not guaranteed to be a zero-edit operation on arbitrary future DSH commits. Its guarantee is instead a complete bounded input, explicit conflict authority, preserved user data, recorded adaptations, and a clean stop when compatibility cannot be established. Adding a new catalog capability now requires one export definition that names its package roots and composition rows.
