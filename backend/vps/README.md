# Tikrr VPS jobs

This moves job execution off Cloud Run while keeping Firestore/Firebase and the existing job modules.

Current VPS:

- Host: the `vps` alias in `~/.ssh/config` (the address is not kept in the repo)
- User: `ubuntu`
- Repo dir: `/opt/tikrr`
- Env file: `/etc/tikrr/backend.env`
- Firebase credential path: `/etc/tikrr/firebase-service-account.json`
- Timers installed: yes
- Timers enabled: yes
- Cloud Scheduler: all `tikrr-*` jobs paused in `<gcp-project>/us-central1`
- Service memory cap: `MemoryMax=6G`, `MemorySwapMax=2G`
- Current smoke status: `data_health` and limited `reddit_buzz` succeeded on VPS

## Shape

`systemd timer -> backend/vps/run-dispatch.sh -> backend.cloudrun.orchestrator.dispatch --executor local -> backend/cloudrun/jobs/*`

No job rewrite. The dispatcher still owns lane selection, sharding, Firestore run state, and materialization.

The market-session chains are dependency-driven:

- 09:30 ET price → quotes and home dashboard only
- 09:50 ET settled price → anomaly research → opening email, and alongside it
  the morning briefs, which wait (up to 20 min) for the anomaly stage so they
  can cite today's move reasons, then rewrite only the selected stocks
  (`backend/morning_brief_selection.py`: changed news, |move| ≥ 3% or ≥ 2× the
  3-month typical daily move, a Pro-held stock's fresh earnings, and today's
  anomaly/Reddit names with a brief older than a day; capped at 160)
- 16:10 ET post-close prices/read models → changed closing briefs → anomalies

There are no independent brief, zone-brief or close-anomaly timers. Every
market-tied timer names `America/New_York`; `backend/tests/test_install_systemd.py`
pins the schedule. Preview the morning selection without writing anything:

```bash
sudo -u ubuntu /opt/tikrr/backend/vps/run-dispatch.sh tracked_open_briefs --session-phase open_check --dry-run
```

## One-time VPS setup

```bash
sudo apt-get update
sudo apt-get install -y git python3 python3-venv python3-pip build-essential util-linux
sudo useradd --system --create-home --shell /bin/bash tikrr || true
sudo mkdir -p /opt /etc/tikrr
sudo chown tikrr:tikrr /opt
```

Clone and install:

```bash
sudo -u tikrr git clone <repo-url> /opt/tikrr
cd /opt/tikrr
sudo -u tikrr python3 -m venv .venv
sudo -u tikrr .venv/bin/pip install -r backend/requirements.txt
```

Create `/etc/tikrr/backend.env`:

```bash
TIKRR_REPO_DIR=/opt/tikrr
TIKRR_LOCK_DIR=/tmp/tikrr-locks
GOOGLE_CLOUD_PROJECT=<gcp-project>
GOOGLE_APPLICATION_CREDENTIALS=/etc/tikrr/firebase-service-account.json
LLM_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.6-luna
LLM_ENRICHMENT_PROVIDER=openai
LLM_ENRICHMENT_MODEL=gpt-5.6-luna
STOCK_BRIEF_PROVIDER=openai
STOCK_BRIEF_MODEL=gpt-5.6-luna
STOCK_BRIEF_REASONING_EFFORT=low
SEC_USER_AGENT=Stocksbrew Radar your-real-contact@example.com
CONTEXT_DEV_API_KEY=...
TAVILY_API_KEY=...
BREVO_API_KEY=...
EMAILS_ENABLED=0
PAUSE_DIRECTIVE_CHANGE_EMAILS=1
```

Put the Firebase service account at `/etc/tikrr/firebase-service-account.json`, readable by `tikrr`.

The pre-market materialization lane also requires a shared web revalidation
secret. Keep it outside the repository at `/etc/tikrr/web-revalidate-token`
(`0600`) and install the same value as the Vercel Production environment
variable `REVALIDATE_TOKEN`. `run-dispatch.sh` loads the file as
`WEB_REVALIDATE_TOKEN` and targets Varnish on the box (`http://127.0.0.1:6081`) by default.
The scheduled lane treats a failed final page refresh as a job failure and does
not proceed to email delivery.

Provision a new shared value without printing it:

```bash
umask 077
openssl rand -out /etc/tikrr/web-revalidate-token -hex 32
vercel env add REVALIDATE_TOKEN production --force < /etc/tikrr/web-revalidate-token
```

Redeploy Vercel after changing `REVALIDATE_TOKEN`.

Self-hosted (backend/vps/web/), the same value goes in `/etc/tikrr/web.env` as
`REVALIDATE_TOKEN`, next to `REVALIDATE_PEERS=http://localhost:3000,http://localhost:3001`
and `VARNISH_BAN_URL=http://127.0.0.1:6081`, then restart `tikrr-web@3000` and
`tikrr-web@3001`. Every lane in `backend/cloudrun/orchestrator/dispatch.py`
`LANE_REVALIDATE_KINDS` and every agent data group (`run-agentdata.sh`) then
refreshes the cached pages it writes for; see docs/edge-cache.md.

For this VPS user, use `ubuntu` instead of `tikrr`.

Manual secret install:

```bash
scp backend/firebase-service-account.json vps:/tmp/firebase-service-account.json
ssh vps 'sudo mv /tmp/firebase-service-account.json /etc/tikrr/firebase-service-account.json && sudo chown ubuntu:ubuntu /etc/tikrr/firebase-service-account.json && chmod 600 /etc/tikrr/firebase-service-account.json'
ssh vps 'nano /etc/tikrr/backend.env'
```

Fill:

```bash
OPENAI_API_KEY=...
SEC_USER_AGENT=Stocksbrew Radar your-real-contact@example.com
CONTEXT_DEV_API_KEY=...
CONTEXT_API_KEY=...
TAVILY_API_KEY=...
BREVO_API_KEY=...
```

Radar official sources also require a curated IR allowlist. Validate entries
before writing them:

```bash
python3 -m backend.scripts.sync_radar_source_registry \
  --entry US_AAPL=https://investor.apple.com/ \
  --entry US_MSFT=https://www.microsoft.com/en-us/Investor/ \
  --write
```

`--include-ir` uses the Firecrawl endpoint configured for `url_extractor.py`;
confirm that endpoint is reachable from the VPS. SEC ingestion works
independently when no IR URLs are registered.

Install timers without enabling:

```bash
sudo TIKRR_REPO_DIR=/opt/tikrr TIKRR_USER=ubuntu ENABLE_TIMERS=0 bash /opt/tikrr/backend/vps/install-systemd.sh
```

Install and enable timers:

```bash
sudo TIKRR_REPO_DIR=/opt/tikrr TIKRR_USER=ubuntu ENABLE_TIMERS=1 bash /opt/tikrr/backend/vps/install-systemd.sh
```

## Manual tests

```bash
sudo -u tikrr TIKRR_ENV_FILE=/etc/tikrr/backend.env /opt/tikrr/backend/vps/run-dispatch.sh reddit_buzz --dry-run
sudo -u tikrr TIKRR_ENV_FILE=/etc/tikrr/backend.env /opt/tikrr/backend/vps/run-dispatch.sh price_core_open --dry-run --limit 5 --shard-size 2
```

For a real smoke write, start with `reddit_buzz` or `data_health`; do not run email lanes until `EMAILS_ENABLED=1` is intentional.

Smoke commands already run successfully on `2026-07-01`:

```bash
ssh vps 'TIKRR_ENV_FILE=/etc/tikrr/backend.env /opt/tikrr/backend/vps/run-dispatch.sh reddit_buzz --dry-run'
ssh vps 'TIKRR_ENV_FILE=/etc/tikrr/backend.env /opt/tikrr/backend/vps/run-dispatch.sh price_core_open --dry-run --limit 5 --shard-size 2'
ssh vps 'sudo systemctl start tikrr-data-health-open.service'
ssh vps 'TIKRR_ENV_FILE=/etc/tikrr/backend.env /opt/tikrr/backend/vps/run-dispatch.sh reddit_buzz --reddit-subreddit-batch-size 1 --reddit-cache-hours 120'
```

Observed successful write jobs:

- `data_health_US_20260701T085457Z`
- `reddit_buzz_US_20260701T085526Z`

## Operate

```bash
systemctl list-timers 'tikrr-*'
journalctl -u tikrr-reddit-buzz.service -n 200
systemctl start tikrr-reddit-buzz.service
systemctl disable --now tikrr-reddit-buzz.timer
systemctl show tikrr-reddit-buzz.service -p MemoryMax -p MemorySwapMax
```

## Free/Pro line flag

`PAYWALL_V2=1` switches the tighter Free/Pro line (lib/paywall-flag.ts). The mail jobs and the agent runner read it
(`backend/subscription_entitlement.py`: Free covers 3 stocks, not 5), so it goes into the backend env file on this box
in the same change as the Vercel variable and a redeploy (it is inlined at build time). One without the other means
the emails cover five stocks while the app covers three, or the other way round. To roll back, remove it from both.

## Deploy updates

`/opt/tikrr` is a normal Git checkout. GitHub is the source of truth; do not
rsync source files into production.

From local after pushing:

```bash
bash backend/vps/deploy-code.sh   # uses the `vps` alias from ~/.ssh/config, or set TIKRR_VPS_HOST
```

Or directly on the VPS:

```bash
cd /opt/tikrr
git pull --ff-only
.venv/bin/pip install -r backend/requirements.txt
sudo TIKRR_REPO_DIR=/opt/tikrr TIKRR_USER=ubuntu ENABLE_TIMERS=1 bash backend/vps/install-systemd.sh
```

To work on the VPS:

```bash
cd /opt/tikrr
git pull --ff-only
# edit, test, commit
git push origin main
```

Then pull locally. Runtime secrets stay outside the repo in `/etc/tikrr`.

Cutover completed on `2026-07-01`.

Git checkout cutover completed on `2026-07-04`.

Rollback for the Git checkout cutover:

```bash
sudo systemctl stop 'tikrr-*.timer'
sudo mv /opt/tikrr /opt/tikrr.failed
sudo mv /opt/tikrr.pre-git-20260704T031012Z /opt/tikrr
sudo TIKRR_REPO_DIR=/opt/tikrr TIKRR_USER=ubuntu ENABLE_TIMERS=1 bash /opt/tikrr/backend/vps/install-systemd.sh
```

First scheduled VPS timer after cutover:

```text
Wed 2026-07-01 09:30:00 UTC tikrr-stock-requests.timer
```

All `tikrr-*` Cloud Scheduler jobs are paused. Do not re-enable Cloud Scheduler while VPS timers are active.
