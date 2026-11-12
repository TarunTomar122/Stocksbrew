import type { Metadata } from "next";
import { Suspense } from "react";

import { loadDeskBrief, loadDeskMarketsData, loadDeskMovers, loadDeskSectors, loadDeskWire, loadMoveFacts, todayET, type DeskBrief, type DeskData, type DeskSector } from "@/app/(app)/explore/desk-data";
import { MarketCardsGhost, MovesGhost, StripGhost } from "@/app/(app)/explore/ghosts";
import { hasMarketsData } from "@/components/markets/overview-sections";
import { MarketCards } from "@/components/markets/market-cards";
import { MarketTickerStrip } from "@/components/markets/widgets";
import { TheRead } from "@/components/oa/insight";
import { AppPage, Delta, FOCUS, PageHead, Panel, fmtDay } from "@/components/oa/kit";
import { signedPct } from "@/components/briefing/format";
import { staleMoveClock } from "@/lib/move-clock";
import { pricedAt } from "@/lib/quote-time";
import { longDay, moversDayHref } from "@/lib/seo/families";
import { getRecentMoves } from "@/lib/seo/family-data";
import { unTitle } from "@/components/briefing/card-words";
import { StockCard, StockCardGrid, StockChip, StockChipRow, stockGridFill } from "@/components/briefing/stock-card";
import { PanelGhost } from "@/components/oa/kit/skeleton";
import { NavIcon } from "@/components/oa/nav-icon";
import { iconFor } from "@/components/oa/nav-items";
import { marketTodayRead } from "@/lib/explore-insights";
import { marketTodaySteps } from "@/lib/next-steps";
import { buildMarketsOverview, type MarketsData } from "@/lib/markets-shared";
import { JsonLd } from "@/components/docs/json-ld";
import { toolPageLd, toolPageMetadata } from "@/lib/seo/tool-pages";
import Link from "next/link";
import { AppLink } from "@/components/oa/app-link";
import { WholeRows } from "@/components/wire/whole-rows";

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
  // Every point shows, on a phone too: there are at most three, and none waits behind a button (owner rule 2).
  // The cards in a row end level (owner rule 3), each filled with its own next step (a report to watch, what analysts
  // expect, our call) rather than padding (owner rule 4).
  return <TheRead read={shown} label="Today's read" />;
}

/**
 * Every sector's day, best first: the list behind "6 of 11 sectors rose". The number alone says how far each
 * moved (no bar beside it: owner rule 5). Each row opens its sector. One column on a phone (about eight rows,
 * the rest scroll inside), two from sm, three on a wide screen.
 */
function SectorList({ rows }: { rows: DeskSector[] }) {
  const sorted = [...rows].filter((row) => Number.isFinite(row.day)).sort((a, b) => b.day - a.day);
  if (sorted.length < 4) return null;
  return (
    <Panel label="How each sector did today" right={<Link prefetch={false} href="/sectors" className={`text-[13px] font-medium text-oa-fg underline decoration-oa-border underline-offset-2 hover:decoration-oa-fg ${FOCUS}`}>All sectors</Link>}>
      <ul className="gap-x-8 max-sm:max-h-[16.25rem] max-sm:overflow-y-auto max-sm:scrollbar-hide sm:columns-2 lg:columns-3">
        {sorted.map((row) => (
          <li key={row.id} className="break-inside-avoid">
            <Link
              prefetch={false}
              href={row.slug ? `/sectors/${row.slug}` : "/sectors"}
              className={`flex min-h-8 items-center justify-between gap-3 rounded px-1 text-[13.5px] leading-5 hover:bg-oa-accent ${FOCUS}`}
            >
              <span className="min-w-0 text-pretty text-oa-fg">{row.name}</span>
              <Delta value={row.day} className="shrink-0 text-right font-medium" />
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/**
 * The day's moves, without the few whose quote stopped hours before the close (thinly traded warrants, mostly; see
 * lib/move-clock.ts), and the day they are from. Today's moves sit under the read's one clock, so they carry no time
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
 * The day's unusual stock moves (owner rule 3): the logo and ticker, the move as the one big figure, and the reason
 * when a source confirmed one (lib/reason-quality: nothing is written when none was, and a sentence that only says the
 * move again is no reason). Moves with a reason are cards, largest first; the rest are chips under them, so no card is
 * left with only a figure. This is the one list of the day's moves: every move priced in the session shows (cards and
 * chips each scroll inside after a few whole rows), from the same live quotes the briefing and the home page use, under
 * the read's one clock. Older days are a row of links to their own pages under it.
 *
 * With `facts` (one measured price fact per move with no reason, `loadMoveFacts`), those moves are cards too, after
 * the ones with a reason, each with its own fact ("Its biggest gain since Sep 9"), and a move with no fact is left out
 * rather than shown as a ticker and a figure alone. Without them (still loading, or none came back) they stay chips.
 */
function StockMoves({ movers, today, facts = null }: { movers: DeskData["movers"]; today: string; facts?: Record<string, string> | null }) {
  const session = sessionMoves(movers, today, Date.now());
  const rows = [...session.rows].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
  const told = rows.filter((row) => row.reason);
  const factual = facts ? rows.filter((row) => !row.reason && facts[row.ticker]) : [];
  const bare = facts ? [] : rows.filter((row) => !row.reason);
  // Reasons first, then the moves we can only measure: one list of cards, every one with something to read.
  const cards = [
    ...told.map((row) => ({ row, sentence: unTitle(row.reason!, row.name) })),
    ...factual.map((row) => ({ row, sentence: `${facts![row.ticker]}.` })),
  ];
  if (rows.length === 0) return null;
  // Only moves from an earlier day name it, or today's when every quote stopped early; the rest sit under the read's clock.
  const clock = session.day && session.day !== today ? fmtDay(session.day) : session.clock;
  // The takeaway was written over every move: it is left out when it names one the list no longer shows (a stale
  // quote, or a move with no reason and no price fact once the facts are in).
  const hidden = [...session.dropped, ...(facts ? rows.filter((row) => !row.reason && !facts[row.ticker]).map((row) => row.ticker) : [])];
  const takeaway =
    movers.takeaway && !hidden.some((ticker) => new RegExp(`(?<![A-Z0-9.])${ticker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Z0-9])`).test(movers.takeaway!))
      ? movers.takeaway
      : null;
  // "today" only for today's moves: before the open, or on a weekend, they are the last session's.
  const when = movers.day && movers.day !== today ? `on ${fmtDay(movers.day)}` : "today";
  return (
    <>
      <div className="flex items-baseline justify-between gap-3 px-2 pb-1 sm:px-3">
        <h2 id="stock-moves" className="text-[17px] font-medium tracking-tight text-oa-fg">
          {/* Cards carry a confirmed reason or a measured price fact, so the heading promises the moves, not a why for each. */}
          Biggest stock moves
        </h2>
        {clock ? <span className="oa-mono shrink-0 text-[12.5px] tabular-nums text-oa-muted-fg">{clock}</span> : null}
      </div>
      {/* With one move the takeaway only repeats it ("AIRJW moved most, −11.8%"); it says something once there are several. */}
      {takeaway && rows.length > 1 ? <p className="text-pretty px-2 pb-2 text-[14px] leading-5 text-oa-muted-fg sm:px-3">{takeaway}</p> : null}
      {cards.length > 0 ? (
        // About eight cards in view (owner rule 5: never cut to four or five), then they scroll inside (no bar shown)
        // in a box that ends on a whole row, its bottom edge fading while more cards wait below: eight one-card rows on
        // a phone, three rows of three on a wide screen. The phone's box is about a screen tall, so its scroll hands
        // over to the page at either end and can never trap a thumb inside it.
        <WholeRows rem={58} wideRem={24} cue className="max-h-[58rem] overflow-y-auto scrollbar-hide sm:max-h-[24rem]">
          <StockCardGrid wide>
            {cards.map(({ row, sentence }, index) => (
              <StockCard
                key={row.ticker}
                ticker={row.ticker}
                name={row.name || row.ticker}
                figure={signedPct(row.changePct, 1)}
                tone={row.changePct >= 0 ? "up" : "down"}
                sentence={sentence}
                fill={stockGridFill(index, cards.length, true)}
                cover={
                  <Link
                    href={`/stock/${encodeURIComponent(row.ticker)}`}
                    prefetch={false}
                    aria-label={`${row.ticker}, ${signedPct(row.changePct, 1)} ${when}`}
                    className="absolute inset-0 z-0 rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
                  />
                }
              />
            ))}
          </StockCardGrid>
        </WholeRows>
      ) : null}
      {/* Moves with no reason we could confirm: a chip each, not an empty card (owner rules 4 and 7). Three whole rows of
          chips, the rest scrolling inside. */}
      {bare.length > 0 ? (
        <WholeRows rem={8.5} className={`max-h-[8.5rem] overflow-y-auto scrollbar-hide ${told.length > 0 ? "mt-3" : ""}`}>
          <StockChipRow label={told.length > 0 ? "Also moved" : "Biggest stock moves"}>
            {bare.map((row) => (
              <StockChip
                key={row.ticker}
                ticker={row.ticker}
                name={row.name}
                figure={signedPct(row.changePct, 1)}
                tone={row.changePct >= 0 ? "up" : "down"}
                label={`${row.ticker}, ${signedPct(row.changePct, 1)} ${when}`}
              />
            ))}
          </StockChipRow>
        </WholeRows>
      ) : null}
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
          {fmtDay(day)}
        </Link>
      ))}
    </nav>
  );
}

/**
 * What the read on top already says, as one string, so the cards under it can skip a figure it quotes (the read
 * leads with "GDX fell 5.43%"; More markets then leads with the next biggest move instead).
 */
function readWords(read: DeskBrief["read"]): string {
  if (!read) return "";
  return [read.headline, ...read.insights.flatMap((insight) => [insight.text, insight.soWhat, insight.figure?.label, insight.figure?.value])]
    .filter(Boolean)
    .join(" \n ");
}

/**
 * "More markets": one card per part of the market. Its own async slot, so only these cards wait for the read's
 * words (to skip a move the read already quotes); the strip, the stock cards and the sectors above never do.
 */
async function MoreMarkets({ data, brief }: { data: MarketsData; brief: Promise<DeskBrief> }) {
  // The brief is the read's own cached loader, already in flight for the slot above; a failure only means no skipping.
  const said = await brief.then((value) => readWords(value.read)).catch(() => "");
  // One card per part of the market, each opening its part of /markets (components/markets/market-cards.tsx).
  return <MarketCards data={data} said={said} className="mt-2" />;
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
  const any = data.up.length + data.down.length > 0;
  return (
    // With no moves the section has no heading of its own (the earlier days' row names itself), so it is not labelled.
    <section id="moves" aria-labelledby={any ? "stock-moves" : undefined} className="scroll-mt-20">
      {/* The moves show at once, those with no reason as chips; their price facts follow, turning them into cards. */}
      <Suspense fallback={<StockMoves movers={data} today={today} />}>
        <MovesWithFacts movers={data} today={today} />
      </Suspense>
      <Suspense fallback={null}>
        <EarlierDays movers={data} today={today} titled={!any} />
      </Suspense>
    </section>
  );
}

/** The moves once the price facts for those with no confirmed reason are in (or have run out of time). */
async function MovesWithFacts({ movers, today }: { movers: DeskData["movers"]; today: string }) {
  const session = sessionMoves(movers, today, Date.now());
  const bare = session.rows.filter((row) => !row.reason).sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct));
  const facts = bare.length ? await loadMoveFacts(bare, session.day ?? today).catch(() => null) : null;
  return <StockMoves movers={movers} today={today} facts={facts} />;
}

/** Every sector's day, under the moves. */
async function SectorsSlot({ sectors }: { sectors: ReturnType<typeof loadDeskSectors> }) {
  const data = await sectors;
  return <SectorList rows={data.rows} />;
}

/** A card for each other part of the market, or one line when the prices are not there. */
async function MoreMarketsSlot({ markets, brief }: { markets: Promise<MarketsData>; brief: Promise<DeskBrief> }) {
  const data = await markets;
  if (!hasMarketsData(data)) {
    return (
      <Panel>
        <p className="text-[15px] font-medium text-oa-fg">Prices for indices, rates, commodities, currencies and crypto are not available right now.</p>
        <p className="mt-1 text-[14px] text-oa-muted-fg">Try again in a few minutes.</p>
      </Panel>
    );
  }
  return (
    <section aria-labelledby="more-markets" className="mt-4">
      <h2 id="more-markets" className="px-2 pb-1 text-[17px] font-medium tracking-tight text-oa-fg sm:px-3">
        More markets
      </h2>
      <Suspense fallback={<MarketCardsGhost className="mt-2" />}>
        <MoreMarkets data={data} brief={brief} />
      </Suspense>
    </section>
  );
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
 * Market today: the one read of the market's day (Why stocks moved was folded in on Nov 11; /movers redirects to
 * #moves). The read in three ranked points leads; then the cross-asset strip; then every stock move of the day with
 * its confirmed reason and one time over the list, with links to earlier days; then every sector; then a card for
 * every other part of the market; then a short strip of places that go deeper. The head needs no data, so it is on
 * screen at once; each section waits only for its own loader.
 */
export default function ExplorePage() {
  const today = todayET(new Date());
  const brief = loadDeskBrief(today);
  const wire = loadDeskWire(today);
  const sectors = loadDeskSectors(today);
  const movers = loadDeskMovers(today);
  const markets = loadDeskMarketsData();

  return (
    <AppPage>
      <JsonLd data={toolPageLd("/explore")} />
      <PageHead title="Market today" />

      <div className="flex flex-col gap-4">
        <Suspense fallback={<PanelGhost rows={3} lines={2} />}>
          <ReadSlot brief={brief} wire={wire} sectors={sectors} />
        </Suspense>

        <Suspense fallback={<StripGhost />}>
          <StripSlot markets={markets} />
        </Suspense>

        <Suspense fallback={<MovesGhost />}>
          <MovesSlot movers={movers} today={today} />
        </Suspense>

        <Suspense fallback={<PanelGhost rows={4} />}>
          <SectorsSlot sectors={sectors} />
        </Suspense>

        <Suspense fallback={<MarketCardsGhost className="mt-2" />}>
          <MoreMarketsSlot markets={markets} brief={brief} />
        </Suspense>

        <MoreOnToday />
      </div>
    </AppPage>
  );
}
