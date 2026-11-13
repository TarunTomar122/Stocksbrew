import { describe, expect, it } from "vitest";

import { ANOMALY_REFS_VERSION, docsFromRefRows } from "@/lib/anomaly-refs";

const source = (id: string, hash: string) => ({ path: `tm_daily_anomalies/${id}`, data: {}, hash });
const copy = (id: string, src: string, rows: unknown[] = [{ ticker: "AAA" }], extra: Record<string, unknown> = {}) => ({
  path: `tm_daily_anomaly_refs/${id}`,
  data: { mr_v: ANOMALY_REFS_VERSION, mr_src: src, mr_date: id.slice(4), mr_rows: rows, ...extra },
});

describe("docsFromRefRows", () => {
  it("stands the copies in for the sources, dated ones first", () => {
    const rows = [source("US__2026-11-12", "h1"), copy("US__2026-11-12", "h1"), source("US__latest", "h2"), copy("US__latest", "h2", [{ ticker: "BBB" }])];
    expect(docsFromRefRows(["US__2026-11-12"], "US__latest", rows)).toEqual([
      { id: "US__2026-11-12", data: { date: "2026-11-12", anomalies: [{ ticker: "AAA" }] } },
      { id: "US__latest", data: { date: "latest", anomalies: [{ ticker: "BBB" }] } },
    ]);
  });

  it("any copy cut from another version, of another layout, or missing sends the reader to the sources", () => {
    const base = [source("US__2026-11-12", "h1"), copy("US__2026-11-12", "h1")];
    expect(docsFromRefRows(["US__2026-11-12"], null, [source("US__2026-11-12", "h9"), copy("US__2026-11-12", "h1")])).toBeUndefined();
    expect(docsFromRefRows(["US__2026-11-12"], null, [source("US__2026-11-12", "h1")])).toBeUndefined();
    expect(docsFromRefRows(["US__2026-11-12"], null, [source("US__2026-11-12", "h1"), copy("US__2026-11-12", "h1", [], { mr_v: 99 })])).toBeUndefined();
    expect(docsFromRefRows(["US__2026-11-12"], null, [source("US__2026-11-12", "h1"), copy("US__2026-11-12", "h1", [], { mr_rows: "x" })])).toBeUndefined();
    // A dated doc gone between the id query and this read: not proven.
    expect(docsFromRefRows(["US__2026-11-12", "US__2026-11-11"], null, base)).toBeUndefined();
    // The latest feed may be missing, as when it is read on its own.
    expect(docsFromRefRows(["US__2026-11-12"], "US__latest", base)).toHaveLength(1);
    expect(docsFromRefRows(["US__2026-11-12"], "US__latest", [...base, source("US__latest", "h3")])).toBeUndefined();
  });

  it("nothing asked, nothing needed", () => {
    expect(docsFromRefRows([], null, [])).toEqual([]);
  });
});
