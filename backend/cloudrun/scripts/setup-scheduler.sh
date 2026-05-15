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
CRON_INTRADAY="${CRON_INTRADAY:-*/20 13-19 * * 1-5}"      # every 20 min during session
CRON_POSTCLOSE="${CRON_POSTCLOSE:-10 20 * * 1-5}"         # 1:40 AM IST (next day)

RUN_URI="https://run.googleapis.com/v2/projects/${GOOGLE_CLOUD_PROJECT}/locations/${GOOGLE_CLOUD_REGION}/jobs/${DISPATCH_JOB_NAME}:run"

mk_body() {
  local lane="$1"
  local extra="$2"
  cat <<EOF
{"overrides":{"containerOverrides":[{"args":["-m","backend.cloudrun.orchestrator.dispatch","--lane","${lane}","--market","${MARKET}","--project","${GOOGLE_CLOUD_PROJECT}","--region","${GOOGLE_CLOUD_REGION}","--limit","${LIMIT}","--shard-size","${SHARD_SIZE}","--max-parallel","${MAX_PARALLEL}","--per-stock-cap","${PER_STOCK_CAP}","--chunk-workers","${CHUNK_WORKERS}"${extra}]}]}}
EOF
}

upsert_job() {
  local name="$1"
  local schedule="$2"
  local body_file="$3"

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
printf '%s\n' "$(mk_body price_core_intraday "${extra_universe},\"--session-phase\",\"mid_check\"")" > "${tmp_dir}/intraday.json"
printf '%s\n' "$(mk_body daily_postclose "${extra_universe}")" > "${tmp_dir}/postclose.json"

upsert_job "tikrr-preopen-news" "${CRON_PREOPEN}" "${tmp_dir}/preopen.json"
upsert_job "tikrr-open-price" "${CRON_OPEN_PRICE}" "${tmp_dir}/open_price.json"
upsert_job "tikrr-open-briefs" "${CRON_OPEN_BRIEFS}" "${tmp_dir}/open_briefs.json"
upsert_job "tikrr-open-anomalies" "${CRON_OPEN_ANOMALIES}" "${tmp_dir}/open_anomalies.json"
upsert_job "tikrr-reddit-buzz" "${CRON_REDDIT_BUZZ}" "${tmp_dir}/reddit_buzz.json"
upsert_job "tikrr-intraday-price" "${CRON_INTRADAY}" "${tmp_dir}/intraday.json"
upsert_job "tikrr-postclose" "${CRON_POSTCLOSE}" "${tmp_dir}/postclose.json"

echo "Scheduler jobs ready in ${SCHEDULER_LOCATION}."
