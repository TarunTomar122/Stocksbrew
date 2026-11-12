import { describe, expect, it, vi } from "vitest";

vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/firebase-admin", () => ({ adminAuth: {}, adminFirestore: {} }));

import { LLM_BRIEF_SOURCE } from "@/lib/brief-source";
import { keepPreviousWriteUps, type WatchlistView } from "@/lib/watchlist-view";

type Parts = Pick<WatchlistView, "brief" | "event_radar">;
const oldBrief = { source: LLM_BRIEF_SOURCE, narrative: "AAPL and NVDA lead" } as unknown as WatchlistView["brief"];
const fallback = { source: "rules", narrative: "rules" } as unknown as WatchlistView["brief"];
const oldEvents = [{ ticker: "NVDA" }] as unknown as WatchlistView["event_radar"];
const previous = { brief: oldBrief, event_radar: oldEvents, tracked_ids: ["US_AAPL", "US_NVDA"] };
const options = { preserveBriefIfFallback: true, preserveActivityIfThin: true };
const fresh = (): Parts => ({ brief: fallback, event_radar: [] });

describe("keepPreviousWriteUps (bugs 9 and 13)", () => {
  it("keeps the written brief and events when the stocks are the same", () => {
    const view = fresh();
    keepPreviousWriteUps(view, previous, ["US_NVDA", "US_AAPL"], options);
    expect(view).toEqual({ brief: oldBrief, event_radar: oldEvents });
  });

  it("drops both after a stock was added or removed", () => {
    for (const tracked of [["US_AAPL"], ["US_AAPL", "US_NVDA", "US_MSFT"]]) {
      const view = fresh();
      keepPreviousWriteUps(view, previous, tracked, options);
      expect(view).toEqual(fresh());
    }
  });

  it("never keeps them for an emptied list", () => {
    const view = fresh();
    keepPreviousWriteUps(view, { ...previous, tracked_ids: [] }, [], options);
    expect(view).toEqual(fresh());
  });
});
