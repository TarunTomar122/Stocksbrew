import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { EDGE_CACHE_HEADER, edgeCacheHeaderFor, edgeCachePolicy, isRouterRequest } from "@/lib/edge-cache-policy";
import { middleware } from "@/middleware";

const anon = { method: "GET", hasSessionCookie: false, isRouterRequest: false };

describe("edgeCachePolicy", () => {
  it("lists the public pages", () => {
    for (const path of [
      "/",
      "/briefing",
      "/explore",
      "/news",
      "/signals",
      "/calendar",
      "/calendar/earnings/NVDA",
      "/sectors",
      "/sectors/technology",
      "/screener",
      "/markets",
      "/markets/etfs",
      "/themes/ai-capex",
      "/stock/NVDA",
      "/stock/BRK.B",
      "/stock/NVDA/earnings",
      "/agent",
      "/portfolio",
      "/pricing",
      "/blog/how-to-analyze-earnings-report",
      "/docs/follow/what-a-13f-is",
    ]) {
      expect(edgeCachePolicy(path), path).not.toBeNull();
    }
  });

  it("never lists a signed-in or per-person page", () => {
    for (const path of [
      "/portfolio/taxes",
      "/portfolio/xray",
      "/portfolio/memo",
      "/inbox",
      "/agents",
      "/profile",
      "/ask",
      "/import",
      "/admin/analytics",
      "/s/abc123",
      "/baskets/new",
      "/anon/1/stock/NVDA",
      "/api/revalidate",
      "/stock/NVDA/../../profile",
      // Redirects to Market today from the 9:30 open: a cached 200 would outlive the switch.
      "/premarket",
      "/stock/NVDA/anything-else",
    ]) {
      expect(edgeCachePolicy(path), path).toBeNull();
    }
  });

  it("is only given to cookieless page loads", () => {
    expect(edgeCacheHeaderFor({ ...anon, pathname: "/news" })).toBe(
      "max-age=300, stale-while-revalidate=900, stale-if-error=86400",
    );
    expect(edgeCacheHeaderFor({ ...anon, method: "HEAD", pathname: "/news" })).not.toBeNull();
    expect(edgeCacheHeaderFor({ ...anon, hasSessionCookie: true, pathname: "/news" })).toBeNull();
    expect(edgeCacheHeaderFor({ ...anon, isRouterRequest: true, pathname: "/news" })).toBeNull();
    expect(edgeCacheHeaderFor({ ...anon, method: "POST", pathname: "/news" })).toBeNull();
    // Country-dependent pages are only kept when no country is known.
    expect(edgeCacheHeaderFor({ ...anon, pathname: "/", country: "IN" })).toBeNull();
    expect(edgeCacheHeaderFor({ ...anon, pathname: "/pricing", country: "US" })).toBeNull();
    expect(edgeCacheHeaderFor({ ...anon, pathname: "/news", country: "IN" })).not.toBeNull();
    // A URL carrying someone's checkout or sign-in data is never kept, whatever the page.
    expect(edgeCacheHeaderFor({ ...anon, pathname: "/pricing", searchParams: new URLSearchParams("success=1&subscription_id=sub_1") })).toBeNull();
    expect(edgeCacheHeaderFor({ ...anon, pathname: "/", searchParams: new URLSearchParams("token=abc") })).toBeNull();
    expect(edgeCacheHeaderFor({ ...anon, pathname: "/blog", searchParams: new URLSearchParams("Email=a%40b.c") })).toBeNull();
    expect(edgeCacheHeaderFor({ ...anon, pathname: "/news", searchParams: new URLSearchParams("tone=positive") })).not.toBeNull();
  });

  it("recognises client-router requests", () => {
    expect(isRouterRequest(new Headers({ RSC: "1" }), new URLSearchParams())).toBe(true);
    expect(isRouterRequest(new Headers({ "Next-Router-Prefetch": "1" }), new URLSearchParams())).toBe(true);
    expect(isRouterRequest(new Headers(), new URLSearchParams("_rsc=abc"))).toBe(true);
    expect(isRouterRequest(new Headers({ Accept: "text/html" }), new URLSearchParams("utm_source=x"))).toBe(false);
  });
});

describe("middleware edge-cache header", () => {
  const run = (path: string, init: { method?: string; headers?: Record<string, string> } = {}) =>
    middleware(
      new NextRequest(new URL(path, "https://www.stocksbrew.online"), {
        method: init.method || "GET",
        headers: { accept: "text/html", ...init.headers },
      }),
    );

  it("marks a signed-out public page, plain or rewritten to its cached copy", () => {
    expect(run("/news").headers.get(EDGE_CACHE_HEADER)).toContain("max-age=300");
    const stock = run("/stock/NVDA");
    expect(stock.headers.get("x-middleware-rewrite")).toContain("/anon/1/stock/NVDA");
    expect(stock.headers.get(EDGE_CACHE_HEADER)).toContain("max-age=300");
  });

  it("never marks a request with a session cookie, even an empty one", () => {
    for (const cookie of ["tikrr_session=abc", "tikrr_session=", "_ga=1; tikrr_session=abc"]) {
      expect(run("/news", { headers: { cookie } }).headers.get(EDGE_CACHE_HEADER), cookie).toBeNull();
      expect(run("/stock/NVDA", { headers: { cookie } }).headers.get(EDGE_CACHE_HEADER), cookie).toBeNull();
    }
  });

  it("never marks router payloads or private pages", () => {
    expect(run("/news", { headers: { rsc: "1" } }).headers.get(EDGE_CACHE_HEADER)).toBeNull();
    expect(run("/portfolio/taxes").headers.get(EDGE_CACHE_HEADER)).toBeNull();
    expect(run("/inbox").headers.get(EDGE_CACHE_HEADER)).toBeNull();
  });
});
