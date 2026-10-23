---
kind: upgrade-guide
description: "Ego Browser removes the duplicate ego_cli tool and reports browser readiness separately from installation."
---

# Ego Browser tools and desktop startup

## Change

The optional Ego Browser plugin uses the native macOS desktop without requiring Xvfb. The duplicate `ego_cli` tool is removed. `ego_status.available` now means the browser is running; `installed` reports whether its CLI is usable. Activity cards display readable action names.

## Migration

1. Replace `ego_cli` calls in saved prompts with `ego_script`. Use filesystem or shell tools for local files and commands.
2. Read `ego_status.installed` for installation and `running` for browser readiness. A stopped browser starts on the next navigation.
3. Rebuild the plugin and restart DSH. Open a page, fill a field, click, and read the result to confirm browser operation.
