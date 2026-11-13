import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase-admin", () => ({ adminFirestore: {}, adminAuth: {} }));

import { PRICE_TAIL_VERSION, entriesBefore, lastEntries, tailFromDoc, validSeries, type PriceTail } from "@/lib/price-tail";
import { RECENT_SESSIONS, compactSeriesFromRaw, lastPoints } from "@/lib/screener-series";

/** A history of `count` sessions and the tail backend/agentdata/prices.py tail_doc would cut from it. */
function history(count: number, keep = 640) {
  const start = Date.parse("2014-01-02T00:00:00Z");
  const dates = Array.from({ length: count }, (_, i) => new Date(start + i * 86_400_000).toISOString().slice(0, 10));
  const closes = dates.map((_, i) => Math.round((50 + Math.sin(i / 9) * 10 + i * 0.01) * 10000) / 10000);
  const from = Math.max(0, count - keep);
  const stored = {
    pt_v: PRICE_TAIL_VERSION,
    pt_src: "hash-1",
    pt_n: count,
    pt_from: from,
    pt_ordered: true,
    pt_source: "yahoo_chart",
    pt_fetched_at: "2026-11-12T22:40:00+00:00",
    pt_data: { dates: dates.slice(from), closes: closes.slice(from) },
  };
  return { raw: { dates, closes, source: "yahoo_chart", fetched_at: "2026-11-12T22:40:00+00:00" }, stored };
}

describe("tailFromDoc", () => {
  it("uses a tail only when it was cut from the history the store holds now", () => {
    const { stored } = history(1000);
    expect(tailFromDoc(stored, "hash-1")?.from).toBe(360);
    expect(tailFromDoc(stored, "hash-2")).toBeNull();
    expect(tailFromDoc(stored, undefined)).toBeNull();
    expect(tailFromDoc(null, "hash-1")).toBeNull();
    expect(tailFromDoc({ ...stored, pt_v: PRICE_TAIL_VERSION + 1 }, "hash-1")).toBeNull();
  });

  it("refuses a tail whose counts do not add up", () => {
    const { stored } = history(1000);
    expect(tailFromDoc({ ...stored, pt_n: 999 }, "hash-1")).toBeNull();
    expect(tailFromDoc({ ...stored, pt_from: -1 }, "hash-1")).toBeNull();
    expect(tailFromDoc({ ...stored, pt_data: { dates: stored.pt_data.dates, closes: stored.pt_data.closes.slice(1) } }, "hash-1")).toBeNull();
    expect(tailFromDoc({ ...stored, pt_data: null }, "hash-1")).toBeNull();
  });
});

describe("the readers get what the history gives them", () => {
  const sizes = [1, 2, 30, 399, 400, 401, 640, 641, 1000, 3018];

  it("portfolio series: the last 400 entries", () => {
    for (const count of sizes) {
      const { raw, stored } = history(count);
      const tail = tailFromDoc(stored, "hash-1")!;
      expect(validSeries(lastEntries(tail, 400)!, 400)).toEqual(validSeries(raw, 400));
    }
  });

  it("portfolio series: unusable entries inside the window stay in the same place", () => {
    const { raw, stored } = history(1000);
    raw.closes[900] = -1;
    stored.pt_data.closes[900 - 360] = -1;
    expect(validSeries(lastEntries(tailFromDoc(stored, "hash-1")!, 400)!, 400)).toEqual(validSeries(raw, 400));
  });

  it("a partial tail too short for the window is not used", () => {
    const { stored } = history(1000, 300);
    expect(lastEntries(tailFromDoc(stored, "hash-1")!, 400)).toBeUndefined();
  });

  it("agent prices: 70 sessions up to a day, or nothing when the tail does not reach", () => {
    for (const count of sizes) {
      const { raw, stored } = history(count);
      const tail = tailFromDoc(stored, "hash-1")!;
      for (const end of ["2013-01-01", raw.dates[0]!, raw.dates[Math.floor(count / 2)]!, raw.dates[count - 1]!, "2030-01-01"]) {
        let last = count;
        while (last > 0 && raw.dates[last - 1]! > end) last -= 1;
        const start = Math.max(0, last - 70);
        const window = entriesBefore(tail, end, 70);
        if (window) expect(window).toEqual({ dates: raw.dates.slice(start, last), closes: raw.closes.slice(start, last) });
        else expect(tail.from > 0 && (last < tail.from + 1 || start < tail.from)).toBe(true);
      }
    }
  });

  it("recent compact series: the end of the cleaned history when the dates run forward", () => {
    for (const count of sizes) {
      const { raw, stored } = history(count);
      const tail = tailFromDoc(stored, "hash-1") as PriceTail;
      const fromTail = compactSeriesFromRaw({ dates: tail.dates as string[], closes: tail.closes as number[], source: tail.source as string, fetched_at: tail.fetchedAt as string });
      const full = compactSeriesFromRaw(raw);
      if (tail.from === 0 || (fromTail && fromTail.dates.length >= RECENT_SESSIONS)) {
        expect(fromTail && lastPoints(fromTail, RECENT_SESSIONS)).toEqual(full && lastPoints(full, RECENT_SESSIONS));
      }
    }
  });
});

describe("readPriceTails over the store", () => {
  async function withStore(answer: (body: { paths: string[]; select: string[] }) => Response | Promise<Response>) {
    vi.stubEnv("LOCALDB_URL", "http://store.test");
    vi.stubEnv("LOCALDB_API_TOKEN", "test-token");
    const { setLocalDbFetchForTests } = await import("@/lib/local-firestore");
    const asked: string[][] = [];
    setLocalDbFetchForTests(async (_url, init) => {
      const body = JSON.parse(String(init.body)) as { paths: string[]; select: string[] };
      asked.push(body.paths);
      return answer(body);
    });
    return { asked, done: () => (setLocalDbFetchForTests(), vi.unstubAllEnvs()) };
  }
  const json = (documents: unknown[]) => new Response(JSON.stringify({ documents, count: documents.length }), { status: 200 });

  it("a proven tail, a missing history (null) and an unproven tail (undefined), in one read", async () => {
    const { readPriceTails } = await import("@/lib/price-tail");
    const { stored } = history(1000);
    const store = await withStore(() =>
      json([
        { path: "tm_price_tail/AAA", data: stored, hash: "t1" },
        { path: "tm_price_history_daily/AAA", data: {}, hash: "hash-1" },
        { path: "tm_price_tail/CCC", data: stored, hash: "t3" },
        { path: "tm_price_history_daily/CCC", data: {}, hash: "hash-changed" },
      ]),
    );
    try {
      const tails = await readPriceTails(["aaa", "BBB", "CCC", "A/B"]);
      expect(tails.get("AAA")?.from).toBe(360);
      expect(tails.get("BBB")).toBeNull();
      expect(tails.get("CCC")).toBeUndefined();
      // A slash is never looked up under the dashed id.
      expect(tails.has("A/B") && tails.get("A/B")).toBeUndefined();
      expect(store.asked).toHaveLength(1);
      expect(store.asked[0]).not.toContain("tm_price_tail/A-B");
    } finally {
      store.done();
    }
  });

  it("a failed read leaves every symbol to the history read", async () => {
    const { readPriceTails } = await import("@/lib/price-tail");
    const store = await withStore(() => new Response("{}", { status: 500 }));
    try {
      const tails = await readPriceTails(["AAA", "BBB"]);
      expect([...tails.values()]).toEqual([undefined, undefined]);
    } finally {
      store.done();
    }
  });

  it("off LocalDB (the Firebase rollback) nothing is read", async () => {
    vi.stubEnv("LOCALDB_URL", "");
    const { readPriceTails } = await import("@/lib/price-tail");
    try {
      expect((await readPriceTails(["AAA"])).get("AAA")).toBeUndefined();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
