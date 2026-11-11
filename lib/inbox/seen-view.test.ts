import { describe, expect, it, vi } from "vitest";

import { afterInView, newestShown, seenAtFromBody, SEEN_AFTER_MS, wouldClear } from "./seen";

describe("what the inbox shows, read", () => {
  const items = [
    { at: "2026-11-11T14:00:00.000Z", quiet: false },
    { at: "2026-11-11T15:30:00.000Z", quiet: true },
    { at: "not a time", quiet: false },
    { at: "2026-11-10T21:00:00.000Z", quiet: false },
  ];

  it("marks up to the newest item shown, never to now", () => {
    expect(newestShown(items)).toBe("2026-11-11T15:30:00.000Z");
    expect(newestShown([])).toBeNull();
    expect(newestShown([{ at: "nope" }])).toBeNull();
  });

  it("only saves when something shown is still unread; a quiet check never counts", () => {
    expect(wouldClear(items, "2026-11-11T13:00:00.000Z")).toBe(true);
    // Only the quiet one is newer than the mark: nothing to clear.
    expect(wouldClear(items, "2026-11-11T14:00:00.000Z")).toBe(false);
    expect(wouldClear(items, null)).toBe(false);
  });
});

describe("seenAtFromBody", () => {
  const now = new Date("2026-11-11T16:00:00.000Z");

  it("takes the shown time from the body", () => {
    expect(seenAtFromBody({ at: "2026-11-11T15:30:00.000Z" }, now).toISOString()).toBe("2026-11-11T15:30:00.000Z");
  });

  it("never marks the future read", () => {
    expect(seenAtFromBody({ at: "2026-11-12T09:00:00.000Z" }, now).toISOString()).toBe(now.toISOString());
  });

  it("falls back to now without a usable body (Mark all read)", () => {
    for (const body of [null, undefined, {}, { at: "soon" }, { at: 12 }, "junk"]) {
      expect(seenAtFromBody(body, now).toISOString()).toBe(now.toISOString());
    }
  });
});

describe("afterInView", () => {
  function page(visible: boolean) {
    let listener: (() => void) | null = null;
    return {
      state: { visible },
      isVisible() {
        return this.state.visible;
      },
      onVisibilityChange(next: () => void) {
        listener = next;
        return () => {
          listener = null;
        };
      },
      set(visible: boolean) {
        this.state.visible = visible;
        listener?.();
      },
      get subscribed() {
        return listener !== null;
      },
    };
  }

  it("fires once after about two seconds in view", () => {
    vi.useFakeTimers();
    const fire = vi.fn();
    const p = page(true);
    afterInView({ fire, isVisible: () => p.isVisible(), onVisibilityChange: (l) => p.onVisibilityChange(l) });
    vi.advanceTimersByTime(SEEN_AFTER_MS - 1);
    expect(fire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fire).toHaveBeenCalledTimes(1);
    p.set(false);
    p.set(true);
    vi.advanceTimersByTime(SEEN_AFTER_MS * 2);
    expect(fire).toHaveBeenCalledTimes(1);
    expect(p.subscribed).toBe(false);
    vi.useRealTimers();
  });

  it("waits for a hidden tab and starts over if it is hidden before the time is up", () => {
    vi.useFakeTimers();
    const fire = vi.fn();
    const p = page(false);
    afterInView({ fire, isVisible: () => p.isVisible(), onVisibilityChange: (l) => p.onVisibilityChange(l) });
    vi.advanceTimersByTime(10_000);
    expect(fire).not.toHaveBeenCalled();
    p.set(true);
    vi.advanceTimersByTime(1500);
    p.set(false);
    vi.advanceTimersByTime(5000);
    expect(fire).not.toHaveBeenCalled();
    p.set(true);
    vi.advanceTimersByTime(SEEN_AFTER_MS);
    expect(fire).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("does nothing once cancelled (the popover closed, the page left)", () => {
    vi.useFakeTimers();
    const fire = vi.fn();
    const p = page(true);
    const cancel = afterInView({ fire, isVisible: () => p.isVisible(), onVisibilityChange: (l) => p.onVisibilityChange(l) });
    vi.advanceTimersByTime(1000);
    cancel();
    vi.advanceTimersByTime(5000);
    p.set(true);
    vi.advanceTimersByTime(5000);
    expect(fire).not.toHaveBeenCalled();
    expect(p.subscribed).toBe(false);
    vi.useRealTimers();
  });
});
