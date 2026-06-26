# Backend Pipeline

Primary entrypoint:

```bash
python3 -m backend.scripts.run_pipeline --markets US --session-phase auto
```

## Active universe keys (required)

`tm_config/active_universes` must include:

- `US_universe` (current US runtime namespace; today this is `us_core_100`)
- `IN_price_universe`, `IN_ai_universe` (legacy IN split, unchanged)

No legacy fallback to `US` / `IN`.

See `docs/stock-universes.md` before changing universe IDs. The product tiers
are `search_catalog`, `coverage_catalog`, `runtime_core`, and
`tracked_universe`; legacy IDs like `us_core_100` and `us_core_155` are storage
names, not product concepts.

## Stock counts by pipeline stage

| Stage | Script | US | IN | Frequency | Firestore collection |
|-------|--------|----|----|-----------|----------------------|
| **Prices** | `sync_price_snapshots` | active runtime universe + priority/override lanes | ~166 (`in_core_150`) | Market windows; limit caps ranked runtime core, then priority overrides are appended | `tm_latest_prices`, `market_price_snapshots` |
| **Fundamentals** | `sync_stock_metrics` (Finviz scrape) | coverage catalog / selected refresh set | ~166 | Every 5 days | `tm_stock_metrics` |
| **AI briefs + news** | tracked Cloud Run lanes + `build_per_stock_intelligence` | runtime core + UNION(subscribed tracked) | AI universe + tracked | Daily/pre-open/on-demand | `tm_news_runs`, `tm_stock_intelligence` |
| **Earnings intel** | `build_earnings_intel` | same as AI | same | Daily | `tm_earnings_intel` |
| **Pre-earnings intel** | `build_pre_earnings_intel` | full supported US market catalog + calendar (7d ahead); **one report per event** (skips if doc exists); `TAVILY_API_KEY` via deploy secret (≤2 searches/new build) | US only | Daily | `tm_pre_earnings_intel` |
| **User radar views** | `build_watchlist_views` | per-user tracked only | per-user tracked only | Pre-market + on-demand | `tm_watchlist_views` |
| **On-demand news** | `process_on_demand_news_jobs` | any newly tracked stock | any | Queued by tracking flows; currently processed by scheduled polling | `tm_on_demand_news_jobs` |

**Tracked stocks in radar right now:** ~30–40 unique instruments across all subscribed users (union of `users/{uid}.tracked_stocks` where `is_subscribed=true`). Grows as user base grows.

## Universe hierarchy

```
search_catalog      broad searchable/requestable catalog
coverage_catalog    500-ish slower baseline data tier; historical ID us_core_155
runtime_core        100-ish frequent product tier; historical ID us_core_100
tracked_universe    dynamic UNION(users.tracked_stocks)
```

The 100/155/500 naming is historical. The Firestore key `US_universe` currently
points to the active US runtime namespace, not necessarily the whole coverage
catalog.

## AI enrichment scope detail

`build_per_stock_intelligence.py` pulls:
1. All stocks in the base AI universe selected by `tm_config/active_universes`
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
| `daily-postclose` | tikrr-daily-postclose | 3Gi | 2 | 5400s |
| `on-demand-news` | tikrr-on-demand-news | 2Gi | 1 | 1800s |
| `stock-requests` | tikrr-stock-requests | 2Gi | 1 | 3600s |
| `earnings-intel` | tikrr-earnings-intel | 3Gi | 2 | 3600s |
| `data-health` | tikrr-data-health | 512Mi | 1 | 300s |
