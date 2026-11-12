import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { StockCard, StockCardGrid } from "@/components/briefing/stock-card";
import { MarketingSchema } from "@/components/seo/marketing-schema";
import { StockLogo } from "@/components/stock-logo";
import { AppPage, PageHead, SourceLine, fmtStampET } from "@/components/oa/kit";
import { WholeRows } from "@/components/wire/whole-rows";
import { ogImage } from "@/lib/og/url";
import { getPremarketMovers } from "@/lib/premarket";
import { getPremarketOpeningReport } from "@/lib/premarket-opening";
import {
  futuresCues,
  gapPct,
  gappers,
  overseasCues,
  hasTodaysPremarket,
  premarketInputFrom,
  type CueInput,
  type Gapper,
} from "@/lib/premarket-read";

/**
 * Rendered on each visit: whether there is a page at all depends on the clock and on whether this morning's numbers
 * are in, and a cached redirect would outlive both. Both reads are cached for a minute (lib/premarket.ts,
 * lib/premarket-opening.ts), so this stays cheap.
 */
export const dynamic = "force-dynamic";

const BASE = "https://www.stocksbrew.online";
const TITLE = "Premarket Today: Futures, Gappers and How the Open Is Set Up";
const DESCRIPTION =
  "How the US stock market open is set up before 9:30 ET: S&P 500 and Nasdaq futures, markets in Asia and Europe, oil and the VIX, and the stocks gapping up and down with the news behind them.";

export function generateMetadata(): Metadata {
  const shareImage = ogImage(["page", "premarket"], "Premarket: how the open is set up", { daily: true });
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: "/premarket" },
    openGraph: { title: `${TITLE} · stocksbrew`, description: DESCRIPTION, url: `${BASE}/premarket`, images: [shareImage] },
    twitter: { card: "summary_large_image", title: `${TITLE} · stocksbrew`, description: DESCRIPTION, images: [shareImage] },
  };
}

function SectionHead({ id, title, count }: { id?: string; title: string; count?: string }) {
  return (
    <h2 id={id} className="oa-label mb-2 mt-6 flex scroll-mt-20 items-baseline gap-2 px-2 sm:px-0">
      {title}
      {count ? <span className="oa-mono text-[11.5px] font-normal normal-case tracking-normal text-oa-muted-fg">{count}</span> : null}
    </h2>
  );
}

/** A market that sets up the open, as a figure card: the change big, the level and where it trades under it. */
function CueCard({ cue }: { cue: CueInput }) {
  const tone = cue.change_pct > 0 ? "text-signal-bullish" : cue.change_pct < 0 ? "text-signal-bearish" : "text-oa-fg";
  return (
    <li className={`oa-surface flex min-w-0 flex-col border border-oa-border bg-oa-card px-3.5 py-3`}>
      <p className="text-[13.5px] font-medium leading-5 text-oa-fg">{cue.label}</p>
      <p className={`oa-mono mt-1 text-[20px] font-semibold leading-7 tracking-[-0.01em] tabular-nums ${tone}`}>{gapPct(cue.change_pct)}</p>
      <p className="oa-mono mt-auto pt-0.5 text-[12.5px] tabular-nums leading-[18px] text-oa-muted-fg">
        {cue.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}
        {cue.group !== "futures" && cue.region && cue.region !== "Macro" ? <span className="font-sans"> · {cue.region}</span> : null}
      </p>
    </li>
  );
}

/** Two across on a phone, five from `lg`; every card keeps one column (owner rule 4). */
function CueGrid({ cues }: { cues: CueInput[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {cues.map((cue) => (
        <CueCard key={cue.id} cue={cue} />
      ))}
    </ul>
  );
}

function GapperCard({ row }: { row: Gapper }) {
  return (
    <StockCard
      ticker={row.ticker}
      name={row.name}
      figure={gapPct(row.pct, 1)}
      tone={row.pct > 0 ? "up" : "down"}
      sentence={row.reason}
      cover={
        <Link
          href={`/stock/${encodeURIComponent(row.ticker)}`}
          prefetch={false}
          aria-label={`${row.ticker}, ${row.name}, ${gapPct(row.pct, 1)} before the open`}
          className="absolute inset-0 rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
        />
      }
    />
  );
}

/**
 * A gapper with nothing said about why: its logo, ticker and gap in a small chip, so it is not a big card padded out
 * to its neighbours' height (owner rule 4). Nothing is written about the missing reason (owner rule 7).
 */
function GapperChip({ row }: { row: Gapper }) {
  return (
    <li>
      <Link
        href={`/stock/${encodeURIComponent(row.ticker)}`}
        prefetch={false}
        title={row.name}
        aria-label={`${row.ticker}, ${row.name}, ${gapPct(row.pct, 1)} before the open`}
        className="oa-surface flex h-10 items-center gap-2 border border-oa-border bg-oa-card pl-2 pr-3 outline-none transition-colors hover:border-[color-mix(in_srgb,var(--oa-fg)_25%,transparent)] hover:bg-oa-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
      >
        <StockLogo ticker={row.ticker} size={22} />
        <span className="oa-mono text-[13.5px] font-semibold text-oa-fg">{row.ticker}</span>
        <span className={`oa-mono text-[13.5px] tabular-nums ${row.pct > 0 ? "text-signal-bullish" : "text-signal-bearish"}`}>{gapPct(row.pct, 1)}</span>
      </Link>
    </li>
  );
}

function GapperList({ id, title, rows, verb }: { id: string; title: string; rows: Gapper[]; verb: string }) {
  if (rows.length === 0) return null;
  // The gaps with a story get cards, all of them, scrolling inside a box that ends on a whole row (owner rules 2 and 5:
  // nothing waits behind a "show more" button); the rest share one strip of chips under them, biggest first.
  const told = rows.filter((row) => row.reason);
  const bare = rows.filter((row) => !row.reason);
  return (
    <section id={id} aria-labelledby={`${id}-label`} className="scroll-mt-20">
      <SectionHead id={`${id}-label`} title={title} count={`${rows.length} ${rows.length === 1 ? "stock" : "stocks"}`} />
      {told.length > 0 ? (
        <WholeRows rem={30} className="max-h-[30rem] overflow-y-auto scrollbar-hide">
          <StockCardGrid wide>
            {told.map((row) => (
              <GapperCard key={row.ticker} row={row} />
            ))}
          </StockCardGrid>
        </WholeRows>
      ) : null}
      {bare.length > 0 ? (
        <ul aria-label={told.length > 0 ? `Also ${verb}` : title} className={`flex flex-wrap gap-2 px-2 sm:px-0 ${told.length > 0 ? "mt-3" : ""}`}>
          {bare.map((row) => (
            <GapperChip key={row.ticker} row={row} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export default async function PremarketPage() {
  const [report, movers] = await Promise.all([getPremarketOpeningReport().catch(() => null), getPremarketMovers("US").catch(() => null)]);
  const input = premarketInputFrom(report, movers);
  const generatedAt = input.generatedAt;
  // Only this morning's numbers, before the open. middleware.ts already sends the address to Market today outside
  // 4:00-9:30 ET; this covers the morning before today's numbers are in, and a morning with nothing in them.
  if (!hasTodaysPremarket(input)) redirect("/explore");
  const cues = [...futuresCues(input.cues), ...overseasCues(input.cues)];
  const up = gappers(input.up, "up", input.news);
  const down = gappers(input.down, "down", input.news);
  const stamp = fmtStampET(generatedAt);

  return (
    <AppPage>
      <MarketingSchema path="/premarket" name={TITLE} description={DESCRIPTION} breadcrumbLabel="Premarket" />
      <PageHead
        title="Premarket"
        meta={stamp ? <SourceLine asOf={stamp} /> : undefined}
      />
      {/* Futures first, then the markets abroad, oil and the VIX: one grid, so the rows fill. */}
      {cues.length > 0 ? (
        <section aria-label="Futures, markets abroad, oil and the VIX">
          <SectionHead title="Futures and markets abroad" />
          <CueGrid cues={cues} />
        </section>
      ) : null}

      <GapperList id="gapping-up" title="Gapping up" rows={up} verb="gapping up" />
      <GapperList id="gapping-down" title="Gapping down" rows={down} verb="gapping down" />
    </AppPage>
  );
}
