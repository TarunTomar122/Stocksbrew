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
import math
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
    # "C3.ai Inc - Class A", "Nokia Corporation Sponsored ADR", "Cooper Companies (The)": share classes,
    # listing notes and a trailing "(The)" are not part of the name.
    out = _clean(name)
    out = re.sub(r"\s*\((?:The|Class\s+[A-Z]|Puerto Rico)\)\s*", " ", out, flags=re.IGNORECASE).strip()
    out = re.sub(r"\s*-?\s*(?:Sponsored\s+)?ADR\b.*$", "", out, flags=re.IGNORECASE)
    out = re.sub(r"\s*-\s*(?:Class\s+[A-Z]|Common\s+Stock|Ordinary\s+Shares)?\s*$", "", out, flags=re.IGNORECASE)
    out = re.sub(r",?\s+(?:Co|PBC|CORP\.?)$", "", out)
    changed = True
    while out and changed:
        changed = False
        for suffix in _NAME_SUFFIXES:
            if out.endswith(suffix) and len(out) > len(suffix):
                out = out[: -len(suffix)].rstrip()
                changed = True
    # "The Cigna Group" reads as "Cigna" mid-sentence.
    if out.startswith("The ") and len(out) > 8:
        out = out[4:]
    # "JPMorgan Chase & Co." loses "Co." above; the "&" left behind goes too.
    out = re.sub(r"\s*(?:&|\band)$", "", out)
    if len(out) > 40:
        out = out[:40].rsplit(" ", 1)[0]
    return out or _clean(ticker).upper()


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
        # No "if it bounces": a condition nobody can check (owner, Nov 11). The level that says where lives in the zones.
        tail = "so we'd stay out for now" if stance == "avoid" else "so we'd sell some rather than buy more"
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


# ── the company reason, from the stock's own numbers ───────────────────────
#
# ``compose_fallback_reason`` above works from the brief alone, so it can only
# say what the brief's cards say. The screener job has the numbers: the P/E
# against the P/Es we stored for the stock, sales and expected profit growth,
# the latest earnings surprise, the past week's move next to similar
# companies, rating changes and dividends. ``compose_company_reason`` picks the
# facts that decide this call with plain rules and words them in two
# sentences: the evidence, then the event or condition that would change the
# call. No model is involved, so every number is one we computed.
#
# Share prices never appear: levels are part of the paid report, and the
# reason is shown to everyone. The condition that would change the call is
# only ever one someone can check after the fact (``_change_sentence``).

COMPANY_REASON_MAX_CHARS = 300

_MONTHS = ("January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December")
_SMALL = ("no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine")

# Industry words -> how a reader names the group ("other chip stocks").
_PEER_INDUSTRY = (
    ("asset management", "brokers and asset managers"),
    ("custody", "brokers and asset managers"),
    ("capital markets", "brokers and asset managers"),
    ("automotive retail", "retailers"),
    ("auto dealer", "retailers"),
    ("gas utilit", "utilities"),
    ("industrial gas", "chemical makers"),
    ("chemical", "chemical makers"),
    ("semiconductor", "chip stocks"),
    ("software", "software stocks"),
    ("bank", "bank stocks"),
    ("biotech", "biotech stocks"),
    ("drug", "drug makers"),
    ("pharma", "drug makers"),
    ("oil", "oil and gas stocks"),
    ("natural gas", "oil and gas stocks"),
    ("beverage", "drink makers"),
    ("restaurant", "restaurant stocks"),
    ("insurance", "insurers"),
    ("reit", "property trusts"),
    ("aerospace", "aerospace and defense stocks"),
    ("auto", "car and parts makers"),
    ("internet", "internet stocks"),
    ("entertainment", "media stocks"),
    ("airline", "airlines"),
    ("medical", "medical device makers"),
    ("capital markets", "brokers and asset managers"),
    ("asset management", "brokers and asset managers"),
    ("credit services", "card and lending companies"),
    ("retail", "retailers"),
    ("utilities", "utilities"),
    ("telecom", "telecom stocks"),
    ("computer hardware", "hardware makers"),
    ("communication equipment", "network equipment makers"),
    ("information technology services", "IT services companies"),
)
_PEER_SECTOR = {
    "technology": "tech stocks",
    "health care": "health care stocks",
    "financials": "financial stocks",
    "consumer discretionary": "consumer stocks",
    "consumer staples": "food, drink and household stocks",
    "communication services": "media and telecom stocks",
    "industrials": "industrial stocks",
    "energy": "energy stocks",
    "materials": "materials stocks",
    "real estate": "property stocks",
    "utilities": "utilities",
}


def peer_label(industry: Any, sector: Any) -> tuple[str, str]:
    """('industry', 'chip stocks') or ('sector', 'tech stocks'); ('', '') when unknown."""
    text = _clean(industry).lower()
    for needle, label in _PEER_INDUSTRY:
        if needle in text:
            return "industry", label
    label = _PEER_SECTOR.get(_clean(sector).lower(), "")
    return ("sector", label) if label else ("", "")


def _pct(value: float) -> str:
    """'18%', '3.5%', '0.4%': whole numbers from 10 up, one decimal below."""
    size = abs(value)
    if size >= 10:
        return f"{size:.0f}%"
    text = f"{size:.1f}".rstrip("0").rstrip(".")
    return f"{text}%"


def _times(value: float) -> str:
    return f"{value:.0f}" if value >= 10 else f"{value:.1f}".rstrip("0").rstrip(".")


def _count(value: int) -> str:
    return _SMALL[value] if 0 <= value < len(_SMALL) else str(value)


def _month_span(start: Any, end: Any, today: date) -> str:
    first, last = _iso_date(start), _iso_date(end)
    if not first or not last:
        return ""
    if (today - last).days <= 14:
        # "since November" only when that November is recent; a year-long history names its year.
        if (today - first).days <= 75:
            return f"since {_MONTHS[first.month - 1]}"
        return f"since {_MONTHS[first.month - 1]} {first.year}"
    if (first.year, first.month) == (last.year, last.month):
        return f"in {_MONTHS[first.month - 1]}"
    return f"from {_MONTHS[first.month - 1]} to {_MONTHS[last.month - 1]}"


def _possessive(name: str) -> str:
    if name.endswith(("'s", "’s")):
        return name  # "Domino's", "Moody's"
    return f"{name}'" if name.endswith("s") else f"{name}'s"


def _upper_first(text: str) -> str:
    """Capitalise a sentence start, but leave names like "eBay" and "nCino" as they are."""
    if len(text) > 1 and text[0].islower() and text[1].isupper():
        return text
    return text[:1].upper() + text[1:]


class _Fact:
    """One piece of evidence, worded three ways.

    ``lead`` has the company as its subject and opens the sentence; ``follow``
    joins it after a comma with "it"; ``short`` is ``follow`` without its
    second half, used when the full pair runs long.
    """

    __slots__ = ("key", "tone", "lead", "follow", "short", "lead_short", "weight", "number")

    def __init__(
        self,
        key: str,
        tone: str,
        lead: str,
        follow: str,
        weight: float,
        short: str = "",
        number: float | None = None,
        lead_short: str = "",
    ) -> None:
        self.key, self.tone, self.lead, self.follow, self.weight = key, tone, lead, follow, weight
        self.short = short or follow
        self.lead_short = lead_short or lead
        self.number = number


def _move_fact(facts: dict[str, Any], subject: str, today: date) -> _Fact | None:
    week, month = _num(facts.get("ret_1w")), _num(facts.get("ret_1m"))
    if week is not None and abs(week) >= 5:
        own, window, peer, days = week, "over the past week", _num(facts.get("peer_ret_1w")), 7
    elif month is not None and abs(month) >= 10:
        own, window, peer, days = month, "over the past month", _num(facts.get("peer_ret_1m")), 31
    else:
        return None
    verb = "rose" if own > 0 else "fell"
    cause = ""
    report = _dict(facts.get("last_report"))
    report_day = _iso_date(report.get("date"))
    label = _clean(facts.get("peer_label"))
    if days == 7 and report_day and 0 <= (today - report_day).days <= 7:
        surprise = _num(report.get("surprise_pct"))
        result = str(report.get("label") or "").lower()
        if result in ("beat", "miss") and surprise is not None and 1 <= abs(surprise) <= 300:
            word = "beat" if result == "beat" else "missed"
            cause = f" after its {_say_date(report_day)} report {word} profit forecasts by {_pct(surprise)}"
        else:
            cause = f" after its {_say_date(report_day)} report"
    elif peer is not None and label:
        if abs(peer) < 1:
            cause = f" while other {label} barely moved"
        elif (peer > 0) != (own > 0):
            cause = f" while other {label} {'rose' if peer > 0 else 'fell'} {_pct(peer)}"
        elif abs(own) >= 2 * abs(peer) and abs(own) - abs(peer) >= 4:
            cause = f", far more than other {label} ({'up' if peer > 0 else 'down'} {_pct(peer)})"
        elif abs(peer) >= 1.4 * abs(own) and abs(peer) - abs(own) >= 3:
            cause = f", less than other {label} ({'up' if peer > 0 else 'down'} {_pct(peer)})"
        elif abs(peer) >= 0.6 * abs(own):
            cause = f", in step with other {label} ({'up' if peer > 0 else 'down'} {_pct(peer)})"
        else:
            cause = f", more than other {label} ({'up' if peer > 0 else 'down'} {_pct(peer)})"
    text = f"{verb} {_pct(own)} {window}{cause}"
    big = abs(week or 0) >= 8 or abs(month or 0) >= 15
    tone = "up" if own > 0 else "down"
    return _Fact("move", tone, f"{subject} {text}", f"the stock {text}", 3.0 if big else 1.0, short=f"the stock {verb} {_pct(own)} {window}", number=own)


def _valuation_fact(facts: dict[str, Any], subject: str, today: date) -> _Fact | None:
    pe, median = _num(facts.get("pe")), _num(facts.get("pe_hist_median"))
    days = _num(facts.get("pe_hist_days")) or 0
    if not pe or not median or pe <= 0 or median <= 0 or days < 20 or pe > 300 or median > 300:
        return None
    span = _month_span(facts.get("pe_hist_from"), facts.get("pe_hist_to"), today)
    if not span or _times(pe) == _times(median):
        return None
    ratio = pe / median
    if ratio <= 0.9:
        side, tone, weight = "below", "good", 2.0 + (1 - ratio) * 3
    elif ratio >= 1.12:
        side, tone, weight = "above", "bad", 2.0 + min(ratio - 1, 1) * 3
    else:
        tail = f"trades at {_times(pe)} times its past year's earnings, close to its usual level"
        return _Fact("valuation", "flat", f"{subject} {tail}", f"it {tail}", 0.5)
    tail = f"trades at {_times(pe)} times its past year's earnings, {side} the {_times(median)} it typically traded at {span}"
    short = f"its P/E of {_times(pe)} is {side} the usual {_times(median)}"
    return _Fact("valuation", tone, f"{subject} {tail}", f"it {tail}", weight, short=short, number=median)


def _outlook(ahead: float | None, poss: str, weight: float) -> _Fact | None:
    if ahead is None:
        return None
    if ahead >= 10:
        text = f"analysts expect profit to grow {_pct(ahead)} next year"
        return _Fact("outlook", "good", f"analysts expect {poss} profit to grow {_pct(ahead)} next year", text, weight, number=ahead)
    if ahead <= -5:
        text = f"analysts expect profit to fall {_pct(ahead)} next year"
        return _Fact("outlook", "bad", f"analysts expect {poss} profit to fall {_pct(ahead)} next year", text, weight, number=ahead)
    return None


def _growth_facts(facts: dict[str, Any], subject: str) -> list[_Fact]:
    """Sales growth over the past year, and what analysts expect for profit next year.

    When both point the same way they are said in one clause; when they
    disagree each is its own fact, so a falling-sales company with a profit
    recovery ahead can still be described honestly.
    """
    sales, ahead = _num(facts.get("rev_growth")), _num(facts.get("eps_next_y"))
    poss = _possessive(subject)
    if sales is not None and abs(sales) > 500:
        sales = None
    if ahead is not None and (abs(ahead) > 500 or ahead <= -95):
        ahead = None
    outlook = _outlook(ahead, poss, 2.0 if ahead is not None and abs(ahead) >= 15 else 1.0)
    if sales is None:
        return [outlook] if outlook is not None else []
    if sales >= 15:
        tone, base, weight = "good", f"sales grew {_pct(sales)} over the past year", 2.5 + min(sales, 100) / 50
    elif abs(sales) < 0.5:
        tone, base, weight = "bad", "sales were flat over the past year", 1.5
    elif sales < 0:
        tone, base, weight = "bad", f"sales fell {_pct(sales)} over the past year", 2.5 + min(abs(sales), 50) / 25
    elif sales < 3:
        tone, base, weight = "bad", f"sales grew only {_pct(sales)} over the past year", 1.5
    else:
        tone, base, weight = "good", f"sales grew {_pct(sales)} over the past year", 0.8
    if outlook is not None and outlook.tone == tone and abs(sales) >= 3:
        extra = f" and {outlook.follow}"
        return [
            _Fact(
                "growth", tone, f"{poss} {base}{extra}", f"its {base}{extra}", weight + 0.5,
                short=f"its {base}", number=sales, lead_short=f"{poss} {base}",
            )
        ]
    out = [_Fact("growth", tone, f"{poss} {base}", f"its {base}", weight, number=sales)]
    if outlook is not None:
        out.append(outlook)
    return out


def _report_fact(facts: dict[str, Any], subject: str, today: date) -> _Fact | None:
    report = _dict(facts.get("last_report"))
    day = _iso_date(report.get("date"))
    surprise = _num(report.get("surprise_pct"))
    result = str(report.get("label") or "").lower()
    if not day or surprise is None or result not in ("beat", "miss") or not 0 <= (today - day).days <= 30:
        return None
    if abs(surprise) < 2 or abs(surprise) > 300:
        return None
    word = "beat" if result == "beat" else "missed"
    text = f"report on {_say_date(day)} {word} profit forecasts by {_pct(surprise)}"
    return _Fact("report", "good" if result == "beat" else "bad", f"{_possessive(subject)} {text}", f"its {text}", 3.0 + min(abs(surprise), 30) / 15)


def _ratings_fact(facts: dict[str, Any], subject: str) -> _Fact | None:
    change = _num(facts.get("buys_chg_3m"))
    if change is None or abs(change) < 2:
        return None
    count = int(abs(change))
    word = "more" if change > 0 else "fewer"
    text = f"{_count(count)} {word} analysts rate it a buy than three months ago"
    lead = f"{_count(count)} {word} analysts rate {subject} a buy than three months ago"
    return _Fact("ratings", "good" if change > 0 else "bad", lead, text, 1.2)


def _dividend_fact(facts: dict[str, Any], subject: str) -> _Fact | None:
    years, yield_pct = _num(facts.get("div_growth_years")), _num(facts.get("div_yield"))
    if not years or not yield_pct or years < 10 or yield_pct < 1.5 or yield_pct > 15:
        return None
    text = f"pays a {_pct(yield_pct)} dividend that it has raised for {int(years)} years in a row"
    return _Fact("dividend", "good", f"{subject} {text}", f"it {text}", 1.4)


def _range_fact(facts: dict[str, Any], subject: str) -> _Fact | None:
    below = _num(facts.get("from_hi_pct"))
    if below is None:
        return None
    if below <= -25:
        text = f"sits {_pct(below)} below its high of the past year"
        return _Fact("range", "down", f"{subject} {text}", f"it {text}", 1.0)
    if below >= -2:
        text = "trades near its high of the past year"
        return _Fact("range", "up", f"{subject} {text}", f"it {text}", 0.6)
    return None


def _sentence(first: _Fact, second: _Fact | None, link: str, *, short: bool = False) -> str:
    if second is None:
        return f"{_upper_first(first.lead)}."
    # One "and" per sentence: a first clause that already joins two facts is cut to its first.
    lead = first.lead_short if " and " in first.lead else first.lead
    lead = _upper_first(lead)
    use_short = short or first.key == "move" or (link == "and" and " and " in second.follow)
    return f"{lead}, {link} {second.short if use_short else second.follow}."


def _pick(bucket: str, move: _Fact | None, good: list[_Fact], bad: list[_Fact], flat: list[_Fact], range_fact: _Fact | None) -> tuple[_Fact | None, _Fact | None, str]:
    """The two facts that decide this call and the word that joins them."""
    big = move is not None and move.weight >= 3.0
    down = move is not None and move.tone == "down"
    up = move is not None and move.tone == "up"
    if bucket == "add":
        if big and down and good:
            return move, good[0], "but"
        if good:
            if len(good) > 1:
                return good[0], good[1], "and"
            if down:
                return good[0], move, "but"
            if up:
                return good[0], move, "and"
            if range_fact is not None and range_fact.tone == "down":
                return good[0], range_fact, "but"
            return good[0], (flat[0] if flat else None), "and"
        if move is not None:
            # A rising price is what the call is following.
            return move, (range_fact if up and range_fact is not None and range_fact.tone == "up" else (flat[0] if flat else None)), "and"
        return (flat[0] if flat else None), None, ""
    if bucket == "trim":
        if bad:
            if big:
                return move, bad[0], "and"
            if move is not None:
                return bad[0], move, "and"
            return bad[0], (bad[1] if len(bad) > 1 else None), "and"
        if up:
            # Nothing wrong with the company; the price ran ahead of it.
            return (good[0], move, "but") if good else (move, None, "")
        if down:
            return move, (range_fact if range_fact is not None and range_fact.tone == "down" else None), "and"
        if range_fact is not None and range_fact.tone == "up":
            return (good[0], range_fact, "but") if good else (range_fact, None, "")
        return (flat[0] if flat else None), None, ""
    # hold: the tension between what is going for it and what is not
    if big and move is not None:
        if down:
            if good:
                return move, good[0], "even though"
            return move, (bad[0] if bad else None), "and"
        if bad:
            return move, bad[0], "but"
        return move, (good[0] if good else None), "and"
    if good and bad:
        return good[0], bad[0], "but"
    if good:
        if down:
            return good[0], move, "but"
        if up:
            return good[0], move, "and"
        if range_fact is not None:
            return good[0], range_fact, "but"
        return good[0], (flat[0] if flat else None), "and"
    if bad:
        if up:
            return bad[0], move, "but"
        return bad[0], (flat[0] if flat else None), "and"
    if move is not None:
        return move, (flat[0] if flat else None), "and"
    return (flat[0] if flat else range_fact), None, ""


def growth_bars(growth: float | None, last_year: float | None = None) -> dict[str, float | None]:
    """The sales growth bars a report is measured against, the same rule as the web stock page
    (lib/call-evidence.ts ``growthBars``).

    ``up``: holding the pace, the slower of today's growth and last year's (when last year was at least
    half of today's). ``down``: a sharp slowdown, growth halving; slow growers only count shrinking sales
    (0). ``recover``: back on track for a sell call, sales growing again (0) or back to last year's faster
    pace. Each is None when the numbers can't set it.
    """
    if growth is None:
        return {"up": None, "down": None, "recover": None}
    g0, g1 = growth, last_year
    up = math.floor(g1 if g1 is not None and g1 < g0 and g1 >= g0 / 2 else g0) if g0 >= 2 else None
    # Half up, as JavaScript's Math.round does (Python's round(10.5) is 10), so both sides print the same bar.
    down: float | None = (min(math.floor(g0 / 2 + 0.5), up if up is not None else math.inf) if g0 >= 10 else 0) if g0 >= 2 else None
    recover = 0 if g0 < 0 else (math.floor(g1) if g1 is not None and g1 - g0 > 2 else None)
    return {"up": up, "down": down, "recover": recover}


def _change_sentence(facts: dict[str, Any], bucket: str, stance: str, used: list[_Fact], today: date, subject: str) -> str:
    """What would change the call, as a condition someone can check after the report: a profit beat or miss
    against forecasts, sales growth against a stated bar, or the P/E against its stated usual level.

    Owner, Nov 11: every condition names something checkable. Nothing vague ("if sales slow sharply", "once
    the price settles back", "after a lower price") and no review dates that are not conditions ("we'd look
    again after ..."). The stock's own move and market bars live with the steady call
    (backend/call_stability.py ``what_would_change``) and the stock page (lib/call-evidence.ts), which
    have the price history to set them.
    """
    report_day = _iso_date(facts.get("next_report"))
    dated = report_day is not None and 0 <= (report_day - today).days <= 100
    when = f"the {_say_date(report_day)} report" if dated and report_day else f"{_possessive(subject)} next report"
    when_cap = _upper_first(when)
    median = _num(facts.get("pe_hist_median"))
    by_key = {fact.key: fact for fact in used}
    growth = by_key.get("growth")
    sales = growth.number if growth is not None else None
    # Last year's growth, when the facts carry it; without it the bars come from today's pace alone.
    bars = growth_bars(sales, _num(facts.get("rev_growth_last_year")))
    valuation = by_key.get("valuation")
    misses = f"{when} misses profit forecasts"

    if bucket == "add":
        if growth is not None and bars["down"]:
            return f"We'd stop buying if {when} shows sales growth below {bars['down']:.0f}% or misses profit forecasts."
        if growth is not None and bars["down"] == 0:
            return f"We'd stop buying if {when} shows sales shrinking or misses profit forecasts."
        if valuation is not None and valuation.tone == "good" and median:
            return f"We'd stop buying if the P/E climbs back above {_times(median)} or {misses}."
        if "dividend" in by_key:
            return f"We'd stop buying if {misses} or the dividend is cut."
        return f"We'd stop buying if {misses}."
    if bucket == "trim":
        out = "look again" if stance == "avoid" else "stop selling"
        price_ran = "move" in by_key and by_key["move"].tone == "up" and not (
            set(by_key) & {"growth", "valuation", "report", "outlook", "ratings"} and any(f.tone == "bad" for f in used)
        )
        if not price_ran and growth is not None and growth.tone == "bad" and bars["recover"] is not None:
            again = "sales growing again" if bars["recover"] == 0 else f"sales growth back above {bars['recover']:.0f}%"
            return f"We'd {out} if {when} shows {again}."
        if not price_ran and valuation is not None and valuation.tone == "bad" and median:
            return f"We'd {out} if the P/E falls back to {_times(median)} or {when} beats profit forecasts."
        return f"We'd {out} if {when} beats profit forecasts."
    # hold
    if growth is not None and growth.tone == "good" and bars["up"] is not None and bars["down"] is not None:
        # Said as raising or lowering this call, never as the other calls (owner: no sale next to a Keep).
        lower = "sales shrink" if bars["down"] == 0 else f"sales growth falls below {bars['down']:.0f}%"
        return f"{when_cap} could raise the call if sales growth stays above {bars['up']:.0f}%, and lower it if {lower}."
    if valuation is not None and valuation.tone == "bad" and median and not ({"report", "move"} & set(by_key)):
        return f"{when_cap} could lower the call if it misses profit forecasts, and a P/E back at {_times(median)} could raise it."
    return f"{when_cap} could raise the call with a profit beat, or lower it with a miss."


def compose_company_reason(facts: dict[str, Any], *, today: date | None = None) -> dict[str, Any] | None:
    """Two sentences on why this call, for this company, from its own numbers.

    ``facts`` is a flat dict (the screener row plus a few extras):
    name, symbol, stance, execution, pe, pe_hist_median, pe_hist_days,
    pe_hist_from, pe_hist_to, rev_growth, eps_next_y, ret_1w, ret_1m,
    peer_label, peer_ret_1w, peer_ret_1m, last_report {date, label,
    surprise_pct}, next_report (date), buys_chg_3m, div_yield,
    div_growth_years, from_hi_pct, and optionally rev_growth_last_year.
    has_add_level, next_event and next_event_date are still accepted but no
    longer used: neither names a condition anyone can check.

    Returns {"text", "why", "change", "facts"} or None when the numbers say
    nothing about this company, so the brief's own reason stays.
    """
    bucket = bucket_for(facts.get("stance"))
    if bucket is None:
        return None
    stance = str(facts.get("stance") or "").lower()
    today = today or datetime.now(timezone.utc).date()
    subject = short_name(facts.get("name"), facts.get("symbol"))
    if not subject:
        return None

    move = _move_fact(facts, subject, today)
    candidates = [
        fact
        for fact in (
            _report_fact(facts, subject, today),
            _valuation_fact(facts, subject, today),
            *_growth_facts(facts, subject),
            _ratings_fact(facts, subject),
            _dividend_fact(facts, subject),
        )
        if fact is not None
    ]
    # A report that already explains the move is not said twice.
    if move is not None and " report" in move.lead:
        candidates = [fact for fact in candidates if fact.key != "report"]
    good = sorted((fact for fact in candidates if fact.tone == "good"), key=lambda fact: -fact.weight)
    bad = sorted((fact for fact in candidates if fact.tone == "bad"), key=lambda fact: -fact.weight)
    flat = [fact for fact in candidates if fact.tone == "flat"]
    first, second, link = _pick(bucket, move, good, bad, flat, _range_fact(facts, subject))
    if first is None:
        return None

    attempts = [(second, False), (second, True), (None, False)] if second is not None else [(None, False)]
    for other, short in attempts:
        used = [fact for fact in (first, other) if fact is not None]
        why = _sentence(first, other, link, short=short)
        change = _change_sentence(facts, bucket, stance, used, today, subject)
        text = _clean(f"{why} {change}")
        if len(text) <= COMPANY_REASON_MAX_CHARS:
            break
    else:
        return None
    if any(pattern.search(text) for pattern in _BANNED) or _PRICE_LEVEL.search(text) or _PLACEHOLDER.search(text):
        return None
    return {"text": text, "why": _clean(why), "change": _clean(change), "facts": [fact.key for fact in used]}
