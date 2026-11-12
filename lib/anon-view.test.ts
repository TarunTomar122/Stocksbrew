import { describe, expect, it } from "vitest";

import { ANON_PREFIX, anonViewPath, isAnonViewPath, publicPathname } from "@/lib/anon-view";
import { FILTER_PARAMS } from "@/lib/portfolio-filters";

const view = (url: string, country: string | null = null) => {
  const parsed = new URL(url, "https://www.stocksbrew.online");
  return anonViewPath({ pathname: parsed.pathname, searchParams: parsed.searchParams, country });
};

describe("anonViewPath", () => {
  it("sends the cached pages to their copies", () => {
    expect(view("/stock/NVDA")).toBe(`${ANON_PREFIX}/stock/NVDA`);
    expect(view("/stock/BRK.B")).toBe(`${ANON_PREFIX}/stock/BRK.B`);
    expect(view("/briefing")).toBe(`${ANON_PREFIX}/briefing`);
    expect(view("/explore")).toBe(`${ANON_PREFIX}/explore`);
    expect(view("/portfolio")).toBe(`${ANON_PREFIX}/portfolio`);
    // The other tabs, the reasons sheet and the list filters are live pages.
    expect(view("/portfolio?tab=watching")).toBeNull();
    expect(view("/portfolio?sector=technology")).toBeNull();
    // Every filter key, so a new filter cannot be served the unfiltered cached copy (lib/portfolio-filters.ts).
    for (const key of FILTER_PARAMS) expect(view(`/portfolio?${key}=1`)).toBeNull();
    expect(view("/portfolio?reasons=1")).toBeNull();
    expect(view("/")).toBe(ANON_PREFIX);
  });

  it("ignores query keys the pages never read", () => {
    expect(view("/stock/NVDA?utm_source=x&_rsc=abc")).toBe(`${ANON_PREFIX}/stock/NVDA`);
    expect(view("/briefing?utm_source=x")).toBe(`${ANON_PREFIX}/briefing`);
    expect(view("/explore?gclid=1&ref=x")).toBe(`${ANON_PREFIX}/explore`);
    expect(view("/?home=1")).toBe(ANON_PREFIX);
  });

  it("leaves query-driven views to the live page", () => {
    expect(view("/briefing?day=2026-11-10")).toBeNull();
    expect(view("/screener")).toBeNull();
    expect(view("/screener?preset=value")).toBeNull();
  });

  it("leaves country-dependent pages to the live page for India", () => {
    expect(view("/", "IN")).toBeNull();
    expect(view("/", "in")).toBeNull();
    expect(view("/stock/NVDA", "IN")).toBe(`${ANON_PREFIX}/stock/NVDA`);
    expect(view("/", "US")).toBe(ANON_PREFIX);
  });

  it("does not touch other pages", () => {
    expect(view("/stock/NVDA/earnings")).toBeNull();
    expect(view("/stock/NVDA/research")).toBeNull();
    expect(view("/stock")).toBeNull();
    expect(view("/watchlist")).toBeNull();
    expect(view("/briefing/extra")).toBeNull();
    expect(view("/portfolio/memo")).toBeNull();
    expect(view("/portfolio/xray")).toBeNull();
    expect(view("/pricing")).toBeNull();
  });

  it("caches stock pages only at their canonical, ticker-shaped address", () => {
    expect(view("/stock/nvda")).toBeNull();
    expect(view("/stock/Nvda")).toBeNull();
    expect(view("/stock/NVDA.json")).toBeNull();
    expect(view("/stock/%3Cscript%3E")).toBeNull();
    expect(view("/stock/ABCDEFGHIJKLMNOPQ")).toBeNull();
    expect(view("/stock/.NVDA")).toBeNull();
    expect(view("/stock/BRK-B")).toBe(`${ANON_PREFIX}/stock/BRK-B`);
    expect(view("/stock/ABCDEFGHIJKLMNOP")).toBe(`${ANON_PREFIX}/stock/ABCDEFGHIJKLMNOP`);
  });
});

describe("publicPathname", () => {
  it("maps a copy back to the page it stands for", () => {
    expect(publicPathname(`${ANON_PREFIX}/stock/NVDA`)).toBe("/stock/NVDA");
    expect(publicPathname(`${ANON_PREFIX}/briefing`)).toBe("/briefing");
    expect(publicPathname(ANON_PREFIX)).toBe("/");
    expect(publicPathname("/anon")).toBe("/");
    expect(publicPathname("/anon/9/explore")).toBe("/explore");
  });

  it("leaves real paths alone", () => {
    expect(publicPathname("/stock/NVDA")).toBe("/stock/NVDA");
    expect(publicPathname("/")).toBe("/");
    expect(publicPathname("/anonymous")).toBe("/anonymous");
  });

  it("round-trips every cached page", () => {
    for (const path of ["/", "/stock/KO", "/briefing", "/explore", "/portfolio"]) {
      const copy = view(path);
      expect(copy && isAnonViewPath(copy)).toBe(true);
      expect(publicPathname(copy as string)).toBe(path);
    }
  });
});
