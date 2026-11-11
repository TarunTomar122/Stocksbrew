import { describe, expect, it } from "vitest";

import { MARKETING_LINKS, PLACES, isMarketingPath, placeFor, sectionFor, trailFor } from "@/components/oa/nav-items";

const place = (path: string) => placeFor(path)?.label ?? null;
const sectionOf = (path: string) => sectionFor(path)?.label ?? null;
const trail = (path: string) => trailFor(path)?.map((crumb) => crumb.label).join(" › ") ?? null;

describe("the five places", () => {
  it("are named for what you get there, with short names that fit a phone tab", () => {
    expect(PLACES.map((item) => item.label)).toEqual(["Today", "My stocks", "Research", "Follow investors", "Alerts & agents"]);
    expect(PLACES.map((item) => item.short)).toEqual(["Today", "My stocks", "Research", "Investors", "Alerts"]);
    for (const item of PLACES) expect(item.short.length).toBeLessThanOrEqual(9);
  });

  it("lists every app route under exactly one place", () => {
    const hrefs = PLACES.flatMap((item) => item.sections.map((sub) => sub.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const href of ["/briefing", "/explore", "/movers", "/signals", "/news", "/calendar", "/portfolio", "/watchlist", "/watchlist/tax", "/practice", "/screener", "/best", "/sectors", "/compare", "/markets", "/filings", "/ask", "/themes", "/strategies", "/backtest", "/follow", "/insiders", "/agents"]) {
      expect(hrefs).toContain(href);
    }
  });
});

describe("placeFor and sectionFor", () => {
  it("lights one place on every app page, deep pages included", () => {
    expect(place("/briefing")).toBe("Today");
    expect(place("/explore")).toBe("Today");
    expect(place("/movers")).toBe("Today");
    expect(place("/movers/2026-11-10")).toBe("Today");
    expect(place("/calendar/earnings/NVDA")).toBe("Today");
    expect(place("/watchlist/tax")).toBe("My stocks");
    expect(place("/portfolio")).toBe("My stocks");
    expect(place("/import")).toBe("My stocks");
    expect(place("/stock/NVDA")).toBe("Research");
    expect(place("/stock/NVDA/research")).toBe("Research");
    expect(place("/stock/NVDA/earnings/2026-11-19")).toBe("Research");
    expect(place("/sectors/technology")).toBe("Research");
    expect(place("/best/dividend-stocks")).toBe("Research");
    expect(place("/compare/amd-vs-nvda")).toBe("Research");
    expect(place("/markets/crypto/BTC")).toBe("Research");
    expect(place("/follow/berkshire-hathaway")).toBe("Follow investors");
    expect(place("/insiders/NVDA")).toBe("Follow investors");
    expect(place("/agents/jobs")).toBe("Alerts & agents");
  });

  it("lights nothing outside the app's places", () => {
    expect(place("/")).toBeNull();
    expect(place("/pricing")).toBeNull();
    expect(place("/docs/getting-started")).toBeNull();
    expect(place("/profile")).toBeNull();
  });

  it("picks the longest matching section", () => {
    expect(sectionOf("/watchlist")).toBe("Portfolio");
    expect(sectionOf("/watchlist/tax")).toBe("Taxes");
    expect(sectionOf("/movers/2026-11-10")).toBe("Why stocks moved");
    expect(sectionOf("/sectors/technology")).toBe("Sectors");
    expect(sectionOf("/best/dividend-stocks")).toBe("Best stock lists");
    expect(sectionOf("/stock/NVDA")).toBeNull();
  });

  it("opens My stocks on its overview and lights each tool by the longest prefix", () => {
    expect(PLACES.find((item) => item.label === "My stocks")!.href).toBe("/portfolio");
    expect(sectionOf("/portfolio")).toBe("Overview");
    expect(sectionOf("/portfolio/analyze")).toBe("Overview");
    expect(sectionOf("/portfolio/memo")).toBe("Weekly memo");
    expect(sectionOf("/portfolio/xray")).toBe("What you own");
    expect(sectionOf("/portfolio/earnings")).toBe("Earnings season");
    expect(sectionOf("/portfolio/goal")).toBe("Goal planner");
    expect(sectionOf("/portfolio/ideas")).toBe("Rebalancing ideas");
    expect(sectionOf("/watchlist/portfolio")).toBe("Portfolio");
    expect(sectionOf("/import")).toBe("Portfolio");
    expect(sectionOf("/practice")).toBe("Practice account");
  });

  it("groups the My stocks tools the way you use them: your stocks, plan ahead, act", () => {
    const sections = PLACES.find((item) => item.label === "My stocks")!.sections;
    expect(sections.map((item) => [item.label, item.group ?? null])).toEqual([
      ["Overview", null],
      ["Portfolio", "Your stocks"],
      ["Weekly memo", "Your stocks"],
      ["What you own", "Your stocks"],
      ["Earnings season", "Plan ahead"],
      ["Dividends", "Plan ahead"],
      ["Goal planner", "Plan ahead"],
      ["Stress test", "Plan ahead"],
      ["Rebalancing ideas", "Act"],
      ["Taxes", "Act"],
      ["Practice account", "Act"],
    ]);
    // A group is one run: no heading comes back after another group has started.
    const runs = sections.map((item) => item.group ?? null).filter((group, index, all) => group !== all[index - 1]);
    expect(new Set(runs).size).toBe(runs.length);
  });

  it("does not light a place on a path that only shares its first letters", () => {
    expect(place("/newsletter")).toBeNull();
    expect(place("/stockholm")).toBeNull();
  });
});

describe("trailFor", () => {
  it("is empty on a place's or a section's own page", () => {
    expect(trailFor("/briefing")).toEqual([]);
    expect(trailFor("/movers")).toEqual([]);
    expect(trailFor("/screener")).toEqual([]);
    expect(trailFor("/sectors")).toEqual([]);
    expect(trailFor("/insiders/")).toEqual([]);
    expect(trailFor("/portfolio")).toEqual([]);
    expect(trailFor("/portfolio/memo")).toEqual([]);
    expect(trailFor("/watchlist")).toEqual([]);
  });

  it("says the way back the same way on every deep page", () => {
    expect(trail("/stock/NVDA")).toBe("Research");
    expect(trail("/stock/nvda/moves/2026-11-10")).toBe("Research › NVDA");
    expect(trail("/stock/NVDA/earnings/2026-11-19")).toBe("Research › NVDA › Earnings");
    expect(trail("/stock/NVDA/research/abc")).toBe("Research › NVDA › Long research report");
    expect(trail("/sectors/technology")).toBe("Research › Sectors");
    expect(trail("/compare/amd-vs-nvda")).toBe("Research › Compare");
    expect(trail("/markets/crypto/BTC")).toBe("Research › Markets › Crypto");
    expect(trail("/movers/2026-11-10")).toBe("Today › Why stocks moved");
    expect(trail("/calendar/earnings/NVDA")).toBe("Today › Calendar");
    expect(trail("/follow/berkshire-hathaway")).toBe("Follow investors");
    expect(trail("/insiders/NVDA")).toBe("Follow investors › Insiders");
    expect(trail("/themes/ai-power")).toBe("Research › Themes");
    expect(trail("/import")).toBe("My stocks › Portfolio");
    expect(trail("/portfolio/analyze")).toBe("My stocks");
  });

  it("links each step to its page", () => {
    expect(trailFor("/stock/NVDA/earnings/2026-11-19")).toEqual([
      { label: "Research", href: "/screener" },
      { label: "NVDA", href: "/stock/NVDA" },
      { label: "Earnings", href: "/calendar/earnings/NVDA" },
    ]);
  });

  it("is null outside the places, so the page's own line shows", () => {
    expect(trailFor("/docs/basics")).toBeNull();
    expect(trailFor("/not-a-page")).toBeNull();
  });
});

describe("marketing chrome", () => {
  it("uses the marketing bar on the landing and reading pages only", () => {
    expect(isMarketingPath("/")).toBe(true);
    expect(isMarketingPath("/pricing")).toBe(true);
    expect(isMarketingPath("/docs/basics")).toBe(true);
    expect(isMarketingPath("/briefing")).toBe(false);
  });

  it("links the five places by their short names, then pricing and docs", () => {
    expect(MARKETING_LINKS.map((item) => item.label)).toEqual(["Today", "My stocks", "Research", "Investors", "Alerts", "Pricing", "Docs"]);
    expect(MARKETING_LINKS.find((item) => item.label === "My stocks")!.href).toBe("/portfolio");
  });
});
