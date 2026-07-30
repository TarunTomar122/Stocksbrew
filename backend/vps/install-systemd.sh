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
  local service="${UNIT_DIR}/tikrr-${name}.service"
  local on_success_line=""
  if [[ -n "${on_success}" ]]; then
    on_success_line="OnSuccess=${on_success}"
  fi

  cat > "${service}" <<EOF
[Unit]
Description=Tikrr ${name}
${on_success_line}

[Service]
Type=oneshot
User=${USER_NAME}
WorkingDirectory=${REPO_DIR}
Environment=TIKRR_REPO_DIR=${REPO_DIR}
Environment=TIKRR_ENV_FILE=${ENV_FILE}
MemoryMax=${TIKRR_SERVICE_MEMORY_MAX:-6G}
MemorySwapMax=${TIKRR_SERVICE_MEMORY_SWAP_MAX:-2G}
ExecStart=${REPO_DIR}/backend/vps/run-dispatch.sh ${lane} ${extra}
EOF
}

write_pair() {
  local name="$1"
  local schedule="$2"
  local lane="$3"
  local extra="${4:-}"
  local on_success="${5:-}"
  local timer="${UNIT_DIR}/tikrr-${name}.timer"

  write_service "${name}" "${lane}" "${extra}" "${on_success}"

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
  TIMER_NAMES+=("tikrr-${name}.timer")
}

# UTC schedules mirror backend/cloudrun/scripts/setup-scheduler.sh.
write_pair preopen-news "Mon..Fri *-*-* 12:45:00" tracked_news_prep
# Stock briefs and mover reasons are independent products. Prices trigger the
# brief refresh, while the mover-evidence pass starts 20 minutes after the
# open, once opening price data has settled. It never asks generic briefs to
# explain a move.
write_pair open-price "Mon..Fri *-*-* 13:30:00" price_core_open "--session-phase open_check --max-parallel 1 --max-workers 2 --shard-size 25" "tikrr-open-briefs.service"
# Brief work is incremental. Small shards let a material opening move fan out
# without a single slow ticker holding the remaining tracked names hostage.
write_service open-briefs tracked_open_briefs "--session-phase open_check --shard-size 10 --max-parallel 4"
write_pair open-anomalies "Mon..Fri *-*-* 13:50:00" open_anomalies "--price-session-phase open_check"
write_pair reddit-buzz "Mon..Fri *-*-* 12,15,18,21:20:00" reddit_buzz
write_pair zone-briefs "Mon..Fri *-*-* 14:00:00" zone_briefs
write_pair market-events-open "Mon..Fri *-*-* 14:10:00" market_events "--skip-if-fresh-hours 20"
write_pair data-health-open "Mon..Fri *-*-* 14:20:00" data_health
write_pair market-events-close "Mon..Fri *-*-* 22:30:00" market_events
write_pair data-health-close "Mon..Fri *-*-* 22:40:00" data_health
write_pair intraday-price-hourly "Mon..Fri *-*-* 13..19:00:00" price_core_intraday "--session-phase mid_check --max-parallel 1 --max-workers 2 --shard-size 40"
# At the close, stock briefs and mover reasoning fan out from the completed
# closing-price job. They are separate lanes, so neither can contaminate or
# delay the other.
write_service close-anomalies open_anomalies "--price-session-phase post_close"
write_service close-briefs tracked_open_briefs "--session-phase post_close --shard-size 10 --max-parallel 4"
write_pair postclose "Mon..Fri *-*-* 20:10:00" daily_postclose "" "tikrr-close-briefs.service tikrr-close-anomalies.service"
write_pair earnings-intel "Mon..Fri *-*-* 22:00:00" earnings_intel "--recent-days 3 --max-events 30"
write_pair pre-earnings-intel "Mon..Fri *-*-* 22:45:00" pre_earnings_intel "--upcoming-days 7 --max-events 200"
write_pair on-demand-news "Mon..Fri *-*-* 00,04,08,12,16,20:00:00" on_demand_news "--limit 6 --per-stock-cap 6"
write_pair stock-requests "*-*-* *:00/30:00" stock_requests "--limit 25"
write_pair stock-facts "Sun *-*-* 08:00:00" stock_facts "--limit 0 --max-workers 4"
write_pair trump-logic "*-*-* 12:30:00" trump_logic
# One pre-market pipeline for the opening report and subscriber email.
# 08:30 UTC is 2:00 PM IST year-round.
write_pair premarket "Mon..Fri *-*-* 08:30:00" premarket_pipeline
# The opening email is sent inside the anomaly worker immediately after the
# mover snapshot and its evidence-backed reasons have been written. It must
# not wait for optional heat/divergence/sentiment read models.
write_pair weekly-email "Sat *-*-* 04:30:00" weekly_email
write_pair contrarian-calls-open "Mon..Fri *-*-* 14:00:00" contrarian_calls
write_pair contrarian-calls-close "Mon..Fri *-*-* 20:30:00" contrarian_calls
write_pair radar-official-open "Mon..Fri *-*-* 12:35:00" radar_official_sources "--recent-days 3 --include-ir"
write_pair radar-materialize-open "Mon..Fri *-*-* 13:43:00" radar_materialize "--activate --with-llm"
write_pair radar-official-close "Mon..Fri *-*-* 21:10:00" radar_official_sources "--recent-days 3 --include-ir"
write_pair radar-materialize-close "Mon..Fri *-*-* 21:45:00" radar_materialize "--activate --with-llm"
write_pair radar-outcomes "Mon..Fri *-*-* 23:00:00" radar_outcomes "--limit 0"
write_pair radar-alerts "Mon..Fri *-*-* *:00/15:00" radar_alerts

systemctl disable --now tikrr-intraday-price-openburst.timer >/dev/null 2>&1 || true
rm -f "${UNIT_DIR}/tikrr-intraday-price-openburst.service" "${UNIT_DIR}/tikrr-intraday-price-openburst.timer"
# These jobs are now service-success dependencies of the price lane. Remove
# their former fixed-time timers; the anomaly timer below is intentional.
for name in open-briefs open-email; do
  systemctl disable --now "tikrr-${name}.timer" >/dev/null 2>&1 || true
  rm -f "${UNIT_DIR}/tikrr-${name}.timer"
done
# Retired: intraday tracked-news polling repeatedly regenerated DeepSeek
# briefs. Price lanes now own intraday freshness; the daily open-brief lane is
# the only scheduled tracked-stock synthesis pass.
for name in tracked-refresh-t6 tracked-refresh-t2 tracked-refresh-pre tracked-refresh-intraday tracked-refresh-close; do
  systemctl disable --now "tikrr-${name}.timer" >/dev/null 2>&1 || true
  rm -f "${UNIT_DIR}/tikrr-${name}.service" "${UNIT_DIR}/tikrr-${name}.timer"
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
