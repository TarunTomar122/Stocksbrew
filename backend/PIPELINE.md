# Backend Pipeline

> Current production sequencing, cohort sizes, live benchmarks, and failure
> barriers are documented in `docs/production-data-pipeline-2026-07.md`.
> Some Cloud Run details below remain for compatibility and historical
> reference; production market jobs now run through VPS systemd units.

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
| **Prices** | `sync_price_snapshots` | 573 selected coverage + valid overrides (569 resolved in latest live run) | ~166 (`in_core_150`) | 9 US market-session publications/day; limit caps ranked runtime core, then priority overrides are appended | `tm_latest_prices`, `market_price_snapshots` |
| **Fundamentals** | `sync_stock_metrics` (Finviz scrape) | coverage catalog / selected refresh set | ~166 | Every 5 days | `tm_stock_metrics` |
| **AI briefs + news** | tracked VPS lanes + `build_per_stock_intelligence` | 60-stock runtime core + UNION(current Pro tracked) | AI universe + tracked | Twice per US trading day; model calls only for changed source/material tape fingerprints | `tm_news_runs`, `tm_stock_intelligence` |
| **Earnings intel** | `build_earnings_intel` | same as AI | same | Daily | `tm_earnings_intel` |
| **Pre-earnings intel** | `build_pre_earnings_intel` | full supported US market catalog + calendar (7d ahead); **one report per event** (skips if doc exists); `TAVILY_API_KEY` via deploy secret (≤2 searches/new build) | US only | Daily | `tm_pre_earnings_intel` |
| **User radar views** | `build_watchlist_views` | per-user tracked only | per-user tracked only | Weekdays after the open briefs (~10:00–10:20 ET) and after the close; the web rebuilds a person's view after every edit to their stocks (`lib/watchlist-view-rebuild.ts`); the job never overwrites a newer view (`save_watchlist_view_if_current`) | `tm_watchlist_views` |
| **Extended-hours quotes** | `backend.agentdata.extended_hours` (schedule group `extended_hours`, timer `tikrr-agentdata-extended-hours`) | today's reporters, then tracked, then covered (~850, Yahoo batch quote 50 a request) | weekdays every 15 min 16:05–19:50 ET, 20:05, and 07:35 / 08:35 / 09:20 ET; skips NYSE holidays | `tm_extended_quotes` (one per stock; shown only until the next open, never as the close or the day's change) |
| **On-demand news** | `process_on_demand_news_jobs` | any newly tracked stock | any | Queued by tracking flows; currently processed by scheduled polling | `tm_on_demand_news_jobs` |

Radar extras are the unique union of tracked stocks for users with a current
Pro entitlement, including intentionally gifted premium. Terminal billing
statuses do not expand Pro compute.

## Universe hierarchy

```
search_catalog      broad searchable/requestable catalog
coverage_catalog    500-ish slower baseline data tier; historical ID us_core_155
runtime_core        60 popular stocks; historical ID us_core_100
tracked_universe    dynamic UNION(current Pro users.tracked_stocks)
```

The 100/155/500 naming is historical. The Firestore key `US_universe` currently
points to the active US runtime namespace, not necessarily the whole coverage
catalog.

## AI enrichment scope detail

`build_per_stock_intelligence.py` pulls:
1. All stocks in the base AI universe selected by `tm_config/active_universes`
2. Plus every stock in a current Pro user's `tracked_stocks` array — `_subscribed_tracked_ids()` function

Only subscribed users' tracked stocks get AI briefs. Free-tier users get briefs only for stocks that happen to be in the base universe anyway.

Article budget per stock: **5 articles, 72h lookback**. Chunked 10 stocks at a time, 4 parallel workers.

## News pipeline

Sources are RSS-based: Google News, Seeking Alpha, Nasdaq, curated feeds via `source_registry.py`.

Each article starts with `sentiment_score=0.0, sentiment_label="unscored"`. `llm_enrichment.py` then runs a separate LLM call per article to compute:
- `overall_sentiment_score` (-1 to 1)
- Per-ticker `sentiment_score` + `relevance`
- `what_happened`, `why_it_matters`, `bullish_points`, `bearish_points`
- `key_points`, `primary_event_type`

Article enrichment is cache-first by stable source URL. It calls the model only
for new/changed articles in the runtime-plus-paid-tracked AI cohort, not for the full price
cohort and not again on a warm source pass.

**Alpha Vantage** is currently used only for: symbol master (`build_symbol_master.py`), IPO sync (`sync_ipos.py`), earnings calendar (`sync_earnings_calendar.py`). It is NOT used for news. The `NEWS_SENTIMENT` endpoint (25 calls/day, up to ~25 tickers per call) could replace the LLM enrichment step for sentiment scoring and provide net-new articles from sources not in our RSS feeds (MarketBeat, Morningstar, Investing.com).

## Pipeline shape

- Open: 09:30 price → changed briefs; 09:50 settled price → top-30 anomaly research → email
- Intraday: hourly batched price publication from 10:00 through 15:00 ET
- Close: 16:10 batched price/read models → changed briefs → top-30 anomaly research
- Weekly: broad fundamentals/facts/Finviz refresh
- View chain: `materialize_views` (price universe) → `build_snapshot` + `build_watchlist_views`

Quote batches persist provider-supplied `recent_sessions`. Brief/anomaly jobs
must not treat the rolling Stocksbrew fetch history as consecutive sessions.
Scheduled open/mid/close writers reject provider rows whose Yahoo date label
does not match the exchange-local session date. Open and close stages require
98% batch coverage; downstream publishers recheck phase, capture date, and
write age before using a mutable `tm_latest_prices` document.
History consumers overlay the top-level live quote by provider date. This keeps
charts and derived technicals current without letting Firestore write time
relabel old market data or rewriting the full rolling array every hour.

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
