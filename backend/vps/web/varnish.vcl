vcl 4.1;
# Shared cache between Caddy and the Next instances (moved off Vercel 2026-11-13, which had a CDN in front).
#
# Two kinds of things are kept:
#  1. Public files and APIs that are the same for everyone (logos, share images, sitemaps, build files): cookies
#     are dropped and the response's own Cache-Control (s-maxage) decides how long.
#  2. Signed-out HTML pages. A page is kept only when ALL of these hold:
#     - GET/HEAD for a full page load (not a client-router RSC fetch or prefetch), not under /api/;
#     - the request has no tikrr_session cookie, no Authorization header and no cookie other than analytics ones
#       (_ga*, _gid, _gat*, _gcl_*, _fbp, _fbc, ph_*); the analytics cookies are removed before the page is
#       fetched, so the app renders exactly the signed-out view, and they are never part of the cache key;
#     - the app marked the response with Surrogate-Control (middleware.ts + lib/edge-cache-policy.ts, which only
#       does that for cookieless requests to the public pages on its list);
#     - the response sets no cookie and is a 200 (or a 404, kept for a minute).
#     Anything else is passed straight through, so a signed-in page, or anything per person, is never stored.
#     Surrogate-Control gives max-age (TTL), stale-while-revalidate (served stale while one background fetch
#     refreshes it) and stale-if-error (served stale when the app errors or is down).
#
# The app drops pages on demand after the pipeline writes (app/api/revalidate -> BAN below, localhost only).
# Cloudflare sits in front of Caddy: Surrogate-Control never reaches it (stripped in vcl_deliver), and every HTML
# or RSC response tells it Cloudflare-CDN-Cache-Control: no-store, so HTML is cached here and only here.
# Tests: backend/vps/web/varnish-tests/*.vtc (varnishtest).
import directors;
import std;

# No health probe: on a busy box a slow /robots.txt marked both instances sick and Varnish refused every request
# (503 "Backend fetch failed", Nov 13). Two local instances behind a rolling deploy don't need one.
backend web1 { .host = "127.0.0.1"; .port = "3000"; .connect_timeout = 5s; .first_byte_timeout = 120s; .between_bytes_timeout = 60s; }
backend web2 { .host = "127.0.0.1"; .port = "3001"; .connect_timeout = 5s; .first_byte_timeout = 120s; .between_bytes_timeout = 60s; }

# Who may BAN: processes on this box (the Next instances, an operator). Requests through Caddy also come from
# 127.0.0.1, so a BAN must also carry no X-Forwarded-Proto and a one-hop X-Forwarded-For (Caddy always sets both),
# and Caddyfile.web refuses BAN/PURGE outright.
acl local_only { "127.0.0.1"; "::1"; }

sub vcl_init {
  new web = directors.round_robin();
  web.add_backend(web1);
  web.add_backend(web2);
}

sub vcl_recv {
  # Several Cookie lines (HTTP/1.1 clients may send them) become one, so the session check below sees them all.
  std.collect(req.http.Cookie, "; ");
  set req.backend_hint = web.backend();
  # A failed fetch is retried once on the other instance before anyone sees an error.
  if (req.restarts > 0) { set req.backend_hint = web.backend(); }

  if (req.method == "BAN" || req.method == "PURGE") {
    if (!(client.ip ~ local_only) || req.http.X-Forwarded-Proto || req.http.X-Forwarded-For ~ ",") {
      return (synth(405, "Not allowed"));
    }
    # X-Ban-Url: a regex over the stored URL (lib/revalidate-targets.ts varnishBanPattern). The ban expression
    # is split on whitespace and takes quotes literally, so the regex may hold neither (nor backslashes).
    if (!req.http.X-Ban-Url || req.http.X-Ban-Url ~ "[\s\x22\x27\\]") { return (synth(400, "X-Ban-Url missing or invalid")); }
    ban("obj.http.X-Url ~ " + req.http.X-Ban-Url);
    return (synth(200, "Banned"));
  }
  # Internal markers only this file sets: never trust them from a client.
  unset req.http.X-Varnish-Html;
  if (req.restarts == 0) { unset req.http.X-Varnish-Refresh; unset req.http.X-Varnish-Stale-If-Error; }

  if (req.method != "GET" && req.method != "HEAD") { return (pass); }
  if (req.url ~ "^/(_next/static/|api/logo/|api/og/|api/market-daily-cover/|api/markdown/|api/taste|api/ask/example|api/premarket/quotes|api/earnings-day|sitemap\.xml|sitemaps/|robots\.txt|llms\.txt|feed\.xml|docs/search-index\.json)") {
    # Public, identical for everyone: cookies (analytics, the session) don't change these responses.
    unset req.http.Cookie;
    unset req.http.Authorization;
    return (hash);
  }
  call html_candidate;
  return (pass);
}

# Decides whether a page load may be looked up in (and stored to) the cache. Returns (hash) when it may; falls
# through to (pass) in vcl_recv otherwise.
sub html_candidate {
  if (req.url ~ "^/(api|_next)/") { return; }
  # Client-router fetches: their body depends on the router state, and they are cheap for the cached /anon copies.
  if (req.http.RSC || req.http.Next-Router-Prefetch || req.http.Next-Router-State-Tree || req.url ~ "[?&]_rsc=") { return; }
  if (req.http.Authorization) { return; }
  if (req.http.Cookie) {
    # Anyone with a session cookie (even an empty or stale one) gets the live page.
    if (req.http.Cookie ~ "(^|;)\s*tikrr_session=") { return; }
    # Drop analytics cookies; any other cookie left (admin, preview mode, anything new) means pass.
    # (Cloudflare's own bot cookies, __cf_bm, cf_clearance and _cfuvid, count as analytics here: the app never
    # reads them.)
    set req.http.X-Cookie-Rest = regsuball("; " + req.http.Cookie, ";\s*(_ga[A-Za-z0-9_-]*|_gid|_gat[A-Za-z0-9_-]*|_gcl_[A-Za-z0-9_-]+|_fbp|_fbc|ph_[A-Za-z0-9_-]+|__cf_bm|cf_clearance|_cfuvid)=[^;]*", "");
    if (req.http.X-Cookie-Rest !~ "^[;\s]*$") { unset req.http.X-Cookie-Rest; return; }
    unset req.http.X-Cookie-Rest;
    unset req.http.Cookie;
  }
  # The page is either HTML or (for AI agents) Markdown, chosen by middleware.ts from Accept. One HTML variant
  # for every browser: Accept is set to text/html. Markdown and anything unusual go to the app.
  if (req.http.Accept ~ "(?i)text/markdown") { return; }
  if (req.http.Accept && req.http.Accept !~ "(text/html|\*/\*)") { return; }
  set req.http.Accept = "text/html";
  # A country from the client is not to be trusted here, and the cache key has no country in it.
  unset req.http.X-Vercel-IP-Country;
  set req.http.X-Varnish-Html = "1";
  if (req.http.X-Varnish-Refresh) {
    # Past stale-while-revalidate (see vcl_hit): ignore the old copy and fetch a new one in the foreground.
    set req.grace = 0s;
  } else {
    # req.grace survives a restart: lift the limit again so the stale-if-error pass can find the old copy.
    set req.grace = 365d;
  }
  return (hash);
}

sub vcl_hash {
  # URL and host only (the built-in rule, spelled out): no cookie is ever part of the key. Variants by Accept
  # (Vary) collapse to one because vcl_recv normalises Accept for pages.
  hash_data(req.url);
  if (req.http.host) { hash_data(req.http.host); } else { hash_data(server.ip); }
  return (lookup);
}

sub vcl_hit {
  if (req.http.X-Varnish-Html && obj.ttl <= 0s && !req.http.X-Varnish-Stale-If-Error) {
    # Within stale-while-revalidate: serve this copy, Varnish refreshes it in the background.
    if (obj.ttl + std.duration(obj.http.X-Swr + "s", 0s) > 0s) { return (deliver); }
    # Older: fetch a fresh page first; this copy stays for stale-if-error (vcl_synth) if that fails.
    if (req.restarts == 0) {
      set req.http.X-Varnish-Refresh = "1";
      return (restart);
    }
  }
  return (deliver);
}

sub vcl_backend_fetch {
  # Pages only: the app decides from the request whether a response may be kept, so it must see the request
  # Varnish will store. (Static files are fetched as they are.)
  if (bereq.http.X-Varnish-Html) { unset bereq.http.Cookie; }
  # A foreground refresh with an old copy to fall back on: don't hold the visitor for the full two minutes if the
  # app hangs (a cold render takes ~5 s at worst), serve the old copy instead (vcl_synth).
  if (bereq.http.X-Varnish-Refresh) { set bereq.first_byte_timeout = 20s; }
}

sub vcl_backend_response {
  # Where the object came from, for BANs (lurker-friendly: matched on obj.* only).
  set beresp.http.X-Url = bereq.url;
  # A response that sets a cookie is somebody's: never keep it.
  if (beresp.http.Set-Cookie) { set beresp.uncacheable = true; set beresp.ttl = 120s; return (deliver); }
  if (bereq.http.X-Varnish-Html) {
    call html_ttl;
    return (deliver);
  }
  # Build files are content-hashed: a found one never changes. A miss (a new file asked of the old instance during
  # a rolling deploy) must not stick, and the deploy BAN leaves /_next/static/ alone.
  if (bereq.url ~ "^/_next/static/") {
    if (beresp.status == 200) { set beresp.ttl = 365d; } else { set beresp.uncacheable = true; set beresp.ttl = 5s; return (deliver); }
  }
  # Errors are kept for seconds only, so a bad moment never sticks.
  if (beresp.status >= 500) { set beresp.ttl = 5s; }
}

# TTL, grace and stale-if-error for a page, from Surrogate-Control. Without it the page is not kept: a short
# hit-for-miss marker lets later requests for it go to the app at once instead of queueing behind each other.
sub html_ttl {
  if (beresp.status >= 500) {
    # A failed refresh: keep serving the old copy (background refresh) or let vcl_synth find it (foreground).
    if (bereq.is_bgfetch || bereq.http.X-Varnish-Refresh) { return (abandon); }
    set beresp.uncacheable = true;
    set beresp.ttl = 5s;
    return (deliver);
  }
  if (!beresp.http.Surrogate-Control || beresp.http.Surrogate-Control ~ "(?i)no-store|private" || (beresp.status != 200 && beresp.status != 404)) {
    set beresp.uncacheable = true;
    set beresp.ttl = 60s;
    set beresp.grace = 0s;
    return (deliver);
  }
  set beresp.ttl = std.duration(regsub(beresp.http.Surrogate-Control, "^(?:.*[,\s])?max-age=(\d+).*$", "\1") + "s", 0s);
  set beresp.http.X-Swr = regsub(beresp.http.Surrogate-Control, "^(?:.*[,\s])?stale-while-revalidate=(\d+).*$", "\1");
  if (beresp.http.X-Swr !~ "^\d+$") { set beresp.http.X-Swr = "0"; }
  set beresp.grace = std.duration(regsub(beresp.http.Surrogate-Control, "^(?:.*[,\s])?stale-if-error=(\d+).*$", "\1") + "s", 0s);
  # stale-if-error shorter than stale-while-revalidate would cut the background refresh short.
  if (beresp.grace < std.duration(beresp.http.X-Swr + "s", 0s)) { set beresp.grace = std.duration(beresp.http.X-Swr + "s", 0s); }
  # A cached /anon copy built from failed reads says so with a short s-maxage (lib/next-render.ts): honour it.
  if (beresp.http.Cache-Control ~ "s-maxage=\d+") {
    if (std.duration(regsub(beresp.http.Cache-Control, "^.*s-maxage=(\d+).*$", "\1") + "s", 0s) < beresp.ttl) {
      set beresp.ttl = std.duration(regsub(beresp.http.Cache-Control, "^.*s-maxage=(\d+).*$", "\1") + "s", 0s);
    }
  }
  # Next served its own copy past its revalidate time and is rebuilding it now: keep it for a moment only.
  if (beresp.http.x-nextjs-cache == "STALE") { set beresp.ttl = 2s; }
  if (beresp.status == 404 && beresp.ttl > 60s) { set beresp.ttl = 60s; }
  if (beresp.ttl <= 0s) { set beresp.uncacheable = true; set beresp.ttl = 60s; set beresp.grace = 0s; }
}

sub vcl_backend_error {
  # (Not for a refresh with an old copy to serve: that copy is better than a second wait.)
  if (bereq.retries < 1 && !bereq.http.X-Varnish-Refresh) { return (retry); }
  # The app is unreachable while refreshing a page: let vcl_synth serve the old copy (stale-if-error).
  if (bereq.is_bgfetch || bereq.http.X-Varnish-Refresh) { return (abandon); }
}

sub vcl_synth {
  # A foreground refresh failed (vcl_hit -> restart -> 503): go back for the old copy, within stale-if-error.
  if (resp.status == 503 && req.http.X-Varnish-Refresh && !req.http.X-Varnish-Stale-If-Error) {
    unset req.http.X-Varnish-Refresh;
    set req.http.X-Varnish-Stale-If-Error = "1";
    return (restart);
  }
}

sub vcl_deliver {
  if (obj.hits > 0) { set resp.http.X-Cache = "HIT"; } else { set resp.http.X-Cache = "MISS"; }
  if (req.http.X-Varnish-Stale-If-Error) { set resp.http.X-Cache = "STALE-IF-ERROR"; }
  # Cloudflare proxies the site (since Nov 13) and its cache keys on the URL only, never the cookie: it must
  # never keep a page, or a signed-in visitor could be handed a signed-out copy (or worse). Pages and router
  # payloads say so explicitly; Varnish is the only shared cache for HTML. (Build files keep their own headers.)
  if (resp.http.Content-Type ~ "(?i)^text/(html|x-component)") {
    set resp.http.Cloudflare-CDN-Cache-Control = "no-store";
  }
  # Internal to this cache.
  unset resp.http.X-Url;
  unset resp.http.X-Swr;
  unset resp.http.Surrogate-Control;
}
