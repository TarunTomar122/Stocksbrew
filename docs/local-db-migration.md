# local document store migration

This is the current runtime path for moving Firebase data services to the VPS. It is a small SQLite document store with a Firestore-shaped adapter for the app's reads, writes, batches, transactions, and transforms. Firebase Auth stays in Firebase, and Firebase data remains preserved for rollback and parity checks.

## contract

- The migration script requires an explicit `--collection` or `--collection-group` selector. It never streams the database by accident and never calls a Firebase delete operation.
- It defaults to dry-run. `--apply` is the only flag that writes local SQLite.
- Document IDs and nested paths are stored as paths such as `users/<uid>/watchlist/<id>`.
- Each exported record has a stable SHA-256 hash over its path and canonical JSON data. Firestore values that are not ordinary JSON use `__localdb_type__` tags (for example, timestamps, bytes, references, and geopoints).
- A failed run can be repeated with the same operation checkpoint. Use separate checkpoint paths for Firestore export and archive apply because their checkpoint identities are different. Writes are idempotent and Firebase is never modified.
- Do not delete Firebase data as part of this slice. Cutover and cleanup require separate parity, production, rollback, and user confirmation.

## environment

```text
LOCALDB_PATH=/var/lib/tikrr/localdb/documents.sqlite3
LOCALDB_API_TOKEN=<long-random-token>
LOCALDB_HOST=127.0.0.1
LOCALDB_PORT=8500
LOCALDB_ALLOWED_COLLECTIONS=users,tm_home_view_core
LOCALDB_MIGRATION_CHECKPOINT=/var/lib/tikrr/migrations/checkpoint.json
FIREBASE_PROJECT_ID=<firebase-project-id>
FIREBASE_SERVICE_ACCOUNT_PATH=/etc/tikrr/firebase-service-account.json
```

`FIREBASE_SERVICE_ACCOUNT_JSON` is also accepted, but keep it in the environment and never put it in an export, checkpoint, log, or repository. `LOCALDB_API_TOKEN` is required to start the HTTP service. Bind it to localhost or a private network and put TLS in front of it before exposing it outside the VPS; the token is not encryption.

## run a dry-run and export

Selectors end at a collection. A `*` is allowed only in a document-ID position, so `users/*/watchlist` means the watchlist subcollection for every user document. Use repeatable `--collection-group NAME` flags to select every collection with that ID at any depth, including subcollections whose parent document no longer exists. For example, use `--collection-group stocks` for `tm_stock_intel_pro/*/stocks` and `--collection-group calls` for `tm_directive_history/*/calls`.

```sh
python3 backend/scripts/migrate_firestore_to_local.py \
  --collection users \
  --collection 'users/*/watchlist' \
  --collection tm_home_view_core \
  --collection-group stocks \
  --collection-group calls \
  --checkpoint /var/lib/tikrr/migrations/firebase-export-checkpoint.json \
  --export /var/lib/tikrr/migrations/firebase.jsonl
```

This reads Firebase, writes the explicit export and checkpoint, and does not write SQLite. Review the counts and archive before importing:

```sh
python3 backend/scripts/migrate_firestore_to_local.py \
  --collection users \
  --collection 'users/*/watchlist' \
  --collection tm_home_view_core \
  --collection-group stocks \
  --collection-group calls \
  --checkpoint /var/lib/tikrr/migrations/firebase-import-checkpoint.json \
  --import /var/lib/tikrr/migrations/firebase.jsonl \
  --apply

python3 backend/scripts/verify_local_migration.py \
  --db /var/lib/tikrr/localdb/documents.sqlite3 \
  --manifest /var/lib/tikrr/migrations/firebase.jsonl \
  --collection users \
  --collection 'users/*/watchlist' \
  --collection tm_home_view_core \
  --collection-group stocks \
  --collection-group calls
```

Use a new checkpoint path for a different selector set or archive. `--fresh` starts a new local checkpoint but will not overwrite an existing export file.

## HTTP API

Start it with `python3 -m backend.localdb.server`. `/health` is an unauthenticated liveness probe. Every data endpoint requires `Authorization: Bearer <LOCALDB_API_TOKEN>`.

```text
GET  /documents/<document-path>
GET  /documents?collection=<top-level-collection>&prefix=<optional-path>&limit=1000
POST /query                           body: collection, filters, orders, select, limit
POST /documents:batchGet              body: {"paths": ["..."], "select": ["..."]}
POST /documents:batchWrite            body: {"operations": [{"op": "set|update|create|delete", "path": "..."}]}
POST /transactions:commit             body: {"reads": {"path": "hash"}, "operations": [...]}
PUT  /documents/<document-path>       body: {"data": {...}, "merge": true}
DELETE /documents/<document-path>
POST /documents:batchUpsert            body: {"documents": [{"path": "...", "data": {...}, "hash": "..."}]}
```

The API supports the application-required document reads, collection queries, selected-field reads, batches, transactions, and transforms. It has no listeners or Firestore security rules; the service is authenticated by `LOCALDB_API_TOKEN` and restricted by `LOCALDB_ALLOWED_COLLECTIONS` when configured.

`POST /query` is compiled to SQLite. Collection scope uses `parent_collection` / `collection_id`, filters and `order_by`/`limit` run in SQL (`json_extract` plus an array-membership side table), and Python only decodes the surviving rows. Unbounded HTTP queries are capped at 10,000 documents. The first process to open an older database backfills the new columns and indexes; backup the sqlite file before that restart, which can take a few minutes on the production file.

## current production wiring

- VPS checkout: `/opt/tikrr`, tracking `origin/main`.
- Service: `tikrr-localdb.service`.
- SQLite database: `/srv/tikrr-data/localdb/documents.sqlite3`.
- Listener: `127.0.0.1:8500`.
- Public Vercel-to-VPS URL: the host in `LOCALDB_URL` (`https://<your-localdb-host>`) through Caddy, reverse-proxied to `127.0.0.1:8500`. The Tailscale Funnel URL is retained only as an emergency fallback.
- Vercel environment: `LOCALDB_URL` and `LOCALDB_API_TOKEN` must be set for the deployed environment. Local development uses the ignored `.env.vps.local` file, which is loaded by `lib/firebase-admin.ts`.

After changing `backend/localdb/`, fast-forward the VPS checkout and restart the service:

```sh
ssh vps 'cd /opt/tikrr && git pull --ff-only origin main && sudo systemctl restart tikrr-localdb.service'
```

Verify liveness and the compatibility endpoint before debugging a page:

```sh
curl "$LOCALDB_URL/health"
# With the bearer token, POST a small JSON body to:
# $LOCALDB_URL/documents:batchGet
```

If `/health` is `200` but `/documents:batchGet` is `404`, Vercel can reach the VPS and the running service is stale. Check the VPS revision, update it, restart `tikrr-localdb.service`, and retest. Do not switch the app back to Firebase to mask this deployment mismatch.

## backup and rollback

Use SQLite's online backup API while the service is running and keep the backup on storage with enough free space:

```sh
python3 -c 'from backend.localdb import LocalDocumentStore; LocalDocumentStore("/var/lib/tikrr/localdb/documents.sqlite3").backup_to("/var/lib/tikrr/backups/localdb.sqlite3")'
```

Rollback is explicit: set `FIRESTORE_BACKEND=firebase` in the deployed environment and redeploy, while preserving the local backup. Keep Firebase data untouched until parity and stability are jointly confirmed.
