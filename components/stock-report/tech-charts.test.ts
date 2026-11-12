import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase-admin", () => ({ adminFirestore: {} }));

import { laneLabels, type TrackMark } from "./tech-charts";
import { fallbackTone } from "./news-tone";

const mark = (key: string, at: number, shape: TrackMark["shape"] = "tick"): TrackMark & { at: number } => ({
  key,
  at,
  value: at,
  name: "50-day avg",
  text: "$96.18",
  color: "red",
  shape,
});

describe("laneLabels", () => {
  it("gives the price the row above and spreads far-apart levels on one row below", () => {
    const lanes = laneLabels([mark("a", 10), mark("price", 50, "dot"), mark("b", 90)], 540);
    expect(lanes.get("price")).toBe("above");
    expect(lanes.get("a")).toBe("above");
    expect(lanes.get("b")).toBe("above");
  });

  it("moves a label that would overlap its neighbour to another row", () => {
    const lanes = laneLabels([mark("price", 50, "dot"), mark("a", 48), mark("b", 52)], 300);
    expect(lanes.get("price")).toBe("above");
    expect(new Set([lanes.get("a"), lanes.get("b")])).toEqual(new Set(["below", "below2"]));
  });
});

describe("fallbackTone", () => {
  it("reads a clear headline for the page's stock", () => {
    expect(fallbackTone({ title: "Intel shares plunge 12% after weak guidance", tickers: ["INTC"], sentiment_label: "" }, "INTC", "Intel Corporation")).toBe("negative");
  });

  it("says nothing for a question or a forecast", () => {
    expect(fallbackTone({ title: "Can Intel's Altera partnership drive growth?", tickers: ["INTC"], sentiment_label: "" }, "INTC", "Intel Corporation")).toBeNull();
  });

  it("gives a two-company headline's tone only to the company it is about", () => {
    const title = "Nebius gains 13% on CoreWeave results";
    expect(fallbackTone({ title, tickers: ["NBIS", "CRWV"], sentiment_label: "" }, "CRWV", "CoreWeave")).toBeNull();
  });

  it("keeps the old pipeline's label when the words say nothing", () => {
    expect(fallbackTone({ title: "Intel at the conference today", tickers: ["INTC"], sentiment_label: "bullish" }, "INTC", "Intel Corporation")).toBe("positive");
  });
});
