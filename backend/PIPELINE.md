# Backend Pipeline

Primary entrypoint:

```bash
python3 -m backend.scripts.run_pipeline --markets US --session-phase auto
```

## Active universe keys (required)

`tm_config/active_universes` must include:

- `US_universe` (single canonical US universe)
- `IN_price_universe`, `IN_ai_universe` (legacy IN split, unchanged)

No legacy fallback to `US` / `IN`.

## Stock counts by pipeline stage

| Stage | Script | US | IN | Frequency | Firestore collection |
|-------|--------|----|----|-----------|----------------------|
| **Prices** | `sync_price_snapshots` | ~500 (`us_core_155`) | ~166 (`in_core_150`) | Market windows (open + intraday cap 80) | `tm_price` |
| **Fundamentals** | `sync_stock_metrics` (Finviz scrape) | ~500 | ~166 | Every 5 days | `tm_stock_metrics` |
| **AI briefs + news** | `build_per_stock_intelligence` | 100–500 base + UNION(subscribed tracked) | 150 base + tracked | Daily pre-market | `tm_stock_intelligence`, `tm_articles` |
| **Earnings intel** | `build_earnings_intel` | same as AI | same | Daily | `tm_stock_intelligence` |
| **User radar views** | `build_watchlist_views` | per-user tracked only | per-user tracked only | Pre-market + on-demand | `tm_watchlist_views` |
| **On-demand news** | `process_on_demand_news_jobs` | any newly tracked stock | any | Triggered by `/api/track` | `tm_on_demand_news_jobs` |

**Tracked stocks in radar right now:** ~30–40 unique instruments across all subscribed users (union of `users/{uid}.tracked_stocks` where `is_subscribed=true`). Grows as user base grows.

## Universe hierarchy

```
us_core_100   (100 hand-curated stocks)
     ↓ expand_universe.py
us_core_155   (500 stocks — the active price + fundamentals universe)
     +
UNION(subscribed users' tracked_stocks)
     =
AI enrichment scope
```

The 100/155/500 naming is historical. The Firestore key `US_universe` now points to whichever universe is active.

## AI enrichment scope detail

`build_per_stock_intelligence.py` pulls:
1. All stocks in the base AI universe (100–500 depending on `tm_config/active_universes`)
2. Plus every stock in any paid subscriber's `tracked_stocks` array — `_subscribed_tracked_ids()` function

Only subscribed users' tracked stocks get AI briefs. Free-tier users get briefs only for stocks that happen to be in the base universe anyway.

Article budget per stock: **5 articles, 72h lookback**. Chunked 10 stocks at a time, 4 parallel workers.

## News pipeline

Sources are RSS-based: Google News, Seeking Alpha, Nasdaq, curated feeds via `source_registry.py`.

Each article starts with `sentiment_score=0.0, sentiment_label="unscored"`. `llm_enrichment.py` then runs a separate LLM call per article to compute:
- `overall_sentiment_score` (-1 to 1)
- Per-ticker `sentiment_score` + `relevance`
- `what_happened`, `why_it_matters`, `bullish_points`, `bearish_points`
- `key_points`, `primary_event_type`

This is the most expensive step in the pipeline — one LLM call per article across every stock in scope.

**Alpha Vantage** is currently used only for: symbol master (`build_symbol_master.py`), IPO sync (`sync_ipos.py`), earnings calendar (`sync_earnings_calendar.py`). It is NOT used for news. The `NEWS_SENTIMENT` endpoint (25 calls/day, up to ~25 tickers per call) could replace the LLM enrichment step for sentiment scoring and provide net-new articles from sources not in our RSS feeds (MarketBeat, Morningstar, Investing.com).

## Pipeline shape

- Price/scoring chain: `sync_price_snapshots` → `sync_stock_metrics` → `build_stock_intel_pro` → `build_stock_technicals` → `build_market_breadth`
- AI chain: `build_per_stock_intelligence` → `build_heat_list` / `build_divergence` / `build_sentiment_flip`
- View chain: `materialize_views` (price universe) → `build_snapshot` + `build_watchlist_views`

## Cloud Run jobs

Defined in `cloudrun/scripts/deploy-jobs.sh`. Deploy a single job with:

```bash
SKIP_BUILD=1 bash backend/cloudrun/scripts/deploy-jobs.sh daily-postclose
```

| Short name | Job | Memory | CPU | Timeout |
|------------|-----|--------|-----|---------|
| `dispatch` | tikrr-dispatch | 1Gi | 1 | 1200s |
| `tracked-news-prep` | tikrr-tracked-news-prep | 2Gi | 2 | 2400s |
| `price-core-open` | tikrr-price-core-open | 2Gi | 2 | 1800s |
| `tracked-open-briefs` | tikrr-tracked-open-briefs | 3Gi | 2 | 2400s |
| `price-core-intraday` | tikrr-price-core-intraday | 2Gi | 2 | 1800s |
| `open-anomalies` | tikrr-open-anomalies | 2Gi | 2 | 2400s |
| `reddit-buzz` | tikrr-reddit-buzz | 1Gi | 1 | 1200s |
| `market-open-email` | tikrr-market-open-email | 2Gi | 1 | 3600s |
| `daily-postclose` | tikrr-daily-postclose | 3Gi | 2 | 5400s |
| `on-demand-news` | tikrr-on-demand-news | 2Gi | 1 | 1800s |
| `stock-requests` | tikrr-stock-requests | 2Gi | 1 | 3600s |
| `earnings-intel` | tikrr-earnings-intel | 3Gi | 2 | 3600s |
