import { describe, expect, it } from "vitest";

import type { EdgarFiling, FilingList, RiskList } from "@/lib/research/edgar";

import { compareStock, runFailed, runFilingChanges, summaryLine, type JobDeps } from "./job";
import { trackedTickers, tickerOfId } from "./tickers";
import type { FilingChangesDoc } from "./store";

function filing(form: "10-K" | "10-Q", filed: string): EdgarFiling {
  return { form, company: "ADVANCED MICRO DEVICES INC", cik: 2488, accession: `acc-${form}-${filed}`, filed, period: null, url: `https://www.sec.gov/Archives/edgar/data/2488/${filed}.htm` };
}

const HEADINGS = [
  "The markets in which our products are sold are highly competitive and rapidly evolving.",
  "The semiconductor industry is highly cyclical and has experienced severe downturns.",
  "Our operating results are subject to quarterly and seasonal sales patterns.",
  "We rely on third parties to manufacture our products.",
  "Government actions and regulations such as export regulations may limit our ability to sell our products.",
  "Climate change may have a long-term impact on our business.",
];
const NEW_RISK = "We may be required to satisfy financial obligations under guarantees and other commercial commitments.";

function deps(lists: Record<string, FilingList | null>, risks: Record<string, RiskList>, stored: Map<string, FilingChangesDoc> = new Map()) {
  const fetched: string[] = [];
  const written = new Map<string, FilingChangesDoc>();
  let now = 0;
  const value: JobDeps = {
    tickers: async () => ({ tickers: Object.keys(lists), tracked: 1 }),
    readStored: async () => stored,
    listFilings: async (ticker) => lists[ticker] ?? null,
    riskList: async (entry) => {
      fetched.push(entry.accession);
      const list = risks[entry.accession];
      if (!list) throw new Error("sec_document_404");
      return list;
    },
    write: async (ticker, doc) => {
      written.set(ticker, doc);
    },
    clock: () => (now += 10),
  };
  return { value, fetched, written };
}

const whole = (headings: string[]): RiskList => ({ found: true, headings, intro: null, method: "emphasis" });

describe("comparing one stock", () => {
  const list: FilingList = { cik: 2488, company: "AMD", filings: [filing("10-Q", "2026-11-04"), filing("10-Q", "2026-08-05"), filing("10-K", "2026-02-04"), filing("10-K", "2025-02-05")] };

  it("reads a no-changes 10-Q without opening its 10-K, and seeds the 10-K's own comparison", async () => {
    const quiet: RiskList = { found: true, headings: [], intro: "There have been no material changes to our risk factors.", method: "none" };
    const { value, fetched } = deps({}, { "acc-10-Q-2026-11-04": quiet, "acc-10-K-2026-02-04": whole([...HEADINGS, NEW_RISK]), "acc-10-K-2025-02-05": whole(HEADINGS) });
    const reads = (entry: EdgarFiling) => value.riskList(entry).then((risk) => ({ filing: entry, found: risk.found, headings: risk.headings, intro: risk.intro }));
    const comparisons = await compareStock(list, null, reads);
    expect(comparisons.map((entry) => `${entry.filing.form} ${entry.status}`)).toEqual(["10-Q no_changes", "10-K changes"]);
    expect(comparisons[0]!.base).toMatchObject({ form: "10-K", filed: "2026-02-04", headings: null });
    expect(comparisons[1]!.added).toEqual([NEW_RISK]);
    // The 10-Q, then the two 10-Ks for the seed: the 10-Q's own read of its 10-K was skipped.
    expect(fetched).toEqual(["acc-10-Q-2026-11-04", "acc-10-K-2026-02-04", "acc-10-K-2025-02-05"]);
  });

  it("does not compare the 10-K again once it is stored", async () => {
    const quiet: RiskList = { found: true, headings: [], intro: "No material changes.", method: "none" };
    const { value, fetched } = deps({}, { "acc-10-Q-2026-11-04": quiet });
    const stored: FilingChangesDoc = {
      version: 1,
      ticker: "AMD",
      company: "AMD",
      cik: 2488,
      latest: { status: "changes", scope: "full", filing: { ...filing("10-K", "2026-02-04"), headings: 7 }, base: null, added: [NEW_RISK], dropped: [], reworded: [], same: 6, reason: null },
      history: [],
      updated_at: "2026-02-05T00:00:00Z",
      source: "SEC EDGAR",
    };
    const reads = (entry: EdgarFiling) => value.riskList(entry).then((risk) => ({ filing: entry, found: risk.found, headings: risk.headings, intro: risk.intro }));
    const comparisons = await compareStock(list, stored, reads);
    expect(comparisons).toHaveLength(1);
    expect(fetched).toEqual(["acc-10-Q-2026-11-04"]);
  });
});

describe("the run", () => {
  const amd: FilingList = { cik: 2488, company: "AMD", filings: [filing("10-K", "2026-02-04"), filing("10-K", "2025-02-05")] };

  it("writes a comparison for a new filing and skips a stock whose newest filing is stored", async () => {
    const { value, written } = deps({ AMD: amd, SPY: null }, { "acc-10-K-2026-02-04": whole([...HEADINGS, NEW_RISK]), "acc-10-K-2025-02-05": whole(HEADINGS) });
    const lines: string[] = [];
    const summary = await runFilingChanges(value, { now: new Date("2026-11-13T22:00:00Z"), log: (line) => lines.push(line) });
    expect(summary).toMatchObject({ tickers: 2, noFilings: 1, written: 1, withAdded: 1, failed: 0 });
    expect(written.get("AMD")!.latest).toMatchObject({ status: "changes", added: [NEW_RISK] });
    expect(lines).toEqual(["AMD 10-K 2026-02-04 changes/full +1 −0 ~0 =6 against 10-K 2025-02-05"]);

    const again = deps({ AMD: amd }, {}, new Map([["AMD", written.get("AMD")!]]));
    const second = await runFilingChanges(again.value, {});
    expect(second).toMatchObject({ unchanged: 1, written: 0 });
    expect(again.fetched).toEqual([]);
  });

  it("writes nothing on a dry run", async () => {
    const { value, written } = deps({ AMD: amd }, { "acc-10-K-2026-02-04": whole(HEADINGS), "acc-10-K-2025-02-05": whole(HEADINGS) });
    const summary = await runFilingChanges(value, { dryRun: true });
    expect(written.size).toBe(0);
    expect(summaryLine(summary)).toMatch(/^dry run, nothing written: 1 stocks/);
  });

  it("counts a failed read and goes on; checks only the tickers asked for", async () => {
    const { value } = deps({ AMD: amd, NVDA: { cik: 1, company: "NVDA", filings: [filing("10-K", "2026-02-25")] } }, {});
    const summary = await runFilingChanges(value, { only: ["nvda", "amd"] });
    expect(summary).toMatchObject({ tickers: 2, failed: 2, written: 0 });
    expect(runFailed(summary)).toBe(true);
  });

  it("stops starting stocks when the time is up, without calling it a failure", async () => {
    const { value } = deps({ AMD: amd, NVDA: amd }, { "acc-10-K-2026-02-04": whole(HEADINGS), "acc-10-K-2025-02-05": whole(HEADINGS) });
    const summary = await runFilingChanges(value, { budgetMs: 0, concurrency: 1 });
    expect(summary.skippedForTime).toBe(2);
    expect(runFailed(summary)).toBe(false);
  });
});

describe("which stocks", () => {
  it("reads US ids as tickers and leaves everything else out", () => {
    expect(tickerOfId("US_BRK_B")).toBe("BRK.B");
    expect(tickerOfId("us_amd")).toBe("AMD");
    expect(tickerOfId("IN_RELIANCE")).toBeNull();
    expect(tickerOfId("US_")).toBeNull();
  });

  it("puts holdings first, then watched names, each once", () => {
    expect(
      trackedTickers([
        { tracked_stocks: ["US_NVDA", "US_AMD"], watchlist_positions: { US_AMD: "holding" } },
        { tracked_stocks: ["US_NVDA", "IN_TCS"], watchlist_positions: { US_SMCI: "holding" } },
        { tracked_stocks: "not a list" },
      ]),
    ).toEqual(["AMD", "SMCI", "NVDA"]);
  });
});
