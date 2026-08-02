"""Compare stock brief synthesis across baseline and enriched contexts.

Example:
  cd backend && python -m backend.scripts.compare_brief_price_context --ticker NVDA
"""
from __future__ import annotations

import argparse
import json
from typing import Any

from backend.instrument_universe import list_instruments
from backend.models import Article
from backend.stock_intelligence import (
    _llm_synthesize_brief,
    build_stock_intelligence_docs,
)
from backend.storage import TraceMoneyStore


def _coerce_article(payload: dict[str, Any]) -> Article:
    row = dict(payload)
    row.setdefault("body_text", "")
    return Article(**row)


def _find_instrument(market: str, universe_id: str, ticker: str) -> dict[str, Any] | None:
    target = ticker.strip().upper()
    for instrument in list_instruments(market, universe_id):
        if str(instrument.get("ticker", "")).upper() == target:
            return instrument
    return None


def _capture_synthesis_kwargs(
    market: str,
    universe_id: str,
    instrument: dict[str, Any],
    articles: list[Article],
    store: TraceMoneyStore,
) -> dict[str, Any] | None:
    captured: dict[str, Any] = {}
    original = _llm_synthesize_brief

    def _wrapper(**kwargs: Any) -> dict[str, Any] | None:
        captured.update(kwargs)
        return None

    import backend.stock_intelligence as stock_intelligence

    stock_intelligence._llm_synthesize_brief = _wrapper  # type: ignore[assignment]
    try:
        build_stock_intelligence_docs(
            market,
            universe_id,
            [instrument],
            articles,
            store=store,
        )
    finally:
        stock_intelligence._llm_synthesize_brief = original  # type: ignore[assignment]

    return captured or None


def _ui_view(
    brief: dict[str, Any] | None,
    *,
    sentiment_label: str,
    sentiment_score: int,
    top_news_title: str | None = None,
) -> dict[str, Any]:
    """Map LLM brief fields to what the stock page AI tab actually renders."""
    if not brief:
        return {"error": "no brief generated"}

    catalyst_cards = brief.get("catalyst_cards") if isinstance(brief.get("catalyst_cards"), list) else []
    drivers = brief.get("drivers") if isinstance(brief.get("drivers"), list) else []
    risk_cards = brief.get("risk_cards") if isinstance(brief.get("risk_cards"), list) else []

    return {
        "news_signal": {
            "score": sentiment_score,
            "label": sentiment_label,
            "what_the_news_is_saying": top_news_title or brief.get("body"),
            "why_it_matters_for_the_stock": brief.get("thesis"),
            "watch_for_next": brief.get("catalyst"),
        },
        "catalysts_drivers_risks": {
            "catalysts": [
                {
                    "title": card.get("event"),
                    "detail": card.get("detail"),
                    "window": card.get("window"),
                }
                for card in catalyst_cards
                if isinstance(card, dict)
            ],
            "drivers": [
                {
                    "title": driver.get("label"),
                    "detail": driver.get("detail"),
                    "horizon": driver.get("horizon"),
                }
                for driver in drivers
                if isinstance(driver, dict)
            ],
            "risks": [
                {
                    "title": risk.get("risk") or risk.get("label"),
                    "detail": risk.get("detail"),
                }
                for risk in risk_cards
                if isinstance(risk, dict)
            ],
        },
    }


def _print_ui_view(label: str, view: dict[str, Any]) -> None:
    print(f"\n{'=' * 72}")
    print(label)
    print("=" * 72)
    if view.get("error"):
        print(view["error"])
        return
    print(json.dumps(view, indent=2, ensure_ascii=True))


def _print_brief(label: str, brief: dict[str, Any] | None) -> None:
    print(f"\n{'=' * 72}")
    print(label)
    print("=" * 72)
    if not brief:
        print("(no LLM response — check OPENAI_API_KEY)")
        return
    for key in (
        "headline",
        "thesis",
        "body",
        "setup_state",
        "catalyst",
        "risk",
        "key_findings",
    ):
        value = brief.get(key)
        if value:
            print(f"\n[{key}]")
            print(json.dumps(value, indent=2, ensure_ascii=True) if isinstance(value, (dict, list)) else value)


def main() -> None:
    parser = argparse.ArgumentParser(description="Compare stock brief with/without price_context")
    parser.add_argument("--market", choices=["US", "IN"], default="US")
    parser.add_argument("--ticker", required=True, help="Ticker symbol, e.g. NVDA")
    parser.add_argument("--universe", default="", help="AI universe id (defaults to active)")
    parser.add_argument("--show-context", action="store_true", help="Print price_context payload")
    parser.add_argument("--raw", action="store_true", help="Also print full raw LLM fields")
    args = parser.parse_args()

    store = TraceMoneyStore()
    universe_id = args.universe.strip() or store.get_active_ai_universe(args.market)
    if not universe_id:
        raise SystemExit(f"No active AI universe for {args.market}")

    instrument = _find_instrument(args.market, universe_id, args.ticker)
    if not instrument:
        raise SystemExit(f"Ticker {args.ticker!r} not found in {args.market}/{universe_id}")

    articles = [
        _coerce_article(payload)
        for payload in store.list_article_enrichments(args.market, universe_id)
    ]
    print(
        f"Comparing brief synthesis for {instrument['ticker']} "
        f"({instrument['instrument_id']}) in {args.market}/{universe_id}"
    )
    print(f"Loaded {len(articles)} enriched articles")

    kwargs = _capture_synthesis_kwargs(args.market, universe_id, instrument, articles, store)
    if not kwargs:
        raise SystemExit(
            "Could not capture synthesis inputs — no news-backed brief path for this ticker. "
            "Try a ticker with recent enriched articles."
        )

    price_context = kwargs.pop("price_context", None)
    market_regime = kwargs.pop("market_regime", None)
    kwargs["store"] = None

    if args.show_context and price_context:
        print("\n[price_context payload]")
        print(json.dumps(price_context, indent=2, ensure_ascii=True))

    baseline = _llm_synthesize_brief(**kwargs, price_context=None, market_regime=None)
    with_price = _llm_synthesize_brief(**kwargs, price_context=price_context, market_regime=None)
    full = _llm_synthesize_brief(**kwargs, price_context=price_context, market_regime=market_regime)

    top_news_title = None
    titles = kwargs.get("article_titles")
    if isinstance(titles, list) and titles:
        top_news_title = str(titles[0])

    _print_ui_view(
        "UI — BASELINE (no price_context, no market_regime)",
        _ui_view(
            baseline,
            sentiment_label=str(kwargs.get("sentiment_label") or "neutral"),
            sentiment_score=int(kwargs.get("sentiment_score") or 50),
            top_news_title=top_news_title,
        ),
    )
    _print_ui_view(
        "UI — WITH price_context only",
        _ui_view(
            with_price,
            sentiment_label=str(kwargs.get("sentiment_label") or "neutral"),
            sentiment_score=int(kwargs.get("sentiment_score") or 50),
            top_news_title=top_news_title,
        ),
    )
    _print_ui_view(
        "UI — FULL (price_context + market_regime + new prompt policy)",
        _ui_view(
            full,
            sentiment_label=str(kwargs.get("sentiment_label") or "neutral"),
            sentiment_score=int(kwargs.get("sentiment_score") or 50),
            top_news_title=top_news_title,
        ),
    )

    if args.raw:
        _print_brief("RAW — BASELINE", baseline)
        _print_brief("RAW — WITH price_context only", with_price)
        _print_brief("RAW — FULL", full)


if __name__ == "__main__":
    main()
