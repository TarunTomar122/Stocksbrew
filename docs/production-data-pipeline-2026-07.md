# Production Data Pipeline Audit

Verified on the Stocksbrew VPS on 2026-07-30. This is the canonical operating
map for the current US pipeline. Historical Cloud Run/Scheduler notes in
`docs/pipeline-cost-audit.md` predate the VPS cutover.

## Product cohorts

| Cohort | Current size | Purpose |
| --- | ---: | --- |
| Search catalog | 509 local instruments | Searchable stock pages and requests |
| Price cohort | 573 resolvable instruments selected from coverage plus valid overrides | Repeated batched quotes and price-derived views |
| AI brief cohort | 145 instruments | Runtime AI universe plus the union of stocks tracked by Pro users |
| Anomaly cohort | 30 rows | True top 15 gainers plus top 15 losers from the fresh price cohort |
| Homepage/runtime view | 100 rows | Small fast public read model, fed by the broader price run |

Legacy names such as `us_core_100` and `us_core_155` are Firestore namespace
names, not literal size guarantees.

## Data lanes

### Prices

`sync_price_snapshots` sends the whole resolvable cohort through Yahoo's batch
quote path. It never fetches per-stock fundamentals. One retry batch handles
missing symbols, and duplicate Stocksbrew instrument IDs that share a Yahoo
symbol reuse the same quote.

Outputs:

- `tm_latest_prices`
- `market_price_snapshots`
- instrument price views
- homepage/dashboard price read models

The same Yahoo batch also returns a ten-calendar-day daily frame. Stocksbrew
stores its last six real market sessions as `recent_sessions`; AI jobs never
infer consecutive-session returns from the separate rolling fetch history.

Latest live benchmark: 573 selected instruments, 572 unique Yahoo symbols, 568
unique quotes resolved, 569 instrument price documents saved, and 573
instrument views materialized in about 95 seconds. Four catalog symbols were
unavailable from Yahoo in the measured run: `APLS`, `BK`, `BLD`, and `GTLS`.
The post-close coverage gate uses the resolvable input cohort and accepts the
measured 99.30% result.

### Fundamentals and slower facts

The weekly `stock_facts` lane owns broad facts, metrics, Pro fundamentals,
Finviz technicals, and their materialized views. Daily price and post-close
lanes do not repeat these calls.

### Source preparation

At 08:45 and 15:40 New York time, `tracked_news_prep` fetches sources only for
the AI brief cohort. It records a fingerprint per stock. Existing article LLM
results are keyed by stable source URL and checked before any remote scrape;
only genuinely new sources are scraped and enriched.

This lane is intentionally ahead of the market-session chain, so source
latency cannot hold price publication hostage.

### AI stock briefs

`tracked_open_briefs` runs after the open price stage and again after the close
price stage. It does not sync prices itself.

A model call is made when:

- the stock's source fingerprint changed;
- the stock is missing a brief; or
- trustworthy provider session bars show a material price setup (at least a
  5% day, a reversal, continuation, or breakout), and that setup is new or
  changed: new trading day, sign change, at least a 2 percentage-point change
  in the daily move, at least a 3 percentage-point change in the recent-window
  move, or a changed reversal/continuation/breakout state.

The same source set plus routine price drift reuses the brief. Merely changing
the provenance phase from open to close is never an AI input change.

Outputs:

- `tm_stock_intelligence`
- per-stock freshness state and price-signal fingerprint
- stock/watchlist read models

### Anomalies

The anomaly lane selects its own top 15 gainers and top 15 losers from prices
written for the required market session. It is separate from stock brief
generation.

Reason resolution order:

1. fresh source-backed evidence already in Stocksbrew;
2. bounded Firecrawl search for unresolved movers;
3. an AI price/sector/tape explanation using the actual current and recent
   session data.

The tape contract contains exact Yahoo daily bars and deterministic relationship
fields: prior-window direction, close-range bounds, true range-break booleans,
and post-close-only volume comparison. The lane rejects contradictory
direction, fake session highs/lows, unsupported range breaks, intraday
"closed" language, and phrases such as an up day "continuing a slide." A safe
`--` is allowed when neither sources nor tape support a useful explanation.
All 30 rows must validate before publishing; a worker/API failure fails the
lane closed and prevents the opening email.

Live benchmark: selection took 6.21 seconds. A cold 30-stock research pass took
195.12 seconds and correctly failed closed at 28/30. Retrying the two unresolved
rows completed 30/30 in 46.52 seconds. The final 30 strings passed the
contradiction/blank-output audit.

## Session sequence

```text
08:45 ET  source prep
09:30 ET  one batched open price run
           -> open brief synthesis
09:50 ET  second batched price run for a settled opening tape
           -> top-30 anomaly research
           -> opening email

10:00-15:00 ET  hourly batched price refreshes

15:40 ET  source prep
16:10 ET  one batched post-close price/read-model run
           -> close brief synthesis
           -> close top-30 anomaly research
```

That is nine normal US price publications each trading day: 09:30, 09:50,
hourly from 10:00 through 15:00, and 16:10 New York time. Brief synthesis runs
twice, after the open and close price stages, but only changed source/tape
fingerprints call the model. Anomaly research runs twice, from the settled
09:50 tape and the post-close tape.

The 14:00 IST pre-market report/email is a separate pre-market product lane.
Broad weekly facts run Sunday at 08:00 UTC.

Systemd `OnSuccess=` dependencies own the open and close order. The next stage
does not start on a failed predecessor. `backend/market_session_state.py`
records stage completion and workers verify the required session phase, source
freshness, and price coverage before publishing. The 09:50 anomaly worker waits
up to 15 minutes for a still-running opening brief stage, then fails closed.

## Failure and cost controls

- Firestore writes split by both operation count and estimated payload bytes,
  avoiding the 10 MiB commit limit.
- The price provider uses batch quote calls, never `.info` fallbacks.
- Source scraping is skipped on LLM cache hits and bounded across concurrent
  shards.
- Brief synthesis is restricted to the AI cohort, not the full price cohort.
- Anomaly web search is bounded and only used for unresolved movers.
- `needs_confirmation` stock requests are terminal until a user chooses a
  symbol; the poller does not reprocess them every 30 minutes.
- Optional market-discovery cards run outside the opening email critical path.
- The obsolete fixed-time brief/anomaly timers and old GitHub market workflows
  are retired by `backend/vps/install-systemd.sh`.

## Important implementation files

- `backend/cloudrun/orchestrator/dispatch.py`
- `backend/cloudrun/jobs/daily_postclose_job.py`
- `backend/cloudrun/jobs/tracked_news_prep_job.py`
- `backend/cloudrun/jobs/tracked_open_briefs_job.py`
- `backend/cloudrun/jobs/open_anomalies_job.py`
- `backend/scripts/sync_price_snapshots.py`
- `backend/scripts/build_per_stock_intelligence.py`
- `backend/scripts/build_daily_anomalies.py`
- `backend/scripts/research_daily_anomaly_reasons.py`
- `backend/market_session_state.py`
- `backend/vps/install-systemd.sh`
