#!/usr/bin/env bash
set -euo pipefail

UNIT_DIR="${UNIT_DIR:-/etc/systemd/system}"
REPO_DIR="${TIKRR_REPO_DIR:-/opt/tikrr}"
USER_NAME="${TIKRR_USER:-ubuntu}"
ENV_FILE="${TIKRR_ENV_FILE:-/etc/tikrr/backend.env}"
TIMER_NAMES=()

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

# Use exchange-local schedules so US daylight-saving transitions do not move
# the pipeline one hour away from the market session.
write_pair preopen-news "Mon..Fri *-*-* 08:45:00 America/New_York" tracked_news_prep "--shard-size 20 --max-parallel 4 --per-stock-cap 4 --chunk-workers 2" "" "5min"
write_pair preclose-news "Mon..Fri *-*-* 15:40:00 America/New_York" tracked_news_prep "--shard-size 20 --max-parallel 4 --per-stock-cap 4 --chunk-workers 2" "" "5min"
# One dependency chain owns the publish order. A single large Yahoo batch
# replaces ~20 sequential 25-stock price shards.
write_pair open-price "Mon..Fri *-*-* 09:30:00 America/New_York" price_core_open "--session-phase open_check --limit 500 --max-parallel 1 --max-workers 2 --shard-size 700" "tikrr-open-briefs.service" "1min"
# Brief synthesis is sequential inside each shard, so shard parallelism is the
# actual model-call concurrency. Luna-low was validated at 8/8 simultaneous
# production-shaped calls; four-stock shards keep the tail evenly balanced.
write_service open-briefs tracked_open_briefs "--session-phase open_check --shard-size 4 --max-parallel 8" "" "5min"
# Movers must be selected from a settled 20-minute tape, not the 09:30 quote
# batch that fed the opening briefs. This second batch is cheap and chains
# directly into anomaly research + the opening email.
write_pair open-movers-price "Mon..Fri *-*-* 09:50:00 America/New_York" price_core_open "--session-phase open_check --limit 500 --max-parallel 1 --max-workers 2 --shard-size 700" "tikrr-open-anomalies.service" "1min"
write_service open-anomalies open_anomalies "--price-session-phase open_check" "" "5min"
write_pair reddit-buzz "Mon..Fri *-*-* 12,15,18,21:20:00" reddit_buzz
write_pair zone-briefs "Mon..Fri *-*-* 14:00:00" zone_briefs
write_pair market-events-open "Mon..Fri *-*-* 14:10:00" market_events "--skip-if-fresh-hours 20"
write_pair data-health-open "Mon..Fri *-*-* 14:20:00" data_health
write_pair market-events-close "Mon..Fri *-*-* 22:30:00" market_events
write_pair data-health-close "Mon..Fri *-*-* 22:40:00" data_health
write_pair intraday-price-hourly "Mon..Fri *-*-* 10..15:00:00 America/New_York" price_core_intraday "--session-phase mid_check --limit 500 --max-parallel 1 --max-workers 2 --shard-size 700"
# Closing price/read-model work feeds briefs, which feed the final anomaly
# pass. They are separate products but no longer race each other.
write_service close-anomalies open_anomalies "--price-session-phase post_close" "" "5min"
write_service close-briefs tracked_open_briefs "--session-phase post_close --shard-size 4 --max-parallel 8" "tikrr-close-anomalies.service" "5min"
write_pair postclose "Mon..Fri *-*-* 16:10:00 America/New_York" daily_postclose "" "tikrr-close-briefs.service" "1min"
# Slow, non-critical discovery cards run outside the email critical path.
write_pair market-discovery-open "Mon..Fri *-*-* 10:30:00 America/New_York" market_discovery
write_pair market-discovery-close "Mon..Fri *-*-* 17:00:00 America/New_York" market_discovery
write_pair earnings-intel "Mon..Fri *-*-* 22:00:00" earnings_intel "--recent-days 3 --max-events 30"
write_pair pre-earnings-intel "Mon..Fri *-*-* 22:45:00" pre_earnings_intel "--upcoming-days 7 --max-events 200"
write_pair on-demand-news "Mon..Fri *-*-* 00,04,08,12,16,20:00:00" on_demand_news "--limit 6 --per-stock-cap 6"
write_pair stock-requests "*-*-* *:00/30:00" stock_requests "--limit 25"
write_pair stock-facts "Sun *-*-* 08:00:00" stock_facts "--universe us_core_155 --limit 0 --max-workers 4"
write_pair trump-logic "*-*-* 12:30:00" trump_logic
# One pre-market pipeline for the opening report and subscriber email.
# 08:30 UTC is 2:00 PM IST year-round.
write_pair premarket "Mon..Fri *-*-* 08:30:00" premarket_pipeline
# Market Daily remains approval-gated. Install a manual service, never an
# automatic timer, so an infrastructure refresh cannot publish a new edition
# without the user's explicit go-ahead.
write_service market-daily market_daily
# The opening email is sent inside the anomaly worker immediately after the
# mover snapshot and its evidence-backed reasons have been written. It must
# not wait for optional heat/divergence/sentiment read models.
write_pair weekly-email "Sat *-*-* 04:30:00" weekly_email
write_pair contrarian-calls-open "Mon..Fri *-*-* 14:00:00" contrarian_calls
write_pair contrarian-calls-close "Mon..Fri *-*-* 20:30:00" contrarian_calls
write_pair radar-official-open "Mon..Fri *-*-* 12:35:00" radar_official_sources "--recent-days 3 --include-ir" "" "5min"
write_pair radar-materialize-open "Mon..Fri *-*-* 13:43:00" radar_materialize "--activate --with-llm" "" "5min"
write_pair radar-official-close "Mon..Fri *-*-* 21:10:00" radar_official_sources "--recent-days 3 --include-ir" "" "5min"
write_pair radar-materialize-close "Mon..Fri *-*-* 21:45:00" radar_materialize "--activate --with-llm" "" "5min"
write_pair radar-outcomes "Mon..Fri *-*-* 23:00:00" radar_outcomes "--limit 0"
write_pair radar-alerts "Mon..Fri *-*-* *:00/15:00" radar_alerts

systemctl disable --now tikrr-intraday-price-openburst.timer >/dev/null 2>&1 || true
rm -f "${UNIT_DIR}/tikrr-intraday-price-openburst.service" "${UNIT_DIR}/tikrr-intraday-price-openburst.timer"
# These jobs are now service-success dependencies. Remove their former
# fixed-time timers; `open-movers-price.timer` owns the settled open trigger.
for name in open-briefs open-anomalies open-email; do
  systemctl disable --now "tikrr-${name}.timer" >/dev/null 2>&1 || true
  rm -f "${UNIT_DIR}/tikrr-${name}.timer"
done
# Editorial publication requires explicit approval. Remove any timer left by
# an older installer while keeping the manual market-daily service available.
systemctl disable --now tikrr-market-daily.timer >/dev/null 2>&1 || true
rm -f "${UNIT_DIR}/tikrr-market-daily.timer"
# Retired: intraday tracked-news polling repeatedly regenerated DeepSeek
# briefs. Price lanes own quote freshness; brief synthesis runs only at the
# dependency-chained open and close checkpoints.
for name in tracked-refresh-t6 tracked-refresh-t2 tracked-refresh-pre tracked-refresh-intraday tracked-refresh-close; do
  systemctl disable --now "tikrr-${name}.timer" >/dev/null 2>&1 || true
  rm -f "${UNIT_DIR}/tikrr-${name}.service" "${UNIT_DIR}/tikrr-${name}.timer"
  systemctl reset-failed "tikrr-${name}.service" >/dev/null 2>&1 || true
done
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
fi
systemctl list-timers 'tikrr-*' --all
