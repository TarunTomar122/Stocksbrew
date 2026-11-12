import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The app's files use the automatic JSX runtime under Next; vitest compiles them with the classic one, and week.tsx
// builds JSX at import, so React has to be global before it loads.
await vi.hoisted(async () => {
  (globalThis as { React?: unknown }).React = await import("react");
});

// next/font only works under the Next compiler; the cells need nothing from it but a class name.
vi.mock("next/font/google", () => ({ Instrument_Sans: () => ({ className: "", variable: "", style: {} }) }));
// The server loaders it imports are never called here; react's `cache` only exists in the server build.
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("next/font/local", () => ({ default: () => ({ className: "", variable: "", style: {} }) }));

import { WeekCells, weekWords, type MemoView } from "./week";

const mover = (ticker: string, points: number) => ({ ticker, href: `/stock/${ticker}`, points, pct: points * 2, price: 100, dayPct: 1 });

/** The show and hide classes on the cell that links to `ticker`'s stock (./fit.ts showAt). */
function cellClass(html: string, ticker: string): string {
  const at = html.indexOf(`href="/stock/${ticker}"`);
  expect(at).toBeGreaterThan(-1);
  const open = html.lastIndexOf('<div class="', at);
  const all = html.slice(open + 12, html.indexOf('"', open + 12)).split(" ");
  return all.filter((name) => /(^|:)(hidden|block)$/.test(name)).join(" ");
}

describe("WeekCells", () => {
  const memo: MemoView = {
    monday: "2026-11-09",
    complete: false,
    facts: [],
    movers: [mover("AAA", 2.1), mover("BBB", -1.5), mover("CCC", 0.7), mover("ZZZ", 0.4)],
  };
  // Holding cards, in order: AAA leads (shown at every width folded), BBB is the 7th (shown folded only 4 across, where
  // eight show), CCC is the 10th (only once opened). ZZZ is not a holding card at all.
  const order = ["H1", "H2", "AAA", "H4", "H5", "H6", "BBB", "H8", "H9", "CCC"];
  const html = renderToStaticMarkup(
    <WeekCells memo={memo} agents={null} today="2026-11-12" holdings={{ shown: [4, 4, 6, 8], open: [10, 10, 10, 10], order }} />,
  );

  it("never draws a mover whose holding card is on screen", () => {
    // On screen in every view: hidden everywhere.
    expect(cellClass(html, "AAA")).toBe("hidden");
    // On screen folded at 4 across and in every open view.
    const bbb = cellClass(html, "BBB");
    expect(bbb).toContain("2xl:hidden");
    expect(bbb).toContain("group-data-[open=true]/fold:hidden");
    // Only on screen once opened.
    expect(cellClass(html, "CCC")).toContain("group-data-[open=true]/fold:hidden");
  });

  it("keeps a mover that is not one of the cards in every view it fits", () => {
    expect(cellClass(html, "ZZZ")).not.toMatch(/(^| )hidden( |$)/);
  });
});

describe("weekWords", () => {
  it("says this week and last week in words, and dates an older week", () => {
    expect(weekWords("2026-11-09", "2026-11-12", false)).toBe("This week, so far");
    expect(weekWords("2026-11-09", "2026-11-15", true)).toBe("This week");
    expect(weekWords("2026-11-02", "2026-11-12", true)).toBe("Last week");
    expect(weekWords("2026-10-26", "2026-11-12", true)).toMatch(/^Week of /);
  });
});
