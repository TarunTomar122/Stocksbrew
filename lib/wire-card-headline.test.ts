import { describe, expect, it } from "vitest";

import { cardHeadline } from "@/lib/wire-read";

describe("cardHeadline", () => {
  it("takes the newest headline of at most 15 words", () => {
    const items = [
      { id: "a", title: "Stock market today, Nov. 11: Intel climbs on broader chip rally as AI infrastructure demand lifts semiconductor stocks" },
      { id: "b", title: "The chipmaker's CEO bought around $9.7 million of its stock in early November" },
    ];
    expect(cardHeadline(items)?.id).toBe("b");
  });

  it("falls back to the shortest when every headline runs long, and to nothing without one", () => {
    const long = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen";
    expect(cardHeadline([{ id: "a", title: `${long} seventeen eighteen` }, { id: "b", title: long }])?.id).toBe("b");
    expect(cardHeadline([])).toBeNull();
  });
});
