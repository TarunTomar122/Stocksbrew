"""Bootstrap Tikrr dynamic Firestore docs from existing market data and intelligence."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import numpy as np
import yfinance as yf

from backend.stock_intelligence import generate_market_brief, generate_no_news_brief, generate_portfolio_brief, generate_sector_brief
from backend.storage import TraceMoneyStore


MARKET_INDEX_SYMBOLS = {
    "US": [
        ("S&P 500", "^GSPC"),
        ("Nasdaq", "^IXIC"),
        ("Dow Jones", "^DJI"),
    ],
    "IN": [
        ("NIFTY 50", "^NSEI"),
        ("SENSEX", "^BSESN"),
        ("BANK NIFTY", "^NSEBANK"),
    ],
}

GLOBAL_CUE_SYMBOLS = {
    "oil": "CL=F",
    "gold": "GC=F",
    "dxy": "DX-Y.NYB",
    "vix": "^VIX",
    "usTenYear": "^TNX",
}

TRACKED_STOCKS = {
    "US": ["NVDA", "AMD", "MSFT", "AAPL", "TSLA", "AMZN", "META", "GOOGL", "PLTR", "LMT", "TSM", "INTC"],
    "IN": ["RELIANCE", "HDFCBANK", "TCS", "INFY", "ICICIBANK"],
}

UNIVERSES = {
    "US": "us_test_12",
    "IN": "in_test_5",
}


def _to_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _score_to_sentiment(score: float) -> float:
    return max(-1.0, min(1.0, (score - 50.0) / 50.0))


def _label_from_sentiment(value: float) -> str:
    if value >= 0.35:
        return "Bullish"
    if value >= 0.1:
        return "Constructive"
    if value <= -0.35:
        return "Bearish"
    if value <= -0.1:
        return "Cautious"
    return "Neutral"


def _fetch_stock_enrichment(yahoo_symbol: str) -> dict[str, Any]:
    """Fetch earnings date, real SMA/RSI, streak, avgVolume from yfinance."""
    try:
        ticker = yf.Ticker(yahoo_symbol)
        info = ticker.info or {}

        # Earnings calendar
        earnings_date = None
        earnings_eps_estimate = None
        try:
            cal = ticker.calendar
            if cal and "Earnings Date" in cal:
                dates = cal["Earnings Date"]
                if isinstance(dates, list) and len(dates) > 0:
                    earnings_date = str(dates[0])
                elif dates:
                    earnings_date = str(dates)
            if cal and "Earnings Average" in cal:
                earnings_eps_estimate = _to_float(cal["Earnings Average"])
        except Exception:
            pass

        # Real SMA50, SMA200, avgVolume
        sma50 = _to_float(info.get("fiftyDayAverage"))
        sma200 = _to_float(info.get("twoHundredDayAverage"))
        avg_volume = _to_float(info.get("averageVolume"))

        # 1-month history for RSI calculation + streak
        history = ticker.history(period="1mo", interval="1d", auto_adjust=False)
        rsi14 = 0.0
        streak_days = 0
        streak_direction = "flat"
        recent_closes: list[float] = []

        if history is not None and not getattr(history, "empty", True) and len(history) >= 3:
            closes = history["Close"].values

            # Recent closes (last 7 for the frontend)
            recent_closes = [round(float(c), 2) for c in closes[-7:]]

            # RSI(14) calculation
            if len(closes) >= 15:
                deltas = np.diff(closes)
                gains = np.where(deltas > 0, deltas, 0.0)
                losses = np.where(deltas < 0, -deltas, 0.0)
                avg_gain = float(np.mean(gains[-14:]))
                avg_loss = float(np.mean(losses[-14:]))
                if avg_loss == 0:
                    rsi14 = 100.0
                else:
                    rs = avg_gain / avg_loss
                    rsi14 = 100.0 - (100.0 / (1.0 + rs))

            # Streak detection — consecutive up or down days
            direction = None
            count = 0
            for i in range(len(closes) - 1, 0, -1):
                diff = closes[i] - closes[i - 1]
                if diff > 0:
                    d = "up"
                elif diff < 0:
                    d = "down"
                else:
                    break
                if direction is None:
                    direction = d
                if d == direction:
                    count += 1
                else:
                    break
            streak_days = count
            streak_direction = direction or "flat"

        return {
            "earningsDate": earnings_date,
            "earningsEpsEstimate": round(earnings_eps_estimate, 3) if earnings_eps_estimate else None,
            "sma50": round(sma50, 2),
            "sma200": round(sma200, 2),
            "rsi14": round(rsi14, 1),
            "avgVolume": round(avg_volume),
            "streakDays": streak_days,
            "streakDirection": streak_direction,
            "recentCloses": recent_closes,
        }
    except Exception as exc:
        print(f"    ⚠ Enrichment failed for {yahoo_symbol}: {exc}")
        return {}


def _yahoo_symbol(symbol: str, market: str) -> str:
    """Convert a Tikrr symbol to a Yahoo Finance symbol."""
    if market == "IN":
        return f"{symbol}.NS"
    return symbol


def _history_quote(symbol: str) -> dict[str, float]:
    ticker = yf.Ticker(symbol)
    history = ticker.history(period="5d", interval="1d", auto_adjust=False)
    if history is None or getattr(history, "empty", True):
        return {"value": 0.0, "change": 0.0, "changePct": 0.0}
    latest = history.iloc[-1]
    previous = history.iloc[-2] if len(history) > 1 else latest
    value = _to_float(latest.get("Close"))
    prev_value = _to_float(previous.get("Close"))
    change = value - prev_value
    change_pct = (change / prev_value * 100.0) if prev_value else 0.0
    return {"value": round(value, 2), "change": round(change, 2), "changePct": round(change_pct, 2)}


def _build_market_doc(
    market: str,
    latest_prices: dict[str, dict[str, Any]],
    stock_docs: list[dict[str, Any]],
    market_context: dict[str, Any] | None,
) -> dict[str, Any]:
    tracked_rows = []
    for instrument_id, payload in latest_prices.items():
        quote = payload.get("quote", {})
        tracked_rows.append({
            "symbol": instrument_id.split("_", 1)[1],
            "changePct": round(_to_float(quote.get("day_change_pct")), 2),
        })
    tracked_rows.sort(key=lambda item: item["changePct"], reverse=True)
    gainers = tracked_rows[:2]
    losers = sorted(tracked_rows, key=lambda item: item["changePct"])[:2]

    avg_sentiment = 0.0
    if stock_docs:
        avg_sentiment = sum(_score_to_sentiment(_to_float(doc.get("overall_score"), 50.0)) for doc in stock_docs) / len(stock_docs)

    headlines = []
    for doc in stock_docs[:3]:
        headline = str(doc.get("headline", "")).strip()
        if headline:
            headlines.append(headline)

    bottom_line = str((market_context or {}).get("today_brief", "")).strip()
    if not bottom_line:
        bottom_line = f"{market} market snapshot built from tracked names and current price data."

    indices = [
        {"name": label, **_history_quote(symbol)}
        for label, symbol in MARKET_INDEX_SYMBOLS[market]
    ]
    global_cues = {
        key: _history_quote(symbol)
        for key, symbol in GLOBAL_CUE_SYMBOLS.items()
    }

    return {
        "market": market,
        "lastUpdated": datetime.now(timezone.utc).isoformat(),
        "runType": "market_close",
        "indices": indices,
        "sentiment": {
            "overall": round(avg_sentiment, 2),
            "label": _label_from_sentiment(avg_sentiment),
            "drivers": headlines[:3],
        },
        "topMovers": {
            "gainers": gainers,
            "losers": losers,
        },
        "globalCues": global_cues,
        "keyHeadlines": headlines[:2],
        "bottomLine": bottom_line,
    }


def _build_stock_doc(
    symbol: str,
    price_payload: dict[str, Any],
    intelligence: dict[str, Any] | None,
    enrichment: dict[str, Any] | None = None,
) -> dict[str, Any]:
    intelligence = intelligence or {}
    enrichment = enrichment or {}
    quote = price_payload.get("quote", {})
    analyst = price_payload.get("analyst_consensus", {}) or {}
    fundamentals = price_payload.get("fundamentals", {}) or {}
    overall_score = _to_float(intelligence.get("overall_score"), 50.0)
    overall_sentiment = _score_to_sentiment(overall_score)
    news_items = []
    for idx, item in enumerate(intelligence.get("timeline", [])[:5]):
        news_items.append({
            "id": f"{symbol.lower()}-{idx+1}",
            "timestamp": str(item.get("timestamp", price_payload.get("captured_at"))),
            "title": str(item.get("title", "")),
            "source": str(item.get("source_name", "")),
            "summary": str(item.get("summary", "")),
            "sentiment": overall_sentiment,
            "category": "news",
        })

    target_price = _to_float(analyst.get("target_price"))
    current_price = _to_float(quote.get("current"))
    upside = ((target_price - current_price) / current_price * 100.0) if current_price and target_price else 0.0
    high_52 = _to_float(fundamentals.get("week_52_high"))
    from_high = ((current_price - high_52) / high_52 * 100.0) if current_price and high_52 else 0.0

    # Use real technicals from enrichment, fall back to estimates
    rsi14 = _to_float(enrichment.get("rsi14")) or (50.0 + _to_float(quote.get("day_change_pct")) * 5.0)
    sma50 = _to_float(enrichment.get("sma50")) or round(current_price * 0.98, 2)
    sma200 = _to_float(enrichment.get("sma200")) or round(current_price * 0.92, 2)
    avg_volume = _to_float(enrichment.get("avgVolume")) or round(_to_float(quote.get("volume")))

    # Trend based on SMA crossover
    if current_price > sma50 and current_price > sma200:
        trend = "bullish"
    elif current_price < sma50 and current_price < sma200:
        trend = "bearish"
    else:
        trend = "neutral"

    return {
        "lastUpdated": datetime.now(timezone.utc).isoformat(),
        "runType": "market_close",
        "price": {
            "current": round(current_price, 2),
            "open": round(_to_float(quote.get("open")), 2),
            "high": round(_to_float(quote.get("high")), 2),
            "low": round(_to_float(quote.get("low")), 2),
            "previousClose": round(_to_float(quote.get("previous_close")), 2),
            "change": round(_to_float(quote.get("day_change_abs")), 2),
            "changePct": round(_to_float(quote.get("day_change_pct")), 2),
            "volume": round(_to_float(quote.get("volume"))),
            "avgVolume": round(avg_volume),
        },
        "sentiment": {
            "overall": round(overall_sentiment, 2),
            "drivers": [str(point) for point in intelligence.get("key_points", [])[:3]],
        },
        "news": news_items,
        "highlights": {
            "positive": [str(item) for item in intelligence.get("bullish_points", [])[:3]],
            "negative": [str(item) for item in intelligence.get("risk_points", [])[:3]],
            "neutral": [str(item) for item in intelligence.get("key_points", [])[3:6]],
        },
        "technicals": {
            "rsi14": round(rsi14, 1),
            "sma50": round(sma50, 2),
            "sma200": round(sma200, 2),
            "fiftyTwoWeekHigh": round(high_52, 2),
            "fiftyTwoWeekLow": round(_to_float(fundamentals.get("week_52_low")), 2),
            "fromHigh": f"{from_high:+.1f}%",
            "trend": trend,
        },
        "analystConsensus": {
            "rating": str(analyst.get("label", "N/A")),
            "targetPrice": round(target_price, 2),
            "upside": round(upside, 1),
            "numAnalysts": int(_to_float(analyst.get("buy"))),
        },
        # Earnings
        "earnings": {
            "date": enrichment.get("earningsDate"),
            "epsEstimate": enrichment.get("earningsEpsEstimate"),
        },
        # Streak + recent closes
        "streak": {
            "days": int(enrichment.get("streakDays", 0)),
            "direction": str(enrichment.get("streakDirection", "flat")),
        },
        "recentCloses": enrichment.get("recentCloses", []),
        "catalysts": [str(intelligence.get("catalyst", "")).strip()] if str(intelligence.get("catalyst", "")).strip() else [],
        "bottomLine": str(intelligence.get("today_brief") or intelligence.get("body") or f"{symbol} snapshot seeded from current market data.").strip(),
    }


def _build_sector_docs(market: str, sectors_meta: dict[str, Any], stock_payloads: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    docs: dict[str, dict[str, Any]] = {}
    for sector_id, meta in sectors_meta.items():
        symbols = [symbol for symbol in meta.get("stocks", []) if symbol in stock_payloads]
        if not symbols:
            continue
        sentiment_values = [stock_payloads[s]["sentiment"]["overall"] for s in symbols]
        avg_sentiment = sum(sentiment_values) / len(sentiment_values)
        change_values = [stock_payloads[s]["price"]["changePct"] for s in symbols]
        sorted_symbols = sorted(symbols, key=lambda s: stock_payloads[s]["price"]["changePct"], reverse=True)
        docs[sector_id] = {
            "lastUpdated": datetime.now(timezone.utc).isoformat(),
            "runType": "market_close",
            "sentiment": {
                "overall": round(avg_sentiment, 2),
                "label": _label_from_sentiment(avg_sentiment),
                "drivers": [stock_payloads[s]["bottomLine"] for s in sorted_symbols[:2]],
            },
            "performance": {
                "changePct": round(sum(change_values) / len(change_values), 2),
                "vsMarket": "outperforming" if sum(change_values) > 0 else "underperforming" if sum(change_values) < 0 else "flat",
            },
            "topMovers": {
                "gainers": [{"symbol": s, "changePct": stock_payloads[s]["price"]["changePct"]} for s in sorted_symbols[:2]],
                "losers": [{"symbol": s, "changePct": stock_payloads[s]["price"]["changePct"]} for s in sorted(symbols, key=lambda sym: stock_payloads[sym]["price"]["changePct"])[:2]],
            },
            "drivers": [stock_payloads[s]["bottomLine"] for s in sorted_symbols[:2]],
            "bottomLine": f"{meta.get('name', sector_id)} is being led by {sorted_symbols[0]} with sentiment { _label_from_sentiment(avg_sentiment).lower() }.",
        }
    return docs


def main() -> None:
    store = TraceMoneyStore()
    meta_stocks = (store.db.collection("meta").document("stocks").get().to_dict() or {})
    meta_sectors = (store.db.collection("meta").document("sectors").get().to_dict() or {})

    for market in ("US", "IN"):
        universe = UNIVERSES[market]
        tracked_ids = [f"{market}_{symbol}" for symbol in TRACKED_STOCKS[market]]
        latest_prices = store.get_latest_prices(tracked_ids)
        stock_intel_map = {
            row["instrument_id"]: row
            for row in store.list_stock_intelligence_docs(market, universe)
        }
        market_context = store.get_market_context_doc(market, universe)

        # Fetch enrichment data (earnings, real technicals, streak) for all stocks
        print(f"  Fetching enrichment data (earnings, RSI, streak)...")
        enrichment_map: dict[str, dict[str, Any]] = {}
        for symbol in TRACKED_STOCKS[market]:
            yahoo_sym = _yahoo_symbol(symbol, market)
            enrichment_map[symbol] = _fetch_stock_enrichment(yahoo_sym)

        stock_payloads: dict[str, dict[str, Any]] = {}
        for instrument_id, price_payload in latest_prices.items():
            symbol = instrument_id.split("_", 1)[1]
            stock_payload = _build_stock_doc(
                symbol, price_payload, stock_intel_map.get(instrument_id),
                enrichment=enrichment_map.get(symbol),
            )
            stock_payload["market"] = market
            stock_payload["symbol"] = symbol

            # For stocks with no news/intelligence, generate an LLM brief from market data
            if instrument_id not in stock_intel_map:
                stock_meta = meta_stocks.get(market, {}).get(symbol, {})
                no_news = generate_no_news_brief(
                    ticker=symbol,
                    name=stock_meta.get("name", symbol),
                    price_data=stock_payload["price"],
                    technicals=stock_payload["technicals"],
                    analyst=stock_payload["analystConsensus"],
                    store=store,
                )
                if no_news:
                    stock_payload["bottomLine"] = no_news.get("headline", stock_payload["bottomLine"])
                    stock_payload["sentiment"]["drivers"] = no_news.get("key_findings", [])[:3]
                    if no_news.get("catalyst"):
                        stock_payload["catalysts"] = [no_news["catalyst"]]
                    print(f"  Generated no-news brief for {symbol}")

            store.db.collection("stocks").document(instrument_id).set(stock_payload)
            stock_payloads[symbol] = stock_payload

        market_doc = _build_market_doc(market, latest_prices, list(stock_intel_map.values()), market_context)

        # Generate LLM market brief
        stock_headlines = [sp["bottomLine"] for sp in stock_payloads.values() if "seeded" not in sp.get("bottomLine", "")]
        market_brief_result = generate_market_brief(
            market=market,
            indices=market_doc.get("indices", []),
            global_cues=market_doc.get("globalCues", {}),
            top_movers=market_doc.get("topMovers", {}),
            sentiment=market_doc.get("sentiment", {}),
            stock_headlines=stock_headlines,
            store=store,
        )
        if market_brief_result:
            market_doc["briefOverview"] = market_brief_result.get("overview", "")
            market_doc["briefGlobalForces"] = market_brief_result.get("global_forces", "")
            market_doc["briefOutlook"] = market_brief_result.get("outlook", "")
            print(f"  Generated market brief for {market}")

        store.db.collection("markets").document(market).set(market_doc)

        # Generate LLM portfolio brief for the watchlist
        portfolio_result = generate_portfolio_brief(list(stock_payloads.values()), store=store)
        if portfolio_result:
            store.db.collection("portfolio_briefs").document(f"{market}_default").set({
                "narrative": portfolio_result.get("narrative", ""),
                "movers": portfolio_result.get("movers", []),
                "signals": portfolio_result.get("signals", []),
                "blind_spot_title": portfolio_result.get("blind_spot_title", ""),
                "blind_spot_body": portfolio_result.get("blind_spot_body", ""),
                "tiles": portfolio_result.get("tiles", []),
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "stock_count": len(stock_payloads),
            })
            print(f"  Generated portfolio brief for {market} ({len(stock_payloads)} stocks)")

        sectors_meta = (meta_sectors.get("us") if market == "US" else meta_sectors.get("india")) or {}
        sector_docs = _build_sector_docs(market, sectors_meta, stock_payloads)
        for sector_id, sector_payload in sector_docs.items():
            # Generate LLM sector brief
            sector_stock_details = []
            for sym in (sectors_meta.get(sector_id, {}).get("stocks") or []):
                if sym in stock_payloads:
                    sp = stock_payloads[sym]
                    sector_stock_details.append({
                        "symbol": sym,
                        "price_change_pct": sp["price"]["changePct"],
                        "headline": sp["bottomLine"][:200],
                        "sentiment": sp["sentiment"]["overall"],
                    })
            sector_brief_result = generate_sector_brief(
                sector_name=sectors_meta.get(sector_id, {}).get("name", sector_id),
                sector_data=sector_payload,
                stock_details=sector_stock_details,
                store=store,
            )
            if sector_brief_result:
                sector_payload["briefAnalysis"] = sector_brief_result.get("analysis", "")
                sector_payload["briefOutlook"] = sector_brief_result.get("outlook", "")
                print(f"  Generated sector brief for {sector_id}")

            store.db.collection("sectors").document(sector_id).set(sector_payload, merge=True)

        latest_run = {
            "status": "completed",
            "market": market,
            "runType": "market_close",
            "startedAt": datetime.now(timezone.utc).isoformat(),
            "completedAt": datetime.now(timezone.utc).isoformat(),
            "stocksUpdated": len(stock_payloads),
            "sectorsUpdated": len(_build_sector_docs(market, sectors_meta, stock_payloads)),
            "marketsUpdated": 1,
            "errors": [],
        }
        store.db.collection("meta_run_status").document(f"{market}__market_close").set(latest_run)
        store.db.collection("meta").document("lastRun").set({
            market: {
                "market_close": latest_run,
                "latest": latest_run,
            },
            "updatedAtServer": datetime.now(timezone.utc).isoformat(),
        }, merge=True)

    print("Bootstrapped Tikrr dynamic docs for US and IN.")


if __name__ == "__main__":
    main()
