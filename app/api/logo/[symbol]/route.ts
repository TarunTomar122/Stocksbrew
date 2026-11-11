import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { adminFirestore } from "@/lib/firebase-admin";
import { isLogoKey, logoKey, logoMonogramSvg } from "@/lib/stock-logo-sources";

/**
 * A company's logo tile, served from our own domain.
 *
 *   /api/logo/MSFT?v=1          US ticker
 *   /api/logo/RELIANCE?v=1&m=IN NSE ticker
 *
 * Stored tiles (`tm_stock_logos`, filled by backend/agentdata/stock_logos.py)
 * are 128px WebP, about 1.6 KB, cached for a year as immutable: a browser asks
 * once, ever, per `v` (bump LOGO_VERSION in lib/stock-logo-sources.ts after a
 * run that replaced logos on purpose). A ticker the job has not seen gets one quick try at FMP
 * and otherwise its lettered tile, both cached for a day so a logo the job adds
 * later shows up. The response is always an image unless the store is down, so
 * the <img> never needs JavaScript to fall back.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLLECTION = "tm_stock_logos";
const IMMUTABLE = "public, max-age=31536000, s-maxage=31536000, immutable";
const ONE_DAY = "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800";
const STORE_TIMEOUT_MS = 4000;
const UPSTREAM_TIMEOUT_MS = 2500;
// FMP's grey-person "no logo" image (first 16 hex of its SHA-256), same list as the job.
const PLACEHOLDER_SHAS = new Set(["c7fe0cb0ef5982a3"]);
type Tile = { body: Buffer; mime: string; cache: string };
type Remembered = Tile & { until: number };

// Warm instances answer from memory: least recently used first out, capped by
// bytes. Stored tiles stay until pushed out; lettered and FMP stand-ins only
// for a day, like their Cache-Control, so a logo the job adds shows up.
const memory = new Map<string, Remembered>();
const MEMORY_BYTES = 4 * 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;
let memoryBytes = 0;

function recall(key: string): Tile | null {
  const hit = memory.get(key);
  if (!hit) return null;
  memory.delete(key);
  if (hit.until < Date.now()) {
    memoryBytes -= hit.body.length;
    return null;
  }
  memory.set(key, hit);
  return hit;
}

function remember(key: string, tile: Tile): Tile {
  const prior = memory.get(key);
  if (prior) {
    memory.delete(key);
    memoryBytes -= prior.body.length;
  }
  while (memoryBytes + tile.body.length > MEMORY_BYTES && memory.size) {
    const [oldest, entry] = memory.entries().next().value as [string, Remembered];
    memory.delete(oldest);
    memoryBytes -= entry.body.length;
  }
  memory.set(key, { ...tile, until: tile.cache === IMMUTABLE ? Infinity : Date.now() + DAY_MS });
  memoryBytes += tile.body.length;
  return tile;
}

type StoredLogo = { status?: string; mime?: string; data_b64?: string };

// A page with 30 logos fires 30 requests at once; read them from the store in
// one batch instead of 30 round trips.
let pending: Map<string, Array<(doc: StoredLogo | null) => void>> | null = null;

function readStored(key: string): Promise<StoredLogo | null> {
  return new Promise((resolve) => {
    if (!pending) {
      const batch = new Map<string, Array<(doc: StoredLogo | null) => void>>();
      pending = batch;
      setTimeout(() => {
        pending = null;
        void flush(batch);
      }, 8);
    }
    const waiters = pending.get(key) ?? [];
    waiters.push(resolve);
    pending.set(key, waiters);
  });
}

function withTimeout<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("logo store timeout")), STORE_TIMEOUT_MS);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

async function readMany(keys: string[]): Promise<Map<string, StoredLogo | null>> {
  const refs = keys.map((key) => adminFirestore.collection(COLLECTION).doc(key));
  const snaps = await withTimeout(adminFirestore.getAll(...refs));
  return new Map(snaps.map((snap) => [snap.id, snap.exists ? ((snap.data() as StoredLogo) ?? null) : null]));
}

async function flush(batch: Map<string, Array<(doc: StoredLogo | null) => void>>) {
  const keys = [...batch.keys()];
  let docs: Map<string, StoredLogo | null>;
  try {
    docs = await readMany(keys);
  } catch {
    // One bad key must not fail its neighbours: read each on its own. A key that
    // still fails gets an error and the client shows the lettered tile.
    docs = new Map();
    await Promise.all(
      keys.map(async (key) => {
        try {
          docs.set(key, (await readMany([key])).get(key) ?? null);
        } catch {
          docs.set(key, { status: "error" });
        }
      }),
    );
  }
  for (const [key, waiters] of batch) {
    const doc = docs.get(key) ?? null;
    for (const done of waiters) done(doc);
  }
}

function pngSize(body: Buffer): { width: number; height: number } | null {
  if (body.length < 24 || body.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: body.readUInt32BE(16), height: body.readUInt32BE(20) };
}

/** One try at FMP for a ticker the job has not covered yet. */
async function fetchUpstream(key: string, market: "US" | "IN"): Promise<Tile | null> {
  const symbol = key.replace(/\./g, "-");
  const url = `https://financialmodelingprep.com/image-stock/${encodeURIComponent(market === "IN" ? `${symbol}.NS` : symbol)}.png`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "stocksbrew-logos/1.0" },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/png")) return null;
    const body = Buffer.from(await res.arrayBuffer());
    if (body.length < 300 || body.length > 200_000) return null;
    const size = pngSize(body);
    if (!size || Math.max(size.width, size.height) < 32) return null;
    if (PLACEHOLDER_SHAS.has(createHash("sha256").update(body).digest("hex").slice(0, 16))) return null;
    return { body, mime: "image/png", cache: ONE_DAY };
  } catch {
    return null;
  }
}

function monogram(key: string): Tile {
  return { body: Buffer.from(logoMonogramSvg(key)), mime: "image/svg+xml", cache: ONE_DAY };
}

function respond(tile: Tile, source: string): NextResponse {
  return new NextResponse(new Uint8Array(tile.body), {
    headers: {
      "Content-Type": tile.mime,
      // Our SVG has no scripts or links; make sure one opened on its own could not run any.
      ...(tile.mime === "image/svg+xml" ? { "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'" } : {}),
      "Content-Length": String(tile.body.length),
      "Cache-Control": tile.cache,
      "Access-Control-Allow-Origin": "*",
      "X-Logo-Source": source,
    },
  });
}

export async function GET(req: NextRequest, { params }: { params: { symbol: string } }) {
  // Next hands the segment over already decoded; decoding again would break on "%".
  const key = logoKey(params.symbol || "");
  if (!isLogoKey(key)) return new NextResponse("Bad ticker", { status: 400 });
  const market = req.nextUrl.searchParams.get("m") === "IN" ? "IN" : "US";
  const cacheKey = `${market}:${key}`;

  const hit = recall(cacheKey);
  if (hit) return respond(hit, "memory");

  if (market === "US") {
    const doc = await readStored(key);
    if (doc?.status === "error") {
      return new NextResponse("Logo store unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    if (doc?.status === "ok" && doc.data_b64) {
      const tile = { body: Buffer.from(doc.data_b64, "base64"), mime: doc.mime || "image/webp", cache: IMMUTABLE };
      return respond(remember(cacheKey, tile), "store");
    }
    if (doc?.status === "none") return respond(remember(cacheKey, monogram(key)), "none");
  }

  const upstream = await fetchUpstream(key, market);
  if (upstream) return respond(remember(cacheKey, upstream), "upstream");
  return respond(remember(cacheKey, monogram(key)), "none");
}
