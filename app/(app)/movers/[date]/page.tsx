import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { JsonLd, breadcrumbLd } from "@/components/docs/json-ld";
import { TheRead } from "@/components/oa/insight";
import { AppPage, CardGrid, Delta, NUM, PageHead, Panel, SourceLine, fmtDay, fmtStampET } from "@/components/oa/kit";
import { buildMoversDayRead, closeOn } from "@/lib/move-page";
import { ogImage } from "@/lib/og/url";
import { getDailySeries } from "@/lib/screener-series";
import { MOVERS_DAY_MIN_MOVES, isIsoDay, longDay, moveHref, moversDayHref, moversDayTitle } from "@/lib/seo/families";
import { getMovesDay, getRecentMoves, type ExplainedMove } from "@/lib/seo/family-data";

/**
 * One day of big moves that have a confirmed, sourced reason
 * (/movers/2026-11-10). A day with none is a real 404 (no loading.tsx here).
 * Indexable with MOVERS_DAY_MIN_MOVES or more explained moves.
 */

export const revalidate = 600;

type Props = { params: { date: string } };

const BASE = "https://www.stocksbrew.online";

async function resolve(day: string) {
  if (!isIsoDay(day)) return null;
  const moves = await getMovesDay(day);
  return moves.length ? moves : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const moves = await resolve(params.date);
  if (!moves) return { title: "No movers on this day", robots: { index: false, follow: true } };
  const path = moversDayHref(params.date);
  const title = moversDayTitle(params.date);
  const named = moves
    .slice(0, 4)
    .map((move) => `${move.ticker} ${move.pct >= 0 ? "+" : "−"}${Math.abs(move.pct).toFixed(1)}%`)
    .join(", ");
  const description = `The ${moves.length} US stocks that made a big move on ${longDay(params.date)} and the confirmed reason for each, with sources: ${named}.`;
  const shareImage = ogImage(["page", "signals"], `Why stocks moved on ${fmtDay(params.date, true)}`, { daily: true });
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: { index: moves.length >= MOVERS_DAY_MIN_MOVES, follow: true },
    openGraph: { title: `${title} · stocksbrew`, description, url: `${BASE}${path}`, images: [shareImage] },
    twitter: { card: "summary_large_image", title: `${title} · stocksbrew`, description, images: [shareImage] },
  };
}

function MoveRows({ moves }: { moves: ExplainedMove[] }) {
  return (
    <ul>
      {moves.map((move) => (
        <li key={move.ticker} className="border-b border-oa-border last:border-b-0">
          <a href={moveHref(move.ticker, move.day)} className="grid grid-cols-[3.5rem_4rem_minmax(0,1fr)] items-baseline gap-x-3 px-4 py-2.5 outline-none hover:bg-oa-accent focus-visible:bg-oa-accent">
            <span className={`${NUM} text-[14px] font-medium text-oa-fg`}>{move.ticker}</span>
            <Delta value={move.pct} digits={1} className="text-[13.5px]" />
            <span className="min-w-0 text-pretty text-[14px] leading-5 text-oa-fg">{move.headline}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

export default async function MoversDayPage({ params }: Props) {
  const moves = await resolve(params.date);
  if (!moves) notFound();
  const day = params.date;
  const path = moversDayHref(day);
  const { series } = await getDailySeries(["SPY"]).catch(() => ({ series: {} as Record<string, never> }));
  const read = buildMoversDayRead({ day, moves, spyClose: closeOn(series.SPY, day) });
  const up = moves.filter((move) => move.pct >= 0);
  const down = moves.filter((move) => move.pct < 0);
  const days = [...new Set((await getRecentMoves()).map((move) => move.day))].sort();
  const index = days.indexOf(day);
  const before = index > 0 ? days[index - 1] : days.filter((item) => item < day).pop();
  const after = index >= 0 ? days[index + 1] : days.find((item) => item > day);
  const researched = moves.map((move) => move.researchedAt ?? "").sort().pop() || null;

  return (
    <AppPage>
      <JsonLd
        data={breadcrumbLd([
          { name: "Movers", path: "/movers" },
          { name: longDay(day), path },
        ])}
      />
      <PageHead
        crumb={<a href="/movers">Movers</a>}
        title={`Why stocks moved on ${longDay(day)}`}
        meta={<SourceLine source="Researched from news and filings" asOf={researched ? fmtStampET(researched) : undefined} />}
        actions={
          <span className={`${NUM} flex items-center gap-3 text-[13px]`}>
            {before ? (
              <a href={moversDayHref(before)} className="text-oa-primary hover:underline">
                ← {fmtDay(before)}
              </a>
            ) : null}
            {after ? (
              <a href={moversDayHref(after)} className="text-oa-primary hover:underline">
                {fmtDay(after)} →
              </a>
            ) : null}
          </span>
        }
        note={false}
      />
      <TheRead read={read} label="The day, in short" className="mb-4" />
      <CardGrid cols={2}>
        <Panel flush fill label={`Up ${up.length}`}>
          {up.length ? <MoveRows moves={up} /> : <p className="px-4 py-3 text-[14px] text-oa-muted-fg">No explained gains this day.</p>}
        </Panel>
        <Panel flush fill label={`Down ${down.length}`}>
          {down.length ? <MoveRows moves={down} /> : <p className="px-4 py-3 text-[14px] text-oa-muted-fg">No explained drops this day.</p>}
        </Panel>
      </CardGrid>
    </AppPage>
  );
}
