# LocalDB backups and restore

The store (`/var/lib/tikrr/localdb/documents.sqlite3`, 4.4 GB in Nov 2026) is backed up every night at 03:30 New York by `tikrr-localdb-backup.timer`. Code: `backend/ops/localdb_backup.py`, run through `backend/vps/backup-localdb.sh`. Install: `sudo bash /opt/tikrr/backend/vps/install-ops.sh`.

## what a backup is

- An online copy through SQLite's backup API, one read snapshot, taken while the server keeps serving. Never `cp` of the live file.
- Staged next to the live database (fast disk, `/var/lib/tikrr/backup-staging`), checked with `PRAGMA quick_check` and a document count, then streamed through zstd (gzip when zstd is missing) onto the slow volume, and read back once to prove the archive gives the same bytes.
- Kept in `/srv/tikrr-data/backups/localdb/`: `daily/` (newest 7) and `weekly/` (newest 4, Sunday nights, one per New York day; hard links, so a weekly costs no extra space while its daily is still kept). Each archive has a `.json` manifest: sizes, both SHA-256 hashes, the check result, document count and how long each step took. `latest.json` holds the last run, good or failed; the health check reads it.
- It refuses to start, with the numbers, when space is short: the copy plus a WAL reserve (a quarter of the database, at least 1 GB, because the live WAL cannot be checkpointed while the copy holds its snapshot) plus 2 GB spare next to the live database, and the expected archive plus 2 GB on the backup volume. With the fast disk short it stages on the backup volume instead (slower check).
- Low priority: nice 19, idle CPU and IO class, bandwidth caps, and a 768 MB memory cap so its page cache cannot push LocalDB's hot pages out. Roughly 5 minutes in all.
- Old archives are pruned only after the new one has passed every check, and only files the job named.
- Files are 0600 and folders 0750, owned by ubuntu: the store holds account data.

## everyday commands

```sh
bash backend/vps/ops.sh backups        # what is kept
bash backend/vps/ops.sh backup-now     # one now, through the unit
bash backend/vps/ops.sh status         # the backup is one of the checks (amber after 26 h, red after 50 h)
journalctl -u tikrr-localdb-backup -n 30
```

## look inside a backup (production untouched)

```sh
bash backend/vps/ops.sh restore latest                  # or a file name from `backups`
```

It decompresses into `/srv/tikrr-data/restore/documents-<time>.sqlite3` and checks the hash against the manifest (the copy passed quick_check when it was taken; add `--quick-check` to run it again, slow on that disk). Open it read-only, compare what you need, delete it when done. It never writes over an existing file or the live database.

## put a backup back into production

Only when the live store is damaged or a bad write has to be undone. Everything written after the archive was taken is lost from the live store (it stays in the old file, which is kept).

```sh
bash backend/vps/ops.sh restore latest --production          # prints the plan, changes nothing
bash backend/vps/ops.sh restore latest --production --yes    # does it, as the systemd unit tikrr-localdb-restore
```

It runs as its own unit (`sudo journalctl -fu tikrr-localdb-restore` to follow), so a dropped ssh connection cannot stop it halfway; restore-localdb.sh refuses `--production --yes` outside a unit. In order: decompress next to the live file and check it (hash + quick_check) while everything still runs; pause the tikrr-* timers and wait up to 10 minutes for running jobs; stop `tikrr-localdb`; move the live file (and any -wal/-shm) to `documents.sqlite3.pre-restore-<time>`; move the restored copy in; start `tikrr-localdb` and wait for `/health`; restart the timers. If LocalDB does not come back healthy the old file is put back on its own. Pages that need the store fail between the stop and the start (under a minute).

Afterwards:

1. `bash backend/vps/ops.sh status`: services green, data freshness catching up as the timers run.
2. Varnish keeps signed-out pages for minutes; to drop them now: `curl -X BAN -H 'X-Ban-Url: ^/(?!_next/static/)' http://127.0.0.1:6081/` on the VPS.
3. When the restored store looks right, delete `documents.sqlite3.pre-restore-<time>` or move it to `/srv/tikrr-data` (the system disk has about 12 GB free).

Firebase is untouched by all of this and stays available for rollback as before (docs/local-db-migration.md).

## if a backup fails

`latest.json` says why (`error`) and keeps the last good one (`last_ok`); the health check turns amber, then red after two nights. Common causes: space (the message has the numbers; the old copies listed in docs/ops-audit.md free several GB), the unit's 3 h limit, or a damaged live file (quick_check fails: restore the last good archive).
