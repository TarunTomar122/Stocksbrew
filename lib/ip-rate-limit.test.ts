import { describe, expect, it } from "vitest";

import { clientAddress, createIpRateLimiter } from "@/lib/ip-rate-limit";

describe("createIpRateLimiter", () => {
  it("lets `limit` requests through per window, then asks to wait until the window ends", () => {
    const take = createIpRateLimiter({ limit: 3, windowMs: 60_000 });
    expect(take("1.2.3.4", 0)).toEqual({ ok: true });
    expect(take("1.2.3.4", 1_000)).toEqual({ ok: true });
    expect(take("1.2.3.4", 2_000)).toEqual({ ok: true });
    expect(take("1.2.3.4", 15_000)).toEqual({ ok: false, retryAfterSec: 45 });
    // Another visitor has their own count.
    expect(take("5.6.7.8", 15_000)).toEqual({ ok: true });
    // A new window starts fresh.
    expect(take("1.2.3.4", 60_000)).toEqual({ ok: true });
  });

  it("never asks for less than a second", () => {
    const take = createIpRateLimiter({ limit: 1, windowMs: 1_000 });
    take("a", 0);
    expect(take("a", 999)).toEqual({ ok: false, retryAfterSec: 1 });
  });

  it("sweeps finished windows instead of growing without bound", () => {
    const take = createIpRateLimiter({ limit: 1, windowMs: 1_000 });
    for (let i = 0; i < 5_001; i++) take(`ip-${i}`, 0);
    // The sweep at the next request clears every finished window, so the first address is fresh again.
    expect(take("ip-0", 2_000)).toEqual({ ok: true });
  });
});

describe("clientAddress", () => {
  it("takes the first forwarded address, then x-real-ip", () => {
    expect(clientAddress(new Headers({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" }))).toBe("9.9.9.9");
    expect(clientAddress(new Headers({ "x-real-ip": "8.8.8.8" }))).toBe("8.8.8.8");
    expect(clientAddress(new Headers())).toBe("unknown");
  });
});
