import { describe, expect, it } from "vitest";

import { greenShare, groupChecks, parseHistory, parseLatest, stripRows, unitName, worstOf } from "@/lib/ops-health";

const NOW = Date.parse("2026-11-13T12:00:00Z");
const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();

describe("parseLatest", () => {
  it("keeps a well-formed document and fills safe defaults", () => {
    const parsed = parseLatest({
      generated_at: at(2),
      overall: "warn",
      checks: [
        { id: "site_home", group: "site", label: "Home page", status: "ok", detail: "HTTP 200 in 120 ms", ms: 120 },
        { id: "swap", group: "box", label: "Swap", status: "bogus", detail: "3.5 GB used" },
        { group: "box" },
      ],
      system: { mem_total: 8, mem_available: 4, disks: [{ mount: "/", free: 1, total: 2 }] },
      traffic: { last_15m: { requests: 10, errors_5xx: 1, top_5xx: [{ path: "500 /x", count: 1 }, { nope: 1 }] } },
      jobs: [{ unit: "tikrr-postclose.service", runs: 1, failures: 0, cpu_s: 3, last_ok: false }],
      backup: { ok: true, last_ok_at: at(300), compressed_bytes: 900, timings: { total_s: 300, junk: "x" } },
      alert: { enabled: false, would_send: { subject: "stocksbrew: 1 check red (Home page)", at: at(5) } },
    });
    expect(parsed).not.toBeNull();
    expect(parsed!.checks.map((c) => c.status)).toEqual(["ok", "unknown"]);
    expect(parsed!.system.disks[0]).toEqual({ mount: "/", label: "/", free: 1, total: 2 });
    expect(parsed!.traffic.last_15m!.top_5xx).toEqual([{ path: "500 /x", count: 1 }]);
    expect(parsed!.traffic.last_60m).toBeUndefined();
    expect(parsed!.jobs[0]!.last_ok).toBe(false);
    expect(parsed!.backup!.timings).toEqual({ total_s: 300 });
    expect(parsed!.alert!.would_send!.subject).toContain("Home page");
    expect(parsed!.localdb).toBeNull();
  });

  it("returns null for anything that is not a health document", () => {
    expect(parseLatest(null)).toBeNull();
    expect(parseLatest({ checks: [] })).toBeNull();
    expect(parseLatest({ generated_at: at(1), checks: "nope" })).toBeNull();
  });
});

describe("history strip", () => {
  const history = parseHistory({
    entries: [
      { t: at(5), o: "a", c: { swap: "a", site_home: "g" } },
      { t: at(10), o: "g", c: { swap: "g", site_home: "g" } },
      { t: at(12), o: "r", c: { swap: "g", site_home: "r" } },
      { t: at(60 * 30), o: "r", c: { site_home: "r" } }, // older than 24 h: ignored
      { t: "not a time", o: "r", c: {} },
    ],
  });

  it("sorts and drops bad entries", () => {
    expect(history).toHaveLength(4);
    expect(Date.parse(history[0]!.t)).toBeLessThan(Date.parse(history[3]!.t));
  });

  it("buckets the last 24 hours with the worst result per slot", () => {
    const rows = stripRows(history, ["site_home", "swap", "never"], NOW, 96);
    const overall = rows[0]!;
    expect(overall.id).toBe("overall");
    expect(overall.cells).toHaveLength(96);
    // 5, 10 and 12 minutes ago all land in the last 15-minute slot: red wins.
    expect(overall.cells[95]).toBe("fail");
    expect(overall.cells.slice(0, 95).every((c) => c === null)).toBe(true);
    expect(rows.find((r) => r.id === "swap")!.cells[95]).toBe("warn");
    expect(rows.find((r) => r.id === "never")!.cells.every((c) => c === null)).toBe(true);
  });

  it("green share counts runs inside the window", () => {
    expect(greenShare(history, NOW)).toBeCloseTo(1 / 3);
    expect(greenShare([], NOW)).toBeNull();
  });
});

describe("helpers", () => {
  it("orders groups and names units", () => {
    const groups = groupChecks([
      { id: "a", group: "box", label: "A", status: "ok", detail: "" },
      { id: "b", group: "site", label: "B", status: "ok", detail: "" },
      { id: "c", group: "zzz", label: "C", status: "ok", detail: "" },
    ]);
    expect(groups.map((g) => g.label)).toEqual(["Site", "Box", "zzz"]);
    expect(unitName("tikrr-agentdata-frequent.service")).toBe("agentdata-frequent");
    expect(worstOf(["ok", "unknown", "warn"])).toBe("warn");
    expect(worstOf([])).toBe("unknown");
  });
});
