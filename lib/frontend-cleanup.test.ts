import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Pulse, Social, Radar, and home cleanup", () => {
  it("puts price before the final interesting rationale column", () => {
    const feed = source("components/interesting-stocks-feed.tsx");
    const today = feed.indexOf("<span className=\"text-right\">Today</span>");
    const price = feed.indexOf("<span className=\"text-right\">Price</span>");
    const why = feed.indexOf("<span>Why it is interesting</span>");

    expect(today).toBeGreaterThan(-1);
    expect(price).toBeGreaterThan(today);
    expect(why).toBeGreaterThan(price);
    expect(feed).toContain("priceText(row.price)");
  });

  it("renders recent earnings and social insights as responsive cards", () => {
    const pulse = source("components/pulse-hub.tsx");
    const social = source("components/social-page-stream.tsx");

    expect(pulse).toContain("sm:grid-cols-2 xl:grid-cols-3");
    expect(pulse).toContain("What changed after the print.");
    expect(social).toContain("snapshot.tickers.filter(hasRedditBrief)");
    expect(social).toContain("sm:grid-cols-2 xl:grid-cols-3");
    expect(social).not.toContain("snapshot.top_posts.map");
    expect(social).not.toContain("Recent source posts");
  });

  it("keeps every user on home and removes Explore from navigation", () => {
    expect(source("app/page.tsx")).not.toContain("redirect(");
    expect(source("components/header.tsx")).not.toContain('href: "/explore"');
    expect(source("app/explore/page.tsx")).toContain('redirect("/")');
  });

  it("uses attention cards and removes the repeated RSI copy", () => {
    const queue = source("components/radar-next/attention-queue.tsx");
    const backend = source("backend/radar_intelligence.py");

    expect(queue).toContain("md:grid-cols-2 xl:grid-cols-3");
    expect(queue).toContain("const isRsi");
    expect(backend).not.toContain("Selling has become unusually one-sided");
    expect(backend).not.toContain("condition to monitor, not a reversal signal");
  });

  it("keeps table dividers visible on hover", () => {
    const css = source("app/globals.css");
    expect(css).toContain("table tbody tr:hover");
    expect(css).toContain("border-color: var(--outline-variant) !important");
  });

  it("keeps every Pulse tab visible on mobile", () => {
    const css = source("app/globals.css");
    expect(css).toContain("@media (max-width: 639px)");
    expect(css).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))");
  });
});
