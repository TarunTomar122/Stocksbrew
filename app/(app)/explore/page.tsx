import { capitalize, dayWords, onDayWords } from "@/lib/day-words";
import type { Metadata } from "next";
import { Suspense } from "react";

import { loadDeskMarketsData, loadDeskMovers, loadDeskSectors, todayET, type DeskData, type DeskSector } from "@/app/(app)/explore/desk-data";
import { MarketCardsGhost, MovesGhost, StripGhost } from "@/app/(app)/explore/ghosts";
import { MoveTables, type MoveRow } from "@/app/(app)/explore/move-tables";
import { hasMarketsData } from "@/components/markets/overview-sections";
import { MarketCards } from "@/components/markets/market-cards";
import { MarketTickerStrip } from "@/components/markets/widgets";
import { AppPage, FOCUS, PageHead, Panel, fmtDay } from "@/components/oa/kit";
import { staleMoveClock } from "@/lib/move-clock";
import { pricedAt } from "@/lib/quote-time";
import { longDay, moversDayHref } from "@/lib/seo/families";
import { getRecentMoves } from "@/lib/seo/family-data";
import { unTitle } from "@/components/briefing/card-words";
import { SectorHeatmap } from "@/components/markets/sector-heatmap";
import { PanelGhost } from "@/components/oa/kit/skeleton";
import { NavIcon } from "@/components/oa/nav-icon";
import { iconFor } from "@/components/oa/nav-items";
import { buildMarketsOverview, type MarketsData } from "@/lib/markets-shared";
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
 * Every sector's day as a heatmap, best first (components/markets/sector-heatmap.tsx), each tile opening its sector.
 */
function SectorList({ rows }: { rows: DeskSector[] }) {
  const sorted = [...rows].filter((row) => Number.isFinite(row.day)).sort((a, b) => b.day - a.day);
  if (sorted.length < 4) return null;
  return (
    <section aria-labelledby="sectors-today">
      <h2 id="sectors-today" className="px-2 pb-2 text-[17px] font-medium tracking-tight text-oa-fg sm:px-3">
        How each sector did today
      </h2>
      <SectorHeatmap rows={sorted} />
    </section>
  );
}

/**
 * The day's moves, without the few whose quote stopped hours before the close (thinly traded warrants, mostly; see
 * lib/move-clock.ts), and the day they are from. Today's moves sit under the tables' one clock, so they carry no time
 * of their own (owner: one as-of clock per page); a quote left from the morning would be dated wrong by it, so it is
 * left out rather than explained in a footnote. Moves from another day say that day over the list instead.
 */
function sessionMoves(
  movers: DeskData["movers"],
  today: string,
  now: number,
): { rows: DeskData["movers"]["up"]; day: string | null; dropped: string[]; clock: string | null } {
  const rows = [...movers.up, ...movers.down];
  const day = movers.day;
  if (!day || day !== today) return { rows, day: day ?? null, dropped: [], clock: null };
  const fresh = rows.filter((row) => !staleMoveClock(row.priceAsOf, now));
  // Never empty the list over quote times: with nothing fresh the moves still show, with their own time over them,
  // so a morning quote is never read as the close.
  if (fresh.length === 0) {
    const at = pricedAt(rows.map((row) => row.priceAsOf), day);
    return { rows, day, dropped: [], clock: at ? `As of ${at}` : null };
  }
  return { rows: fresh, day, dropped: rows.filter((row) => !fresh.includes(row)).map((row) => row.ticker), clock: null };
}

/**
 * The day's unusual stock moves as two tables, gainers beside losers (./move-tables.tsx). Each row carries the reason
 * when a source confirmed one (lib/reason-quality: nothing is written when none was, and a sentence that only says the
 * move again is no reason), else its measured price fact once `facts` are in ("Its biggest gain since Sep 9"), else
 * nothing. Every move priced in the session shows, from the same live quotes the briefing and the home page use, with
 * one quiet time over the tables. Older days are a row of links to their own pages under it.
 */
function StockMoves({ movers, today }: { movers: DeskData["movers"]; today: string }) {
  const session = sessionMoves(movers, today, Date.now());
  // Only moves with a confirmed reason (owner, Nov 12: "don't show stocks that don't have a reason, skip them"). A
  // measured price fact ("Its biggest drop since Feb 12", "A normal day moves it about 5%") is not a reason.
  const reasoned = session.rows.filter((row) => Boolean(row.reason));
  if (reasoned.length === 0) return null;
  const toRow = (row: DeskData["movers"]["up"][number]): MoveRow => ({
    ticker: row.ticker,
    name: row.name,
    changePct: row.changePct,
    price: row.price,
    line: unTitle(row.reason!, row.name),
  });
  const up = reasoned.filter((row) => row.changePct > 0).sort((a, b) => b.changePct - a.changePct).map(toRow);
  const down = reasoned.filter((row) => row.changePct < 0).sort((a, b) => a.changePct - b.changePct).map(toRow);
  // One quiet time over the tables: the day for moves from an earlier session, else when today's quotes are from.
  const clock =
    session.day && session.day !== today
      ? fmtDay(session.day)
      : (session.clock ?? (session.day ? (() => { const at = pricedAt(session.rows.map((row) => row.priceAsOf), session.day!); return at ? `As of ${at}` : null; })() : null));
  // The takeaway was written over every move: it is left out when it names one the tables no longer show (a stale
  // quote), and when it runs past one short line (owner rule 8).
  const takeaway =
    movers.takeaway &&
    movers.takeaway.split(/\s+/).length <= 15 &&
    !session.dropped.some((ticker) => new RegExp(`(?<![A-Z0-9.])${ticker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Z0-9])`).test(movers.takeaway!))
      ? movers.takeaway
      : null;
  // "today" only for today's moves: before the open, or on a weekend, they are the last session's.
  const when = movers.day && movers.day !== today ? onDayWords(movers.day, today) : "today";
  return (
    <>
      <div className="flex items-baseline justify-between gap-3 px-2 pb-1 sm:px-3">
        <h2 id="stock-moves" className="text-[17px] font-medium tracking-tight text-oa-fg">
          Biggest stock moves
        </h2>
        {clock ? <span className="oa-mono shrink-0 text-[12.5px] tabular-nums text-oa-muted-fg">{clock}</span> : null}
      </div>
      {/* With one move the takeaway only repeats it ("AIRJW moved most, −11.8%"); it says something once there are several. */}
      {takeaway && session.rows.length > 1 ? <p className="text-pretty px-2 pb-2 text-[14px] leading-5 text-oa-muted-fg sm:px-3">{takeaway}</p> : null}
      <MoveTables up={up} down={down} when={when} />
    </>
  );
}

/**
 * Earlier days of big moves, each opening its own page (/movers/2026-11-10: the reason and sources for every move).
 * One line of dated links under the moves, only days before the moves' own day (the archive's dated documents can
 * run a day ahead after 7 PM New York time). With no moves above, it carries its own heading.
 */
async function EarlierDays({ movers, today, titled }: { movers: DeskData["movers"]; today: string; titled: boolean }) {
  const moves = await getRecentMoves().catch(() => []);
  const before = movers.day ?? today;
  const counts = new Map<string, number>();
  for (const move of moves) if (move.day < before) counts.set(move.day, (counts.get(move.day) ?? 0) + 1);
  const days = [...counts.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 8);
  if (days.length === 0) return null;
  const Label = titled ? "h2" : "span";
  return (
    <nav aria-labelledby="earlier-days" className="mt-3 flex items-center gap-2 overflow-x-auto px-2 scrollbar-hide sm:px-3">
      <Label id="earlier-days" className={titled ? "shrink-0 text-[17px] font-medium tracking-tight text-oa-fg" : "shrink-0 text-[13px] text-oa-muted-fg"}>
        {titled ? "Big moves on earlier days" : "Earlier days"}
      </Label>
      {days.map(([day, count]) => (
        <Link
          key={day}
          prefetch={false}
          href={moversDayHref(day)}
          aria-label={`${longDay(day)}: ${count} explained ${count === 1 ? "move" : "moves"}`}
          className={`oa-mono inline-flex h-8 shrink-0 items-center rounded border border-oa-border bg-oa-card px-2.5 text-[12.5px] tabular-nums text-oa-fg hover:bg-oa-accent ${FOCUS}`}
        >
          {capitalize(dayWords(day, today))}
        </Link>
      ))}
    </nav>
  );
}

/** The cross-asset strip (indices, yields, oil, gold, the dollar, bitcoin), or nothing when prices are missing. */
async function StripSlot({ markets }: { markets: Promise<MarketsData> }) {
  const data = await markets;
  return hasMarketsData(data) ? <MarketTickerStrip tiles={buildMarketsOverview(data).tiles} /> : null;
}

/**
 * The day's moves, in their own slot so they arrive as soon as the movers loader answers. "#moves" is where /movers,
 * the old Signals movers tab and the home page's "See every move today" land; the ghost holds the same id meanwhile.
 * On a day with no moves at all the section is not drawn, and the earlier days stand on their own.
 */
async function MovesSlot({ movers, today }: { movers: Promise<DeskData["movers"]>; today: string }) {
  const data = await movers;
  // Only reasoned moves are drawn, so "any" counts those.
  const any = [...data.up, ...data.down].some((row) => Boolean(row.reason));
  return (
    // With no moves the section has no heading of its own (the earlier days' row names itself), so it is not labelled.
    <section id="moves" aria-labelledby={any ? "stock-moves" : undefined} className="scroll-mt-20">
      <StockMoves movers={data} today={today} />
      <Suspense fallback={null}>
        <EarlierDays movers={data} today={today} titled={!any} />
      </Suspense>
    </section>
  );
}

/** Every sector's day, under the moves. */
async function SectorsSlot({ sectors }: { sectors: ReturnType<typeof loadDeskSectors> }) {
  const data = await sectors;
  return <SectorList rows={data.rows} />;
}

/** A card for each other part of the market, or one line when the prices are not there. */
async function MoreMarketsSlot({ markets }: { markets: Promise<MarketsData> }) {
  const data = await markets;
  if (!hasMarketsData(data)) {
    return (
      <Panel>
        <p className="text-[15px] font-medium text-oa-fg">Prices for indices, rates, commodities, currencies and crypto are not available right now.</p>
        <p className="mt-1 text-[14px] text-oa-muted-fg">Try again in a few minutes.</p>
      </Panel>
    );
  }
  // One card per part of the market, each opening its part of /markets (components/markets/market-cards.tsx).
  return <MarketCards data={data} className="mt-4" />;
}

/** The places that go deeper on today, as one short strip with each place's own icon. */
const MORE_ON_TODAY: { href: string; title: string }[] = [
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
 * Market today: the market's day (Why stocks moved was folded in on Nov 11; /movers redirects to #moves). The
 * cross-asset strip first; then every stock move of the day as gainers and losers, with its confirmed reason and one
 * time over the tables, and links to earlier days; then every sector as a heatmap; then a card for
 * every other part of the market; then a short strip of places that go deeper. The head needs no data, so it is on
 * screen at once; each section waits only for its own loader.
 */
export default function ExplorePage() {
  const today = todayET(new Date());
  const sectors = loadDeskSectors(today);
  const movers = loadDeskMovers(today);
  const markets = loadDeskMarketsData();

  return (
    <AppPage>
      <JsonLd data={toolPageLd("/explore")} />
      <PageHead title="Market today" />

      <div className="flex flex-col gap-4">
        <Suspense fallback={<StripGhost />}>
          <StripSlot markets={markets} />
        </Suspense>

        <Suspense fallback={<MovesGhost />}>
          <MovesSlot movers={movers} today={today} />
        </Suspense>

        <Suspense fallback={<PanelGhost rows={3} />}>
          <SectorsSlot sectors={sectors} />
        </Suspense>

        <Suspense fallback={<MarketCardsGhost className="mt-4" />}>
          <MoreMarketsSlot markets={markets} />
        </Suspense>

        <MoreOnToday />
      </div>
    </AppPage>
  );
}
