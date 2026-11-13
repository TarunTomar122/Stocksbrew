# Ops audit: jobs and services on the stocksbrew VPS

Written 2026-11-13. Measured window: 2026-11-06 07:00 to 2026-11-13 07:00 UTC unless a line says otherwise. Everything here was read-only: nothing was started, stopped, edited or created on the VPS. Schedules were not changed; the owner decides.

## The box right now (2026-11-13, about 08:00 UTC)

- 4 cores, 7.7 GB RAM (`free -m` at 07:56): 3.4 GB used, 4.1 GB page cache, 650 MB free, 4.3 GB available.
- Swap: 2.9 of 4 GB used. About 2.5 GB of it belongs to Firecrawl's containers (node workers 190-270 MB each, fdbserver 180 MB, rabbitmq 90 MB).
- CPU is not the limit: load average 0.6-0.9, 52-81% idle in `vmstat`. Pressure stall averages over 5 minutes: memory 1.6% some, CPU 3.9% some, IO 9.4% some / 7.7% full. IO is the tightest resource.
- Disks: `/` is 84% full (60 of 72 GB, 13 GB free). `/srv/tikrr-data` (slow sdb) has 29 GB free.
- Kernel OOM kills in the window: `needrestart` (run by `apt-daily-upgrade`) grew to 3.9-4.5 GB and was killed three times on Nov 12 and once on Nov 13. That is why `apt-daily-upgrade.service` shows as failed.

## Top recommendations

Ranked by what they free per unit of risk. CPU numbers are CPU-hours per day (CPU-h/day). The whole box has 96 CPU-h/day; everything measured below adds up to about 17.

1. **Retire self-hosted Firecrawl and extract with trafilatura alone.** Frees about 7.2 CPU-h/day, 1.2-1.8 GB of RAM (process RSS vs cgroup memory) and about 2.5 GB of swap, plus a steady disk churn (FoundationDB alone has read 2.35 TB since Aug 26). In 7 days tikrr made 1,141 Firecrawl extract calls and 165 (14%) came back usable; the 20-URL test below gave trafilatura 12 usable articles and Firecrawl 6, with only 1 article that Firecrawl got and trafilatura did not. Firecrawl search is failing anyway: 876 of 955 searches since Nov 9 errored (DuckDuckGo anti-bot block or timeout), including at least 98 of tikrr's anomaly-reason searches. Risk: the trace project also uses it (about three quarters of the scrapes and all the other searches), so this is a decision for both projects; tikrr loses some Seeking Alpha news stubs, and anomaly reasons and research themes need a different search source (or none, which is the de facto state today).
2. **Turn off `tikrr-radar-alerts.timer`.** Since Nov 11 every run (195 of 195) prints "MAIL_V2_ACTIVE=1: old-design alert emails are off; skipping". Before that, 278 runs checked the same 5 manual alerts and sent 0. It runs every 15 minutes round the clock on weekdays (480 runs a week) and failed 7 times on "database is locked", fighting real writers for the SQLite lock. Saves about 0.05 CPU-h/day, 480 process starts and 7 lock fights a week. Risk: none found; `tikrr-mail-alerts` sends alerts now. Note for this and every schedule change below: `backend/vps/install-systemd.sh` writes these timers and runs `systemctl enable --now` on all of them, so a change made only on the box is undone by the next install; change the installer (or `backend/vps/units/`) too.
3. **Slow `tikrr-fund-requests` from every 2 minutes to every 10-15 (or fold it into `stock-requests`).** It is the most CPU-hungry tikrr job per day (about 0.39 CPU-h/day) and did nothing in all 481 runs since it was enabled on Nov 12. It shares the `stock_requests` queue with stock requests, and that queue holds no pending fund request (its 329 documents are 291 fulfilled, 29 ignored, 7 needs_confirmation and 2 stock tickers stuck on retry). Each empty poll is a 2-second Python start that reads the queue. Saves about 0.3 CPU-h/day and about 600 process starts a day. Risk: a requested fund waits up to 10-15 minutes instead of 2.
4. **Make the two other request pollers do less when idle.** `on-demand-news` (every 5 min, all week) found an empty queue in 2,002 of 2,016 runs; only 3 runs did work in 7 days, and 11 failed on "database is locked". Since today's deploy, empty runs still revalidate `/briefing` and `/news` (`kinds=news symbols=0`, at most every 10 minutes), so about 144 times a day both pages are rebuilt for nothing. Skip the refresh when nothing was processed, and poll every 15 minutes from 20:00 to 06:00 ET and all weekend: about 800 fewer Python starts a week, about 0.1 CPU-h/day. Separately, `stock-requests` (every 30 min, all week) spent 333 of 336 runs retrying the same two tickers Yahoo cannot quote, CTRA and CWEN-A (331 failures each); a retry cap or a 24-hour back-off ends that. Risk: low; on-demand news queued at night waits up to 15 minutes.
5. **Disk hygiene on `/` (frees about 5 GB on the nearly full system disk).** Delete `/var/lib/tikrr/localdb/documents.sqlite3.bak-20260919T095622Z` (1.4 GB; a second copy sits in `/srv/tikrr-data/localdb.on-slow-disk-20261113`), cap the journal (4.1 GB in `/var/log/journal`; `SystemMaxUse=1G` frees about 3 GB), and remove `/opt/tikrr.pre-git-20260704T031012Z` (349 MB) and `/opt/tikrr-agentdata` (289 MB, an old checkout dated Nov 10; the after-close run that day failed reading a file from it, and no unit or env file refers to it now). On sdb, once the new database has run a week: `/srv/tikrr-data/localdb.on-slow-disk-20261113` (5.5 GB), `/srv/tikrr-data/backups` (1.6 GB of Sep 2 import snapshots) and `/srv/tikrr-data/migrations` (1.8 GB Sep 2 export). Keep one recent off-box backup first. Risk: low once a verified backup of the live database exists.

Next in line:

6. **Jobs whose output nothing reads.** Three whole lanes write only unread collections: `contrarian-calls` (open and close, `tm_contrarian_calls`), `market-events` (open and close, `tm_market_events`) and `data-health` (open and close, `tm_data_health`). `market-discovery` builds four collections and only `tm_heat_list` is read, and only by the agent API. `weekly-email` is a full no-op under `MAIL_V2_ACTIVE=1`. Turning off the three unread lanes saves about 30 runs a week and six SQLite write bursts a day in the 10:30-10:50 and 16:30-18:40 ET windows; the CPU saving is tiny (about 0.005 CPU-h/day). Risk: none for users today; `tm_contrarian_calls` and `tm_market_events` may have been meant for features that were never wired (check before deleting the code). Full list in "Collections written but never read".
7. **`agentdata-frequent` at night and on weekends.** It runs at :07 and :37 round the clock (48 runs a day, median 5.8 min wall, 14 CPU-s). The news step reads about 800 Yahoo per-ticker feeds every run (about 38,000 feed requests a day) to find about 65 new headlines. Hourly from 20:00 to 06:00 ET and on weekends halves the night and weekend runs (about 0.05 CPU-h/day and about 11,000 fewer feed requests a day on average). Also: the markets step's `pc-spx (cboe)` source failed on all 140 runs ("no recent put/call ratio"); fix or drop it. Risk: overnight headlines land up to 30 minutes later.
8. **Two price pulls after every close.** `postclose` (16:10 ET) runs a 500-stock Yahoo price batch (`price_batch` stage, median 253 s) and `agentdata-after-close` (17:30 ET) pulls Yahoo daily bars again for about 550 series (`prices`, median 372 s), and `dividend history` asks the same chart endpoint about 800 times more (median 429 s). One fetch writing both `tm_latest_prices` and `tm_price_history_daily` (dividends come in the same chart response) saves about 10-13 minutes of Yahoo traffic a day. Risk: medium; it touches the price contract both pipelines rely on.
9. **The 09:30 open price batch fails its coverage floor most days.** `open-price` failed its first attempt on 4 of 5 days ("price coverage 94.5% / 95.0% / 95.8% is below the 96% publish floor", Yahoo timeouts at the bell) and only published on the retry. The 09:50 `open-movers-price` runs the same 500-stock batch 20 minutes later. Either drop the 09:30 run or lower its floor; saves 1-2 price batches a day (about 0.05 CPU-h/day) and the failure noise. Similarly `midday-movers-price` (12:30, 14:30) runs a full price batch 30 minutes after the hourly batch it could reuse. Risk: the dashboard shows the 09:30 tape 20 minutes later.
10. **`earnings-day` every 10 minutes from 06:02 to 20:52 ET.** 90 runs a weekday; half of them (34 of 67) first waited for the shared agentdata lock (median 72 s, worst 19 min). Every 10 minutes in the release windows (06:00-09:40 and 16:00-18:30 ET) and every 30 minutes in between cuts about 40% of runs. Risk: a rare midday release shows up to 30 minutes later.
11. **`mail-alerts` every 15 minutes, 24/7.** 195 runs since Nov 11, 2 sent anything. Market hours plus one post-close and one pre-market run would keep the alerts and drop about 70% of runs (about 0.1 CPU-h/day). Risk: an alert based on an after-hours print waits for the next run.
12. **The stock-page serving docs are built but not read.** The new `serving docs` step (in frequent, hourly and after-close since today 08:11 UTC) writes `tm_serve_stock`, which the web reads only when `SERVE_DOCS=1`, and that is not set in `/etc/tikrr/web.env` (checked by name, value not printed). Either switch the flag on or keep the step out of the schedule until it is. Cost today is small (7 s per run) but grows with the 20-minute after-close budget.
13. **SQLite lock fights.** 69 "database is locked" errors in the news-prep lanes (preopen-news failed every retry on Nov 6 and Nov 9), 11 on-demand-news runs, 7 radar-alerts runs and 1 frequent run. Fewer pollers (items 2-4) is the cheapest fix; moving polling jobs from direct file access (`LOCALDB_PATH`) to the HTTP service would serialise writes in one place.
14. **Failed units right now.** (Not failing now but worth knowing: `tikrr-localdb` stopped or restarted 11 times in the window, all during the Nov 10-13 database move; on Nov 13 06:30 UTC it failed 5 starts in a row with "unable to open database file" before coming up.) `apt-daily-upgrade` (the needrestart OOM above; consider `needrestart -b` or disabling its auto-run), `dnsmasq` (failed at boot on Aug 26 and never ran since; if nothing needs it, disable it), and two transient `run-*` units from manual runs on Nov 11 (`systemctl reset-failed` clears them).

## Totals: who uses the box (CPU-h per day, memory now)

| What | CPU-h/day | RAM now | Swap now | How measured |
|---|---|---|---|---|
| tikrr timers and chained jobs (44 timers plus 5 chained services) | 1.1 averaged over the 7 days; about 2 at today's schedule (jobs installed this week projected from the days they ran) | 0 between runs; peaks 2.6 GB (market-discovery), 2.0 GB (after-close), 1.8 GB (postclose) | up to 0.4 GB during runs | 7 days of per-run "unit resources" journal entries |
| tikrr-web@3000 + @3001 | about 4.1 | 260 + 258 MB (peaks about 460 MB each) | under 1 MB | one 3-minute sample at 08:01 UTC, day one on the VPS, about 80 requests a minute through Caddy; low confidence |
| tikrr-localdb | 0.48 (7 days, before the web moved here); 0.85 in today's sample | 608 MB (peaks 1.5 GB) | 0 in the cgroup; 118 MB of process swap a few minutes later | journal runs plus `systemctl show`, sample |
| Varnish + Caddy | about 0.15 | 158 MB + 46 MB RSS | 13 MB + 3 MB | sample |
| **Firecrawl** (6 containers) | **about 7.2** | **1.82 GB** (cgroup, includes some page cache) | **2.46 GB** | container lifetime CPU divided by uptime, checked against the sample (30% of one core) |
| **trace project** | **about 2.25** | trace-localdb 287 MB (peak 1.6 GB this week); trace-pipeline peaks about 400 MiB every 20 min | 0.2-0.3 GB | 7 days of journal entries for the user units and trace-localdb |
| Other (tailscaled, containerd, dockerd, journald) | about 0.6 | about 0.4 GB | small | `systemctl show` lifetime averages |

Firecrawl per container (CPU-h/day from lifetime CPU over uptime; memory and swap from the cgroup now):

| Container | CPU-h/day | Memory | Swap | Notes |
|---|---|---|---|---|
| firecrawl-rabbitmq-1 | 4.9 | 222 MB | 118 MB | 23% of one core while idle; the biggest single CPU user on the box |
| firecrawl-api-1 (api + nuq workers) | 0.57 (0.73 for the instance before Nov 10) | 1,013 MB | 2,058 MB | memory limit 3 GB; Docker restarted it 6 times Nov 10 21:30-21:40 (and 3 times Nov 2) after exit code 1 |
| firecrawl-playwright-service-1 | 0.76 | 255 MB | 0 | restarted today 06:32 after 79 days, that run peaked at 1.9 GiB + 1.3 GiB swap |
| firecrawl-foundationdb-1 | 0.54 | 168 MB | 183 MB | 2.35 TB read from disk since Aug 26 (about 30 GB a day) |
| firecrawl-nuq-postgres-1 | 0.26 | 144 MB | 102 MB | 319 GB read, 175 GB written since Aug 26 |
| firecrawl-redis-1 | 0.08 | 18 MB | 4 MB | |

trace project per unit, 7 days: `trace-pipeline` (every 20 min) 501 runs, 11.8 CPU-h, median 5.9 min wall, peak 403 MiB; `trace-welcome` (every 5 min) 2,016 runs, 1.4 CPU-h; `trace-sponsor-welcome` (every 10 min) 1,008 runs, 0.6 CPU-h; `trace-pulse` 0.24; `trace-localdb` about 1.5; the rest under 0.1 each. Its database (1.1 GB) and its backups (8.2 GB) sit on the slow sdb disk.

## Every tikrr job

Times are New York unless marked UTC. "Runs" counts finished attempts, so a unit with `Restart=on-failure` counts each retry. Wall and CPU come from systemd's per-run accounting. IO per unit is not available: IO accounting is off for these units (the journal entries carry no IO fields). "Fails" counts attempts that ended in failure. Collections and readers come from reading the code; "web" means app/, lib/ or components/.

### Polling jobs

| Job | Schedule | Runs 7d | Median / p95 wall | Median CPU s | CPU-h 7d | Peak mem / swap MiB | Fails | Writes, and who reads it |
|---|---|---|---|---|---|---|---|---|
| on-demand-news | every 5 min, 24/7 | 2,016 | 4 s / 16 s | 3.2 | 1.79 | 313 / 4 | 11 (0.5%), all "database is locked" | Queue `tm_on_demand_news_jobs` (enqueued by watchlist, coverage, import and radar routes). Writes news articles, enrichments and `stock_intelligence` (stock page, watchlist) and `tm_pipeline_metrics` (unread). 2,002 runs found the queue empty |
| stock-requests | every 30 min, 24/7 | 336 | 24 s / 65 s | 4.6 | 0.42 | 240 / 8 | 6 (2%) | Queue `stock_requests` (stock-request modal, import, fund page). Writes `tm_instruments`, `tm_latest_prices`, `tm_search_index`, `tm_stock_facts` (read widely) and `tm_fundamental_snapshots` (unread). 333 runs only retried CTRA and CWEN-A |
| fund-requests | every 2 min, 24/7 (since Nov 12 14:58 UTC) | 481 | 2 s / 4 s | 2.0 | 0.26 | 226 / 0 | 0 | Same `stock_requests` queue (fund requests only). Writes `tm_instruments`, `tm_fund_facts`, `tm_fund_meta`, prices, `tm_etf_holdings` (fund pages, x-ray). 0 fund requests in 481 runs |
| radar-alerts | every 15 min, round the clock, Mon-Fri UTC | 480 | 4 s / 22 s | 2.3 | 0.31 | 192 / 0 | 7 (1.5%), "database is locked" | Old alert email. A no-op since Nov 11 (`MAIL_V2_ACTIVE=1`); before that 0 alerts sent |
| mail-alerts | every 15 min, 24/7 (since Nov 11) | 195 | 8 s / 16 s | 5.7 | 0.31 | 53 / 1 | 0 | Sends price/level alert emails; writes `tm_email_sends`, updates `tm_alerts`. 2 runs sent mail |
| mail-lifecycle | hourly at :20, 24/7 (since Nov 11) | 49 | 6 s / 15 s | 5.0 | 0.07 | 51 / 0 | 0 | Welcome and win-back emails; 5 runs sent mail |
| agentdata-earnings-day | every 10 min 06:02-20:52, weekdays (since Nov 12) | 67 | 42 s / 6.0 min | 3.4 | 0.06 | 153 / 0 | 0 | `tm_earnings_day` (results page, `lib/earnings-day.ts`). 34 runs waited for the agentdata lock first |

### Agent data groups (`run-agentdata.sh`, installed Nov 10)

| Job | Schedule | Runs 7d | Median / p95 wall | Median CPU s | CPU-h 7d | Peak mem / swap MiB | Fails | Writes, and who reads it |
|---|---|---|---|---|---|---|---|---|
| agentdata-frequent | :07 and :37, 24/7 | 140 | 5.8 min / 10.8 min | 14.0 | 0.55 | 278 / 17 | 3 (2%) | `tm_agent_news` (news, wire, Ask, email), `tm_agent_news_tone` (wire, stock report), market collections (`lib/markets.ts`), since today `tm_serve_stock` (read only when `SERVE_DOCS=1`, which is off) |
| agentdata-hourly | :20, 24/7 | 70 | 3.4 min / 15.9 min | 15.5 | 0.32 | 381 / 0 | 2 (3%) | `tm_agent_filings` (filings, research, earnings season), `tm_insider_trades` (follow, ownership), `tm_agent_calendar` (calendar, dividend plan), serving docs |
| agentdata-after-close | 17:30 weekdays | 5 | 21.6 min / 1.6 h | 108 | 0.13 | 2,048 / 348 | 3 (60%), all on install night (Nov 10 ET): the scheduled run read a file from the stale `/opt/tikrr-agentdata` checkout, then two manual reruns hit the 90-min limit and the missing Firebase variable. Clean on Nov 11 and Nov 12 | `tm_price_history_daily` (about 25 web files, email), strategies (`lib/strategies*`), `tm_earnings_events`, `tm_earnings_history`, `tm_agent_earnings_reactions`, `tm_dividend_history`, `tm_screener_snapshot`, `tm_agent_runs`, `tm_thesis_checks`, `tm_filing_changes`, `tm_agent_thesis_checks`, serving docs. All read |
| agentdata-weekly | Sun 06:00 UTC | 0 (first run Nov 15) | | | | | | 13F, fund holders, House trades, fund facts, ETF holdings, logos, geo database. Unread: `tm_fund_filings`, `tm_stock_logos_meta` |
| agentdata-extended-hours | weekdays 16:05-19:50 every 15 min, 20:05, 07:35, 08:35, 09:20 | 0 (enabled today 07:35 UTC) | | | | | | `tm_extended_quotes` (stock page, inbox, results) |

Per step (from the `[group] ok ... in Ns` lines; the agentdata groups only exist since Nov 10):

| Group | Step | Runs | Median s | p95 s | Total min in window | Fails |
|---|---|---|---|---|---|---|
| frequent | news | 140 | 262 | 299 | 615 | 1 |
| frequent | news tone | 108 | 14 | 36 | 27 | 0 |
| frequent | markets | 140 | 51 | 317 | 286 | 0 (but its `pc-spx (cboe)` source failed all 140 times) |
| frequent | serving docs | 1 (today) | 7 | | | 0 |
| hourly | sec filings | 70 | 167 | 191 | 199 | 0 |
| hourly | insider trades | 70 | 23 | 705 | 164 | 0 |
| hourly | calendar events | 70 | 4 | 120 | 40 | 0 |
| after_close | prices | 2 | 372 | 425 | 12 | 0 |
| after_close | strategies | 2 | 27 | 30 | 1 | 0 |
| after_close | prices and strategies (old single step, before Nov 11) | 3 | 3,929 | 5,412 | 156 | 2 (one hit the 90-min limit) |
| after_close | earnings calendar | 5 | 201 | 239 | 14 | 0 |
| after_close | earnings history | 2 | 185 | 196 | 6 | 0 |
| after_close | earnings reactions | 5 | 4 | 83 | 3 | 0 |
| after_close | dividend history | 2 | 429 | 441 | 14 | 0 |
| after_close | screener snapshot | 5 | 67 | 80 | 5 | 0 |
| after_close | standing agents | 4 | 3 | 25 | 1 | 2 ("Set FIREBASE_SERVICE_ACCOUNT_JSON or ..._PATH", Nov 10-11) |
| after_close | reason checks | 2 | 5 | 6 | 0 | 0 |
| earnings_day | earnings day reports | 67 | 26 | 39 | 30 | 0 |

`filing changes` and `thesis checks` were added to after_close after the window and have no timings yet.

Lock waits: 34 `earnings_day` runs and 3 `frequent` runs waited for another group (median 72 s, worst 19 min for earnings_day; about 14.6 min for frequent).

### Market-day pipeline (orchestrator lanes via `run-dispatch.sh`)

| Job | Schedule | Runs 7d | Median / p95 wall | Median CPU s | CPU-h 7d | Peak mem / swap MiB | Fails | Writes, and who reads it |
|---|---|---|---|---|---|---|---|---|
| premarket | 07:30 weekdays | 5 | 1.9 min / 5.8 min | 24.5 | 0.03 | 1,370 / 0 | 0 | `tm_premarket_movers` (premarket page, email), `tm_premarket_opening` (premarket page), `tm_premarket_context` (next step only). Its email step skips under `MAIL_V2_ACTIVE=1` |
| radar-official-open / -close | 08:35 / 17:10 weekdays | 5 / 5 | 1.6 / 2.0 min | 5.5 / 5.3 | 0.01 / 0.01 | 154 / 0 | 0 | `tm_radar_evidence` (read by radar-materialize only), SEC submissions and IR pages |
| preopen-news | 08:45 weekdays | 13 | 11.2 min / 13.2 min | 49.5 | 0.19 | 728 / 263 | 10 attempts; Nov 6 and Nov 9 failed all 5 attempts (`build_per_stock_intelligence` exited non-zero, with "database is locked" errors in the same runs); fine since Nov 10 | News articles, enrichments, `stock_intelligence`, `tm_stock_page_views`, `tm_call_stability` (stock page, watchlist, proposals); `tm_call_stability_history` unread |
| preclose-news | 15:40 weekdays | 10 | 11.9 min / 15.1 min | 55.4 | 0.20 | 928 / 116 | 6 attempts; Nov 9 failed all 5 | same as preopen-news |
| reddit-buzz | 08:20, 11:20, 14:20, 17:20 weekdays | 21 | 37 s / 51 s | 8.1 | 0.05 | 256 / 0 | 0 | `reddit_snapshots`, `reddit_post_cache`, `reddit_ticker_contexts` (signals, Reddit cues, watchlist) |
| open-price | 09:30 weekdays | 10 | 6.8 min / 9.5 min | 122.9 | 0.34 | 914 / 7 | 5 attempts: first attempt failed the 96% coverage floor on 4 of 5 days | `tm_latest_prices`, dashboard and home views (read widely); `tm_fundamental_snapshots` unread |
| radar-materialize-open / -close | 09:43 / 17:45 weekdays | 5 / 5 | 9.9 / 6.2 min | 6.3 / 6.0 | 0.01 / 0.01 | 229 / 7 | 0 | `tm_radar_user_views`, `tm_radar_stock_state` (watchlist); `tm_radar_inbox` and `tm_radar_events` unread |
| open-movers-price | 09:50 weekdays, then OnSuccess open-anomalies + open-briefs | 5 | 5.9 min / 7.9 min | 125.1 | 0.17 | 1,068 / 0 | 1 (Nov 11, retried fine) | same as open-price |
| open-anomalies (chained) | after open-movers-price | 5 | 1.7 min / 25.5 min | 11.9 | 0.02 | 651 / 0 | 0 | `tm_daily_anomalies`, `tm_daily_anomaly_tickers` (movers, agent jobs, memo, stock page); its web search for reasons uses Firecrawl search; at least 98 of those queries failed |
| open-briefs (chained) | after open-movers-price | 7 | 12.9 min / 28.0 min | 204 | 0.38 | 1,493 / 158 | 2 attempts (Nov 9, "Brief synthesis incomplete" for XOM, MDT) | briefs: `stock_intelligence`, `tm_stock_page_views`, `tm_directive_history` (stock page, inbox, email) |
| intraday-price-hourly | 10:00-15:00 hourly, weekdays | 30 | 5.5 min / 7.4 min | 122.9 | 1.02 | 1,014 / 95 | 1 (3%) | same as open-price. Over the 7 days, second only to on-demand-news in total tikrr CPU |
| midday-movers-price | 12:30, 14:30 weekdays, then OnSuccess midday-anomalies (since Nov 12) | 2 | 5.1 min / 5.5 min | 137.6 | 0.08 | 764 / 0 | 0 | same as open-price, 30 min after an hourly batch |
| midday-anomalies (chained) | after midday-movers-price | 2 | 64 s / 70 s | 11.2 | 0.01 | 451 / 0 | 0 | `tm_daily_anomalies` |
| market-discovery-open / -close | 10:30 / 17:00 weekdays | 5 / 5 | 6.2 / 13.7 min | 54.5 / 57.3 | 0.08 / 0.08 | 2,630 / 395 | 0 | `tm_heat_list` (agent API only), `tm_mention_stats` (watchlist); `tm_interesting_stocks`, `tm_divergence`, `tm_sentiment_flip` unread |
| contrarian-calls-open / -close | 10:35 / 16:30 weekdays | 5 / 5 | 44 s / 27 s | 6.7 / 6.4 | 0.01 / 0.01 | 572 / 0 | 1 (close) | `tm_contrarian_calls`: unread |
| market-events-open / -close | 10:40 / 18:30 weekdays | 5 / 5 | 2 s / 9 s | 1.6 / 2.1 | 0.00 / 0.00 | 148 / 0 | 0 | `tm_market_events`: unread |
| data-health-open / -close | 10:50 / 18:40 weekdays | 5 / 5 | 1.9 min / 76 s | 4.6 / 3.9 | 0.01 / 0.01 | 543 / 0 | 0 | `tm_data_health`: unread |
| postclose | 16:10 weekdays, then OnSuccess close-briefs | 5 | 19.1 min / 25.3 min | 220.5 | 0.31 | 1,793 / 382 | 0 | prices, technicals (`lib/technicals.ts`), thematic screens, sector regimes, user alert flags, views, search index, watchlist views and lifecycle events (all read); `tm_market_breadth`, `tm_snapshots` unread |
| close-briefs (chained) | after postclose, then OnSuccess close-anomalies | 5 | 8.8 min / 16.2 min | 201.4 | 0.28 | 1,574 / 102 | 0 | briefs (as open-briefs) |
| close-anomalies (chained) | after close-briefs | 5 | 1.7 min / 3.1 min | 11.0 | 0.02 | 607 / 0 | 0 | `tm_daily_anomalies` |
| earnings-intel | 18:00 weekdays | 5 | 33.7 min / 35.2 min | 172.6 | 0.17 | 1,358 / 11 | 1 (Nov 10) | `tm_earnings_events`, `tm_earnings_intel` (earnings, calendar, stock page), metrics history (basket agent) |
| pre-earnings-intel | 18:45 weekdays | 5 | 3.8 min / 13.0 min | 25.0 | 0.05 | 1,164 / 0 | 0 | `tm_pre_earnings_intel` (calendar, stock page) |
| radar-outcomes | 19:00 weekdays | 5 | 4 s / 10 s | 2.0 | 0.00 | 99 / 0 | 0 | `outcomes` on `tm_directive_history` calls (email only) |

`postclose` stage timings (median of 5 runs, seconds): price batch 253, watchlists 298, snapshot 228 (its output is unread), technicals 112, sector regimes 94, materialize views 61, user alert flags 14, thematic screens 8, prune overrides 6, materialize search 6, market breadth 4 (unread), sector benchmarks 1. Total 1,137 s. Dropping `build_snapshot` and `build_market_breadth` would save about 4 minutes a night. No other lane prints stage timings.

### Daily and weekly jobs

| Job | Schedule | Runs 7d | Median / p95 wall | Median CPU s | CPU-h 7d | Peak mem / swap MiB | Fails | Writes, and who reads it |
|---|---|---|---|---|---|---|---|---|
| trump-logic | 12:30 UTC daily, incl. weekends | 7 | 20 s / 28 s | 2.4 | 0.00 | 136 / 0 | 0 | `trump_logic_snapshots` (signals page) |
| power-trades | 05:10 UTC daily | 7 | under 1 min (6 runs); the failed run 4.8 min | 1.3 (failed run only) | 0.00 | 25 / 0 | 1 (Nov 10) | `tm_power_trades` (power trades, stock events, memo); `tm_power_trades_meta` unread; its alert step skips under `MAIL_V2_ACTIVE=1` |
| mail-daily | 08:30 weekdays (since Nov 11) | 2 | 79 s / 83 s | 17.0 | 0.01 | 102 / 0 | 0 | daily email |
| mail-weekly | Sat 09:00 | 0 (first run Nov 14) | | | | | | weekly email |
| weekly-email (old) | Sat 04:30 UTC | 1 | 53 s | 9.3 | 0.00 | 325 / 0 | 0 | now a full no-op under `MAIL_V2_ACTIVE=1`, including `build_weekly_movers` |
| business-questions | Sat 02:00 UTC | 1 | 19 s | 4.1 | 0.00 | 185 / 0 | 0 | `business_questions` (stock page) |
| stock-facts | Sun 08:00 UTC | 1 | 2.6 h | 574 | 0.16 | 929 / 0 | 0 | `tm_stock_facts`, metrics history, `tm_stock_intel_pro` (stock page, watchlist, portfolio) |
| research-themes | Sun 10:00 | 1 | 4.2 min | 2.9 | 0.00 | 124 / 0 | 0 | `tm_config/research_themes` (research themes, screener); uses Firecrawl search |
| zone-briefs | retired; ran 3 times, last on Nov 10 | 3 | 12.2 min / 18.3 min | 21.6 | 0.02 | 398 / 49 | 1 | |

Deployed units match `backend/vps/install-systemd.sh`, `backend/vps/units/` and `backend/vps/install-mail-timers.sh` (checked with `systemctl cat` on every `tikrr-*` unit). `/opt/tikrr` was at `a682ec33` when the units were read (07:56 UTC) and at `9c01920e` (the laptop's `main`, which adds the serving-docs step) from about 08:01 UTC. The repo also has new, untracked `tikrr-localdb-backup` and `tikrr-ops-health` units that are not deployed. Units with no timer still on disk: `tikrr-market-daily.service` (kept on purpose for a relaunch), `tikrr-newsletter-email.service` and `tikrr-open-email.service`.

## Collections written but never read

Readers checked: app/, lib/, components/, backend/mail and the other jobs. A job reading its own output, `audit_data_health.py` and account deletion do not count.

- `tm_contrarian_calls` (contrarian-calls, the whole lane)
- `tm_market_events` (market-events, the whole lane)
- `tm_data_health` (data-health, the whole lane)
- `tm_interesting_stocks`, `tm_divergence`, `tm_sentiment_flip` (market-discovery and open-anomalies)
- `tm_fundamental_snapshots` (every price lane, earnings-intel, stock-requests)
- `tm_market_breadth`, `tm_snapshots` and `tm_config/latest_snapshots` (postclose)
- `tm_call_stability_history` (brief lanes)
- `tm_radar_inbox`, `tm_radar_events` (radar-materialize)
- `tm_pipeline_metrics` (on-demand-news)
- `tm_power_trades_meta` (power-trades)
- `tm_fund_filings`, `tm_stock_logos_meta` (agentdata-weekly)
- `tm_weekly_movers` (old weekly email, not built any more)
- Read only by the uncommitted `backend/ops/health.py` freshness monitor: `tm_agent_news_meta`, `tm_agent_calendar_meta`, `tm_dividend_history_meta`
- Read by the agent API only, no page: `tm_heat_list`, `tm_heat_list_view`. Read by email only: radar-outcomes' `outcomes` field. Read by the web only when `SERVE_DOCS=1` (off): `tm_serve_stock`

## Duplicate external fetches

- **Yahoo daily bars:** `sync_price_snapshots` (yfinance; every price lane, postclose, earnings-intel), `agentdata/prices.py` (after-close), `agentdata/dividend_history.py` (same chart endpoint, about 800 requests), `process_fund_requests.py`.
- **Yahoo quotes:** the price lanes (yfinance), `agentdata/extended_hours.py` (its 07:35, 08:35 and 09:20 runs fetch the same pre-market quotes as `build_premarket_movers.py` at 07:30), `premarket_sentiment.py`, `agentdata/markets.py` (every 30 min), `process_stock_requests.py`.
- **Yahoo fundamentals:** `sync_stock_facts` and `sync_stock_metrics` run in stock-facts weekly and again for reporters in earnings-intel; also `fund_facts`, `earnings_actuals`, `earnings_day`.
- **Yahoo 5-minute bars:** `earnings_day.py` (query1) and `extended_hours.py` (query2) for the same reporters.
- **Yahoo per-ticker headline RSS:** `agentdata/news_feed.py` (every 30 min, about 800 feeds) and the news pipeline used by preopen/preclose news, briefs and on-demand news.
- **SEC submissions per company:** `sec_filings` (hourly), `insiders_form4` (hourly), `earnings_history` (after close), `run-filing-changes.ts` (after close), `earnings_day` (every 10 min), `radar_official_sources` (twice a day). `company_tickers.json` is downloaded separately by five of them. A shared, hourly-refreshed submissions cache would cut SEC traffic to one request per company per hour.
- **Finnhub company news:** `build_per_stock_intelligence`, `research_daily_anomaly_reasons` and `build_premarket_context` fetch it separately.
- **Congress trades from two sources:** `power_trades.py` (bargo.ai) and `agentdata/house_ptr.py` (House clerk).

## Firecrawl vs trafilatura

How the code uses them. `backend/url_extractor.py` tries Firecrawl first when `EXTRACT_PROVIDER` is unset, `auto` or `firecrawl`, and falls back to trafilatura when Firecrawl fails or returns junk. The endpoint is `FIRECRAWL_API_URL` (default `http://127.0.0.1:3002/v1`), with optional `FIRECRAWL_API_KEY`; the VPS `backend.env` defines `EXTRACT_PROVIDER` and `FIRECRAWL_API_URL` (names checked, values not printed). Callers: `news_pipeline.py` (preopen/preclose news, briefs, on-demand news, earnings-intel), `llm_enrichment.py`, `curated_fetcher.py`, `context_search.py`, `radar_official_sources.py`, the paused `market_daily.py`. Firecrawl search (`search_firecrawl`) is used by `research_daily_anomaly_reasons.py` (mover reasons) and `refresh_research_themes.py`. The trace project calls the same instance (`/home/ubuntu/trace/backend/v3/build_trending.py`, `enrich_coverage.py`).

Production use, 7 days (from tikrr's `extract_call` log lines): Firecrawl 1,141 calls, 165 ok (14%), 507 too short, 395 fetch failed, 74 junk; mean logged time 29 s per call (batch calls log the whole batch time against each URL). Trafilatura 5,701 calls, 2,154 ok, 3,421 fetch failed (mostly publishers that answer 401/403), mean 0.38 s. Firecrawl's own log (Nov 9 21:11 to Nov 13): 3,091 scrapes, of which tikrr made about 800, so trace makes about three quarters; 955 searches, 876 errored (512 "DuckDuckGo: Blocked by anti-bot measures", the rest aborted or reset) and 98 "no results" lines were logged; at least 98 of the failures were tikrr's "why TICKER ..." mover-reason queries.

Test on 2026-11-13: the 20 newest `tm_agent_news` URLs spread over 11 publishers, each run through the production `_extract_trafilatura` and through Firecrawl `/scrape` (main content only) on the box, then judged by the production rules (`ok` needs a title, 60+ words and no consent/privacy junk). "Junk" in the Firecrawl column means the production rule rejected the text as consent or privacy boilerplate (`no_content`); "blocked" means the publisher answered 401/403 and little or no text came back; "Junk phrases" counts nav, subscribe and cookie phrases in the text; "lede similarity" compares the first 300 characters of both texts.

| Publisher | Trafilatura | Chars | Time | Firecrawl | Chars | Time | Junk phrases (FC) | Note |
|---|---|---|---|---|---|---|---|---|
| finance.yahoo.com | ok | 2,767 | 0.4 s | junk | 7,681 | 13.7 s | 12 | FC has the article plus nav and a privacy footer, so the production rule rejects it |
| finance.yahoo.com | ok | 2,733 | 0.4 s | junk | 7,954 | 10.1 s | 12 | same |
| finance.yahoo.com | ok | 2,696 | 0.4 s | junk | 6,655 | 9.4 s | 10 | same |
| finance.yahoo.com | ok | 2,650 | 0.4 s | junk | 5,775 | 11.5 s | 10 | same |
| seekingalpha.com (news) | too short (52 words) | 378 | 0.1 s | ok (271 words) | 1,855 | 2.8 s | 2 | the one article only Firecrawl got |
| seekingalpha.com (news) | too short | 263 | 0.2 s | blocked (403) | 128 | 1.8 s | 0 | neither |
| seekingalpha.com (news) | too short | 241 | 0.5 s | blocked (403) | 128 | 1.7 s | 0 | neither |
| cnbc.com | ok | 3,407 | 0.8 s | junk | 14,985 | 9.3 s | 60 | FC text is 3-4x longer, mostly page chrome |
| cnbc.com | ok | 5,530 | 1.2 s | junk | 17,240 | 7.9 s | 59 | same |
| prnewswire.com | ok | 3,720 | 0.2 s | ok | 4,561 | 8.3 s | 0 | same text (87% lede similarity) |
| prnewswire.com | ok | 2,078 | 0.1 s | ok | 3,206 | 5.9 s | 0 | same |
| prnewswire.com | ok | 6,431 | 0.1 s | ok | 7,221 | 5.1 s | 0 | same |
| investing.com | blocked (403) | 0 | 0.0 s | blocked (403) | 275 | 1.5 s | 0 | neither |
| investing.com | blocked (403) | 0 | 0.0 s | blocked (403) | 275 | 1.6 s | 0 | neither |
| stocktwits.com | blocked (403) | 0 | 0.1 s | junk | 46,344 | 14.6 s | 89 | FC rendered the page but it is mostly feed and nav |
| thestreet.com | blocked (403) | 0 | 0.0 s | blocked (403) | 0 | 0.8 s | 0 | neither |
| marketwatch.com | blocked (401, paywall) | 0 | 0.1 s | blocked (401) | 0 | 0.7 s | 0 | neither |
| fool.com | ok | 4,626 | 0.2 s | junk | 13,474 | 9.5 s | 29 | FC adds nav and promo blocks |
| 247wallst.com | ok | 5,162 | 0.2 s | ok | 12,396 | 6.4 s | 11 | FC passes the rule but starts with page chrome (lede similarity 3%) |
| tikr.com | ok | 5,689 | 0.2 s | ok | 7,623 | 1.8 s | 2 | similar |

Summary: trafilatura usable 12 of 20, Firecrawl 6 of 20; both 5, trafilatura only 7, Firecrawl only 1, neither 7. Titles matched the stored headline on every success for both. Where both returned the article, trafilatura's opening lines appear inside Firecrawl's text; on Yahoo, CNBC, Fool, 247wallst and tikr Firecrawl's text starts with page chrome instead of the lede, while on PR Newswire both start the same way. Median time per URL: trafilatura 0.2 s, Firecrawl 6.2 s (total 6 s vs 124 s for the 20). Paywalls and bot walls (Investing.com, TheStreet, MarketWatch, Seeking Alpha) block both.

**Verdict:** for tikrr, trafilatura alone can replace Firecrawl's scraping. The loss is about 1 article in 20 (short Seeking Alpha news items), and every Firecrawl attempt today adds seconds of latency for a 14% hit rate before the code falls back to trafilatura anyway. Firecrawl's search is not a reason to keep it: it fails 92% of the time. Mover reasons and research themes need another search source either way. Removing Firecrawl frees about 7.2 CPU-h/day, 1.2-1.8 GB of RAM and about 2.5 GB of swap, and most of the box's background disk churn. Because trace uses it more than tikrr does, the call is the owner's for both projects; a middle step is to set `EXTRACT_PROVIDER=trafilatura` for tikrr only, which removes tikrr's share of the load and latency without touching trace. That setting also turns off tikrr's Firecrawl search (`search_firecrawl` returns nothing when Firecrawl is disabled), so mover reasons and research themes lose web search; given the 92% failure rate they lose little.

## Method notes

Collection scripts ran over `ssh -o ClearAllForwardings=yes vps 'bash -s' < script` and wrote to stdout only; outputs are in the session scratchpad (`ops/audit/`). Commands used:

- Schedules: `systemctl list-timers --all`, `systemctl list-unit-files 'tikrr-*'`, `systemctl cat <unit>` for every `tikrr-*` unit (lines with token, secret, password or key filtered out).
- Per-run resources: `sudo journalctl --since "2026-11-06 07:00 UTC" --until "2026-11-13 07:00 UTC" -o json MESSAGE_ID=ae8f7b866b0347b9af31fe1c80b127c0 --output-fields=UNIT,USER_UNIT,CPU_USAGE_NSEC,MEMORY_PEAK,MEMORY_SWAP_PEAK,IO_METRIC_READ_BYTES,IO_METRIC_WRITE_BYTES,MESSAGE`. Wall time is parsed from the message ("over X wall clock time").
- Failures and retries: `sudo journalctl _PID=1 ... -o json` filtered to `tikrr-*`/`trace-*` units, counting "Failed with result", "Scheduled restart" and "Finished" per unit and day.
- Agentdata steps: `sudo journalctl -u tikrr-agentdata-* -o short-iso`, lines matching `[group] ok|FAILED ... in Ns` and the lock-wait lines.
- Orchestrator stage timings: the `"stage"` / `"elapsed_seconds"` JSON printed by each lane (only `postclose` prints them).
- What polling jobs did: `journalctl -u <unit> -o cat` counted for "queue empty", "processing=", "[fail]", "skipping", the `checked`/`sent` dicts and error lines.
- Long-running services: `systemctl show -p CPUUsageNSec,MemoryCurrent,MemoryPeak,MemorySwapCurrent,ActiveEnterTimestamp` for the web instances, localdb, trace-localdb, Varnish, Caddy, docker, containerd, `user@1000` and each `docker-*.scope`; a 180-second CPU delta sample of the same units at 08:01 UTC; `docker ps -a`, `docker stats --no-stream`, `docker compose ls`; `ps -eo rss,pcpu,...`; per-process `VmSwap`; `vmstat`; `/proc/pressure/*`.
- trace units: `sudo -u ubuntu XDG_RUNTIME_DIR=/run/user/1000 systemctl --user list-units --all` and `list-timers`, plus their `USER_UNIT` resource entries.
- Firecrawl traffic: `sudo docker logs --since 168h firecrawl-api-1` (it only reaches back to Nov 9 21:11), counted for scrapes, searches, errors and scraped hosts.
- Readers of each collection: a code search over app/, lib/, components/, backend/ and scripts/.
- Extraction test: 20 URLs from `SELECT data_json FROM documents WHERE parent_collection='tm_agent_news' AND json_extract(data_json,'$.published_at') >= '2026-11-11' ORDER BY json_extract(data_json,'$.published_at') DESC LIMIT 1500` (read-only URI, uses the `documents_parent_published` index), run with `/opt/tikrr/.venv` (trafilatura 2.1.0) and the production helpers in `backend/url_extractor.py`. Only metrics were kept, no article text.
- Flags: `EARNINGS_DAY_ENABLED` and `MAIL_V2_ACTIVE` are on in `backend.env`; `SERVE_DOCS=1` is not in `web.env`. Checked with `grep -q`, values never printed.

What could not be measured, and why:

- **IO per tikrr job.** IO accounting is off for these units, so the journal entries have no IO fields. Only the Docker scopes have IO numbers.
- **A full week for anything installed recently.** The agentdata groups started Nov 10, mail timers Nov 11, earnings-day and fund-requests Nov 12, extended-hours today (no runs yet), agentdata-weekly and mail-weekly have not run. Their per-day figures are projected from the days they did run.
- **The web instances' steady-state cost.** They moved to the VPS today; the 4.1 CPU-h/day comes from one 3-minute sample about 10 minutes after a deploy, so treat it as a rough upper bound until a few days of data exist.
- **Exact split of Firecrawl's cost between tikrr and trace.** Firecrawl does not tag callers; the split above comes from matching tikrr's own extract-call counts against Firecrawl's scrape counts and from the search query text.
- **Firecrawl's long-run per-day CPU** comes from lifetime CPU divided by container uptime (about 79 days for FoundationDB, Postgres, Redis and the old Playwright run; 56 for RabbitMQ; 2.4 for the API), not from a 7-day window; the 3-minute sample agreed (30% of one core, about 7.3 CPU-h/day).
- **Whether `stock-requests` retries ever succeed.** The two stuck tickers were still in `retry` on 2026-11-13 08:00 UTC; the history before Nov 6 was not checked.
