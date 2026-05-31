#!/usr/bin/env bash
set -euo pipefail

PROJECT="${GOOGLE_CLOUD_PROJECT:-${1:-}}"
REGION="${GOOGLE_CLOUD_REGION:-${2:-us-central1}}"
SCHED_LOC="${SCHEDULER_LOCATION:-${3:-us-central1}}"
EXECUTION_LIMIT="${EXECUTION_LIMIT:-100}"

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

tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT
scheduler_json="${tmp_dir}/scheduler.json"
run_jobs_json="${tmp_dir}/run_jobs.json"
executions_json="${tmp_dir}/executions.json"

gcloud scheduler jobs list --location="${SCHED_LOC}" --project="${PROJECT}" --format=json > "${scheduler_json}"
gcloud run jobs list --region="${REGION}" --project="${PROJECT}" --format=json > "${run_jobs_json}"

echo "## 1) Scheduler inventory"
jq -r '
  ("JOB\tSCHEDULE\tTIME_ZONE\tSTATE\tURI"),
  (.[] | [(.name|split("/")[-1]), .schedule, .timeZone, .state, (.httpTarget.uri // "")] | @tsv)
' "${scheduler_json}"
echo

echo "## 2) Scheduler retry settings (high retry = hidden cost multiplier)"
jq -r '
  ("JOB\tRETRY_COUNT\tMIN_BACKOFF\tMAX_BACKOFF\tATTEMPT_DEADLINE"),
  (.[] | [(.name|split("/")[-1]), (.retryConfig.retryCount // 0), (.retryConfig.minBackoffDuration // "n/a"), (.retryConfig.maxBackoffDuration // "n/a"), (.attemptDeadline // "n/a")] | @tsv)
' "${scheduler_json}"
echo

echo "## 2b) Decoded scheduler dispatch args"
python3 - <<'PY' "${scheduler_json}"
import base64, json, sys
rows = json.load(open(sys.argv[1]))
print("JOB\tLANE\tLIMIT\tSHARD_SIZE\tMAX_PARALLEL\tSESSION_PHASE\tDUPLICATE_ARGS")
def val(flag, default=""):
    try:
        i = args.index(flag)
        return args[i + 1]
    except Exception:
        return default
for row in rows:
    job = str(row.get("name", "")).split("/")[-1]
    raw = str(((row.get("httpTarget") or {}).get("body")) or "").strip()
    try:
        payload = json.loads(base64.b64decode(raw).decode("utf-8")) if raw else {}
        args = payload.get("overrides", {}).get("containerOverrides", [{}])[0].get("args", [])
    except Exception as exc:
        print(f"{job}\tdecode_error\t\t\t\t\t{exc}")
        continue
    dupes = []
    if args.count("--limit") > 1:
        dupes.append("--limit")
    if args.count("--per-stock-cap") > 1:
        dupes.append("--per-stock-cap")
    print("\t".join([
        job,
        val("--lane"),
        val("--limit"),
        val("--shard-size"),
        val("--max-parallel"),
        val("--session-phase"),
        ",".join(dupes),
    ]))
PY
echo

echo "## 3) Cloud Run jobs resources + retries"
jq -r '
  ("JOB\tCPU\tMEM\tTIMEOUT\tMAX_RETRIES\tTASKS\tPARALLELISM"),
  (.[] |
      [
        (.metadata.name // .name),
        (.spec.template.spec.template.spec.containers[0].resources.limits.cpu // .template.template.containers[0].resources.limits.cpu // "n/a"),
        (.spec.template.spec.template.spec.containers[0].resources.limits.memory // .template.template.containers[0].resources.limits.memory // "n/a"),
        (.spec.template.spec.template.spec.timeoutSeconds // .template.template.timeout // "n/a"),
        (.spec.template.spec.template.spec.maxRetries // .template.template.maxRetries // "n/a"),
        (.spec.template.spec.taskCount // .template.taskCount // "n/a"),
        (.spec.template.spec.parallelism // .template.parallelism // "n/a")
      ] | @tsv)
' "${run_jobs_json}"
echo

echo "## 4) Execution volume by job (last 3 days)"
START_UTC="$(python3 - <<'PY'
from datetime import datetime, timedelta, timezone
print((datetime.now(timezone.utc)-timedelta(days=3)).strftime('%Y-%m-%dT%H:%M:%SZ'))
PY
)"

gcloud run jobs executions list \
  --region="${REGION}" \
  --project="${PROJECT}" \
  --format=json \
  --limit="${EXECUTION_LIMIT}" > "${executions_json}"
jq -r --arg start "$START_UTC" '
  map(. + {_created: (.createTime // .metadata.creationTimestamp // "")})
  | map(select(._created >= $start))
  | map(. + {
      _job: (.metadata.labels["run.googleapis.com/job"] // .job // "unknown"),
      _completed: ((.status.conditions // .conditions // []) | map(select(.type=="Completed")) | .[0].status // "")
    })
  | sort_by(._job)
  | group_by(._job)
  | map({job: .[0]._job, total: length, failed: (map(select(._completed != "True"))|length)})
  | sort_by(-.total)
  | ("JOB\tTOTAL\tFAILED"), (.[] | [.job, .total, .failed] | @tsv)
' "${executions_json}"
echo

echo "## 5) Intraday ranked-core fanout knobs"
INTRADAY_JOB="tikrr-intraday-price"
BODY=$(jq -r --arg job "${INTRADAY_JOB}" '.[] | select((.name|split("/")[-1]) == $job) | .httpTarget.body // ""' "${scheduler_json}" | head -1)
if [[ -n "${BODY}" ]]; then
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
print(f"intraday ranked_core_limit={limit} shard_size={shard} -> at least {shards} child job runs/trigger before price_core_overrides (max_parallel={par})")
PY
else
  echo "scheduler job ${INTRADAY_JOB} not found"
fi

echo
echo "## 6) Recommended immediate cuts"
cat <<'TXT'
1) Set Cloud Scheduler retries to 0 for all dispatch jobs unless you explicitly need retry.
2) Set Cloud Run job max-retries to 0; workers should recover from Firestore state instead of replaying partial writes.
3) Reduce intraday fanout burst with --shard-size/--max-parallel. Do not treat --limit as total coverage; overrides must remain included.
4) Keep intraday price coverage broad, but do not rebuild all user watchlists/directive emails on every intraday tick.
5) Replace 10-minute on-demand polling with immediate API dispatch plus hourly Scheduler backup.
6) Ensure failed jobs are fixed root-cause (timeouts/provider errors) instead of retried.
TXT
