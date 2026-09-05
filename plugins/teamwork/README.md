# Teamwork

English | [中文](README.zh.md)

The plugin owns its original teamwork icon in Settings; its icon contribution is removed with the plugin.

Teamwork owns the independent collaboration switch, plan-first workflow, concurrency limit, and optional external experts. Its Cordis patch, Host and Client packages, assets, and build script live in this directory.

The plugin declares historical `teamwork/state` compatibility for Session formats v0 through v2. Only the exact `{ active: boolean }` payload is accepted: it contains no sequence references or lifecycle dependencies. Migration preserves the switch and event order, adds `ignorable: true`, and writes through the standard immutable successor mechanism. Original Session generations remain unchanged. After the first successful migration, the current successor is readable with this plugin removed. An unmarked v0/v1 source still needs the plugin for its first migration; an absent plugin cannot classify an unknown required historical event safely.

The declaration registers through a disposable Cordis effect and checks the migration API's availability, so builds without the new optional API retain the plugin's ordinary runtime behavior. The plugin does not import another product plugin. Run its source compatibility checks with `node --import tsx/esm --test plugins/teamwork/packages/team-work/test/session-history.test.mjs` from the product root.
