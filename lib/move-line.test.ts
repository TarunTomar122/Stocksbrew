import { describe, expect, it } from "vitest";

import { moveLine } from "@/lib/move-line";

type Item = Parameters<typeof moveLine>[0];

const move = (headline: string, extra: Partial<{ name: string; ticker: string; pct: number; why: string }> = {}) => ({
  ticker: extra.ticker ?? "LAC",
  name: extra.name ?? "Lithium Americas",
  day_change_pct: extra.pct ?? -12.3,
  move_explanation: { headline, why_it_matters: extra.why ?? "" },
}) as unknown as Item;

describe("moveLine", () => {
  it("ends every reason with one full stop", () => {
    const line = moveLine(move("Strong results lift CoreWeave", { name: "CoreWeave", ticker: "CRWV", pct: 24.9 }));
    expect(line.endsWith(".")).toBe(true);
    expect(line.endsWith("..")).toBe(false);
  });

  it("drops the headline capitals from common words but keeps names", () => {
    const line = moveLine(move("Lithium Americas fell after Thacker Pass Cost Increase"));
    expect(line).toContain("Thacker Pass");
    expect(line).not.toMatch(/Cost Increase/);
  });
});
