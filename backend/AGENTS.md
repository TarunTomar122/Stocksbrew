# Backend Agent Notes

Backend jobs now run on the OVH VPS, not Cloud Run. Firestore/Firebase still stay on Google.

## Before Editing

- Treat `backend/` changes as production job changes.
- Check whether the file is used by a scheduled lane under `backend/cloudrun/jobs/`, `backend/cloudrun/orchestrator/`, or `backend/scripts/`.
- Do not assume a GitHub push deploys backend jobs. It does not.

## After Editing Backend Jobs

1. Run the smallest local check that covers the changed code.
2. Sync code to the VPS:

```bash
TIKRR_VPS_HOST=144.217.6.112 bash backend/vps/deploy-code.sh
```

3. If the changed lane is safe to smoke-run, run it on the VPS:

```bash
ssh ubuntu@144.217.6.112 'TIKRR_ENV_FILE=/etc/tikrr/backend.env /opt/tikrr/backend/vps/run-dispatch.sh <lane> --dry-run'
```

4. For one-off file syncs only, copy the exact changed file to `/opt/tikrr/...` and verify it remotely. Prefer `deploy-code.sh` when more than one file changed.

## VPS Facts

- Host: `144.217.6.112`
- User: `ubuntu`
- Repo: `/opt/tikrr`
- Env: `/etc/tikrr/backend.env`
- Firebase credentials: `/etc/tikrr/firebase-service-account.json`
- Timers: `systemd` units named `tikrr-*`
- Logs: `journalctl -u tikrr-<lane>.service -n 200`

## Important

- Cloud Scheduler `tikrr-*` jobs are paused. Do not re-enable them while VPS timers are active.
- Do not commit secrets. Local VPS credentials live in `backend/vps/LOCAL_SECRETS.md`, which is ignored.
- If a backend fix matters for scheduled production behavior, the task is not done until the VPS has the updated code.

