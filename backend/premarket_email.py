from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo

from backend.email import send_email
from backend.email_content import clean_optional_email_text
from backend.email_runtime import load_recent_send_index, log_email_send
from backend.emails.premarket_brief import build_premarket_brief_for_user
from backend.premarket_intel import PREMARKET_GAP_THRESHOLD, overnight_headlines_by_ticker
from backend.storage import TraceMoneyStore

logger = logging.getLogger(__name__)

EMAIL_TYPE = "premarket_brief"
OVERNIGHT_LOOKBACK_HOURS = 14
PREMARKET_SNAPSHOT_MAX_AGE_HOURS = 6
MARKET_TZ = {"US": "America/New_York", "IN": "Asia/Kolkata"}


def today_key() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def market_today_key(market: str) -> str:
    tz_name = MARKET_TZ.get(str(market or "US").upper(), "America/New_York")
    return datetime.now(ZoneInfo(tz_name)).date().isoformat()


def _parse_iso_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        text = str(value).strip()
        if text.endswith("Z"):
            text = f"{text[:-1]}+00:00"
        parsed = datetime.fromisoformat(text)
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def dedupe_key_for_date(date_key: str) -> str:
    return f"premarket_{date_key}"


def macro_phase_line(store: TraceMoneyStore, market: str) -> str | None:
    try:
        doc = store.db.collection("tm_sector_regimes").document(f"{market.upper()}__macro").get()
    except Exception:
        return None
    if not doc.exists:
        return None
    data = doc.to_dict() or {}
    phase = str(data.get("market_phase") or "")
    risk = str(data.get("risk_appetite") or "")
    phase_label = {
        "trending_up": "trending up",
        "distribution": "in distribution",
        "correction": "in a correction",
        "recovery": "recovering",
        "range": "range-bound",
    }.get(phase, "")
    risk_label = {"on": "risk-on", "off": "risk-off", "mixed": "mixed"}.get(risk, "")
    if not phase_label:
        return None
    tail = f", {risk_label}" if risk_label else ""
    return f"The market is {phase_label}{tail}."


def has_sendable_premarket_snapshot(premarket: dict[str, Any] | None, *, market: str = "US") -> bool:
    if not premarket:
        return False
    if str(premarket.get("date") or "") != market_today_key(market):
        return False
    generated_at = _parse_iso_datetime(premarket.get("generated_at"))
    if generated_at is None:
        return False
    age_seconds = (datetime.now(timezone.utc) - generated_at).total_seconds()
    if age_seconds < 0 or age_seconds > PREMARKET_SNAPSHOT_MAX_AGE_HOURS * 3600:
        return False
    quoted = int(premarket.get("quoted_count") or 0)
    if quoted > 0:
        return True
    up = len(premarket.get("gappers_up") or [])
    down = len(premarket.get("gappers_down") or [])
    return (up + down) > 0


def user_digest_enabled(user: dict[str, Any]) -> bool:
    return user.get("email_digest_enabled") is not False


def is_pro_subscriber(user: dict[str, Any]) -> bool:
    return bool(user.get("is_subscribed"))


def _company_by_ticker(rows: list[dict[str, Any]]) -> dict[str, str]:
    out: dict[str, str] = {}
    for row in rows:
        ticker = str(row.get("ticker") or "").strip().upper()
        if not ticker:
            continue
        out[ticker] = str(row.get("name") or row.get("display_name") or ticker).strip()
    return out


def _gap_by_ticker(premarket: dict[str, Any] | None) -> dict[str, float]:
    out: dict[str, float] = {}
    by_ticker = (premarket or {}).get("by_ticker") or {}
    if isinstance(by_ticker, dict):
        for sym, hit in by_ticker.items():
            if isinstance(hit, dict):
                out[str(sym).upper()] = float(hit.get("pre_market_change_pct") or 0)
    return out


def _missing_book_news_tickers(
    rows: list[dict[str, Any]],
    premarket: dict[str, Any] | None,
    premarket_context: dict[str, Any] | None,
    *,
    limit: int = 8,
) -> list[str]:
    by_ticker = (premarket or {}).get("by_ticker") or {}
    context_by_ticker = (premarket_context or {}).get("by_ticker") or {}
    hits: list[tuple[float, str]] = []
    for row in rows:
        ticker = str(row.get("ticker") or "").strip().upper()
        hit = by_ticker.get(ticker) if isinstance(by_ticker, dict) else None
        if not ticker or not isinstance(hit, dict):
            continue
        gap = abs(float(hit.get("pre_market_change_pct") or 0))
        if gap < PREMARKET_GAP_THRESHOLD:
            continue
        hits.append((gap, ticker))
    hits.sort(key=lambda item: item[0], reverse=True)

    def has_sendable_context(ticker: str) -> bool:
        row = context_by_ticker.get(ticker)
        if not isinstance(row, dict):
            return False
        return any(
            clean_optional_email_text(row.get(key))
            for key in ("tape_line", "why", "headline")
        )

    return [
        ticker
        for _gap, ticker in hits[: max(0, limit)]
        if not has_sendable_context(ticker)
    ]


def load_premarket_intel_for_book(
    store: TraceMoneyStore,
    *,
    market: str,
    rows: list[dict[str, Any]],
    premarket: dict[str, Any] | None = None,
) -> tuple[dict[str, Any] | None, dict[str, dict[str, Any]]]:
    """Load mover context and overnight headlines for a user's watchlist."""
    market = market.upper()
    premarket_context = store.get_premarket_context(market)
    tickers = _missing_book_news_tickers(rows, premarket, premarket_context)
    universe_id = str(store.get_active_ai_universe(market) or "").strip()
    company_by_ticker = _company_by_ticker(rows)
    gap_by_ticker = _gap_by_ticker(premarket)
    overnight_headlines: dict[str, dict[str, Any]] = {}
    if universe_id and tickers:
        overnight_headlines = overnight_headlines_by_ticker(
            store,
            market=market,
            universe_id=universe_id,
            tickers=tickers,
            lookback_hours=OVERNIGHT_LOOKBACK_HOURS,
            company_by_ticker=company_by_ticker,
            gap_by_ticker=gap_by_ticker,
        )
    if premarket_context and isinstance(premarket_context.get("by_ticker"), dict):
        from backend.premarket_tape_llm import enrich_context_with_tape_lines

        enrich_context_with_tape_lines(
            store,
            market=market,
            by_ticker=premarket_context["by_ticker"],
            company_by_ticker=company_by_ticker,
            gap_by_ticker=gap_by_ticker,
        )
    return premarket_context, overnight_headlines


def process_premarket_briefs(
    store: TraceMoneyStore,
    *,
    market: str = "US",
    limit: int = 0,
    dry_run: bool = False,
    force_email: str | None = None,
    force_uid: str | None = None,
    skip_snapshot_gate: bool = False,
) -> dict[str, int]:
    """Send the daily pre-market brief to opted-in Pro subscribers."""
    market = str(market or "US").upper()
    date_key = today_key()
    dedupe_key = dedupe_key_for_date(date_key)

    premarket = store.get_premarket_movers(market)
    phase_line = macro_phase_line(store, market)

    if not skip_snapshot_gate and not has_sendable_premarket_snapshot(premarket, market=market):
        logger.info(
            "No fresh sendable pre-market snapshot for %s — skipping batch "
            "(date=%s generated_at=%s quoted_count=%s)",
            market,
            (premarket or {}).get("date"),
            (premarket or {}).get("generated_at"),
            (premarket or {}).get("quoted_count"),
        )
        return {
            "checked": 0,
            "sent": 0,
            "skipped": 0,
            "failed": 0,
            "skipped_no_snapshot": 1,
        }

    recent_sends = load_recent_send_index(store, lookback_hours=36)

    stats = {
        "checked": 0,
        "sent": 0,
        "skipped": 0,
        "failed": 0,
        "skipped_no_snapshot": 0,
    }

    if force_email:
        uid = force_uid or ""
        user: dict[str, Any] = {}
        if uid:
            doc = store.db.collection("users").document(uid).get()
            if doc.exists:
                user = doc.to_dict() or {}
        rows: list[dict[str, Any]] = []
        if uid:
            view = store.get_watchlist_view(uid) or {}
            rows = list(view.get("rows") or [])

        premarket_context, overnight_headlines = load_premarket_intel_for_book(
            store,
            market=market,
            rows=rows,
            premarket=premarket,
        )
        subject, html_body = build_premarket_brief_for_user(
            display_name=user.get("display_name"),
            email=force_email,
            premarket=premarket,
            rows=rows,
            market_phase_line=phase_line,
            premarket_context=premarket_context,
            overnight_headlines=overnight_headlines,
        )
        stats["checked"] = 1
        if dry_run:
            print(f"[dry-run] would send to {force_email}: {subject}")
            stats["sent"] = 1
            return stats

        ok = send_email(force_email, subject, html_body)
        if ok:
            stats["sent"] = 1
            if uid:
                log_email_send(
                    store,
                    uid=uid,
                    email=force_email,
                    email_type=EMAIL_TYPE,
                    subject=subject,
                    dedupe_key=f"{dedupe_key}:preview",
                    trigger_type="premarket_email",
                    meta={"market": market, "preview": True},
                )
        else:
            stats["failed"] = 1
        return stats

    users = store.db.collection("users").select(
        ["email", "email_lower", "is_subscribed", "email_digest_enabled", "display_name"]
    ).stream()

    for doc in users:
        if limit and stats["checked"] >= limit:
            break

        uid = doc.id
        user = doc.to_dict() or {}
        email = str(user.get("email") or user.get("email_lower") or "").strip().lower()
        if not email:
            continue
        if not is_pro_subscriber(user):
            continue

        stats["checked"] += 1

        if not user_digest_enabled(user):
            stats["skipped"] += 1
            continue

        if recent_sends.get((uid, dedupe_key)):
            stats["skipped"] += 1
            continue

        view = store.get_watchlist_view(uid) or {}
        rows = list(view.get("rows") or [])
        premarket_context, overnight_headlines = load_premarket_intel_for_book(
            store,
            market=market,
            rows=rows,
            premarket=premarket,
        )

        subject, html_body = build_premarket_brief_for_user(
            display_name=user.get("display_name"),
            email=email,
            premarket=premarket,
            rows=rows,
            market_phase_line=phase_line,
            premarket_context=premarket_context,
            overnight_headlines=overnight_headlines,
        )

        if dry_run:
            stats["sent"] += 1
            continue

        ok = send_email(email, subject, html_body)
        if ok:
            stats["sent"] += 1
            log_email_send(
                store,
                uid=uid,
                email=email,
                email_type=EMAIL_TYPE,
                subject=subject,
                dedupe_key=dedupe_key,
                trigger_type="premarket_email",
                meta={"market": market, "book_movers": _book_mover_count(rows, premarket)},
            )
        else:
            stats["failed"] += 1

    return stats


def _book_mover_count(rows: list[dict[str, Any]], premarket: dict[str, Any] | None) -> int:
    by_ticker = (premarket or {}).get("by_ticker") or {}
    count = 0
    for row in rows:
        ticker = str(row.get("ticker") or "").strip().upper()
        if ticker and ticker in by_ticker:
            count += 1
    return count
