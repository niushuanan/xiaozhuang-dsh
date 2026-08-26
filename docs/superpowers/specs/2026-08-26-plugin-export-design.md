# Selective Plugin Export Design

English | [中文](2026-08-26-plugin-export-design.zh.md)

## Product contract

Plugin export belongs to the existing **小庄的插件** page. It is a catalog action rather than another exported plugin, so the page gains an **导出插件** action and stays the only place a user manages these capabilities.

The action enters selection mode in the current list. Every exportable row gains a checkbox; **全选 14 个** always means every Xiaozhuang capability in the catalog, independent of search and enabled state. The toolbar shows the selected count, supports cancel, and disables export until at least one item is selected. Runtime switches are unavailable while selecting, preventing an export gesture from changing the running product.

## Archive contract

One click downloads `xiaozhuang-dsh-plugins-<timestamp>.zip`. The archive contains:

- `README.md` for a person who receives the archive;
- `AGENTS.md` and `INSTALL.md` for the installing AI;
- `manifest.json` with the source commit, selected catalog entries, Cordis rows, package roots, exclusions, and file hashes;
- `payload/<plugin-id>/...` with the selected source and ready-to-run build artifacts.

The Host resolves a closed catalog from plugin ids. The browser never submits filesystem paths. Repository packages contribute source, manifests, built JavaScript, and only runtime assets; local profile packages contribute their code but exclude `node_modules`, Git metadata, tests, caches, credentials, histories, and user data. The exporter builds the ZIP in memory, so it leaves no retained staging copy on the computer.

## AI installation and conflict fallback

The installing AI first inspects the target DSH checkout, its instructions, version, and dirty state. It installs each selected package and Cordis row narrowly, preserves the target's data and settings, and runs only checks that cover the installed capabilities. It must not overwrite the checkout or DSH Home wholesale.

When package layout or shared composition differs, the AI may adapt paths, imports, package manifests, slots, and row configuration to the target version. It must preserve the manifest's user-visible behavior, record every adaptation, and stop with a clear report if a safe merge is impossible. Destructive reset, credential copying, history replacement, and deletion of unrelated plugins are forbidden.

## Ownership

`ui-plugin-catalog` is one native Host-and-Client Cordis package. The Host owns state toggles, collaborator configuration, the loopback export endpoint, catalog validation, file collection, and ZIP construction. The Client contributes the existing **小庄的插件** settings section and owns search, selection, progress, download, and feedback. The package is mounted by the Web bundle; it is deliberately absent from its own export catalog.
