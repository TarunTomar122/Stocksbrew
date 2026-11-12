#!/usr/bin/env bash
set -euo pipefail

UNIT_DIR="${UNIT_DIR:-/etc/systemd/system}"
REPO_DIR="${TIKRR_REPO_DIR:-/opt/tikrr}"
USER_NAME="${TIKRR_USER:-ubuntu}"
ENV_FILE="${TIKRR_ENV_FILE:-/etc/tikrr/backend.env}"
STAMP_DIR="${TIMER_STAMP_DIR:-/var/lib/systemd/timers}"
TIMER_NAMES=()
MOVED_TIMERS=()

# systemd schedules a calendar timer's next run from its last trigger, not
# from "now". Moving a timer later in the day (03:30 -> 07:30 ET) therefore
# makes daemon-reload fire it at once, e.g. the pre-market email at night,
# which then also eats the next morning's dedupe key. For a timer whose
# OnCalendar changes: stop it and mark it as just triggered, so the restart
# below schedules the next run from now.
reset_moved_timer() {
  local name="$1"
  local schedule="$2"
  local timer="${UNIT_DIR}/tikrr-${name}.timer"
  [[ -f "${timer}" ]] || return 0
  local previous
  previous="$(sed -n 's/^OnCalendar=//p' "${timer}" | head -n 1)"
  [[ "${previous}" == "${schedule}" ]] && return 0
  systemctl stop "tikrr-${name}.timer" >/dev/null 2>&1 || true
  mkdir -p "${STAMP_DIR}"
  touch "${STAMP_DIR}/stamp-tikrr-${name}.timer"
  MOVED_TIMERS+=("tikrr-${name}.timer")
}

write_service() {
  local name="$1"
  local lane="$2"
  local extra="${3:-}"
  local on_success="${4:-}"
  local restart_sec="${5:-}"
  local service="${UNIT_DIR}/tikrr-${name}.service"
  local on_success_line=""
  local restart_unit_lines=""
  local restart_service_lines=""
  if [[ -n "${on_success}" ]]; then
    on_success_line="OnSuccess=${on_success}"
  fi
  if [[ -n "${restart_sec}" ]]; then
    restart_unit_lines=$'StartLimitIntervalSec=1h\nStartLimitBurst=4'
    restart_service_lines="Restart=on-failure
RestartSec=${restart_sec}"
  fi

  cat > "${service}" <<EOF
[Unit]
Description=Tikrr ${name}
${on_success_line}
${restart_unit_lines}

[Service]
Type=oneshot
User=${USER_NAME}
WorkingDirectory=${REPO_DIR}
Environment=TIKRR_REPO_DIR=${REPO_DIR}
Environment=TIKRR_ENV_FILE=${ENV_FILE}
Environment="SEC_USER_AGENT=${SEC_USER_AGENT:-Stocksbrew/1.0 contact@stocksbrew.online}"
MemoryMax=${TIKRR_SERVICE_MEMORY_MAX:-6G}
MemorySwapMax=${TIKRR_SERVICE_MEMORY_SWAP_MAX:-2G}
${restart_service_lines}
ExecStart=${REPO_DIR}/backend/vps/run-dispatch.sh ${lane} ${extra}
EOF
  chmod 0644 "${service}"
}

write_pair() {
  local name="$1"
  local schedule="$2"
  local lane="$3"
  local extra="${4:-}"
  local on_success="${5:-}"
  local restart_sec="${6:-}"
  local timer="${UNIT_DIR}/tikrr-${name}.timer"

  reset_moved_timer "${name}" "${schedule}"
  write_service "${name}" "${lane}" "${extra}" "${on_success}" "${restart_sec}"

  cat > "${timer}" <<EOF
[Unit]
Description=Run Tikrr ${name}

[Timer]
OnCalendar=${schedule}
Persistent=true
AccuracySec=1min
Unit=tikrr-${name}.service

[Install]
WantedBy=timers.target
EOF
  chmod 0644 "${timer}"
  TIMER_NAMES+=("tikrr-${name}.timer")
}

# Every market-tied timer names America/New_York. A bare time is UTC on this
# host, so it slides an hour against the session at each DST change (the
# zone-briefs timer ended up running before the open that way). Times below
# are New York wall-clock times. backend/tests/test_install_systemd.py
# checks that no market timer loses its zone.
write_pair preopen-news "Mon..Fri *-*-* 08:45:00 America/New_York" tracked_news_prep "--shard-size 20 --max-parallel 4 --per-stock-cap 4 --chunk-workers 2" "" "5min"
write_pair preclose-news "Mon..Fri *-*-* 15:40:00 America/New_York" tracked_news_prep "--shard-size 20 --max-parallel 4 --per-stock-cap 4 --chunk-workers 2" "" "5min"
# One dependency chain owns the publish order. A single large Yahoo batch
# replaces ~20 sequential 25-stock price shards.
# The 09:30 batch refreshes quotes and the home dashboard only. Briefs no
# longer hang off it: at 09:30 the day's move is still near zero, so a brief
# written from that tape says a stock that will be down 8% is flat.
write_pair open-price "Mon..Fri *-*-* 09:30:00 America/New_York" price_core_open "--session-phase open_check --limit 500 --max-parallel 1 --max-workers 2 --shard-size 700" "" "1min"
# Morning chain, from a settled 20-minute tape. The 09:50 price batch starts
# two siblings: anomaly research + the opening email (fast, done ~09:58), and
# the morning briefs, which wait for those mover reasons (up to 20 min) so
# they can cite them, then rewrite only the selected stocks: changed news,
# a material move since the previous close, a held stock's fresh earnings,
# and today's anomaly/Reddit names with an old brief. Neither blocks the
# other on failure.
write_pair open-movers-price "Mon..Fri *-*-* 09:50:00 America/New_York" price_core_open "--session-phase open_check --limit 500 --max-parallel 1 --max-workers 2 --shard-size 700" "tikrr-open-anomalies.service tikrr-open-briefs.service" "3min"
write_service open-anomalies open_anomalies "--price-session-phase open_check" "" "5min"
# Keep brief shard concurrency at four: the shared VPS SQLite store serializes
# writes, and the 8-worker run hit database-lock failures. Small shards keep
# per-worker memory bounded while avoiding a large final tail.
write_service open-briefs tracked_open_briefs "--session-phase open_check --shard-size 4 --max-parallel 4 --brief-cap 160 --anomaly-wait-minutes 20" "" "5min"
write_pair reddit-buzz "Mon..Fri *-*-* 08,11,14,17:20:00 America/New_York" reddit_buzz
# Opening read models run after the morning chain (09:50 to ~10:20) so they
# do not contend with it for the SQLite write lock.
write_pair market-events-open "Mon..Fri *-*-* 10:40:00 America/New_York" market_events "--skip-if-fresh-hours 20"
write_pair data-health-open "Mon..Fri *-*-* 10:50:00 America/New_York" data_health
write_pair market-events-close "Mon..Fri *-*-* 18:30:00 America/New_York" market_events
write_pair data-health-close "Mon..Fri *-*-* 18:40:00 America/New_York" data_health
write_pair intraday-price-hourly "Mon..Fri *-*-* 10..15:00:00 America/New_York" price_core_intraday "--session-phase mid_check --limit 500 --max-parallel 1 --max-workers 2 --shard-size 700"
# Midday movers. Without this the movers list stays the 09:50 one all
# afternoon. At 12:30 and 14:30 a price batch re-selects the movers from the
# fresh tape. It runs on the intraday lane, so the lane lock keeps it off the
# hourly batch, and :30 leaves reddit-buzz (14:20) room for the SQLite write
# lock. The anomaly pass keeps the morning's sourced reasons for stocks still
# moving the same way, researches only the rest, and sends no email. It skips
# itself outside the session (Persistent catch-up after downtime).
write_pair midday-movers-price "Mon..Fri *-*-* 12,14:30:00 America/New_York" price_core_intraday "--session-phase mid_check --limit 500 --max-parallel 1 --max-workers 2 --shard-size 700" "tikrr-midday-anomalies.service" "3min"
write_service midday-anomalies open_anomalies "--price-session-phase mid_check" "" "5min"
# Closing price/read-model work feeds briefs, which feed the final anomaly
# pass. They are separate products but no longer race each other.
write_service close-anomalies open_anomalies "--price-session-phase post_close" "" "5min"
write_service close-briefs tracked_open_briefs "--session-phase post_close --shard-size 4 --max-parallel 4" "tikrr-close-anomalies.service" "5min"
write_pair postclose "Mon..Fri *-*-* 16:10:00 America/New_York" daily_postclose "" "tikrr-close-briefs.service" "1min"
# Slow, non-critical discovery cards run outside the email critical path.
write_pair market-discovery-open "Mon..Fri *-*-* 10:30:00 America/New_York" market_discovery
write_pair market-discovery-close "Mon..Fri *-*-* 17:00:00 America/New_York" market_discovery
write_pair earnings-intel "Mon..Fri *-*-* 18:00:00 America/New_York" earnings_intel "--recent-days 3 --max-events 30"
write_pair pre-earnings-intel "Mon..Fri *-*-* 18:45:00 America/New_York" pre_earnings_intel "--upcoming-days 7 --max-events 200"
# The timer itself is the retry loop. Do not add Restart=/StartLimit to this
# five-minute oneshot or successful empty polls eventually hit the burst cap.
write_pair on-demand-news "*-*-* *:00/5:00" on_demand_news "--limit 12 --per-stock-cap 6 --max-workers 2"
write_pair stock-requests "*-*-* *:00/30:00" stock_requests "--limit 25"
write_pair stock-facts "Sun *-*-* 08:00:00" stock_facts "--universe us_core_155 --limit 0 --max-workers 4"
write_pair research-themes "Sun *-*-* 10:00:00 America/New_York" research_themes
write_pair trump-logic "*-*-* 12:30:00" trump_logic
# One pre-market pipeline for the opening report and subscriber email.
# Market Daily is paused; keep the service available for a future relaunch.
# 07:30 ET: US pre-market trading has been open for three and a half hours,
# two hours before the bell. (It used to run at 08:30 UTC, 2:00 PM IST, which
# is 03:30 ET, before US pre-market trading even starts.)
write_pair premarket "Mon..Fri *-*-* 07:30:00 America/New_York" premarket_pipeline "" "" "5min"
write_service market-daily market_daily "" "" "10min"
# The opening email is sent inside the anomaly worker immediately after the
# mover snapshot and its evidence-backed reasons have been written. It must
# not wait for optional heat/divergence/sentiment read models.
write_pair weekly-email "Sat *-*-* 04:30:00" weekly_email
write_pair business-questions "Sat *-*-* 02:00:00" business_questions "--max-workers 4"
write_pair contrarian-calls-open "Mon..Fri *-*-* 10:35:00 America/New_York" contrarian_calls
write_pair contrarian-calls-close "Mon..Fri *-*-* 16:30:00 America/New_York" contrarian_calls
write_pair radar-official-open "Mon..Fri *-*-* 08:35:00 America/New_York" radar_official_sources "--recent-days 3 --include-ir" "" "5min"
write_pair radar-materialize-open "Mon..Fri *-*-* 09:43:00 America/New_York" radar_materialize "--activate --with-llm" "" "5min"
write_pair radar-official-close "Mon..Fri *-*-* 17:10:00 America/New_York" radar_official_sources "--recent-days 3 --include-ir" "" "5min"
write_pair radar-materialize-close "Mon..Fri *-*-* 17:45:00 America/New_York" radar_materialize "--activate --with-llm" "" "5min"
write_pair radar-outcomes "Mon..Fri *-*-* 19:00:00 America/New_York" radar_outcomes "--limit 0"
write_pair radar-alerts "Mon..Fri *-*-* *:00/15:00" radar_alerts
# Power trades: daily STOCK Act sync + hold-based email alerts. Custom oneshot
# wrapper (not an orchestrator lane); unit files are committed in the repo.
for unit in tikrr-power-trades.service tikrr-power-trades.timer; do
  cp "${REPO_DIR}/backend/vps/units/${unit}" "${UNIT_DIR}/${unit}"
  chmod 0644 "${UNIT_DIR}/${unit}"
done
TIMER_NAMES+=("tikrr-power-trades.timer")

systemctl disable --now tikrr-intraday-price-openburst.timer >/dev/null 2>&1 || true
rm -f "${UNIT_DIR}/tikrr-intraday-price-openburst.service" "${UNIT_DIR}/tikrr-intraday-price-openburst.timer"
# These jobs are now service-success dependencies. Remove their former
# fixed-time timers; `open-movers-price.timer` owns the settled open trigger.
for name in open-briefs open-anomalies open-email; do
  systemctl disable --now "tikrr-${name}.timer" >/dev/null 2>&1 || true
  rm -f "${UNIT_DIR}/tikrr-${name}.timer"
done
# Market Daily is paused. Remove any independent timer left by an older
# installer so it cannot publish on its own.
systemctl disable --now tikrr-market-daily.timer >/dev/null 2>&1 || true
rm -f "${UNIT_DIR}/tikrr-market-daily.timer"
# Retired: intraday tracked-news polling repeatedly regenerated AI
# briefs. Price lanes own quote freshness; brief synthesis runs only at the
# dependency-chained open and close checkpoints.
for name in tracked-refresh-t6 tracked-refresh-t2 tracked-refresh-pre tracked-refresh-intraday tracked-refresh-close; do
  systemctl disable --now "tikrr-${name}.timer" >/dev/null 2>&1 || true
  rm -f "${UNIT_DIR}/tikrr-${name}.service" "${UNIT_DIR}/tikrr-${name}.timer"
  systemctl reset-failed "tikrr-${name}.service" >/dev/null 2>&1 || true
done
# Retired: zone-briefs. The morning brief run selects today's anomaly and
# Reddit names itself, from the post-open tape instead of a pre-open guess.
systemctl disable --now tikrr-zone-briefs.timer >/dev/null 2>&1 || true
rm -f "${UNIT_DIR}/tikrr-zone-briefs.service" "${UNIT_DIR}/tikrr-zone-briefs.timer"
systemctl reset-failed tikrr-zone-briefs.service >/dev/null 2>&1 || true
systemctl disable --now tikrr-close-anomalies.timer >/dev/null 2>&1 || true
rm -f "${UNIT_DIR}/tikrr-close-anomalies.timer"
systemctl disable --now tikrr-premarket-intel.timer >/dev/null 2>&1 || true
rm -f "${UNIT_DIR}/tikrr-premarket-intel.service" "${UNIT_DIR}/tikrr-premarket-intel.timer"
systemctl disable --now tikrr-premarket-email.timer >/dev/null 2>&1 || true
rm -f "${UNIT_DIR}/tikrr-premarket-email.service" "${UNIT_DIR}/tikrr-premarket-email.timer"
# Retired: this stale "Market today" newsletter duplicated the 2 PM IST
# pre-market email before the US open.
systemctl disable --now tikrr-newsletter-email.timer >/dev/null 2>&1 || true
rm -f "${UNIT_DIR}/tikrr-newsletter-email.timer"

systemctl daemon-reload
if [[ "${ENABLE_TIMERS:-1}" == "1" ]]; then
  systemctl enable --now "${TIMER_NAMES[@]}"
elif (( ${#MOVED_TIMERS[@]} )); then
  # Only restart what reset_moved_timer stopped; enabling stays opt-in.
  systemctl start "${MOVED_TIMERS[@]}"
fi
systemctl list-timers 'tikrr-*' --all
