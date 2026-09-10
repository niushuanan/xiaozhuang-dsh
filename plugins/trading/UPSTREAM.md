# Trading source and license

The trading implementation derives from [zhu1090093659/dsh-trading](https://github.com/zhu1090093659/dsh-trading), package version 0.2.0, retrieved from its main branch on 2026-09-10. Copyright (c) 2026 zhu1090093659. The original [PolyForm Noncommercial License 1.0.0](LICENSE) accompanies these sources. Integrating or modifying these files does not relicense them as MIT. Personal noncommercial use is the intended scope of this integration; commercial use requires the upstream author's written permission.

## Owned source

`packages/` contains 44 trading packages: the common services, four market bundles, connectors, research skills, watchlist, indicators, strategies, knowledge, holdings, trading UI and settings. Package names retain the upstream `@dshtrading/` identity. The enclosing native bundle is private and builds with the host repository. No separate npm package, repository or release is produced by this integration.

## Integration changes

- Host dependencies resolve to Xiaozhuang DSH's local workspace packages. The integration does not install another version of DSH.
- The native patch includes trading services and markets. It excludes the upstream updater, IM bot, session archive, usage manager, plugin manager, model capability manager, extra language pack and default-role replacement.
- An optional Trading workspace uses the existing sidebar, settings, conversation drafts and attachment APIs. The upstream global shell replacement is not mounted.
- Trading files live under the host DSH Home's `trading` subdirectory. Startup does not migrate or overwrite user data. Four namespaced, built-in role presets are registered additively.
- Three upstream stock-market risk checklist files contain path placeholders; this integration supplies local execution checklists without fixed regulatory thresholds.
- Local compatibility covers persona configuration, permission commands, tool-result presentations and browser service types. Simulated order defaults and live execution approvals are retained.

## Maintenance

Source updates are reviewed inside this directory and validated against the existing product before the integrated repository is released. Preserve upstream notices and this integration description when updating. Remove the directory to remove trading from native discovery and builds; user trading data is retained.
