from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Sequence

from backend.email import send_email
from backend.email_runtime import load_recent_send_index, log_email_send
from backend.emails.ai_capex_watch import build_ai_capex_watch_for_user
from backend.instrument_universe import list_intel_universe_ids
from backend.newsletter_intel import load_newsletter_subscribers
from backend.storage import TraceMoneyStore


EMAIL_TYPE = "ai_capex_watch"
PREVIEW_RECIPIENT = "tomartarun2001@gmail.com"


SELECTIONS: tuple[dict[str, str], ...] = (
    {
        "ticker": "LRCX",
        "role": "Equipment",
        "why_benefits": "Every new high-end accelerator still needs advanced etch and deposition for logic and HBM. Lam participates upstream, so it can benefit even when the winning model changes.",
        "risk": "A memory or logic capex pause can turn the equipment cycle before AI demand visibly disappears.",
    },
    {
        "ticker": "ETN",
        "role": "Power delivery",
        "why_benefits": "AI racks need more switchgear, breakers, busways, and power management. Eaton sells the electrical layer that has to be installed before compute can run.",
        "risk": "Electrical orders can be pulled forward; a digestion phase or permitting delays would slow backlog conversion.",
    },
    {
        "ticker": "COHR",
        "role": "Optical connectivity",
        "why_benefits": "As clusters get larger, high-speed optical links become essential for moving data between accelerators. Coherent gives the theme a higher-beta photonics exposure.",
        "risk": "The upside depends on AI networking demand reaching revenue; valuation can compress quickly if programs slip.",
    },
    {
        "ticker": "PWR",
        "role": "Grid construction",
        "why_benefits": "Quanta’s $44B backlog and roughly 70% utility and power exposure give it direct access to transmission, substations, and interconnection work required for new load.",
        "risk": "Permitting and interconnection delays can postpone backlog conversion even when the long-term need is intact.",
    },
    {
        "ticker": "CEG",
        "role": "Firm power",
        "why_benefits": "Existing nuclear generation can supply reliable electricity to data centers. CEG is an AI-capex beneficiary with a wider reliability and power-demand case.",
        "risk": "The thesis weakens if long-term contracts fail to deliver attractive margins or outages rise.",
    },
)


def _number(value: Any) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed == parsed else None


def _theme_candidates(store: TraceMoneyStore) -> dict[str, dict[str, Any]]:
    payload = store.get_research_themes() or {}
    candidates: dict[str, dict[str, Any]] = {}
    for theme in payload.get("themes") or []:
        if not isinstance(theme, dict):
            continue
        for item in theme.get("candidates") or []:
            if not isinstance(item, dict):
                continue
            ticker = str(item.get("ticker") or "").strip().upper()
            if ticker:
                candidates.setdefault(ticker, item)
    return candidates


def _directive_targets(
    store: TraceMoneyStore,
    instrument_ids: list[str],
) -> dict[str, float]:
    targets: dict[str, float] = {}
    for universe_id in list_intel_universe_ids("US", store):
        docs = store.get_stock_intelligence_docs_batch("US", universe_id, instrument_ids)
        for instrument_id, doc in docs.items():
            directive = doc.get("directive_v2") if isinstance(doc.get("directive_v2"), dict) else {}
            zones = directive.get("zones") if isinstance(directive.get("zones"), dict) else {}
            target = _number(zones.get("trim_above"))
            if target is not None and instrument_id not in targets:
                targets[instrument_id] = target
    return targets


def build_theme_watch_data(
    store: TraceMoneyStore,
    selections: Sequence[dict[str, str]],
) -> tuple[list[dict[str, Any]], str]:
    tickers = [selection["ticker"] for selection in selections]
    instrument_ids = [f"US_{ticker}" for ticker in tickers]
    instruments = {row.get("instrument_id"): row for row in store.list_instruments("US", instrument_ids)}
    prices = store.get_latest_prices(instrument_ids)
    facts = store.get_stock_facts_batch(instrument_ids)
    stocksbrew_targets = _directive_targets(store, instrument_ids)
    theme_candidates = _theme_candidates(store)

    names: list[dict[str, Any]] = []
    dates: list[str] = []
    for selection in selections:
        ticker = selection["ticker"]
        instrument_id = f"US_{ticker}"
        instrument = instruments.get(instrument_id) or {}
        price_doc = prices.get(instrument_id) or {}
        quote = price_doc.get("quote") if isinstance(price_doc.get("quote"), dict) else {}
        current_price = _number(quote.get("current"))
        facts_doc = facts.get(instrument_id) or {}
        analyst = facts_doc.get("analyst") if isinstance(facts_doc.get("analyst"), dict) else {}
        analyst_target = _number(analyst.get("target_price"))
        stocksbrew_target = stocksbrew_targets.get(instrument_id)
        if current_price is None or analyst_target is None or stocksbrew_target is None:
            raise RuntimeError(f"Incomplete market data for {ticker}")

        captured_at = str(price_doc.get("captured_at") or price_doc.get("updated_at") or "").strip()
        if captured_at:
            dates.append(captured_at[:10])

        candidate = theme_candidates.get(ticker) or {}
        names.append({
            **selection,
            "company": str(instrument.get("name") or ticker),
            "current_price": current_price,
            "day_change_pct": _number(quote.get("day_change_pct")),
            "analyst_target": analyst_target,
            "analyst_count": _number(analyst.get("analyst_count")),
            "stocksbrew_target": stocksbrew_target,
            "stocksbrew_score": _number(candidate.get("stocksbrewScore")),
        })

    as_of = max(dates) if dates else datetime.now(timezone.utc).date().isoformat()
    return names, as_of


def build_ai_capex_watch_data(store: TraceMoneyStore) -> tuple[list[dict[str, Any]], str]:
    return build_theme_watch_data(store, SELECTIONS)


def send_ai_capex_preview(
    store: TraceMoneyStore,
    *,
    recipient: str = PREVIEW_RECIPIENT,
    dry_run: bool = False,
) -> dict[str, int]:
    email = recipient.strip().lower()
    if email != PREVIEW_RECIPIENT:
        raise ValueError("The preview sender is restricted to the owner email address.")

    names, as_of = build_ai_capex_watch_data(store)
    subject, html_body = build_ai_capex_watch_for_user(
        display_name=None,
        email=email,
        names=names,
        as_of=as_of,
    )
    if dry_run:
        print(f"[dry-run] would send to {email}: {subject}")
        return {"checked": 1, "sent": 1, "failed": 0}

    if not send_email(email, subject, html_body):
        return {"checked": 1, "sent": 0, "failed": 1}

    log_email_send(
        store,
        uid=f"preview:{email}",
        email=email,
        email_type=EMAIL_TYPE,
        subject=subject,
        dedupe_key=f"{EMAIL_TYPE}_preview_{as_of}",
        trigger_type="ai_capex_preview",
        meta={"market": "US", "as_of": as_of, "preview": True, "tickers": [item["ticker"] for item in names]},
    )
    return {"checked": 1, "sent": 1, "failed": 0}


def load_ai_capex_recipients(store: TraceMoneyStore) -> list[dict[str, Any]]:
    """Merge account and newsletter audiences while honoring explicit opt-outs."""
    account_rows: dict[str, dict[str, Any] | None] = {}
    users = store.db.collection("users").select(
        ["email", "email_lower", "email_digest_enabled", "display_name"]
    ).stream()
    for doc in users:
        user = doc.to_dict() or {}
        email = str(user.get("email") or user.get("email_lower") or "").strip().lower()
        if "@" not in email:
            continue
        if user.get("email_digest_enabled") is False:
            account_rows[email] = None
            continue
        account_rows.setdefault(email, {
            "email": email,
            "uid": doc.id,
            "display_name": user.get("display_name"),
            "source": "account",
        })

    recipients = {
        email: row
        for email, row in account_rows.items()
        if row is not None
    }
    opted_out = {email for email, row in account_rows.items() if row is None}

    for row in load_newsletter_subscribers(store):
        email = str(row.get("email") or "").strip().lower()
        if "@" not in email or email in opted_out or email in recipients:
            continue
        recipients[email] = {
            "email": email,
            "uid": f"newsletter:{email}",
            "display_name": None,
            "source": "newsletter",
        }

    # The owner has already received the preview of this exact campaign.
    recipients.pop(PREVIEW_RECIPIENT, None)
    return sorted(recipients.values(), key=lambda row: str(row.get("email") or ""))


def send_ai_capex_campaign(
    store: TraceMoneyStore,
    *,
    dry_run: bool = False,
    limit: int = 0,
) -> dict[str, int]:
    """Send the one-time AI-capex note to the merged opted-in audience."""
    names, as_of = build_ai_capex_watch_data(store)
    recipients = load_ai_capex_recipients(store)
    dedupe_key = f"{EMAIL_TYPE}_{as_of}"
    recent_sends = load_recent_send_index(store, lookback_hours=720)
    subject = ""
    stats = {"checked": 0, "sent": 0, "skipped": 0, "failed": 0}

    for recipient in recipients:
        if limit and stats["checked"] >= limit:
            break
        email = str(recipient.get("email") or "").strip().lower()
        uid = str(recipient.get("uid") or "").strip()
        if not email or not uid:
            continue
        stats["checked"] += 1
        if recent_sends.get((uid, dedupe_key)):
            stats["skipped"] += 1
            continue

        subject, html_body = build_ai_capex_watch_for_user(
            display_name=recipient.get("display_name"),
            email=email,
            names=names,
            as_of=as_of,
        )
        if dry_run:
            stats["sent"] += 1
            continue

        if not send_email(email, subject, html_body):
            stats["failed"] += 1
            continue

        log_email_send(
            store,
            uid=uid,
            email=email,
            email_type=EMAIL_TYPE,
            subject=subject,
            dedupe_key=dedupe_key,
            trigger_type="ai_capex_campaign",
            meta={"market": "US", "as_of": as_of, "source": recipient.get("source"), "tickers": [item["ticker"] for item in names]},
        )
        stats["sent"] += 1

    if not subject and recipients:
        subject = "5 less-obvious AI-capex names to watch"
    return stats
