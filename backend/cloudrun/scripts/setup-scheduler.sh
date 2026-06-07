#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${GOOGLE_CLOUD_PROJECT:-}" ]]; then
  echo "Missing GOOGLE_CLOUD_PROJECT"
  exit 1
fi
if [[ -z "${GOOGLE_CLOUD_REGION:-}" ]]; then
  echo "Missing GOOGLE_CLOUD_REGION"
  exit 1
fi
if [[ -z "${SCHEDULER_SERVICE_ACCOUNT_EMAIL:-}" ]]; then
  echo "Missing SCHEDULER_SERVICE_ACCOUNT_EMAIL"
  exit 1
fi

DISPATCH_JOB_NAME="${DISPATCH_JOB_NAME:-tikrr-dispatch}"
SCHEDULER_LOCATION="${SCHEDULER_LOCATION:-us-central1}"
MARKET="${MARKET:-US}"
UNIVERSE="${UNIVERSE:-}"
LIMIT="${LIMIT:-100}"
SHARD_SIZE="${SHARD_SIZE:-20}"
MAX_PARALLEL="${MAX_PARALLEL:-5}"
PER_STOCK_CAP="${PER_STOCK_CAP:-4}"
CHUNK_WORKERS="${CHUNK_WORKERS:-4}"

# 7:00 PM IST baseline open is 13:30 UTC. If open shifts to 8:00 PM IST, update these cron strings (+1h).
CRON_PREOPEN="${CRON_PREOPEN:-45 12 * * 1-5}"            # 6:15 PM IST
CRON_OPEN_PRICE="${CRON_OPEN_PRICE:-30 13 * * 1-5}"       # 7:00 PM IST
CRON_OPEN_BRIEFS="${CRON_OPEN_BRIEFS:-35 13 * * 1-5}"     # 7:05 PM IST
CRON_OPEN_ANOMALIES="${CRON_OPEN_ANOMALIES:-38 13 * * 1-5}" # 7:08 PM IST
CRON_REDDIT_BUZZ="${CRON_REDDIT_BUZZ:-20 13 * * 1-5}"     # 6:50 PM IST
CRON_ZONE_BRIEFS="${CRON_ZONE_BRIEFS:-0 14 * * 1-5}"     # 7:30 PM IST (after open_anomalies + reddit_buzz are fresh)
CRON_MARKET_EVENTS_OPEN="${CRON_MARKET_EVENTS_OPEN:-10 14 * * 1-5}" # 7:40 PM IST (after anomalies + reddit + zone briefs)
CRON_DATA_HEALTH_OPEN="${CRON_DATA_HEALTH_OPEN:-20 14 * * 1-5}" # 7:50 PM IST (after open derived feeds)
CRON_MARKET_EVENTS_CLOSE="${CRON_MARKET_EVENTS_CLOSE:-30 22 * * 1-5}" # 4:00 AM IST (after late AMC earnings intel)
CRON_DATA_HEALTH_CLOSE="${CRON_DATA_HEALTH_CLOSE:-40 22 * * 1-5}" # 4:10 AM IST (after close derived feeds)
MARKET_EVENTS_OPEN_SKIP_IF_FRESH_HOURS="${MARKET_EVENTS_OPEN_SKIP_IF_FRESH_HOURS:-20}"
CRON_CLOSE_ANOMALIES="${CRON_CLOSE_ANOMALIES:-40 20 * * 1-5}" # 2:10 AM IST (after postclose has usually completed)
CRON_CLOSE_REDDIT_BUZZ="${CRON_CLOSE_REDDIT_BUZZ:-45 20 * * 1-5}" # 2:15 AM IST (after postclose has usually completed)
CRON_OPEN_EMAILS="${CRON_OPEN_EMAILS:-42 13 * * 1-5}"     # 7:12 PM IST (after open pipeline + anomalies)
CRON_INTRADAY="${CRON_INTRADAY:-0 13-19 * * 1-5}"          # hourly baseline during session
CRON_INTRADAY_OPENBURST="${CRON_INTRADAY_OPENBURST:-30 13-15 * * 1-5}" # extra half-hour cadence near open
CRON_POSTCLOSE="${CRON_POSTCLOSE:-10 20 * * 1-5}"         # 1:40 AM IST (next day)
CRON_EARNINGS_INTEL="${CRON_EARNINGS_INTEL:-0 22 * * 1-5}" # 3:30 AM IST (late enough for most AMC prints to settle)
CRON_PRE_EARNINGS_INTEL="${CRON_PRE_EARNINGS_INTEL:-45 22 * * 1-5}" # 4:15 AM IST (after events materialization)
CRON_ON_DEMAND_NEWS="${CRON_ON_DEMAND_NEWS:-0 */4 * * 1-5}" # 4-hour backup; track/watchlist APIs dispatch immediately
CRON_STOCK_REQUESTS="${CRON_STOCK_REQUESTS:-*/30 * * * *}" # every 30m; API also dispatches on each request
STOCK_REQUESTS_LIMIT="${STOCK_REQUESTS_LIMIT:-25}"
CRON_STOCK_FACTS="${CRON_STOCK_FACTS:-0 8 * * 0}" # Sunday 08:00 UTC; slow fundamentals/facts refresh
CRON_TRUMP_LOGIC="${CRON_TRUMP_LOGIC:-30 12 * * *}" # 12:30 UTC daily — Truth Social market digest
CRON_PREMARKET_MOVERS="${CRON_PREMARKET_MOVERS:-30 11 * * 1-5}" # 11:30 UTC = 7:30 ET; pre-market live since 4 ET
CRON_PREMARKET_EMAIL="${CRON_PREMARKET_EMAIL:-0 12 * * 1-5}" # 12:00 UTC = 8:00 ET; ~1h45 before the open email
CRON_CONTRARIAN="${CRON_CONTRARIAN:-0 14 * * 1-5}" # 14:00 UTC = 30m after open; refresh hero contrarian wall with fresh open prices
CRON_CONTRARIAN_CLOSE="${CRON_CONTRARIAN_CLOSE:-30 20 * * 1-5}" # 20:30 UTC = 30m after close; refresh hero contrarian wall for post-close session
CRON_WEEKLY_NEWSLETTER="${CRON_WEEKLY_NEWSLETTER:-0 14 * * 0}" # Sunday 14:00 UTC = 10:00 ET; week in the markets recap
STOCK_FACTS_LIMIT="${STOCK_FACTS_LIMIT:-0}" # 0 means full active price universe
STOCK_FACTS_MAX_WORKERS="${STOCK_FACTS_MAX_WORKERS:-4}"

RUN_URI="https://run.googleapis.com/v2/projects/${GOOGLE_CLOUD_PROJECT}/locations/${GOOGLE_CLOUD_REGION}/jobs/${DISPATCH_JOB_NAME}:run"

mk_body() {
  local lane="$1"
  local extra="$2"
  cat <<EOF
{"overrides":{"containerOverrides":[{"args":["-m","backend.cloudrun.orchestrator.dispatch","--lane","${lane}","--market","${MARKET}","--project","${GOOGLE_CLOUD_PROJECT}","--region","${GOOGLE_CLOUD_REGION}","--limit","${LIMIT}","--shard-size","${SHARD_SIZE}","--max-parallel","${MAX_PARALLEL}","--per-stock-cap","${PER_STOCK_CAP}","--chunk-workers","${CHUNK_WORKERS}"${extra}]}]}}
EOF
}

mk_minimal_body() {
  local lane="$1"
  local extra="$2"
  cat <<EOF
{"overrides":{"containerOverrides":[{"args":["-m","backend.cloudrun.orchestrator.dispatch","--lane","${lane}","--market","${MARKET}","--project","${GOOGLE_CLOUD_PROJECT}","--region","${GOOGLE_CLOUD_REGION}"${extra}]}]}}
EOF
}

upsert_job() {
  local name="$1"
  local schedule="$2"
  local body_file="$3"

  if [[ "${DRY_RUN:-0}" == "1" ]]; then
    echo "DRY_RUN scheduler job=${name} schedule=${schedule}"
    python3 -m json.tool "${body_file}"
    return
  fi

  if gcloud scheduler jobs describe "${name}" --location="${SCHEDULER_LOCATION}" --project="${GOOGLE_CLOUD_PROJECT}" >/dev/null 2>&1; then
    gcloud scheduler jobs update http "${name}" \
      --location="${SCHEDULER_LOCATION}" \
      --project="${GOOGLE_CLOUD_PROJECT}" \
      --schedule="${schedule}" \
      --time-zone="Etc/UTC" \
      --uri="${RUN_URI}" \
      --http-method=POST \
      --update-headers="Content-Type=application/json" \
      --message-body-from-file="${body_file}" \
      --oauth-service-account-email="${SCHEDULER_SERVICE_ACCOUNT_EMAIL}" \
      --oauth-token-scope="https://www.googleapis.com/auth/cloud-platform"
  else
    gcloud scheduler jobs create http "${name}" \
      --location="${SCHEDULER_LOCATION}" \
      --project="${GOOGLE_CLOUD_PROJECT}" \
      --schedule="${schedule}" \
      --time-zone="Etc/UTC" \
      --uri="${RUN_URI}" \
      --http-method=POST \
      --headers="Content-Type=application/json" \
      --message-body-from-file="${body_file}" \
      --oauth-service-account-email="${SCHEDULER_SERVICE_ACCOUNT_EMAIL}" \
      --oauth-token-scope="https://www.googleapis.com/auth/cloud-platform"
  fi
}

tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

extra_universe=""
if [[ -n "${UNIVERSE}" ]]; then
  extra_universe=",\"--universe\",\"${UNIVERSE}\""
fi

printf '%s\n' "$(mk_body tracked_news_prep "${extra_universe}")" > "${tmp_dir}/preopen.json"
printf '%s\n' "$(mk_body price_core_open "${extra_universe},\"--session-phase\",\"open_check\"")" > "${tmp_dir}/open_price.json"
printf '%s\n' "$(mk_body tracked_open_briefs "${extra_universe},\"--session-phase\",\"open_check\"")" > "${tmp_dir}/open_briefs.json"
printf '%s\n' "$(mk_body open_anomalies "${extra_universe}")" > "${tmp_dir}/open_anomalies.json"
printf '%s\n' "$(mk_body reddit_buzz "${extra_universe}")" > "${tmp_dir}/reddit_buzz.json"
printf '%s\n' "$(mk_body zone_briefs "${extra_universe}")" > "${tmp_dir}/zone_briefs.json"
printf '%s\n' "$(mk_body market_events "${extra_universe},\"--skip-if-fresh-hours\",\"${MARKET_EVENTS_OPEN_SKIP_IF_FRESH_HOURS}\"")" > "${tmp_dir}/market_events_open.json"
printf '%s\n' "$(mk_minimal_body data_health "${extra_universe}")" > "${tmp_dir}/data_health_open.json"
printf '%s\n' "$(mk_body market_events "${extra_universe}")" > "${tmp_dir}/market_events_close.json"
printf '%s\n' "$(mk_minimal_body data_health "${extra_universe}")" > "${tmp_dir}/data_health_close.json"
printf '%s\n' "$(mk_body open_anomalies "${extra_universe}")" > "${tmp_dir}/close_anomalies.json"
printf '%s\n' "$(mk_body reddit_buzz "${extra_universe}")" > "${tmp_dir}/close_reddit_buzz.json"
printf '%s\n' "$(mk_body market_open_email "${extra_universe}")" > "${tmp_dir}/open_emails.json"
printf '%s\n' "$(mk_body price_core_intraday "${extra_universe},\"--session-phase\",\"mid_check\"")" > "${tmp_dir}/intraday.json"
printf '%s\n' "$(mk_body price_core_intraday "${extra_universe},\"--session-phase\",\"mid_check\"")" > "${tmp_dir}/intraday_openburst.json"
printf '%s\n' "$(mk_body daily_postclose "${extra_universe}")" > "${tmp_dir}/postclose.json"
printf '%s\n' "$(mk_body earnings_intel "${extra_universe},\"--recent-days\",\"3\",\"--max-events\",\"30\"")" > "${tmp_dir}/earnings_intel.json"
printf '%s\n' "$(mk_body pre_earnings_intel "${extra_universe},\"--upcoming-days\",\"7\",\"--max-events\",\"40\"")" > "${tmp_dir}/pre_earnings_intel.json"
printf '%s\n' "$(mk_minimal_body on_demand_news "${extra_universe},\"--limit\",\"6\",\"--per-stock-cap\",\"6\"")" > "${tmp_dir}/on_demand_news.json"
printf '%s\n' "$(mk_minimal_body stock_facts "${extra_universe},\"--limit\",\"${STOCK_FACTS_LIMIT}\",\"--max-workers\",\"${STOCK_FACTS_MAX_WORKERS}\"")" > "${tmp_dir}/stock_facts.json"
printf '%s\n' "$(mk_minimal_body trump_logic "${extra_universe}")" > "${tmp_dir}/trump_logic.json"
printf '%s\n' "$(mk_minimal_body premarket_movers "${extra_universe}")" > "${tmp_dir}/premarket_movers.json"
printf '%s\n' "$(mk_minimal_body premarket_email "${extra_universe}")" > "${tmp_dir}/premarket_email.json"
printf '%s\n' "$(mk_minimal_body contrarian_calls "${extra_universe}")" > "${tmp_dir}/contrarian_calls.json"
printf '%s\n' "$(mk_minimal_body weekly_newsletter "${extra_universe}")" > "${tmp_dir}/weekly_newsletter.json"

upsert_job "tikrr-preopen-news" "${CRON_PREOPEN}" "${tmp_dir}/preopen.json"
upsert_job "tikrr-open-price" "${CRON_OPEN_PRICE}" "${tmp_dir}/open_price.json"
upsert_job "tikrr-open-briefs" "${CRON_OPEN_BRIEFS}" "${tmp_dir}/open_briefs.json"
upsert_job "tikrr-open-anomalies" "${CRON_OPEN_ANOMALIES}" "${tmp_dir}/open_anomalies.json"
upsert_job "tikrr-reddit-buzz" "${CRON_REDDIT_BUZZ}" "${tmp_dir}/reddit_buzz.json"
upsert_job "tikrr-zone-briefs" "${CRON_ZONE_BRIEFS}" "${tmp_dir}/zone_briefs.json"
upsert_job "tikrr-market-events-open" "${CRON_MARKET_EVENTS_OPEN}" "${tmp_dir}/market_events_open.json"
upsert_job "tikrr-data-health-open" "${CRON_DATA_HEALTH_OPEN}" "${tmp_dir}/data_health_open.json"
upsert_job "tikrr-market-events-close" "${CRON_MARKET_EVENTS_CLOSE}" "${tmp_dir}/market_events_close.json"
upsert_job "tikrr-data-health-close" "${CRON_DATA_HEALTH_CLOSE}" "${tmp_dir}/data_health_close.json"
upsert_job "tikrr-close-anomalies" "${CRON_CLOSE_ANOMALIES}" "${tmp_dir}/close_anomalies.json"
upsert_job "tikrr-close-reddit-buzz" "${CRON_CLOSE_REDDIT_BUZZ}" "${tmp_dir}/close_reddit_buzz.json"
upsert_job "tikrr-open-emails" "${CRON_OPEN_EMAILS}" "${tmp_dir}/open_emails.json"
upsert_job "tikrr-intraday-price" "${CRON_INTRADAY}" "${tmp_dir}/intraday.json"
upsert_job "tikrr-intraday-price-openburst" "${CRON_INTRADAY_OPENBURST}" "${tmp_dir}/intraday_openburst.json"
upsert_job "tikrr-postclose" "${CRON_POSTCLOSE}" "${tmp_dir}/postclose.json"
upsert_job "tikrr-earnings-intel" "${CRON_EARNINGS_INTEL}" "${tmp_dir}/earnings_intel.json"
upsert_job "tikrr-pre-earnings-intel" "${CRON_PRE_EARNINGS_INTEL}" "${tmp_dir}/pre_earnings_intel.json"
upsert_job "tikrr-on-demand-news" "${CRON_ON_DEMAND_NEWS}" "${tmp_dir}/on_demand_news.json"
upsert_job "tikrr-stock-facts" "${CRON_STOCK_FACTS}" "${tmp_dir}/stock_facts.json"
upsert_job "tikrr-trump-logic" "${CRON_TRUMP_LOGIC}" "${tmp_dir}/trump_logic.json"
upsert_job "tikrr-premarket-movers" "${CRON_PREMARKET_MOVERS}" "${tmp_dir}/premarket_movers.json"
upsert_job "tikrr-premarket-email" "${CRON_PREMARKET_EMAIL}" "${tmp_dir}/premarket_email.json"
upsert_job "tikrr-contrarian-calls" "${CRON_CONTRARIAN}" "${tmp_dir}/contrarian_calls.json"
upsert_job "tikrr-contrarian-calls-close" "${CRON_CONTRARIAN_CLOSE}" "${tmp_dir}/contrarian_calls.json"
upsert_job "tikrr-weekly-newsletter" "${CRON_WEEKLY_NEWSLETTER}" "${tmp_dir}/weekly_newsletter.json"

echo "Scheduler jobs ready in ${SCHEDULER_LOCATION}."
