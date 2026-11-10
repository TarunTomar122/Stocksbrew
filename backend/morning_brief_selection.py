"""Pick which stock briefs the morning (after-open) run rewrites.

The morning run fires right after the settled 09:50 ET price batch. A stock
gets a fresh brief when at least one of these is true:

- ``news``: its news changed since the last brief (the pre-open discovery run
  set ``needs_brief_refresh``), or it has no brief yet (``missing_brief``).
- ``move``: today's move since the previous close is material, i.e.
  ``|move| >= 3%`` or ``|move| >= 2x`` the stock's typical daily move over the
  last three months (median absolute daily close-to-close change), and the
  last brief was written before the quote it would describe.
- ``earnings``: a stock a Pro member holds released earnings after the last
  brief was written, or the last brief never saw a post-release article.
- ``zone``: today's anomaly movers and Reddit-buzz names whose brief is
  missing or older than a day (the old ``zone-briefs`` timer's job).

The pure selection is separate from the store loaders so it can be tested with
fake prices and news.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from statistics import median
from typing import Any, Iterable, Mapping
from zoneinfo import ZoneInfo

NEW_YORK = ZoneInfo("America/New_York")

MOVE_THRESHOLD_PCT = 3.0
TYPICAL_MOVE_MULTIPLE = 2.0
# A 2x-typical move on a near-flat instrument (treasury ETFs, utilities on a
# quiet quarter) is still noise below this floor.
MIN_RELATIVE_MOVE_PCT = 1.0
TYPICAL_MOVE_SESSIONS = 63  # about three months of trading days
MIN_TYPICAL_MOVE_SAMPLES = 20
EARNINGS_LOOKBACK_HOURS = 96  # Thursday after-close print -> Monday morning
EARNINGS_SETTLED_HOURS = 12
ZONE_MAX_AGE_HOURS = 24
DEFAULT_BRIEF_CAP = 160

# Reason order is also the priority order when the cap bites.
REASON_PRIORITY = ("earnings", "move", "missing_brief", "news", "zone")

# Nasdaq calendar timing labels -> approximate New York release time.
_EARNINGS_RELEASE_TIME = {
    "bmo": time(7, 0),
    "pre-market": time(7, 0),
    "during": time(12, 0),
    "dmh": time(12, 0),
    "amc": time(16, 0),
    "after-hours": time(16, 0),
}
_DEFAULT_EARNINGS_RELEASE_TIME = time(16, 0)


def parse_time(value: object) -> datetime | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _finite(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number and number not in (float("inf"), float("-inf")) else None


def day_move_pct(latest_price: Mapping[str, Any] | None) -> float | None:
    """Move since the previous close, from the stored quote."""
    quote = (latest_price or {}).get("quote")
    if not isinstance(quote, Mapping):
        return None
    move = _finite(quote.get("day_change_pct"))
    if move is not None:
        return move
    current = _finite(quote.get("current"))
    previous = _finite(quote.get("previous_close"))
    if current is None or previous is None or previous <= 0:
        return None
    return (current - previous) / previous * 100


def quote_captured_at(latest_price: Mapping[str, Any] | None) -> datetime | None:
    payload = latest_price or {}
    quote = payload.get("quote") if isinstance(payload.get("quote"), Mapping) else {}
    return parse_time(quote.get("captured_at") or payload.get("captured_at"))


def typical_daily_move_pct(
    closes: Iterable[Any],
    *,
    sessions: int = TYPICAL_MOVE_SESSIONS,
    min_samples: int = MIN_TYPICAL_MOVE_SAMPLES,
) -> float | None:
    """Median absolute close-to-close move over the last ``sessions`` days."""
    clean = [value for value in (_finite(item) for item in closes) if value is not None and value > 0]
    clean = clean[-(sessions + 1):]
    moves = [abs(curr - prev) / prev * 100 for prev, curr in zip(clean, clean[1:])]
    if len(moves) < max(1, min_samples):
        return None
    return median(moves)


def closes_before(dates: Iterable[Any], closes: Iterable[Any], day: date) -> list[Any]:
    """Daily closes strictly before ``day`` so today's partial bar never counts."""
    cutoff = day.isoformat()
    return [close for stamp, close in zip(dates, closes) if str(stamp or "")[:10] and str(stamp)[:10] < cutoff]


def earnings_release_at(event: Mapping[str, Any]) -> datetime | None:
    raw_date = str(event.get("event_date") or "")[:10]
    try:
        event_day = date.fromisoformat(raw_date)
    except ValueError:
        return None
    label = str(event.get("time") or event.get("hour") or "").strip().lower()
    release_time = _EARNINGS_RELEASE_TIME.get(label, _DEFAULT_EARNINGS_RELEASE_TIME)
    return datetime.combine(event_day, release_time, tzinfo=NEW_YORK).astimezone(timezone.utc)


def previous_session_lookback_hours(
    session_dates: Iterable[str],
    *,
    now: datetime,
    minimum: float = 24.0,
    maximum: float = 120.0,
) -> int:
    """Hours of news a morning brief should read: since the previous session opened.

    A flat 24h window on Monday morning starts on Sunday and silently drops
    Friday's after-close news. Provider daily bars carry real session dates,
    so weekends and exchange holidays come out right without a calendar.
    """
    today = now.astimezone(NEW_YORK).date()
    previous = sorted({str(day)[:10] for day in session_dates if str(day or "")[:10] and str(day)[:10] < today.isoformat()})
    if previous:
        previous_day = date.fromisoformat(previous[-1])
    else:
        previous_day = today - timedelta(days=1)
        while previous_day.weekday() >= 5:
            previous_day -= timedelta(days=1)
    opened = datetime.combine(previous_day, time(9, 30), tzinfo=NEW_YORK)
    hours = (now - opened).total_seconds() / 3600
    return int(min(maximum, max(minimum, hours)) + 0.999)


@dataclass
class MorningSelection:
    selected: list[str]
    reasons: dict[str, list[str]]
    moves: dict[str, float]
    typical_moves: dict[str, float]
    skipped_fresh: list[str]
    dropped_by_cap: list[str]
    candidate_count: int
    cap: int

    def summary(self, *, sample: int = 25) -> dict[str, Any]:
        by_reason = {reason: 0 for reason in REASON_PRIORITY}
        for instrument_id in self.selected:
            for reason in self.reasons.get(instrument_id, []):
                by_reason[reason] = by_reason.get(reason, 0) + 1
        return {
            "candidates": self.candidate_count,
            "selected": len(self.selected),
            "selected_by_reason": by_reason,
            "skipped_fresh": len(self.skipped_fresh),
            "dropped_by_cap": len(self.dropped_by_cap),
            "cap": self.cap,
            "selected_ids": [
                {
                    "id": instrument_id,
                    "reasons": self.reasons.get(instrument_id, []),
                    "move_pct": round(self.moves[instrument_id], 2) if instrument_id in self.moves else None,
                    "typical_pct": (
                        round(self.typical_moves[instrument_id], 2)
                        if instrument_id in self.typical_moves
                        else None
                    ),
                }
                for instrument_id in self.selected[:sample]
            ],
            "dropped_ids": self.dropped_by_cap[:sample],
        }


def _last_brief_at(
    freshness: Mapping[str, Any] | None,
    brief: Mapping[str, Any] | None,
) -> datetime | None:
    stamps = [
        parse_time((freshness or {}).get("latest_brief_at")),
        parse_time((brief or {}).get("generated_at")),
    ]
    known = [stamp for stamp in stamps if stamp is not None]
    return max(known) if known else None


def _is_material_move(move: float, typical: float | None) -> bool:
    size = abs(move)
    if size >= MOVE_THRESHOLD_PCT:
        return True
    if typical is None or typical <= 0:
        return False
    return size >= MIN_RELATIVE_MOVE_PCT and size >= TYPICAL_MOVE_MULTIPLE * typical


def _earnings_needs_brief(
    events: Iterable[Mapping[str, Any]],
    *,
    last_brief_at: datetime | None,
    latest_article_at: datetime | None,
    now: datetime,
) -> bool:
    for event in events:
        released = earnings_release_at(event)
        if released is None or released > now:
            continue
        if now - released > timedelta(hours=EARNINGS_LOOKBACK_HOURS):
            continue
        if last_brief_at is None or last_brief_at < released:
            return True
        # A brief written minutes after an after-close print was built from
        # the pre-close news prep. It only counts once it saw a post-release
        # article or was written well after the release.
        if last_brief_at - released >= timedelta(hours=EARNINGS_SETTLED_HOURS):
            continue
        if latest_article_at is None or latest_article_at < released:
            return True
    return False


def select_morning_briefs(
    candidate_ids: Iterable[str],
    *,
    prices: Mapping[str, Mapping[str, Any]],
    freshness: Mapping[str, Mapping[str, Any]],
    briefs: Mapping[str, Mapping[str, Any]],
    typical_moves: Mapping[str, float | None],
    earnings_by_id: Mapping[str, list[Mapping[str, Any]]],
    held_ids: Iterable[str],
    zone_ids: Iterable[str],
    now: datetime,
    cap: int = DEFAULT_BRIEF_CAP,
) -> MorningSelection:
    held = {str(item).upper() for item in held_ids}
    zone = {str(item).upper() for item in zone_ids}
    ordered: list[str] = []
    seen: set[str] = set()
    for raw in candidate_ids:
        instrument_id = str(raw or "").strip().upper()
        if instrument_id and instrument_id not in seen:
            seen.add(instrument_id)
            ordered.append(instrument_id)

    reasons: dict[str, list[str]] = {}
    moves: dict[str, float] = {}
    typical_out: dict[str, float] = {}
    skipped: list[str] = []
    for instrument_id in ordered:
        fresh_doc = freshness.get(instrument_id) or {}
        brief = briefs.get(instrument_id) or {}
        last_brief = _last_brief_at(fresh_doc, brief)
        found: list[str] = []

        latest_price = prices.get(instrument_id)
        move = day_move_pct(latest_price)
        typical = typical_moves.get(instrument_id)
        if move is not None:
            moves[instrument_id] = move
        if typical is not None:
            typical_out[instrument_id] = typical

        if instrument_id in held and _earnings_needs_brief(
            earnings_by_id.get(instrument_id) or [],
            last_brief_at=last_brief,
            latest_article_at=parse_time(fresh_doc.get("latest_article_at")),
            now=now,
        ):
            found.append("earnings")

        captured = quote_captured_at(latest_price)
        if (
            move is not None
            and _is_material_move(move, typical)
            and (last_brief is None or captured is None or last_brief < captured)
        ):
            found.append("move")

        if not brief:
            found.append("missing_brief")
        elif bool(fresh_doc.get("needs_brief_refresh")):
            found.append("news")

        if instrument_id in zone and (
            last_brief is None or now - last_brief > timedelta(hours=ZONE_MAX_AGE_HOURS)
        ):
            found.append("zone")

        if found:
            reasons[instrument_id] = found
        else:
            skipped.append(instrument_id)

    position = {instrument_id: index for index, instrument_id in enumerate(ordered)}

    def rank(instrument_id: str) -> tuple[int, float, int]:
        best = min(REASON_PRIORITY.index(reason) for reason in reasons[instrument_id])
        return (best, -abs(moves.get(instrument_id, 0.0)), position[instrument_id])

    ranked = sorted(reasons, key=rank)
    limit = int(cap) if cap and int(cap) > 0 else len(ranked)  # 0 or negative: no cap
    selected = ranked[:limit]
    dropped = ranked[limit:]
    return MorningSelection(
        selected=selected,
        reasons={instrument_id: reasons[instrument_id] for instrument_id in ranked},
        moves=moves,
        typical_moves=typical_out,
        skipped_fresh=skipped,
        dropped_by_cap=dropped,
        candidate_count=len(ordered),
        cap=limit,
    )


# ---------------------------------------------------------------------------
# Store loaders (thin; everything above is pure)
# ---------------------------------------------------------------------------


def _ticker_for(instrument_id: str, latest_price: Mapping[str, Any] | None) -> str:
    ticker = str((latest_price or {}).get("ticker") or "").strip().upper()
    if ticker:
        return ticker
    return instrument_id.split("_", 1)[1] if "_" in instrument_id else instrument_id


def load_typical_moves(
    store: Any,
    instrument_ids: list[str],
    prices: Mapping[str, Mapping[str, Any]],
    *,
    now: datetime,
) -> dict[str, float | None]:
    """Typical daily move from ``tm_price_history_daily`` (adjusted daily closes).

    Falls back to the latest-price ``recent_sessions``/``history_window`` bars
    when a symbol has no daily-history document yet.
    """
    today = now.astimezone(NEW_YORK).date()
    tickers = {instrument_id: _ticker_for(instrument_id, prices.get(instrument_id)) for instrument_id in instrument_ids}
    collection = store.db.collection("tm_price_history_daily")
    docs: dict[str, dict[str, Any]] = {}
    unique = sorted({ticker.replace("/", "-") for ticker in tickers.values() if ticker})
    for start in range(0, len(unique), 300):
        refs = [collection.document(ticker) for ticker in unique[start:start + 300]]
        for snap in store.db.get_all(refs):
            if snap.exists:
                docs[snap.id] = snap.to_dict() or {}
    out: dict[str, float | None] = {}
    for instrument_id, ticker in tickers.items():
        doc = docs.get(ticker.replace("/", "-")) or {}
        dates, closes = doc.get("dates") or [], doc.get("closes") or []
        typical = None
        if dates and len(dates) == len(closes):
            typical = typical_daily_move_pct(closes_before(dates, closes, today))
        if typical is None:
            latest = prices.get(instrument_id) or {}
            bars = [
                row for row in (latest.get("history_window") or [])
                if isinstance(row, Mapping)
            ]
            by_day: dict[str, Any] = {}
            for row in bars:
                quote = row.get("quote") if isinstance(row.get("quote"), Mapping) else {}
                day = str(row.get("captured_at") or quote.get("captured_at") or "")[:10]
                if day and day < today.isoformat():
                    by_day[day] = quote.get("current")
            typical = typical_daily_move_pct([by_day[day] for day in sorted(by_day)])
        out[instrument_id] = typical
    return out


def load_recent_earnings(
    store: Any,
    market: str,
    instrument_ids: list[str],
    prices: Mapping[str, Mapping[str, Any]],
    *,
    now: datetime,
) -> dict[str, list[dict[str, Any]]]:
    if not instrument_ids:
        return {}
    today = now.astimezone(NEW_YORK).date()
    low = (today - timedelta(days=EARNINGS_LOOKBACK_HOURS // 24 + 1)).isoformat()
    by_ticker = {_ticker_for(instrument_id, prices.get(instrument_id)): instrument_id for instrument_id in instrument_ids}
    out: dict[str, list[dict[str, Any]]] = {}
    query = (
        store.db.collection("tm_earnings_events")
        .where("market", "==", market.upper())
        .where("event_date", ">=", low)
        .where("event_date", "<=", today.isoformat())
        .stream()
    )
    for snap in query:
        payload = snap.to_dict() or {}
        instrument_id = by_ticker.get(str(payload.get("ticker") or "").strip().upper())
        if instrument_id:
            out.setdefault(instrument_id, []).append(payload)
    return out


def session_dates_from_prices(prices: Mapping[str, Mapping[str, Any]]) -> list[str]:
    dates: list[str] = []
    for payload in prices.values():
        for row in (payload or {}).get("recent_sessions") or []:
            if isinstance(row, Mapping) and row.get("date"):
                dates.append(str(row["date"])[:10])
    return dates
