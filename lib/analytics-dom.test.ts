import { describe, expect, it } from "vitest";

import { hrefTarget, nextVisit, propsFromDataset, tickerFromHref, trackedClickFor } from "@/lib/analytics-dom";

/** A tiny stand-in for DOM elements: enough for closest(), attributes and dataset. */
type FakeEl = {
  tagName: string;
  attrs: Record<string, string>;
  parentElement: FakeEl | null;
  dataset: Record<string, string>;
  closest(selector: string): FakeEl | null;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
};

function el(tagName: string, attrs: Record<string, string> = {}, parent: FakeEl | null = null): FakeEl {
  const dataset: Record<string, string> = {};
  for (const [name, value] of Object.entries(attrs)) {
    if (name.startsWith("data-")) dataset[name.slice(5).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = value;
  }
  const node: FakeEl = {
    tagName: tagName.toUpperCase(),
    attrs,
    parentElement: parent,
    dataset,
    getAttribute: (name) => attrs[name] ?? null,
    hasAttribute: (name) => name in attrs,
    closest(selector) {
      const match = (candidate: FakeEl) => {
        if (selector === "a[href]") return candidate.tagName === "A" && "href" in candidate.attrs;
        const attr = /^\[([a-z-]+)\]$/.exec(selector)?.[1];
        return attr ? attr in candidate.attrs : false;
      };
      let current: FakeEl | null = node;
      while (current) {
        if (match(current)) return current;
        current = current.parentElement;
      }
      return null;
    },
  };
  return node;
}

describe("declared click tracking", () => {
  it("turns data-track-* into snake_case properties with numbers and booleans", () => {
    expect(propsFromDataset({ track: "x", trackInsightId: "mover-NVDA", trackCount: "3", trackOpen: "true", trackLinks: "y" })).toEqual({
      insight_id: "mover-NVDA",
      count: 3,
      open: true,
    });
  });

  it("reads tickers and paths from hrefs without leaking query strings", () => {
    expect(tickerFromHref("/stock/nvda?tab=news")).toBe("NVDA");
    expect(tickerFromHref("https://www.stocksbrew.online/stock/BRK.B")).toBe("BRK.B");
    expect(tickerFromHref("/screener")).toBeNull();
    expect(hrefTarget("/ask?q=why%20is%20my%20portfolio%20down")).toBe("/ask");
    expect(hrefTarget("https://news.example.com/a/b?c=1")).toBe("news.example.com");
    expect(hrefTarget("#job-abc")).toBe("#job-abc");
  });

  it("sends an element's own data-track event", () => {
    const link = el("a", { href: "/api/screener/export?q=x", "data-track": "screener_exported", "data-track-format": "csv" });
    const span = el("span", {}, link);
    expect(trackedClickFor(span)).toEqual({ event: "screener_exported", properties: { format: "csv", href: "/api/screener/export" } });
  });

  it("sends a container's event for any link inside it, with the ticker and which link", () => {
    const row = el("li", { "data-track-links": "insight_clicked", "data-track-insight-id": "mover-NVDA", "data-track-insight-kind": "mover" });
    const action = el("a", { href: "/signals?tab=movers", "data-track-target": "action" }, row);
    const stock = el("a", { href: "/stock/NVDA", "data-track-target": "stock" }, row);
    expect(trackedClickFor(action)).toEqual({
      event: "insight_clicked",
      properties: { insight_id: "mover-NVDA", insight_kind: "mover", href: "/signals", target: "action" },
    });
    expect(trackedClickFor(stock)?.properties).toMatchObject({ ticker: "NVDA", target: "stock" });
    // Clicking the row's text (not a link) sends nothing.
    expect(trackedClickFor(el("p", {}, row))).toBeNull();
  });

  it("counts a <summary> only when it opens its <details>", () => {
    const closed = el("details");
    const summary = el("summary", { "data-track": "mover_opened", "data-track-ticker": "AMD" }, closed);
    expect(trackedClickFor(summary)).toEqual({ event: "mover_opened", properties: { ticker: "AMD" } });
    const open = el("details", { open: "" });
    const openSummary = el("summary", { "data-track": "mover_opened" }, open);
    expect(trackedClickFor(openSummary)).toBeNull();
  });

  it("ignores bad event names and things that are not elements", () => {
    expect(trackedClickFor(el("a", { href: "/", "data-track": "Bad Name!" }))).toBeNull();
    expect(trackedClickFor(null)).toBeNull();
    expect(trackedClickFor({})).toBeNull();
  });
});

describe("returning visitors", () => {
  it("does not count a first visit or a second visit the same day", () => {
    expect(nextVisit(null, "2026-11-10")).toEqual({ log: { first: "2026-11-10", last: "2026-11-10" }, returned: null });
    expect(nextVisit({ first: "2026-11-10", last: "2026-11-10" }, "2026-11-10").returned).toBeNull();
  });

  it("counts the first visit of a later day with days since first and last", () => {
    expect(nextVisit({ first: "2026-11-01", last: "2026-11-08" }, "2026-11-10")).toEqual({
      log: { first: "2026-11-01", last: "2026-11-10" },
      returned: { days_since_first: 9, days_since_last: 2 },
    });
  });

  it("starts over on a corrupt log", () => {
    expect(nextVisit({ first: "garbage", last: "2026-11-01" } as never, "2026-11-10").returned).toBeNull();
  });
});
