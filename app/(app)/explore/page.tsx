import type { Metadata } from "next";
import { Suspense } from "react";

import { loadDeskBrief, loadDeskMarketsData, loadDeskMovers, loadDeskSectors, loadDeskWire, todayET, type DeskBrief, type DeskData, type DeskSector } from "@/app/(app)/explore/desk-data";
import { MarketsGhost } from "@/app/(app)/explore/ghosts";
import { hasMarketsData } from "@/components/markets/overview-sections";
import { MarketCards } from "@/components/markets/market-cards";
import { MarketTickerStrip } from "@/components/markets/widgets";
import { TheRead } from "@/components/oa/insight";
import { AppPage, CardGrid, Delta, FOCUS, PageHead, Panel, Ticker } from "@/components/oa/kit";
import { PanelGhost } from "@/components/oa/kit/skeleton";
import { NavIcon } from "@/components/oa/nav-icon";
import { iconFor } from "@/components/oa/nav-items";
import { marketTodayRead } from "@/lib/explore-insights";
import { marketTodaySteps } from "@/lib/next-steps";
import { buildMarketsOverview } from "@/lib/markets-shared";
import { JsonLd } from "@/components/docs/json-ld";
import { toolPageLd, toolPageMetadata } from "@/lib/seo/tool-pages";
import Link from "next/link";
import { AppLink } from "@/components/oa/app-link";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return toolPageMetadata("/explore");
}

/* ── the page ───────────────────────────────────────────────────────────── */

/**
 * The day in three ranked points (the biggest companies, the sector that moved most, the earnings that matter
 * this week). The news read's tone lines ("40% of headlines read as good news") are left out: they say what
 * the coverage felt like, not what to do with it. The news read is only the fallback when the desk's own
 * read is missing.
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
  const { read } = await brief;
  // The news read and the sector line are only waited on when the brief has nothing.
  const [news, sectorLine] =
    read && (read.headline || read.insights.length > 0)
      ? [null, null]
      : await Promise.all([wire.then((data) => data.read).catch(() => null), sectors.then((data) => data.takeaway).catch(() => null)]);
  // The top development asks the reader's next question: "Does this affect my stocks?" (lib/next-steps.ts).
  const shown = marketTodaySteps(marketTodayRead(read, news, sectorLine));
  if (!shown) return null;
  // Below lg the headline and the top point stay, so on a phone the cross-asset strip under the read is on the first screen.
  const hidden = shown.insights.length - 1;
  return (
    <TheRead
      read={shown}
      label="Today's read"
      fold="phone"
      foldKeep={1}
      foldLabel={hidden === 1 ? "Show 1 more point" : `Show ${hidden} more points`}
    />
  );
}

/** Every sector's day as a named bar, best first: the picture behind "6 of 11 sectors rose". Each opens its sector. */
function SectorBars({ rows }: { rows: DeskSector[] }) {
  const sorted = [...rows].filter((row) => Number.isFinite(row.day)).sort((a, b) => b.day - a.day);
  if (sorted.length < 4) return null;
  const max = Math.max(0.5, ...sorted.map((row) => Math.abs(row.day)));
  return (
    <Panel fill label="How each sector did today" right={<Link prefetch={false} href="/sectors" className={`text-[13px] font-medium text-oa-fg underline decoration-oa-border underline-offset-2 hover:decoration-oa-fg ${FOCUS}`}>All sectors</Link>}>
      {/* Eleven rows: about eight show on a phone and the rest scroll inside; two columns from sm, one again beside the stock moves. */}
      <ul className="grid gap-x-8 max-sm:max-h-[16.25rem] max-sm:overflow-y-auto max-sm:overscroll-contain scrollbar-hide sm:grid-cols-2 md:grid-cols-1">
        {sorted.map((row) => {
          const width = Math.max(3, (Math.abs(row.day) / max) * 100);
          const up = row.day >= 0;
          return (
            <li key={row.id}>
              <Link prefetch={false}
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
              </Link>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/**
 * The day's biggest stock moves, largest first, each with its reason when a source confirmed one. Rows are the
 * links; rows with a reason run two or three lines, so about six show and the rest scroll inside. Same cached
 * feed the read above is built from.
 */
function StockMoves({ movers }: { movers: DeskData["movers"] }) {
  const rows = [...movers.up, ...movers.down].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
  if (rows.length === 0) return null;
  return (
    <Panel
      fill
      flush
      label="Biggest stock moves"
      right={<AppLink href="/movers" className={`text-[13px] font-medium text-oa-fg underline decoration-oa-border underline-offset-2 hover:decoration-oa-fg ${FOCUS}`}>Why stocks moved</AppLink>}
    >
      {movers.takeaway ? <p className="text-pretty border-b border-oa-border px-4 py-2.5 text-[14px] leading-5 text-oa-fg">{movers.takeaway}</p> : null}
      <ul className="max-h-[25rem] divide-y divide-oa-border overflow-y-auto overscroll-contain scrollbar-hide">
        {rows.map((row) => (
          <li key={row.ticker} className="relative px-4 py-2 hover:bg-oa-accent">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <Ticker symbol={row.ticker} name={row.name} stretch />
              <Delta value={row.changePct} className="shrink-0 font-medium" />
            </div>
            {row.reason ? <p className="mt-0.5 text-pretty pl-7 text-[13.5px] leading-5 text-oa-muted-fg">{row.reason}</p> : null}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/**
 * The lead under the read, in one weight: the cross-asset strip (indices, yields, oil, gold, the dollar, bitcoin),
 * then the biggest stock moves with their reasons beside every sector's day. Everything else the Markets page
 * carries follows in titled sections that open in place, each showing its one-line read while closed.
 */
async function MarketsSlot({ sectors, movers }: { sectors: ReturnType<typeof loadDeskSectors>; movers: Promise<DeskData["movers"]> }) {
  const [data, sectorData, moverData] = await Promise.all([loadDeskMarketsData(), sectors, movers]);
  // Two cards side by side; when one feed is empty the other takes the full width instead of half a row.
  const hasMoves = moverData.up.length + moverData.down.length > 0;
  const hasSectors = sectorData.rows.filter((row) => Number.isFinite(row.day)).length >= 4;
  const lead =
    hasMoves && hasSectors ? (
      <CardGrid className="lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <StockMoves movers={moverData} />
        <SectorBars rows={sectorData.rows} />
      </CardGrid>
    ) : hasMoves ? (
      <StockMoves movers={moverData} />
    ) : hasSectors ? (
      <SectorBars rows={sectorData.rows} />
    ) : null;
  if (!hasMarketsData(data)) {
    return (
      <>
        {lead}
        <Panel>
          <p className="text-[15px] font-medium text-oa-fg">Prices for indices, rates, commodities, currencies and crypto are not available right now.</p>
          <p className="mt-1 text-[14px] text-oa-muted-fg">Try again in a few minutes.</p>
        </Panel>
      </>
    );
  }
  const overview = buildMarketsOverview(data);
  return (
    <>
      <MarketTickerStrip tiles={overview.tiles} />
      {lead}
      <section aria-labelledby="more-markets" className="mt-4">
        <h2 id="more-markets" className="px-2 pb-1 text-[17px] font-medium tracking-tight text-oa-fg sm:px-3">
          More markets
        </h2>
        {/* One card per part of the market, each opening its part of /markets (components/markets/market-cards.tsx). */}
        <MarketCards data={data} className="mt-2" />
      </section>
    </>
  );
}

/** The places that go deeper on today, as one short strip with each place's own icon. */
const MORE_ON_TODAY: { href: string; title: string }[] = [
  { href: "/movers", title: "Why stocks moved" },
  { href: "/news", title: "News" },
  { href: "/calendar", title: "Calendar" },
  { href: "/signals", title: "Signals" },
  { href: "/briefing", title: "Briefing" },
  { href: "/markets", title: "All markets" },
];

function MoreOnToday() {
  return (
    <nav aria-labelledby="more-on-today" className="mt-2">
      <h2 id="more-on-today" className="oa-label mb-2 px-2 sm:px-0">
        More on today
      </h2>
      <ul className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {MORE_ON_TODAY.map((entry) => {
          const icon = iconFor(entry.href);
          return (
            <li key={entry.href}>
              <AppLink
                href={entry.href}
                className={`oa-surface flex min-h-11 items-center gap-2.5 border border-oa-border bg-oa-card px-3 py-2 text-[14px] font-medium text-oa-fg transition-colors hover:bg-oa-accent ${FOCUS}`}
              >
                {icon ? <NavIcon name={icon} className="size-[18px] shrink-0 text-oa-primary" /> : null}
                <span className="min-w-0 sm:whitespace-nowrap">{entry.title}</span>
              </AppLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Market today: how the whole market did. The read in three ranked points leads; then what moved most (the
 * cross-asset strip, the biggest stock moves with their reasons, every sector); then every other market in
 * titled sections that open in place; then a short strip of places that go deeper. The head needs no data, so
 * it is on screen at once; the read and the market sections each wait only for their own loaders.
 */
export default function ExplorePage() {
  const today = todayET(new Date());
  const brief = loadDeskBrief(today);
  const wire = loadDeskWire(today);
  const sectors = loadDeskSectors(today);
  const movers = loadDeskMovers(today);

  return (
    <AppPage>
      <JsonLd data={toolPageLd("/explore")} />
      <PageHead title="Market today" />

      <div className="flex flex-col gap-4">
        <Suspense fallback={<PanelGhost rows={3} lines={2} />}>
          <ReadSlot brief={brief} wire={wire} sectors={sectors} />
        </Suspense>

        <Suspense fallback={<MarketsGhost />}>
          <MarketsSlot sectors={sectors} movers={movers} />
        </Suspense>

        <MoreOnToday />
      </div>
    </AppPage>
  );
}
