# Xiaozhuang plugin catalog UI

English | [中文](README.zh.md)

`@deepseek-ai/dsh-client-ui-plugin-catalog` owns the native **小庄的插件** Settings page. Its Host half projects the selected Loader rows, atomically persists live enablement in the Web Profile's bounded switch block, retains the collaborator configuration API used by Teamwork, and serves selective plugin export. Its Client half owns the grouped search catalog, capsule switches, inline export selection, browser download, and user feedback.

## Selective export

**导出插件** enters selection in the current catalog. Users can choose rows individually or select all 16 cataloged capabilities. Select all is independent of search and runtime enablement: an installed but disabled capability remains exportable. The catalog package is infrastructure for the list and is not included in its own export choices. **纯聊天** exports its native UI package, internal no-Tool preset, and the directly extended sidebar, Session runtime, Workspace, conversation, preset, and icon sources as one installable capability. **命令、插件与技能** and **Skill** export their native package sources so another DSH can restore the unified composer directory and Skill library as ordinary Cordis rows.

`POST /plugins/xiaozhuang-plugins/api/export` accepts only catalog ids from a loopback, same-origin page. The Host maps those ids to a closed set of repository or Web Profile package roots. It includes source, package manifests, built JavaScript, and package-declared runtime assets; it excludes `node_modules`, Git metadata, tests, caches, credentials, local settings, sessions, and conversation history. The ZIP is built in memory and no retained staging archive is written.

Every archive includes `README.md`, `AGENTS.md`, `INSTALL.md`, `manifest.json`, and `payload/<plugin-id>/...`. The manifest records the source commit, package sources, Cordis rows, file sizes, and SHA-256 hashes. The installation instructions tell an AI to merge narrowly into the target DSH version, preserve user data and existing changes, adapt only conflicting plugin integration when direct installation fails, record adaptations, and stop cleanly rather than leave an enabled half-installation.

Repository packages include only assets named by their package `files` manifest. This keeps the current Whale Girl runtime frames while excluding superseded source and animation generations, so selecting all plugins does not copy hundreds of megabytes of development material.

## Composition

The Web bundle mounts `xiaozhuang-plugins` before other Settings contributors. The package requires Loader and WebServer on the Host, and Settings slots plus shared primitives on the Client. Live switches continue to use the fixed `# xiaozhuang-plugin-switches:start` / `:end` block, so existing user choices survive the native-package migration.

## Model Experience

### Catalog and archive generation

#### What the model sees

Nothing in the current DSH Session. The exported `AGENTS.md` and `INSTALL.md` are archive instructions for an installation AI on the receiving machine, not prompt content for this product instance.

#### Token effect

Catalog browsing, switches, and ZIP generation make no model request and consume no model tokens.

#### KV Cache effect

These local Settings and archive operations do not change conversation prompts, so they have no cache effect.

## Known Limitations and Deferred Work

- Export is synchronous and browser-local; the page does not keep a server-side export history.
- The closed export catalog deliberately excludes unknown third-party Loader rows until their source and private-data boundaries are reviewed.
