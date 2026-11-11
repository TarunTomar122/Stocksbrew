"""Gather the facts an email needs for one person, from real stored data.

Nothing here invents a number. When a fact is missing or stale it is left
out, and templates are written to read correctly without it.
"""
from __future__ import annotations

import html
import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from backend.mail.source import Source
from backend.subscription_entitlement import FREE_COVERED_STOCKS, covered_instrument_ids, is_pro_user

ET = ZoneInfo("America/New_York")
# FREE_COVERED_STOCKS comes from backend.subscription_entitlement (5, or 3 on PAYWALL_V2).
PRICE_MAX_AGE_HOURS = 80  # a Friday close is still "the last close" on Monday morning
VIEW_MAX_AGE_HOURS = 72

BULLISH = {"accumulate", "buy", "add"}
BEARISH = {"trim", "avoid", "sell", "reduce"}


def parse_ts(value: Any) -> datetime | None:
    s = str(value or "").strip()
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        try:
            dt = datetime.fromisoformat(s[:10])
        except ValueError:
            return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def direction(stance: str) -> str:
    s = (stance or "").lower()
    return "bullish" if s in BULLISH else "bearish" if s in BEARISH else "neutral"


def clean_text(value: Any, limit: int = 220) -> str:
    s = html.unescape(str(value or "")).strip()
    s = re.sub(r"\s+", " ", s)
    s = re.sub(r"\s+-\s+(Benzinga|Yahoo Finance|Reuters|MarketWatch|Bloomberg|CNBC)$", "", s)
    if len(s) > limit:
        s = s[: limit - 1].rsplit(" ", 1)[0].rstrip(",;:") + "…"
    return s


# ---------------------------------------------------------------- records

@dataclass
class Headline:
    title: str
    source: str
    url: str
    published_at: datetime
    summary: str = ""


@dataclass
class Call:
    day: str
    stance: str
    text: str
    reason: str
    price: float | None
    return_7d: float | None = None  # raw price change 7 days after the call, when known
    trigger_type: str = ""
    trigger_value: float | None = None


@dataclass
class Stock:
    id: str
    ticker: str
    name: str
    position: str  # holding | watchlist
    price: float | None = None
    prev_close: float | None = None
    change_pct: float | None = None
    price_at: datetime | None = None
    add_below: float | None = None
    trim_above: float | None = None
    stance: str = ""
    call_text: str = ""
    call_reason: str = ""
    previous_stance: str = ""
    previous_call_text: str = ""
    week_change_pct: float | None = None
    earnings_date: date | None = None
    earnings_time: str = ""
    news: list[Headline] = field(default_factory=list)
    calls: list[Call] = field(default_factory=list)
    dates: list[str] = field(default_factory=list, repr=False)
    closes: list[float] = field(default_factory=list, repr=False)

    @property
    def typical_move_pct(self) -> float | None:
        """Median absolute daily move over the last 60 sessions."""
        c = self.closes[-61:]
        moves = sorted(abs(b - a) / a * 100 for a, b in zip(c, c[1:]) if a)
        return moves[len(moves) // 2] if len(moves) >= 20 else None

    def stable_before_change(self, runs: int = 3) -> bool:
        """The call before the latest one held for `runs` calls, so this isn't a flip-flop."""
        if len(self.calls) < runs + 1:
            return False
        prior = self.calls[-1 - runs : -1]
        return len({c.stance for c in prior}) == 1 and prior[-1].stance != self.calls[-1].stance

    def standing_levels(self) -> tuple[float | None, float | None]:
        """The add and trim levels that were in place before the last session.

        A new call often resets its level to the closing price, so checking a
        close against the call made after it would always "cross". Use the
        latest call dated before the session the price is from.
        """
        if self.price_at is None:
            return None, None
        session = self.price_at.astimezone(ET).date().isoformat()
        prior = [c for c in self.calls if c.day < session]
        if not prior:
            return None, None
        c = prior[-1]
        if c.trigger_type == "price_below":
            return c.trigger_value, None
        if c.trigger_type == "price_above":
            return None, c.trigger_value
        return None, None

    def close_after(self, day: str, sessions: int) -> float | None:
        """The close `sessions` trading days after `day`, if it has happened."""
        for i, d in enumerate(self.dates):
            if d[:10] > day[:10]:
                j = i + sessions - 1
                return self.closes[j] if j < len(self.closes) else None
        return None


@dataclass
class Person:
    uid: str
    email: str
    first_name: str
    is_pro: bool
    created_at: datetime | None
    last_seen: datetime | None
    tracked_ids: list[str]
    covered_ids: list[str]
    stocks: list[Stock]
    view_built_at: datetime | None

    @property
    def emailed_ids(self) -> list[str]:
        """The stocks the daily covers: all of them on Pro, the covered five on Free."""
        return self.tracked_ids if self.is_pro else self.covered_ids

    def emailed_stocks(self) -> list[Stock]:
        keep = set(self.emailed_ids)
        return [s for s in self.stocks if s.id in keep]

    def uncovered_stocks(self) -> list[Stock]:
        keep = set(self.emailed_ids)
        return [s for s in self.stocks if s.id not in keep]


def first_name(display_name: Any, email: str) -> str:
    name = str(display_name or "").strip().split(" ")[0]
    if name and name.isalpha() and len(name) <= 20:
        return name[:1].upper() + name[1:]
    return ""


def covered_ids(user: dict[str, Any], tracked: list[str], is_pro: bool) -> list[str]:
    if is_pro:
        return tracked
    explicit = user.get("covered_stocks")
    if isinstance(explicit, list):
        return [i for i in explicit if i in tracked][:FREE_COVERED_STOCKS]
    return tracked[:FREE_COVERED_STOCKS]


# ---------------------------------------------------------------- loaders

def load_person(src: Source, uid: str, *, now: datetime | None = None, with_news: bool = True, with_calls: bool = True) -> Person | None:
    now = now or datetime.now(timezone.utc)
    user = src.get(f"users/{uid}")
    if not user:
        return None
    view = src.get(f"tm_watchlist_views/{uid}") or {}
    rows = [r for r in view.get("rows") or [] if r.get("instrument_id") and (r.get("market") or "US") == "US"]
    tracked = [str(i) for i in (user.get("tracked_stocks") or []) if str(i).startswith("US_")]
    if not tracked:
        tracked = [r["instrument_id"] for r in rows]
    is_pro = is_pro_user(user)
    person = Person(
        uid=uid,
        email=str(user.get("email") or user.get("email_lower") or ""),
        first_name=first_name(user.get("display_name"), str(user.get("email") or "")),
        is_pro=is_pro,
        created_at=parse_ts(user.get("created_at")),
        last_seen=parse_ts(user.get("last_sign_in_at")),
        tracked_ids=tracked,
        covered_ids=[i for i in covered_instrument_ids(user, is_pro) if i in tracked] or covered_ids(user, tracked, is_pro),
        stocks=[],
        view_built_at=parse_ts(view.get("built_at") or view.get("updated_at")),
    )
    by_id = {r["instrument_id"]: r for r in rows}
    ids = [i for i in tracked]
    instruments = src.get_many([f"tm_instruments/{i}" for i in ids])
    prices = src.get_many([f"tm_latest_prices/{i}" for i in ids])
    holdings = set(str(h) for h in (user.get("watchlist_holdings") or []))
    for iid in ids:
        row = by_id.get(iid, {})
        inst = instruments.get(f"tm_instruments/{iid}", {})
        ticker = str(row.get("ticker") or inst.get("ticker") or iid.split("_", 1)[-1]).upper()
        stock = Stock(
            id=iid,
            ticker=ticker,
            name=clean_text(inst.get("name") or ticker, 60),
            position="holding" if (row.get("position_type") == "holding" or iid in holdings) else "watchlist",
        )
        _apply_price(stock, prices.get(f"tm_latest_prices/{iid}"), now)
        directive = row.get("directive_v2") or row.get("ai_directive") or {}
        zones = directive.get("zones") or {}
        stock.add_below = _num(zones.get("accumulate_below"))
        stock.trim_above = _num(zones.get("trim_above"))
        stock.stance = str(directive.get("stance") or "")
        stock.call_text = clean_text(directive.get("title") or directive.get("text") or row.get("ai_directive_text") or "", 80)
        stock.call_reason = clean_text(directive.get("detail") or directive.get("rationale") or "", 240)
        person.stocks.append(stock)
    _apply_week_change(src, person.stocks)
    if with_calls:
        _apply_calls(src, person.stocks, now)
    _apply_earnings(src, person.stocks, now)
    if with_news:
        _apply_news(src, person.stocks, now)
    return person


def _num(value: Any) -> float | None:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    return v if v == v and v > 0 else None


def _apply_price(stock: Stock, doc: dict[str, Any] | None, now: datetime) -> None:
    if not doc:
        return
    quote = doc.get("quote") or {}
    at = parse_ts(quote.get("captured_at") or doc.get("captured_at"))
    if at is None or now - at > timedelta(hours=PRICE_MAX_AGE_HOURS):
        return
    stock.price = _num(quote.get("current"))
    stock.prev_close = _num(quote.get("previous_close"))
    chg = quote.get("day_change_pct")
    stock.change_pct = float(chg) if isinstance(chg, (int, float)) else None
    stock.price_at = at


def _apply_week_change(src: Source, stocks: list[Stock]) -> None:
    docs = src.get_many([f"tm_price_history_daily/{s.ticker}" for s in stocks])
    for s in stocks:
        doc = docs.get(f"tm_price_history_daily/{s.ticker}") or {}
        closes, dates = doc.get("closes") or [], doc.get("dates") or []
        if len(closes) != len(dates):
            continue
        # drop sessions with a missing or non-positive close rather than failing the whole email
        pairs = [(str(d)[:10], float(c)) for d, c in zip(dates, closes) if _num(c) is not None and d]
        if len(pairs) < 6:
            continue
        pairs = pairs[-260:]
        s.dates = [d for d, _ in pairs]
        s.closes = [c for _, c in pairs]
        # five sessions back: last Friday's close when this runs on a weekend
        base = s.closes[-6]
        s.week_change_pct = (s.closes[-1] - base) / base * 100


def _apply_calls(src: Source, stocks: list[Stock], now: datetime) -> None:
    for s in stocks:
        rows = src.children(f"tm_directive_history/{s.id}", "calls", limit=200)
        calls: list[Call] = []
        for path, d in sorted(rows, key=lambda r: r[0]):
            outcome = ((d.get("outcomes") or {}).get("7d") or {}).get("return_pct")
            calls.append(
                Call(
                    day=path.rsplit("/", 1)[-1][:10],
                    stance=str(d.get("stance") or "").lower(),
                    text=clean_text(d.get("text") or "", 80),
                    reason=clean_text(d.get("rationale") or "", 200),
                    price=_num(d.get("price_at_call")),
                    return_7d=float(outcome) if isinstance(outcome, (int, float)) else None,
                    trigger_type=str(d.get("trigger_type") or ""),
                    trigger_value=_num(d.get("trigger_value")),
                )
            )
        s.calls = calls
        if len(calls) >= 2:
            latest = calls[-1]
            prev = next((c for c in reversed(calls[:-1]) if c.stance != latest.stance), None)
            # only treat it as a change when the switch happened on the latest call
            if prev and calls[-2].stance != latest.stance:
                s.previous_stance = prev.stance
                s.previous_call_text = prev.text


def _apply_earnings(src: Source, stocks: list[Stock], now: datetime) -> None:
    today = now.astimezone(ET).date()
    end = today + timedelta(days=10)
    rows = src.query(
        "tm_earnings_events",
        [("event_date", ">=", today.isoformat()), ("event_date", "<=", end.isoformat())],
        limit=5000,
        select=["ticker", "event_date", "time", "market"],
    )
    by_ticker: dict[str, tuple[date, str]] = {}
    for _, d in rows:
        t = str(d.get("ticker") or "").upper()
        try:
            day = date.fromisoformat(str(d.get("event_date"))[:10])
        except ValueError:
            continue
        if t and (t not in by_ticker or day < by_ticker[t][0]):
            by_ticker[t] = (day, str(d.get("time") or "").lower())
    for s in stocks:
        if s.ticker in by_ticker:
            s.earnings_date, s.earnings_time = by_ticker[s.ticker]


def _apply_news(src: Source, stocks: list[Stock], now: datetime, hours: int = 80) -> None:
    cutoff = (now - timedelta(hours=hours)).isoformat()
    by_ticker = {s.ticker: s for s in stocks}
    tickers = list(by_ticker)
    for i in range(0, len(tickers), 10):
        chunk = tickers[i : i + 10]
        rows = src.query(
            "tm_agent_news",
            [("stock_tickers", "array-contains-any", chunk), ("published_at", ">=", cutoff)],
            limit=300,
            select=["title", "source_name", "stock_tickers", "published_at", "url", "summary"],
        )
        for _, d in rows:
            title = clean_text(d.get("title"), 160)
            at = parse_ts(d.get("published_at"))
            if not title or at is None:
                continue
            for t in d.get("stock_tickers") or []:
                s = by_ticker.get(str(t).upper())
                if s and _mentions(title, s) and is_reason_headline(title):
                    s.news.append(
                        Headline(title, str(d.get("source_name") or ""), str(d.get("url") or ""), at, clean_text(d.get("summary"), 240))
                    )
    for s in stocks:
        seen: set[str] = set()
        unique = []
        for h in sorted(s.news, key=lambda h: h.published_at, reverse=True):
            key = h.title.lower()[:60]
            if key not in seen:
                seen.add(key)
                unique.append(h)
        s.news = unique[:6]


LISTICLE = re.compile(
    r"(\b\d+\s+(top|best|cheap|undervalued|growth|dividend|ai|tech)\b|\btop\s+\d+\b|stocks? to (buy|watch|sell)|"
    r"should you (buy|sell)|\bis .{1,40} a (buy|sell)\b|undervalued stocks|millionaire|motley|zacks rank|"
    r"\bbetter (buy|stock)\b|\bvs\.?\b|prediction:|could soar|here'?s why|what to know|buy the dip|"
    r"heads? (these|this)|\bETFs?\b.*\b(adds?|buys?|sells?|net (buyers|sellers))\b|"
    r"\b(adds|buys|sells|trims)\b.{0,60}\bon (monday|tuesday|wednesday|thursday|friday)\b|"
    # chart-reading pieces describe a price, they don't explain it
    r"support and resistance|levels? to watch|price prediction|technical analysis|\bcharts?\b|"
    # valuation opinion columns
    r"really (expensive|cheap)|steal of a deal|\b(over|under)valued\?|"
    # "Analyzing X as a beneficiary of ..." is a thesis column, not a report
    r"^\s*analy[sz]ing\b)",
    re.I,
)
# a question headline ("Is X really expensive?", "Should you buy Y?") is an opinion, not a reason
QUESTION = re.compile(r"\?\s*$|^\s*(is|are|should|can|could|will|would|why|what|how|does|do)\b[^?]{0,120}\?", re.I)


def is_reason_headline(title: str) -> bool:
    """Listicles, questions and chart-reading columns mention a company without explaining a move."""
    return not (LISTICLE.search(title) or QUESTION.search(title))


def _mentions(title: str, stock: Stock) -> bool:
    """Feeds tag loosely; only keep headlines that actually name the company."""
    t = title.lower()
    if re.search(rf"\b{re.escape(stock.ticker.lower())}\b", t):
        return True
    first = re.split(r"[ ,.]", stock.name.lower())[0]
    # word boundary, so "Meta" doesn't match "metals"
    return len(first) >= 4 and re.search(rf"\b{re.escape(first)}\b", t) is not None


# ------------------------------------------------------------ market-wide

def tracked_counts(src: Source, limit: int = 12) -> list[tuple[str, int]]:
    rows = src.query("tm_tracked_instruments", [("market", "==", "US")], limit=5000, select=["instrument_id", "tracked_count"])
    ranked = sorted(((d.get("instrument_id") or p.split("/")[-1], int(d.get("tracked_count") or 0)) for p, d in rows), key=lambda r: -r[1])
    return ranked[:limit]


def stocks_by_id(src: Source, ids: list[str], *, now: datetime | None = None) -> list[Stock]:
    now = now or datetime.now(timezone.utc)
    inst = src.get_many([f"tm_instruments/{i}" for i in ids])
    prices = src.get_many([f"tm_latest_prices/{i}" for i in ids])
    out = []
    for iid in ids:
        meta = inst.get(f"tm_instruments/{iid}") or {}
        s = Stock(id=iid, ticker=str(meta.get("ticker") or iid.split("_", 1)[-1]).upper(), name=clean_text(meta.get("name") or "", 60), position="watchlist")
        _apply_price(s, prices.get(f"tm_latest_prices/{iid}"), now)
        out.append(s)
    _apply_week_change(src, out)
    return out
