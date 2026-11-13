# signed-out pages from the cache, refreshed when the data changes

Nov 13, 2026. The goal: a page view costs near-zero database work. A signed-out visitor is answered by Varnish without touching Next or LocalDB; the pipeline drops exactly the pages it just changed, so the cache can hold pages for minutes without showing old numbers.

## the path of a request

```
browser -> Cloudflare (keeps build files, never pages) -> Caddy (HTTPS, refuses BAN/PURGE) -> Varnish 127.0.0.1:6081 -> tikrr-web@3000 / @3001 (Next) -> LocalDB 127.0.0.1:8500
```

1. **Middleware** (`middleware.ts`) looks at every page request. A GET/HEAD with no `tikrr_session` cookie, not from the client router (no `RSC`/`Next-Router-*` header, no `_rsc` query), for a page on the public list in `lib/edge-cache-policy.ts`, gets a `Surrogate-Control` header with `max-age`, `stale-while-revalidate` and `stale-if-error`. The busiest of those pages are also rewritten to their prebuilt signed-out copies (`lib/anon-view.ts`, `/anon/1/...`), which Next keeps for a minute (ISR).
2. **Varnish** (`backend/vps/web/varnish.vcl`) stores a page only when all of these hold: no session cookie, no `Authorization`, no cookie other than analytics ones (`_ga*`, `_gid`, `_gat*`, `_gcl_*`, `_fbp`, `_fbc`, `ph_*`, which it removes before fetching, so they never reach the app or the cache key); the response carries `Surrogate-Control`, sets no cookie, and is a 200 (or a 404, kept a minute at most). Everything else passes straight through.
3. **Grace.** Past `max-age` and within `stale-while-revalidate`, the old copy is served at once and one background fetch refreshes it. Past that, the page is fetched first; if the app answers 5xx or is unreachable, the old copy is served instead (`X-Cache: STALE-IF-ERROR`) for up to `stale-if-error`.
4. **On-demand refresh** (below) drops pages when their data changes, so `max-age` is only the backstop.

Why `Surrogate-Control` and not `Cache-Control`: Next 13.5 overwrites Cache-Control on every app page (`private, no-store` on live renders, `s-maxage=60, stale-while-revalidate` on the /anon copies). Surrogate-Control is the header for a cache the site runs itself; Varnish strips it before the response leaves, and Vercel's CDN ignores it (Vercel does read `CDN-Cache-Control`, and its cache does not look at cookies, so that header would serve a signed-out copy to signed-in visitors after a rollback).

**Cloudflare** proxies www since Nov 13 and caches build files at its edge. Its cache keys on the URL, not the cookie, so it must never hold a page: Varnish strips `Surrogate-Control` before a response leaves, and adds `Cloudflare-CDN-Cache-Control: no-store` to every HTML and RSC response (cached or passed). The /anon copies still carry Next's `Cache-Control: s-maxage=60`, which Cloudflare would otherwise be allowed to act on with a Cache Everything rule; the targeted header wins over it. HTML is cached in Varnish and only there.

### never personal

- The decision is made twice, independently: the app only marks cookieless requests, and Varnish only looks up or stores cookieless requests. A marked response to a request with a session cookie is still never stored (`varnish-tests/privacy.vtc` case 2).
- No cookie is ever part of the cache key (`vcl_hash` is URL + host). Accept is collapsed to `text/html` for pages (Markdown for agents is passed), and a client-sent `X-Vercel-IP-Country` is removed, so nobody can plant an India view.
- A response that sets a cookie is never stored. Neither is a redirect, a 5xx, or a page without the header.
- URLs with personal query keys (`token`, `session_id`, `subscription_id`, `code`, `state`, `email`, ...) are never marked.
- `/premarket` is not on the list: middleware sends it to Market today from the 9:30 open, and a cached 200 would outlive that switch.
- Only pages on the list are marked. Anything under `/portfolio/*` (except the example `/portfolio`), `/inbox`, `/agents`, `/profile`, `/ask`, `/admin`, `/s/*`, `/baskets/*` and every `/api/*` route other than the old public files list is passed.

Tests: `lib/edge-cache-policy.test.ts` (the list and the middleware), `backend/vps/web/varnish-tests/*.vtc` (run with `bash backend/vps/web/varnish-tests/run.sh`; needs varnishtest from `apt install varnish` or `brew install varnish`).

## how long

`lib/edge-cache-policy.ts`, sized to how often the data under a page changes:

| pages | max-age | stale-while-revalidate | stale-if-error | why |
|---|---|---|---|---|
| `/`, `/briefing`, `/explore`, `/news`, `/screener`, `/portfolio` (example), `/stock/<T>` (+ earnings, moves, research), `/markets*`, `/sectors*`, `/themes*`, `/compare/<pair>` | 5 min | 15 min | 1 day | prices land ~10 times a weekday, briefs at the open and close, news every 5 minutes |
| `/signals`, `/filings`, `/insiders*`, `/follow*` | 15 min | 1 h | 1 day | Reddit 4 times a day, the President daily, filings hourly (each refresh drops them anyway) |
| `/calendar*`, `/best*`, `/strategies*`, `/agent` | 30 min | 1 h | 1 day | twice a day |
| `/pricing`, `/blog*`, `/docs*`, `/legal*`, `/about`, `/security`, `/developers`, `/movers/<date>` | 1 h | 1 day | 1 week | change with a deploy |

The /anon copies add Next's own minute on top (a copy Next is rebuilding is kept by Varnish for 2 seconds only; one built from failed reads keeps its 10-second life).

## on-demand refresh

```
pipeline lane finishes (dispatch.py)  ─┐
agent data group finishes (run-agentdata.sh) ─┤
                                      └─> backend/scripts/trigger_web_revalidate.py revalidate_after_write(kinds)
                                           POST http://127.0.0.1:6081/api/revalidate  {kinds, symbols?}
                                           (x-revalidate-token = REVALIDATE_TOKEN)
                                             │  lands on one instance
                                             ├─> POST http://localhost:3000/api/revalidate  (x-revalidate-scope: local)
                                             ├─> POST http://localhost:3001/api/revalidate  (x-revalidate-scope: local)
                                             │      each: revalidatePath(page) for every page, revalidatePath(route,"page")
                                             │      for whole families, revalidateTag(data tag)
                                             └─> BAN http://127.0.0.1:6081/  X-Ban-Url: ^(?:(?:/news|/briefing)(?:[?]|$)|/(?:stock)(?:/|[?]|$))
```

- **Kinds** (`lib/revalidate-targets.ts`): `prices`, `briefs`, `news`, `earnings`, `filings`, `signals`, `calendar`, `themes`, `premarket`, each mapped to its pages, whole families (`stock` = every `/stock/<T>`), and data tags. Callers can also send `symbols` (just those stock pages) or explicit `paths` (the pre-market lane still does).
- **Which writers**: `LANE_REVALIDATE_KINDS` in `backend/cloudrun/orchestrator/dispatch.py` (price lanes, post-close, briefs, anomalies, contrarian calls, news, earnings, official filings, Reddit, the President, market events, themes) and the agent data groups in `backend/vps/run-agentdata.sh` (news every 30 minutes, filings and calendar hourly, prices and earnings after the close, earnings on report days, extended-hours prices at most every 30 minutes, weekly filings).
- **Why every instance**: each Next process keeps its own copy of the cache-tag state in memory, so a refresh on one instance would leave the other serving the old copy. The /anon copies carry the public address as their tag (`_N_T_/stock/NVDA`), so `revalidatePath("/stock/NVDA")` drops the copy and every `unstable_cache` entry read while rendering it; the next request rebuilds it before answering.
- **Batched**: one call per lane run; tickers go in chunks of 200.
- **Rate-limited**: per instance, a page refreshed in the last 30 s is skipped (`force: true` overrides); per kind on the box, `on_demand_news` (every 5 minutes) sends at most every 10 minutes and the extended-hours group at most every 30 (stamp files in `/tmp/tikrr-locks`). When every instance skipped, no BAN is sent.
- **Best effort**: `revalidate_after_write` never raises; a peer that does not answer (restarting) is skipped, and if none answers the receiving instance refreshes itself; a failed BAN leaves pages to expire on their own.
- **BAN is local only**: Varnish accepts BAN/PURGE only from 127.0.0.1/::1, with no `X-Forwarded-Proto` and a one-hop `X-Forwarded-For` (Caddy always sets both), and Caddy answers 405 to those methods from the internet. The pattern may not contain spaces, quotes or backslashes.
- Deploys BAN everything except `/_next/static/` after both instances run the new build, then warm the busiest pages through Varnish (`backend/vps/web/deploy-web.sh`).

Settings, in `/etc/tikrr/web.env`:

```
REVALIDATE_TOKEN=<same value as /etc/tikrr/web-revalidate-token>
REVALIDATE_PEERS=http://localhost:3000,http://localhost:3001
VARNISH_BAN_URL=http://127.0.0.1:6081
```

Without `REVALIDATE_PEERS` (local dev, Vercel) the receiving instance refreshes only itself; without `VARNISH_BAN_URL` no BAN is sent.

## measuring

- LocalDB: `GET /metrics` and the 5-minute `localdb metrics` log line (docs/local-db-migration.md, "read metrics").
- Web: `LOCALDB_TRACE=1` (or `LOCALDB_TRACE_FILE=<path>`) logs, per server request, route, LocalDB calls, documents, bytes and time (`lib/localdb-trace.ts`). `LOCALDB_READONLY=1` skips every write, for running a local server against the production store.
- Varnish: `varnishstat -1 -f MAIN.cache_hit -f MAIN.cache_miss -f MAIN.cache_hitmiss -f MAIN.s_pass -f MAIN.backend_req`, and `varnishlog -g request -q 'ReqURL ~ "^/stock/"'` for one page.
