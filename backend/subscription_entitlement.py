"""Shared Pro entitlement rules for backend work."""
from __future__ import annotations

from datetime import datetime, timezone
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
    if bool(user.get("proGifted")):
        raw_expiry = str(user.get("proGiftExpiresAt") or "").strip()
        try:
            expiry = datetime.fromisoformat(raw_expiry.replace("Z", "+00:00"))
        except ValueError:
            return False
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        return expiry > datetime.now(timezone.utc)

    if not bool(user.get("is_subscribed")):
        return False

    status = str(user.get("subscriptionStatus") or "").strip().lower()
    if status in TERMINAL_SUBSCRIPTION_STATUSES:
        return False
    if status:
        return status in ACTIVE_SUBSCRIPTION_STATUSES
    return True


# ── The app's own Pro check, for anything that decides who gets a Pro email ──
#
# ``lib/watchlist.ts`` ``resolveIsSubscribed`` decides what a person sees in the
# app. Jobs that decide who receives a Pro email must agree with it exactly,
# or someone sees Pro in the app and gets no Pro email (a gifted account), or
# the other way round (a cancelled one). ``is_pro_user`` is that function, line
# for line. ``has_current_pro_entitlement`` above stays the stricter rule for
# compute cohorts (an unknown status does not buy research compute).

FREE_COVERED_STOCKS = 5  # lib/entitlements.ts: FREE_COVERED_STOCKS


def is_pro_user(user: Mapping[str, Any] | None) -> bool:
    """Mirror of ``resolveIsSubscribed`` in lib/watchlist.ts (without its dev unlock)."""
    if not user:
        return False
    if user.get("proGifted"):
        raw_expiry = str(user.get("proGiftExpiresAt") or "").strip()
        try:
            expiry = datetime.fromisoformat(raw_expiry.replace("Z", "+00:00"))
        except ValueError:
            return False
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        return expiry > datetime.now(timezone.utc)
    status = str(user.get("subscriptionStatus") or "").strip().lower()
    if status in TERMINAL_SUBSCRIPTION_STATUSES:
        return False
    if user.get("is_subscribed"):
        return True
    return status in ACTIVE_SUBSCRIPTION_STATUSES


def covered_instrument_ids(user: Mapping[str, Any] | None, is_pro: bool | None = None) -> list[str]:
    """Mirror of ``effectiveCovered`` in lib/entitlements-coverage.ts.

    Pro covers everything tracked. Free covers its explicit ``covered_stocks``
    (only ids still tracked, at most five), or before any choice the first
    five tracked stocks.
    """
    if not user:
        return []
    pro = is_pro_user(user) if is_pro is None else is_pro

    def _ids(value: Any) -> list[str]:
        out: list[str] = []
        if isinstance(value, list):
            for item in value:
                if isinstance(item, str) and item and item not in out:
                    out.append(item)
        return out

    tracked = _ids(user.get("tracked_stocks"))
    if pro:
        return tracked
    if isinstance(user.get("covered_stocks"), list):
        return [i for i in _ids(user.get("covered_stocks")) if i in tracked][:FREE_COVERED_STOCKS]
    return tracked[:FREE_COVERED_STOCKS]
