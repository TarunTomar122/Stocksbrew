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
    vi.stubEnv("PORT", "");
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
    expect(paths).toEqual(expect.arrayContaining(["/premarket", "/stock/NVDA"]));
    // /briefing through its signed-out copy's route (lib/revalidate-targets.ts COPY_ROUTES), never its address.
    expect(revalidatePath).toHaveBeenCalledWith("/(app)/anon/[v]/briefing", "page");
    expect(paths).not.toContain("/briefing");
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

  it("builds the dropped /briefing copy again on its own port, signed out, before it answers", async () => {
    vi.stubEnv("PORT", "3001");
    const order: string[] = [];
    const gets: Array<{ url: string; headers: Record<string, string> }> = [];
    revalidatePath.mockImplementation((path: string) => order.push(`drop ${path}`));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        order.push(`get ${url}`);
        gets.push({ url, headers: init.headers as Record<string, string> });
        return new Response("<html></html>", { status: 200 });
      }),
    );
    const payload = await (await POST(request({ kinds: ["news"] }, { "x-revalidate-scope": "local" }))).json();
    expect(gets.map((get) => get.url)).toEqual(["http://localhost:3001/briefing"]);
    // As a signed-out visitor: no cookie, a page load.
    expect(gets[0]!.headers).toEqual({ accept: "text/html" });
    expect(order.indexOf("drop /(app)/anon/[v]/briefing")).toBeLessThan(order.indexOf("get http://localhost:3001/briefing"));
    expect(payload.warmed).toEqual(["/briefing"]);

    // Inside the window nothing was dropped, so nothing is built again.
    gets.length = 0;
    const again = await (await POST(request({ kinds: ["news"] }, { "x-revalidate-scope": "local" }))).json();
    expect(gets).toEqual([]);
    expect(again.warmed).toEqual([]);
  });

  it("answers even when the rebuild fails, and reports nothing built", async () => {
    vi.stubEnv("PORT", "3001");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("timeout");
      }),
    );
    const response = await POST(request({ kinds: ["briefs"] }, { "x-revalidate-scope": "local" }));
    expect(response.status).toBe(200);
    expect((await response.json()).warmed).toEqual([]);
    expect(revalidatePath).toHaveBeenCalledWith("/(app)/anon/[v]/briefing", "page");
  });

  it("lets the second instance rebuild a little later, so the two never write the shared copy together", async () => {
    vi.stubEnv("REVALIDATE_PEERS", "http://localhost:3000,http://localhost:3001");
    const at: Record<string, number> = {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        at[url] = Date.now();
        return new Response("<html></html>", { status: 200 });
      }),
    );
    vi.stubEnv("PORT", "3000");
    let started = Date.now();
    await POST(request({ kinds: ["news"] }, { "x-revalidate-scope": "local" }));
    expect(at["http://localhost:3000/briefing"]! - started).toBeLessThan(1_000);
    (globalThis as { __tikrrRevalidateLast?: Map<string, number> }).__tikrrRevalidateLast = new Map();
    vi.stubEnv("PORT", "3001");
    started = Date.now();
    const payload = await (await POST(request({ kinds: ["news"] }, { "x-revalidate-scope": "local" }))).json();
    expect(at["http://localhost:3001/briefing"]! - started).toBeGreaterThanOrEqual(1_150);
    expect(payload.warmed).toEqual(["/briefing"]);
  });

  it("still bans when a peer did not answer, even if this instance had nothing left to refresh", async () => {
    vi.stubEnv("REVALIDATE_PEERS", "http://localhost:3000,http://localhost:3001");
    vi.stubEnv("VARNISH_BAN_URL", "http://127.0.0.1:6081");
    // This instance refreshed /signals seconds ago (as one of the peers), so its own fallback skips it.
    (globalThis as { __tikrrRevalidateLast?: Map<string, number> }).__tikrrRevalidateLast = new Map([["path:/signals", Date.now()]]);
    const bans: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        if (init.method === "BAN") {
          bans.push((init.headers as Record<string, string>)["x-ban-url"]!);
          return new Response("banned", { status: 200 });
        }
        throw new Error("The operation was aborted due to timeout");
      }),
    );
    const payload = await (await POST(request({ kinds: ["signals"] }))).json();
    expect(payload.skipped).toContain("path:/signals");
    expect(payload.ban).toBe("ok");
    expect(bans).toHaveLength(1);
  });

  it("reports how many copies each peer built again", async () => {
    vi.stubEnv("REVALIDATE_PEERS", "http://localhost:3000");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ok: true, revalidated: ["route:/(app)/anon/[v]/briefing"], skipped: [], warmed: ["/briefing"] })),
    );
    const payload = await (await POST(request({ kinds: ["news"] }))).json();
    expect(payload.peers).toEqual([{ peer: "http://localhost:3000", ok: true, revalidated: 1, warmed: 1 }]);
  });

  it("does not build anything when it cannot tell its own port", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const payload = await (await POST(request({ kinds: ["news"] }, { "x-revalidate-scope": "local" }))).json();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(payload.warmed).toEqual([]);
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
