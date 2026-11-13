vcl 4.1;
# Shared cache between Caddy and the Next instances (moved off Vercel 2026-11-13, which had a CDN in front).
# Only routes that are the same for everyone are cached, honouring their own Cache-Control (s-maxage); every page
# and every signed-in or per-user API passes straight through, so nothing personal can ever be cached here.
import directors;

# No health probe: on a busy box a slow /robots.txt marked both instances sick and Varnish refused every request
# (503 "Backend fetch failed", Nov 13). Two local instances behind a rolling deploy don't need one.
backend web1 { .host = "127.0.0.1"; .port = "3000"; .connect_timeout = 5s; .first_byte_timeout = 120s; .between_bytes_timeout = 60s; }
backend web2 { .host = "127.0.0.1"; .port = "3001"; .connect_timeout = 5s; .first_byte_timeout = 120s; .between_bytes_timeout = 60s; }

sub vcl_init {
  new web = directors.round_robin();
  web.add_backend(web1);
  web.add_backend(web2);
}

sub vcl_recv {
  set req.backend_hint = web.backend();
  # A failed fetch is retried once on the other instance before anyone sees an error.
  if (req.restarts > 0) { set req.backend_hint = web.backend(); }
  if (req.method != "GET" && req.method != "HEAD") { return (pass); }
  if (req.url ~ "^/(_next/static/|api/logo/|api/og/|api/market-daily-cover/|api/markdown/|api/taste|api/ask/example|api/premarket/quotes|api/earnings-day|sitemap\.xml|sitemaps/|robots\.txt|llms\.txt|feed\.xml|docs/search-index\.json)") {
    # Public, identical for everyone: cookies (analytics, the session) don't change these responses.
    unset req.http.Cookie;
    unset req.http.Authorization;
    return (hash);
  }
  return (pass);
}

sub vcl_backend_response {
  # A response that sets a cookie is somebody's: never keep it.
  if (beresp.http.Set-Cookie) { set beresp.uncacheable = true; return (deliver); }
  if (bereq.url ~ "^/_next/static/") { set beresp.ttl = 365d; }
  # Errors are kept for seconds only, so a bad moment never sticks.
  if (beresp.status >= 500) { set beresp.ttl = 5s; }
}

sub vcl_backend_error {
  if (bereq.retries < 1) { return (retry); }
}

sub vcl_deliver {
  if (obj.hits > 0) { set resp.http.X-Cache = "HIT"; } else { set resp.http.X-Cache = "MISS"; }
}
