import type { Metadata } from "next";
import { Suspense } from "react";

import { loadDeskBrief, loadDeskMarketsData, loadDeskMovers, loadDeskSectors, loadDeskWire, todayET, type DeskBrief, type DeskData, type DeskSector } from "@/app/(app)/explore/desk-data";
import { MarketCardsGhost, MarketsGhost } from "@/app/(app)/explore/ghosts";
import { hasMarketsData } from "@/components/markets/overview-sections";
import { MarketCards } from "@/components/markets/market-cards";
import { MarketTickerStrip } from "@/components/markets/widgets";
import { TheRead } from "@/components/oa/insight";
import { AppPage, Delta, FOCUS, PageHead, Panel } from "@/components/oa/kit";
import { unTitle } from "@/components/briefing/card-words";
import { StockCard, StockCardGrid, stockGridFill } from "@/components/briefing/stock-card";
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
      <ul className="gap-x-8 max-sm:max-h-[16.25rem] max-sm:overflow-y-auto max-sm:overscroll-contain scrollbar-hide sm:columns-2 lg:columns-3">
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
 * The day's biggest stock moves as stock cards (owner rule 3): the logo and ticker, the move as
 * the one big figure, and the reason when a source confirmed one (none is written when it did not). The whole
 * card opens the stock; the one shared action, Why stocks moved, sits in the header. At most ten (the loader
 * keeps five up and five down), so every one shows; on a phone the cards scroll inside after about three.
 */
function StockMoves({ movers }: { movers: DeskData["movers"] }) {
  // Moves with a confirmed reason first, then the ones without (largest first in each), so the cards that only
  // carry a figure sit together instead of beside a full card and leaving half of it empty.
  const rows = [...movers.up, ...movers.down].sort((a, b) => Number(Boolean(b.reason)) - Number(Boolean(a.reason)) || Math.abs(b.changePct) - Math.abs(a.changePct));
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="stock-moves">
      <div className="flex items-baseline justify-between gap-3 px-2 pb-1 sm:px-3">
        <h2 id="stock-moves" className="text-[17px] font-medium tracking-tight text-oa-fg">
          Biggest stock moves
        </h2>
        <AppLink href="/movers" className={`shrink-0 text-[13px] font-medium text-oa-fg underline decoration-oa-border underline-offset-2 hover:decoration-oa-fg ${FOCUS}`}>
          Why stocks moved
        </AppLink>
      </div>
      {/* With one card the takeaway only repeats it ("AIRJW moved most, −11.8%"); it says something once there are several. */}
      {movers.takeaway && rows.length > 1 ? <p className="text-pretty px-2 pb-2 text-[14px] leading-5 text-oa-muted-fg sm:px-3">{movers.takeaway}</p> : null}
      <div className="max-sm:max-h-[30rem] max-sm:overflow-y-auto max-sm:overscroll-contain scrollbar-hide">
        <StockCardGrid wide>
          {rows.map((row, index) => (
            <StockCard
              key={row.ticker}
              ticker={row.ticker}
              name={row.name || row.ticker}
              figure={signedPct(row.changePct)}
              tone={row.changePct >= 0 ? "up" : "down"}
              sentence={row.reason ? unTitle(row.reason, row.name) : null}
              fill={stockGridFill(index, rows.length, true)}
              cover={
                <Link
                  href={`/stock/${encodeURIComponent(row.ticker)}`}
                  prefetch={false}
                  aria-label={`${row.ticker}, ${signedPct(row.changePct)} today`}
                  className="absolute inset-0 z-0 rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
                />
              }
            />
          ))}
        </StockCardGrid>
      </div>
    </section>
  );
}

/** "+16.52%", "−3.10%": the card's figure, with a real minus sign. */
function signedPct(value: number): string {
  const shown = Number(value.toFixed(2));
  return `${shown > 0 ? "+" : shown < 0 ? "\u2212" : ""}${Math.abs(shown).toFixed(2)}%`;
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

/**
 * The lead under the read: the cross-asset strip (indices, yields, oil, gold, the dollar, bitcoin), the biggest
 * stock moves as cards with their reasons, every sector's day, then a card for each other part of the market.
 */
async function MarketsSlot({
  sectors,
  movers,
  brief,
}: {
  sectors: ReturnType<typeof loadDeskSectors>;
  movers: Promise<DeskData["movers"]>;
  brief: Promise<DeskBrief>;
}) {
  const [data, sectorData, moverData] = await Promise.all([loadDeskMarketsData(), sectors, movers]);
  // The stock cards, then every sector; each stands alone at full width, so neither leaves half a row empty.
  const lead = (
    <>
      <StockMoves movers={moverData} />
      <SectorList rows={sectorData.rows} />
    </>
  );
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
        <Suspense fallback={<MarketCardsGhost className="mt-2" />}>
          <MoreMarkets data={data} brief={brief} />
        </Suspense>
      </section>
    </>
  );
}

/** The places that go deeper on today, as one short strip with each place's own icon. */
// Why stocks moved is left out: the stock moves above carry it as their one header action.
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
 * Market today: how the whole market did. The read in three ranked points leads; then what moved most (the
 * cross-asset strip, the biggest stock moves as cards with their reasons, every sector); then a card for every
 * other part of the market; then a short strip of places that go deeper. The head needs no data, so
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
          <MarketsSlot sectors={sectors} movers={movers} brief={brief} />
        </Suspense>

        <MoreOnToday />
      </div>
    </AppPage>
  );
}
