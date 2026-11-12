import { describe, expect, it } from "vitest";

import { withoutDeepItems } from "./deep";
import type { Memo, MemoItem } from "./types";

const item = (id: string, kind: MemoItem["kind"]) => ({ id, kind, text: `${id}.`, href: "/portfolio/memo", linkLabel: "Memo", tone: "flat" }) as MemoItem;

describe("withoutDeepItems", () => {
  it("takes out the look-through and crash items and keeps the rest", () => {
    const memo = {
      changed: [item("call:AAPL", "call")],
      hurt: [item("concentration:NVDA", "concentration"), item("sector:Technology", "sector"), item("stress", "stress"), item("report:COST", "upcoming_risk")],
      look: [item("hidden:MSFT", "concentration"), item("dividend:KO", "dividend")],
    } as unknown as Memo;
    const out = withoutDeepItems(memo);
    expect([...out.changed, ...out.hurt, ...out.look].map((row) => row.id)).toEqual(["call:AAPL", "report:COST", "dividend:KO"]);
    expect(memo.hurt).toHaveLength(4);
  });
});
