"""Shared Pro entitlement rules for backend work."""
from __future__ import annotations

from typing import Any, Mapping


ACTIVE_SUBSCRIPTION_STATUSES = frozenset({"active", "trialing", "on_trial"})
TERMINAL_SUBSCRIPTION_STATUSES = frozenset(
    {"payment_failed", "failed", "on_hold", "cancelled", "expired"}
)


def has_current_pro_entitlement(user: Mapping[str, Any]) -> bool:
    """Return whether a user should contribute to Pro compute cohorts.

    ``cancelAtPeriodEnd`` deliberately does not revoke access early. Dodo keeps
    the subscription status active until the paid-through date, then the
    terminal webhook removes the entitlement. Gifted users have no provider
    subscription ID, so ``is_subscribed`` plus a non-terminal status is enough.
    """
    if not bool(user.get("is_subscribed")):
        return False

    status = str(user.get("subscriptionStatus") or "").strip().lower()
    if status in TERMINAL_SUBSCRIPTION_STATUSES:
        return False
    if status:
        return status in ACTIVE_SUBSCRIPTION_STATUSES
    return True
