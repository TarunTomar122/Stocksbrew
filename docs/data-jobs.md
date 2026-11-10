# data jobs

Everything the web app shows was written to LocalDB by a job. There are two families, and both run on one Linux server under systemd timers.

All times are UTC unless a timezone is given. The timers are the source of truth: `backend/vps/units/*.timer` for the agent data groups, `write_pair` lines in `backend/vps/install-systemd.sh` for the pipeline lanes.

## 1. agent data groups (`backend/agentdata/`)

Standard library only. Each module is runnable on its own with `python3 -m backend.agentdata.<module>`, and `backend/agentdata/schedule.py` runs them in groups, one after another (several talk to SEC EDGAR, which rate-limits by address).

| Group | Timer | Jobs |
|---|---|---|
| `frequent` | every 30 min (`:07`, `:37`) | `news_feed` (the wire), `news_tone` (tone and theme per headline, skips without `ANTHROPIC_API_KEY`), `markets` |
| `hourly` | `:20` every hour | `sec_filings`, `insiders_form4`, `calendar_events` (economic releases, IPOs, dividends) |
| `after_close` | Mon to Fri 22:30 | `backtest_strategies` (daily prices, strategy baskets, live record), `earnings_calendar`, `earnings_reactions`, `screener`, then the standing agents (`scripts/run-agent-jobs.ts`) |
| `weekly` | Sun 06:00 | `funds_13f`, `fund_holders`, `house_ptr` |

```sh
python3 -m backend.agentdata.schedule --list
python3 -m backend.agentdata.schedule --group after_close --dry-run   # print the plan, run nothing
python3 -m backend.agentdata.schedule --group hourly
```

Not on a timer yet, run by hand: `call_scores` (the call engine, see below), `sec_fundamentals`, `insider_history`.

Writes go through `DocStore.from_env()` in `backend/agentdata/store.py`: straight into the SQLite file when `LOCALDB_PATH` is set, over HTTP when `LOCALDB_URL` and `LOCALDB_API_TOKEN` are. SEC jobs need `SEC_USER_AGENT` with a contact address.

## 2. pipeline lanes (`backend/`, dispatched by `backend/cloudrun/orchestrator/dispatch.py`)

The older pipeline. Each lane is one step (fetch quotes, fetch news, write briefs, explain movers, send an email). On the server `backend/vps/run-dispatch.sh <lane>` runs a lane under a lock; locally:

```sh
python3 -m backend.cloudrun.orchestrator.dispatch --executor local --lane <lane> --market US --limit 20 --dry-run
```

The folder is called `cloudrun` because the lanes used to run as Cloud Run jobs. That deploy path is retired; the dispatcher itself is what the server runs.

### the brief pipeline

Twice per trading day, each step started by the success of the one before it:

| When (New York) | Step | Lane |
|---|---|---|
| 08:45 | news for covered stocks | `tracked_news_prep` |
| 09:30 | opening quotes | `price_core_open` |
| then | one brief per covered stock (LLM) | `tracked_open_briefs` |
| 09:50 | settled quotes, then movers and their reasons | `price_core_open`, `open_anomalies` |
| 15:40 | news again | `tracked_news_prep` |
| after the close | movers, then briefs | `open_anomalies`, `tracked_open_briefs` |
| 16:10 | post-close read models | `daily_postclose` |

Briefs are only rewritten when the stock's sources or price action changed, so a quiet stock costs no model call.

### other lanes

| Lane | Schedule |
|---|---|
| `price_core_intraday` | hourly 10:00 to 15:00 New York |
| `on_demand_news` | every 5 min (news for a stock someone just added) |
| `stock_requests` | every 30 min (requests for stocks not yet covered) |
| `reddit_buzz` | Mon to Fri 12:20, 15:20, 18:20, 21:20 |
| `market_events`, `data_health` | Mon to Fri around the open and the close |
| `market_discovery` | Mon to Fri 10:30 and 17:00 New York |
| `earnings_intel`, `pre_earnings_intel` | Mon to Fri 22:00 and 22:45 |
| `radar_official_sources`, `radar_materialize` | Mon to Fri around the open and the close |
| `radar_outcomes`, `radar_alerts` | daily 23:00, every 15 min on weekdays |
| `zone_briefs`, `contrarian_calls` | weekdays |
| `stock_facts`, `research_themes`, `business_questions`, `weekly_email` | weekly |
| `premarket_pipeline` | Mon to Fri 08:30 |

Power trades (congressional trades and their alerts) have their own unit: `backend/vps/units/tikrr-power-trades.*`.

Emails are sent only when `EMAILS_ENABLED=1`.

## 3. the call engine

`backend/call_engine.py` scores each stock's factor families against its peers and moves a weekly add / hold / trim state machine. `python3 -m backend.agentdata.call_scores --write` runs it after a close and stores `tm_call_engine_state/{SYMBOL}` (the current call) and `tm_call_engine_daily/{SYMBOL}__{date}` (every raw factor, so a call can be replayed).

The brief pipeline reads it according to `CALL_ENGINE_MODE`:

- `off` (default): ignored, briefs carry the LLM's directive as before;
- `shadow`: the engine's call is stored next to the brief as `call_engine`, for comparison;
- `on`: the engine decides and the model only explains it.

A missing, stale (older than 6 days) or other-version state falls back to the old directive. `EVIDENCE_HISTORY_MODE=on` is a similar opt-in flag for keeping dated evidence history in the briefs.

## adding a job

1. Write it as a module under `backend/agentdata/` (standard library only, `requests` only if you must) with a `main()` and an `if __name__ == "__main__"` guard. Read config from the environment, write through `DocStore.from_env()`, and make a re-run safe: same input, same documents.
2. Give it a `--dry-run` or a small `--limit`/`--days` so it can be tried locally.
3. Add a test in `backend/tests/test_agentdata_<name>.py` that runs it on fixtures, never the network.
4. Add it to a group in `backend/agentdata/schedule.py` (and its docstring), or add a new group with a matching `tikrr-agentdata-<group>.{service,timer}` pair in `backend/vps/units/`.
5. Name the collection after what it holds (`tm_<thing>`), document its shape at the top of the module, and read it from a loader in `lib/` (never from a component).
6. Respect the provider's terms and rate limits, and identify the client where asked.
