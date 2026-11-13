import { describe, expect, it } from "vitest";

import { ANALYST_LINE_WORDS, analystLine, moveLine } from "@/lib/move-line";

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

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

describe("analystLine", () => {
  it("keeps the upgrade and the price-target change within 15 words (AMD, Nov 12)", () => {
    const line = analystLine("William Blair upgraded AMD to Outperform, while Bank of America raised its 2027 price target and cited a strengthening Zen 6 roadmap.");
    expect(line).toBe("William Blair upgraded AMD to Outperform, while Bank of America raised its 2027 price target.");
    expect(words(line)).toBeLessThanOrEqual(ANALYST_LINE_WORDS);
  });

  it("works for any stock: drops the year before a target when that is what fits", () => {
    const line = analystLine("Morgan Stanley downgraded Lithium Americas to Underweight, and Jefferies Financial Group cut its 2026 price target on the miner, citing funding risk.");
    expect(line).toMatch(/^Morgan Stanley downgraded Lithium Americas to Underweight/);
    expect(line).toMatch(/Jefferies Financial Group cut its (?:2026 )?price target/);
    expect(line).not.toMatch(/citing|funding/);
    expect(words(line)).toBeLessThanOrEqual(ANALYST_LINE_WORDS);
  });

  it("keeps a list of firms together and leaves out what they cited", () => {
    const line = analystLine("Goldman Sachs, Morgan Stanley and UBS raised their price targets on Nvidia after the company reported record data-center revenue for the quarter.");
    expect(line).toBe("Goldman Sachs, Morgan Stanley and UBS raised their price targets.");
  });

  it("keeps a target's new level when it fits, and gives it up before an action", () => {
    expect(analystLine("Needham upgraded Rocket Lab to Buy from Hold, and Citi raised its price target on the stock to $82 from $60 after a record backlog.")).toBe(
      "Needham upgraded Rocket Lab to Buy from Hold, and Citi raised its price target.",
    );
    expect(analystLine("Citi raised its price target on Rocket Lab from $60 to $82 after a record backlog and three launches this quarter.")).toBe(
      "Citi raised its price target from $60 to $82.",
    );
  });

  it("never leaves a stray comma behind a level or a dropped citation", () => {
    expect(analystLine("Citi raised its price target to $82, and Needham upgraded the stock to Buy on hopes for a record launch year.")).toBe(
      "Citi raised its price target to $82, and Needham upgraded the stock to Buy.",
    );
    const cited = analystLine("Jefferies upgraded the stock to Buy, citing a stronger launch backlog and better margins in its space systems unit.");
    expect(cited).toBe("Jefferies upgraded the stock to Buy.");
    for (const line of [cited]) expect(line).not.toMatch(/,\.|,,/);
  });

  it("keeps the main reason when analysts come second, and a list of firms whole", () => {
    const results = "Nvidia rose after reporting record data-center revenue for the quarter, while several analysts raised their price targets after the call.";
    expect(analystLine(results)).toBe(results);
    const firms = "Goldman, Citi, UBS raised their price targets on Nvidia after the company reported record data-center revenue for the quarter.";
    expect(analystLine(firms)).toBe(firms);
    // A company's own target is not an analyst's.
    const own = "Walmart rose after raising its full-year sales target and beating estimates for the quarter on strong online grocery demand.";
    expect(analystLine(own)).toBe(own);
  });

  it("leaves short lines and reasons that are not about analysts alone", () => {
    expect(analystLine("Jefferies upgraded Zeta to Buy.")).toBe("Jefferies upgraded Zeta to Buy.");
    const other = "Corteva fell after its quarterly earnings missed expectations and the company cut its full-year outlook because seed demand weakened in Brazil.";
    expect(analystLine(other)).toBe(other);
  });

  it("is what moveLine shows for an analyst-driven move", () => {
    const line = moveLine(
      move("AMD Rallies After Upgrades and Potential Nvidia Fallout", {
        ticker: "AMD",
        name: "Advanced Micro Devices",
        pct: 5.9,
        why: "William Blair upgraded AMD to Outperform, while Bank of America raised its 2027 price target and cited a strengthening Zen 6 roadmap. Coverage also points to potential benefit from Nvidia-related disruption.",
      }),
    );
    expect(words(line)).toBeLessThanOrEqual(ANALYST_LINE_WORDS);
    expect(line).toMatch(/upgraded/);
  });
});
