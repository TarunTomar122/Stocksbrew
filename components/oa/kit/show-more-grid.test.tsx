import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ShowMoreGrid } from "./show-more-grid";

function grid(count: number, cut?: "cards" | "pairs" | "tiles") {
  return renderToStaticMarkup(
    <ShowMoreGrid count={count} cut={cut} label="Cards" className="grid gap-3">
      {Array.from({ length: count }, (_, index) => (
        <li key={index}>Card {index + 1}</li>
      ))}
    </ShowMoreGrid>,
  );
}

describe("ShowMoreGrid", () => {
  it("renders every card on the server and folds the rest with CSS, so nothing jumps when the script loads", () => {
    const html = grid(15);
    expect(html.match(/<li>/g)).toHaveLength(15);
    expect(html).toContain("max-sm:[&amp;&gt;li:nth-child(n+5)]:hidden");
    expect(html).toContain("sm:[&amp;&gt;li:nth-child(n+10)]:hidden");
    expect(html).toContain("2xl:[&amp;&gt;li:nth-child(n+9)]:hidden");
    // One quiet button, with the count for each screen size and its list named for assistive tech.
    expect(html).toContain("Show 11 more");
    expect(html).toContain("Show 6 more");
    expect(html).toContain("Show 7 more");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toMatch(/aria-controls="[^"]+"/);
  });

  it("has no button where nothing is folded, and hides it at the sizes that show everything", () => {
    expect(grid(4)).not.toContain("<button");
    const phoneOnly = grid(7);
    expect(phoneOnly).toContain("Show 3 more");
    expect(phoneOnly).toMatch(/class="[^"]*\bflex sm:hidden 2xl:hidden/);
    // Nine fit three rows of three, but not two rows of four.
    expect(grid(9)).toMatch(/class="[^"]*\bflex sm:hidden 2xl:flex/);
  });

  it("cuts a two-column grid at four rows, and small tiles later", () => {
    expect(grid(10, "pairs")).toContain("sm:[&amp;&gt;li:nth-child(n+9)]:hidden");
    const tiles = grid(30, "tiles");
    expect(tiles).toContain("Show 18 more");
    expect(tiles).toContain("Show 6 more");
  });
});
