import { NextRequest } from "next/server";

import { ADMIN_COOKIE, adminConfigured, loginKey, passwordMatches, signAdminCookie, verifyAdminCookie } from "@/lib/analytics/admin-auth";

const ENV = { ANALYTICS_PASSWORD: "correct horse battery staple", LOCALDB_API_TOKEN: "server-token" };
const NOW = Date.parse("2026-11-13T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

describe("password and cookie", () => {
  it("is not configured without a password", () => {
    expect(adminConfigured({})).toBe(false);
    expect(adminConfigured({ ANALYTICS_PASSWORD: "" })).toBe(false);
    expect(passwordMatches("anything", {})).toBe(false);
    expect(signAdminCookie(NOW, {})).toBeNull();
    expect(verifyAdminCookie("v1.1.x", NOW, {})).toBe(false);
  });

  it("counts login tries by IPv4 address and by IPv6 /64", () => {
    expect(loginKey("203.0.113.7")).toBe("203.0.113.7");
    expect(loginKey("2001:db8:1:2::a")).toBe(loginKey("2001:db8:1:2:ffff:1:2:3"));
    expect(loginKey("2001:db8:1:2::a")).not.toBe(loginKey("2001:db8:1:3::a"));
    expect(loginKey("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(loginKey("unknown")).toBe("unknown");
  });

  it("needs at least 4 characters, not counting spaces around them", () => {
    expect(adminConfigured({ ANALYTICS_PASSWORD: "abc" })).toBe(false);
    expect(adminConfigured({ ANALYTICS_PASSWORD: "  ab  " })).toBe(false);
    expect(adminConfigured({ ANALYTICS_PASSWORD: "abcd" })).toBe(true);
    expect(passwordMatches("abc", { ANALYTICS_PASSWORD: "abc" })).toBe(false);
  });

  it("matches only the exact password", () => {
    expect(passwordMatches("correct horse battery staple", ENV)).toBe(true);
    expect(passwordMatches("correct horse battery stapl", ENV)).toBe(false);
    expect(passwordMatches("Correct horse battery staple", ENV)).toBe(false);
    expect(passwordMatches("", ENV)).toBe(false);
    expect(passwordMatches(null, ENV)).toBe(false);
    expect(passwordMatches(["correct horse battery staple"], ENV)).toBe(false);
  });

  it("accepts its own cookie for 30 days and no longer", () => {
    const cookie = signAdminCookie(NOW, ENV)!;
    expect(verifyAdminCookie(cookie, NOW, ENV)).toBe(true);
    expect(verifyAdminCookie(cookie, NOW + 29 * DAY, ENV)).toBe(true);
    expect(verifyAdminCookie(cookie, NOW + 31 * DAY, ENV)).toBe(false);
  });

  it("refuses a tampered cookie", () => {
    const cookie = signAdminCookie(NOW, ENV)!;
    const [v, expires, mac] = cookie.split(".");
    const later = `${v}.${Number(expires) + 365 * DAY}.${mac}`;
    expect(verifyAdminCookie(later, NOW, ENV)).toBe(false);
    const flipped = `${v}.${expires}.${mac!.slice(0, -1)}${mac!.endsWith("A") ? "B" : "A"}`;
    expect(verifyAdminCookie(flipped, NOW, ENV)).toBe(false);
    expect(verifyAdminCookie(`${v}.${expires}.`, NOW, ENV)).toBe(false);
    expect(verifyAdminCookie("v1.99999999999999.abc", NOW, ENV)).toBe(false);
    expect(verifyAdminCookie("garbage", NOW, ENV)).toBe(false);
    expect(verifyAdminCookie("", NOW, ENV)).toBe(false);
  });

  it("refuses a cookie signed with another password or secret, so a password change signs everyone out", () => {
    const cookie = signAdminCookie(NOW, ENV)!;
    expect(verifyAdminCookie(cookie, NOW, { ...ENV, ANALYTICS_PASSWORD: "new password" })).toBe(false);
    expect(verifyAdminCookie(cookie, NOW, { ...ENV, LOCALDB_API_TOKEN: "other" })).toBe(false);
    const withSecret = signAdminCookie(NOW, { ...ENV, ANALYTICS_SECRET: "s1" })!;
    expect(verifyAdminCookie(withSecret, NOW, { ...ENV, ANALYTICS_SECRET: "s1" })).toBe(true);
    expect(verifyAdminCookie(withSecret, NOW, { ...ENV, ANALYTICS_SECRET: "s2" })).toBe(false);
  });
});

describe("the gate routes", () => {
  beforeEach(() => {
    vi.stubEnv("ANALYTICS_PASSWORD", ENV.ANALYTICS_PASSWORD);
    vi.stubEnv("LOCALDB_API_TOKEN", ENV.LOCALDB_API_TOKEN);
    delete (globalThis as Record<string, unknown>).__sbAdminLoginLimiter;
    delete (globalThis as Record<string, unknown>).__sbAdminFailedLogins;
  });
  afterEach(() => vi.unstubAllEnvs());

  function login(password: unknown, ip = "203.0.113.9", origin = "http://localhost:8000") {
    return new NextRequest("http://localhost:8000/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json", host: "localhost:8000", origin, "x-forwarded-for": `${ip}, 127.0.0.1` },
      body: JSON.stringify({ password }),
    });
  }

  it("sets a strict, httpOnly, secure cookie for the right password and says no to a wrong one", async () => {
    const { POST } = await import("@/app/api/admin/login/route");
    const wrong = await POST(login("nope"));
    expect(wrong.status).toBe(401);
    expect(wrong.headers.get("set-cookie")).toBeNull();
    const right = await POST(login(ENV.ANALYTICS_PASSWORD));
    expect(right.status).toBe(200);
    const cookie = right.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${ADMIN_COOKIE}=v1.`);
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie.toLowerCase()).toContain("secure");
    expect(cookie.toLowerCase()).toContain("samesite=strict");
    expect(cookie).toContain("Max-Age=2592000");
    expect(cookie).not.toContain(ENV.ANALYTICS_PASSWORD.split(" ")[0]);
  });

  it("allows 5 tries per 15 minutes per address, then refuses even the right password", async () => {
    const { POST } = await import("@/app/api/admin/login/route");
    for (let i = 0; i < 5; i += 1) expect((await POST(login(`wrong ${i}`))).status).toBe(401);
    const blocked = await POST(login(ENV.ANALYTICS_PASSWORD));
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    // another address is not blocked
    expect((await POST(login(ENV.ANALYTICS_PASSWORD, "203.0.113.10"))).status).toBe(200);
  });

  it("stops taking any password after 100 wrong ones from all addresses together", async () => {
    const { POST } = await import("@/app/api/admin/login/route");
    for (let i = 0; i < 100; i += 1) {
      // a new address every try: the per-address limit never trips
      expect((await POST(login("wrong", `198.18.${Math.floor(i / 200)}.${i % 200}`))).status).toBe(401);
    }
    expect((await POST(login(ENV.ANALYTICS_PASSWORD, "203.0.113.50"))).status).toBe(429);
  });

  it("counts tries by Cloudflare's visitor address when there is one", async () => {
    const { POST } = await import("@/app/api/admin/login/route");
    const viaCloudflare = (ip: string) => {
      const request = login("wrong", "172.70.1.1");
      request.headers.set("cf-connecting-ip", ip);
      return request;
    };
    for (let i = 0; i < 5; i += 1) expect((await POST(viaCloudflare("203.0.113.60"))).status).toBe(401);
    expect((await POST(viaCloudflare("203.0.113.60"))).status).toBe(429);
    // same Cloudflare edge address, another visitor: not blocked
    expect((await POST(viaCloudflare("203.0.113.61"))).status).toBe(401);
  });

  it("refuses a login posted from another site", async () => {
    const { POST } = await import("@/app/api/admin/login/route");
    expect((await POST(login(ENV.ANALYTICS_PASSWORD, "203.0.113.11", "https://evil.example"))).status).toBe(403);
  });

  it("refuses everything when no password is set", async () => {
    vi.stubEnv("ANALYTICS_PASSWORD", "");
    const { POST } = await import("@/app/api/admin/login/route");
    expect((await POST(login(""))).status).toBe(503);
    const { GET } = await import("@/app/api/admin/analytics/route");
    expect((await GET(new NextRequest("http://localhost:8000/api/admin/analytics"))).status).toBe(503);
  });

  it("keeps the data routes behind the cookie", async () => {
    const { GET } = await import("@/app/api/admin/analytics/route");
    const { GET: live } = await import("@/app/api/admin/analytics/live/route");
    const bare = new NextRequest("http://localhost:8000/api/admin/analytics?range=7d");
    expect((await GET(bare)).status).toBe(401);
    expect((await live(bare)).status).toBe(401);
    const forged = new NextRequest("http://localhost:8000/api/admin/analytics?range=7d", { headers: { cookie: `${ADMIN_COOKIE}=v1.${Date.now() + DAY}.forged` } });
    expect((await GET(forged)).status).toBe(401);
    const body = await (await GET(forged)).json();
    expect(JSON.stringify(body)).not.toMatch(/visitors|pageviews/);
  });
});
