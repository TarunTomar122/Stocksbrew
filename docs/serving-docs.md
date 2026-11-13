# serving docs: one small doc per stock page

Nov 13, 2026. The owner: "we shouldn't have to load the 4gb in ideal cases." A cold `/stock/AMD` render made 26 LocalDB calls and moved ~930 KB, most of it bodies the page throws away (a 123 KB price doc for a 7 KB window, 366 KB of headlines for 14 rows, a 58 KB price history read twice, 84 KB of call history for three changes). The hot/cold split: jobs publish compact **serving docs**, and the page reads one small doc plus the live quote, falling back part by part to today's reads. Off unless `SERVE_DOCS=1`.

## what a stock page view reads today (cold, signed out, AMD)

Measured through a counting proxy in front of the store (bytes are response bodies). "Cached" is the loader's own `unstable_cache`, per Next instance; a stock nobody opened in that window is cold, which is what crawlers and the long tail hit.

| read | collection | bytes | cached | first screen? |
|---|---|---|---|---|
| instrument | `tm_instruments/US_AMD` | 0.8 KB | per request | yes |
| live quote | `tm_latest_prices/US_AMD` (masked) | 1 KB | none | yes |
| stored page view (brief, facts, scorecard, earnings read...) | `tm_stock_page_views/US__US_AMD` | 46 KB | 60 s | yes |
| chart: multi-year closes | `tm_price_history_daily/AMD` | 58 KB | 1 h | yes |
| call evidence, 52-week range | `tm_price_history_daily/AMD` again (+ SPY, shared) | 58 KB | 3 h | yes |
| P/E history, chart fallback | `tm_latest_prices/US_AMD` `history_window` | 123 KB | 5 min | yes |
| how the call moved | `tm_directive_history/US_AMD/calls` (400) | 84 KB | 15 min | yes |
| on-demand job, steady call | `tm_on_demand_news_jobs`, `tm_call_stability` (+ any stale page-view section) | 9 KB | none | yes |
| today's move | `tm_daily_anomaly_tickers/US__AMD` | 3.6 KB | 2 min | yes |
| results releases | `tm_earnings_history/AMD` | 5.9 KB | 6 h | yes |
| earnings dates, next report | `tm_earnings_events` (query, twice) | 2.3 KB | 6 h / 5 min | yes |
| Congress trades | `tm_power_trades` (query) | 0.6 KB | 15 min | yes |
| headlines | `tm_news_runs/US__*/enrichments` + `tm_agent_news` (queries) | 402 KB | 2 min | no (streams) |
| headline tone | `tm_agent_news_tone` (14 ids) | 7 KB | 2 min | no |
| Reddit | `reddit_ticker_contexts/US__AMD` | 3.1 KB | 5 min | no |
| insiders, fund holders | `tm_insider_trades` (query), `tm_fund_holders` | 13 KB | 10 min | no |
| peers ranking | `tm_stock_intel_pro/*/stocks` sector query | 95 KB | 15 min per sector | no |
| peers' quotes | `tm_latest_prices` × 24 (masked) | 6 KB | none | no |
| risk factor changes | `tm_filing_changes/AMD` | 4 KB | 30 min | no |
| results night card (around a report) | 4 docs + earnings events + reactions + filings | ~9 KB | 2 min | yes |

Market-wide reads (premarket movers, screener snapshot, follow slugs, coverage) are shared by every stock and stay warm, so they are not in a stock's cost.

## design

### collections

- `tm_serve_stock/{ID}`: one per covered US stock, where ID is the instrument id without `US_` (BRK.B is `US_BRK_B`, so `BRK_B`), the same rule on the TS and Python sides. An Indian stock reads the old way.
- `tm_serve_stock/_all`: only dirty stamps (below) that apply to every stock.

### layout

```
{
  schema: 1, ticker: "AMD", market: "US", instrument_id: "US_AMD",
  p_<part>: { v, built_at, as_of, src?, data },   // one top-level field per part
  dirty_<part>: iso,                              // stamped by writers (dirty parts only)
}
```

Each part is a top-level field, so a merge write replaces exactly one part and nothing else (LocalDB merges by top-level field path, `backend/localdb/store.py _apply_fields`). `built_at` is taken before the builder reads anything. `as_of` is when the data itself is from (the last close, the newest headline...), for the page and for debugging.

### parts

| part | holds | replaces | how it proves it is current | built by | size (AMD / AAPL / ASTS) |
|---|---|---|---|---|---|
| `series` | the raw `tm_price_history_daily` fields, dates and closes compacted losslessly (start day + day gaps as digits, closes as integer steps at 1/100 or 1/10000) | both 58 KB reads | source doc hash | builder | 14.4 / 20.3 / 11.2 KB |
| `snapshot` | `history_window` as `[captured_at, close, P/E]` rows; today's quote goes on the end at render from the live quote the page already reads | 123 KB read | `dirty_snapshot` | the price writer itself (`backend/storage.py`, same run, when the window changes) and the builder | 7.6 / 7.7 / 6.2 KB |
| `calls` | only the call records `callChanges` keeps (the first of each run of one call) | 84 KB query | `dirty_calls` | builder | 2.3 / 3.3 / 4.3 KB |
| `bundle` | the on-demand brief job and the steady call's state | the 4-doc batch, when the page view is fresh | source doc hashes | builder | 1.7 / 2.3 / 3.0 KB |
| `anomaly` | today's move doc's anomaly (or none) | 3.6 KB | source doc hash | builder | 3.4 / 0.1 / 0.1 KB |
| `results` | the releases list the call's evidence reads | 5.9 KB | source doc hash | builder | 1.3 / 1.4 / 1.4 KB |
| `reddit` | the ticker's Reddit context (or none) | 3.1 KB | source doc hash | builder | 2.9 / 2.4 / 0.1 KB |
| `news` | the 14-day, 14-headline list and the model's tone labels for it | ~410 KB over 3 calls | `dirty_news` | builder | 9.1 / 9.3 / 10.1 KB |

Totals: AMD 43.0 KB, AAPL 46.9 KB, ASTS 36.4 KB, NVDA 46.3 KB, KO 36.6 KB. Budget 50 KB; the series is the biggest part and the first to move into its own doc if a stock goes over.

Every part holds either exactly what today's loader returns, or the raw source fields the loader transforms, and the page runs the same pure transform on it (`longSeriesFromRaw`, `compactSeriesFromRaw`, `snapshotFromPriceData`, `resultsReportsFromDoc`, `redditContextFromDoc`, `anomalyFromTickerDoc`, `applyTones`). So the page renders the same thing either way; the transforms that depend on the clock (the news window, the price window's live point, the page-view section ages) still run at render time.

Left out on purpose (v1): the stored page view (`tm_stock_page_views`, already a write-through serving doc of its own, 41-46 KB), the instrument and the live quote (small and live), earnings dates, Congress, insiders and fund holders (queries worth ~16 KB together; next), peers (the ranking is per sector and shared; the peer quotes must stay live), filing changes and the results-night card.

### how a part proves it is current

A part is used only if all of these hold (`partVerdict` in `lib/serve/stock-serve-shared.ts`):

1. the doc's `schema` is 1 and its `instrument_id` is the stock's;
2. the part's `v` is the code's version for that part;
3. it is younger than its age limit (2 to 4 days; news 6 h, calls 26 h) and not from the future;
4. it is not dirty: no `dirty_<part>` on the stock's doc or on `_all` later than its `built_at`;
5. for a hash part: every source doc in `src` still has the hash it was built from (missing then and missing now counts as the same). The reader asks for exactly the paths `hashSourcePaths(ticker)` names, so a part naming any other source fails.

The hash check is exact and costs one batch read with a field mask no document has: LocalDB answers each path with its hash and no body (~200 bytes a doc), and it runs beside the serve doc read, not after it.

The dirty stamp is for sources a hash cannot cover: a query (calls, news) or a doc whose hash changes with every quote (snapshot). Writers stamp `dirty_<part>` on the stocks they touched **before and after** they write (`backend/serve_docs.py`): the stamp after covers a build that read the source while the write was landing; the stamp before covers every part built earlier if the stamp after fails. Only a build that reads in that gap plus a failed stamp after leaves a stale part, until its age limit. A headline write stamps both the tags it writes and the tags the stored doc carried (a write that drops a tag moves the headline off that stock). On a Firebase rollback client the hooks do nothing. A writer that replaces a whole collection and cannot name the stocks stamps `_all`. The price writer goes further and writes its own slice: when a write changes a US stock's window it stamps `dirty_snapshot`, writes the price doc, then writes `p_snapshot` with `built_at` equal to a fresh `dirty_snapshot`.

### hooked writers

| part | writer | hook |
|---|---|---|
| snapshot | `backend/storage.py` `save_price_snapshot`, `save_price_snapshots_bulk`, `save_price_history_bulk` | stamp, write, then the part itself (US only, only when `history_window` is written) |
| calls | `backend/storage.py` `append_directive_history` | stamp before and after |
| news | `backend/storage.py` `upsert_news_articles`, `upsert_article_enrichments` | stamp the tickers in `stock_tickers` (US only) |
| news | `backend/storage.py` `save_news_articles`, `save_article_enrichments` (whole replace) | stamp `_all` |
| news | `backend/agentdata/news_feed.py` (run and retag), `news_tone.py` | stamp the changed headlines' tickers (and a retag's old tickers) |

Writers outside these (a one-off backfill, a change of the active news universe) are covered by the age limits; run the builder after them. `replay_call_stability --write` writes `tm_call_stability`, which the bundle part checks by hash. Bump a part's `v` whenever the transform that produced it changes, or the old output is served until the age limit. Run the builder on the VPS, not a laptop: clock skew against the writers' stamps could hide a stamp.

### staleness rules, in one place

- Hash parts: never stale. A changed source fails the check on the next view.
- Dirty parts: never stale while their writers are the hooked ones. Unhooked writes are bounded by the age limit.
- The 14-day news window moves with the clock: the stored list is cut to today's window at render, which is exactly what the loader would return (the stored list is the newest-first cut, so only its aged tail can drop).
- A stale or missing part costs one extra round trip: the page waits for the serve read (given up after 1.5 s), then reads that part the old way.
- The serve doc body is kept 60 s per instance; hash parts are still checked live on every request, so only a dirty stamp can be seen up to 60 s late, inside the 2 to 15 minutes the old reads were cached.
- Today's old path caches most of these reads for 1 to 60 minutes per instance; a served part is never older than its source as proven above, so the page is at least as fresh as before.

### fallback

Per part, to exactly today's loader. Any failure in the serve read (store error, bad JSON, schema mismatch, flag off, Firebase rollback) is "nothing served" and the whole page reads the old way. `SERVE_DOCS` is read on every render (lib/serve/stock-serve.ts, never inlined at build): add `SERVE_DOCS=1` to `/etc/tikrr/web.env` and restart the two web instances to turn it on, remove it to turn it off. `SERVE_DOCS_LOG=1` prints one line per render with each part's verdict (`fresh`, `missing`, `version`, `expired`, `dirty`, `changed`).

## the builder

`scripts/run-serve-docs.ts` (vite-node, `scripts/jobs.config.ts`):

```sh
node_modules/.bin/vite-node -c scripts/jobs.config.ts scripts/run-serve-docs.ts              # only parts a page would not use now
node_modules/.bin/vite-node -c scripts/jobs.config.ts scripts/run-serve-docs.ts --all        # every part, every covered stock
node_modules/.bin/vite-node -c scripts/jobs.config.ts scripts/run-serve-docs.ts --parts=news --tickers=AMD,AAPL --dry
```

It uses the page's own reads, made strict (a failed read throws instead of answering "no data", so a failure is never stored as an empty part), writes only `tm_serve_stock`, one merge per stock. The default mode reads every serve doc's meta (masked: versions, build times, sources, stamps), one hash batch for all sources, and rebuilds only what `partVerdict` rejects. Run it on the VPS (the writers' stamps and the builder's `built_at` should come from one clock).

### schedule

`backend/agentdata/schedule.py` runs the builder (stale parts only) last in three groups: `frequent` after "news tone" (8-minute budget), `hourly` after "calendar events" (12) and `after_close` after "thesis checks" (20). The frequent and hourly units now load the same one-line `/etc/tikrr/agentdata-localdb.env` as the after-close unit, since this is their first TypeScript step. The writers keep pages correct; the builder only makes more of each page served. The pipeline lanes in `backend/vps/install-systemd.sh` (prices, briefs, news prep, anomalies) stamp through `backend/storage.py`, and the next hourly or frequent run rebuilds what they stamped.

### the page cache

Signed-out stock pages sit in Varnish for up to 5 minutes and are refreshed by `/api/revalidate` (lib/revalidate-targets.ts).

- `news_feed` and `news_tone` refresh exactly the stock pages whose headlines they stamped, once at the end of each run (`refresh_stamped_pages` in `backend/serve_docs.py`, through `revalidate_after_write(symbols=...)`). Before this, a stock page kept old headlines until its copy expired, with or without serving docs.
- Price and brief lanes already refresh every stock page (`prices`, `briefs` kinds), which covers the snapshot and calls stamps.
- The headline writes from the pipeline lanes (`tracked_news_prep`, `on_demand_news`) refresh only `/news` and `/briefing`, so their stock pages wait out the 5 minutes, as they did before.
- The builder triggers no refresh: a rebuilt part renders the same page as the fallback it replaces.

## size and cost, before and after

Nov 13, laptop dev servers against the production store through the SSH tunnel, every store call counted by a proxy (bytes are response bodies). "Cold" is the first view of a stock on a fresh server after the market-wide reads are warm (the long tail and crawlers); "warm" is a second view inside the old caches' windows.

| view | flag | AAPL calls / KB | AMD calls / KB | ASTS calls / KB |
|---|---|---|---|---|
| cold | off | 21 / 793 | 27 / 912 | 27 / 681 |
| cold | on | 14 / 229 | 20 / 284 | 19 / 234 |
| warm | off | 4 / 16.7 | 4 / 16.7 | 4 / 10.8 |
| warm | on | 5 / 15.3 | 5 / 16.0 | 4 / 8.4 |

What a cold view still reads with the flag on: the stored page view (46 KB), the sector's peer ranking (95 KB, shared by every stock in the sector for 15 minutes, cold here only because the server was fresh), peer quotes, earnings dates, Congress, insiders, fund holders, filing changes, and around a report the results-night card (which reads the 58 KB price history itself). Milliseconds over the tunnel are dominated by round trips run side by side (store span 0.5 to 0.9 s cold either way); on the VPS, where the store is next door, the cost is the bytes decoded, which drop by about 70%.

Full build of all 779 covered stocks: 6,232 parts, 24 MB, largest doc 48.6 KB, 0 failures, 215 s from a laptop through the tunnel. A second run right after found nothing to rebuild.

Flag on and off render the same page: full-page screenshots of AAPL, AMD and ASTS at 1280 and 390 wide are pixel-identical except 145 px of glyph antialiasing in one button on ASTS at 1280 (same text).

## next

- Earnings dates, Congress, insiders and fund holders as dirty parts (their writers are all in `backend/agentdata`).
- The signed-out briefing as one market serving doc; signed-in briefings reading the shared parts from it.
- Retire `tm_stock_page_views` into `tm_serve_stock` (the brief sections become parts with the writers' existing write-through).
