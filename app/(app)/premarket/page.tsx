import type { Metadata } from "next";
import Link from "next/link";

import { StockCard, StockCardGrid, fillLastRow, stockGridFill } from "@/components/briefing/stock-card";
import { MarketingSchema } from "@/components/seo/marketing-schema";
import { TheRead } from "@/components/oa/insight";
import { AppPage, Empty, PageHead, ShowMore, SourceLine, fmtStampET } from "@/components/oa/kit";
import { ogImage } from "@/lib/og/url";
import { getPremarketMovers } from "@/lib/premarket";
import { getPremarketOpeningReport } from "@/lib/premarket-opening";
import {
  futuresCues,
  gapPct,
  gappers,
  overseasCues,
  premarketInputFrom,
  premarketRead,
  premarketWhen,
  type CueInput,
  type Gapper,
} from "@/lib/premarket-read";

/** Both reads are cached for a minute (lib/premarket.ts, lib/premarket-opening.ts); the page follows them. */
export const revalidate = 60;

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

/** Gappers shown before "Show all": two rows of three. */
const FIRST = 6;

function SectionHead({ id, title, count }: { id?: string; title: string; count?: string }) {
  return (
    <h2 id={id} className="oa-label mb-2 mt-6 flex scroll-mt-20 items-baseline gap-2 px-2 sm:px-0">
      {title}
      {count ? <span className="oa-mono text-[11.5px] font-normal normal-case tracking-normal text-oa-muted-fg">{count}</span> : null}
    </h2>
  );
}

/** A market that sets up the open, as a figure card: the change big, the level and where it trades under it. */
function CueCard({ cue, fill = "" }: { cue: CueInput; fill?: string }) {
  const tone = cue.change_pct > 0 ? "text-signal-bullish" : cue.change_pct < 0 ? "text-signal-bearish" : "text-oa-fg";
  return (
    <li className={`oa-surface flex min-w-0 flex-col border border-oa-border bg-oa-card px-3.5 py-3 ${fill}`}>
      <p className="text-[13.5px] font-medium leading-5 text-oa-fg">{cue.label}</p>
      <p className={`oa-mono mt-1 text-[20px] font-semibold leading-7 tracking-[-0.01em] tabular-nums ${tone}`}>{gapPct(cue.change_pct)}</p>
      <p className="oa-mono mt-auto pt-0.5 text-[12.5px] tabular-nums leading-[18px] text-oa-muted-fg">
        {cue.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}
        {cue.group !== "futures" && cue.region && cue.region !== "Macro" ? <span className="font-sans"> · {cue.region}</span> : null}
      </p>
    </li>
  );
}

/** Two across on a phone, five from `lg`; the last card fills what its row has left. */
function CueGrid({ cues }: { cues: CueInput[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      {cues.map((cue, index) => (
        <CueCard key={cue.id} cue={cue} fill={index === cues.length - 1 && cues.length % 2 === 1 ? `col-span-2 ${fillLastRow(index, cues.length, { lg: 5 })}` : fillLastRow(index, cues.length, { lg: 5 })} />
      ))}
    </ul>
  );
}

function GapperCard({ row, fill }: { row: Gapper; fill: string }) {
  return (
    <StockCard
      fill={fill}
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

function GapperList({ id, title, rows, verb }: { id: string; title: string; rows: Gapper[]; verb: string }) {
  if (rows.length === 0) return null;
  const first = rows.slice(0, FIRST);
  const rest = rows.slice(FIRST);
  return (
    <section id={id} aria-labelledby={`${id}-label`} className="scroll-mt-20">
      <SectionHead id={`${id}-label`} title={title} count={`${rows.length} ${rows.length === 1 ? "stock" : "stocks"}`} />
      <StockCardGrid wide>
        {first.map((row, index) => (
          <GapperCard key={row.ticker} row={row} fill={stockGridFill(index, first.length, true)} />
        ))}
      </StockCardGrid>
      {rest.length > 0 ? (
        <ShowMore always label={`Show ${rest.length} more ${verb}`} less="Show fewer">
          <StockCardGrid wide className="mt-3">
            {rest.map((row, index) => (
              <GapperCard key={row.ticker} row={row} fill={stockGridFill(index, rest.length, true)} />
            ))}
          </StockCardGrid>
        </ShowMore>
      ) : null}
    </section>
  );
}

export default async function PremarketPage() {
  const [report, movers] = await Promise.all([getPremarketOpeningReport().catch(() => null), getPremarketMovers("US").catch(() => null)]);
  const input = premarketInputFrom(report, movers);
  const generatedAt = input.generatedAt;
  const when = premarketWhen(generatedAt);
  const read = premarketRead(input, when);
  const cues = [...futuresCues(input.cues), ...overseasCues(input.cues)];
  const up = gappers(input.up, "up", input.news);
  const down = gappers(input.down, "down", input.news);
  const stamp = fmtStampET(generatedAt);
  const empty = !read && cues.length === 0 && up.length === 0 && down.length === 0;

  return (
    <AppPage>
      <MarketingSchema path="/premarket" name={TITLE} description={DESCRIPTION} breadcrumbLabel="Premarket" />
      <PageHead
        title="Premarket"
        lede="How the US open is set up before 9:30 ET: futures, markets abroad, and the stocks gapping up and down with the news behind them."
        meta={stamp ? <SourceLine asOf={stamp} /> : undefined}
      />
      {when.note ? <p className="-mt-1 mb-3 px-2 text-pretty text-[14px] leading-5 text-oa-fg sm:px-0">{when.note}</p> : null}

      {empty ? (
        <Empty title="No premarket numbers yet">
          They come in each market day from 4:00 AM ET. Until then, the{" "}
          <Link prefetch={false} href="/briefing" className="text-oa-fg underline decoration-oa-border underline-offset-2 hover:decoration-oa-fg">
            briefing
          </Link>{" "}
          has how the last session went.
        </Empty>
      ) : (
        <>
          {/* The head already says when the numbers are from, so the read does not repeat it. */}
          <TheRead read={read ? { ...read, asOf: null } : null} label="How the open is set up" askContext={false} />

          {/* Futures first, then the markets abroad, oil and the VIX: one grid, so the rows fill. */}
          {cues.length > 0 ? (
            <section aria-label="Futures, markets abroad, oil and the VIX">
              <SectionHead title="Futures and markets abroad" />
              <CueGrid cues={cues} />
            </section>
          ) : null}

          <GapperList id="gapping-up" title="Gapping up" rows={up} verb="gapping up" />
          <GapperList id="gapping-down" title="Gapping down" rows={down} verb="gapping down" />
        </>
      )}
      <p className="mt-6 px-2 text-[12px] leading-5 text-oa-muted-fg sm:px-0">Premarket prices are thin and can change a lot by the open. Nothing here is advice to trade.</p>
    </AppPage>
  );
}
