import { NextRequest } from "next/server";

import { setAnalyticsDbForTests, type AnalyticsDb } from "@/lib/analytics/db";
import { enqueue, flush, ingestStateForTests, parseBeacon, resetIngestForTests, VITALS_FLUSH_AT, VITALS_FLUSH_MS } from "@/lib/analytics/ingest";
import { pruneVitalsChunks } from "@/lib/analytics/retention";
import {
  bucketOf,
  buildSpeed,
  MAX_ROUTES,
  MIN_LOADS,
  mergeCell,
  emptyCell,
  OTHER_ROUTE,
  parseVitals,
  percentile,
  rate,
  rollupSpeedDay,
  TREND_DAYS,
  vitalsChunkOf,
  type SpeedDay,
  type VitalsChunk,
  type VitalsRow,
} from "@/lib/analytics/speed";
import { setSpeedDbForTests, type SpeedDb } from "@/lib/analytics/speed-db";
import { lastDays, loadSpeedDays, resetSpeedCacheForTests } from "@/lib/analytics/speed-load";
import { cacheOf, ClsWindow, inpOf, samePath } from "@/lib/analytics/vitals-client";
import { fmtSpeed } from "@/components/admin-analytics/format";

const NOW = Date.parse("2026-11-13T12:00:00Z");
const DAY = "2026-11-13";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const IP = "198.51.100.23";

const row = (over: Partial<VitalsRow> = {}): VitalsRow => ({ t: NOW, r: "/stock/[symbol]", d: "desktop", ct: "4g", c: "hit", si: false, lcp: 1200, ttfb: 300, ...over });

function fakeSpeedDb() {
  const chunks = new Map<string, VitalsChunk>();
  const days = new Map<string, SpeedDay>();
  const writes: string[] = [];
  const db: SpeedDb = {
    writeVitals: async (_ns, id, chunk) => {
      writes.push(id);
      chunks.set(id, JSON.parse(JSON.stringify(chunk)));
    },
    vitalsForDay: async (_ns, day) => [...chunks.values()].filter((c) => c.days.includes(day)),
    oldVitals: async (_ns, before) => [...chunks].filter(([, c]) => c.last_ts < before).map(([id, c]) => ({ id, days: c.days })),
    deleteVitals: async (_ns, ids) => {
      for (const id of ids) chunks.delete(id);
    },
    readSpeed: async (_ns, list) => new Map(list.filter((d) => days.has(d)).map((d) => [d, days.get(d)!])),
    writeSpeed: async (_ns, list) => {
      for (const d of list) days.set(d.day, d);
    },
  };
  return { db, chunks, days, writes };
}

const noEventsDb: AnalyticsDb = {
  writeChunk: async () => undefined,
  salts: () => ({ read: async () => "s".repeat(64), create: async () => true, removeBefore: async () => undefined }),
  chunksForDay: async () => [],
  chunksSince: async () => [],
  oldChunks: async () => [],
  deleteChunks: async () => undefined,
  readRollups: async () => new Map(),
  writeRollups: async () => undefined,
  realFacts: async () => ({ users: [], agents: [], lifecycle: [] }),
};

beforeEach(() => {
  resetIngestForTests();
  resetSpeedCacheForTests();
});
afterEach(() => {
  setSpeedDbForTests();
  setAnalyticsDbForTests();
  vi.useRealTimers();
});

describe("histograms", () => {
  it("puts a value on a threshold in the good bucket", () => {
    expect(rate("lcp", 2500)).toBe("good");
    expect(rate("lcp", 2501)).toBe("needs-work");
    expect(rate("lcp", 4001)).toBe("poor");
    expect(rate("cls", 0.1)).toBe("good");
    expect(rate("inp", null)).toBeNull();
    const hist: number[] = [];
    hist[bucketOf("lcp", 2500)] = 4;
    expect(rate("lcp", percentile("lcp", hist, 0.75))).toBe("good");
    expect(percentile("lcp", hist, 0.75)!).toBeGreaterThan(2250);
    expect(percentile("lcp", hist, 0.75)!).toBeLessThanOrEqual(2500);
  });

  it("reads percentiles back within one bucket of the true value", () => {
    const values = Array.from({ length: 400 }, (_, i) => 100 + i * 20); // 100 .. 8080 ms
    const hist: number[] = [];
    for (const v of values) {
      const b = bucketOf("lcp", v);
      while (hist.length <= b) hist.push(0);
      hist[b]! += 1;
    }
    const sorted = [...values].sort((a, b) => a - b);
    for (const q of [0.5, 0.75, 0.95]) {
      const truth = sorted[Math.ceil(q * sorted.length) - 1]!;
      expect(Math.abs(percentile("lcp", hist, q)! - truth) / truth).toBeLessThan(0.1);
    }
    expect(percentile("lcp", [], 0.75)).toBeNull();
    expect(percentile("lcp", undefined, 0.75)).toBeNull();
    // past the last edge reads as that edge
    const over: number[] = [];
    over[bucketOf("lcp", 90_000)] = 1;
    expect(percentile("lcp", over, 0.75)).toBe(30000);
  });
});

describe("the browser's report", () => {
  it("keeps the route template, phone or desktop, and only known values", () => {
    const parsed = parseVitals({ p: "/stock/NVDA?ref=x#y", vw: 390, lcp: 2400.6, inp: 88, cls: 0.123456, ttfb: 310, fcp: 900, ct: "4g", c: "hit", email: "a@b.c", uid: "u1" }, true)!;
    expect(parsed).toEqual({ r: "/stock/[symbol]", d: "phone", ct: "4g", c: "hit", si: true, lcp: 2401, inp: 88, cls: 0.1235, ttfb: 310, fcp: 900 });
    expect(JSON.stringify(parsed)).not.toMatch(/NVDA|a@b|u1|ref/);
    expect(parseVitals({ p: "/", vw: 767, ttfb: 1 }, null)!.d).toBe("phone");
    expect(parseVitals({ p: "/", vw: 768, ttfb: 1 }, null)!.d).toBe("desktop");
  });

  it("drops what isn't a usable report", () => {
    expect(parseVitals(null, null)).toBeNull();
    expect(parseVitals([], null)).toBeNull();
    expect(parseVitals({ p: "/admin/analytics", vw: 1280, lcp: 100 }, null)).toBeNull();
    expect(parseVitals({ p: "/api/x", vw: 1280, lcp: 100 }, null)).toBeNull();
    expect(parseVitals({ p: "https://evil.example/", vw: 1280, lcp: 100 }, null)).toBeNull();
    expect(parseVitals({ p: "/", lcp: 100 }, null)).toBeNull();
    expect(parseVitals({ p: "/", vw: 1280 }, null)).toBeNull();
    // out of range or the wrong type: left out, and with nothing left the report goes
    expect(parseVitals({ p: "/", vw: 1280, lcp: 500_000, inp: -1, cls: 50, ttfb: "300" }, null)).toBeNull();
    const parsed = parseVitals({ p: "/", vw: 1280, lcp: 500_000, ttfb: 200, ct: "5g", c: "bogus" }, null)!;
    expect(parsed).toEqual({ r: "/", d: "desktop", ct: null, c: null, si: null, ttfb: 200 });
  });
});

describe("daily rollup", () => {
  it("counts by route, device, cache, network and signed in, and ignores other days", () => {
    const rows = [
      row(),
      row({ d: "phone", lcp: 3800, c: "pass", si: true, ct: "3g" }),
      row({ r: "/", c: null, ct: null, si: null }),
      row({ t: NOW - 24 * 3600_000 }),
    ];
    const day = rollupSpeedDay(DAY, rows);
    expect(day.n).toBe(3);
    expect(day.routes["/stock/[symbol]"]!.desktop!.n).toBe(1);
    expect(day.routes["/stock/[symbol]"]!.phone).toMatchObject({ n: 1, si: 1, c: { pass: 1 } });
    expect(Object.keys(day.cuts).sort()).toEqual(["net:3g", "net:4g", "net:unknown", "si:in", "si:out", "si:unknown"]);
    expect(day.cuts["net:4g"]!.n).toBe(1);
  });

  it("caps routes but keeps every load in the total", () => {
    const rows = Array.from({ length: MAX_ROUTES + 30 }, (_, i) => row({ r: `/page-${i}`, lcp: 1000 + i }));
    rows.push(row({ r: "/page-0" }));
    const day = rollupSpeedDay(DAY, rows);
    expect(Object.keys(day.routes)).toHaveLength(MAX_ROUTES);
    expect(day.routes["/page-0"]!.desktop!.n).toBe(2);
    const total = Object.values(day.routes).reduce((n, byDevice) => n + (byDevice.desktop?.n ?? 0), 0);
    expect(total).toBe(rows.length);
    expect(day.routes[OTHER_ROUTE]!.desktop!.n).toBe(31);
  });

  it("merges days to the same answer as one rollup of all rows", () => {
    const a = [row({ lcp: 900 }), row({ lcp: 5000 })];
    const b = [row({ lcp: 2600 }), row({ lcp: 1800, inp: 300 })];
    const merged = emptyCell();
    mergeCell(merged, rollupSpeedDay(DAY, a).routes["/stock/[symbol]"]!.desktop);
    mergeCell(merged, rollupSpeedDay(DAY, b).routes["/stock/[symbol]"]!.desktop);
    expect(merged).toEqual(rollupSpeedDay(DAY, [...a, ...b]).routes["/stock/[symbol]"]!.desktop);
  });
});

describe("the Speed view", () => {
  const days = lastDays(TREND_DAYS, NOW);
  const dayAt = (i: number, rows: VitalsRow[]) => rollupSpeedDay(days[i]!, rows.map((r) => ({ ...r, t: Date.parse(`${days[i]}T10:00:00Z`) })));

  it("ranks routes slowest first by the figure shown, LCP or else FCP", () => {
    const rows = [
      ...Array.from({ length: MIN_LOADS }, () => row({ r: "/fast", lcp: 900 })),
      ...Array.from({ length: MIN_LOADS }, () => row({ r: "/slow", lcp: 5200 })),
      row({ r: "/once", lcp: 9000 }),
      ...Array.from({ length: MIN_LOADS }, () => row({ r: "/safari", lcp: undefined, fcp: 2500 })),
    ];
    const list = Array.from({ length: TREND_DAYS }, (_, i) => dayAt(i, i === TREND_DAYS - 1 ? rows : []));
    const view = buildSpeed({ days: list, range: "7d", device: "all", now: NOW });
    expect(view.routes.map((r) => r.route)).toEqual(["/once", "/slow", "/safari", "/fast"]);
    expect(view.slowLcp).toBeCloseTo((MIN_LOADS + 1) / (2 * MIN_LOADS + 1));
    expect(view.loads).toBe(rows.length);
    expect(view.empty).toBe(false);
    expect(view.routes[0]!.trend).toHaveLength(TREND_DAYS);
    expect(view.routes[0]!.trend.slice(0, -1).every((v) => v === null)).toBe(true);
  });

  it("covers only the range's days but trends over all fourteen, and splits phones from desktops", () => {
    const list = Array.from({ length: TREND_DAYS }, (_, i) => dayAt(i, [row({ lcp: 1000 + i * 100 }), row({ d: "phone", lcp: 4000 })]));
    const today = buildSpeed({ days: list, range: "today", device: "all", now: NOW });
    expect(today.loads).toBe(2);
    const all = buildSpeed({ days: list, range: "14d", device: "all", now: NOW });
    expect(all.loads).toBe(28);
    expect(all.trend.lcp.filter((v) => v != null)).toHaveLength(TREND_DAYS);
    expect(all.byDevice.phone.loads).toBe(14);
    expect(rate("lcp", all.byDevice.phone.p75.lcp)).toBe("needs-work"); // 4000 sits in (3500, 4000], not past poor
    const phones = buildSpeed({ days: list, range: "14d", device: "phone", now: NOW });
    expect(phones.loads).toBe(14);
    expect(phones.routes[0]!.loads).toBe(14);
  });

  it("counts cache hits among loads Varnish saw, the browser's own cache apart", () => {
    const list = [dayAt(TREND_DAYS - 1, [row({ c: "hit" }), row({ c: "stale" }), row({ c: "miss" }), row({ c: "pass" }), row({ c: "browser" }), row({ c: null })])];
    const view = buildSpeed({ days: list, range: "today", device: "all", now: NOW });
    expect(view.cache).toEqual({ hit: 2, known: 4, browser: 1, share: 0.5 });
  });

  it("is honest about no data", () => {
    const view = buildSpeed({ days: [rollupSpeedDay(DAY, [])], range: "7d", device: "all", now: NOW });
    expect(view).toMatchObject({ loads: 0, empty: true, routes: [], nets: [], signedIn: [] });
    expect(view.p75.lcp).toBeNull();
  });
});

describe("collecting in the browser", () => {
  it("takes the worst burst of layout shifts", () => {
    const cls = new ClsWindow();
    cls.add(0.05, 0);
    cls.add(0.05, 500); // same burst: 0.1
    cls.add(0.02, 3000); // new burst
    cls.add(0.01, 3500);
    expect(cls.value).toBeCloseTo(0.1);
    // a burst ends at 5 s even with shifts less than a second apart
    const long = new ClsWindow();
    for (let t = 0; t <= 6000; t += 500) long.add(0.01, t);
    expect(long.value).toBeCloseTo(0.1);
  });

  it("takes the worst interaction, skipping one per 50", () => {
    expect(inpOf([])).toBeUndefined();
    expect(inpOf([40, 300, 120])).toBe(300);
    expect(inpOf([...Array.from({ length: 60 }, () => 50), 900])).toBe(50);
  });

  it("measures only the page the document loaded", () => {
    expect(samePath("https://www.stocksbrew.online/news/?x=1", "/news")).toBe(true);
    expect(samePath("https://www.stocksbrew.online/", "/")).toBe(true);
    // landed on /admin, then moved to /news in the app: not /news's page load
    expect(samePath("https://www.stocksbrew.online/admin/analytics", "/news")).toBe(false);
    expect(samePath("", "/x")).toBe(false);
  });

  it("formats figures without rounding up into the wrong unit", () => {
    expect(fmtSpeed("lcp", 4)).toBe("4 ms");
    expect(fmtSpeed("lcp", 640)).toBe("640 ms");
    expect(fmtSpeed("lcp", 996)).toBe("1.0 s");
    expect(fmtSpeed("lcp", 2449)).toBe("2.4 s");
    expect(fmtSpeed("lcp", 9960)).toBe("10 s");
    expect(fmtSpeed("cls", 0)).toBe("0");
    expect(fmtSpeed("cls", 0.004)).toBe("<0.01");
    expect(fmtSpeed("inp", null)).toBe("n/a");
  });

  it("reads the cache from Server-Timing, or the browser's own cache", () => {
    expect(cacheOf({ transferSize: 1000, decodedBodySize: 5000, serverTiming: [{ name: "cache", description: "HIT" }] })).toBe("hit");
    expect(cacheOf({ transferSize: 0, decodedBodySize: 5000, serverTiming: [] })).toBe("browser");
    expect(cacheOf({ transferSize: 1000, decodedBodySize: 5000, serverTiming: [{ name: "cache", description: "weird" }] })).toBeUndefined();
    expect(cacheOf({ transferSize: 1000, decodedBodySize: 5000 })).toBeUndefined();
  });
});

describe("ingest", () => {
  const body = { sid: "abcdefgh12345678", sw: 390, si: false, e: [], v: { p: "/stock/AAPL", vw: 390, lcp: 2100, ttfb: 400, ct: "4g", c: "miss" } };

  it("waits up to a minute, then writes one chunk with nothing about the visitor", async () => {
    vi.useFakeTimers({ now: NOW });
    const { db, chunks, writes } = fakeSpeedDb();
    setSpeedDbForTests(db);
    setAnalyticsDbForTests(noEventsDb);
    for (let i = 0; i < 3; i += 1) enqueue(parseBeacon(body, [])!, { host: "localhost", ip: IP, ua: UA });
    expect(ingestStateForTests().vitals).toHaveLength(3);
    await flush();
    expect(writes).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(VITALS_FLUSH_MS + 10);
    await flush();
    expect(writes).toHaveLength(1);
    const chunk = [...chunks.values()][0]!;
    expect(chunk.count).toBe(3);
    expect(chunk.rows[0]).toEqual({ t: NOW, r: "/stock/[symbol]", d: "phone", ct: "4g", c: "miss", si: false, lcp: 2100, ttfb: 400 });
    const raw = JSON.stringify(chunk);
    expect(raw).not.toContain(IP);
    expect(raw).not.toContain("abcdefgh");
    expect(raw).not.toContain("AAPL");
  });

  it("never lets a failing speed write hold up the visitor events, and retries it later", async () => {
    const { db, writes } = fakeSpeedDb();
    let down = true;
    setSpeedDbForTests({ ...db, writeVitals: async (ns, id, chunk) => (down ? Promise.reject(new Error("down")) : db.writeVitals(ns, id, chunk)) });
    const events: string[] = [];
    setAnalyticsDbForTests({ ...noEventsDb, writeChunk: async (_ns, id) => void events.push(id) });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    for (let i = 0; i < VITALS_FLUSH_AT; i += 1) enqueue(parseBeacon(body, [])!, { host: "localhost", ip: IP, ua: UA, now: NOW + i });
    enqueue(parseBeacon({ ...body, e: [{ n: "$pageview", p: "/" }], v: undefined }, [])!, { host: "localhost", ip: IP, ua: UA, now: NOW });
    await flush();
    expect(events).toHaveLength(1);
    expect(writes).toHaveLength(0);
    expect(ingestStateForTests().ready.map((r) => r.kind)).toEqual(["vitals"]);
    down = false;
    await flush();
    expect(writes).toHaveLength(1);
    expect(ingestStateForTests().ready).toHaveLength(0);
    warn.mockRestore();
  });

  it("writes at once when enough reports are waiting", async () => {
    const { db, writes } = fakeSpeedDb();
    setSpeedDbForTests(db);
    for (let i = 0; i < VITALS_FLUSH_AT; i += 1) enqueue(parseBeacon(body, [])!, { host: "localhost", ip: IP, ua: UA, now: NOW + i });
    expect(ingestStateForTests().vitals).toHaveLength(0);
    await flush();
    expect(writes).toHaveLength(1);
  });

  it("spools waiting reports at shutdown", async () => {
    const fs = await import("fs");
    const os = await import("os");
    const path = await import("path");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spool-"));
    vi.stubEnv("ANALYTICS_SPOOL_DIR", dir);
    const { spoolNow } = await import("@/lib/analytics/ingest");
    const { db, writes } = fakeSpeedDb();
    setSpeedDbForTests(db);
    enqueue(parseBeacon(body, [])!, { host: "localhost", ip: IP, ua: UA, now: NOW });
    spoolNow();
    expect(fs.readdirSync(dir)).toHaveLength(1);
    expect(ingestStateForTests().vitals).toHaveLength(0);
    ingestStateForTests().spoolRead = false;
    enqueue(parseBeacon({ ...body, e: [{ n: "$pageview", p: "/" }], v: undefined }, [])!, { host: "localhost", ip: IP, ua: UA, now: NOW });
    setAnalyticsDbForTests(noEventsDb);
    await flush();
    expect(writes).toHaveLength(1);
    expect(fs.readdirSync(dir)).toHaveLength(0);
    vi.unstubAllEnvs();
  });

  it("takes a speed-only beacon through /api/a", async () => {
    const { POST } = await import("@/app/api/a/route");
    const request = new NextRequest("http://localhost:8000/api/a", {
      method: "POST",
      headers: { "user-agent": UA, host: "localhost:8000", origin: "http://localhost:8000", "x-forwarded-for": IP, "content-type": "text/plain" },
      body: JSON.stringify(body),
    });
    expect((await POST(request)).status).toBe(204);
    expect(ingestStateForTests().vitals).toHaveLength(1);
    expect(ingestStateForTests().buffer).toHaveLength(0);
  });
});

describe("storage", () => {
  it("folds days from raw chunks, stores them once final, and prunes the raw rows after", async () => {
    const fake = fakeSpeedDb();
    setSpeedDbForTests(fake.db);
    const old = Date.parse("2026-11-03T10:00:00Z");
    const recent = Date.parse("2026-11-12T10:00:00Z");
    fake.chunks.set("old", vitalsChunkOf([row({ t: old })], old));
    fake.chunks.set("recent", vitalsChunkOf([row({ t: recent })], recent));
    const loaded = await loadSpeedDays("tm_analytics_dev", ["2026-11-03", "2026-11-12"], NOW);
    expect(loaded.map((d) => [d.day, d.n, d.complete])).toEqual([
      ["2026-11-03", 1, true],
      ["2026-11-12", 1, false],
    ]);
    expect([...fake.days.keys()]).toEqual(["2026-11-03"]);
    expect(await pruneVitalsChunks("tm_analytics_dev", NOW)).toEqual({ deleted: 1 });
    expect([...fake.chunks.keys()]).toEqual(["recent"]);
    // the stored rollup still answers after its raw rows are gone
    resetSpeedCacheForTests();
    expect((await loadSpeedDays("tm_analytics_dev", ["2026-11-03"], NOW))[0]!.n).toBe(1);
  });
});
