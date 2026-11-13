import { describe, expect, it } from "vitest";

import { copyRouteOf, nextTargets, planRevalidation, REVALIDATE_KINDS, safePagePath, varnishBanPattern } from "@/lib/revalidate-targets";

const matches = (pattern: string | null, url: string) => Boolean(pattern && new RegExp(pattern).test(url));

describe("planRevalidation", () => {
  it("defaults to the home page, as the old route did", () => {
    expect(planRevalidation({})).toEqual({ pages: ["/"], families: [], tags: [] });
  });

  it("expands kinds, tickers and paths, and drops what is unsafe", () => {
    const plan = planRevalidation({
      kinds: ["news", "nonsense"],
      symbols: ["nvda", "BRK.B", "../etc", "<script>"],
      paths: ["/signals", "/api/revalidate", "/anon/1/stock/NVDA", "/a/../b", "https://evil.example/", "/x y"],
    });
    expect(plan).toEqual({ pages: ["/briefing", "/news", "/signals", "/stock/BRK.B", "/stock/NVDA"], families: [], tags: ["news-feed"] });
  });

  it("folds tickers into a family refreshed whole", () => {
    const plan = planRevalidation({ kinds: ["prices"], symbols: ["NVDA"] });
    expect(plan?.families).toContain("stock");
    expect(plan?.pages).not.toContain("/stock/NVDA");
    expect(plan?.tags).toEqual(["daily-series", "extended-quotes", "markets", "results"]);
  });

  it("drops the per-stock reads a signed-in briefing makes with the writes that change them", () => {
    // /briefing is refreshed through its signed-out copy (COPY_ROUTES), so these are what keep a signed-in view fresh.
    expect(planRevalidation({ kinds: ["news"] })?.tags).toEqual(["news-feed"]);
    expect(planRevalidation({ kinds: ["prices"] })?.tags).toEqual(expect.arrayContaining(["daily-series", "extended-quotes", "results"]));
    expect(planRevalidation({ kinds: ["earnings"] })?.tags).toEqual(["earnings-dates", "results"]);
    expect(planRevalidation({ kinds: ["calendar"] })?.tags).toEqual(["earnings-dates"]);
  });

  it("refuses a request with nothing usable", () => {
    expect(planRevalidation({ kinds: ["nope"] })).toBeNull();
    expect(planRevalidation({ paths: ["/api/x"] })).toBeNull();
  });

  it("has a page for every kind", () => {
    for (const [kind, targets] of Object.entries(REVALIDATE_KINDS)) {
      expect(targets.pages.length, kind).toBeGreaterThan(0);
      for (const page of targets.pages) expect(safePagePath(page), `${kind} ${page}`).toBe(page);
    }
  });
});

describe("nextTargets", () => {
  it("refreshes public addresses (the cached copies carry their tag), family routes and the legacy tags", () => {
    const targets = nextTargets({ pages: ["/", "/briefing", "/stock/NVDA", "/premarket", "/news"], families: ["stock"], tags: ["markets"] });
    expect(targets.paths).toEqual(["/", "/stock/NVDA", "/premarket", "/news"]);
    // As Next tags the copies: the page file's path, route group included.
    expect(targets.routes).toEqual(["/(app)/anon/[v]/briefing", "/(app)/anon/[v]/stock/[symbol]"]);
    expect(targets.tags).toEqual(expect.arrayContaining(["markets", "premarket-US", "premarket-opening"]));
  });

  it("refreshes /briefing through its signed-out copy's route, never its address, and asks for it to be built again", () => {
    // The address tag would make every data cache a signed-in /briefing render reads count as missing.
    for (const kind of ["prices", "briefs", "news", "premarket"]) {
      const plan = planRevalidation({ kinds: [kind] })!;
      expect(plan.pages).toContain("/briefing");
      const targets = nextTargets(plan);
      expect(targets.paths, kind).not.toContain("/briefing");
      expect(targets.routes, kind).toContain("/(app)/anon/[v]/briefing");
      expect(targets.warm, kind).toEqual(["/briefing"]);
    }
    expect(nextTargets({ pages: ["/news"], families: [], tags: [] }).warm).toEqual([]);
    expect(copyRouteOf("/briefing")).toBe("/(app)/anon/[v]/briefing");
    expect(copyRouteOf("/news")).toBeNull();
    expect(copyRouteOf("constructor")).toBeNull();
  });

  it("still bans the public /briefing address in Varnish", () => {
    const pattern = varnishBanPattern(planRevalidation({ kinds: ["news"] })!);
    expect(matches(pattern, "/briefing")).toBe(true);
    expect(matches(pattern, "/briefing?day=2026-11-12")).toBe(true);
  });
});

describe("varnishBanPattern", () => {
  it("matches exactly the plan's pages, with or without a query", () => {
    const pattern = varnishBanPattern({ pages: ["/", "/news", "/stock/BRK.B"], families: [], tags: [] });
    expect(pattern).not.toMatch(/[\s"\\]/);
    for (const url of ["/", "/?utm_source=x", "/news", "/news?page=2", "/stock/BRK.B"]) expect(matches(pattern, url), url).toBe(true);
    for (const url of ["/newsletter", "/stock/BRKXB", "/stock/BRK.B/earnings", "/briefing", "/x/news"]) expect(matches(pattern, url), url).toBe(false);
  });

  it("matches a whole family by prefix", () => {
    const pattern = varnishBanPattern({ pages: ["/explore"], families: ["stock", "markets"], tags: [] });
    for (const url of ["/stock/NVDA", "/stock/NVDA/earnings", "/markets", "/markets/etfs?x=1", "/explore"]) expect(matches(pattern, url), url).toBe(true);
    for (const url of ["/stocks", "/marketsx", "/news", "/_next/static/chunk.js"]) expect(matches(pattern, url), url).toBe(false);
  });

  it("is null for a tags-only plan", () => {
    expect(varnishBanPattern({ pages: [], families: [], tags: ["markets"] })).toBeNull();
  });
});
