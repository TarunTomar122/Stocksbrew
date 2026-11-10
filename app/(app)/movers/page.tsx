import type { Metadata } from "next";

import { JsonLd, breadcrumbLd } from "@/components/docs/json-ld";
import { TheRead } from "@/components/oa/insight";
import { AppPage, NUM, PageHead, Panel } from "@/components/oa/kit";
import { pickInsights, type TheRead as TheReadData } from "@/lib/insights";
import { ogImage } from "@/lib/og/url";
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

function hubRead(moves: readonly MoveRef[]): TheReadData | null {
  if (moves.length === 0) return null;
  const days = new Set(moves.map((move) => move.day));
  const counts = new Map<string, number>();
  for (const move of moves) counts.set(move.ticker, (counts.get(move.ticker) ?? 0) + 1);
  const repeat = [...counts.entries()].filter(([, count]) => count >= 2).sort((a, b) => b[1] - a[1]);
  const biggest = [...moves].sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))[0]!;
  return {
    headline:
      days.size === 1
        ? `${moves.length} explained ${moves.length === 1 ? "move" : "moves"} on ${longDay([...days][0]!)}.`
        : `${moves.length} explained moves across ${days.size} trading days.`,
    insights: pickInsights([
      {
        id: "biggest",
        tone: biggest.pct >= 0 ? "up" : "down",
        text: `The biggest: ${biggest.ticker} ${biggest.pct >= 0 ? "rose" : "fell"} ${Math.abs(biggest.pct).toFixed(1)}% on ${longDay(biggest.day)}.`,
        tickers: [biggest.ticker],
        action: { label: "Why", href: moveHref(biggest.ticker, biggest.day) },
      },
      repeat.length
        ? {
            id: "repeat",
            tone: "flat",
            text: `Moved with a reason more than once: ${repeat
              .slice(0, 4)
              .map(([ticker, count]) => `${ticker} (${count} times)`)
              .join(", ")}.`,
            tickers: repeat.slice(0, 4).map(([ticker]) => ticker),
          }
        : null,
    ]),
  };
}

export default async function MoversPage() {
  const moves = await getRecentMoves();
  const byDay = new Map<string, MoveRef[]>();
  for (const move of moves) byDay.set(move.day, [...(byDay.get(move.day) ?? []), move]);
  const days = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0]));

  return (
    <AppPage>
      <JsonLd data={breadcrumbLd([{ name: "Movers", path: "/movers" }])} />
      <PageHead crumb={<a href="/signals?tab=movers">Signals</a>} title="Why stocks moved" note={false} />
      <TheRead read={hubRead(moves)} label="Recent days, in short" className="mb-4" />
      <Panel flush>
        {days.length ? (
          <ul>
            {days.map(([day, list]) => {
              const up = list.filter((move) => move.pct >= 0).length;
              return (
                <li key={day} className="border-b border-oa-border last:border-b-0">
                  <a href={moversDayHref(day)} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 px-4 py-3 outline-none hover:bg-oa-accent focus-visible:bg-oa-accent sm:grid-cols-[11rem_minmax(0,1fr)_auto]">
                    <span className={`${NUM} text-[14px] font-medium text-oa-fg`}>{longDay(day)}</span>
                    <span className="min-w-0 truncate text-[13.5px] text-oa-muted-fg max-sm:col-span-2 max-sm:row-start-2">
                      {list
                        .slice(0, 5)
                        .map((move) => `${move.ticker} ${move.pct >= 0 ? "+" : "−"}${Math.abs(move.pct).toFixed(1)}%`)
                        .join(" · ")}
                    </span>
                    <span className={`${NUM} text-[12.5px] text-oa-muted-fg`}>
                      {list.length} moves · {up} up
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-4 py-6 text-center text-[14px] text-oa-muted-fg">No explained moves on file yet.</p>
        )}
      </Panel>
    </AppPage>
  );
}
