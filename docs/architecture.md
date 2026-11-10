# architecture

A short map of how a request gets its data, for someone about to change something.

## the pieces

```
  browser
     │  pages (React server components) and /api routes
     v
  Next.js 13.5 app ── Firebase Auth: browser sign-in, session cookie checked by Firebase Admin
     │
     │  lib/firebase-admin.ts exports adminFirestore
     │    LOCALDB_URL + LOCALDB_API_TOKEN set  -> lib/local-firestore.ts (HTTP adapter)
     │    FIRESTORE_BACKEND=firebase           -> real Firestore (rollback only)
     v
  LocalDB (backend/localdb): one SQLite file, Firestore-shaped HTTP API, bearer token
     ^
     │  DocStore.from_env(): SQLite file directly (LOCALDB_PATH) or HTTP
  Python jobs on systemd timers (see docs/data-jobs.md)
```

## web app

- **Routes.** Every product page is under `app/(app)/`. The group's `layout.tsx` draws the shell once (`components/oa/app-chrome.tsx`: sidebar at `lg` and up, top bar and five-tab bar below), so a page renders only its own `<main>`. The landing page is `app/page.tsx`. Old URLs are redirected in `next.config.js`; when you remove a page, add its redirect there.
- **Data.** Pages are server components that call loaders in `lib/` (`lib/briefing-data.ts`, `lib/follow.ts`, `lib/screener.ts`, ...). Loaders read LocalDB through `adminFirestore` and return plain objects. Components never read the store.
- **The read.** Most pages open with three or so sentences that say what the data means today ("Only 2 of 10 rules beat the S&P 500 this year"). They are built from numbers by plain rules in `lib/*-insights.ts`, tested in the matching `*.test.ts`, and rendered by `TheRead` in `components/oa/insight.tsx`. No model writes them.
- **Page kit.** `components/oa/kit/` has the shared building blocks: `AppPage`, `PageHead`, `PageNote`, `SourceLine`, `Panel`, `CardGrid`, `StatStrip`, `TabBar`, `Segmented`, `Chips`, `Tag`, `Ticker`, `Delta`, `Sparkline`, `DataTable`, and the formatters (`fmtMoney`, `fmtCompact`, `fmtDay`, `fmtStampET`, `fmtAgo`). Colors and spacing come from `--oa-*` tokens that only exist under `.oa-app` / `.oa-landing`.
- **Plans.** `lib/entitlements.ts` is the one table of Free and Pro limits. `lib/entitlements-server.ts` (`getViewer`, `canSeeLevels`) applies it on the server, `components/oa/gate.tsx` draws the lock cards from it, and `/pricing` renders it.
- **External surfaces.** `/api/v1/*` (REST, OpenAPI at `/api/v1/openapi.json`), `/api/mcp` with OAuth under `/api/mcp/oauth/*` and `app/.well-known/`, and `packages/stocksbrew-cli`. Treat their shapes as public contracts.
- **Ask.** `app/api/ask` streams answers with tools over the same loaders (`lib/ask-tools.ts`). The model is picked in `lib/ask-llm.ts`: Anthropic, then OpenAI, then OpenRouter; with no key it uses fixed rules in development.
- **Agents.** Job definitions and templates in `lib/agent-jobs.ts`; `scripts/run-agent-jobs.ts` runs every switched-on job after the close and writes a run log.

## LocalDB

`backend/localdb/server.py` serves one SQLite file. Documents are stored by path (`users/<uid>/watchlist/<id>`), queries and batch reads mirror the Firestore calls the app uses. `GET /health` is open; everything else needs `Authorization: Bearer $LOCALDB_API_TOKEN`. Bind it to localhost and put TLS in front of it before exposing it. The contract and migration rules are in `docs/local-db-migration.md`.

If the app logs `LocalDB batch read failed (404)` while `/health` answers 200, the server is running older code than the app expects: update it and restart, don't change the callers.

## jobs

See [`data-jobs.md`](data-jobs.md) for every job, its schedule, the brief pipeline and the call engine flags. Jobs ask the web app to refresh cached pages through `/api/revalidate` (`WEB_REVALIDATE_TOKEN` on the job side, `REVALIDATE_TOKEN` on the app side).

## where to look first

| You want to change | Start in |
|---|---|
| a page | `app/(app)/<page>/page.tsx`, then its folder in `components/` |
| what a page says at the top | `lib/<page>-insights.ts` and its test |
| a limit or what Pro unlocks | `lib/entitlements.ts` |
| where data comes from | the loader in `lib/`, then the job that writes that collection |
| a schedule | `backend/agentdata/schedule.py`, `backend/vps/units/`, `backend/vps/install-systemd.sh` |
| copy | `docs/product-voice.md` first |
