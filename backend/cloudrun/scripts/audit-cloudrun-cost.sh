#!/usr/bin/env bash
set -euo pipefail

PROJECT="${GOOGLE_CLOUD_PROJECT:-${1:-}}"
REGION="${GOOGLE_CLOUD_REGION:-${2:-us-central1}}"
SCHED_LOC="${SCHEDULER_LOCATION:-${3:-us-central1}}"

if [[ -z "${PROJECT}" ]]; then
  echo "Usage: GOOGLE_CLOUD_PROJECT=<project> $0 [project] [region] [scheduler_location]"
  exit 1
fi

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing required command: $1"; exit 1; }
}

need gcloud
need jq

echo "== Cloud Run cost audit =="
echo "project=${PROJECT} region=${REGION} scheduler_location=${SCHED_LOC}"
echo

echo "## 1) Scheduler inventory"
gcloud scheduler jobs list \
  --location="${SCHED_LOC}" \
  --project="${PROJECT}" \
  --format='table(name,schedule,timeZone,state,httpTarget.uri)'
echo

echo "## 2) Scheduler retry settings (high retry = hidden cost multiplier)"
for job in $(gcloud scheduler jobs list --location="${SCHED_LOC}" --project="${PROJECT}" --format='value(name)'); do
  gcloud scheduler jobs describe "$job" \
    --location="${SCHED_LOC}" \
    --project="${PROJECT}" \
    --format=json | jq -r '[.name, (.retryConfig.retryCount // 0), (.retryConfig.minBackoffDuration // "n/a"), (.retryConfig.maxBackoffDuration // "n/a"), (.attemptDeadline // "n/a")] | @tsv'
done | awk 'BEGIN{print "JOB\tRETRY_COUNT\tMIN_BACKOFF\tMAX_BACKOFF\tATTEMPT_DEADLINE"}{print}'
echo

echo "## 3) Cloud Run jobs resources + retries"
for j in $(gcloud run jobs list --region="${REGION}" --project="${PROJECT}" --format='value(name)'); do
  gcloud run jobs describe "$j" \
    --region="${REGION}" \
    --project="${PROJECT}" \
    --format=json | jq -r '[.name, (.template.template.containers[0].resources.limits.cpu // "n/a"), (.template.template.containers[0].resources.limits.memory // "n/a"), (.template.template.timeout // "n/a"), (.template.template.maxRetries // "n/a"), (.template.taskCount // "n/a"), (.template.parallelism // "n/a")] | @tsv'
done | awk 'BEGIN{print "JOB\tCPU\tMEM\tTIMEOUT\tMAX_RETRIES\tTASKS\tPARALLELISM"}{print}'
echo

echo "## 4) Execution volume by job (last 3 days)"
START_UTC="$(date -u -v-3d +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || python3 - <<'PY'
from datetime import datetime, timedelta, timezone
print((datetime.now(timezone.utc)-timedelta(days=3)).strftime('%Y-%m-%dT%H:%M:%SZ'))
PY
)"

gcloud run jobs executions list \
  --region="${REGION}" \
  --project="${PROJECT}" \
  --format=json \
  --limit=5000 | jq -r --arg start "$START_UTC" '
  map(select(.createTime >= $start))
  | group_by(.job)
  | map({job: (.[0].job|split("/")[-1]), total: length, failed: (map(select(.conditions[]? | (.type=="Completed" and .state!="CONDITION_SUCCEEDED")))|length)})
  | sort_by(-.total)
  | ("JOB\tTOTAL\tFAILED"), (.[] | [.job, .total, .failed] | @tsv)
'
echo

echo "## 5) Intraday shard fanout estimate"
INTRADAY_JOB="tikrr-intraday-price"
if gcloud scheduler jobs describe "${INTRADAY_JOB}" --location="${SCHED_LOC}" --project="${PROJECT}" >/dev/null 2>&1; then
  BODY=$(gcloud scheduler jobs describe "${INTRADAY_JOB}" --location="${SCHED_LOC}" --project="${PROJECT}" --format='value(httpTarget.body)')
  DECODED=$(python3 - <<'PY' "$BODY"
import base64,sys
raw=sys.argv[1].strip()
print(base64.b64decode(raw).decode('utf-8') if raw else '{}')
PY
)
  echo "$DECODED" | jq . >/dev/null 2>&1 || true
  LIMIT=$(echo "$DECODED" | jq -r '.overrides.containerOverrides[0].args as $a | ($a|index("--limit") as $i | if $i==null then "100" else $a[$i+1] end)')
  SHARD=$(echo "$DECODED" | jq -r '.overrides.containerOverrides[0].args as $a | ($a|index("--shard-size") as $i | if $i==null then "20" else $a[$i+1] end)')
  PAR=$(echo "$DECODED" | jq -r '.overrides.containerOverrides[0].args as $a | ($a|index("--max-parallel") as $i | if $i==null then "5" else $a[$i+1] end)')
  python3 - <<'PY' "$LIMIT" "$SHARD" "$PAR"
import math,sys
limit=max(1,int(float(sys.argv[1])))
shard=max(1,int(float(sys.argv[2])))
par=max(1,int(float(sys.argv[3])))
shards=math.ceil(limit/shard)
print(f"intraday limit={limit} shard_size={shard} -> {shards} child job runs/trigger (max_parallel={par})")
PY
else
  echo "scheduler job ${INTRADAY_JOB} not found"
fi

echo
echo "## 6) Recommended immediate cuts"
cat <<'TXT'
1) Set Cloud Scheduler retries to 0 for all dispatch jobs unless you explicitly need retry.
2) Set Cloud Run job max-retries to 0 for heavy fanout jobs (dispatch, price-core-intraday, daily-postclose).
3) Reduce intraday fanout by increasing --shard-size and/or lowering --limit.
4) Keep intraday cadence at */30 or slower unless user growth justifies faster updates.
5) Ensure failed jobs are fixed root-cause (timeouts/provider errors) instead of retried.
TXT
