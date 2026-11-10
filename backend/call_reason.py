"""The short reason printed under a published call, written about this stock.

The call itself (ADD / HOLD / TRIM) is decided by ``directive_v2`` or the call
engine. This module never changes it. It only adds two fields to the finished
directive:

    call_reason         one or two plain sentences on what about this stock
                        leads to the call right now
    call_reason_source  "model" when the brief model wrote it and it passed
                        validation, "facts" when it was composed here from
                        the stock's own numbers and news

Before this existed every HOLD read "Upside and downside look balanced; keep
the position but do not force a new add.", word for word, on every stock.

The brief model is asked for three reasons, one per possible call, because it
writes the brief before the call is known. ``validate_reason`` rejects
anything generic, jargon-heavy, too long, not about this stock, or carrying a
number that was not in the model's input. When nothing valid comes back,
``compose_fallback_reason`` writes one from the stock's move, earnings date or
result, how it compares with similar companies, and the top worry or next
event from the brief.
"""

from __future__ import annotations

import json
import re
from datetime import date, datetime, timezone
from typing import Any

MAX_CHARS = 240
MIN_CHARS = 40
BUCKETS = ("add", "hold", "trim")

_STANCE_BUCKET = {
    "accumulate": "add",
    "buy": "add",
    "add": "add",
    "hold": "hold",
    "watch": "hold",
    "trim": "trim",
    "avoid": "trim",
    "sell": "trim",
    "reduce": "trim",
}

# Words and phrases that make a reason generic, jargon, or hedging. The old
# templates are all caught here ("risk/reward", "setup", "balanced", ...).
_BANNED = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"risk\s*[/-]\s*reward",
        r"upside and downside",
        r"\bset-?up\b",
        r"\bconstructive\b",
        r"\bconviction\b",
        r"\bthesis\b",
        r"\bexposure\b",
        r"\baccumulat",
        r"pullback into support",
        r"do not force",
        r"not paying enough",
        r"well[- ]positioned",
        r"could potentially",
        r"worth noting",
        r"remains to be seen",
        r"time will tell",
        r"\bheadwinds?\b",
        r"\btailwinds?\b",
        r"\bconsensus\b",
        r"\btape\b",
        r"\bcatalysts?\b",
        r"\bmomentum\b",
        r"price action",
        r"risk-(?:on|off)",
        r"re-?rating",
        r"multiple compression",
        r"investors should",
        r"mixed signals",
        r"\bbalanced\b",
        r"near-term",
        r"going forward",
        r"\bthe evidence\b",
        r"\bsentiment\b",
        r"\bsignals?\b",
        r"\boversold\b",
        r"\boverbought\b",
        r"\bRSI\b",
        r"moving average",
        r"\bresistance\b",
        r"support level",
        r"\bbreakout\b",
        r"valuation premium",
        r"\bdirective\b",
        r"\bstance\b",
        r"\bpolicy differs\b",
    )
]

# Template debris or placeholders the model sometimes leaves behind.
_PLACEHOLDER = re.compile(r"[{}\[\]<>]|\bN/A\b|\bXX+\b|\bTICKER\b|\bCOMPANY(?:_NAME)?\b")

# A share price or price level ("$168", "$250 target"). Levels are a paid
# feature and live in the zones, never in the reason. Deal sizes ("$26
# billion") are fine.
_PRICE_LEVEL = re.compile(
    r"\$\s?\d[\d,]*(?:\.\d+)?(?!\d)(?![.,]\d)(?!\s*(?:billion|million|trillion|bn\b|mn\b|[bmk]\b))",
    re.IGNORECASE,
)

_BUY_NOW = re.compile(r"today'?s price|current price|\bright now\b|\bright away\b|\bbuy now\b|\badd now\b|\bat these levels\b", re.IGNORECASE)

_NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?")

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z\"'])")

# A word in a card label that makes it a clause ("AML costs expand") rather
# than a noun phrase ("persistent cash burn"). Only noun phrases fit "the main
# worry is ...".
_LABEL_VERBS = {
    "is", "are", "was", "were", "be", "has", "have", "had", "can", "could", "may", "might", "will", "would",
    "drive", "drives", "expand", "expands", "fade", "fades", "keep", "keeps", "stay", "stays", "exceed",
    "exceeds", "fall", "falls", "get", "gets", "remain", "remains", "grow", "grows", "slow", "slows", "rise",
    "rises", "miss", "misses", "weaken", "weakens", "deteriorate", "deteriorates", "threaten", "threatens",
    "support", "supports", "see", "sees", "lack", "lacks", "lose", "loses", "outpace", "outpaces", "hit",
    "hits", "cut", "cuts", "raise", "raises", "lag", "lags", "trail", "trails", "still", "now", "beat",
    "beats", "need", "needs", "face", "faces", "hurt", "hurts", "pressure", "pressures", "weigh", "weighs",
}

_GENERIC_FIRST_WORDS = {
    "the", "first", "american", "united", "general", "international", "global", "national", "bank", "new",
    "royal", "south", "north", "west", "east", "public", "service", "digital", "energy", "health",
}

_NAME_SUFFIXES = (
    ", Inc.", ", Inc", " Inc.", " Inc", " Incorporated", " Corporation", " Corp.", " Corp", " Company",
    " Co.", " Holdings", " Holding", " Ltd.", " Ltd", " Limited", " plc", " PLC", " N.V.", " S.A.", " SE",
    " AG", " Group", " Technologies", " Technology", ", L.P.", " L.P.", " LP", " Class A", " Class B",
    " Common Stock", " Ordinary Shares", ",",
)


def bucket_for(stance: Any) -> str | None:
    """ADD / HOLD / TRIM bucket for a directive stance, as the web shows it."""
    return _STANCE_BUCKET.get(str(stance or "").strip().lower())


def _clean(value: Any) -> str:
    return " ".join(str(value or "").split()).strip()


def short_name(name: Any, ticker: Any) -> str:
    """'NVIDIA Corporation' -> 'NVIDIA', 'Micron Technology, Inc.' -> 'Micron'."""
    out = _clean(name)
    changed = True
    while out and changed:
        changed = False
        for suffix in _NAME_SUFFIXES:
            if out.endswith(suffix) and len(out) > len(suffix):
                out = out[: -len(suffix)].rstrip()
                changed = True
    return out[:40] or _clean(ticker).upper()


def _name_tokens(name: str, ticker: str) -> list[str]:
    tokens = [token for token in (ticker, short_name(name, ticker)) if token and len(token) >= 2]
    first = short_name(name, ticker).split(" ")[0] if name else ""
    if len(first) >= 3 and first.lower() not in _GENERIC_FIRST_WORDS:
        tokens.append(first)
    return tokens


def _mentions(text: str, token: str) -> bool:
    return re.search(rf"(?<![A-Za-z0-9]){re.escape(token)}(?![A-Za-z0-9])", text, re.IGNORECASE) is not None


def _proper_nouns(text: str) -> set[str]:
    """Capitalised words that are not at the start of a sentence."""
    out: set[str] = set()
    for match in re.finditer(r"(?<=[a-z,;:] )([A-Z][A-Za-z0-9&'-]{2,})", text):
        out.add(re.sub(r"['’]s$", "", match.group(1)).lower())
    return out


def _numbers(text: str) -> list[float]:
    out: list[float] = []
    for raw in _NUMBER.findall(text or ""):
        try:
            out.append(float(raw.replace(",", "")))
        except ValueError:
            continue
    return out


_DATE_LIKE = re.compile(r"\d{4}-\d{2}-\d{2}(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?")

# A percentage or money amount in the reason ("down 6%", "$26 billion").
_MEASURE = re.compile(r"\$\s?\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s?(?:%|percent\b)", re.IGNORECASE)


def _close_to_any(value: float, known: list[float]) -> bool:
    return any(abs(value - other) <= max(0.5, abs(other) * 0.01) for other in known)


def numbers_supported(reason: str, evidence_text: str) -> bool:
    """Every number in the reason appears (rounded) somewhere in the evidence.

    Percentages and money must match a real figure, not a piece of a date
    ("11%" is not supported by "2026-11-10"). Other numbers, such as the 17
    in "Nov 17", may match a date part.
    """
    all_numbers = _numbers(evidence_text)
    figures = _numbers(_DATE_LIKE.sub(" ", evidence_text or ""))
    measures = _MEASURE.findall(reason or "")
    for raw in measures:
        if not all(_close_to_any(value, figures) for value in _numbers(raw)):
            return False
    rest = _MEASURE.sub(" ", reason or "")
    return all(_close_to_any(value, all_numbers) for value in _numbers(rest))


def rejection_reason(
    text: Any,
    *,
    bucket: str,
    name: str,
    ticker: str,
    evidence_text: str,
) -> str | None:
    """Why a call reason is not publishable, or None when it is fine."""
    value = _clean(text).strip("\"'")
    if not value:
        return "empty"
    if len(value) < MIN_CHARS:
        return "too short"
    if len(value) > MAX_CHARS:
        return "too long"
    if value[-1] not in ".!?":
        return "not a full sentence"
    if len(_SENTENCE_SPLIT.split(value)) > 2:
        return "more than two sentences"
    if _PLACEHOLDER.search(value):
        return "placeholder text"
    if _PRICE_LEVEL.search(value):
        return "names a share price"
    for pattern in _BANNED:
        if pattern.search(value):
            return f"generic or jargon phrase: {pattern.pattern}"
    names = _name_tokens(name, ticker)
    if not any(_mentions(value, token) for token in names):
        # A specific product, person or event named in the input also counts
        # ("ANKTIVA sales slowed ...").
        if not (_proper_nouns(value) & _proper_nouns(evidence_text)):
            return "does not name the stock or its news"
    if not numbers_supported(value, evidence_text):
        return "number not in the input"
    lower = value.lower()
    if bucket == "add" and re.search(r"\bwe(?:'d| would) (?:sell|trim|reduce)\b", lower):
        return "contradicts the call"
    if bucket == "trim" and re.search(r"\bwe(?:'d| would) (?:add|buy)\b", lower):
        return "contradicts the call"
    if bucket == "hold" and re.search(r"\bwe(?:'d| would) (?:sell|trim)\b", lower):
        return "contradicts the call"
    return None


def validate_reason(text: Any, *, bucket: str, name: str, ticker: str, evidence_text: str) -> str | None:
    """The cleaned reason when it is publishable, else None."""
    if rejection_reason(text, bucket=bucket, name=name, ticker=ticker, evidence_text=evidence_text):
        return None
    return _clean(text).strip("\"'")


def coerce_model_reasons(raw: Any) -> dict[str, str] | None:
    """Keep only the {add, hold, trim} string fields from the model's object."""
    if not isinstance(raw, dict):
        return None
    out = {key: _clean(raw.get(key)) for key in BUCKETS if isinstance(raw.get(key), str) and _clean(raw.get(key))}
    return out or None


def validated_model_reasons(raw: Any, *, name: str, ticker: str, model_input: Any) -> dict[str, str]:
    """The model's reasons that pass validation against the payload it was given."""
    reasons = coerce_model_reasons(raw) or {}
    evidence_text = model_input if isinstance(model_input, str) else json.dumps(model_input, ensure_ascii=False, default=str)
    out: dict[str, str] = {}
    for bucket, text in reasons.items():
        cleaned = validate_reason(text, bucket=bucket, name=name, ticker=ticker, evidence_text=evidence_text)
        if cleaned:
            out[bucket] = cleaned
    return out


# ── deterministic fallback ─────────────────────────────────────────────────


def _num(value: Any) -> float | None:
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    return out if out == out else None


def _dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _iso_date(value: Any) -> date | None:
    text = str(value or "")[:10]
    try:
        return datetime.strptime(text, "%Y-%m-%d").date()
    except ValueError:
        return None


def _say_date(day: date) -> str:
    return f"{day.strftime('%b')} {day.day}"


def _move_phrase(doc: dict[str, Any]) -> str:
    """'is down 18% over the past week', or '' when the move is small."""
    price_context = _dict(doc.get("price_context"))
    returns = _dict(price_context.get("returns"))
    week = _num(returns.get("week_1_pct"))
    if week is None:
        closes = [
            _num(row.get("close"))
            for row in price_context.get("recent_sessions") or []
            if isinstance(row, dict) and (_num(row.get("close")) or 0) > 0
        ]
        if len(closes) >= 6:
            week = (closes[-1] / closes[-6] - 1) * 100
    month = _num(returns.get("month_1_pct"))
    if week is not None and abs(week) >= 3:
        return f"is {'up' if week > 0 else 'down'} {abs(week):.0f}% over the past week"
    if month is not None and abs(month) >= 8:
        return f"is {'up' if month > 0 else 'down'} {abs(month):.0f}% over the past month"
    return ""


def _earnings_phrase(doc: dict[str, Any], earnings: dict[str, Any] | None, today: date) -> tuple[str, str]:
    """(phrase, kind). kind is 'reported_beat', 'reported_miss', 'reported', 'upcoming' or ''."""
    block = _dict(earnings)
    status = str(block.get("status") or "").lower()
    event_day = _iso_date(block.get("event_date"))
    if status == "reported" and event_day and 0 <= (today - event_day).days <= 14:
        label = str(block.get("surprise_label") or "").lower()
        when = _say_date(event_day)
        if (today - event_day).days > 7:
            # Too old to explain this week's move; state it on its own.
            if label == "beat":
                return f"beat earnings forecasts on {when}", "reported_beat_older"
            if label == "miss":
                return f"missed earnings forecasts on {when}", "reported_miss_older"
            return f"reported earnings on {when}", "reported_older"
        if label == "beat":
            return f"after beating earnings forecasts on {when}", "reported_beat"
        if label == "miss":
            return f"after missing earnings forecasts on {when}", "reported_miss"
        return f"after reporting earnings on {when}", "reported"
    if status == "upcoming" and event_day and event_day >= today:
        return f"reports earnings on {_say_date(event_day)}", "upcoming"
    # Stored docs keep the upcoming date on the brief's earnings card.
    cards = _dict(doc.get("visual_cards") or doc.get("visual_summary")).get("catalyst_cards") or []
    for card in cards:
        if not isinstance(card, dict):
            continue
        card_day = _iso_date(card.get("window"))
        if card_day and card_day >= today and "earning" in str(card.get("event") or "").lower():
            return f"reports earnings on {_say_date(card_day)}", "upcoming"
    return "", ""


_PILLAR_GOOD = {
    "growth": "its sales and profits are growing faster than at similar companies",
    "valuation": "the stock is cheap next to similar companies for what it earns",
    "quality": "it makes more profit on its sales than most similar companies",
}
_PILLAR_BAD = {
    "growth": "its sales and profits are growing more slowly than at similar companies",
    "valuation": "the stock costs more than similar companies for what it earns",
    "quality": "it makes less profit on its sales than most similar companies",
}


def _pillar_fact(doc: dict[str, Any], *, good: bool) -> str:
    pillars = _dict(_dict(doc.get("fundamentals")).get("pillars"))
    order = ("growth", "valuation", "quality") if good else ("valuation", "growth", "quality")
    for key in order:
        pillar = _dict(pillars.get(key))
        if str(pillar.get("confidence") or "").lower() == "low":
            continue
        verdict = str(pillar.get("verdict") or "").lower()
        if good and verdict == "strong":
            return _PILLAR_GOOD[key]
        if not good and verdict == "weak":
            return _PILLAR_BAD[key]
    return ""


def _known_capitalised(doc: dict[str, Any]) -> set[str]:
    texts = [doc.get("headline"), doc.get("body"), doc.get("thesis"), doc.get("risk"), *(doc.get("key_points") or [])]
    cards = _dict(doc.get("visual_cards") or doc.get("visual_summary"))
    for group in ("drivers", "catalyst_cards", "risk_cards"):
        for card in cards.get(group) or []:
            if isinstance(card, dict):
                texts.append(card.get("detail"))
    return _proper_nouns(" ".join(_clean(text) for text in texts if text))


def _mid_sentence(phrase: str, known: set[str]) -> str:
    """Lower-case the first word unless it is a name the brief capitalises mid-sentence."""
    if not phrase:
        return phrase
    first, _, rest = phrase.partition(" ")
    if first.isupper() or first.lower() in known or not first[:1].isupper():
        return phrase
    return f"{first.lower()} {rest}".strip()


def _usable_phrase(text: Any) -> str:
    value = _clean(text).rstrip(".")
    if not value or len(value) > 60 or len(value.split()) > 7:
        return ""
    if any(pattern.search(value) for pattern in _BANNED) or _PLACEHOLDER.search(value):
        return ""
    return value


def _label_is_clause(label: str) -> bool:
    words = {word.lower().strip(",") for word in label.split()[1:]}
    return bool(words & _LABEL_VERBS)


def _label_has_participle(label: str) -> bool:
    return any(word.lower().endswith("ing") and len(word) > 4 for word in label.split()[1:])


def _card_phrase(doc: dict[str, Any], group: str, key: str, known: set[str]) -> tuple[str, bool]:
    """The first usable card label in ``group`` and whether it is a clause.

    "persistent cash burn" is a noun phrase; "AML costs expand" is a clause.
    Labels built on an -ing word ("utilities losing attention") fit neither
    sentence frame and are skipped.
    """
    cards = _dict(doc.get("visual_cards") or doc.get("visual_summary")).get(group) or []
    for card in cards:
        if not isinstance(card, dict):
            continue
        label = _usable_phrase(card.get(key))
        if not label or _label_has_participle(label):
            continue
        return _mid_sentence(label, known), _label_is_clause(label)
    return "", False


def _worry(doc: dict[str, Any], known: set[str]) -> str:
    """The brief's top risk: 'the main worry is persistent cash burn'."""
    label, clause = _card_phrase(doc, "risk_cards", "risk", known)
    if not label:
        return ""
    return f"the main worry is that {label}" if clause else f"the main worry is {label}"


def _strength(doc: dict[str, Any], known: set[str]) -> str:
    """The brief's top driver: 'profit growth supports dividends'."""
    label, clause = _card_phrase(doc, "drivers", "label", known)
    if not label:
        return ""
    return label if clause else f"the main thing going for it is {label}"


def _next_event(doc: dict[str, Any], known: set[str], today: date) -> str:
    """The brief's next non-earnings event as 'the Space Force satellite contract'."""
    cards = _dict(doc.get("visual_cards") or doc.get("visual_summary")).get("catalyst_cards") or []
    for card in cards:
        if not isinstance(card, dict):
            continue
        event = _usable_phrase(card.get("event"))
        if not event or "earning" in event.lower():
            continue
        event = re.sub(r"^(?:next|upcoming|the)\s+", "", event, flags=re.IGNORECASE)
        words = {word.lower() for word in event.split()[1:]}
        if words & _LABEL_VERBS:
            continue
        when = _iso_date(card.get("window"))
        suffix = f" on {_say_date(when)}" if when and when >= today else ""
        return f"the {_mid_sentence(event, known)}{suffix}"
    return ""


def _extension_pct(doc: dict[str, Any], directive: dict[str, Any]) -> float | None:
    """The run-up behind an 'add on a dip' call, from the directive's own summary."""
    summary = _clean(_dict(directive.get("action")).get("summary"))
    match = re.search(r"price is up (\d+(?:\.\d+)?)%", summary)
    return float(match.group(1)) if match else None


def _cap(text: str) -> str:
    return text[:1].upper() + text[1:] if text else text


def compose_fallback_reason(
    doc: dict[str, Any],
    directive: dict[str, Any],
    *,
    name: str,
    ticker: str,
    earnings: dict[str, Any] | None = None,
    today: date | None = None,
) -> str:
    """One or two plain sentences built only from this stock's stored facts."""
    bucket = bucket_for(directive.get("stance")) or "hold"
    execution = str(directive.get("execution") or "").lower()
    stance = str(directive.get("stance") or "").lower()
    if today is None:
        today = _iso_date(doc.get("generated_at") or doc.get("as_of")) or datetime.now(timezone.utc).date()
    subject = short_name(name, ticker)
    known = _known_capitalised(doc)

    move = _move_phrase(doc)
    earn, earn_kind = _earnings_phrase(doc, earnings, today)
    good = _pillar_fact(doc, good=True)
    bad = _pillar_fact(doc, good=False)
    worry = _worry(doc, known)
    strength = _strength(doc, known)
    event = _next_event(doc, known, today)

    def facts(with_earnings: bool = True) -> str:
        parts = [move] if move else []
        if with_earnings and earn:
            if earn_kind == "upcoming" or earn_kind.endswith("_older"):
                parts.append(earn if not parts else f"and {earn}")
            elif parts:
                parts.append(earn)
            else:
                # "Apple beat earnings forecasts on Nov 2."
                parts.append(
                    earn.replace("after beating", "beat").replace("after missing", "missed").replace("after reporting", "reported")
                )
        return f"{subject} {' '.join(parts)}." if parts else ""

    upcoming_day = earn.split(" on ", 1)[1] if earn_kind == "upcoming" else ""

    def why(with_extras: bool = True) -> str:
        if bucket == "add":
            run = _extension_pct(doc, directive)
            if execution == "now":
                call = "so we'd add at today's price"
            elif run is not None:
                call = f"but it is up {run:.0f}% from its recent low, so we'd wait for a dip to add"
            else:
                call = "so we'd add on a dip rather than at today's price"
            if good or strength:
                return f"{_cap(good or strength)}, {call}."
            if execution == "now":
                return "We'd add at today's price."
            if run is not None:
                return f"It is up {run:.0f}% from its recent low, so we'd wait for a dip to add."
            return "We'd add on a dip rather than at today's price."
        if bucket == "hold":
            wait = (
                f" before the {upcoming_day} report" if upcoming_day
                else (f" until we see {event}" if event and with_extras else " for now")
            )
            # "watch" + "breakout" waits for the rise to hold; "watch" without a
            # live price ("after_event") is a plain hold, not a price call.
            breakout = stance == "watch" and execution == "breakout"
            if breakout:
                wait = ""
            act = "wait for the price to keep rising before adding" if breakout else "hold rather than add"
            if good and (worry or bad):
                return f"{_cap(good)}, but {worry or bad}, so we'd {act}{wait}."
            if worry or bad:
                return f"{_cap(worry or bad)}, so we'd {act}{wait}."
            if good:
                return f"{_cap(good)}, but we'd {act}{wait}."
            return f"We'd {act}{wait}."
        # trim / avoid
        lead = worry or bad
        if not lead and earn_kind.startswith("reported_miss"):
            lead = "the latest report fell short"
        tail = "so we'd stay out for now" if stance == "avoid" else "so we wouldn't buy more, and we'd sell some if it bounces"
        if lead and good and with_extras:
            return f"{_cap(lead)}, even though {good}, {tail}."
        if lead:
            return f"{_cap(lead)}, {tail}."
        return f"{_cap(tail.replace('so ', '', 1))}."

    candidates = [
        (facts(True), why(True)),
        (facts(True), why(False)),
        (facts(False), why(False)),
        ("", why(False)),
    ]
    for first, second in candidates:
        if not first:
            # Name the stock in the only sentence there is.
            # Every sentence ``why`` writes starts with a common word.
            text = f"For {subject}, {second[:1].lower()}{second[1:]}"
        else:
            text = f"{first} {second}"
        text = _clean(text)
        if len(text) <= MAX_CHARS:
            return text
    return _clean(f"{why(False)[:-1]} on {subject}.")[:MAX_CHARS]


def attach_call_reason(
    directive: dict[str, Any] | None,
    *,
    doc: dict[str, Any],
    name: str,
    ticker: str,
    model_reasons: dict[str, str] | None = None,
    earnings: dict[str, Any] | None = None,
    today: date | None = None,
) -> dict[str, Any] | None:
    """The same directive plus ``call_reason`` and ``call_reason_source``.

    The stance, execution, zones, label and summary are left exactly as they
    were; old readers keep reading ``action.summary``.
    """
    if not isinstance(directive, dict):
        return directive
    bucket = bucket_for(directive.get("stance"))
    if bucket is None:
        return directive
    out = dict(directive)
    chosen = (model_reasons or {}).get(bucket)
    execution = str(directive.get("execution") or "").lower()
    if chosen and bucket == "add" and execution != "now" and _BUY_NOW.search(chosen):
        # The model was told not to time the add; an "add on a dip" call must
        # not read "buy at today's price".
        chosen = None
    if chosen:
        out["call_reason"] = chosen
        out["call_reason_source"] = "model"
        return out
    try:
        text = compose_fallback_reason(doc, directive, name=name, ticker=ticker, earnings=earnings, today=today)
    except Exception:  # never let the reason cost the call
        return directive
    if text:
        out["call_reason"] = text
        out["call_reason_source"] = "facts"
    return out


def call_reason_text(directive: Any) -> str:
    """What to show under a call: the specific reason, else the old summary."""
    directive = _dict(directive)
    return _clean(directive.get("call_reason")) or _clean(_dict(directive.get("action")).get("summary"))
