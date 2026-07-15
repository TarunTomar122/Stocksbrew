from __future__ import annotations

import unittest

from backend.scripts.build_watchlist_views import _queue_directive_change_events


class _FailIfUsedStore:
    @property
    def db(self):
        raise AssertionError("Firestore should not be touched for a free user")


class DirectiveChangeAlertTests(unittest.TestCase):
    def test_free_users_do_not_get_automatic_directive_alerts(self) -> None:
        queued = _queue_directive_change_events(
            _FailIfUsedStore(),  # type: ignore[arg-type]
            uid="free-user",
            is_subscribed=False,
            previous_rows=[
                {
                    "instrument_id": "US_IBM",
                    "ticker": "IBM",
                    "position_type": "watchlist",
                    "ai_directive": {"stance": "watch"},
                }
            ],
            current_rows=[
                {
                    "instrument_id": "US_IBM",
                    "ticker": "IBM",
                    "position_type": "watchlist",
                    "ai_directive": {"stance": "accumulate"},
                }
            ],
        )

        self.assertEqual(queued, 0)


if __name__ == "__main__":
    unittest.main()
