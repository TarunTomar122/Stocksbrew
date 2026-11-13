import { promises as dns } from "dns";
import { isIP } from "net";
import { NextRequest } from "next/server";

import { ADMIN_COOKIE, adminConfigured, verifyAdminCookie } from "@/lib/analytics/admin-auth";
import { parseIp } from "@/lib/analytics/mmdb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A referrer's favicon for /admin/analytics, fetched by the server from the
 * site itself (https://<host>/favicon.ico), so the owner's list of referrers
 * never goes to a third-party icon service. Admin cookie only. Hosts are plain
 * public domain names (no addresses, no ports), and every address they resolve
 * to must be public, so the server can't be pointed at anything internal.
 * Anything that fails is a 404 and the page shows the site's first letter.
 */

const HOST_RE = /^(?=.{4,80}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;
const MAX_BYTES = 64 * 1024;
const DAY_S = 24 * 60 * 60;

type Cached = { at: number; body: ArrayBuffer | null; type: string };
const cacheKey = "__sbAdminFavicons" as const;
type GlobalWithCache = typeof globalThis & { [cacheKey]?: Map<string, Cached> };

function cache(): Map<string, Cached> {
  const g = globalThis as GlobalWithCache;
  return (g[cacheKey] ??= new Map());
}

function isPublic(address: string): boolean {
  const bytes = parseIp(address);
  if (!bytes) return false;
  if (bytes.length === 4) {
    const [a, b] = [bytes[0]!, bytes[1]!];
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    return true;
  }
  const first = (bytes[0]! << 8) | bytes[1]!;
  if (bytes.every((byte, i) => (i < 15 ? byte === 0 : byte <= 1))) return false; // :: and ::1
  if ((first & 0xfe00) === 0xfc00) return false; // unique local
  if ((first & 0xffc0) === 0xfe80) return false; // link local
  if ((first & 0xff00) === 0xff00) return false; // multicast
  return true;
}

function notFound() {
  return new Response(null, { status: 404, headers: { "Cache-Control": "private, max-age=3600" } });
}

export async function GET(request: NextRequest) {
  if (!adminConfigured() || !verifyAdminCookie(request.cookies.get(ADMIN_COOKIE)?.value)) return new Response(null, { status: 401 });
  const host = (request.nextUrl.searchParams.get("host") ?? "").toLowerCase();
  if (!HOST_RE.test(host) || isIP(host)) return notFound();

  const hit = cache().get(host);
  const now = Date.now();
  if (!hit || now - hit.at > DAY_S * 1000) {
    let entry: Cached = { at: now, body: null, type: "" };
    try {
      const addresses = await dns.lookup(host, { all: true, verbatim: true });
      if (addresses.length > 0 && addresses.every((a) => isPublic(a.address))) {
        const response = await fetch(`https://${host}/favicon.ico`, {
          redirect: "error",
          signal: AbortSignal.timeout(3000),
          headers: { "User-Agent": "stocksbrew favicon (+https://www.stocksbrew.online)" },
        });
        const type = response.headers.get("content-type") ?? "";
        const length = Number(response.headers.get("content-length") ?? "0");
        if (response.ok && /^image\//.test(type) && !/svg/.test(type) && length <= MAX_BYTES) {
          const body = await response.arrayBuffer();
          if (body.byteLength > 0 && body.byteLength <= MAX_BYTES) entry = { at: now, body, type };
        }
      }
    } catch {
      // unreachable, refused or too slow: the letter stands in
    }
    if (cache().size > 500) cache().clear();
    cache().set(host, entry);
  }
  const entry = cache().get(host)!;
  if (!entry.body) return notFound();
  return new Response(entry.body, {
    headers: { "Content-Type": entry.type, "Cache-Control": `private, max-age=${DAY_S}`, "X-Content-Type-Options": "nosniff" },
  });
}
