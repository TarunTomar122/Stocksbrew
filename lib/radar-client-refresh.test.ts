import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { flushWatchlistRebuild } from "@/lib/radar-client-refresh";

describe("flushWatchlistRebuild", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("refreshes the current page immediately and once after the rebuild", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true })));

    const router = { refresh: vi.fn() } as unknown as AppRouterInstance;
    const pending = flushWatchlistRebuild(router, 0);

    expect(router.refresh).toHaveBeenCalledTimes(1);

    await pending;
    vi.runOnlyPendingTimers();

    expect(router.refresh).toHaveBeenCalledTimes(2);
  });
});
