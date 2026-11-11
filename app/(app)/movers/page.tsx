import type { Metadata } from "next";

import { JsonLd, breadcrumbLd } from "@/components/docs/json-ld";
import { TheRead } from "@/components/oa/insight";
import { AppPage, CardGrid, Delta, NUM, PageHead, Panel, ShowMore, Ticker, fmtDay } from "@/components/oa/kit";
import { StockLogo } from "@/components/stock-logo";
import { pickInsights, type TheRead as TheReadData } from "@/lib/insights";
import { ogImage } from "@/lib/og/url";
import { companyFirstMove, firstFullSentence, plainFinance, sentenceCase, shortCompanyName } from "@/lib/plain-copy";
import { longDay, moveHref, moversDayHref } from "@/lib/seo/families";
import { getRecentMoves, type MoveRef } from "@/lib/seo/family-data";
import Link from "next/link";

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
  // The story first (the day's biggest move, in a sentence), then the count.
  const count = `On ${longDay(latest)} we found the reason for ${today.length} big ${today.length === 1 ? "move" : "moves"}: ${up} ${up === 1 ? "stock" : "stocks"} rose and ${today.length - up} fell.`;
  return {
    headline: biggest ? biggestLine(biggest, latest) : count,
    insights: pickInsights([
      biggest
        ? {
            id: "count",
            tone: "flat",
            text: count,
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

/**
 * "at 9:41 AM ET": when a move was measured, if that was during its own day.
 * The briefing shows the live change, so the same stock can read -16.5% there
 * and -11.1% here; the time keeps the two from looking like a contradiction.
 */
function measuredAt(move: MoveRef): string | null {
  if (!move.researchedAt) return null;
  const date = new Date(move.researchedAt);
  if (Number.isNaN(date.getTime())) return null;
  const day = date.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  if (day !== move.day) return null;
  return `at ${date.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" })} ET`;
}

function firstSentence(text: string | null | undefined): string {
  // A reason the feed clipped ("...") ends where the words end; no ellipsis on screen.
  return plainFinance(sentenceCase(firstFullSentence(text)))
    .replace(/\s*(?:…|\.{2,})$/, "")
    .replace(/[.!?]$/, "");
}

// A phone shows the first few of each side; the rest wait behind one button.
const PHONE_ROWS = 3;

/** One move: the stock, the number, and the reason in a sentence. */
/**
 * The day's biggest move as one sentence, company first: "Hims & Hers fell
 * 16.5% after earnings that missed expectations, the biggest move on Nov 10."
 * A reason in another shape keeps the old form with the move in brackets.
 */
function biggestLine(move: MoveRef, latest: string): string {
  const reason = firstSentence(move.headline);
  const turned = companyFirstMove(reason, move.pct, { withPct: true, company: { name: move.name, ticker: move.ticker } });
  if (turned) return `${turned}, the biggest move on ${fmtDay(latest)}.`;
  const name = (move.name ? shortCompanyName(move.name) : "") || move.ticker;
  return `The biggest move on ${fmtDay(latest)}: ${name} ${move.pct >= 0 ? "rose" : "fell"} ${Math.abs(move.pct).toFixed(1)}%. ${reason}.`;
}

/** A list about eight rows tall that scrolls inside itself; the next row peeks out so it reads as scrollable. */
const ROWS_SCROLL = "max-h-[34rem] overflow-y-auto overscroll-auto";

function MoveRow({ move }: { move: MoveRef }) {
  // Company first where the feed wrote the cause first; the number is already on the row.
  const raw = firstSentence(move.headline);
  const reason = companyFirstMove(raw, move.pct, { company: { name: move.name, ticker: move.ticker } }) ?? raw;
  // One time for the whole list, in the panel's header; rows never carry their own (owner, Nov 11).
  return (
    <li className="border-b border-oa-border px-4 py-2.5 last:border-b-0">
      {/* Two places to go: the stock itself (its name) and the explanation (the reason). */}
      <span className="flex items-center justify-between gap-3">
        <Ticker symbol={move.ticker} name={move.name} wrap className="min-w-0" />
        {/* No size bar: the percentage already says it (owner, Nov 11). */}
        <Delta value={move.pct} digits={1} className="w-[4.25rem] shrink-0 text-right text-[15px] font-medium" />
      </span>
      {reason ? (
        <Link prefetch={false}
          href={moveHref(move.ticker, move.day)}
          className="group mt-0.5 block max-w-[68ch] text-pretty rounded pl-7 text-[14px] leading-5 text-oa-muted-fg outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
        >
          {/* The reason is the link; no "Why it moved" on every row (owner, Nov 11). */}
          <span className="group-hover:text-oa-fg group-hover:underline">{reason}.</span>
        </Link>
      ) : null}
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
  const gains = latestMoves.filter((move) => move.pct >= 0).sort((a, b) => b.pct - a.pct);
  const drops = latestMoves.filter((move) => move.pct < 0).sort((a, b) => a.pct - b.pct);
  // The researcher measures a day's moves in one pass, so they usually share a
  // time: say it once in the header. Rows carry their own only when they differ.
  // The most common time goes in the header; only a row measured at another time carries its own.
  const timeCounts = new Map<string, number>();
  for (const move of latestMoves) {
    const at = measuredAt(move);
    if (at) timeCounts.set(at, (timeCounts.get(at) ?? 0) + 1);
  }
  const sharedTime = [...timeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return (
    <AppPage>
      <JsonLd data={breadcrumbLd([{ name: "Movers", path: "/movers" }])} />
      <PageHead crumb={<Link prefetch={false} href="/signals?tab=movers">Signals</Link>} title="Why stocks moved" note={false} />
      <TheRead read={hubRead(moves, latest?.[0] ?? null)} label={latest ? `${fmtDay(latest[0])}, in short` : "In short"} className="mb-4" />
      {latest ? (
        <CardGrid cols={2} className="mb-5">
          {[
            { label: "Biggest gains", rows: gains },
            { label: "Biggest drops", rows: drops },
          ].map((side) => (
            <Panel
              key={side.label}
              flush
              fill
              label={side.label}
              right={<span className={NUM}>{`${fmtDay(latest[0])}${sharedTime ? `, ${sharedTime.replace(/^at /, "")}` : ""}`}</span>}
            >
              {side.rows.length ? (
                // About eight rows tall, then it scrolls inside the panel (no scrollbar shown), so the page stays short.
                <ul className={ROWS_SCROLL}>
                  {side.rows.map((move) => (
                    <MoveRow key={`${move.ticker}-${move.day}`} move={move} />
                  ))}
                </ul>
              ) : (
                <p className="px-4 py-6 text-center text-[14px] text-oa-muted-fg">None on this day.</p>
              )}
            </Panel>
          ))}
        </CardGrid>
      ) : null}
      {earlier.length || !days.length ? (
      <Panel flush label="Earlier days">
        {earlier.length ? (
          <ul>
            {earlier.map(([day, list]) => {
              const up = list.filter((move) => move.pct >= 0).length;
              const top = [...list].sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, 4);
              return (
                <li key={day} className="border-b border-oa-border last:border-b-0">
                  <Link prefetch={false} href={moversDayHref(day)} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1 px-4 py-3 outline-none hover:bg-oa-accent focus-visible:bg-oa-accent sm:grid-cols-[11rem_minmax(0,1fr)_auto]">
                    <span className={`${NUM} text-[14px] font-medium text-oa-fg`}>{longDay(day)}</span>
                    <span className="flex min-w-0 flex-wrap gap-x-3 gap-y-0.5 text-[13.5px] max-sm:col-span-2 max-sm:row-start-2">
                      {top.map((move) => (
                        <span key={move.ticker} className="inline-flex items-baseline gap-1.5">
                          <StockLogo ticker={move.ticker} size={16} className="self-center" />
                          <span className={`${NUM} font-medium text-oa-fg`}>{move.ticker}</span>
                          <Delta value={move.pct} digits={1} className="text-[12.5px]" />
                        </span>
                      ))}
                    </span>
                    <span className="text-[12.5px] text-oa-muted-fg">
                      {list.length} stocks, {up} up · see all →
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-4 py-6 text-center text-[14px] text-oa-muted-fg">No explained moves on file yet.</p>
        )}
      </Panel>
      ) : null}
    </AppPage>
  );
}
