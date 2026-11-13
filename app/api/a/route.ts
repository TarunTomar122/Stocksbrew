import { NextRequest } from "next/server";

import { PRODUCTION_HOSTS } from "@/lib/analytics-env";
import { enqueue, parseBeacon } from "@/lib/analytics/ingest";
import { cloudflareCountry, visitorAddress } from "@/lib/analytics/address";
import { isBot } from "@/lib/analytics/ua";
import { createIpRateLimiter } from "@/lib/ip-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The first-party analytics beacon (lib/analytics/beacon.ts posts here). It
 * answers 204 at once in every case, so a page never waits on it or learns
 * anything from it: the events are checked, queued in memory and written a few
 * seconds later in a batch (lib/analytics/ingest.ts).
 *
 * The visitor's address is Cloudflare's CF-Connecting-IP, or the first
 * X-Forwarded-For entry for a request that reached Caddy directly, and the
 * country is Cloudflare's CF-IPCountry when it sent one, else the db-ip lookup
 * (lib/analytics/address.ts says why a direct hit could fake both, and why that
 * is fine here). The address is used for the country and the daily visitor
 * hash, then dropped; it is never stored or logged.
 */

const MAX_BODY_BYTES = 8 * 1024;
/** Per address, per web instance (production runs two): plenty for a person, little for a script. */
const limiter = createIpRateLimiter({ limit: 60, windowMs: 60 * 1000 });
const OWN_HOSTS = [...PRODUCTION_HOSTS, "localhost"];

function done() {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

async function readCapped(request: NextRequest, cap: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > cap) return null;
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done: finished, value } = await reader.read();
    if (finished) break;
    size += value.byteLength;
    if (size > cap) {
      void reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    all.set(chunk, at);
    at += chunk.byteLength;
  }
  return new TextDecoder().decode(all);
}

export async function POST(request: NextRequest) {
  try {
    const ua = request.headers.get("user-agent") ?? "";
    if (isBot(ua)) return done();
    // Only our own pages post here: a browser always sends Origin on a POST, and it must be this host.
    const origin = request.headers.get("origin");
    const host = request.headers.get("host") ?? "";
    if (origin) {
      try {
        if (new URL(origin).host !== host) return done();
      } catch {
        return done();
      }
    }
    const ip = visitorAddress(request.headers);
    if (!limiter(ip).ok) return done();
    const text = await readCapped(request, MAX_BODY_BYTES);
    if (!text) return done();
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return done();
    }
    const beacon = parseBeacon(raw, OWN_HOSTS);
    if (beacon && beacon.events.length > 0) enqueue(beacon, { host, ip, ua, country: cloudflareCountry(request.headers) });
  } catch {
    // never fail a beacon
  }
  return done();
}
