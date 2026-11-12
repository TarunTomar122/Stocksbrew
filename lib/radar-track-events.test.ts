import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { announceBookChanged, RADAR_TRACK_CHANGED_EVENT } from "@/lib/radar-track-events";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("announceBookChanged (bug 14)", () => {
  it("fires the signal, refreshes now, waits for the view rebuild, then refreshes again", async () => {
    vi.useFakeTimers();
    const target = new EventTarget();
    const heard: unknown[] = [];
    target.addEventListener(RADAR_TRACK_CHANGED_EVENT, (event) => heard.push((event as CustomEvent).detail));
    vi.stubGlobal("window", target);
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const router = { refresh: vi.fn() };
    await announceBookChanged({ action: "add", count: 2 }, router as never);
    expect(heard).toEqual([{ action: "add", count: 2 }]);
    expect(fetchMock).toHaveBeenCalledWith("/api/watchlist/refresh", { method: "POST" });
    expect(router.refresh).toHaveBeenCalledTimes(1);
    await vi.runAllTimersAsync();
    expect(router.refresh).toHaveBeenCalledTimes(2);
  });

  it("is given the router by the import page, so its second refresh runs", () => {
    const page = readFileSync(resolve(process.cwd(), "components/import/import-workspace.tsx"), "utf8");
    expect(page).toMatch(/announceBookChanged\([^;]*,\s*router\)/);
  });
});
