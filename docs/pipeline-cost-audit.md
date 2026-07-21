# Pipeline Cost Audit

Verified on 2026-05-31 against Cloud Run/Scheduler project `tikrr-496409` and
Firestore project `trace-money-72276`.

## Non-Negotiables

- Keep extended price coverage. `price_core_open` and `price_core_intraday`
  must use ranked `runtime_core` plus `tm_config/price_core_overrides`.
- Do not rename Firestore universe IDs during cost work. Names like
  `us_core_100` are storage namespaces; product concepts are documented in
  `docs/stock-universes.md`.
- Optimize overlap, retries, polling, and materialization scope before changing
  coverage.

## Live Scheduler Shape

| Scheduler job | Lane | Cadence UTC | Current role |
| --- | --- | --- | --- |
| `tikrr-premarket` | `premarket_pipeline` | `30 8 * * 1-5` | Single VPS pipeline for premarket news, movers, opening report, and subscriber email. |
| `tikrr-preopen-news` | `tracked_news_prep` | `45 12 * * 1-5` | Pre-open tracked news prep. |
| `tikrr-open-price` | `price_core_open` | `30 13 * * 1-5` | Open price refresh for runtime core plus extended overrides. |
| `tikrr-open-briefs` | `tracked_open_briefs` | `35 13 * * 1-5` | Tracked stock open briefs. |
| `tikrr-open-anomalies` | `open_anomalies` | `38 13 * * 1-5` | Open anomaly views. |
| `tikrr-open-email` | `open_email` | `5 14 * * 1-5` | After-open email send, delayed until the fresh anomaly snapshot is published. |
| `tikrr-reddit-buzz` | `reddit_buzz` | `20 13 * * 1-5` | Reddit signal refresh. |
| `tikrr-zone-briefs` | `zone_briefs` | `0 14 * * 1-5` | Zone brief generation. |
| `tikrr-market-events-open` | `market_events` | `10 14 * * 1-5` | Open market events. |
| `tikrr-data-health-open` | `data_health` | staged: `20 14 * * 1-5` | Lightweight frontend source freshness snapshot after open derived feeds. |
| `tikrr-intraday-price` | `price_core_intraday` | `*/30 13-19 * * 1-5` | Intraday price refresh for runtime core plus extended overrides. |
| `tikrr-postclose` | `daily_postclose` | `10 20 * * 1-5` | Heavy post-close data/view rebuild. |
| `tikrr-close-anomalies` | `open_anomalies` | live: `20 20 * * 1-5`; staged: `40 20 * * 1-5` | Close anomaly views. Staged later to avoid overlapping post-close. |
| `tikrr-close-reddit-buzz` | `reddit_buzz` | live: `25 20 * * 1-5`; staged: `45 20 * * 1-5` | Close Reddit signal refresh. Staged later to avoid overlapping post-close. |
| `tikrr-earnings-intel` | `earnings_intel` | live: `50 20 * * 1-5`; staged: `0 21 * * 1-5` | Earnings intelligence after post-close. |
| `tikrr-market-events-close` | `market_events` | live: `0 21 * * 1-5`; staged: `20 21 * * 1-5` | Close market events after earnings intel. |
| `tikrr-data-health-close` | `data_health` | staged: `30 21 * * 1-5` | Lightweight frontend source freshness snapshot after close derived feeds. |
| `tikrr-on-demand-news` | `on_demand_news` | `*/10 * * * 1-5` | Poll queued on-demand news jobs. |

## GitHub Workflows

These are not Cloud Run spend, but they can write the same Firebase data:

| Workflow | Trigger | Runtime role | Notes |
| --- | --- | --- | --- |
| `.github/workflows/price-alert-checker.yml` | Scheduled every 15 minutes across overlapping US-market UTC windows plus manual | Runs `backend.scripts.check_price_alerts` and may send Brevo email alerts | Separate from Cloud Run price refresh; depends on latest Firebase price docs. |
| `.github/workflows/on-demand-news-jobs.yml` | Manual or `repository_dispatch: process_on_demand_news` | Runs `process_on_demand_news_jobs --limit` directly in GitHub Actions | No current repo caller found for `repository_dispatch`; Cloud Run Scheduler is the active polling path. |
| `.github/workflows/weekly-stock-facts.yml` | Scheduled Sunday 08:00 UTC plus manual | Runs `sync_stock_facts` for weekly/broad facts refresh | This is the slower stock-detail facts lane, not an automatic daily Cloud Run cost source. |

## Runtime Evidence

Recent Cloud Run execution audit showed the main cost pressure is frequency and
overlap, not one isolated worker:

| Job | Recent avg runtime | Notes |
| --- | ---: | --- |
| `tikrr-dispatch` | ~236s | High execution count because every scheduled lane goes through dispatcher. |
| `tikrr-price-core-intraday` | ~95s | Runs every 30 minutes during market window. |
| `tikrr-on-demand-news` | ~76s | Runs every 10 minutes on weekdays even when queue may be empty. |
| `tikrr-stock-requests` | ~82s | Immediate triggers can overlap for the same query. |
| `tikrr-daily-postclose` | ~21m | Heavy daily full-chain rebuild. |
| `tikrr-tracked-open-briefs` | ~237s | Targeted tracked-stock AI/open brief lane. |

## Firebase Outputs By Lane

| Lane | Key reads | Key writes | External calls |
| --- | --- | --- |
| `price_core_open` / `price_core_intraday` | active universe config, instrument ranks, `price_core_overrides`, latest instrument metadata | `tm_latest_prices`, `market_price_snapshots`, `tm_views_instrument`, shared home/dashboard views | Yahoo/price quote providers through `sync_price_snapshots` |
| `tracked_news_prep` | users/tracked stocks, instrument metadata, existing news runs | `tm_news_runs`, article/enrichment docs used by tracked briefs | RSS/news sources and OpenAI enrichment |
| `tracked_open_briefs` | tracked stocks, latest prices, enriched news | `tm_news_runs` stock intelligence, instrument views, watchlist views | OpenAI synthesis; price sync for tracked IDs |
| `daily_postclose` | runtime universe, latest prices, fundamentals, news/intel inputs, user watchlists | `tm_latest_prices`, `market_price_snapshots`, `tm_stock_metrics`, `tm_stock_intel_pro`, technicals, breadth, thematic screens, search index, snapshots, watchlist views, override thick-refresh docs | Yahoo/price providers, Finviz/fundamental scrape, optional providers used by child scripts |
| `open_anomalies` | latest prices, active universe, intelligence docs, stock scorecards | `tm_daily_anomalies`, `tm_daily_anomaly_tickers`, heat list, divergence, sentiment-flip views, watermarks | OpenAI only when `build_daily_anomalies --enrich-missing` fills missing briefs |
| `reddit_buzz` | Reddit RSS posts, supported ticker universe | `reddit_snapshots`, `reddit_ticker_contexts`, stage watermarks, `price_core_overrides` promotions/backfills | Reddit RSS and OpenAI ticker extraction |
| `zone_briefs` | `tm_daily_anomalies`, `reddit_snapshots`, active AI universe intelligence docs | refreshed zone stock intelligence when stale | OpenAI/news enrichment only for stale anomaly/reddit zone stocks |
| `market_events` | `tm_earnings_intel/*__latest`, latest prices | `tm_market_events/{MARKET}__latest`, watermarks | No network call in builder; reads existing earnings intel and price docs |
| `data_health` | frontend source docs and collection counts | `tm_data_health/{MARKET}` | No network calls beyond Firestore |
| `stock_facts` | active price universe instrument list | `tm_stock_facts` | Free-source fundamentals/facts scraping; scheduled weekly outside market hours |
| `earnings_intel` | earnings calendar/recent earnings inputs | `tm_earnings_intel` docs | OpenAI/Tavily or configured earnings-intel providers |
| `market_open_email` | users, watchlist views, latest materialized rows | lifecycle/email log state; may refresh watchlist views before send | Brevo email API |
| `on_demand_news` | `tm_on_demand_news_jobs`, instrument/news context | on-demand stock intelligence and job status | RSS/news sources and OpenAI enrichment |
| `stock_requests` | `stock_requests`, symbol master/instruments | request status, instrument add/confirmation outputs, user notification email state | OpenAI resolver, market data/symbol sources, Brevo email |

## Live Retry Settings

`backend/cloudrun/scripts/audit-cloudrun-cost.sh` confirmed Scheduler
`retryCount = 0` for every live Scheduler job on 2026-05-31. The newer
`zone_briefs` and `market_events` jobs still show a longer `maxBackoffDuration`,
but with retry count zero this is not currently a cost multiplier.

Cloud Run Jobs themselves still had `maxRetries = 1` live. The deploy script now
defaults new job deploys to `CLOUD_RUN_JOB_MAX_RETRIES=0` so failed workers are
handled through explicit Firestore state and reruns, not automatic replay of a
partially completed task.

## First Safe Optimization

The correct first target is overlap removal while preserving coverage:

- Keep intraday extended price coverage intact: ranked runtime core plus
  `price_core_overrides`.
- Stop price-core lanes from rebuilding every user's materialized watchlist and
  scanning directive-change emails. `tracked_open_briefs`, `market_open_email`,
  post-close, and on-demand/user flows own user watchlist refreshes; price-core
  lanes own price docs plus shared home/dashboard views. A manual
  `--refresh-watchlists` override remains available.
- Add atomic claims to `stock_requests` and `tm_on_demand_news_jobs` so
  overlapping Cloud Run executions cannot process the same queued item twice.
- Move on-demand news from 10-minute polling to immediate dispatch from
  track/watchlist APIs, with Scheduler kept as an hourly backup after deploy.
- Gate `market_events` open rebuilds with `--skip-if-fresh-hours 20`.
  `market_events` is earnings-only today; close still rebuilds after
  `earnings_intel`, while the next open no-ops if that close-built feed is still
  fresh.
- Stage close-only derivative lanes later so `close_anomalies`, close
  `reddit_buzz`, `earnings_intel`, and close `market_events` do not overlap the
  long `daily_postclose` chain. Live post-close runtime was about 21 minutes in
  the audit sample, while the old close anomaly schedule started only 10
  minutes after post-close.

Live state note: as of this audit, `tikrr-on-demand-news` is still enabled at
`*/10 * * * 1-5` in Cloud Scheduler. Do not change it to hourly until the
frontend/server deployment containing immediate dispatch is live.

The live Scheduler body for `tikrr-on-demand-news` also had duplicate
`--limit` and `--per-stock-cap` args from the common scheduler body plus
lane-specific overrides. `setup-scheduler.sh` now emits a minimal unambiguous
body for this lane before the live cutover is applied.

## Next Cost Targets

1. Deploy immediate `on_demand_news` dispatch from the watchlist/track APIs,
   then update Scheduler to the hourly backup cadence in
   `backend/cloudrun/scripts/setup-scheduler.sh`.
2. Deploy the `market_events` open freshness gate, then verify the next open run
   reports `skipped_fresh` when the close-built earnings feed is still fresh.
3. Apply staged close-lane schedule offsets after deploy and verify close
   anomaly/reddit/earnings/events runs start after `daily_postclose` completes.
4. Split post-close into strict daily writes versus slower weekly fundamentals,
   but only after confirming which frontend surfaces depend on same-day metrics.
4. Add run summaries with selected instrument count, queue count, Firestore
   writes, and no-op reason so future cost audits do not require log archaeology.

## Open Questions

- Should on-demand news be user-visible within a few minutes after tracking a
  stock? If yes, immediate dispatch is required before reducing the scheduler.
- Are directive-change emails intended to fire intraday from price movement
  alone, or only after open/tracked/post-close intelligence rebuilds?
- Which post-close outputs are acceptable to refresh weekly instead of daily:
  fundamentals, technicals, breadth, thematic screens, or none?
