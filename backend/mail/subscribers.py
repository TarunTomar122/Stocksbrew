"""The morning brief for addresses with no account (tm_email_subscribers, written by the web app's email capture,
lib/email-subscribers.ts).

Same rules and look as the account daily (backend/mail/daily.py): before the open, only on days something happened
to the stocks, one card per stock. A signup from a stock or earnings page follows those stocks; one from /news or
/calendar (no stock) gets the market version: the featured stocks' big moves, calls that changed and reports today or
tomorrow.

Who gets it: confirmed (double opt-in), not stopped, not linked to an account, and no account uses the address (an
account's own daily covers it). Without an account there is no plan, so the email never shows a price level: the call
word only, and no "reached our buy-more price" cards (levels come with covering a stock, lib/entitlements.ts).

Every email carries a signed stop link (HMAC over `sub:<id>:stop`, the same as lib/email-subscribers.ts) and one quiet
"Make it yours" link to sign up with the same stocks. Sends go through send.deliver (dedupe per market session, the
kit's caps) under a pseudo uid `sub_<id>`, so the log and dedupe work as for accounts.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Iterable
from urllib.parse import urlencode

from backend.mail import daily, kit
from backend.mail.data import (
    ET,
    Person,
    Stock,
    _apply_calls,
    _apply_earnings,
    _apply_news,
    _apply_premarket,
    stocks_by_id,
)
from backend.subscription_entitlement import FREE_COVERED_STOCKS

COLLECTION = "tm_email_subscribers"
# lib/seo/stock-pages.ts FEATURED_STOCK_TICKERS: the market set for a signup with no stock (a test keeps them equal).
MARKET_TICKERS = ["NVDA", "MSFT", "AAPL", "AMZN", "GOOGL", "META", "TSLA", "AVGO", "AMD", "PLTR"]
MAX_TICKERS = 10  # lib/email-subscribers.ts MAX_SUBSCRIBER_TICKERS
REASON = "You get this because you asked for the morning email on stocksbrew."
_TICKER = re.compile(r"^[A-Z][A-Z0-9]{0,5}(?:[.-][A-Z]{1,2})?$")
_ID = re.compile(r"^[a-f0-9]{64}$")


@dataclass
class Subscriber:
    id: str
    email: str
    tickers: list[str]

    @property
    def uid(self) -> str:
        """The pseudo uid the send log and dedupe use: never an account's (those are Firebase ids, no prefix)."""
        return f"sub_{self.id[:32]}"


def instrument_id(ticker: str) -> str:
    """"BRK.B" -> "US_BRK_B" (lib/email-subscribers.ts instrumentIdOf)."""
    return "US_" + re.sub(r"[.-]", "_", ticker)


# ------------------------------------------------------------------ links

def stop_token(sub_id: str) -> str:
    secret = os.environ.get("EMAIL_UNSUBSCRIBE_SECRET", "").encode()
    if not secret:
        return ""
    mac = hmac.new(secret, f"sub:{sub_id}:stop".encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(mac[:18]).decode().rstrip("=")


def stop_url(sub_id: str, *, api: bool = False) -> str:
    token = stop_token(sub_id)
    path = "/api/email/subscribe/stop" if api else "/email/stop"
    return f"{kit.APP_URL}{path}?{urlencode({'s': sub_id, 't': token})}"


def signup_url(tickers: list[str]) -> str:
    """The landing with the stocks already picked (`/?try=`, components/oa/landing/taste.tsx): signing up there keeps
    them, and /api/auth/session also seeds them from the confirmed signup."""
    picks = tickers[:FREE_COVERED_STOCKS]
    return kit.app_url("/", **({"try": ",".join(picks)} if picks else {}), utm_source="email", utm_medium="morning_brief")


def links_for(sub: Subscriber) -> daily.NoAccount:
    if len(sub.tickers) == 1:
        open_label, open_url = f"Open {sub.tickers[0]}", kit.stock_url(sub.tickers[0])
    else:
        open_label, open_url = "Open today's news", kit.app_url("/news")
    return daily.NoAccount(
        open_label=open_label,
        open_url=open_url,
        signup_label=f"Make it yours: pick {FREE_COVERED_STOCKS} stocks free",
        signup_url=signup_url(sub.tickers),
        stop_url=stop_url(sub.id),
        reason=REASON,
    )


# ------------------------------------------------------------------ who

def active(doc: dict[str, Any]) -> bool:
    return bool(doc.get("confirmed_at")) and not doc.get("unsubscribed_at") and not doc.get("linked_uid")


def clean_tickers(raw: Any) -> list[str]:
    out: list[str] = []
    for t in raw if isinstance(raw, list) else []:
        t = str(t or "").strip().upper()
        if _TICKER.match(t) and t not in out:
            out.append(t)
    return out[:MAX_TICKERS]


def select(rows: Iterable[tuple[str, dict[str, Any]]], account_emails: set[str]) -> list[Subscriber]:
    """The records the morning brief goes to: active, a valid id and address, and no account uses the address."""
    out = []
    for path, doc in rows:
        sub_id = path.rsplit("/", 1)[-1]
        email = str(doc.get("email") or "").strip().lower()
        if not _ID.match(sub_id) or "@" not in email or not active(doc) or email in account_emails:
            continue
        out.append(Subscriber(sub_id, email, clean_tickers(doc.get("tickers"))))
    return out


def load(src, account_emails: set[str]) -> list[Subscriber]:
    rows = src.query(COLLECTION, [], limit=20000,
                     select=["email", "tickers", "confirmed_at", "unsubscribed_at", "linked_uid"])
    return select(rows, account_emails)


def account_emails(src) -> set[str]:
    rows = src.query("users", [], limit=20000, select=["email", "email_lower"])
    out: set[str] = set()
    for _, d in rows:
        for key in ("email", "email_lower"):
            v = str(d.get(key) or "").strip().lower()
            if v:
                out.add(v)
    return out


# ------------------------------------------------------------------ stocks

def load_stocks(src, tickers: list[str], now: datetime) -> dict[str, Stock]:
    """Every stock any subscriber follows, plus the market set, read once per run: price, history, the latest call
    (its word only: no level, see the module note), earnings, this morning's pre-market and the news."""
    ids = list(dict.fromkeys(instrument_id(t) for t in tickers))
    stocks = [s for s in stocks_by_id(src, ids, now=now) if s.name or s.price is not None]
    _apply_calls(src, stocks, now)
    for s in stocks:
        for c in s.calls:
            c.trigger_type, c.trigger_value = "", None  # no level crossings without an account
        if s.calls:
            latest = s.calls[-1]
            s.stance, s.call_text, s.call_reason = latest.stance, latest.text, latest.reason
        s.add_below = s.trim_above = None
    _apply_earnings(src, stocks, now)
    _apply_premarket(src, stocks, now)
    _apply_news(src, stocks, now)
    return {s.ticker: s for s in stocks}


def person_for(sub: Subscriber, stocks: dict[str, Stock]) -> Person:
    mine = [stocks[t] for t in (sub.tickers or MARKET_TICKERS) if t in stocks]
    ids = [s.id for s in mine]
    # is_pro only means "every stock here is emailed": there is no plan, and the Pro line is never shown (no_account)
    return Person(uid=sub.uid, email=sub.email, first_name="", is_pro=True, created_at=None, last_seen=None,
                  tracked_ids=ids, covered_ids=ids, stocks=mine, view_built_at=None)


def build(sub: Subscriber, stocks: dict[str, Stock], *, now: datetime, market: dict[str, Stock]) -> tuple[kit.Email, str] | None:
    """The email and its dedupe key (one per market session), or None on a quiet day for these stocks."""
    person = person_for(sub, stocks)
    if not person.stocks:
        return None
    email = daily.build_daily(person, now=now, market=market, no_account=links_for(sub))
    if email is None:
        return None
    session = max((s.price_at for s in person.stocks if s.price_at), default=None)
    day = session.astimezone(ET).date().isoformat() if session else now.astimezone(ET).date().isoformat()
    return email, f"subscriber_daily_{day}"
