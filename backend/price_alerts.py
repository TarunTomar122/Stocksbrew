from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from backend.email import send_email
from backend.email_runtime import log_email_send
from backend.emails.price_alert import build_price_alert_email
from backend.storage import TraceMoneyStore

logger = logging.getLogger(__name__)

EMAIL_TYPE = "price_alert"


def load_active_price_alerts(store: TraceMoneyStore) -> list[dict[str, Any]]:
    alert_list: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    price_alerts = (
        store.db.collection("tm_alerts")
        .where("active", "==", True)
        .where("triggered", "==", False)
        .where("kind", "==", "price_threshold")
        .stream()
    )
    for doc in price_alerts:
        data = doc.to_dict()
        if not isinstance(data, dict):
            continue
        seen_ids.add(doc.id)
        data.setdefault("kind", "price_threshold")
        alert_list.append({"id": doc.id, **data})

    legacy_alerts = (
        store.db.collection("tm_alerts")
        .where("active", "==", True)
        .where("triggered", "==", False)
        .stream()
    )
    for doc in legacy_alerts:
        if doc.id in seen_ids:
            continue
        data = doc.to_dict()
        if not isinstance(data, dict):
            continue
        if data.get("kind") not in (None, "", "price_threshold"):
            continue
        data.setdefault("kind", "price_threshold")
        alert_list.append({"id": doc.id, **data})

    return alert_list


def _price_from_latest_doc(doc: dict[str, Any] | None) -> float | None:
    if not doc:
        return None
    for key in ("current", "close", "price"):
        raw = doc.get(key)
        if raw is None or raw == "":
            continue
        try:
            return float(raw)
        except (TypeError, ValueError):
            continue
    quote = doc.get("quote")
    if isinstance(quote, dict):
        for key in ("current", "close", "price"):
            raw = quote.get(key)
            if raw is None or raw == "":
                continue
            try:
                return float(raw)
            except (TypeError, ValueError):
                continue
    return None


def fetch_prices_for_alerts(
    store: TraceMoneyStore,
    alerts: list[dict[str, Any]],
) -> dict[str, float | None]:
    """Return ticker -> latest price. Prefer Firebase tm_latest_prices, then yfinance."""
    by_ticker: dict[str, str | None] = {}
    for alert in alerts:
        ticker = str(alert.get("ticker") or "").strip().upper()
        if not ticker:
            continue
        iid = str(alert.get("instrument_id") or "").strip() or None
        by_ticker.setdefault(ticker, iid)

    instrument_ids = [iid for iid in by_ticker.values() if iid]
    latest = store.get_latest_prices(instrument_ids) if instrument_ids else {}

    prices: dict[str, float | None] = {}
    missing: list[str] = []

    for ticker, iid in by_ticker.items():
        price = None
        if iid:
            price = _price_from_latest_doc(latest.get(iid))
        if price is not None:
            prices[ticker] = price
        else:
            missing.append(ticker)

    if missing:
        try:
            import yfinance as yf
        except ImportError:
            yf = None  # type: ignore[assignment]

        for ticker in missing:
            if yf is None:
                prices[ticker] = None
                continue
            try:
                info = yf.Ticker(ticker).info
                raw = (
                    info.get("regularMarketPrice")
                    or info.get("currentPrice")
                    or info.get("previousClose")
                )
                prices[ticker] = float(raw) if raw else None
            except Exception as exc:
                logger.warning("yfinance failed for %s: %s", ticker, exc)
                prices[ticker] = None

    return prices


def find_watchlist_row(
    store: TraceMoneyStore,
    *,
    uid: str,
    instrument_id: str | None = None,
    ticker: str | None = None,
) -> dict[str, Any] | None:
    view = store.get_watchlist_view(uid) or {}
    rows = view.get("rows") or []
    sym = str(ticker or "").strip().upper()
    iid = str(instrument_id or "").strip()
    for row in rows:
        if not isinstance(row, dict):
            continue
        if iid and str(row.get("instrument_id") or "") == iid:
            return row
        if sym and str(row.get("ticker") or "").strip().upper() == sym:
            return row
    return None


def user_alerts_enabled(store: TraceMoneyStore, uid: str) -> bool:
    if not uid:
        return True
    doc = store.db.collection("users").document(uid).get()
    if not doc.exists:
        return True
    data = doc.to_dict() or {}
    return bool(data.get("email_alerts_enabled", True))


def is_price_alert_triggered(*, condition: str, current: float, target: float) -> bool:
    if condition == "below":
        return current <= target
    if condition == "above":
        return current >= target
    return False


def send_price_alert_notification(
    store: TraceMoneyStore,
    *,
    alert: dict[str, Any],
    current_price: float,
    row: dict[str, Any] | None = None,
    to_email: str | None = None,
    dry_run: bool = False,
) -> bool:
    ticker = str(alert.get("ticker") or "").strip().upper()
    condition = str(alert.get("condition") or "")
    target = float(alert.get("target_price", 0))
    email = str(to_email or alert.get("email") or "").strip()
    uid = str(alert.get("uid") or "").strip()
    alert_id = str(alert.get("id") or "")

    if not email:
        logger.info("price alert %s: no email — skipped", alert_id or ticker)
        return False

    if uid and not user_alerts_enabled(store, uid):
        logger.info("price alert %s: user %s opted out of alert emails", alert_id or ticker, uid)
        return False

    subject, html_body = build_price_alert_email(
        ticker=ticker,
        condition=condition,
        target_price=target,
        current_price=current_price,
        row=row,
    )

    if dry_run:
        print(f"[dry-run] would send to {email}: {subject}")
        return True

    ok = send_email(email, subject, html_body)
    if ok and uid:
        log_email_send(
            store,
            uid=uid,
            email=email,
            email_type=EMAIL_TYPE,
            subject=subject,
            dedupe_key=f"price_alert:{alert_id}" if alert_id else f"price_alert:{ticker}:{condition}:{target}",
            trigger_type="price_threshold",
            trigger_id=alert_id or None,
            meta={
                "ticker": ticker,
                "condition": condition,
                "target_price": target,
                "current_price": current_price,
            },
        )
    return ok


def mark_alert_triggered(store: TraceMoneyStore, alert_id: str) -> None:
    now = datetime.now(timezone.utc).isoformat()
    store.db.collection("tm_alerts").document(alert_id).update({
        "triggered": True,
        "triggered_at": now,
        "active": False,
        "updated_at": now,
    })


def process_price_alerts(
    store: TraceMoneyStore,
    *,
    dry_run: bool = False,
) -> dict[str, int]:
    alerts = load_active_price_alerts(store)
    stats = {"checked": 0, "triggered": 0, "sent": 0, "skipped_no_price": 0, "skipped_not_triggered": 0}

    if not alerts:
        return stats

    prices = fetch_prices_for_alerts(store, alerts)
    row_cache: dict[tuple[str, str, str], dict[str, Any] | None] = {}

    for alert in alerts:
        stats["checked"] += 1
        alert_id = str(alert.get("id") or "")
        ticker = str(alert.get("ticker") or "").strip().upper()
        target = float(alert.get("target_price", 0))
        condition = str(alert.get("condition") or "")
        uid = str(alert.get("uid") or "").strip()
        current = prices.get(ticker)

        if current is None:
            stats["skipped_no_price"] += 1
            logger.info("[%s] no price data — skipping", ticker)
            continue

        if not is_price_alert_triggered(condition=condition, current=current, target=target):
            stats["skipped_not_triggered"] += 1
            logger.info("[%s] not triggered — $%.2f (target $%.2f %s)", ticker, current, target, condition)
            continue

        stats["triggered"] += 1
        logger.info("[%s] TRIGGERED: $%.2f %s $%.2f", ticker, current, condition, target)

        row = None
        if uid:
            iid = str(alert.get("instrument_id") or "")
            cache_key = (uid, iid, ticker)
            if cache_key not in row_cache:
                row_cache[cache_key] = find_watchlist_row(
                    store,
                    uid=uid,
                    instrument_id=iid or None,
                    ticker=ticker,
                )
            row = row_cache[cache_key]

        if not dry_run and alert_id:
            mark_alert_triggered(store, alert_id)

        sent = send_price_alert_notification(
            store,
            alert=alert,
            current_price=current,
            row=row,
            dry_run=dry_run,
        )
        if sent:
            stats["sent"] += 1

    return stats
