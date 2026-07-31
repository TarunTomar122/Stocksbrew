# Firebase + Frontend Read Audit

Current as of 2026-05-31. Firestore project: `trace-money-72276`. Compute project: `tikrr-496409`.

> Historical point-in-time read audit. Production compute moved to the
> Stocksbrew VPS after this snapshot. The three GitHub market workflows and
> matching Cloud Scheduler ownership described below are retired; current
> schedules, cohorts, barriers, and live counts are in
> `docs/production-data-pipeline-2026-07.md`. Do not re-enable an old scheduler
> from this audit while the VPS timers are active.

## High-level structure

| Layer | Firestore source | Frontend consumers | Freshness owner |
| --- | --- | --- | --- |
| Search catalog | `tm_search_index/US` | search modal, `/earnings`, chat symbol lookup, image extraction | `materialize_search_index` in post-close pipeline |
| Home snapshot | `tm_home_view_core/US`, `tm_home_news/US`, full artifact `tm_home_view/US` | `/`, search fallback | `daily_postclose` materialization |
| Market dashboard | `tm_views_dashboard/US__us_core_100` | `/` via home view fallback/dashboard | post-close dashboard materialization |
| Latest quotes | `tm_latest_prices/{instrument_id}` | stock pages, Radar quote overlay, events quote overlay, macro strip | price jobs: open, intraday, post-close |
| Market snapshot | `market_price_snapshots/US/shards/*` | home fallback, sitemap, sector pages | price jobs |
| Radar materialized view | `tm_watchlist_views/{uid}` | `/watchlist`, chat watchlist context | user watchlist builder / on-demand rebuild |
| User profile | `users/{uid}` | layout header, subscription gates, tracking state, holdings | auth/subscription/watchlist APIs |
| Stock detail | `tm_instruments`, `tm_latest_prices`, `tm_stock_intel_pro`, `tm_news_runs`, `tm_stock_facts`, `tm_views_instrument`, `tm_stock_technicals_latest`, targeted anomaly/Reddit ticker docs | `/stock/[symbol]`, should-I-buy detail | mixed: price jobs, weekly fundamentals, intelligence jobs |
| Public feeds | `tm_daily_anomalies`, `tm_daily_anomaly_tickers`, `reddit_snapshots`, `reddit_ticker_contexts`, `tm_heat_list_view`, `tm_heat_list`, `tm_divergence`, `tm_thematic_screens`, `tm_market_events` | `/anomalies`, `/stock/[symbol]`, `/heat`, `/screens`, `/events`, homepage strips | market close jobs / selected open jobs |
| Earnings | `tm_earnings_events`, `tm_earnings_intel`, `tm_pre_earnings_intel` | `/events`, `/upcoming-events`, stock earnings tabs | earnings intelligence jobs |
| Data health | `tm_data_health/{market}` | ops/debug dashboards, future lightweight status badge | `audit_data_health` |

## Live data sample

| Document | Approx size | Contents | Latest timestamp observed |
| --- | ---: | --- | --- |
| `tm_search_index/US` | 112 KB | 531 entries | `updated_at=2026-05-31T02:02:21Z` |
| `tm_home_view/US` | 314 KB | full home artifact: 189 snapshot rows, 30 news items, dashboard embed | `updated_at=2026-05-31T14:04:28Z` |
| `tm_home_view_core/US` | 29 KB | trimmed dashboard and 83 bounded snapshot rows; core homepage/search read model | `updated_at=2026-05-31T14:04:28Z` |
| `tm_home_news/US` | 52 KB | 8 homepage news items out of 30 retained in full artifact | `updated_at=2026-05-31T14:04:28Z` |
| `tm_views_dashboard/US__us_core_100` | 60 KB | dashboard plus 100 watchlist rows | `generated_at=2026-05-31T02:02:30Z` |
| `tm_heat_list/US` | 427 KB | 511 heat rows; full analytical artifact | `generated_at=2026-05-29T20:24:04Z` |
| `tm_heat_list_view/US` | 46 KB | 51 heat rows plus setup counts; `/heat` read model | `generated_at=2026-05-29T20:24:04Z` |
| `tm_daily_anomalies/US__latest` | 58 KB | 24 anomalies | `generated_at=2026-05-29T20:23:40Z` |
| `tm_daily_anomaly_tickers/US__{ticker}` | 1.9-2.8 KB observed | one ticker anomaly context for stock detail pages | backfilled from `tm_daily_anomalies/US__latest` |
| `reddit_snapshots/US__latest` | 19 KB | 12 posts, 13 tickers | `generated_at=2026-05-29T20:29:02Z` |
| `reddit_ticker_contexts/US__{ticker}` | 1.1-1.2 KB observed | one ticker Reddit context for stock detail pages | backfilled from `reddit_snapshots/US__latest` |
| `tm_market_events/US__latest` | 14 KB | 12 earnings events | `generated_at=2026-05-29T21:04:12Z` |
| `tm_latest_prices` latest US sample | 1.7 KB | quote/fundamentals snapshot | `updated_at=2026-05-31T02:02:20Z` |
| `tm_stock_facts` latest US sample | 1.6 KB | fundamentals/facts | `captured_at=2026-05-10T06:25:53Z` |
| `tm_watchlist_views/{uid}` latest sample | 67 KB | 13 Radar rows | `built_at=2026-05-31T03:13:28Z` |

Collection counts observed: `tm_instruments=546`, `tm_latest_prices=716`, `tm_stock_facts=666`, `tm_stock_technicals_latest=710`, `users=51`, `tm_watchlist_views=15`.

## Page read matrix

| Surface | Server reads today | Current risk | Action taken |
| --- | --- | --- | --- |
| Root layout | session cookie/auth plus `users/{uid}` when signed in | Every signed-in page gates header/subscription from user doc. `getUserDoc` is React-cached per render. | No change needed now. |
| `/` | `tm_home_view_core/US`, `tm_home_news/US`, `tm_market_movers/US`, optional `market_price_snapshots` fallback, user doc | Full `tm_home_view` is 314 KB mostly from 30 news embeds. | Split core and news read models; full artifact stays for debugging/backward compatibility. |
| `/watchlist` | `users/{uid}`, `tm_watchlist_views/{uid}`, `tm_latest_prices/{tracked}` overlay, targeted `tm_instruments/{id}` fallback only for rows missing from the materialized view, earnings/pre-earnings docs for tracked rows | If only `tm_watchlist_views` is read, prices lag. The add/edit modal needs client-side search, but that catalog does not need to block initial render. | Added `tm_latest_prices` quote overlay, chunked reads, and lazy modal search-index loading. |
| `/stock/[symbol]` | `tm_instruments/{id}`, `tm_latest_prices/{id}`, user doc, technicals, intel, facts, market movers, overrides, `tm_daily_anomaly_tickers/{market}__{ticker}`, `reddit_ticker_contexts/{market}__{ticker}`, on-demand job, earnings docs | Lots of parallel one-doc reads. Wrong market cookie can add a failed first lookup. | Replaced full anomaly/Reddit feed reads with per-ticker read models; existing code already avoids a second fundamentals read. |
| `/heat` | `users/{uid}`, `tm_heat_list_view/US`, `tm_divergence/US` | Full `tm_heat_list/US` is 427 KB; UI needs only top rows and counts. | Added compact `tm_heat_list_view/US`; `/heat` reads that first and falls back to compacting the full doc only if missing. |
| `/anomalies` | `tm_daily_anomalies/US__latest`, `reddit_snapshots/US__latest`, user doc | Reasonable read count; data can be stale if close jobs have not run. | No code change. |
| `/screens` | `tm_thematic_screens/US` | Small enough; cached 120s. | No code change. |
| `/events` | user doc, `tm_market_events/US__latest`, upcoming pre-earnings query | Previously loaded full search index just to filter upcoming. | Removed search-index read. |
| `/upcoming-events` | user doc, upcoming pre-earnings query, `tm_instruments/{ids}`, `tm_latest_prices/{ids}` | Previously loaded full search index for names and filter. | Removed search-index read; names come from `tm_instruments`. |
| `/earnings` | `tm_search_index/US`, then client fetches `/api/earnings` | Search index is used only for the "covered" calendar toggle. | Keep for now; search index is now cached. |
| `/should-i-buy` and `/portfolio` | `tm_search_index/US`, user doc when needed | Broad payload supports typeahead. | Search index is now cached. |
| `/api/chat` | user doc, watchlist view, targeted `tm_instruments` reads/queries, optional stock intel docs | Chat should not load broad search catalogs just to resolve a ticker or fallback missing watchlist labels. | Added `tm_instruments` resolver and removed broad search-index reads from chat. |

## Stale-data risks

| Data | Risk | What should be faster/fresher |
| --- | --- | --- |
| `tm_latest_prices` | Latest US sample is aging on 2026-05-31 because the audit ran on a Sunday. During market hours these must be the fastest lane. | Keep open/intraday/post-close price jobs broad enough for price-core plus overrides. Do not remove extended coverage. |
| `tm_watchlist_views` | Latest sample is fresh, but heavy Radar analysis should still be daily/on-demand. Quote fields must not depend on this doc. | Current fix overlays quotes from `tm_latest_prices`; rebuild watchlist only for intelligence/holdings/version changes. |
| `tm_stock_facts` | Latest US facts captured 2026-05-10 and were truly stale at audit time. | Superseded: `tikrr-stock-facts.timer` owns the Sunday 08:00 UTC refresh on the VPS. The former GitHub workflow was deleted. Keep surfacing `captured_at` when facts are old. |
| `tm_heat_list`, `tm_daily_anomalies`, `reddit_snapshots`, `tm_divergence`, `tm_thematic_screens` | Latest samples were generated Friday 2026-05-29 and the related Cloud Run jobs succeeded. Weekend gaps should show aging, not stale. | Health/UI freshness for anomaly and Reddit feeds now uses market-feed thresholds: aging after 36h, stale after 84h. Close jobs should remain reliable. |
| `tm_market_events` | Earnings-only feed generated 2026-05-29. | Open job can skip if fresh; close job should always refresh after earnings cycle. |
| `tm_search_index` | 112 KB catalog with embedded stale price fields. | Treat as symbol/name catalog only. Use `tm_latest_prices` for quotes. |

## Changes made in this audit

- Cached `getSearchIndex()` with `unstable_cache` for 5 minutes and React request cache.
- Removed full search-index reads from `/events` and `/upcoming-events`.
- Compacted `/heat` client payload to top rows per setup plus full setup counts.
- Kept Radar quote freshness by overlaying `tm_latest_prices` on top of `tm_watchlist_views`.
- Chunked watchlist latest-price reads in batches of 100.
- Removed `tm_search_index/US` from initial `/watchlist` render; `RadarBatchEditModal` now fetches `/api/search-index` only when opened.
- Replaced `/api/chat` broad `tm_search_index` loads with targeted `tm_instruments` resolver reads/queries.
- Added shared freshness classification for stock fundamentals, anomalies, Reddit, heat, and earnings feeds so stale docs are visible in the UI.
- Added weekend-aware market-feed freshness for anomaly and Reddit feeds. On Sunday 2026-05-31, `daily_anomalies` and `reddit_snapshot` are aging Friday-close outputs, not stale.
- Added `backend.scripts.audit_data_health`, which writes one `tm_data_health/{market}` snapshot with age/status/count/size for frontend source docs. Deployed `data_health` Cloud Run lane now refreshes this after open and close derived feeds. Live `tm_data_health/US` now reports `stock_facts` as the only stale item.
- Added the original `stock_facts` Cloud Run/Scheduler lane. This ownership was
  later moved to `tikrr-stock-facts.timer` on the VPS.
- Added `tm_heat_list_view/{market}` compact read model. Live `/heat` payload drops from ~427 KB / 511 rows to ~46 KB / 51 rows while keeping setup counts.
- Added `tm_home_view_core/{market}` and `tm_home_news/{market}` read models. Core homepage reads drop from ~314 KB to ~29 KB by trimming unused dashboard fields and bounding snapshot rows; news rail reads ~52 KB for the 8 rendered articles instead of pulling all 30 in the core doc.
- Added per-ticker stock-detail read models for anomaly and Reddit context. Listed stock pages now read `tm_daily_anomaly_tickers/{market}__{ticker}` and `reddit_ticker_contexts/{market}__{ticker}` instead of pulling `tm_daily_anomalies/{market}__latest` (~58 KB) and `reddit_snapshots/{market}__latest` (~19 KB) just to filter one ticker.
- Stock pages reconcile the compact anomaly row with their canonical
  `tm_latest_prices` quote before rendering. Rows from another market session
  disappear, and a same-session direction reversal clears the old narrative,
  so the move badge and explanation can never come from different price states.

## Next optimization queue

Resolved after this audit: the deleted `weekly-stock-facts.yml` workflow is no
longer an operational dependency. Verify `tikrr-stock-facts.timer` and
`tm_data_health/US` instead.
