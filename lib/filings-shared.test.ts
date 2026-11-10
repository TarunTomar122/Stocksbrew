import { describe, expect, it } from "vitest";

import { filingDay, filingTime, groupFilingsByDay, normalizeFiling, parseFilingGroup } from "@/lib/filings-shared";

const base = {
  ticker: "aapl",
  company: "Apple Inc.",
  form: "8-K",
  form_group: "8-K",
  is_amendment: false,
  headline: "Results of operations (earnings)",
  items: [{ code: "2.02", label: "Results of operations (earnings)" }, { code: "9.01" }],
  filed_at: "2026-11-03T13:05:15+00:00",
  url: "https://www.sec.gov/Archives/edgar/data/320193/x/a.htm",
  role: "subject",
};

describe("normalizeFiling", () => {
  it("keeps what a row needs and drops malformed items", () => {
    const filing = normalizeFiling(base, "AAPL_1");
    expect(filing).toMatchObject({ id: "AAPL_1", ticker: "AAPL", group: "8-K", amendment: false });
    expect(filing?.items).toEqual([{ code: "2.02", label: "Results of operations (earnings)" }]);
  });

  it("rejects rows without a time, a known form or an sec.gov link", () => {
    expect(normalizeFiling({ ...base, filed_at: "" }, "x")).toBeNull();
    expect(normalizeFiling({ ...base, filed_at: "soon" }, "x")).toBeNull();
    expect(normalizeFiling({ ...base, form_group: "4" }, "x")).toBeNull();
    expect(normalizeFiling({ ...base, url: "https://example.com/a" }, "x")).toBeNull();
  });

  it("leaves out stake reports the company filed about someone else", () => {
    expect(normalizeFiling({ ...base, form_group: "13D/G", form: "SC 13G", role: "filer" }, "x")).toBeNull();
    expect(normalizeFiling({ ...base, form_group: "13D/G", form: "SC 13G", role: undefined }, "x")).toBeNull();
    expect(normalizeFiling({ ...base, form_group: "13D/G", form: "SC 13G", role: "subject" }, "x")?.group).toBe("13D/G");
  });
});

describe("filing times", () => {
  it("uses New York time, including across midnight UTC", () => {
    expect(filingTime("2026-11-03T13:05:15+00:00")).toBe("08:05");
    expect(filingDay("2026-11-04T01:30:00+00:00")).toBe("2026-11-03");
    expect(filingTime("2026-11-04T05:00:00+00:00")).toBe("00:00");
  });

  it("groups a newest-first list by New York day", () => {
    const a = normalizeFiling({ ...base, filed_at: "2026-11-04T01:30:00+00:00" }, "a")!;
    const b = normalizeFiling({ ...base, filed_at: "2026-11-03T13:05:15+00:00" }, "b")!;
    const c = normalizeFiling({ ...base, filed_at: "2026-11-02T21:00:00+00:00" }, "c")!;
    expect(groupFilingsByDay([a, b, c]).map((day) => [day.day, day.filings.length])).toEqual([
      ["2026-11-03", 2],
      ["2026-11-02", 1],
    ]);
  });
});

describe("parseFilingGroup", () => {
  it("accepts the url spelling for 13D/G", () => {
    expect(parseFilingGroup("13DG")).toBe("13D/G");
    expect(parseFilingGroup("10-k")).toBe("10-K");
    expect(parseFilingGroup("4")).toBeNull();
    expect(parseFilingGroup("")).toBeNull();
  });
});
