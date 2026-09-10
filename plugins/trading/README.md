# Trading workspace

The sidebar's **Trading** action opens market watchlists, charts, indicators, strategies, research knowledge, holdings and trading tasks. **Back to conversation** restores the existing workbench. **Send to Agent** appends market context and an available chart image to the current draft without submitting it.

## Integration

This is an optional native directory in the integrated Xiaozhuang DSH product. The repository's product build discovers `package.json` and `cordis.patch.yml`, then runs `scripts/build.mjs` to build the owned packages in dependency order. All DSH dependencies use local workspace packages. Source and runtime assets remain inside this directory.

Settings uses the host's existing window. The additive role presets are `trading-master`, `trading-trader`, `trading-researcher` and `trading-risk-reviewer`. Standard sessions keep their current model, default preset, history and workspace. Copied trading presets stay bound to this installation. Trading stores use `$DSH_HOME/trading`, with the host's usual `~/.dsh` fallback when the environment variable is absent. Startup does not import older trading data or alter host files.

## Validation

Build from the repository root with `node plugins/trading/scripts/build.mjs`. Run selected source tests with `node node_modules/vitest/vitest.mjs run --config plugins/trading/vitest.config.ts <test paths>`. Real acceptance uses an isolated DSH Home and the normal `dsh web` launcher, exercising entry/return, charts, watchlists, settings, role selection and draft handoff.

## Limitations

External data availability depends on each provider and the local network. Sources requiring credentials remain unavailable until configured; unavailable results do not mean zero holdings or an empty market. Live orders are not part of the integration acceptance: orders default to simulation, and live execution still requires explicit configuration and interactive approval. Upstream-only product management and shell takeover features are excluded.

## License

This directory contains code derived from [dsh-trading](https://github.com/zhu1090093659/dsh-trading) under [PolyForm Noncommercial 1.0.0](LICENSE), not the host's MIT license. See [UPSTREAM.md](UPSTREAM.md) for source attribution and integration changes.
