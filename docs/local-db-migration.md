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
GET  /documents/<document-path>       optional ?select=<field>&select=<a.b>
GET  /documents?collection=<top-level-collection>&prefix=<optional-path>&limit=1000
POST /query                           body: collection, filters, orders, select, limit
POST /documents:batchGet              body: {"paths": ["..."], "select": ["..."]}
POST /documents:batchWrite            body: {"operations": [{"op": "set|update|create|delete", "path": "..."}]}
POST /transactions:commit             body: {"reads": {"path": "hash"}, "operations": [...]}
PUT  /documents/<document-path>       body: {"data": {...}, "merge": true}
DELETE /documents/<document-path>
POST /documents:batchUpsert            body: {"documents": [{"path": "...", "data": {...}, "hash": "..."}]}
```

## read metrics

`GET /metrics` (same bearer token; optional `?window=<seconds>` to narrow it) reports what the store was asked for over a rolling in-memory window (`LOCALDB_METRICS_WINDOW_SECONDS`, default 900): totals, then per endpoint (`get`, `list`, `batchGet`, `query`, and the writes) and per collection (with its endpoints), each with request count, documents, response bytes and p50/p95/max latency, largest by bytes first. Collections are labelled with ids replaced by `*` (`users/*/watchlist`), so no user id or ticker is kept. Every 5 minutes (`LOCALDB_METRICS_LOG_SECONDS`, 0 turns it off) the service logs one compact line with the top collections:

```sh
ssh vps 'journalctl -u tikrr-localdb.service --since -1h | grep "localdb metrics"'
ssh vps 'set -a; . /etc/tikrr/localdb.env; curl -s -H "Authorization: Bearer $LOCALDB_API_TOKEN" "127.0.0.1:8500/metrics?window=300" | jq ".collections | to_entries[:10]"'
```

On the web side, `LOCALDB_TRACE=1` logs one line per server request once its store calls go quiet: route, calls (reads and writes), documents, bytes, summed call time and wall span (`lib/localdb-trace.ts`); `LOCALDB_TRACE_FILE=<path>` appends the same as JSON lines. `LOCALDB_READONLY=1` makes the adapter skip every write (logged, never sent), for measuring a local server against the production store. Both are off by default; see docs/edge-cache.md for the per-route table.

`/health` answers `{"ok": true, "service": "localdb", "features": ["select_sql"]}` on a server that applies field masks inside SQLite; an older server omits `features`.

Field masks (`select`) follow Firestore's `select` and `getAll(..., { fieldMask })`: a dotted path returns that value under the same nesting, and a field the document lacks is left out (a stored `null` is kept). On a `select_sql` server the fields are pulled out with `json_extract`, so a large document (a `tm_latest_prices` doc is ~100 KB, nearly all `history_window`) is never decoded in Python or sent; field names that are not plain dotted identifiers fall back to a whole read projected in Python, with the same result. Every server with `/documents:batchGet` has accepted `select` there and on `/query`; older ones project after a whole read, and ignore it on `GET`. The web adapter (`lib/local-firestore.ts`) always sends the mask and projects the answer again, so callers get the same shape from any server version and the app and the store can be deployed in either order.

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
