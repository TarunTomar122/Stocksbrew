import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ToneColumns } from "./tone-columns";

const items = (prefix: string, count: number) => Array.from({ length: count }, (_, index) => <li key={index}>{`${prefix} ${index + 1}`}</li>);

function columns(
  good: number,
  bad: number,
  options: { unread?: number; variant?: "cards" | "rows"; more?: React.ReactNode; startOpen?: boolean; cut?: number } = {},
) {
  return renderToStaticMarkup(
    <ToneColumns
      good={items("Good", good)}
      bad={items("Bad", bad)}
      unread={items("Unread", options.unread ?? 0)}
      cut={options.cut ?? 4}
      variant={options.variant ?? "cards"}
      label="In the news today"
      startOpen={options.startOpen}
      more={options.more}
    />,
  );
}

/** How many items render without `hidden`. */
const shown = (html: string, prefix: string) => (html.match(new RegExp(`<li(?![^>]*hidden)[^>]*>${prefix} \\d+</li>`, "g")) ?? []).length;
const all = (html: string, prefix: string) => (html.match(new RegExp(`<li[^>]*>${prefix} \\d+</li>`, "g")) ?? []).length;

describe("ToneColumns", () => {
  it("puts good news first, and folds both columns to the same count", () => {
    const html = columns(6, 9);
    expect(html.indexOf("Good news")).toBeLessThan(html.indexOf("Mixed or bad"));
    expect(html.indexOf("Good 1")).toBeLessThan(html.indexOf("Bad 1"));
    // Every item is on the page; four a side show.
    expect(all(html, "Good") + all(html, "Bad")).toBe(15);
    expect(shown(html, "Good")).toBe(4);
    expect(shown(html, "Bad")).toBe(4);
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain("Show 7 more");
  });

  it("opened, runs the columns as far as the shorter side and spreads the longer side's rest under both", () => {
    const html = columns(6, 9, { startOpen: true });
    expect(shown(html, "Good")).toBe(6);
    expect(shown(html, "Bad")).toBe(9);
    // Bad 7 to 9 go under both columns, after the good column ends.
    expect(html).toContain("More mixed or bad");
    expect(html.indexOf("More mixed or bad")).toBeGreaterThan(html.indexOf("Good 6"));
    expect(html.indexOf("Bad 7")).toBeGreaterThan(html.indexOf("More mixed or bad"));
    expect(html).toContain("Show less");
  });

  it("keeps stories with no read apart at the foot of the right column, never counted as bad", () => {
    const html = columns(4, 2, { unread: 3, startOpen: true });
    expect(html).toMatch(/Mixed or bad<\/span><span[^>]*>2</);
    expect(html).toMatch(/No read yet<\/span><span[^>]*>3</);
    expect(html.indexOf("Bad 2")).toBeLessThan(html.indexOf("No read yet"));
    expect(html.indexOf("No read yet")).toBeLessThan(html.indexOf("Unread 1"));
  });

  it("lays a short side under half the fold out as a strip above the long one", () => {
    const html = columns(1, 10);
    expect(html.indexOf("Good 1")).toBeLessThan(html.indexOf("Bad 1"));
    expect(html).toContain("md:grid-cols-2");
    // The long side shows two across, eight in view.
    expect(shown(html, "Bad")).toBe(8);
    expect(html).toContain("Show 2 more");
    // The short side above, wherever it is: here Mixed or bad has one.
    const flipped = columns(10, 1);
    expect(flipped.indexOf("Bad 1")).toBeLessThan(flipped.indexOf("Good 1"));
  });

  it("shrinks an empty side to one quiet line with no count", () => {
    const html = columns(0, 11);
    expect(html).toContain("None today");
    expect(html).not.toMatch(/Good news<\/span><span[^>]*>0</);
    expect(html.indexOf("None today")).toBeLessThan(html.indexOf("Bad 1"));
    const rows = columns(5, 0, { variant: "rows" });
    expect(rows.indexOf("None today")).toBeLessThan(rows.indexOf("Good 1"));
    expect(rows).not.toContain("<button");
  });

  it("with no tones read at all, shows one list with no tone headers", () => {
    const html = columns(0, 0, { unread: 11 });
    expect(html).not.toContain("Good news");
    expect(html).not.toContain("No read yet");
    expect(shown(html, "Unread")).toBe(8);
    expect(html).toContain("Show 3 more");
  });

  it("shows the next-page link in place of the button once nothing is folded", () => {
    expect(columns(3, 3)).not.toContain("<button");
    expect(columns(3, 3, { more: <a href="/news?limit=160">More companies (9)</a> })).toContain("More companies (9)");
    // Three beside four folds to three each: one more to show.
    expect(columns(3, 4)).toContain("Show 1 more");
    const open = columns(6, 9, { startOpen: true, more: <a href="/news?limit=240">More companies (4)</a> });
    expect(open).not.toContain("<button");
    expect(open).toContain("More companies (4)");
  });

  it("leaves out a folded group's header, and names the tail by the header it starts with", () => {
    const folded = columns(6, 5, { unread: 2 });
    expect(folded).toMatch(/<section[^>]*hidden=""[^>]*><h3[^>]*>.*?No read yet/);
    const open = columns(7, 2, { unread: 6, startOpen: true });
    const labelled = open.match(/aria-labelledby="([^"]+)"/g)?.map((attr) => attr.slice(17, -1)) ?? [];
    for (const id of labelled) expect(open).toContain(`id="${id}"`);
  });

  it("folds both columns to exactly the same count when the short side is under the cut (3, 10, cut 5)", () => {
    const html = columns(3, 10, { cut: 5, variant: "rows" });
    expect(shown(html, "Good")).toBe(3);
    expect(shown(html, "Bad")).toBe(3);
    expect(html).toContain("Show 7 more");
    // Opened: three beside three, the other seven two across under both.
    const open = columns(3, 10, { cut: 5, variant: "rows", startOpen: true });
    expect(open).toMatch(/More mixed or bad<\/span><span[^>]*>7</);
    // Two beside ten with a cut of five is under half: a strip instead.
    expect(columns(2, 10, { cut: 5 })).not.toContain("More mixed or bad");
  });

  it("pairs the i-th good card with the i-th mixed or bad one in one grid row, headers first", () => {
    const html = columns(4, 6);
    expect(html).toMatch(/<li[^>]*md:col-start-1[^>]*style="--r:2"[^>]*>Good 1</);
    expect(html).toMatch(/<li[^>]*md:col-start-2[^>]*style="--r:2"[^>]*>Bad 1</);
    expect(html).toMatch(/<li[^>]*style="--r:5"[^>]*>Bad 4</);
    expect(html).toMatch(/<h3[^>]*style="--r:1"/);
    // Each card stretches to its row.
    expect(html).toContain("md:[&amp;&gt;*]:h-full");
  });

  it("pairs only good with mixed or bad, and puts No read yet after the pairing, two across (3 good, 2 bad, 2 unread)", () => {
    const html = columns(3, 2, { unread: 2, startOpen: true });
    // Rows 2 and 3 pair Good 1-2 with Bad 1-2; nothing on the right is pushed down by a header.
    expect(html).toMatch(/<li[^>]*md:col-start-2[^>]*style="--r:2"[^>]*>Bad 1</);
    expect(html).toMatch(/<li[^>]*md:col-start-2[^>]*style="--r:3"[^>]*>Bad 2</);
    expect(html).not.toMatch(/style="--r:\d+"[^>]*>Unread/);
    // The good side's third card goes under both, then the unread group, two across, under its own header.
    expect(html.indexOf("More good news")).toBeLessThan(html.indexOf("No read yet"));
    expect(html.indexOf("No read yet")).toBeLessThan(html.indexOf("Unread 1"));
    expect(html).toMatch(/Mixed or bad<\/span><span[^>]*>2</);
    // Folded: two beside two, the third good card and both unread behind one button.
    const folded = columns(3, 2, { unread: 2 });
    expect(shown(folded, "Good")).toBe(2);
    expect(shown(folded, "Bad")).toBe(2);
    expect(folded).toContain("Show 3 more");
  });
});
