import { describe, expect, it } from "vitest";

import { unTitle } from "./card-words";

describe("unTitle", () => {
  it("puts a Title Case headline in sentence case and keeps names", () => {
    const text = unTitle("TSM Stock Jumps After Board Approves $1B Investment In Anthropic And OpenAI");
    expect(text).toMatch(/^TSM stock jumps after /);
    expect(text).toContain("in Anthropic and OpenAI");
  });
  it("lowers only the last word of a leftover run", () => {
    expect(unTitle("Take-Two rose after GTA VI Preorders.", "Take-Two Interactive")).toBe("Take-Two rose after GTA VI preorders.");
    expect(unTitle("Acadia rose after revenue that beat expectations.")).toBe("Acadia rose after revenue that beat expectations.");
  });
});

describe("unTitle on half-Title-Case headlines (round 6)", () => {
  it("lowers stray capitals but keeps names, tickers and the company's own name", () => {
    expect(unTitle("Nvidia's Board is reportedly planning to Oust Jensen Huang over Chinese spy, Employee Misconduct investigation", "NVIDIA")).toBe(
      "Nvidia's board is reportedly planning to oust Jensen Huang over Chinese spy, employee misconduct investigation",
    );
    expect(unTitle("QQQ Holders Feel it even If they Never trade", "Invesco QQQ Trust")).toBe("QQQ holders feel it even if they never trade");
    expect(unTitle("Caterpillar (CAT) stock looks Like a Bargain on its 222% run", "Caterpillar")).toBe("Caterpillar (CAT) stock looks like a bargain on its 222% run");
  });
  it("reads the same headlines from their scraped Title Case", () => {
    expect(unTitle("Nvidia’s Board Is Reportedly Planning To Oust Jensen Huang Over Chinese Spy, Employee Misconduct Investigation", "NVIDIA")).toBe(
      "Nvidia’s board is reportedly planning to oust Jensen Huang over Chinese spy, employee misconduct investigation",
    );
    expect(unTitle("Every December the Nasdaq-100 Reshuffles. QQQ Holders Feel It Even If They Never Trade", "Invesco QQQ Trust")).toBe(
      "Every December the Nasdaq-100 reshuffles. QQQ holders feel it even if they never trade",
    );
    expect(unTitle("Caterpillar (CAT) Stock Looks Like A Bargain On Its 222% Run", "Caterpillar")).toBe("Caterpillar (CAT) stock looks like a bargain on its 222% run");
  });
  it("leaves brands and the other companies on the page alone", () => {
    expect(unTitle("Sales at Target rose while Best Buy fell", "Costco")).toBe("Sales at Target rose while Best Buy fell");
    // Ship 39's Worth knowing card on AMD, and NVDA's.
    expect(unTitle("Nvidia Stock Sinks As Jensen Huang Ouster Report Sends Investors Toward AMD, Broadcom", "Advanced Micro Devices", ["NVIDIA"])).toBe(
      "Nvidia stock sinks as Jensen Huang ouster report sends investors toward AMD, Broadcom",
    );
    expect(unTitle("Cramer's Stance On Nvidia's Stock Amid Reports That CEO Jensen Huang May Be Ousted", "NVIDIA")).toBe(
      "Cramer's stance on Nvidia's stock amid reports that CEO Jensen Huang may be ousted",
    );
    expect(unTitle("Shares of The Trade Desk fell after Five Below beat", "Costco")).toBe("Shares of The Trade Desk fell after Five Below beat");
    expect(unTitle("AMD gains as Advanced Micro Devices wins Board approval", "Nvidia", ["Advanced Micro Devices"])).toBe("AMD gains as Advanced Micro Devices wins board approval");
  });
});

describe("unTitle names", () => {
  it("keeps a person's surname capitalised", async () => {
    const { unTitle } = await import("./card-words");
    expect(unTitle("Nvidia Sells Off After Jensen Huang Affair")).not.toMatch(/Jensen huang/);
  });
});

describe("scraped headline casing on a Worth knowing card", () => {
  it("reads the AMD story as a plain sentence (judges, ship 47)", () => {
    expect(unTitle("Nvidia Turmoil lifts AMD, Broadcom on bets for business gains", "Advanced Micro Devices, Inc.", ["NVIDIA Corporation"])).toBe(
      "Nvidia turmoil lifts AMD, Broadcom on bets for business gains",
    );
  });
});
