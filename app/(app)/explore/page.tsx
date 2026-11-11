import type { Metadata } from "next";
import { Suspense } from "react";

import { loadDeskBrief, loadDeskSectors, loadDeskWire, todayET, type DeskBrief, type DeskData, type DeskSector } from "@/app/(app)/explore/desk-data";
import { TheRead } from "@/components/oa/insight";
import { marketTodayRead } from "@/lib/explore-insights";
import { AppPage, Delta, FOCUS, PageHead, Panel } from "@/components/oa/kit";
import { Bar, PanelGhost } from "@/components/oa/kit/skeleton";
import { ogImage } from "@/lib/og/url";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  const shareImage = ogImage(["page", "explore"], "Today's read of the US stock market", { daily: true });
  return {
    title: "Stock Research Today: Top Stories, Movers and Ideas",
    description:
      "Today's US stock market in three points, how every sector did, and every research page one tap away: sectors, movers, headlines, earnings, investors and markets.",
    keywords: ["stock research", "stock screener", "market movers today", "earnings today", "investment themes", "13F filings", "insider trades"],
    alternates: { canonical: "/explore" },
    openGraph: {
      title: "Stock Research Today: Top Stories, Movers and Ideas · stocksbrew",
      description: "Today's US stock market in three points, with the source and time on every number.",
      url: "https://www.stocksbrew.online/explore",
      images: [shareImage],
    },
    twitter: {
      card: "summary_large_image",
      title: "Explore · stocksbrew",
      description: "Today's US stock market in three points, with the source and time on every number.",
      images: [shareImage],
    },
  };
}

/* ── the page ───────────────────────────────────────────────────────────── */

/**
 * The day in three ranked points (the biggest companies, the sector that moved most, the earnings that matter
 * this week), then how every sector did as a named bar chart. The news read's tone lines ("40% of
 * headlines read as good news") are left out: they say what the coverage felt like, not what to do with it.
 * The news read is only the fallback when the desk's own read is missing.
 */
async function ReadSlot({
  brief,
  wire,
  sectors,
}: {
  brief: Promise<DeskBrief>;
  wire: Promise<DeskData["wire"]>;
  sectors: ReturnType<typeof loadDeskSectors>;
}) {
  const [{ read }, sectorData] = await Promise.all([brief, sectors]);
  // The news read is only waited on when the brief has nothing.
  const news = read && (read.headline || read.insights.length > 0) ? null : await wire.then((data) => data.read).catch(() => null);
  const shown = marketTodayRead(read, news, sectorData.takeaway);
  // The three points first; how every sector did comes right after, as the picture behind the headline.
  return (
    <>
      {shown ? <TheRead read={shown} label="Today's read" className="mb-4" /> : null}
      <SectorBars rows={sectorData.rows} />
    </>
  );
}

/** Every sector's day as a named bar, best first: the picture behind "6 of 11 sectors rose". Each opens its sector. */
function SectorBars({ rows }: { rows: DeskSector[] }) {
  const sorted = [...rows].filter((row) => Number.isFinite(row.day)).sort((a, b) => b.day - a.day);
  if (sorted.length < 4) return null;
  const max = Math.max(0.5, ...sorted.map((row) => Math.abs(row.day)));
  return (
    <Panel label="How each sector did today" right={<a href="/sectors" className={`text-[13px] font-medium text-oa-fg underline decoration-oa-border underline-offset-2 hover:decoration-oa-fg ${FOCUS}`}>All sectors</a>} className="mb-5">
      <ul className="grid gap-x-8 sm:grid-cols-2">
        {sorted.map((row) => {
          const width = Math.max(3, (Math.abs(row.day) / max) * 100);
          const up = row.day >= 0;
          return (
            <li key={row.id}>
              <a
                href={row.slug ? `/sectors/${row.slug}` : "/sectors"}
                className={`grid min-h-8 grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_4rem] sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_4.25rem] items-center gap-x-3 rounded text-[13.5px] leading-5 hover:bg-oa-accent ${FOCUS}`}
              >
                <span className="text-pretty text-oa-fg">{row.name}</span>
                {/* Zero in the middle: gains grow right, losses grow left, so the sign reads at a glance. */}
                <span className="relative h-2" aria-hidden="true">
                  <span className="absolute inset-y-0 left-1/2 w-px bg-oa-border" />
                  <span
                    className={`absolute inset-y-0 rounded-sm ${up ? "left-1/2 bg-signal-bullish" : "right-1/2 bg-signal-bearish"}`}
                    style={{ width: `${width / 2}%` }}
                  />
                </span>
                <Delta value={row.day} className="text-right font-medium" />
              </a>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/** Everything else on the desk, one plain line each. The lines with a live figure read it; the rest say what is there. */
async function Directory({ brief, sectors }: { brief: Promise<DeskBrief>; sectors: ReturnType<typeof loadDeskSectors> }) {
  const [{ calendarLine }, sectorData] = await Promise.all([brief, sectors]);
  const entries: { href: string; title: string; line: string }[] = [
    { href: "/sectors", title: "Sectors", line: sectorData.takeaway ?? "How each of the 11 sectors did, and the stocks that led and lagged in each." },
    { href: "/movers", title: "Why stocks moved", line: "The day's biggest moves, with the reason when we could confirm one." },
    { href: "/news", title: "Headlines", line: "The day's stories about companies, grouped by stock." },
    { href: "/calendar", title: "Calendar", line: calendarLine ?? "Who reports earnings this week, and the economic reports that move the market." },
    { href: "/screener", title: "Find stocks", line: "Ready-made lists, like the biggest companies or the cheapest against their own past, or your own filters." },
    { href: "/themes", title: "Themes", line: "Groups of companies betting on one idea, like data centers or defense, and how each group is doing." },
    { href: "/signals", title: "Signals", line: "What people on Reddit and in the news are saying about stocks, and whether prices agree." },
    { href: "/follow", title: "Investors", line: "What big funds, members of Congress and company insiders bought and sold." },
    { href: "/strategies", title: "Strategies", line: "Simple buying rules tested on years of real prices." },
    { href: "/markets", title: "Markets", line: "Gold, oil, government bonds, the dollar and bitcoin, and how each moved today." },
    { href: "/ask", title: "Ask", line: "Ask a question about any stock or idea, in your own words." },
  ];
  return (
    <Panel label="More on today's market" flush>
      <ul className="grid sm:grid-cols-2 sm:divide-x sm:divide-oa-border">
        {[entries.slice(0, Math.ceil(entries.length / 2)), entries.slice(Math.ceil(entries.length / 2))].map((column, index) => (
          <li key={index} className="min-w-0 max-sm:border-t max-sm:border-oa-border max-sm:first:border-t-0">
            <ul>
              {column.map((entry) => (
                <li key={entry.href} className="border-b border-oa-border last:border-b-0">
                  <a href={entry.href} className={`group flex items-start justify-between gap-3 px-4 py-3 transition-colors hover:bg-oa-accent ${FOCUS}`}>
                    <span className="min-w-0">
                      <span className="block text-[15px] font-medium leading-6 text-oa-fg">{entry.title}</span>
                      <span className="block text-pretty text-[14px] leading-5 text-oa-muted-fg">{entry.line}</span>
                    </span>
                    <span aria-hidden="true" className="mt-0.5 shrink-0 text-oa-muted-fg transition-transform group-hover:translate-x-0.5">
                      →
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** The directory's shape while its live lines load. */
function DirectoryGhost() {
  return (
    <div className="oa-surface grid gap-4 border border-oa-border bg-oa-card p-4 sm:grid-cols-2" aria-busy="true">
      {Array.from({ length: 11 }, (_, index) => (
        <div key={index}>
          <Bar className="h-4 w-28" />
          <Bar className="mt-2 h-3.5 w-full" />
        </div>
      ))}
    </div>
  );
}

/**
 * Market today: the day's read in three ranked points, how every sector did, then a directory of
 * the rest. The head needs no data, so it is on screen at once; each part waits only for its own loader.
 */
export default function ExplorePage() {
  const today = todayET(new Date());
  const brief = loadDeskBrief(today);
  const wire = loadDeskWire(today);
  const sectors = loadDeskSectors(today);

  return (
    <AppPage>
      <PageHead title="Market today" />

      <Suspense fallback={<div className="mb-5"><PanelGhost rows={3} lines={2} /></div>}>
        <ReadSlot brief={brief} wire={wire} sectors={sectors} />
      </Suspense>

      <Suspense fallback={<DirectoryGhost />}>
        <Directory brief={brief} sectors={sectors} />
      </Suspense>
    </AppPage>
  );
}
