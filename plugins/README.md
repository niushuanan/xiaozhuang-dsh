# Product plugin boundary

This directory is the complete Xiaozhuang product layer on top of DeepSeek Harness `dsh-v0.1.3-alpha.1`.

Each immediate child directory is one native product plugin. Its source, package metadata, build entry, Cordis rows, UI, assets, and direct product-only dependencies must stay inside that directory. The CLI discovers only physically present child directories; it does not carry a hard-coded list of product plugins.

The removal contract is deliberate:

- Removing one child directory removes only that plugin from build and Web-profile composition.
- Removing `conversation-import` or `session-modes` restores the corresponding official upstream row.
- Removing every child directory leaves a runnable upstream DSH core.
- Core packages may expose generic extension points, but they must not import or name a Xiaozhuang plugin.

Run `pnpm product-plugins:verify-removable` after changing discovery, composition, or a plugin boundary. The command temporarily moves each directory, validates the real Web profile, validates the zero-plugin profile, and restores every directory before it exits.
