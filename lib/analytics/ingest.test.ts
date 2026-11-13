import { NextRequest } from "next/server";

import { setAnalyticsDbForTests, type AnalyticsDb, analyticsNamespace } from "@/lib/analytics/db";
import { enqueue, flush, ingestStateForTests, parseBeacon, resetIngestForTests } from "@/lib/analytics/ingest";
import type { EventChunk } from "@/lib/analytics/rollup";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const IP = "198.51.100.23";

function fakeDb() {
  const chunks: Array<{ ns: string; id: string; chunk: EventChunk }> = [];
  const salts = new Map<string, string>();
  const db: AnalyticsDb = {
    async writeChunk(ns, id, chunk) {
      chunks.push({ ns, id, chunk: JSON.parse(JSON.stringify(chunk)) });
    },
    salts: () => ({
      read: async (day) => salts.get(day) ?? null,
      create: async (day, salt) => (salts.has(day) ? false : (salts.set(day, salt), true)),
      removeBefore: async () => undefined,
    }),
    chunksForDay: async () => [],
    chunksSince: async () => [],
    oldChunks: async () => [],
    deleteChunks: async () => undefined,
    readRollups: async () => new Map(),
    writeRollups: async () => undefined,
    realFacts: async () => ({ users: [], agents: [], lifecycle: [] }),
  };
  return { db, chunks };
}

const body = {
  sid: "abcdefgh12345678",
  sw: 1280,
  si: true,
  e: [
    { n: "$pageview", p: "/stock/NVDA?utm_source=x", r: "https://www.google.com/search?q=nvda+stock", u: { s: "Newsletter", m: "email", c: "Nov 13!" }, a: 400 },
    { n: "search_performed", p: "/stock/NVDA", x: { query: "aapl", found: true, email: "someone@example.com" }, a: 100 },
    { n: "ask_question_asked", p: "/ask", x: { question: "what about my 300 shares" } },
    { n: "$pageview", p: "/admin/analytics" },
    { n: "$autocapture", p: "/" },
    { n: "agent_switched_on", p: "/agents", x: { template: "buy-zone" } },
  ],
};

beforeEach(() => resetIngestForTests());
afterEach(() => setAnalyticsDbForTests());

describe("beacon parsing", () => {
  it("keeps key events with clean values and drops /admin, unknown events and free text", () => {
    const parsed = parseBeacon(body, ["www.stocksbrew.online"])!;
    expect(parsed.events.map((e) => e.n)).toEqual(["pageview", "search", "ask", "agent_on"]);
    const view = parsed.events[0]!;
    expect(view).toMatchObject({ p: "/stock/NVDA", r: "/stock/[symbol]", ref: "google.com", us: "newsletter", um: "email", uc: "nov 13", age: 400 });
    expect(parsed.events[1]!.props).toEqual({ q: "AAPL", found: true });
    expect(parsed.events[2]!.props).toEqual({});
    expect(parsed.events[3]!.props).toEqual({ kind: "buy-zone" });
    expect(parsed.sw).toBe("1024-1439");
    expect(JSON.stringify(parsed)).not.toMatch(/example\.com|shares/);
  });

  it("refuses bodies that are not a beacon", () => {
    expect(parseBeacon(null, [])).toBeNull();
    expect(parseBeacon({ sid: "x", e: [] }, [])).toBeNull();
    expect(parseBeacon({ sid: "abcdefgh12345678", e: "nope" }, [])).toBeNull();
  });

  it("keeps only the route of a page that belongs to one account", () => {
    const parsed = parseBeacon(
      { sid: "abcdefgh12345678", e: [{ n: "$pageview", p: "/agents/baskets/b7x9k2" }, { n: "$pageview", p: "/agents/theses/t4q1/edit" }] },
      [],
    )!;
    expect(parsed.events.map((e) => [e.p, e.r])).toEqual([
      ["/agents/baskets/[id]", "/agents/baskets/[id]"],
      ["/agents/theses/[id]/edit", "/agents/theses/[id]/edit"],
    ]);
  });

  it("treats our own site as a direct visit", () => {
    const parsed = parseBeacon({ sid: "abcdefgh12345678", e: [{ n: "$pageview", p: "/", r: "https://www.stocksbrew.online/stock/NVDA" }] }, ["www.stocksbrew.online"])!;
    expect(parsed.events[0]!.ref).toBeNull();
  });
});

describe("buffered writes", () => {
  it("never waits on the store, then writes one chunk with a visitor hash and no address or User-Agent", async () => {
    const { db, chunks } = fakeDb();
    setAnalyticsDbForTests(db);
    const parsed = parseBeacon(body, [])!;
    const started = performance.now();
    enqueue(parsed, { host: "localhost:8000", ip: IP, ua: UA });
    expect(performance.now() - started).toBeLessThan(5);
    expect(chunks).toHaveLength(0);
    expect(ingestStateForTests().buffer).toHaveLength(4);
    await flush();
    expect(chunks).toHaveLength(1);
    const { ns, chunk } = chunks[0]!;
    expect(ns).toBe("tm_analytics_dev");
    expect(chunk.count).toBe(4);
    expect(chunk.events[0]).toMatchObject({ n: "pageview", p: "/stock/NVDA", dev: "desktop", br: "Chrome", si: true });
    expect(chunk.events[0]!.vid).toMatch(/^[0-9a-f]{16}$/);
    const raw = JSON.stringify(chunk);
    expect(raw).not.toContain(IP);
    expect(raw).not.toContain("Macintosh");
    expect(ingestStateForTests().buffer).toHaveLength(0);
  });

  it("keeps a failed chunk as it is (hashed, same id) and writes it once the store is back", async () => {
    const { db, chunks } = fakeDb();
    let down = true;
    const ids: string[] = [];
    setAnalyticsDbForTests({
      ...db,
      writeChunk: async (ns, id, chunk) => {
        ids.push(id);
        if (down) throw new Error("down");
        return db.writeChunk(ns, id, chunk);
      },
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    enqueue(parseBeacon(body, [])!, { host: "localhost", ip: IP, ua: UA });
    await flush();
    const state = ingestStateForTests();
    expect(state.buffer).toHaveLength(0);
    expect(state.ready).toHaveLength(1);
    // Nothing identifying waits in memory while the store is down.
    expect(JSON.stringify(state.ready)).not.toContain(IP);
    down = false;
    await flush();
    expect(chunks).toHaveLength(1);
    expect(new Set(ids).size).toBe(1);
    expect(warn.mock.calls.flat().join(" ")).not.toContain(IP);
    warn.mockRestore();
  });

  it("gives the same chunk the same id, so a repeated write is one document", async () => {
    const { chunkId, chunkOf } = await import("@/lib/analytics/ingest");
    const events = [{ t: 1, n: "pageview" as const, sid: "s", vid: "v", p: "/", r: "/" }];
    expect(chunkId(chunkOf(events, 5))).toBe(chunkId(chunkOf(events, 9)));
    expect(chunkId(chunkOf(events, 5))).not.toBe(chunkId(chunkOf([{ ...events[0]!, p: "/x" }], 5)));
  });

  it("keeps only the minute and no session id on account events", async () => {
    const { db, chunks } = fakeDb();
    setAnalyticsDbForTests(db);
    const now = Date.parse("2026-11-13T10:15:42.123Z");
    const parsed = parseBeacon({ sid: "abcdefgh12345678", e: [{ n: "user_signed_up", p: "/" }, { n: "checkout_clicked", p: "/pricing" }, { n: "$pageview", p: "/" }] }, [])!;
    enqueue(parsed, { host: "localhost", ip: IP, ua: UA, now });
    await flush();
    const [signup, checkout, view] = chunks[0]!.chunk.events;
    expect(signup).toMatchObject({ n: "signup_completed", sid: "", t: Date.parse("2026-11-13T10:15:00Z") });
    expect(checkout).toMatchObject({ n: "checkout_started", sid: "" });
    expect(view).toMatchObject({ n: "pageview", sid: "abcdefgh12345678", t: now });
  });

  it("spools hashed events to a file on shutdown and sends them from the next process", async () => {
    const fs = await import("fs");
    const os = await import("os");
    const path = await import("path");
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spool-"));
    vi.stubEnv("ANALYTICS_SPOOL_DIR", dir);
    const { spoolNow } = await import("@/lib/analytics/ingest");
    const { db, chunks } = fakeDb();
    setAnalyticsDbForTests(db);
    const now = Date.now();
    // the day's salt is in memory once a flush has run
    enqueue(parseBeacon({ sid: "abcdefgh12345678", e: [{ n: "$pageview", p: "/a" }] }, [])!, { host: "localhost", ip: IP, ua: UA, now });
    await flush();
    enqueue(parseBeacon({ sid: "abcdefgh12345678", e: [{ n: "$pageview", p: "/b" }] }, [])!, { host: "localhost", ip: IP, ua: UA, now });
    spoolNow();
    const files = fs.readdirSync(dir);
    expect(files).toHaveLength(1);
    const raw = fs.readFileSync(path.join(dir, files[0]!), "utf8");
    expect(raw).toContain('"/b"');
    expect(raw).not.toContain(IP);
    expect(raw).not.toContain("Macintosh");
    expect(ingestStateForTests().buffer).toHaveLength(0);
    // the next process
    ingestStateForTests().spoolRead = false;
    enqueue(parseBeacon({ sid: "abcdefgh12345678", e: [{ n: "$pageview", p: "/c" }] }, [])!, { host: "localhost", ip: IP, ua: UA, now });
    await flush();
    expect(chunks.flatMap((c) => c.chunk.events.map((e) => e.p))).toEqual(["/a", "/b", "/c"]);
    expect(fs.readdirSync(dir)).toHaveLength(0);
    vi.unstubAllEnvs();
  });

  it("only writes to the real collections from the production host on a production build", () => {
    expect(analyticsNamespace("www.stocksbrew.online", "production")).toBe("tm_analytics");
    expect(analyticsNamespace("stocksbrew.online:443", "production")).toBe("tm_analytics");
    expect(analyticsNamespace("www.stocksbrew.online", "development")).toBe("tm_analytics_dev");
    expect(analyticsNamespace("localhost:3000", "production")).toBe("tm_analytics_dev");
    expect(analyticsNamespace(null, "production")).toBe("tm_analytics_dev");
  });
});

describe("/api/a", () => {
  async function post(ua: string, payload: unknown, headers: Record<string, string> = {}) {
    const { POST } = await import("@/app/api/a/route");
    const request = new NextRequest("http://localhost:8000/api/a", {
      method: "POST",
      headers: { "user-agent": ua, host: "localhost:8000", "x-forwarded-for": `${IP}, 127.0.0.1`, "content-type": "text/plain", ...headers },
      body: typeof payload === "string" ? payload : JSON.stringify(payload),
    });
    return POST(request);
  }

  it("answers 204 and queues a real browser's events", async () => {
    setAnalyticsDbForTests(fakeDb().db);
    const response = await post(UA, body, { origin: "http://localhost:8000" });
    expect(response.status).toBe(204);
    expect(ingestStateForTests().buffer).toHaveLength(4);
    expect(ingestStateForTests().buffer[0]!.ip).toBe(IP);
  });

  it("takes the visitor's address and country from Cloudflare when it sends them", async () => {
    const { db, chunks } = fakeDb();
    setAnalyticsDbForTests(db);
    await post(UA, body, { origin: "http://localhost:8000", "cf-connecting-ip": "203.0.113.200", "cf-ipcountry": "de" });
    expect(ingestStateForTests().buffer[0]).toMatchObject({ ip: "203.0.113.200", cc: "DE" });
    await flush();
    expect(chunks[0]!.chunk.events[0]!.cc).toBe("DE");
    resetIngestForTests();
    // Unknown or Tor: our own lookup decides; a garbage address falls back to X-Forwarded-For.
    await post(UA, body, { origin: "http://localhost:8000", "cf-connecting-ip": "not-an-ip", "cf-ipcountry": "T1" });
    expect(ingestStateForTests().buffer[0]).toMatchObject({ ip: IP, cc: null });
  });

  it("drops bots, other sites, oversized and malformed bodies, still with 204", async () => {
    expect((await post("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", body)).status).toBe(204);
    expect((await post(UA, body, { origin: "https://evil.example" })).status).toBe(204);
    expect((await post(UA, "x".repeat(9000))).status).toBe(204);
    expect((await post(UA, "{not json")).status).toBe(204);
    expect(ingestStateForTests().buffer).toHaveLength(0);
  });
});
