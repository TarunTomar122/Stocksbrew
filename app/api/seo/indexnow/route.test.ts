import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const submitted = vi.hoisted(() => ({ urls: [] as string[] }));

vi.mock("@/lib/seo/indexnow", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/seo/indexnow")>();
  return {
    ...actual,
    submitIndexNow: vi.fn(async (urls: string[]) => {
      submitted.urls = urls;
      return { ok: true, status: 202, submitted: urls.length };
    }),
  };
});

vi.mock("@/lib/seo/sitemap", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/seo/sitemap")>();
  return {
    ...actual,
    sitemapEntries: vi.fn(async (family: string) => {
      if (family === "stocks") {
        return [
          { path: "/stock/NVDA", lastmod: "2026-11-11" },
          { path: "/stock/KO", lastmod: "2026-11-09" },
          { path: "/stock/AAPL" },
        ];
      }
      throw new Error("coverage_unavailable");
    }),
  };
});

import { NextRequest } from "next/server";

import { POST } from "@/app/api/seo/indexnow/route";

function request(body: unknown, token = "secret") {
  return new NextRequest("https://www.stocksbrew.online/api/seo/indexnow", {
    method: "POST",
    headers: { "x-revalidate-token": token, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv("REVALIDATE_TOKEN", "secret");
  submitted.urls = [];
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/seo/indexnow with sitemap families", () => {
  it("refuses a request without the token", async () => {
    expect((await POST(request({ families: ["stocks"] }, "wrong"))).status).toBe(401);
  });

  it("submits the stock pages that changed on or after the cut-off, and nothing else", async () => {
    const response = await POST(request({ families: ["stocks"], changed_since: "2026-11-11", include_defaults: false }));
    const json = await response.json();
    expect(submitted.urls).toEqual(["/stock/NVDA"]);
    expect(json.families).toMatchObject({ names: ["stocks"], changed_since: "2026-11-11", urls: 1, errors: [] });
  });

  it("submits the whole family without a cut-off, ignores unknown families and reports one it could not read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const json = await (await POST(request({ families: ["stocks", "nope", "compare"], include_defaults: false }))).json();
    expect(submitted.urls).toEqual(["/stock/NVDA", "/stock/KO", "/stock/AAPL"]);
    expect(json.families.names).toEqual(["stocks", "compare"]);
    expect(json.families.errors).toEqual(["compare: coverage_unavailable"]);
  });

  it("says so when the only family asked for could not be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const json = await (await POST(request({ families: ["compare"], include_defaults: false }))).json();
    expect(json.ok).toBe(false);
    expect(json.indexnow).toMatchObject({ submitted: 0, error: "families_unreadable" });
  });

  it("sends nothing when no page changed since the cut-off", async () => {
    const json = await (await POST(request({ families: ["stocks"], changed_since: "2026-12-01", include_defaults: false }))).json();
    expect(json.ok).toBe(true);
    expect(json.indexnow.submitted).toBe(0);
    expect(submitted.urls).toEqual([]);
  });
});
