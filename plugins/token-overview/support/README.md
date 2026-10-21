# Shared collector pricing repair

The current OpenAI tables put output before cached input and include additional cache-write columns. Older canonical collectors read fixed positions and may charge cached input at the output rate. The report requires the corrected, column-name-based parser.

Keep the canonical Skill at `~/.codex/skills/tokscale-token-report`; do not install a second copy. First run `PYTHONDONTWRITEBYTECODE=1 python3 plugins/token-overview/support/test_pricing_columns.py`. If it passes, no repair is needed. For the older parser, review and apply `openai-pricing-columns.patch` with `patch -p1 -d ~/.codex/skills/tokscale-token-report < plugins/token-overview/support/openai-pricing-columns.patch`, then repeat the check. A patch conflict means that the installed collector has changed; adapt the named-column mapping in that collector instead of overwriting it.

The repair invalidates only OpenAI cache entries created by the older parser and retains the verified bundled snapshot on refresh failure. The next normal report collection reprices both live and protected historical quantities using corrected prices. Do not edit source sessions, import history again, delete the history lock, or start a second scheduled collector. Prices remain current API-equivalent estimates, not invoices.
