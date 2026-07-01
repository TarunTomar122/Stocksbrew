# VPS migration plan

Goal: move scheduled backend jobs from Cloud Run to one VPS without changing Firestore, Firebase, frontend, or job business logic.

## What changes

- Cloud Scheduler becomes `systemd` timers.
- Cloud Run job execution becomes local Python subprocess execution.
- `backend/cloudrun/jobs/*.py` stay as the job entrypoints.
- `backend/cloudrun/orchestrator/dispatch.py` stays as the lane/shard orchestrator, using `--executor local` on VPS.

## Cutover steps

1. Provision VPS with 8GB RAM, Python, git, `util-linux`, and a `tikrr` system user.
2. Clone repo to `/opt/tikrr`.
3. Create `.venv` and install `backend/requirements.txt`.
4. Write `/etc/tikrr/backend.env` and Firebase service account JSON.
5. Run:
   ```bash
   sudo TIKRR_REPO_DIR=/opt/tikrr TIKRR_USER=tikrr bash /opt/tikrr/backend/vps/install-systemd.sh
   ```
6. Manually smoke-test non-email lanes:
   ```bash
   sudo -u tikrr /opt/tikrr/backend/vps/run-dispatch.sh reddit_buzz --dry-run
   sudo -u tikrr /opt/tikrr/backend/vps/run-dispatch.sh data_health
   ```
7. Enable write-heavy lanes one by one and compare Firestore outputs against Cloud Run.
8. Disable matching Cloud Scheduler jobs after each VPS lane is verified.
9. Keep Cloud Run jobs for rollback until the VPS runs cleanly for several market days.

## Current state

As of `2026-07-01`:

- VPS `144.217.6.112` is provisioned.
- `/opt/tikrr` has backend code and `.venv`.
- `/etc/tikrr/backend.env` exists.
- `/etc/tikrr/firebase-service-account.json` exists.
- 31 `tikrr-*` service/timer pairs are installed.
- Timers are enabled.
- Tikrr services are capped at `MemoryMax=6G` and `MemorySwapMax=2G`.
- All `tikrr-*` Cloud Scheduler jobs in `tikrr-496409/us-central1` are paused.
- First scheduled VPS timer after cutover: `Wed 2026-07-01 09:30:00 UTC tikrr-stock-requests.timer`.
- `data_health` smoke succeeded.
- Limited `reddit_buzz` smoke succeeded.

## Do not duplicate

Do not run both Cloud Scheduler and VPS timers for these lanes at the same time:

- `open_email`
- `premarket_email`
- `weekly_email`
- `daily_postclose`
- `tracked_open_briefs`
- `tracked_incremental_refresh`
- `earnings_intel`
- `pre_earnings_intel`

These either send emails or rewrite important user-facing docs.

## Rollback

Disable VPS timers:

```bash
sudo systemctl disable --now 'tikrr-*.timer'
```

Re-enable the corresponding Cloud Scheduler jobs.
