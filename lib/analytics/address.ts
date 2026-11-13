import { clientAddress } from "@/lib/ip-rate-limit";
import { parseIp } from "@/lib/analytics/mmdb";

/**
 * Who is asking, as the proxies in front of the app report it. Production is
 * Cloudflare → Caddy → Varnish → Next (Next listens on localhost only):
 * Cloudflare sends CF-Connecting-IP (the visitor) and CF-IPCountry; Caddy puts
 * Cloudflare's own address first in X-Forwarded-For, so that is only the
 * fallback for a request that reached Caddy directly.
 *
 * A client that hits the origin directly (not through Cloudflare) can set these
 * headers to anything. That is acceptable for aggregate analytics (one person
 * could skew a country or a visitor count). It is never acceptable for auth:
 * the login limiter keys on it too, but the admin gate's lifetime ceiling on
 * wrong passwords (lib/analytics/admin-auth.ts) holds whatever address is claimed.
 */

export function visitorAddress(headers: Headers): string {
  const cf = headers.get("cf-connecting-ip")?.trim();
  if (cf && parseIp(cf)) return cf;
  return clientAddress(headers);
}

/** Cloudflare's country for the visitor ("US"), or null: absent, unknown ("XX") or Tor ("T1"). */
export function cloudflareCountry(headers: Headers): string | null {
  const code = headers.get("cf-ipcountry")?.trim().toUpperCase() ?? "";
  return /^[A-Z]{2}$/.test(code) && code !== "XX" && code !== "T1" ? code : null;
}
