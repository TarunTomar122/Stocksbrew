import { createHash } from "node:crypto";

import { adminFirestore } from "@/lib/firebase-admin";
import { isLogoKey, logoKey, stockLogoSources } from "@/lib/stock-logo-sources";

/**
 * Company logos for the drawn cards (Open Graph images and share cards), as
 * data URIs: Satori cannot fetch our own relative `/api/logo/<ticker>`.
 *
 * The first source is the app's own logo store (`tm_stock_logos`, the same
 * 128px tiles `app/api/logo/[symbol]` serves to every page), read for all of a
 * card's tickers in one batch. A ticker the store has no tile for falls back
 * to the remote chain the cards used before (Finnhub, FMP). Everything is kept
 * in memory per server process, a hit for six hours and a miss for ten
 * minutes, and no card ever waits more than about 2.5 seconds for its logos.
 *
 * Satori cannot read the size of a WebP image, so stored WebP tiles are
 * turned into PNG with sharp (a dependency of its own). Where sharp cannot
 * load, the tile's own source PNG and then the remote chain are used instead.
 *
 * Server only.
 */

const COLLECTION = "tm_stock_logos";
const HIT_MS = 6 * 3600_000;
const MISS_MS = 10 * 60_000;
const BUDGET_MS = 2500;
const MAX_ENTRIES = 600;

const cache = new Map<string, { at: number; value: string | null }>();

function remember(key: string, value: string | null) {
  cache.delete(key);
  cache.set(key, { at: Date.now(), value });
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
}

function recall(key: string): string | null | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > (hit.value ? HIT_MS : MISS_MS)) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}

type Sharp = (input: Buffer) => { png: (options?: { compressionLevel?: number }) => { toBuffer: () => Promise<Buffer> } };
let sharpLoad: Promise<Sharp | null> | null = null;

declare const __non_webpack_require__: NodeRequire | undefined;

/**
 * The installed `@img` packages (sharp's native binary and libvips), named in the warning when sharp cannot load.
 *
 * The literal read is also what ships them: sharp picks its binary by a computed path (`@img/sharp-${platform}`),
 * which the build's file tracer cannot follow, so the Vercel functions had sharp's code without its binary and every
 * logo fell back to letters. A plain `require("fs").readdirSync(process.cwd() + "/node_modules/@img")` in the
 * built route is a path the tracer does follow, so the folder goes into the function. `__non_webpack_require__`
 * keeps that `require` as written in the bundle; outside webpack (tests) there is nothing to trace.
 */
function imgPackages(): string[] {
  if (typeof __non_webpack_require__ !== "function") return [];
  try {
    const fs = __non_webpack_require__("fs") as typeof import("fs");
    return fs.readdirSync(process.cwd() + "/node_modules/@img");
  } catch {
    return [];
  }
}

function loadSharp(): Promise<Sharp | null> {
  if (!sharpLoad) {
    const installed = imgPackages();
    sharpLoad = import("sharp")
      .then((mod) => ((mod as unknown as { default?: Sharp }).default ?? (mod as unknown as Sharp)) as Sharp)
      .catch((error) => {
        console.warn("[og] sharp unavailable, logos fall back to remote PNGs:", error instanceof Error ? error.message : error, "@img:", installed.join(",") || "none");
        return null;
      });
  }
  return sharpLoad;
}

/** A stored tile as a data URI Satori can draw: PNG and JPEG as they are, WebP turned into PNG. */
async function drawable(mime: string, b64: string): Promise<string | null> {
  if (mime === "image/png" || mime === "image/jpeg") return `data:${mime};base64,${b64}`;
  if (mime !== "image/webp") return null;
  const sharp = await loadSharp();
  if (!sharp) return null;
  try {
    const png = await sharp(Buffer.from(b64, "base64")).png({ compressionLevel: 9 }).toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

async function within<T>(work: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  try {
    return await Promise.race([work.catch(() => null), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

type StoredLogo = { status?: string; mime?: string; data_b64?: string; source_url?: string };

/** What the store had: drawable tiles, and for a tile that could not be drawn, the PNG it was made from. */
type StoreRead = { tiles: Map<string, string>; sources: Map<string, string> };

/** Stored tiles that came out nearly blank: the same list as BLANK_STORED_SHAS in app/api/logo/[symbol]/route.ts. */
const BLANK_TILES = new Set(["c102515c0096e1b7"]);

/** Stored tiles for these keys, in one read. Missing or unusable ones are left out. */
async function readStore(keys: string[]): Promise<StoreRead> {
  const out: StoreRead = { tiles: new Map(), sources: new Map() };
  if (keys.length === 0) return out;
  const refs = keys.map((key) => adminFirestore.collection(COLLECTION).doc(key));
  const snaps = await adminFirestore.getAll(...refs);
  await Promise.all(
    snaps.map(async (snap) => {
      if (!snap.exists) return;
      const doc = (snap.data() ?? {}) as StoredLogo;
      // A tile under ~300 bytes, or one the logo route knows reads blank, gets letters instead (as on the site).
      if (doc.status !== "ok" || !doc.data_b64 || doc.data_b64.length < 400) return;
      if (BLANK_TILES.has(createHash("sha256").update(Buffer.from(doc.data_b64, "base64")).digest("hex").slice(0, 16))) return;
      const uri = await drawable((doc.mime || "image/webp").toLowerCase(), doc.data_b64);
      if (uri) out.tiles.set(snap.id, uri);
      else if (typeof doc.source_url === "string" && /^https:\/\//.test(doc.source_url)) out.sources.set(snap.id, doc.source_url);
    }),
  );
  return out;
}

async function fetchRemote(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1500), cache: "force-cache" });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") || "").split(";")[0]!.trim();
    if (type !== "image/png" && type !== "image/jpeg") return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 700) return null; // blank placeholder
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/** The remote chain, for a ticker the store has not covered. Clearbit (shut down) and 64px favicons are skipped. */
async function remoteLogo(key: string, logoUrl?: string | null): Promise<string | null> {
  const sources = stockLogoSources(key, "US", logoUrl).filter((url) => !/clearbit\.com|google\.com\/s2\/favicons/.test(url)).slice(0, 3);
  const results = await Promise.all(sources.map((url) => fetchRemote(url)));
  return results.find((result) => result !== null) ?? null;
}

/**
 * Logos for several tickers as data URIs, keyed by the ticker as given. A
 * ticker with no logo maps to null and the card draws its letters.
 */
export async function loadLogos(tickers: readonly string[]): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  const wanted = new Map<string, string[]>();
  for (const ticker of tickers) {
    const key = logoKey(ticker);
    out[ticker] = null;
    if (!isLogoKey(key)) continue;
    const hit = recall(key);
    if (hit !== undefined) {
      out[ticker] = hit;
      continue;
    }
    wanted.set(key, [...(wanted.get(key) ?? []), ticker]);
  }
  if (wanted.size === 0) return out;
  const work = (async () => {
    const keys = [...wanted.keys()];
    let storeFailed = false;
    const stored = await readStore(keys).catch((): StoreRead => {
      storeFailed = true;
      return { tiles: new Map(), sources: new Map() };
    });
    const remote = await Promise.all(keys.filter((key) => !stored.tiles.has(key)).map(async (key) => [key, await remoteLogo(key, stored.sources.get(key))] as const));
    const found = new Map<string, string | null>([...stored.tiles.entries(), ...remote]);
    // A miss is remembered only when the store answered; a failed read is tried again on the next card.
    for (const key of keys) {
      const value = found.get(key) ?? null;
      if (value || !storeFailed) remember(key, value);
    }
    return found;
  })();
  const found = await within(work, BUDGET_MS);
  for (const [key, names] of wanted) {
    const value = found?.get(key) ?? null;
    for (const ticker of names) out[ticker] = value;
  }
  return out;
}

/** One logo; see `loadLogos`. `logoUrl` is a stored remote URL tried before the chain when the store has none. */
export async function loadLogo(ticker: string, logoUrl?: string | null): Promise<string | null> {
  const key = logoKey(ticker);
  if (!isLogoKey(key)) return null;
  const hit = recall(key);
  if (hit !== undefined) return hit;
  let storeFailed = false;
  const read = await within(
    readStore([key]).catch(() => {
      storeFailed = true;
      return null;
    }),
    BUDGET_MS,
  );
  const value = read?.tiles.get(key) ?? (await within(remoteLogo(key, read?.sources.get(key) ?? logoUrl), BUDGET_MS));
  if (value || (read !== null && !storeFailed)) remember(key, value);
  return value;
}
