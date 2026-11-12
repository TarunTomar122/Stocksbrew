import { describe, expect, it } from "vitest";

import { moverLabel, nextMovesLine } from "@/components/markets/market-cards";
import type { MarketAsset } from "@/lib/markets-shared";

/** Only the fields the two helpers read; the rest of a MarketAsset does not matter here. */
function asset(overrides: Partial<MarketAsset> & Pick<MarketAsset, "id" | "class" | "name">): MarketAsset {
  return { symbol: overrides.id.toUpperCase(), change_mode: "pct", change: { d1: null }, ...overrides } as unknown as MarketAsset;
}

describe("the biggest move card", () => {
  it("says what a coin, a commodity or a fund is", () => {
    expect(moverLabel(asset({ id: "doge", class: "crypto", name: "Dogecoin" }))).toBe("Dogecoin, a crypto coin");
    expect(moverLabel(asset({ id: "natgas", class: "commodity", name: "Natural gas" }))).toBe("Natural gas, a commodity");
    expect(moverLabel(asset({ id: "xlk", class: "etf", name: "Technology Select Sector SPDR" }))).toBe("Tech fund, XLK");
    expect(moverLabel(asset({ id: "sp500", class: "index", name: "S&P 500" }))).toBe("S&P 500");
  });

  it("names the next two moves in one line, and none without them", () => {
    const btc = asset({ id: "btc", class: "crypto", name: "Bitcoin", change: { d1: -1.52 } as MarketAsset["change"] });
    const xlk = asset({ id: "xlk", class: "etf", name: "Tech fund", change: { d1: -1.08 } as MarketAsset["change"] });
    const flat = asset({ id: "eth", class: "crypto", name: "Ether", change: { d1: null } as MarketAsset["change"] });
    expect(nextMovesLine([btc, xlk])).toBe("Bitcoin −1.5% and Tech −1.1% were next.");
    expect(nextMovesLine([flat, btc])).toBe("Bitcoin −1.5% was next.");
    expect(nextMovesLine([])).toBeNull();
  });
});
