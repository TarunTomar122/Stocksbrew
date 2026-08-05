import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Pulse, Social, Watchlist, and home cleanup", () => {
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

  it("renders recent earnings as a compact ledger and social insights as responsive cards", () => {
    const pulse = source("components/pulse-hub.tsx");
    const social = source("components/social-page-stream.tsx");

    expect(pulse).toContain("What changed after results");
    expect(pulse).toContain("pulse-list-panel");
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

  it("groups Watchlist decisions and source-backed changes into compact cards", () => {
    const queue = source("components/radar-next/attention-queue.tsx");
    const decisions = source("components/radar-next/decision-queue.tsx");
    const header = source("components/radar-next/command-header.tsx");
    const backend = source("backend/radar_intelligence.py");

    expect(queue).toContain("md:grid-cols-2 xl:grid-cols-3");
    expect(queue).toContain("{citation.title}");
    expect(queue).not.toContain("const isRsi");
    expect(queue).not.toContain("item.what_changed");
    expect(queue).not.toContain("item.why_it_matters");
    expect(queue).not.toContain("item.next_trigger");
    expect(decisions).toContain("md:grid-cols-2 xl:grid-cols-3");
    expect(decisions).not.toContain("sm:grid-cols-[2rem_minmax");
    expect(decisions).toContain("function decisionPills");
    expect(decisions).toContain("rounded-full border border-[var(--rn-line)]");
    expect(decisions).not.toContain("inset 3px 0");
    expect(decisions).toContain("Why:</span> {item.driver}");
    const book = source("components/radar-next/book.tsx");
    expect(book).not.toContain("Watchlist call");
    expect(book).not.toContain("row.call");
    expect(book.indexOf('label="Signals"')).toBeLessThan(book.indexOf('label="Score"'));
    expect(book).not.toContain(">\n                Ready\n");
    expect(book).toContain("Number(right.needsAttention) - Number(left.needsAttention)");
    expect(book).toContain("backgroundColor: `color-mix(in srgb, ${accent} 9%, var(--rn-card))`");
    expect(book).toContain("overflow-hidden rounded-xl border border-[var(--rn-line)] bg-[var(--rn-card)]");
    expect(source("app/watchlist/page.tsx")).toContain("mx-auto flex w-full max-w-[1240px]");
    expect(header).not.toContain("sb://radar");
    expect(header).not.toContain("brew radar --today");
    expect(backend).not.toContain("Selling has become unusually one-sided");
    expect(backend).not.toContain("condition to monitor, not a reversal signal");
  });

  it("keeps sparse stock data compact and restores meaningful activity cards", () => {
    const fundamentals = source("components/fundamentals-breakdown.tsx");
    const detail = source("components/stock-detail.tsx");
    const stream = source("components/stock-page-stream.tsx");
    const reddit = source("components/stock-social-proof-card.tsx");
    const news = source("components/stock-news-rail-card.tsx");
    const alerts = source("components/stock-smart-alerts-rail.tsx");
    const callUi = source("components/verdict-call-ui.tsx");

    expect(fundamentals).toContain("groupPillarMetrics");
    expect(fundamentals).toContain("rounded-full border px-3 py-2");
    expect(fundamentals).toContain('aria-pressed={active}');
    expect(fundamentals).toContain("isSubscribed: boolean");
    expect(fundamentals).toContain("FeedUnlockBar");
    expect(fundamentals).toContain('isSubscribed ? "" : "flex h-full min-h-[32rem] flex-col"');
    expect(fundamentals).not.toContain("max-w-[29rem]");
    expect(fundamentals).not.toContain("bg-on-surface text-surface");
    expect(detail).toContain("lg:grid-cols-[minmax(15rem,0.32fr)_minmax(0,0.68fr)]");
    expect(detail).toContain("overflow-hidden rounded-2xl border border-outline-variant");
    expect(detail).toContain("ttm snapshot");
    expect(fundamentals).not.toContain("rounded-xl border border-outline-variant");
    expect(fundamentals).not.toContain("xl:grid-cols-5");
    expect(stream).toContain("flex-grow flex-col bg-surface");
    expect(stream).not.toContain("StockAgentAccessCta");
    expect(detail).not.toContain("bg-[var(--background)]");
    expect(detail).toContain("const levelMoney");
    expect(detail).toContain("style={{ color: scoreToneColor(hasReliableOverall");
    expect(detail).toContain("Street expectations and crowd signal");
    expect(detail).toContain("{(showAnalyst || hasExtendedAnalyst || hasCrowdSignal) && (");
    expect(detail).not.toContain("{subscribed && (showAnalyst || hasExtendedAnalyst || hasCrowdSignal) && (");
    expect(detail).toContain("hasCrowdSignal && hasMarketReddit");
    expect(detail).toContain('const showPeerRevenueGrowth = peerRows.some((peer) => peer.revGrowth !== "-");');
    expect(detail).toContain('{showPeerRevenueGrowth ? "rev growth" : "price"}');
    expect(detail).toContain('hasMarketReddit && showBasicAnalyst ? "flex min-w-0 flex-col divide-y');
    expect(detail.indexOf("Street expectations and crowd signal")).toBeLessThan(detail.indexOf("{/* ACTIVITY */}"));
    expect(reddit).toContain('<section className="min-w-0">');
    expect(reddit).toContain("max-w-[65ch]");
    expect(reddit).toContain("isSubscribed: boolean");
    expect(reddit).toContain("FeedUnlockBar");
    expect(reddit).toContain('signedOutLabel="Start your 3-day free trial"');
    expect(reddit).toContain('signedInLabel="Unlock Reddit Buzz"');
    expect(reddit).toContain('buttonClassName="!rounded-lg !border-primary !bg-none !bg-primary');
    expect(detail.indexOf("<StockRedditBuzzRailCard")).toBeLessThan(detail.indexOf("{/* ACTIVITY */}"));
    expect(detail).toContain("const hasActivitySection = Boolean(recentNews?.length);");
    expect(news).toContain("Editorial news stream");
    expect(news).toContain('fullWidth ? "sm:grid-cols-2 xl:grid-cols-3" : "sm:grid-cols-2"');
    expect(news).not.toContain("max-h-[19rem]");
    expect(news).toContain("<StockLogo");
    expect(news).toContain("sentimentTagClass");
    expect(detail.indexOf("<StockSmartAlertsRail")).toBeLessThan(detail.indexOf("{/* EVIDENCE */}"));
    expect(detail.indexOf("<StockSmartAlertsRail")).toBeLessThan(detail.indexOf("{/* ACTIVITY */}"));
    expect(detail).toContain("actions={");
    expect(callUi).toContain("actions?: ReactNode");
    expect(callUi).toContain("{actions}");
    expect(alerts).not.toContain("<section");
    expect(alerts).not.toContain("min-h-[6.5rem]");
    expect(alerts).toContain('name="bell"');
    expect(alerts).toContain("rounded-full");
    expect(alerts).not.toContain("Create alert");
  });

  it("keeps table dividers visible on hover", () => {
    const css = source("app/globals.css");
    expect(css).toContain("table tbody tr:hover");
    expect(css).toContain("border-color: var(--outline-variant) !important");
  });

  it("keeps every Pulse tab reachable in the mobile scroller", () => {
    const pulse = source("components/pulse-hub.tsx");
    const css = source("app/globals.css");
    expect(pulse).toContain('useState<Lens>("moving")');
    expect(css).toContain("@media (max-width: 639px)");
    expect(css).toContain(".pulse-tabs {\n    overflow-x: auto;");
    expect(css).toContain(".pulse-tab {\n    justify-content: center;");
    expect(css).toContain("white-space: nowrap");
    expect(css).toContain("flex-shrink: 0");
  });

  it("shows no more than three Watchlist decisions", () => {
    const queue = source("components/radar-next/decision-queue.tsx");
    const page = source("app/watchlist/page.tsx");

    expect(queue).toContain("items.slice(0, 3)");
    expect(page).toContain("buildDecisionCards(rows, activeRadarUserView).slice(0, 3)");
  });

  it("keeps Watchlist discovery as one deduplicated list", () => {
    const ideas = source("components/radar-next/ideas.tsx");

    expect(ideas).toContain("[...unusual, ...fits, ...top]");
    expect(ideas).toContain("seen.has(key)");
    expect(ideas).not.toContain('role="tablist"');
    expect(ideas).not.toContain("Fits your book");
    expect(ideas).not.toContain("Top rated");
  });

  it("lets free and Pro members generate missing stock analysis", () => {
    const lockedBrief = source("components/locked-ai-brief.tsx");
    const detail = source("components/stock-detail.tsx");

    expect(lockedBrief).toContain("if (user)");
    expect(lockedBrief).not.toContain("Start your 3-day free trial");
    expect(lockedBrief).toContain("Generate AI analysis for {ticker}");
    expect(detail).toContain("Generate AI analysis for ${ticker}");
    expect(detail).toContain('untrackedLabel="Generate analysis"');
  });

  it("only shows provider-backed support and resistance beside returns", () => {
    const detail = source("components/stock-detail.tsx");
    const chart = source("components/verdict-call-chart.tsx");

    expect(detail).not.toContain("findNearestTechnicalLevels");
    expect(detail).toContain("technicalLevels?.source");
    expect(detail).toContain("technicalLevels?.as_of");
    expect(chart).toContain("Nearest support");
    expect(chart).toContain("Nearest resistance");
    expect(chart).toContain("technicalLevels?.source");
    expect(chart).not.toContain("{technicalLevels?.source} · {technicalLevels?.as_of}");
  });

  it("uses distinct financial-series colors and reserves red for losses", () => {
    const depth = source("components/stock-financial-depth.tsx");

    expect(depth).toContain('gross: "#2563eb"');
    expect(depth).toContain('operating: "#d97706"');
    expect(depth).toContain('net: "#059669"');
    expect(depth).toContain('negative: "#dc2626"');
    expect(depth).not.toContain('color: "#34d399"');
    expect(depth).not.toContain('color: "#047857"');
  });

  it("overlays a trend line on single-series financial bars", () => {
    const depth = source("components/stock-financial-depth.tsx");

    expect(depth).toContain("ComposedChart");
    expect(depth).toContain("series.length === 1");
    expect(depth).toContain('tooltipType="none"');
    expect(depth).toContain(">Trend</span>");
  });

  it("makes the signed-out Watchlist unmistakably sample data", () => {
    const states = source("components/radar-next/states.tsx");

    expect(states).toContain("Watchlist preview");
    expect(states).toContain("Sample data");
    expect(states).toContain("opacity-70");
    expect(states).not.toContain("blur-[3px]");
    expect(states).toContain("Build your Watchlist");
    expect(states).toContain("Build my Watchlist");
    expect(states).not.toContain("This is not your Watchlist");
  });
});
