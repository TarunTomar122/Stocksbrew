import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));

const docs = new Map<string, Record<string, unknown>>();

vi.mock("@/lib/firebase-admin", () => ({
  adminFirestore: {
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => {
          const data = docs.get(`${name}/${id}`);
          return { exists: Boolean(data), data: () => data };
        },
      }),
      where: (_field: string, _op: string, value: string) => ({
        get: async () => ({
          docs: [...docs.entries()]
            .filter(([path, data]) => path.startsWith(`${name}/`) && String(data.event_date) >= value)
            .map(([, data]) => ({ data: () => data })),
        }),
      }),
    }),
  },
}));

import { getEarningsDayReport, latestReportFor, recentReportsFor, sitemapReports } from "./earnings-day";

function stored(ticker: string, day: string, extra: Record<string, unknown> = {}) {
  docs.set(`tm_earnings_day/${ticker}__${day}`, {
    ticker,
    company: ticker,
    event_date: day,
    status: "complete",
    filing: { url: "https://www.sec.gov/x.htm", filed_at: `${day}T21:00:00Z` },
    eps: { verdict: "beat", estimate: 1, actual: 1.1 },
    read: { title: `${ticker} earnings`, headline: `${ticker} beat.`, insights: [], watch: [] },
    updated_at: `${day}T22:00:00Z`,
    ...extra,
  });
}

describe("earnings day loaders", () => {
  beforeEach(() => {
    docs.clear();
    // The dev folder is a laptop convenience; tests read only the mocked store.
    vi.stubEnv("NODE_ENV", "production");
  });

  it("reads one report by ticker and day", async () => {
    stored("QLYS", "2026-11-09");
    expect((await getEarningsDayReport("QLYS", "2026-11-09"))?.read?.title).toBe("QLYS earnings");
    expect(await getEarningsDayReport("QLYS", "2026-11-10")).toBeNull();
  });

  it("finds recent reports for tracked instrument ids, newest per ticker", async () => {
    stored("QLYS", "2026-08-04");
    stored("QLYS", "2026-11-09");
    stored("BRK.B", "2026-11-07");
    stored("NVDA", "2026-11-09");
    const found = await recentReportsFor(["US_QLYS", "US_BRK_B"], 3, "2026-11-10");
    expect(found.map((r) => `${r.ticker} ${r.event_date}`)).toEqual(["QLYS 2026-11-09", "BRK.B 2026-11-07"]);
  });

  it("keeps the stock page link for about a quarter", async () => {
    stored("QLYS", "2026-08-04");
    expect((await latestReportFor("QLYS", "2026-11-10"))?.event_date).toBe("2026-08-04");
    expect(await latestReportFor("QLYS", "2027-02-20")).toBeNull();
  });

  it("lists only indexable reports in the sitemap", async () => {
    stored("QLYS", "2026-11-09");
    stored("TTWO", "2026-11-09", { status: "partial" });
    expect(await sitemapReports("2026-11-10")).toEqual([{ ticker: "QLYS", day: "2026-11-09", lastmod: "2026-11-09" }]);
  });
});
