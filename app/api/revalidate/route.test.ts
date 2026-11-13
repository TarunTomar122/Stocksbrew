import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePath = vi.fn();
const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath, revalidateTag }));

const { POST } = await import("./route");

const request = (body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest("https://www.stocksbrew.online/api/revalidate", {
    method: "POST",
    headers: { "content-type": "application/json", "x-revalidate-token": "secret", ...headers },
    body: JSON.stringify(body),
  });

describe("POST /api/revalidate", () => {
  beforeEach(() => {
    vi.stubEnv("REVALIDATE_TOKEN", "secret");
    vi.stubEnv("REVALIDATE_PEERS", "");
    vi.stubEnv("VARNISH_BAN_URL", "");
    (globalThis as { __tikrrRevalidateLast?: Map<string, number> }).__tikrrRevalidateLast = new Map();
    revalidatePath.mockReset();
    revalidateTag.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("needs the token", async () => {
    const response = await POST(request({}, { "x-revalidate-token": "wrong" }));
    expect(response.status).toBe(401);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refreshes the pages, their cached copies and the data tags of a kind, once per window", async () => {
    const response = await POST(request({ kinds: ["premarket"], symbols: ["NVDA"] }));
    expect(response.status).toBe(200);
    const paths = revalidatePath.mock.calls.map((call) => call[0]);
    expect(paths).toEqual(expect.arrayContaining(["/premarket", "/briefing", "/stock/NVDA"]));
    expect(revalidateTag.mock.calls.map((call) => call[0])).toEqual(expect.arrayContaining(["premarket-US", "premarket-opening"]));
    revalidatePath.mockReset();
    const again = await (await POST(request({ kinds: ["premarket"] }))).json();
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(again.ban).toBe("skipped");
    await POST(request({ kinds: ["premarket"], force: true }));
    expect(revalidatePath).toHaveBeenCalled();
  });

  it("refreshes a whole family through its dynamic route", async () => {
    await POST(request({ kinds: ["briefs"] }));
    expect(revalidatePath).toHaveBeenCalledWith("/(app)/anon/[v]/stock/[symbol]", "page");
  });

  it("refuses a body with nothing usable", async () => {
    const response = await POST(request({ paths: ["/api/secret"] }));
    expect(response.status).toBe(400);
  });

  it("fans out to every instance, then bans the cached HTML once", async () => {
    vi.stubEnv("REVALIDATE_PEERS", "http://localhost:3000, http://localhost:3001");
    vi.stubEnv("VARNISH_BAN_URL", "http://127.0.0.1:6081");
    const calls: Array<{ url: string; method?: string; headers: Record<string, string> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, method: init.method, headers: init.headers as Record<string, string> });
        if (init.method === "BAN") return new Response("banned", { status: 200 });
        return Response.json({ ok: true, revalidated: ["path:/news"], skipped: [] });
      }),
    );
    const payload = await (await POST(request({ kinds: ["news"] }))).json();
    expect(calls.filter((call) => call.method === "POST").map((call) => call.url)).toEqual([
      "http://localhost:3000/api/revalidate",
      "http://localhost:3001/api/revalidate",
    ]);
    for (const call of calls.filter((item) => item.method === "POST")) {
      expect(call.headers["x-revalidate-scope"]).toBe("local");
      expect(call.headers["x-revalidate-token"]).toBe("secret");
    }
    const ban = calls.find((call) => call.method === "BAN");
    expect(ban?.url).toBe("http://127.0.0.1:6081/");
    expect(new RegExp(ban!.headers["x-ban-url"]).test("/news?page=2")).toBe(true);
    expect(new RegExp(ban!.headers["x-ban-url"]).test("/portfolio")).toBe(false);
    expect(payload.ban).toBe("ok");
    // The peers did the work; this instance did not refresh itself separately.
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refreshes itself when no peer answers, and still bans", async () => {
    vi.stubEnv("REVALIDATE_PEERS", "http://localhost:3999");
    vi.stubEnv("VARNISH_BAN_URL", "http://127.0.0.1:6081");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        if (init.method === "BAN") return new Response("banned", { status: 200 });
        throw new Error("connect ECONNREFUSED");
      }),
    );
    const payload = await (await POST(request({ kinds: ["signals"] }))).json();
    expect(revalidatePath).toHaveBeenCalledWith("/signals");
    expect(payload.peers[0].ok).toBe(false);
    expect(payload.ban).toBe("ok");
  });

  it("does only its own share when called as a peer", async () => {
    vi.stubEnv("REVALIDATE_PEERS", "http://localhost:3000");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const payload = await (await POST(request({ kinds: ["signals"] }, { "x-revalidate-scope": "local" }))).json();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(payload.revalidated).toContain("path:/signals");
  });
});
