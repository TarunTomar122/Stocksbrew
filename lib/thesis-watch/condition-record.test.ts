import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase-admin", () => ({ adminFirestore: {} }));
vi.mock("./server", () => ({ watches: () => true }));

import { buildRecord } from "@/lib/thread/record";

import { recordLines } from "./condition-record";
import type { ConditionRecord } from "./conditions";

const held: ConditionRecord = {
  key: "revenue_growth:above:20",
  status: "holds",
  now: 41.87,
  as_of: "2026-11-08",
  line: "AMD's Q3: revenue growth 42%, above your 20%. Reason holds.",
  source: "Revenue growth 42% after the Q3 report, Nov 3 (SEC 8-K)",
  href: "/stock/AMD",
  report_date: "2026-11-03",
  report_quarter: "Q3",
  checked_on: "2026-11-03",
  since: "2026-11-03",
  metric: "revenue_growth",
  judged_now: 41.87,
  judged_status: "holds",
  judged_source: "Revenue growth 42% after the Q3 report, Nov 3 (SEC 8-K)",
  judged_stopped: null,
};

describe("the report-day record line", () => {
  it("files a held line under the night the report was checked, once", () => {
    const lines = recordLines("AMD", [held], "2026-11-05");
    expect(lines).toHaveLength(1);
    expect(lines[0]!.day).toBe("2026-11-03");
    expect(lines[0]!.item).toMatchObject({ kind: "quiet", ticker: "AMD", text: held.line });
    const days = buildRecord(null, [], "2026-11-05", lines);
    expect(days.map((day) => [day.day, day.items.map((item) => item.text)])).toEqual([["2026-11-03", [held.line]]]);
  });

  it("says two lines that held on the same report once", () => {
    const margin = { ...held, key: "gross_margin:above:50", now: 56, line: "AMD's Q3: gross margin 56%, above your 50%. Reason holds." };
    const lines = recordLines("AMD", [held, margin], "2026-11-05");
    expect(lines.map((line) => line.item.text)).toEqual(["AMD's Q3: revenue growth 42% and gross margin 56%. Both your lines hold."]);
    expect(lines[0]!.item.text.split(/\s+/).length).toBeLessThanOrEqual(15);
  });

  it("leaves out broken lines (they are proposals), lines never checked on a report day, and old ones", () => {
    expect(recordLines("AMD", [{ ...held, status: "broken" }], "2026-11-05")).toEqual([]);
    expect(recordLines("AMD", [{ ...held, checked_on: null }], "2026-11-05")).toEqual([]);
    expect(recordLines("AMD", [held], "2026-12-01")).toEqual([]);
  });
});
