import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function relativeLuminance(hex: string): number {
  const channels =
    hex
      .match(/[\da-f]{2}/gi)
      ?.map((channel) => Number.parseInt(channel, 16) / 255) ?? [];
  const linear = channels.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  const darker = Math.min(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  return (lighter + 0.05) / (darker + 0.05);
}

describe("Pulse, Social, Watchlist, and home cleanup", () => {
  it("has no Social link in the footer (Reddit now lives under /signals)", () => {
    expect(source("components/footer.tsx")).not.toContain('href: "/social"');
  });

  it("keeps every user on home and gives Explore a real page in navigation", () => {
    expect(source("app/page.tsx")).not.toContain("redirect(");
    expect(source("app/(app)/explore/page.tsx")).not.toContain('redirect("/")');
  });

  it("keeps the radar backend copy free of one-sided selling boilerplate", () => {
    const backend = source("backend/radar_intelligence.py");

    expect(backend).not.toContain("Selling has become unusually one-sided");
    expect(backend).not.toContain(
      "condition to monitor, not a reversal signal",
    );
  });

  it("keeps table dividers visible on hover", () => {
    const css = source("app/globals.css");
    expect(css).toContain("table tbody tr:hover");
    expect(css).toContain("border-color: var(--outline-variant) !important");
  });

  it("keeps free-tool cards inside the viewport", () => {
    const frame = source("components/marketing/free-tool-chrome.tsx");

    expect(frame).toContain("flex min-w-0 w-full");
  });

  it("lets free and Pro members generate missing stock analysis", () => {
    const lockedBrief = source("components/locked-ai-brief.tsx");

    expect(lockedBrief).toContain("if (user)");
    expect(lockedBrief).not.toContain("Start your 3-day free trial");
    expect(lockedBrief).toContain("Generate the AI brief for {ticker}");
  });

  it("only shows provider-backed support and resistance on the stock report", () => {
    const stream = source("components/stock-page-stream.tsx");
    const report = source("components/stock-report/report.tsx");
    const sections = source("components/stock-report/sections.tsx");

    expect(stream).toContain("getLatestTechnicals(stock.instrument_id)");
    for (const file of [stream, report, sections]) {
      expect(file).not.toContain("findNearestTechnicalLevels");
    }
    // The chart carries at most two labels, so support and resistance live in the Technicals section only.
    expect(report).not.toContain("Support ${level(");
    expect(report).not.toContain("Resistance ${level(");
    expect(sections).toContain("fin(levels?.support)");
    expect(sections).toContain("fin(levels?.resistance)");
    expect(sections).toContain('<Panel label="Range and levels">');
  });

  it("keeps the homepage market-read card compact without the return-period strip", () => {
    const hero = source("components/landing-hero-command.tsx");

    expect(hero).toContain("<VerdictCallChart");
    expect(hero).toContain("chartHeight={190}");
    expect(hero).not.toContain("returns={call.returns}");
  });

  it("keeps the dark palette readable and its controls visibly bounded", () => {
    const css = source("app/globals.css");
    const dark = css.match(/\.dark \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const token = (name: string) =>
      dark.match(new RegExp(`--${name}:\\s*(#[\\da-f]{6})`, "i"))?.[1] ?? "";

    const background = token("background");
    const surface = token("surface");

    expect(
      contrastRatio(token("on-surface"), background),
    ).toBeGreaterThanOrEqual(7);
    expect(
      contrastRatio(token("on-surface-variant"), surface),
    ).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(token("outline"), surface)).toBeGreaterThanOrEqual(3);
    expect(
      contrastRatio(token("outline-variant"), surface),
    ).toBeGreaterThanOrEqual(1.2);
    expect(contrastRatio(token("outline-variant"), surface)).toBeLessThan(3);
    expect(
      contrastRatio(token("signal-bullish"), surface),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(token("signal-bearish"), surface),
    ).toBeGreaterThanOrEqual(4.5);
  });
});
