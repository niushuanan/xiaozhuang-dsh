"""Verify the installed canonical collector against the public OpenAI column layout."""
import importlib.util
import sys
import unittest
from pathlib import Path

path = Path(sys.argv.pop(1)).expanduser() if len(sys.argv) > 1 else Path.home() / ".codex/skills/tokscale-token-report"
spec = importlib.util.spec_from_file_location("official_pricing", path / "scripts/official_pricing.py")
pricing = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pricing)


class PricingColumns(unittest.TestCase):
    def test_current_standard_and_codex_columns(self):
        rows = pricing.parse_prices("openai", """Standard
### Standard pricing data
| Model | Short context input | Short context output | Short context cached input | Short context 30m write | Long context input | Long context output | Long context cached input | Long context 30m write |
| gpt-6-astra | $10 | $50 | $1 | $12.5 | $20 | $75 | $2 | $25 |
### Grouped Pricing Table data
| Category | Model | Input | Output | Cached input |
| Codex | gpt-5.3-codex | $1.75 | $14 | $0.175 |
Fast
| Category | Model | Input | Output | Cached input |
| Codex | gpt-5.3-codex | $3.5 | $28 | $0.35 |
""")
        self.assertEqual([rows["gpt-5.3-codex"][key] for key in ("input", "cacheRead", "output")], [1.75, .175, 14])
        self.assertEqual([rows["gpt-6-astra"][key] for key in ("input", "cacheRead", "output")], [10, 1, 50])


if __name__ == "__main__":
    unittest.main()
