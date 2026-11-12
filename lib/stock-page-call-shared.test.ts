import { describe, expect, it } from "vitest";

import { callLine } from "@/components/stock-report/call-line";
import { levelFormatter } from "@/components/stock-report/format";
import { ownCallLevel } from "@/lib/call-level";
import { closeWords } from "@/lib/benchmark-day";
import { buildCompareTable, comparePricedAt } from "@/lib/compare-shared";
import { sessionDayOf } from "@/lib/session-label";
import type { ScreenerRow } from "@/lib/screener-shared";
import { withStockPageCall, type StockPageCall } from "@/lib/stock-page-call-shared";

// The judges' AMD case, Nov 12: last night's snapshot row against the stock page's quote and rewritten brief.
const snapshotRow: ScreenerRow = {
  symbol: "AMD",
  name: "Advanced Micro Devices",
  price: 552.96,
  price_at: "2026-11-11T20:59:00+00:00",
  day_pct: -1.2,
  call: "Add",
  call_reason: "Sales grew 42% over four quarters.",
  call_reason_source: "company",
  add_below: 508.58,
  to_add_pct: 8.73,
  zone: "between",
} as ScreenerRow;

const live: StockPageCall = {
  symbol: "AMD",
  price: 585.58,
  priceAt: "2026-11-12T20:59:00+00:00",
  dayPct: 5.91,
  call: "Add",
  zones: { addBelow: 564.2, addAbove: null, trimAbove: null },
  callAt: "2026-11-12T21:29:44+00:00",
};

describe("withStockPageCall", () => {
  it("lays the stock page's price, move, call and level over last night's row", () => {
    const row = withStockPageCall(snapshotRow, live);
    expect(row.price).toBe(585.58);
    expect(row.price_at).toBe("2026-11-12T20:59:00+00:00");
    expect(row.day_pct).toBe(5.91);
    expect(row.add_below).toBe(564.2);
    expect(row.to_add_pct).toBeCloseTo(3.79, 2);
    expect(row.zone).toBe("between");
    // Same call: the snapshot's reason still goes with it.
    expect(row.call_reason).toBe(snapshotRow.call_reason);
  });

  it("prints the same call line as the stock page", () => {
    const row = withStockPageCall(snapshotRow, live);
    const money = levelFormatter("$");
    const compare = callLine({ callWord: null, callAction: null, level: ownCallLevel(row.call, { addBelow: row.add_below }), hidden: null, price: row.price!, money, plan: "" });
    const stockPage = callLine({ callWord: "Buy more", callAction: null, level: ownCallLevel(live.call, live.zones), hidden: null, price: live.price, money, plan: "pro" });
    expect(compare?.text).toBe("Buy more below $564, 3.7% under today's $586.");
    expect(compare?.text).toBe(stockPage?.text);
  });

  it("drops the old call's reason when the call changed, and recomputes where the price sits", () => {
    const row = withStockPageCall(snapshotRow, { ...live, call: "Trim", zones: { addBelow: null, addAbove: null, trimAbove: 580 } });
    expect(row.call).toBe("Trim");
    expect(row.call_reason).toBeUndefined();
    expect(row.add_below).toBeUndefined();
    expect(row.trim_above).toBe(580);
    expect(row.zone).toBe("trim");
    expect(row.to_add_pct).toBeUndefined();
  });

  it("keeps a Buy more above level for a breakout call", () => {
    const row = withStockPageCall(snapshotRow, { ...live, zones: { addBelow: null, addAbove: 600, trimAbove: null } });
    expect(row.add_above).toBe(600);
    expect(row.add_below).toBeUndefined();
  });

  it("never lays an older quote over a newer row, and keeps the row when there is no live read", () => {
    const older = withStockPageCall(snapshotRow, { ...live, priceAt: "2026-11-10T20:59:00+00:00" });
    expect(older.price).toBe(552.96);
    expect(older.day_pct).toBe(-1.2);
    expect(withStockPageCall(snapshotRow, null)).toBe(snapshotRow);
  });

  it("keeps the row's call when the stock page has no read, but moves its price", () => {
    const row = withStockPageCall(snapshotRow, { ...live, call: null, zones: { addBelow: null, addAbove: null, trimAbove: null } });
    expect(row.call).toBe("Add");
    expect(row.add_below).toBe(508.58);
    expect(row.price).toBe(585.58);
    expect(row.to_add_pct).toBeCloseTo(15.14, 2);
  });
});

describe("callLine priceDay", () => {
  it("names the quote's session instead of today", () => {
    const line = callLine({ callWord: null, callAction: null, level: { label: "We'd buy more below", price: 564 }, hidden: null, price: 586, money: levelFormatter("$"), plan: "", priceDay: "Friday's" });
    expect(line?.text).toBe("Buy more below $564, 3.8% under Friday's $586.");
  });
});

describe("buildCompareTable labels", () => {
  it("relabels the move row with its real day", () => {
    const groups = buildCompareTable([withStockPageCall(snapshotRow, live)], { day_pct: "Yesterday" });
    const day = groups.flatMap((group) => group.rows).find((row) => row.id === "day_pct");
    expect(day?.label).toBe("Yesterday");
  });
});

describe("the compare page's one as-of (council, Nov 12)", () => {
  it("comes from the newest price shown, so today's price is never under yesterday's close", () => {
    // AVGO's live quote is older than AMD's snapshot row would be: the newest shown price decides.
    const rows = [withStockPageCall(snapshotRow, live), { ...snapshotRow, symbol: "AVGO" }, null];
    const at = comparePricedAt(rows);
    expect(at).toBe("2026-11-12T20:59:00+00:00");
    const afterClose = new Date("2026-11-12T21:40:00Z"); // 4:40 PM ET
    expect(closeWords(sessionDayOf(at)!, "Nov 12", afterClose)).toBe("today's close");
    expect(closeWords(sessionDayOf(at)!, "Nov 12", new Date("2026-11-12T20:00:00Z"))).toBe("today, during trading");
    // Only last night's rows: yesterday's close is the honest stamp.
    expect(closeWords(sessionDayOf(comparePricedAt([snapshotRow]))!, "Nov 11", afterClose)).toBe("yesterday's close");
    expect(comparePricedAt([null])).toBeNull();
  });
});
