from __future__ import annotations

import unittest

from backend.preferences import validate_user_preferences


class PreferencesTest(unittest.TestCase):
    def test_validate_preferences(self) -> None:
        payload = {
            "markets": ["IN", "US"],
            "sectors": {
                "IN": ["banking", "energy"],
                "US": ["semiconductors"],
            },
            "stocks": {
                "IN": [{"ticker": "RELIANCE", "display_name": "Reliance Industries"}],
                "US": [{"ticker": "NVDA", "display_name": "NVIDIA"}],
            },
            "signal_types": ["earnings", "regulation"],
        }
        normalized = validate_user_preferences(payload)
        self.assertEqual(normalized["markets"], ["IN", "US"])
        self.assertEqual(normalized["stocks"]["US"][0]["ticker"], "NVDA")


if __name__ == "__main__":
    unittest.main()
