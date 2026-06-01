# Tikrr Runbook — what to run, when, and why

Operator-facing companion to `PIPELINE.md`. PIPELINE lists the canonical
stage order; this doc tells you which scripts are intraday vs daily vs
one-off, what surface in the app each one powers, and how to diagnose
when something looks stale.

All scripts live under `backend/scripts/` and run as Python modules:

```bash
python3 -m backend.scripts.<script_name> [--market US|IN] [--universe ...] ...
```

---

## TL;DR — keep the whole app fresh once a day

Preferred: run the master runner any time. It checks freshness before each
stage, skips work that is still inside its freshness window, and reruns
downstream stages when their inputs were refreshed in the same pass.

```bash
# See what would run without changing Firestore.
python3 -m backend.scripts.run_pipeline --dry-run

# See which frontend data surfaces are stale without mutating anything.
python3 -m backend.scripts.audit_data_health --market US --dry-run

# Actually run only stale/due stages for US (current focus).
python3 -m backend.scripts.run_pipeline

# Write one cheap ops snapshot to tm_data_health/US.
python3 -m backend.scripts.audit_data_health --market US

# Refresh stale stock-detail fundamentals/facts. This is normally scheduled
# weekly through the Cloud Run `stock_facts` lane.
python3 -m backend.scripts.sync_stock_facts --market US --limit 0 --max-workers 4 --pause 0.25

# Optional: override universes or force one stale-looking stage.
python3 -m backend.scripts.run_pipeline \
  --us-universe us_core_100 \
  --force US:build_heat_list
```

The conservative default policy is (US-first operations):
- prices use `--session-phase auto` by default. The runner maps the current
  local market time to `pre_open`, `open_check`, `mid_check`, `close_check`,
  or `post_close`; each phase runs at most once per market day
- US currently uses `US_universe` as the runtime namespace. This is not the
  whole searchable/coverage catalog; see `docs/stock-universes.md`.
- weekends are skipped automatically for price snapshots unless you force a
  stage or pass an explicit `--session-phase`
- technicals, breadth, screens, alerts, heat/divergence wait for a fresh price
  snapshot instead of refetching stale weekend prices
- AI intelligence, views, heat/divergence/flip refresh if older than 24h, or
  if an upstream dependency ran
- fundamentals and sector benchmarks:
  refresh if older than 5 days
- `build_watchlist_views` runs once globally after market views/alerts change

Universe contract (canonical, US):
- `US_universe` = active runtime namespace used by product views and active
  AI/news reads
- paid tracked stocks are unioned into AI generation at runtime

To intentionally run a price phase outside its normal window:

```bash
python3 -m backend.scripts.run_pipeline --markets US --session-phase open_check
python3 -m backend.scripts.run_pipeline --force US:sync_price_snapshots
```

If you need to bypass the freshness checks, this is the explicit manual chain.
Set universes to whatever is active for the environment first:

```bash
MARKET=US
UNIVERSE=us_core_100

# 1 — refresh raw market data
python3 -m backend.scripts.sync_price_snapshots         --market "$MARKET" --universe "$UNIVERSE" --session-phase manual
python3 -m backend.scripts.sync_stock_metrics           --market "$MARKET" --universe "$UNIVERSE"
python3 -m backend.scripts.sync_sector_benchmarks       --market "$MARKET" --universe "$UNIVERSE"

# 2 — refresh news
python3 -m backend.scripts.build_per_stock_intelligence --market "$MARKET" --universe "$UNIVERSE" --skip-materialize

# 3 — derived intelligence
python3 -m backend.scripts.build_stock_intel_pro        --market "$MARKET" --universe "$UNIVERSE"
python3 -m backend.scripts.build_stock_technicals       --market "$MARKET" --universe "$UNIVERSE"      # scrapes RSI from Finviz
python3 -m backend.scripts.build_market_breadth         --market "$MARKET" --universe "$UNIVERSE"

# 4 — pre-computed views the frontend reads
python3 -m backend.scripts.build_thematic_screens       --market "$MARKET" --universe "$UNIVERSE"
python3 -m backend.scripts.build_user_alert_flags       --market "$MARKET" --universe "$UNIVERSE"
python3 -m backend.scripts.materialize_views            --market "$MARKET" --universe "$UNIVERSE" --activate
python3 -m backend.scripts.build_watchlist_views
python3 -m backend.scripts.build_snapshot               --market "$MARKET"

# 5 — discovery / anomaly signals
python3 -m backend.scripts.build_heat_list              --market "$MARKET" --ai-universe "$UNIVERSE" --price-universe "$UNIVERSE"
python3 -m backend.scripts.build_divergence             --market "$MARKET" --ai-universe "$UNIVERSE" --price-universe "$UNIVERSE"
python3 -m backend.scripts.build_sentiment_flip         --market "$MARKET" --ai-universe "$UNIVERSE" --price-universe "$UNIVERSE"
```

Repeat with `--market IN` if running the India market. A few stages
(Finviz RSI scrape, Fear & Greed) are US-only and silently no-op for IN.

---

## 1. One-time setup (only when bootstrapping or expanding the universe)

| Script | Purpose | When |
|--------|---------|------|
| `seed_tikrr_meta` | Seed static config (eval universe metadata) | First-run only |
| `sync_config` | Push `source_registry`, `preferences_schema`, `market_strategy` from local JSON to `tm_config/*` | When you edit those files |
| `generate_stocks_universe` | Generate a universe definition file from a CSV / hand list | When designing a new universe |
| `sync_instrument_universe` | Upload `tm_instruments/*` + universe membership | After editing a universe definition |
| `expand_universe` | Add tickers to an existing universe | When growing coverage |
| `bootstrap_prices` | Create minimal `tm_latest_prices/{id}` placeholders so the first `sync_price_snapshots` doesn't 404 | Once per new universe |
| `backfill_price_history` | Pull 1y of OHLCV from yfinance into `tm_latest_prices.history_window` | **Optional.** Only useful for SMA50/200 from local data — RSI is scraped fresh from Finviz now |
| `set_promoted_tickers` | Set the editorial pick list shown on the home page | Whenever the list changes |

---

## 2. Intraday — run every 30-60 min during market hours

| Script | What it powers | Cost |
|--------|---------------|------|
| `sync_price_snapshots --market <market> --universe <price_universe> --session-phase {pre_open\|open_check\|mid_check\|close_check}` | Live prices everywhere — header search, dashboard top movers, stock pages, sector pages | ~30s for full US price universe |
| `build_per_stock_intelligence --market <market> --universe <ai_universe> --skip-materialize` | News feed, stock-page AI briefs, sentiment, mention velocity, divergence, sentiment flip | LLM cost per *new* article only |

Session phases for `--session-phase`:
- `pre_open` — once, ~30 min before open
- `open_check` — within 5 min of the bell
- `mid_check` — every 30-60 min during the session
- `close_check` — at the close
- `post_close` — once, ~15 min after close
- `manual` — ad-hoc / catch-up

You don't need every intraday phase if you only care about end-of-day
data — `post_close` plus the daily chain in §0 is enough.

---

## 3. Daily stages — what they read, what they write, what surface uses them

Numbering matches the canonical order. Steps with the same numeric
prefix can run in parallel.

| # | Script | Reads | Writes | Powers |
|---|--------|-------|--------|--------|
| 1 | `sync_price_snapshots --session-phase post_close` | yfinance | `tm_latest_prices`, `market_price_snapshots` | Every price on the site |
| 2a | `sync_sector_benchmarks` | yfinance | `tm_sector_benchmarks/{market}__{date}` | Sector heatmap + sector pages + intel_pro inputs |
| 2b | `sync_stock_metrics` | yfinance + Finviz | `tm_stock_metrics_history/{id}/snapshots/{date}` | Stock scorecards + intel_pro inputs |
| 3 | `build_per_stock_intelligence` | per-ticker news + LLM + prices/intel | `tm_news_runs/{ns}/articles`, `enrichments`, `stock_intelligence`, `sector_context` | AI brief on every stock detail page, market/sector context, sentiment inputs |
| 4 | `build_stock_intel_pro` | `tm_stock_metrics_history`, `tm_sector_benchmarks` | `tm_stock_intel_pro/{market}__{universe}/stocks` | Pillar scores on stock pages, screens, heat list |
| 5 | `build_stock_technicals` | finviz.com (RSI), `tm_latest_prices` (SMAs) | `tm_stock_technicals/{id}_{date}` | Technicals card, RSI badges, oversold/overbought screens, heat list RSI |
| 6 | `build_market_breadth` | `tm_latest_prices`, `tm_stock_technicals` | `tm_market_breadth/{market}__{date}` | Market dashboard breadth strip |
| 7 | `materialize_views` | prices + stock intelligence + context | `tm_views_dashboard/*`, `tm_views_instrument/*` | Frontend dashboard and stock/sector pages |
| 8 | `build_thematic_screens` | `tm_stock_intel_pro`, `tm_stock_technicals` | `tm_thematic_screens/{market}` | Screener page (momentum_leaders, oversold_bounce, etc.) |
| 9 | `build_user_alert_flags` | technicals + prices | `tm_user_alert_flags` | Alert dots on stock pages + watchlist |
| 10 | `build_watchlist_views` | user prefs + intel | `tm_watchlist_views/{user}` | Personal watchlist view |
| 11 | `build_snapshot` | many | `tm_snapshots/{snapshot_id}` | Snapshot archive (rollback / audit) |
| 12 | `build_heat_list` | intel_pro + technicals + prices + mention_stats | `tm_heat_list/{market}` and compact `tm_heat_list_view/{market}` | `/heat` → "Hot Stocks" tab |
| 13 | `build_divergence` | enrichments + prices | `tm_divergence/{market}` | `/heat` → "Divergences" tab |
| 14 | `build_sentiment_flip` | enrichments | `tm_sentiment_flip/{market}` | `/heat` → "Sentiment Flip" tab |
| 15 | `build_earnings_intel --all-recent` | `tm_earnings_events`, prices, facts, technicals, stock_intel_pro, stock_intelligence, reddit | `tm_earnings_intel/{market}__{instrument}__{event_date}`, `{market}__{instrument}__latest` | Pro earnings-intel pages + Radar earnings deep-links |

Open anomaly and Reddit jobs also maintain targeted stock-detail read models:
`tm_daily_anomaly_tickers/{market}__{ticker}` and
`reddit_ticker_contexts/{market}__{ticker}`. Keep those writes with the full
feed writes; stock pages use them to avoid reading the full public feed docs.

---

## 4. Weekly / occasional

| Script | When | Why |
|--------|------|-----|
| `expand_universe` | When adding tickers | Grow coverage |
| `set_promoted_tickers` | When editorial picks change | Home-page free picks |
| `purge_tikrr_stale_data` | Monthly | Drop expired enrichment runs / stale views |
| `verify_urls` | Ad hoc | Sanity-check news source URLs |
| `test_tikrr_stock_pipeline` | Before pipeline changes | End-to-end smoke test |

---

## 5. Dependency graph

What blocks what. Anything left of an arrow must finish before the
thing right of the arrow starts.

```
sync_instrument_universe ─┐
                          ├─→ sync_price_snapshots ───────┐
bootstrap_prices ─────────┘                               │
                                                          │
sync_stock_metrics ─────┐                                 │
sync_sector_benchmarks ─┴─→ build_stock_intel_pro ────────┤
                                                          │
                                                          ▼
                                            build_stock_technicals
                                                (Finviz RSI scrape)
                                                          │
                                                          ▼
                                            build_market_breadth
                                            build_thematic_screens
                                            build_user_alert_flags
                                            build_heat_list

build_per_stock_intelligence ───────┬─→ materialize_views
  (fetches + enriches news)          ├─→ build_heat_list
                                    ├─→ build_divergence
                                    ├─→ build_sentiment_flip
                                    └─→ (heat list mention-velocity bonus)

(everything above) ─→ materialize_views ─→ build_snapshot
                  └─→ build_watchlist_views
```

---

## 6. Diagnosis cheat-sheet

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Prices look stale everywhere | Last `sync_price_snapshots` failed | Re-run with `--session-phase manual` |
| AI briefs / sentiment look stale | `enrich_articles` skipped or LLM rate-limited | Re-run; it's idempotent and skips already-enriched docs |
| Stock detail page shows no AI brief | `build_per_stock_intelligence` missed that ticker | Re-run; per-ticker partition guarantees coverage |
| Sector page has no context | `build_context_intelligence` failed | Re-run after confirming `build_per_stock_intelligence` succeeded |
| Screener shows empty buckets | `build_thematic_screens` ran before `build_stock_technicals` finished | Re-run in order |
| Market dashboard breadth strip blank | `build_market_breadth` missing | Re-run after `build_stock_technicals` |
| Watchlist page empty per user | `build_watchlist_views` skipped | Re-run after the rest of the chain |
| `/heat` "Hot Stocks" empty | `tm_heat_list/{market}` missing or rows empty | Re-run `build_heat_list` (depends on intel_pro + technicals being current) |
| `/heat` RSI column shows "—" | Finviz scrape was rate-limited or skipped | Re-run `build_stock_technicals` — console prints `RSI resolved: N/M`. Lower `--finviz-workers` to 2 if 429s persist |
| `/heat` "Divergences" empty | No recent enrichments, or no price moves above the threshold | Verify `tm_news_runs/{ns}/enrichments` has today's data and `day_change_pct` exists on prices |
| Earnings-intel page redirects to stock page | No `tm_earnings_intel/...__latest` doc exists yet for that ticker | Run `build_earnings_intel --ticker <TICKER> --write` or schedule `--all-recent` lane |
| `/heat` "Sentiment Flip" empty | <14 days of enrichment history accumulated, or no qualifying flips | Wait — needs 14 days of news data to detect flips |

---

## 7. Cost notes

- **`enrich_articles`** is the only LLM-cost stage. It skips docs that already have an enrichment, so re-runs are cheap.
- **`build_stock_technicals`** scrapes Finviz (one GET per US ticker in the active price universe, throttled to 3 concurrent workers with retry-with-backoff). ~60-90 sec. Bypass with `--no-finviz` if Finviz is down — RSI then falls back to `tm_latest_prices.history_window`, which needs ≥15 daily snapshots accumulated.
- **`sync_price_snapshots`** uses yfinance — free but rate-limited. Default 8 parallel workers is safe; lower with `--max-workers` if you see throttling.
- All `build_*` stages are pure Firestore reads + in-memory compute (except enrichment + technicals scrape). No external API costs.
- Firestore reads dominate. Each `build_*` stage uses batched `get_all()` calls (≤500 refs per roundtrip) so a 1000-stock universe still costs ≤5 roundtrips per stage.
