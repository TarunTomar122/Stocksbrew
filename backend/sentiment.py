"""Simple deterministic sentiment scoring."""
from __future__ import annotations


POSITIVE_TERMS = {
    "gain", "gains", "rally", "surge", "surges", "rise", "rises", "upside",
    "beat", "beats", "buyback", "bullish", "rebound", "approval", "dividend",
    "upgrade", "strong", "record", "growth"
}

NEGATIVE_TERMS = {
    "fall", "falls", "drop", "drops", "tumble", "tumbles", "crash", "slump",
    "weak", "bearish", "outflow", "risk", "war", "cuts", "probe", "concern",
    "cancels", "inflation", "selloff", "downgrade"
}


def _count_matches(text: str, terms: set[str]) -> int:
    tokens = [token.strip(".,:;!?()[]{}\"'").lower() for token in text.split()]
    return sum(1 for token in tokens if token in terms)


def score_sentiment(text: str) -> float:
    positive = _count_matches(text, POSITIVE_TERMS)
    negative = _count_matches(text, NEGATIVE_TERMS)
    raw = (positive - negative) / max(3, positive + negative, 1)
    return round(max(-1.0, min(1.0, raw)), 2)


def label_sentiment(score: float) -> str:
    if score >= 0.45:
        return "bullish"
    if score >= 0.15:
        return "constructive"
    if score > -0.15:
        return "mixed"
    if score > -0.45:
        return "cautious"
    return "bearish"


def summarize_sentiment(scores: list[float]) -> dict[str, float | str]:
    if not scores:
        return {"min": 0.0, "max": 0.0, "average": 0.0, "label": "mixed"}
    average = round(sum(scores) / len(scores), 2)
    return {
        "min": round(min(scores), 2),
        "max": round(max(scores), 2),
        "average": average,
        "label": label_sentiment(average),
    }
