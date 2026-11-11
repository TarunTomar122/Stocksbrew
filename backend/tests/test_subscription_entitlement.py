from __future__ import annotations

import unittest

from backend.subscription_entitlement import (
    covered_instrument_ids,
    has_current_pro_entitlement,
    is_pro_user,
)


class SubscriptionEntitlementTest(unittest.TestCase):
    def test_active_paid_subscription_is_eligible(self) -> None:
        self.assertTrue(
            has_current_pro_entitlement(
                {
                    "is_subscribed": True,
                    "subscriptionId": "sub_active",
                    "subscriptionStatus": "active",
                }
            )
        )

    def test_cancel_at_period_end_keeps_paid_through_access(self) -> None:
        self.assertTrue(
            has_current_pro_entitlement(
                {
                    "is_subscribed": True,
                    "subscriptionId": "sub_cancelling",
                    "subscriptionStatus": "active",
                    "cancelAtPeriodEnd": True,
                }
            )
        )

    def test_terminal_subscription_is_not_eligible(self) -> None:
        for status in ("payment_failed", "on_hold", "cancelled", "expired"):
            with self.subTest(status=status):
                self.assertFalse(
                    has_current_pro_entitlement(
                        {
                            "is_subscribed": True,
                            "subscriptionId": "sub_old",
                            "subscriptionStatus": status,
                        }
                    )
                )

    def test_gifted_pro_without_provider_subscription_is_eligible(self) -> None:
        self.assertTrue(
            has_current_pro_entitlement(
                {"is_subscribed": True, "subscriptionStatus": "active"}
            )
        )

    def test_processing_subscription_is_not_eligible(self) -> None:
        self.assertFalse(
            has_current_pro_entitlement(
                {
                    "is_subscribed": True,
                    "subscriptionId": "sub_processing",
                    "subscriptionStatus": "processing",
                }
            )
        )

    def test_active_gift_is_eligible_until_expiry(self) -> None:
        self.assertTrue(
            has_current_pro_entitlement(
                {"proGifted": True, "proGiftExpiresAt": "2099-01-01T00:00:00+00:00"}
            )
        )
        self.assertFalse(
            has_current_pro_entitlement(
                {"proGifted": True, "proGiftExpiresAt": "2020-01-01T00:00:00+00:00"}
            )
        )



class IsProUserMatchesTheAppTest(unittest.TestCase):
    """is_pro_user must give the same answer as lib/watchlist.ts resolveIsSubscribed.

    The cases mirror lib/entitlements-parity.test.ts, which runs the same table
    through the TypeScript function.
    """

    CASES = [
        ("empty", {}, False),
        ("none", None, False),
        ("subscribed, no status", {"is_subscribed": True}, True),
        ("subscribed, active", {"is_subscribed": True, "subscriptionStatus": "active"}, True),
        ("subscribed, processing", {"is_subscribed": True, "subscriptionStatus": "processing"}, True),
        ("subscribed, cancelled", {"is_subscribed": True, "subscriptionStatus": "cancelled"}, False),
        ("subscribed, on_hold", {"is_subscribed": True, "subscriptionStatus": "on_hold"}, False),
        ("subscribed, upper-case expired", {"is_subscribed": True, "subscriptionStatus": " EXPIRED "}, False),
        ("flag missing, trialing", {"subscriptionStatus": "trialing"}, True),
        ("flag missing, on_trial", {"subscriptionStatus": "on_trial"}, True),
        ("flag false, active", {"is_subscribed": False, "subscriptionStatus": "active"}, True),
        ("flag false, no status", {"is_subscribed": False}, False),
        ("gift, future", {"proGifted": True, "proGiftExpiresAt": "2099-01-01T00:00:00Z"}, True),
        ("gift, past", {"proGifted": True, "proGiftExpiresAt": "2020-01-01T00:00:00Z", "is_subscribed": True}, False),
        ("gift, bad date", {"proGifted": True, "proGiftExpiresAt": "soon"}, False),
    ]

    def test_cases(self) -> None:
        for name, user, expected in self.CASES:
            with self.subTest(name=name):
                self.assertEqual(is_pro_user(user), expected)

    def test_email_jobs_use_it(self) -> None:
        from backend.premarket_email import is_pro_subscriber

        # A gifted account sees Pro in the app, so it gets the Pro emails too.
        self.assertTrue(is_pro_subscriber({"proGifted": True, "proGiftExpiresAt": "2099-01-01T00:00:00Z"}))
        # A cancelled account whose flag was never cleared does not.
        self.assertFalse(is_pro_subscriber({"is_subscribed": True, "subscriptionStatus": "cancelled"}))


class CoveredInstrumentIdsTest(unittest.TestCase):
    def test_pro_covers_everything_tracked(self) -> None:
        user = {"tracked_stocks": [f"US_T{i}" for i in range(8)], "is_subscribed": True}
        self.assertEqual(covered_instrument_ids(user), [f"US_T{i}" for i in range(8)])

    def test_free_default_is_first_five(self) -> None:
        user = {"tracked_stocks": [f"US_T{i}" for i in range(8)]}
        self.assertEqual(covered_instrument_ids(user), [f"US_T{i}" for i in range(5)])

    def test_free_explicit_choice_only_keeps_tracked(self) -> None:
        user = {"tracked_stocks": ["US_A", "US_B", "US_C"], "covered_stocks": ["US_C", "US_GONE", "US_A"]}
        self.assertEqual(covered_instrument_ids(user), ["US_C", "US_A"])

    def test_free_explicit_empty_covers_nothing(self) -> None:
        user = {"tracked_stocks": ["US_A"], "covered_stocks": []}
        self.assertEqual(covered_instrument_ids(user), [])


if __name__ == "__main__":
    unittest.main()


def test_free_covered_stocks_follows_the_paywall_flag(monkeypatch):
    import importlib

    import backend.subscription_entitlement as entitlement

    try:
        monkeypatch.delenv("PAYWALL_V2", raising=False)
        today = importlib.reload(entitlement)
        assert today.FREE_COVERED_STOCKS == 5
        assert today.FREE_COVERED_WORD == "five"
        user = {"tracked_stocks": ["US_A", "US_B", "US_C", "US_D", "US_E", "US_F"]}
        assert today.covered_instrument_ids(user) == ["US_A", "US_B", "US_C", "US_D", "US_E"]

        monkeypatch.setenv("PAYWALL_V2", "1")
        tighter = importlib.reload(entitlement)
        assert tighter.FREE_COVERED_STOCKS == 3
        assert tighter.FREE_COVERED_WORD == "three"
        assert tighter.covered_instrument_ids(user) == ["US_A", "US_B", "US_C"]
    finally:
        monkeypatch.delenv("PAYWALL_V2", raising=False)
        importlib.reload(entitlement)
