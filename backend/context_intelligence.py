"""Build market, sector, and context-aware stock summaries."""
from __future__ import annotations

from collections import Counter, defaultdict
import hashlib
import json
from datetime import datetime, timedelta, timezone
import re
from typing import Any

from backend.env import load_backend_env
from backend.llm_client import (
    json_response_format,
    llm_api_key,
    llm_model,
    parse_json_content,
    post_chat_completion,
    schema_system_prompt,
)
from backend.models import Article
from backend.preferences import sector_label_map
from backend.storage import TraceMoneyStore

load_backend_env()


CONTEXT_CACHE_VERSION = "2026-06-24-context-v16-stock-watch-guardrails"


class ContextBriefWriter:
    def __init__(self, store: TraceMoneyStore | None = None) -> None:
        self.api_key = llm_api_key()
        self.model = llm_model()
        self.store = store

    @property
    def enabled(self) -> bool:
        return bool(self.api_key)

    def _cache_key(self, prefix: str, payload: dict[str, Any]) -> str:
        digest = hashlib.sha256(
            json.dumps([CONTEXT_CACHE_VERSION, self.model, prefix, payload], sort_keys=True).encode("utf-8")
        ).hexdigest()
        return f"context_{digest}"

    def _schema(self, kind: str) -> dict[str, Any]:
        if kind == "stock":
            return {
                "name": "trace_money_stock_context_brief",
                "strict": True,
                "schema": {
                    "type": "object",
                    "properties": {
                        "headline": {"type": "string"},
                        "today_brief": {"type": "string"},
                        "week_brief": {"type": "string"},
                        "catalyst": {"type": "string"},
                        "risk": {"type": "string"},
                        "what_changed": {
                            "type": "string",
                            "description": "One sentence - TICKER + driver. Quote numbers only from stock_today_points / stock_week_points; never invent a percent move or price.",
                        },
                        "why_it_matters": {
                            "type": "object",
                            "properties": {
                                "claim": {
                                    "type": "string",
                                    "description": "One-sentence qualitative link between the event and a broader outcome. NO dollar or percent values in this string - the numeric gap is added by the server via gap_anchor.",
                                },
                                "gap_anchor": {
                                    "type": "string",
                                    "enum": [
                                        "analyst_target",
                                        "week_52_high",
                                        "week_52_low",
                                        "none",
                                    ],
                                    "description": "If the stock's distance to a payload price is the key framing, pick that anchor. Otherwise 'none'. The server computes both the % gap and whether current_price is above or below it.",
                                },
                            },
                            "required": ["claim", "gap_anchor"],
                            "additionalProperties": False,
                        },
                        "what_to_watch": {
                            "type": "object",
                            "properties": {
                                "monitor": {
                                    "type": "string",
                                    "description": "Concrete, falsifiable trigger to watch next. Must name the ticker plus a real event, filing, guide, approval, contract, delivery, or threshold. Avoid soft phrasing like 'follow-through in revenue growth'. NO dates, NO percent values, NO dollar values.",
                                },
                                "price_anchor": {
                                    "type": "string",
                                    "enum": [
                                        "current_price",
                                        "analyst_target",
                                        "week_52_high",
                                        "week_52_low",
                                        "none",
                                    ],
                                    "description": "Which payload price to anchor the trigger to, or 'none' if no price anchor applies.",
                                },
                                "future_date_iso": {
                                    "type": ["string", "null"],
                                    "description": "ISO date (YYYY-MM-DD) on or after `today` if you have strong evidence for one (e.g. earnings date in stock_today_points). Otherwise null. Never invent a date.",
                                },
                            },
                            "required": ["monitor", "price_anchor", "future_date_iso"],
                            "additionalProperties": False,
                        },
                    },
                    "required": [
                        "headline",
                        "today_brief",
                        "week_brief",
                        "catalyst",
                        "risk",
                        "what_changed",
                        "why_it_matters",
                        "what_to_watch",
                    ],
                    "additionalProperties": False,
                },
            }
        if kind == "market":
            return {
                "name": "trace_money_market_context_brief",
                "strict": True,
                "schema": {
                    "type": "object",
                    "properties": {
                        "today_brief": {"type": "string"},
                        "week_brief": {"type": "string"},
                        "what_changed": {"type": "string"},
                        "why_it_matters": {"type": "string"},
                        "what_to_watch": {"type": "string"},
                        "top_sectors": {
                            "type": "array",
                            "items": {"type": "string"},
                            "minItems": 0,
                            "maxItems": 3,
                        },
                    },
                    "required": [
                        "today_brief",
                        "week_brief",
                        "what_changed",
                        "why_it_matters",
                        "what_to_watch",
                        "top_sectors",
                    ],
                    "additionalProperties": False,
                },
            }
        if kind == "sector":
            return {
                "name": "trace_money_sector_context_brief",
                "strict": True,
                "schema": {
                    "type": "object",
                    "properties": {
                        "today_brief": {
                            "type": "string",
                            "description": "1 short sentence. Names the sector and at least one ticker or concrete number. No tautologies.",
                        },
                        "week_brief": {
                            "type": "string",
                            "description": "1 short sentence on the rolling week. Must add a NEW fact not in today_brief - different ticker, different number, or different angle.",
                        },
                        "what_changed": {
                            "type": "string",
                            "description": "The concrete event driving the sector today. Format: TICKER <move or action>, <source or catalyst>.",
                        },
                        "bull_case": {
                            "type": "string",
                            "description": "One sentence - the strongest reason to be long the sector right now. Name a ticker or a payload fact. No cheerleading filler.",
                        },
                        "bear_case": {
                            "type": "string",
                            "description": "One sentence - the strongest reason to fade or avoid the sector right now. Name a ticker or a payload fact. Must be a real risk, not hedging.",
                        },
                        "crowd_miss": {
                            "type": "string",
                            "description": "One sentence - a contrarian angle the tape isn't pricing, or an under-covered name in the sector. Must name a ticker or a specific datapoint.",
                        },
                        "what_to_watch": {
                            "type": "string",
                            "description": "One concrete future trigger - ticker + event, a date, or a price threshold. Never 'watch for developments'.",
                        },
                    },
                    "required": [
                        "today_brief",
                        "week_brief",
                        "what_changed",
                        "bull_case",
                        "bear_case",
                        "crowd_miss",
                        "what_to_watch",
                    ],
                    "additionalProperties": False,
                },
            }
        return {
            "name": f"trace_money_{kind}_context_brief",
            "strict": True,
            "schema": {
                "type": "object",
                "properties": {
                    "today_brief": {"type": "string"},
                    "week_brief": {"type": "string"},
                    "what_changed": {"type": "string"},
                    "why_it_matters": {"type": "string"},
                    "what_to_watch": {"type": "string"},
                },
                "required": ["today_brief", "week_brief", "what_changed", "why_it_matters", "what_to_watch"],
                "additionalProperties": False,
            },
        }

    def _system_prompt(self, kind: str) -> str:
        universal_rules = (
            "Hard specificity rules - enforce these on every field you return:\n"
            "- Every sentence must name at least one ticker, sector, or concrete number (%, $, rank, or date). No exceptions.\n"
            "- Use only facts present in the provided payload. Do not invent tickers, prices, or catalysts.\n"
            "- When a ticker is available in the payload, use it by symbol (e.g. NVDA, AMD), not 'the company'.\n"
            "- Banned filler words and phrases - never use: 'constructive', 'robust', 'strong momentum', 'notable', 'reinforces', 'reflects confidence', 'substantial upside', 'could drive', 'further insights', 'maintaining its leadership', 'signal is based on', 'today's tone is', 'over the last week', 'the company is a major player', 'sees substantial', 'overall market sentiment'.\n"
            "- Banned hedges unless paired with a concrete number: 'may', 'could', 'might', 'indicates'. If you hedge, include the number you are hedging about.\n"
            "- Do not restate the label ('bullish', 'mixed', 'cautious') - the UI already shows it.\n"
            "- Do not write tautologies that would be true any day (e.g. 'tech is leading because tech stocks are up').\n"
            "DATE DISCIPLINE - STRICT:\n"
            "- Do NOT emit any date (YYYY-MM-DD, 'Apr 27', 'next Tuesday', 'Q4 2023', etc.) unless that exact date string appears verbatim in the provided payload. If you cannot find it in the payload, write the sentence without a date.\n"
            "- The payload field `today` is the only reference date. Any date you emit must be on or after `today`. Never cite a year older than `today`'s year.\n"
            "- NEVER use angle-bracket placeholder tokens like '<move>', '<catalyst>', '<ticker>', or square-bracket tokens like '[date]', '[price]'. If you do not have the concrete value, rewrite the sentence so the token is not needed.\n"
        )
        three_fields_rules = (
            "The three one-liners must answer three different questions. Never paraphrase the same fact across them:\n"
            "- `what_changed` = a concrete EVENT that happened today. Format: TICKER <move or fact>, <driver>. Example: 'AMD +4.2% after Morgan Stanley raised PT to $600 from $480.'\n"
            "- `why_it_matters` = a LINKAGE between that event and a broader outcome, backed by a number or ratio. Example: 'NVDA's 1.7% move contributed ~40% of the tech sector gain on 78% up-volume.'\n"
            "- `what_to_watch` = a concrete FUTURE trigger. Must include a ticker + event/date OR a price threshold. Example: 'NVDA earnings Tue after close - a beat + raised guide confirms the uptrend; a miss risks breaking the 50DMA near $195.'\n"
            "If the payload genuinely lacks the data to populate a field concretely, say so plainly (e.g. 'No ticker-specific catalyst confirmed yet.') rather than inventing filler.\n"
        )
        if kind == "stock":
            return (
                "You write short stock briefs for a market-intelligence product.\n"
                + universal_rules
                + "REFUSE meta-commentary. Never say 'X's Y is analyzed/discussed/reviewed/covered'. "
                "The user already knows the topic - tell them WHAT happened or what the data shows. "
                "If the only evidence is an explainer, evergreen educational content, or a 'history of' piece with "
                "no new event, treat it as thin coverage and anchor the brief on the fundamentals payload "
                "(`stock_score`, pillar standouts, analyst target gap, 52-week position) instead.\n"
                "Prioritize the actual stock event first, then place it in sector and market context.\n"
                "Keep `headline` under 12 words and include the ticker.\n"
                "Keep `today_brief` to 2 or 3 short sentences, each carrying a ticker or number.\n"
                "Keep `week_brief` to 1 or 2 short sentences.\n"
                "Make `catalyst` and `risk` short phrases, each naming a concrete driver (earnings date, analyst action, product event, macro data).\n"
                "Filling the structured fields `what_changed`, `why_it_matters`, `what_to_watch`:\n"
                "- `what_changed` - one sentence. Name the TICKER and the driver. You may include a percent or dollar number ONLY if that exact figure already appears in `stock_today_points`, `stock_week_points`, `sector_context_*`, or `market_context_*`. Never invent a move (no 'GOOGL +3.5%' unless 3.5% is in the payload) and never invent a price.\n"
                "- `why_it_matters.claim` - one short qualitative sentence linking the event to a broader outcome. Do NOT put ANY dollar or percent values in this string - they are added automatically by the server from `gap_anchor`.\n"
                "- `why_it_matters.gap_anchor` - if the framing is about how far the stock sits from a payload price, pick `analyst_target`, `week_52_high`, or `week_52_low`. Otherwise pick `none`. The server computes both the percent gap and whether the current price is above or below that anchor - do NOT write the percent or the direction yourself.\n"
                "- `what_to_watch.monitor` - one concrete, falsifiable trigger. Good: 'next earnings release for guidance', 'NHTSA ruling on Autopilot', 'Q3 delivery print', 'DoD contract award'. Bad: 'follow-through in revenue growth', 'execution amid volatility', 'stock price recovery'. NO dates, NO percent values, NO dollar values in this string - those slots exist separately.\n"
                "- `what_to_watch.price_anchor` - pick `current_price` / `analyst_target` / `week_52_high` / `week_52_low` if it's natural to anchor the trigger to that payload price. Pick `none` otherwise. Do NOT invent prices; the server appends the exact payload number.\n"
                "- `what_to_watch.future_date_iso` - set an ISO date (YYYY-MM-DD) ONLY if the payload clearly supports a specific future event date AND that date is on or after `today`. Otherwise return null. Never invent a date.\n"
                "General discipline:\n"
                "- The payload field `today` is TODAY's date. Never reference any date earlier than `today` anywhere.\n"
                "- Never output placeholder tokens like 'X%', 'TBD', 'N/A', '$-', '[price]'. If the number is unknown, rewrite without it.\n"
                "- If you do not have a concrete future trigger, return an empty `what_to_watch.monitor` and let the downstream risk cards carry the downside case. Do not pad with generic business-progress language.\n"
                "Return strict JSON only."
            )
        if kind == "sector":
            return (
                "You write short sector briefs for a market-intelligence product. Every field names a ticker or a concrete number.\n"
                + universal_rules
                + "Never output placeholder tokens like 'X%', '+X%', 'TBD', 'N/A', '[insert date]', '{{ticker}}'. "
                "If a number is unknown, rewrite the sentence without it - never ship a template.\n"
                "No paraphrasing across fields. Each of the seven fields (today_brief, week_brief, what_changed, bull_case, bear_case, crowd_miss, what_to_watch) "
                "must carry a DIFFERENT fact - different ticker, different driver, or different angle. If you cannot find seven distinct angles in the payload, "
                "say so plainly in the weakest field (e.g. 'No distinct week-over-week shift yet.') rather than repeat yourself.\n"
                "Field roles:\n"
                "- `today_brief` - 1 sentence capturing the sector's dominant story today.\n"
                "- `week_brief` - 1 sentence on the rolling week, using a DIFFERENT ticker or angle than today_brief.\n"
                "- `what_changed` - the concrete event driving today's tape. Format: TICKER <move or action>, <catalyst>. Use only tickers and numbers present in the payload.\n"
                "- `bull_case` - the single strongest long thesis for this sector right now, anchored to a payload ticker or fact. Must be substantive, not 'momentum is strong'.\n"
                "- `bear_case` - the single strongest reason to fade or avoid the sector, anchored to a real risk in the payload (a ticker breaking down, a rate/policy/demand concern mentioned). If the payload is uniformly positive, write 'No clear bear catalyst in today's flow.' - do not invent one.\n"
                "- `crowd_miss` - a contrarian angle the consensus narrative isn't pricing, OR an under-covered ticker in the sector worth flagging. Name a ticker or a specific datapoint. If nothing qualifies, write 'Nothing off-consensus stands out today.'\n"
                "- `what_to_watch` - one concrete future trigger: TICKER + event, OR a price threshold. You MAY include a date ONLY if that exact date string is present verbatim in `today_key_points`/`week_key_points`. If no such date exists in the payload, omit the date entirely - do not guess, do not default to last quarter, do not emit '2023-xx-xx'. Never 'watch for developments'.\n"
                "Keep every sentence under 22 words. Return strict JSON only."
            )
        top_sectors_rule = ""
        if kind == "market":
            top_sectors_rule = (
                "For `top_sectors`: return 0-3 sector names that are actually moving the market TODAY based on the payload's today_key_points and article content. "
                "Only name a sector if the payload supports it with a concrete event (earnings, analyst action, macro print, ticker move). "
                "Return [] if no sector has clear evidence. Do not default to Tech/Comms/CD.\n"
            )
        return (
            "You write short market briefs for a market-intelligence product.\n"
            + universal_rules
            + "Keep each brief to 1 or 2 short sentences, each carrying a ticker, sector name, or number.\n"
            + three_fields_rules
            + top_sectors_rule
            + "Return strict JSON only."
        )

    def _call(self, kind: str, payload: dict[str, Any]) -> dict[str, Any]:
        if not self.enabled:
            return {}
        cache_key = self._cache_key(kind, payload)
        if self.store:
            cached = self.store.get_llm_enrichment(cache_key)
            if cached and isinstance(cached.get("payload"), dict):
                return cached["payload"]
        body = post_chat_completion(
            messages=[
                {"role": "system", "content": schema_system_prompt(self._system_prompt(kind), self._schema(kind))},
                {"role": "user", "content": json.dumps(payload, ensure_ascii=True)},
            ],
            model=self.model,
            temperature=0.2,
            response_format=json_response_format(),
            timeout=45,
            stage=f"context_{kind}",
        )
        content = body["choices"][0]["message"]["content"]
        result = parse_json_content(content)
        if self.store:
            self.store.save_llm_enrichment(cache_key, {
                "cache_key": cache_key,
                "payload": result,
                "kind": kind,
                "model": self.model,
            })
        return result


def _parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


_PLACEHOLDER_RE = re.compile(r"<[a-z][a-z0-9_\- ]{0,40}>", re.IGNORECASE)
_ISO_DATE_RE = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b")


def _strip_unsafe_dates_and_placeholders(text: str, *, today_iso: str, allowed_dates: set[str]) -> str:
    """Belt-and-suspenders cleanup for LLM free-text fields. We already tell the
    model not to emit placeholder tokens or unsupported dates - this scrubs them
    anyway so stale cache hits and occasional slips never reach the UI."""
    if not text:
        return text
    # Drop angle-bracket placeholders like `<move>` / `<catalyst>` entirely.
    cleaned = _PLACEHOLDER_RE.sub("", text)

    def _date_sub(match: re.Match[str]) -> str:
        raw = match.group(0)
        if raw in allowed_dates:
            return raw
        try:
            d = datetime.strptime(raw, "%Y-%m-%d").date()
            today = datetime.fromisoformat(today_iso).date()
        except ValueError:
            return ""
        if d < today:
            return ""
        return raw

    cleaned = _ISO_DATE_RE.sub(_date_sub, cleaned)
    # Collapse orphan punctuation left behind by removals (", ." / " ,").
    cleaned = re.sub(r"\s+([,.;:])", r"\1", cleaned)
    cleaned = re.sub(r",\s*,", ",", cleaned)
    cleaned = re.sub(r"\s{2,}", " ", cleaned).strip(" ,;:-")
    return cleaned


_STOCK_PRICE_ANCHORS = ("current_price", "analyst_target", "week_52_high", "week_52_low")
_PRICE_ANCHOR_LABELS = {
    "current_price": "the current price",
    "analyst_target": "the analyst target",
    "week_52_high": "the 52-week high",
    "week_52_low": "the 52-week low",
}

_LOW_SIGNAL_STOCK_WATCH_PREFIXES = (
    "follow-through in ",
    "watch for follow-through in ",
)

_LOW_SIGNAL_STOCK_WATCH_TERMS = (
    "stock price recovery",
    "rsi levels",
    "execution amid",
    "execution against",
    "business momentum",
)

_CONCRETE_STOCK_WATCH_TERMS = (
    "earnings",
    "guidance",
    "guide",
    "results",
    "report",
    "filing",
    "approval",
    "decision",
    "ruling",
    "hearing",
    "contract",
    "award",
    "order",
    "launch",
    "delivery",
    "shipments",
    "conference",
    "investor day",
    "buyback",
    "merger",
    "acquisition",
    "trial",
    "vote",
)


def _is_low_signal_stock_watch_monitor(monitor: str) -> bool:
    cleaned = " ".join(str(monitor).split()).strip().rstrip(".")
    if not cleaned:
        return False
    lowered = cleaned.lower()
    has_concrete_trigger = any(term in lowered for term in _CONCRETE_STOCK_WATCH_TERMS)
    if any(lowered.startswith(prefix) for prefix in _LOW_SIGNAL_STOCK_WATCH_PREFIXES):
        return not has_concrete_trigger
    if any(term in lowered for term in _LOW_SIGNAL_STOCK_WATCH_TERMS):
        return not has_concrete_trigger
    return False


def _format_future_date(iso: str, today_iso: str) -> str | None:
    try:
        dt = datetime.strptime(iso, "%Y-%m-%d").date()
        today = datetime.fromisoformat(today_iso).date()
    except ValueError:
        return None
    if dt < today:
        return None
    return dt.strftime("%b %-d, %Y") if hasattr(dt, "strftime") else dt.isoformat()


_CURRENCY_BY_MARKET = {"US": "$", "IN": "₹"}


def _render_stock_visual_summary(generated: dict[str, Any], payload: dict[str, Any]) -> dict[str, str]:
    """Compose flat strings from the structured LLM output. Every numeric value
    in the final text comes from either the LLM's free-text prose fields or
    from typed slots that name a specific payload field - we never scrape or
    rewrite numbers from the LLM's prose."""
    today_iso = str(payload.get("today", ""))
    currency = _CURRENCY_BY_MARKET.get(str(payload.get("market", "")).upper(), "$")

    what_changed = str(generated.get("what_changed", "")).strip()

    # why_it_matters: the LLM supplies a qualitative claim + an optional
    # (anchor, direction) slot. The server computes the gap % from payload
    # prices, so the LLM never writes a number for this.
    wim = generated.get("why_it_matters") or {}
    claim = str(wim.get("claim", "")).strip().rstrip(".")
    anchor = str(wim.get("gap_anchor", "none")).strip().lower()
    current = payload.get("current_price")
    gap_phrase = ""
    if (
        anchor in _STOCK_PRICE_ANCHORS
        and anchor != "current_price"
        and isinstance(current, (int, float))
        and isinstance(payload.get(anchor), (int, float))
        and float(payload[anchor]) > 0
    ):
        anchor_value = float(payload[anchor])
        pct = abs(float(current) - anchor_value) / anchor_value * 100
        direction = "below" if float(current) < anchor_value else "above"
        gap_phrase = (
            f"{pct:.0f}% {direction} {_PRICE_ANCHOR_LABELS[anchor]} of {currency}{anchor_value:,.2f}"
        )
    why_it_matters = ". ".join(p for p in (claim, gap_phrase) if p)
    if why_it_matters and not why_it_matters.endswith("."):
        why_it_matters += "."

    # what_to_watch: qualitative monitor + optional price anchor + optional date.
    wtw = generated.get("what_to_watch") or {}
    monitor = str(wtw.get("monitor", "")).strip().rstrip(".")
    wtw_anchor = str(wtw.get("price_anchor", "none")).strip().lower()
    date_iso = wtw.get("future_date_iso")
    if _is_low_signal_stock_watch_monitor(monitor):
        monitor = ""
        wtw_anchor = "none"
        date_iso = None

    parts: list[str] = [monitor] if monitor else []
    if wtw_anchor in _STOCK_PRICE_ANCHORS:
        price_value = payload.get(wtw_anchor)
        if isinstance(price_value, (int, float)):
            parts.append(f"vs {_PRICE_ANCHOR_LABELS[wtw_anchor]} of {currency}{price_value:,.2f}")
    if isinstance(date_iso, str) and date_iso.strip():
        human = _format_future_date(date_iso.strip(), today_iso)
        if human:
            parts.append(f"by {human}")
    what_to_watch = " - ".join(parts) if parts else monitor
    if what_to_watch and not what_to_watch.endswith("."):
        what_to_watch += "."

    return {
        "what_changed": what_changed,
        "why_it_matters": why_it_matters,
        "what_to_watch": what_to_watch,
    }


def _round(value: float, digits: int = 2) -> float:
    return round(float(value), digits)


def _score_label(score: int) -> str:
    if score >= 75:
        return "bullish"
    if score >= 60:
        return "constructive"
    if score >= 45:
        return "mixed"
    if score >= 30:
        return "cautious"
    return "bearish"


def _score_from_articles(articles: list[Article]) -> int:
    if not articles:
        return 50
    avg = sum(float(article.sentiment_score) for article in articles) / len(articles)
    return max(5, min(95, int(round(50 + (avg * 50)))))


def _unique(values: list[str], limit: int = 4) -> list[str]:
    """Dedup with prefix-similarity check - two bullets that share the first
    ~45 normalized chars (e.g. "Polymarket is seeking to raise $400 million"
    vs "Polymarket is in talks to raise $400 million...") are treated as the
    same point."""
    seen: list[str] = []
    seen_keys: list[str] = []
    for value in values:
        cleaned = " ".join(str(value).split()).strip().rstrip(".")
        if not cleaned:
            continue
        norm = _normalize_text(cleaned)
        prefix = norm[:45]
        duplicate = False
        for key in seen_keys:
            if norm == key or prefix and prefix == key[:45]:
                duplicate = True
                break
        if duplicate:
            continue
        seen.append(cleaned)
        seen_keys.append(norm)
        if len(seen) >= limit:
            break
    return seen


def _normalize_text(value: str) -> str:
    return " ".join(str(value).lower().split()).strip().rstrip(".")


def _sector_id_from_label(label: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "-", str(label).strip().lower()).strip("-")
    return cleaned or "unknown"


def _filter_generic_points(points: list[str]) -> list[str]:
    bad_starts = (
        "the article",
        "the company is",
        "the company has",
        "known for",
        "major player",
        "leading company",
        "key player",
    )
    bad_terms = (
        "looks alarmingly like",
        "warning for big tech",
        "feature highlights",
        "investment ideas",
        "about to soar",
    )
    filtered = []
    seen_norm: list[str] = []
    for point in points:
        cleaned = " ".join(str(point).split()).strip()
        if not cleaned:
            continue
        lowered = cleaned.lower()
        if any(lowered.startswith(prefix) for prefix in bad_starts):
            continue
        if any(term in lowered for term in bad_terms):
            continue
        # Drop overly numeric / low-information bullets.
        words = cleaned.split()
        if len(words) < 5:
            continue
        if sum(ch.isdigit() for ch in cleaned) >= 6 and len(words) < 10:
            continue

        norm = _normalize_text(cleaned)
        if any(norm == prev or norm in prev or prev in norm for prev in seen_norm):
            continue
        filtered.append(cleaned)
        seen_norm.append(norm)
    return filtered


def _window_split(articles: list[Article]) -> tuple[list[Article], list[Article]]:
    if not articles:
        return [], []
    latest = max(_parse_iso(article.published_at) for article in articles)
    cutoff = latest - timedelta(hours=24)
    today = [article for article in articles if _parse_iso(article.published_at) >= cutoff]
    # Keep week as prior context (excluding the latest 24h) to avoid duplicating "today" narratives.
    week = [article for article in articles if _parse_iso(article.published_at) < cutoff]
    return today, week


_US_MARKET_MARKERS = (
    "s&p 500", "nasdaq", "dow jones", "dow industrial", "wall street",
    "us stocks", "u.s. stocks", "us equities", "u.s. equities", "us market",
    "u.s. market", "russell", "nyse", "cboe", "federal reserve", "the fed",
    "treasury yield", "10-year yield", "fomc", "powell", "cpi report",
    "jobs report", "nonfarm payroll", "ppi report", "us economy", "u.s. economy",
)

_NON_US_WIRE_PATTERNS = (
    # Titles that look like regional market wire summaries - e.g.
    # "Asian Markets Track Wall Street Higher", "Australian Market Trims Early Losses".
    r"^(asian|australian|indian|japanese|chinese|european|uk|british|latam|latin american)\s+(market|markets|shares|stocks|equities)\b",
    r"^(taiwan|hong kong|korea|korean|singapore|philippine|thai|malaysian|indonesia|vietnam)\s+(stocks|shares|markets|weighted)\b",
    r"^(sensex|nifty|kospi|nikkei|hang seng|shanghai composite|ftse|cac|dax|bovespa)\b",
)


def _article_text_lower(article: Article) -> str:
    return " ".join(
        [
            str(article.title or ""),
            str(article.summary or ""),
            str(article.article_overview or ""),
            " ".join(str(p) for p in (article.article_key_points or [])),
        ]
    ).lower()


def _is_non_us_market_article(article: Article) -> bool:
    """True if title matches a regional-market wire pattern with no US anchor."""
    title = str(article.title or "").strip().lower()
    for pattern in _NON_US_WIRE_PATTERNS:
        if re.search(pattern, title):
            return True
    return False


def _article_substance_score(article: Article) -> tuple[int, int, int]:
    """Rank articles for the LLM payload - longer bodies + more primary entities
    + US-anchor come first. Returned as a sort key (desc)."""
    body = (getattr(article, "body_text", "") or "").strip()
    body_bucket = min(len(body) // 500, 20)  # 0..20 buckets of 500 chars
    primary_mentions = sum(
        1
        for mention in (article.entity_mentions or [])
        if str(mention.get("mention_role", "")).lower() == "primary"
    )
    text = _article_text_lower(article)
    us_anchor = 1 if any(marker in text for marker in _US_MARKET_MARKERS) else 0
    return (body_bucket, primary_mentions, us_anchor)


def _market_relevant_articles(articles: list[Article], market: str = "US", limit: int = 10) -> list[Article]:
    """Select universe-independent market-level articles for the brief.

    Pipeline:
      1. Keep coverage_mode == "market" only.
      2. Drop commodity/weather noise and non-US regional wires (when market=US).
      3. Drop articles whose body extraction failed (title-only = pure noise).
      4. Rank by substance (body length, primary entity count, US anchor).
      5. Cap at `limit` so a single noisy feed can't dominate.
    """
    off_topic_terms = (
        "lean hog", "hog futures", "corn futures", "soybean", "wheat futures", "cattle futures",
        "weather forecast", "crop outlook", "livestock",
    )

    relevant: list[Article] = []
    for article in articles:
        if getattr(article, "coverage_mode", "") != "market":
            continue
        text = _article_text_lower(article)
        if any(term in text for term in off_topic_terms):
            continue
        if market == "US" and _is_non_us_market_article(article):
            continue
        body = (getattr(article, "body_text", "") or "").strip()
        summary = (getattr(article, "summary", "") or "").strip()
        if not body and len(summary) < 120:
            continue
        relevant.append(article)

    relevant.sort(key=_article_substance_score, reverse=True)
    return relevant[:limit]


def _sector_relevant_articles(
    articles: list[Article],
    *,
    sector_tickers: set[str],
) -> list[Article]:
    if not sector_tickers:
        return []

    relevant: list[Article] = []
    for article in articles:
        picked = False
        for mention in article.entity_mentions:
            mention_type = str(mention.get("type", "")).lower()
            mention_role = str(mention.get("mention_role", "")).lower()
            mention_ticker = str(mention.get("ticker", "")).upper().strip()

            if mention_type == "stock" and mention_role != "incidental" and mention_ticker in sector_tickers:
                picked = True
                break
        if picked:
            relevant.append(article)
    return relevant


def _extract_points(articles: list[Article]) -> list[str]:
    raw: list[str] = []
    for article in articles:
        raw.extend(article.article_key_points)
        for mention in article.entity_mentions:
            raw.extend(mention.get("bullish_points", []))
            raw.extend(mention.get("risk_points", []))
            what = str(mention.get("what_happened", "")).strip()
            if what:
                raw.append(what)
    return _unique(_filter_generic_points(raw), limit=5)


def _extract_stock_points(articles: list[Article], ticker: str) -> list[str]:
    raw: list[str] = []
    target = ticker.upper()
    for article in articles:
        for mention in article.entity_mentions:
            if str(mention.get("type", "")).lower() != "stock":
                continue
            if str(mention.get("ticker", "")).upper() != target:
                continue
            if str(mention.get("mention_role", "secondary")).lower() == "incidental":
                continue
            raw.extend(mention.get("bullish_points", []))
            raw.extend(mention.get("risk_points", []))
            for field in ("what_happened", "why_it_matters"):
                value = str(mention.get(field, "")).strip()
                if value and value.lower() != "unknown":
                    raw.append(value)
            raw.extend(mention.get("entity_key_points", []))
    if not raw:
        raw = [point for article in articles for point in article.article_key_points]
    return _unique(_filter_generic_points(raw), limit=5)


def _top_sector_labels(articles: list[Article], market: str, limit: int = 3) -> list[str]:
    labels = sector_label_map().get(market, {})
    counts: Counter[str] = Counter()
    for article in articles:
        for mention in article.entity_mentions:
            sector_id = str(mention.get("sector_id", "")).strip()
            if sector_id:
                counts[sector_id] += 1
    top = []
    for sector_id, _ in counts.most_common(limit):
        top.append(labels.get(sector_id, sector_id.replace("-", " ").title()))
    return top


def _market_brief(
    today: list[Article],
    week: list[Article],
    market: str,
    sector_names: list[str] | None = None,
) -> tuple[str, str]:
    today_points = _extract_points(today)
    week_points = _extract_points(week)
    today_score = _score_from_articles(today)
    week_score = _score_from_articles(week)
    today_label = _score_label(today_score)
    sector_names = sector_names if sector_names is not None else _top_sector_labels(today, market)
    sector_clause = ""
    if sector_names:
        sector_clause = f" {', '.join(sector_names[:2])} are driving the tone."
    today_line = (
        f"Today's market tone is {today_label}."
        f" {today_points[0]}." if today_points else f"Today's market tone is {today_label}."
    )
    week_line = (
        f"Over the last week, the tone has stayed {_score_label(week_score)}."
        f" {week_points[0]}." if week_points else f"Over the last week, the tone has stayed {_score_label(week_score)}."
    )
    return (today_line + sector_clause).strip(), week_line.strip()


def build_market_context_doc(
    market: str,
    universe_id: str,
    articles: list[Article],
    writer: ContextBriefWriter | None = None,
    sector_docs: list[dict[str, Any]] | None = None,
    store: TraceMoneyStore | None = None,
) -> dict[str, Any]:
    # Market brief is universe-independent: it depends only on articles whose
    # coverage_mode is "market" (set at enrichment time from source capability +
    # primary entity). stock_docs/sector_docs are no longer consulted here.
    market_articles = _market_relevant_articles(articles, market=market)
    has_enough_articles = (
        len(market_articles) >= 2
        and len({article.source_name for article in market_articles}) >= 2
    )

    # Load recent run summaries for temporal context
    recent_summaries: list[dict[str, Any]] = []
    if store:
        try:
            recent_summaries = store.list_market_run_summaries(market, universe_id, limit=5)
        except Exception:
            recent_summaries = []

    if not has_enough_articles:
        # Deliberate: no bottom-up fallback. If we do not have ≥2 market-lane
        # articles from ≥2 sources, we surface an empty doc and let the UI
        # render a "awaiting market news" state. Faking a brief from per-stock
        # intelligence is what made this universe-dependent in the first place.
        return {
            "market": market,
            "universe_id": universe_id,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "article_count": len(market_articles),
            "source": "insufficient_articles",
        }

    today, week = _window_split(market_articles)
    # Week brief needs a meaningful base. If week has <2 articles, it gets
    # dominated by a single stale item (e.g. one lone NPR piece). In that case
    # fall back to the full market_articles window so the week narrative
    # reflects the actual rolling context instead of one outlier.
    if len(week) < 2:
        week = list(market_articles)
    today_score = _score_from_articles(today)
    week_score = _score_from_articles(week)
    today_points = _extract_points(today)
    week_points = _extract_points(week)
    if sector_docs:
        top_sectors = [
            str(doc.get("sector_label", "")).strip() or str(doc.get("sector_id", "")).strip()
            for doc in sorted(sector_docs, key=lambda item: -int(item.get("article_count", 0)))
            if str(doc.get("sector_label", "")).strip() or str(doc.get("sector_id", "")).strip()
        ][:3]
    else:
        top_sectors = _top_sector_labels(today, market)
    today_brief, week_brief = _market_brief(today, week, market, sector_names=top_sectors)
    what_changed = today_points[0] if today_points else today_brief
    why_it_matters = today_points[1] if len(today_points) > 1 else week_brief
    what_to_watch = week_points[0] if week_points else (today_points[2] if len(today_points) > 2 else "Leadership rotation and breadth")
    if writer and writer.enabled:
        # Include recent history in the LLM payload
        recent_history_lines = []
        for summary in recent_summaries[-5:]:
            date = str(summary.get("date", "")).strip()
            label = str(summary.get("today_label", "")).strip()
            sectors = summary.get("leading_sectors", [])
            if date and label:
                sector_note = f" ({', '.join(sectors[:2])} led)" if sectors else ""
                recent_history_lines.append(f"{date}: {label}{sector_note}")
        payload = {
            "today": datetime.now(timezone.utc).date().isoformat(),
            "market": market,
            "today_label": _score_label(today_score),
            "today_score": today_score,
            "today_key_points": today_points,
            "week_label": _score_label(week_score),
            "week_score": week_score,
            "week_key_points": week_points,
            "recent_history": recent_history_lines,
        }
        generated = writer._call("market", payload)
        today_brief = str(generated.get("today_brief", today_brief)).strip() or today_brief
        week_brief = str(generated.get("week_brief", week_brief)).strip() or week_brief
        what_changed = str(generated.get("what_changed", what_changed)).strip() or what_changed
        why_it_matters = str(generated.get("why_it_matters", why_it_matters)).strip() or why_it_matters
        what_to_watch = str(generated.get("what_to_watch", what_to_watch)).strip() or what_to_watch
        generated_top_sectors = [
            str(s).strip() for s in (generated.get("top_sectors") or []) if str(s).strip()
        ]
        if generated_top_sectors:
            top_sectors = generated_top_sectors[:3]
    result = {
        "market": market,
        "universe_id": universe_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "today_score": today_score,
        "today_label": _score_label(today_score),
        "week_score": week_score,
        "week_label": _score_label(week_score),
        "today_brief": today_brief,
        "week_brief": week_brief,
        "today_key_points": today_points,
        "week_key_points": week_points,
        "visual_summary": {
            "what_changed": what_changed,
            "why_it_matters": why_it_matters,
            "what_to_watch": what_to_watch,
        },
        "top_sectors": top_sectors,
        "article_count": len(market_articles),
        "source": "articles",
    }

    # Persist a compact run summary for temporal lookback
    if store and result.get("today_label"):
        try:
            store.save_market_run_summary(market, universe_id, {
                "date": datetime.now(timezone.utc).date().isoformat(),
                "today_label": result["today_label"],
                "today_score": result["today_score"],
                "leading_sectors": result.get("leading_sectors", result.get("top_sectors", []))[:3],
                "lagging_sectors": result.get("lagging_sectors", [])[:3],
                "source": result.get("source", "articles"),
            })
        except Exception:
            pass  # non-critical

    return result


def build_sector_context_docs(
    market: str,
    universe_id: str,
    instruments: list[dict[str, Any]],
    articles: list[Article],
    writer: ContextBriefWriter | None = None,
) -> list[dict[str, Any]]:
    min_articles = 3
    min_distinct_tickers = 2
    min_sources = 2

    grouped: dict[str, list[Article]] = defaultdict(list)
    ticker_to_sector_id: dict[str, str] = {}
    sector_id_to_label: dict[str, str] = {}

    for instrument in instruments:
        ticker = str(instrument.get("ticker", "")).upper().strip()
        sector_label = str(instrument.get("sector", "")).strip()
        if not ticker or not sector_label:
            continue
        sector_id = _sector_id_from_label(sector_label)
        ticker_to_sector_id[ticker] = sector_id
        sector_id_to_label[sector_id] = sector_label

    for article in articles:
        sector_ids: set[str] = set()
        for mention in article.entity_mentions:
            if str(mention.get("type", "")).lower() != "stock":
                continue
            if str(mention.get("mention_role", "secondary")).lower() == "incidental":
                continue
            ticker = str(mention.get("ticker", "")).upper().strip()
            sector_id = ticker_to_sector_id.get(ticker)
            if sector_id:
                sector_ids.add(sector_id)
        for sector_id in sector_ids:
            grouped[sector_id].append(article)

    docs: list[dict[str, Any]] = []
    for sector_id, sector_articles in grouped.items():
        sector_tickers = {
            ticker
            for ticker, mapped_sector_id in ticker_to_sector_id.items()
            if mapped_sector_id == sector_id
        }
        sector_articles = _sector_relevant_articles(
            sector_articles,
            sector_tickers=sector_tickers,
        )
        if not sector_articles:
            continue
        distinct_tickers = {
            str(mention.get("ticker", "")).upper().strip()
            for article in sector_articles
            for mention in article.entity_mentions
            if str(mention.get("type", "")).lower() == "stock"
            and str(mention.get("mention_role", "secondary")).lower() != "incidental"
            and str(mention.get("ticker", "")).upper().strip() in sector_tickers
        }
        distinct_sources = {str(article.source_name or "").strip() for article in sector_articles if str(article.source_name or "").strip()}
        evidence_gate_passed = (
            len(sector_articles) >= min_articles
            and len(distinct_tickers) >= min_distinct_tickers
            and len(distinct_sources) >= min_sources
        )
        today, week = _window_split(sector_articles)
        today_points = _extract_points(today)
        week_points = _extract_points(week)
        today_score = _score_from_articles(today)
        week_score = _score_from_articles(week)
        sector_label = sector_id_to_label.get(sector_id, sector_id.replace("-", " ").title())
        if evidence_gate_passed:
            today_brief = (
                f"Today's {sector_label} tone is {_score_label(today_score)}."
                + (f" {today_points[0]}." if today_points else "")
            ).strip()
            week_brief = (
                f"Over the last week, {sector_label} has stayed {_score_label(week_score)}."
                + (f" {week_points[0]}." if week_points else "")
            ).strip()
            what_changed = today_points[0] if today_points else today_brief
            why_it_matters = today_points[1] if len(today_points) > 1 else week_brief
            what_to_watch = week_points[0] if week_points else (today_points[2] if len(today_points) > 2 else "Watch fresh participation in this sector")
        else:
            today_score = 50
            week_score = 50
            today_brief = (
                f"Coverage is too narrow for a confident {sector_label} read right now "
                f"({len(sector_articles)} articles, {len(distinct_tickers)} tickers, {len(distinct_sources)} sources)."
            )
            week_brief = "Waiting for broader sector evidence before inferring trend."
            what_changed = today_points[0] if today_points else "No sector-wide shift confirmed yet."
            why_it_matters = "A few single-name stories can misrepresent true sector direction."
            what_to_watch = "Look for confirmation across more names and sources."
        bull_case = ""
        bear_case = ""
        crowd_miss = ""
        if evidence_gate_passed and writer and writer.enabled:
            # Sector tickers mentioned across the articles - helps the model anchor
            # bull/bear cases to actual names instead of the sector label alone.
            mentioned_tickers = sorted(distinct_tickers)[:12]
            payload = {
                "today": datetime.now(timezone.utc).date().isoformat(),
                "market": market,
                "sector_label": sector_label,
                "today_label": _score_label(today_score),
                "today_score": today_score,
                "today_key_points": today_points,
                "week_label": _score_label(week_score),
                "week_score": week_score,
                "week_key_points": week_points,
                "sector_tickers_mentioned": mentioned_tickers,
                "article_count": len(sector_articles),
            }
            generated = writer._call("sector", payload)
            today_iso = payload["today"]
            # Any date string verbatim present in the payload's key points is
            # considered "source-confirmed" and may stay. Everything else is
            # stripped if it references a date in the past or at all.
            payload_text = " ".join(
                str(x) for x in list(today_points) + list(week_points) + list(mentioned_tickers)
            )
            allowed_dates = {m.group(0) for m in _ISO_DATE_RE.finditer(payload_text)}

            def _clean(v: str) -> str:
                return _strip_unsafe_dates_and_placeholders(v, today_iso=today_iso, allowed_dates=allowed_dates)

            today_brief = _clean(str(generated.get("today_brief", today_brief)).strip()) or today_brief
            week_brief = _clean(str(generated.get("week_brief", week_brief)).strip()) or week_brief
            what_changed = _clean(str(generated.get("what_changed", what_changed)).strip()) or what_changed
            # The new sector schema has no `why_it_matters` field - bull_case
            # replaces that slot on the UI side.
            why_it_matters = ""
            what_to_watch = _clean(str(generated.get("what_to_watch", what_to_watch)).strip()) or what_to_watch
            bull_case = _clean(str(generated.get("bull_case", "")).strip())
            bear_case = _clean(str(generated.get("bear_case", "")).strip())
            crowd_miss = _clean(str(generated.get("crowd_miss", "")).strip())
        docs.append({
            "market": market,
            "universe_id": universe_id,
            "sector_id": sector_id,
            "sector_label": sector_label,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "today_score": today_score,
            "today_label": _score_label(today_score),
            "week_score": week_score,
            "week_label": _score_label(week_score),
            "today_brief": today_brief,
            "week_brief": week_brief,
            "today_key_points": today_points,
            "week_key_points": week_points,
            "visual_summary": {
                "what_changed": what_changed,
                "why_it_matters": why_it_matters,
                "what_to_watch": what_to_watch,
                "bull_case": bull_case,
                "bear_case": bear_case,
                "crowd_miss": crowd_miss,
            },
            "evidence": {
                "gate_passed": evidence_gate_passed,
                "article_count": len(sector_articles),
                "distinct_ticker_count": len(distinct_tickers),
                "source_count": len(distinct_sources),
                "min_articles": min_articles,
                "min_distinct_tickers": min_distinct_tickers,
                "min_sources": min_sources,
            },
            "article_count": len(sector_articles),
        })
    docs.sort(key=lambda item: (-int(item["article_count"]), item["sector_label"]))
    return docs


def contextualize_stock_docs(
    instruments: list[dict[str, Any]],
    articles: list[Article],
    stock_docs: list[dict[str, Any]],
    market_context: dict[str, Any],
    sector_context_docs: list[dict[str, Any]],
    writer: ContextBriefWriter | None = None,
    price_by_id: dict[str, dict[str, Any]] | None = None,
    analyst_by_id: dict[str, dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    price_by_id = price_by_id or {}
    analyst_by_id = analyst_by_id or {}
    docs_by_id = {doc["instrument_id"]: dict(doc) for doc in stock_docs}
    sector_context_by_id = {doc["sector_id"]: doc for doc in sector_context_docs}
    articles_by_ticker: dict[str, list[Article]] = defaultdict(list)

    for article in articles:
        tickers = {
            str(mention.get("ticker", "")).upper()
            for mention in article.entity_mentions
            if str(mention.get("type", "")).lower() == "stock"
            and str(mention.get("ticker", "")).strip()
            and str(mention.get("mention_role", "secondary")).lower() != "incidental"
        }
        for ticker in tickers:
            articles_by_ticker[ticker].append(article)

    contextualized: list[dict[str, Any]] = []
    for instrument in instruments:
        doc = docs_by_id.get(instrument["instrument_id"])
        if not doc:
            continue
        ticker = instrument["ticker"].upper()
        matched_articles = articles_by_ticker.get(ticker, [])
        stock_today, stock_week = _window_split(matched_articles)
        stock_points_today = _extract_stock_points(stock_today, ticker)
        stock_points_week = _extract_stock_points(stock_week, ticker)
        sector_id = ""
        for article in matched_articles:
            for mention in article.entity_mentions:
                if str(mention.get("ticker", "")).upper() == ticker:
                    sector_id = str(mention.get("sector_id", "")).strip() or sector_id
        sector_context = sector_context_by_id.get(sector_id, {})

        stock_sentence = stock_points_today[0] if stock_points_today else str(doc.get("headline", "")).strip().rstrip(".")
        week_sentence = stock_points_week[0] if stock_points_week else (str(doc.get("key_points", [""])[0]).strip() if doc.get("key_points") else "")
        contextual_brief = " ".join(
            part.rstrip(".") + "."
            for part in [stock_sentence, str(sector_context.get("today_brief", "")).strip(), str(market_context.get("today_brief", "")).strip()]
            if part
        ).strip()
        generated_headline = str(doc.get("headline", "")).strip()
        generated_catalyst = str(doc.get("catalyst", "")).strip()
        generated_risk = str(doc.get("risk", "")).strip()
        # `visual_cards` feeds the Catalysts / Drivers / Risks UI column.
        # The upstream pipeline (stock_intelligence.build_stock_doc) writes
        # these three arrays inside `visual_summary` - we reshape them into
        # `visual_cards` here because the next step overwrites `visual_summary`
        # with the {what_changed, why_it_matters, what_to_watch} block.
        upstream_visual = doc.get("visual_summary") if isinstance(doc.get("visual_summary"), dict) else {}
        prior_visual_cards = doc.get("visual_cards") if isinstance(doc.get("visual_cards"), dict) else {}
        existing_visual_cards: dict[str, Any] = {
            "catalyst_cards": list(
                upstream_visual.get("catalyst_cards")
                or prior_visual_cards.get("catalyst_cards")
                or []
            ),
            "drivers": list(
                upstream_visual.get("drivers")
                or prior_visual_cards.get("drivers")
                or []
            ),
            "risk_cards": list(
                upstream_visual.get("risk_cards")
                or prior_visual_cards.get("risk_cards")
                or []
            ),
        }
        visual_summary = {
            "what_changed": stock_points_today[0] if stock_points_today else generated_headline,
            "why_it_matters": stock_points_today[1] if len(stock_points_today) > 1 else contextual_brief,
            "what_to_watch": stock_points_week[0] if stock_points_week else generated_catalyst or generated_risk,
        }
        if writer and writer.enabled:
            price_row = price_by_id.get(instrument["instrument_id"], {}) or {}
            quote = price_row.get("quote") or {}
            fundamentals = price_row.get("fundamentals") or {}
            analyst_row = analyst_by_id.get(instrument["instrument_id"], {}) or {}
            payload = {
                "today": datetime.now(timezone.utc).date().isoformat(),
                "market": str(instrument.get("market", "US")).upper(),
                "instrument_name": instrument["name"],
                "ticker": ticker,
                "current_price": quote.get("current"),
                "analyst_target": analyst_row.get("target_price"),
                "week_52_high": fundamentals.get("week_52_high"),
                "week_52_low": fundamentals.get("week_52_low"),
                "stock_today_points": stock_points_today,
                "stock_week_points": stock_points_week,
                "stock_score": int(doc.get("overall_score", 50)),
                "stock_label": str(doc.get("overall_label", "")),
                "news_count": int(doc.get("news_count", 0)),
                "source_count": int(doc.get("source_count", 0)),
                "sector_context_today": str(sector_context.get("today_brief", "")).strip(),
                "sector_context_week": str(sector_context.get("week_brief", "")).strip(),
                "market_context_today": str(market_context.get("today_brief", "")).strip(),
                "market_context_week": str(market_context.get("week_brief", "")).strip(),
            }
            generated = writer._call("stock", payload)
            generated_headline = str(generated.get("headline", generated_headline)).strip() or generated_headline
            contextual_brief = str(generated.get("today_brief", contextual_brief)).strip() or contextual_brief
            week_sentence = str(generated.get("week_brief", week_sentence)).strip() or week_sentence
            generated_catalyst = str(generated.get("catalyst", generated_catalyst)).strip() or generated_catalyst
            generated_risk = str(generated.get("risk", generated_risk)).strip() or generated_risk
            rendered = _render_stock_visual_summary(generated, payload)
            visual_summary = {
                "what_changed": rendered["what_changed"] or visual_summary.get("what_changed", ""),
                "why_it_matters": rendered["why_it_matters"] or visual_summary.get("why_it_matters", ""),
                "what_to_watch": rendered["what_to_watch"] or visual_summary.get("what_to_watch", ""),
            }

        doc["today_brief"] = contextual_brief
        doc["week_summary"] = week_sentence
        doc["headline"] = generated_headline
        doc["catalyst"] = generated_catalyst
        doc["risk"] = generated_risk
        # Always write visual_cards - even an empty-arrays object is valid and
        # lets the frontend distinguish "no data yet" from "field not written".
        doc["visual_cards"] = existing_visual_cards
        doc["visual_summary"] = visual_summary
        doc["market_context"] = {
            "today_brief": market_context.get("today_brief", ""),
            "week_brief": market_context.get("week_brief", ""),
        }
        doc["sector_context"] = {
            "sector_id": sector_id,
            "today_brief": sector_context.get("today_brief", ""),
            "week_brief": sector_context.get("week_brief", ""),
        }
        contextualized.append(doc)
    return contextualized
