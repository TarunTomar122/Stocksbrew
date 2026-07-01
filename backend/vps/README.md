# Tikrr VPS jobs

This moves job execution off Cloud Run while keeping Firestore/Firebase and the existing job modules.

Current VPS:

- Host: `vps-148f55ad.vps.ovh.ca`
- IPv4: `144.217.6.112`
- User: `ubuntu`
- Repo dir: `/opt/tikrr`
- Env file: `/etc/tikrr/backend.env`
- Firebase credential path: `/etc/tikrr/firebase-service-account.json`
- Timers installed: yes
- Timers enabled: yes
- Cloud Scheduler: all `tikrr-*` jobs paused in `tikrr-496409/us-central1`
- Service memory cap: `MemoryMax=6G`, `MemorySwapMax=2G`
- Current smoke status: `data_health` and limited `reddit_buzz` succeeded on VPS

## Shape

`systemd timer -> backend/vps/run-dispatch.sh -> backend.cloudrun.orchestrator.dispatch --executor local -> backend/cloudrun/jobs/*`

No job rewrite. The dispatcher still owns lane selection, sharding, Firestore run state, and materialization.

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
GOOGLE_CLOUD_PROJECT=tikrr-496409
GOOGLE_APPLICATION_CREDENTIALS=/etc/tikrr/firebase-service-account.json
LLM_PROVIDER=cerebras
CEREBRAS_API_KEY=...
CONTEXT_DEV_API_KEY=...
TAVILY_API_KEY=...
BREVO_API_KEY=...
EMAILS_ENABLED=0
PAUSE_DIRECTIVE_CHANGE_EMAILS=1
```

Put the Firebase service account at `/etc/tikrr/firebase-service-account.json`, readable by `tikrr`.

For this VPS user, use `ubuntu` instead of `tikrr`.

Manual secret install:

```bash
scp backend/trace-money-72276-firebase-adminsdk-fbsvc-87d8bdd9a5.json ubuntu@144.217.6.112:/tmp/firebase-service-account.json
ssh ubuntu@144.217.6.112 'sudo mv /tmp/firebase-service-account.json /etc/tikrr/firebase-service-account.json && sudo chown ubuntu:ubuntu /etc/tikrr/firebase-service-account.json && chmod 600 /etc/tikrr/firebase-service-account.json'
ssh ubuntu@144.217.6.112 'nano /etc/tikrr/backend.env'
```

Fill:

```bash
CEREBRAS_API_KEY=...
CONTEXT_DEV_API_KEY=...
CONTEXT_API_KEY=...
TAVILY_API_KEY=...
BREVO_API_KEY=...
```

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
ssh ubuntu@144.217.6.112 'TIKRR_ENV_FILE=/etc/tikrr/backend.env /opt/tikrr/backend/vps/run-dispatch.sh reddit_buzz --dry-run'
ssh ubuntu@144.217.6.112 'TIKRR_ENV_FILE=/etc/tikrr/backend.env /opt/tikrr/backend/vps/run-dispatch.sh price_core_open --dry-run --limit 5 --shard-size 2'
ssh ubuntu@144.217.6.112 'sudo systemctl start tikrr-data-health-open.service'
ssh ubuntu@144.217.6.112 'TIKRR_ENV_FILE=/etc/tikrr/backend.env /opt/tikrr/backend/vps/run-dispatch.sh reddit_buzz --reddit-subreddit-batch-size 1 --reddit-cache-hours 120'
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

## Deploy updates

```bash
TIKRR_VPS_HOST=144.217.6.112 bash backend/vps/deploy-code.sh
```

Cutover completed on `2026-07-01`.

First scheduled VPS timer after cutover:

```text
Wed 2026-07-01 09:30:00 UTC tikrr-stock-requests.timer
```

All `tikrr-*` Cloud Scheduler jobs are paused. Do not re-enable Cloud Scheduler while VPS timers are active.
