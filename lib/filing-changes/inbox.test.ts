import { describe, expect, it } from "vitest";

import { buildThread } from "@/lib/thread/build";
import { buildRecord } from "@/lib/thread/record";

import type { Comparison } from "./diff";
import { filingItem, filingItems } from "./inbox";
import type { FilingChangesDoc } from "./store";

const TODAY = "2026-11-13";

function comparison(form: "10-K" | "10-Q", filed: string, patch: Partial<Comparison> = {}): Comparison {
  return {
    status: "changes",
    scope: "full",
    filing: { form, accession: `acc-${filed}`, filed, period: null, url: `https://www.sec.gov/Archives/edgar/data/2488/${filed}.htm`, headings: 42 },
    base: null,
    added: [],
    dropped: [],
    reworded: [],
    same: 40,
    reason: null,
    ...patch,
  };
}

const doc = (ticker: string, latest: Comparison, history: Comparison[] = []): FilingChangesDoc => ({ version: 1, ticker, company: ticker, cik: 1, latest, history, updated_at: "", source: "SEC EDGAR" });

describe("filing changes in the inbox", () => {
  it("says what the filing did, with the first new risk in the company's words", () => {
    const item = filingItem("AMD", comparison("10-Q", "2026-11-12", { added: ["Export rules on China could limit sales of our data center chips.", "Another."], dropped: ["Old."] }))!;
    expect(item).toMatchObject({
      id: "filing:AMD:acc-2026-11-12",
      kind: "filing",
      day: "2026-11-12",
      exact: false,
      text: "AMD's new 10-Q adds 2 risks and drops 1.",
      detail: "New: “Export rules on China could limit sales of our data center chips.”",
      href: "/stock/AMD#filing-changes",
      source: "SEC 10-Q",
      quiet: false,
    });
  });

  it("counts as new from when it was compared, when that is after the filing day's close", () => {
    const item = filingItem("AMD", comparison("10-Q", "2026-11-12", { added: ["A new risk heading."], compared_at: "2026-11-13T22:40:00.000Z" }))!;
    expect(item.arrivedAt).toBe("2026-11-13T22:40:00.000Z");
    expect(item.day).toBe("2026-11-12");
  });

  it("lists a 10-Q with no changes quietly, and nothing for an unreadable or reworded-only one", () => {
    expect(filingItem("LLY", comparison("10-Q", "2026-10-29", { status: "no_changes", scope: null }))).toMatchObject({ quiet: true, text: "LLY's new 10-Q lists no changes to its risks." });
    expect(filingItem("X", comparison("10-K", "2026-11-12", { status: "unreadable" }))).toBeNull();
    expect(filingItem("X", comparison("10-K", "2026-11-12", { reworded: [{ from: "a", to: "b", score: 0.9 }] }))).toBeNull();
  });

  it("lists a 10-Q whose risks are only repeats quietly, linking to the stock page; cuts the quote at a clause", () => {
    const repeat = filingItem("SOFI", comparison("10-Q", "2026-11-05", { scope: "partial", repeated: ["A risk an earlier 10-Q added."] }))!;
    expect(repeat).toMatchObject({ quiet: true, href: "/stock/SOFI", text: "SOFI's new 10-Q repeats 1 risk added after its 10-K." });
    const long = filingItem("AMD", comparison("10-Q", "2026-11-04", { added: ["Our ability to complete the acquisition of ZT Systems is subject to closing conditions, including the receipt of consents and approvals."] }))!;
    expect(long.detail).toBe("New: “Our ability to complete the acquisition of ZT Systems is subject to closing conditions…”");
  });

  it("keeps only the person's stocks and filings in the window", () => {
    const docs = [doc("AMD", comparison("10-Q", "2026-11-04", { added: ["A new risk heading here."] }), [comparison("10-K", "2026-02-04", { added: ["Old."] })]), doc("NVDA", comparison("10-Q", "2026-11-05", { added: ["x y z"] }))];
    expect(filingItems(docs, new Set(["AMD"]), "2026-10-30").map((item) => item.id)).toEqual(["filing:AMD:acc-2026-11-04"]);
  });

  it("becomes a line in the agent's record, with the step to the stock's filing changes", () => {
    const item = filingItem("AMD", comparison("10-Q", "2026-11-12", { added: ["A new risk.", "Another new one."], dropped: ["Old."] }))!;
    const thread = buildThread({ status: "ready", example: false, today: TODAY, items: [item], upcoming: [], morning: null, sessions: [], group: { total: 1, holdings: true }, calls: {}, levels: () => true, stocks: 1 });
    const note = thread.days.flatMap((day) => day.notes).find((entry) => entry.id === item.id)!;
    expect(note.step).toEqual({ label: "See what AMD changed in its risks", href: "/stock/AMD#filing-changes" });
    const record = buildRecord(thread, [], TODAY);
    expect(record[0]).toMatchObject({ label: "Yesterday", items: [{ ticker: "AMD", text: "AMD's new 10-Q adds 2 risks and drops 1.", href: "/stock/AMD#filing-changes" }] });
  });
});
