import type { Metadata } from "next";

import { JsonLd, breadcrumbLd } from "@/components/docs/json-ld";
import { TheRead } from "@/components/oa/insight";
import { AppPage, CardGrid, Delta, MoveBar, NUM, PageHead, Panel, Ticker } from "@/components/oa/kit";
import { pickInsights, type TheRead as TheReadData } from "@/lib/insights";
import { ogImage } from "@/lib/og/url";
import { firstFullSentence, sentenceCase } from "@/lib/plain-copy";
import { longDay, moveHref, moversDayHref } from "@/lib/seo/families";
import { getRecentMoves, type MoveRef } from "@/lib/seo/family-data";

/** Every recent day with explained moves, newest first. Each day opens /movers/[date]. */

export const revalidate = 600;

const BASE = "https://www.stocksbrew.online";
const TITLE = "Why Stocks Moved: Big Daily Moves with a Confirmed Reason";

export async function generateMetadata(): Promise<Metadata> {
  const description =
    "Every day's biggest US stock moves that have a confirmed reason, each with the cause, the sources behind it and what the stock did next.";
  const shareImage = ogImage(["page", "signals"], "Why stocks moved", { daily: true });
  return {
    title: TITLE,
    description,
    alternates: { canonical: "/movers" },
    openGraph: { title: `${TITLE} · stocksbrew`, description, url: `${BASE}/movers`, images: [shareImage] },
    twitter: { card: "summary_large_image", title: `${TITLE} · stocksbrew`, description, images: [shareImage] },
  };
}

function hubRead(moves: readonly MoveRef[], latest: string | null): TheReadData | null {
  if (moves.length === 0 || !latest) return null;
  const today = moves.filter((move) => move.day === latest);
  const up = today.filter((move) => move.pct >= 0).length;
  const counts = new Map<string, number>();
  for (const move of moves) counts.set(move.ticker, (counts.get(move.ticker) ?? 0) + 1);
  const repeat = [...counts.entries()].filter(([, count]) => count >= 2).sort((a, b) => b[1] - a[1]);
  const biggest = [...today].sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))[0];
  return {
    headline: `${today.length} ${today.length === 1 ? "stock" : "stocks"} made a big move with a confirmed reason on ${longDay(latest)}: ${up} rose and ${today.length - up} fell.`,
    insights: pickInsights([
      biggest
        ? {
            id: "biggest",
            tone: biggest.pct >= 0 ? "up" : "down",
            text: `${biggest.ticker} made the biggest move, ${biggest.pct >= 0 ? "up" : "down"} ${Math.abs(biggest.pct).toFixed(1)}%: ${firstSentence(biggest.headline)}.`,
            tickers: [biggest.ticker],
            action: { label: `Why ${biggest.ticker} moved`, href: moveHref(biggest.ticker, biggest.day) },
          }
        : null,
      repeat.length
        ? {
            id: "repeat",
            tone: "flat",
            text: `${repeat.length === 1 ? "One stock has" : `${repeat.length} stocks have`} made a big move more than once lately: ${repeat
              .slice(0, 4)
              .map(([ticker, count]) => `${ticker} (${count} times)`)
              .join(", ")}.`,
            tickers: repeat.slice(0, 4).map(([ticker]) => ticker),
          }
        : null,
    ]),
  };
}

function firstSentence(text: string | null | undefined): string {
  return sentenceCase(firstFullSentence(text)).replace(/[.!?]$/, "");
}

/** One move: the stock, a bar for its size, the number, and the reason in a sentence. */
function MoveRow({ move, max }: { move: MoveRef; max: number }) {
  const reason = firstSentence(move.headline);
  return (
    <li className="border-b border-oa-border last:border-b-0">
      <a href={moveHref(move.ticker, move.day)} className="block px-4 py-2.5 outline-none hover:bg-oa-accent focus-visible:bg-oa-accent">
        <span className="flex items-center justify-between gap-3">
          <Ticker symbol={move.ticker} name={move.name} href={null} className="min-w-0" />
          <span className="flex shrink-0 items-center gap-2.5">
            <MoveBar value={move.pct} max={max} width={56} />
            <Delta value={move.pct} digits={1} className="w-[4.25rem] text-right text-[15px] font-medium" />
          </span>
        </span>
        {reason ? <span className="mt-0.5 block max-w-[68ch] text-pretty pl-7 text-[14px] leading-5 text-oa-muted-fg">{reason}.</span> : null}
      </a>
    </li>
  );
}

export default async function MoversPage() {
  const moves = await getRecentMoves();
  const byDay = new Map<string, MoveRef[]>();
  for (const move of moves) byDay.set(move.day, [...(byDay.get(move.day) ?? []), move]);
  const days = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  const [latest, ...earlier] = days;
  const latestMoves = latest ? latest[1] : [];
  const max = Math.max(0, ...latestMoves.map((move) => Math.abs(move.pct)));
  const gains = latestMoves.filter((move) => move.pct >= 0).sort((a, b) => b.pct - a.pct);
  const drops = latestMoves.filter((move) => move.pct < 0).sort((a, b) => a.pct - b.pct);

  return (
    <AppPage>
      <JsonLd data={breadcrumbLd([{ name: "Movers", path: "/movers" }])} />
      <PageHead crumb={<a href="/signals?tab=movers">Signals</a>} title="Why stocks moved" note={false} />
      <TheRead read={hubRead(moves, latest?.[0] ?? null)} label="The latest day, in short" className="mb-4" />
      {latest ? (
        <CardGrid cols={2} className="mb-5">
          {[
            { label: "Biggest gains", rows: gains },
            { label: "Biggest drops", rows: drops },
          ].map((side) => (
            <Panel key={side.label} flush fill label={`${side.label} · ${longDay(latest[0])}`}>
              {side.rows.length ? (
                <ul>
                  {side.rows.map((move) => (
                    <MoveRow key={`${move.ticker}-${move.day}`} move={move} max={max} />
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-6 text-center text-[14px] text-oa-muted-fg">None on this day.</p>
              )}
            </Panel>
          ))}
        </CardGrid>
      ) : null}
      <Panel flush label="Earlier days">
        {earlier.length ? (
          <ul>
            {earlier.map(([day, list]) => {
              const up = list.filter((move) => move.pct >= 0).length;
              const top = [...list].sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, 4);
              return (
                <li key={day} className="border-b border-oa-border last:border-b-0">
                  <a href={moversDayHref(day)} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1 px-4 py-3 outline-none hover:bg-oa-accent focus-visible:bg-oa-accent sm:grid-cols-[11rem_minmax(0,1fr)_auto]">
                    <span className={`${NUM} text-[14px] font-medium text-oa-fg`}>{longDay(day)}</span>
                    <span className="flex min-w-0 flex-wrap gap-x-3 gap-y-0.5 text-[13.5px] max-sm:col-span-2 max-sm:row-start-2">
                      {top.map((move) => (
                        <span key={move.ticker} className="inline-flex items-baseline gap-1.5">
                          <span className={`${NUM} font-medium text-oa-fg`}>{move.ticker}</span>
                          <Delta value={move.pct} digits={1} className="text-[12.5px]" />
                        </span>
                      ))}
                    </span>
                    <span className="text-[12.5px] text-oa-muted-fg">
                      {list.length} stocks, {up} up · see all →
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-4 py-6 text-center text-[14px] text-oa-muted-fg">{days.length ? "No earlier days on file yet." : "No explained moves on file yet."}</p>
        )}
      </Panel>
    </AppPage>
  );
}
