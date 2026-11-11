# data jobs

Everything the web app shows was written to LocalDB by a job. There are two families, and both run on one Linux server under systemd timers.

All times are UTC unless a timezone is given. The timers are the source of truth: `backend/vps/units/*.timer` for the agent data groups, `write_pair` lines in `backend/vps/install-systemd.sh` for the pipeline lanes.

## 1. agent data groups (`backend/agentdata/`)

Standard library only. Each module is runnable on its own with `python3 -m backend.agentdata.<module>`, and `backend/agentdata/schedule.py` runs them in groups, one after another (several talk to SEC EDGAR, which rate-limits by address).

| Group | Timer | Jobs |
|---|---|---|
| `frequent` | every 30 min (`:07`, `:37`) | `news_feed` (the wire), `news_tone` (tone and theme per headline, skips without `ANTHROPIC_API_KEY`), `markets` |
| `hourly` | `:20` every hour | `sec_filings`, `insiders_form4`, `calendar_events` (economic releases, IPOs, dividends) |
| `after_close` | Mon to Fri 17:30 America/New_York | `backtest_strategies --prices-only` (daily prices into `tm_price_history_daily`), then `backtest_strategies --no-price-write` (strategy baskets and live record, from the prices the first step cached on disk), `earnings_calendar`, `earnings_history`, `earnings_reactions`, `dividend_history`, `screener`, then the standing agents (`scripts/run-agent-jobs.ts`, into `tm_agent_runs`) and the nightly reason check (`scripts/run-reason-checks.ts`, into `tm_thesis_checks`). The two TypeScript steps run under `vite-node -c scripts/jobs.config.ts` and need `LOCALDB_API_TOKEN` (the unit loads it from the root-only `/etc/tikrr/agentdata-localdb.env`, which holds only that line). The app reads this schedule from `lib/agent-schedule.ts`. |
| `weekly` | Sun 06:00 | `funds_13f`, `fund_holders`, `house_ptr` |
| `earnings_day` | every 10 min, Mon to Fri 06:00 to 20:59 New York (not installed yet) | `earnings_day`: a report per covered stock that filed earnings today (8-K Item 2.02 on EDGAR, Nasdaq EPS estimate and actual, Yahoo prices) into `tm_earnings_day`; off unless `EARNINGS_DAY_ENABLED=1` |

```sh
python3 -m backend.agentdata.schedule --list
python3 -m backend.agentdata.schedule --group after_close --dry-run   # print the plan and each step's time limit, run nothing
python3 -m backend.agentdata.schedule --group hourly
```

Each step has a time limit (`STEP_TIMEOUT_SECONDS` in `schedule.py`, else the group's `TIMEOUT_SECONDS`); a step that hits it fails alone and the group goes on. When a group had to queue behind another, the journal says so and for how long.

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

### Steady calls

`backend/call_stability.py` keeps whatever produced the day's call (the brief's directive, or the engine when it is on) from flip-flopping. The day's call is a vote; a day written without a price abstains. The call we show moves one step at a time (Buy more to Keep, Sell some to Keep, Keep to either) once the vote has pointed the new way for 4 trading days in a row and the call has stood 12 trading days. A hard reason skips both waits and may jump straight between Buy more and Sell some once the vote agrees two days running: a results report or another item 2.02 8-K (from `tm_earnings_history`, counted from the first session that could react; `tm_earnings_day` adds raised/cut guidance when it has run), a move of the stock's own beyond 4 of its usual daily swings against SPY (over 1 day, or 5 days x sqrt 5) in the same direction as the change, or SPY down 4% in 5 sessions (that one only lowers a call). Each event moves the call once, a move or sell-off that lasts several days is one event, and inside the 12-day hold only a report can take back the last change, one step, after 3 agreeing days. Levels move only when the new one is at least 3% (or one weekly swing) away, or the call changes. Every change stores its reason in plain words, and "what would change it" is written from the same rule. Chosen on the stored history (Jun 24 to Nov 10, 2026) for flip and reversal rates, not returns: we have no evidence that any of these calls beats another.

`CALL_STABILITY_MODE`:

- `off` (default): nothing is read or written;
- `shadow`: the brief keeps its call and gains `call_stability`; the state goes to `tm_call_stability/{id}` (with a `rev` checked on every write) and one row per trading day to `tm_call_stability_history/{id}/calls/{day}`. A failure is logged as an error and never touches the brief;
- `on`: the steady call is published as `directive_v2` (with `stability`, `raw_stance`), and `tm_directive_history` rows gain `raw_stance` and `stability_*` fields. The state is saved before the brief is published; if it cannot be saved the job stops (`CallStabilityError`) and yesterday's briefs stay up.

`python -m backend.scripts.replay_call_stability` replays `tm_directive_history` through the rule with the same report reads as the pipeline and prints raw vs steady flip rates (read-only; `--since` to look at a later period only). Before switching to `on`, `--seed-current --write --overwrite` starts every stock from the call shown now, so nothing looks changed on the day of the switch. The ledger keeps one call per stock per day, so flips inside a day cannot be measured from it.

## adding a job

1. Write it as a module under `backend/agentdata/` (standard library only, `requests` only if you must) with a `main()` and an `if __name__ == "__main__"` guard. Read config from the environment, write through `DocStore.from_env()`, and make a re-run safe: same input, same documents.
2. Give it a `--dry-run` or a small `--limit`/`--days` so it can be tried locally.
3. Add a test in `backend/tests/test_agentdata_<name>.py` that runs it on fixtures, never the network.
4. Add it to a group in `backend/agentdata/schedule.py` (and its docstring), or add a new group with a matching `tikrr-agentdata-<group>.{service,timer}` pair in `backend/vps/units/`.
5. Name the collection after what it holds (`tm_<thing>`), document its shape at the top of the module, and read it from a loader in `lib/` (never from a component).
6. Respect the provider's terms and rate limits, and identify the client where asked.
