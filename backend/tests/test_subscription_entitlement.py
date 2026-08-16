from __future__ import annotations

import unittest

from backend.subscription_entitlement import has_current_pro_entitlement


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


if __name__ == "__main__":
    unittest.main()
