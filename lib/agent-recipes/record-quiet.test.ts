import { describe, expect, it } from "vitest";

import { buildRecord, type RecordItem } from "@/lib/thread/record";
import type { Thread, ThreadNote } from "@/lib/thread/types";

const TODAY = "2026-11-12";

const note = (patch: Partial<ThreadNote>): ThreadNote => ({
  id: "n",
  kind: "event",
  at: null,
  clock: null,
  tickers: [],
  text: "",
  sub: null,
  figure: null,
  reason: null,
  call: null,
  step: null,
  recent: [],
  reports: [],
  source: null,
  locked: false,
  morning: false,
  ...patch,
});

const thread: Thread = {
  status: "ready",
  example: false,
  today: TODAY,
  stocks: 3,
  days: [
    {
      day: TODAY,
      label: "Today",
      date: "Nov 12",
      notes: [
        note({ id: "quiet:2026-11-12", kind: "quiet", text: "2 of your agents checked today and found nothing that needs you." }),
        note({ id: "filing:AMD:x", kind: "quiet", text: "AMD's new 10-Q changes nothing." }),
      ],
    },
  ],
};

const line: RecordItem = { id: "note:agents-quiet:2026-11-12", kind: "quiet", ticker: null, text: "4 agents checked, nothing needs you.", tag: null, figure: null, href: "/agents" };

describe("today's quiet line across every agent", () => {
  it("stands in for the thread's own agent line and keeps the other quiet notes", () => {
    const record = buildRecord(thread, [], TODAY, [], line);
    expect(record[0]!.items.map((item) => item.text)).toEqual(["AMD's new 10-Q changes nothing.", "4 agents checked, nothing needs you."]);
  });

  it("drops the thread's agent line when no agent checked quietly today", () => {
    const record = buildRecord(thread, [], TODAY, [], null);
    expect(record[0]!.items.map((item) => item.text)).toEqual(["AMD's new 10-Q changes nothing."]);
  });

  it("keeps the thread's line when the cross-agent read did not come back", () => {
    const record = buildRecord(thread, [], TODAY, []);
    expect(record[0]!.items.map((item) => item.id)).toContain("note:quiet:2026-11-12");
  });
});
