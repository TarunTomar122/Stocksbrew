import Link from "next/link";
import type * as React from "react";

import { Delta, FOCUS, NUM, Panel } from "@/components/oa/kit";
import { StockLogo } from "@/components/stock-logo";
import { WholeRows } from "@/components/wire/whole-rows";
import { headlineCase } from "@/lib/plain-copy";
import { toneLean, type StockBuzz, type ToneCounts } from "@/lib/wire-read";
import { WIRE_PAGE_SIZE, etDay, etTime, wireHref, type WireFilters, type WireItem } from "@/lib/wire-shared";

const ET_WEEKDAY = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" });

/** "3:06 AM" today, "Mon 11:26 PM" for an earlier New York day. */
export function when(iso: string): string {
  const time = etTime(iso);
  return etDay(iso) === etDay(Date.now()) ? time : `${ET_WEEKDAY.format(new Date(iso))} ${time}`;
}

/** About eight rows of Most talked about (each with its top story under it), cut back to its last whole row (WholeRows). */
const LIST_REM = 32;

/**
 * "75% negative" (or "Leans negative" when the side is a clear lean of fewer than half the stories), only when the
 * news clearly leans one way (`toneLean`). Nothing at all otherwise (owner rule 1): "No clear lean" on every card said
 * nothing, many times. `stories` is every story counted, so a share is never of a handful of labelled ones.
 */
export function leanWords(counts: ToneCounts, stories?: number): string {
  return toneLean(counts, stories)?.text ?? "";
}

function leanText(counts: ToneCounts, stories?: number): string {
  const lean = toneLean(counts, stories);
  return lean?.side === "positive" ? "text-signal-bullish" : lean?.side === "negative" ? "text-signal-bearish" : "";
}

/**
 * How the news on something leans, in one figure ("75% negative") or words ("Leans negative"), coloured, with the
 * counts for screen readers. Nothing at all when it does not clearly lean.
 */
export function ToneBar({ counts, stories, className = "" }: { counts: ToneCounts; stories?: number; className?: string }) {
  const words = leanWords(counts, stories);
  if (!words) return null;
  const label = `${counts.positive} positive, ${counts.negative} negative${stories ? ` of ${stories} ${stories === 1 ? "story" : "stories"}` : `, ${counts.neutral} neutral`}`;
  return (
    <span className={`${NUM} inline-flex items-center whitespace-nowrap text-[12.5px] leading-[18px] ${className}`} title={label}>
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" className={leanText(counts, stories)}>
        {words}
      </span>
    </span>
  );
}

/**
 * A source headline as a person would write it (owner rule 8), through the shared `headlineCase`: Scraped Title Case
 * goes to sentence case, and a mixed headline's stray capitals ("Lisa Su just Delivered Fantastic news") are lowered,
 * while names stay ("Jensen Huang", "Best Buy"). A headline already written as a sentence stays as its source wrote it.
 */
export function headlineWords(title: string, companyName = ""): string {
  return headlineCase(title, companyName);
}

/**
 * One headline: linked, whole (never cut off), in sentence case, with its source and time. No tone mark on every
 * line (owner rule 1): the card or theme it sits in says the tone once. No excerpt tooltip: it was a fifth of the
 * page's weight for text nobody sees without hovering (owner rule 11).
 */
export function HeadlineLine({ item, companyName = "", className = "" }: { item: WireItem; companyName?: string; className?: string }) {
  return (
    <a href={item.url} target="_blank" rel="noopener noreferrer" className={`group block rounded ${FOCUS} ${className}`}>
      <span className="block text-pretty text-[14px] leading-5 text-oa-fg group-hover:underline">{headlineWords(item.title, companyName)}</span>
      <span className={`${NUM} mt-0.5 block text-[12.5px] leading-[18px] text-oa-muted-fg`}>
        {item.source || "Unknown source"}
        {item.sourceKind === "press_release" ? " · release" : ""} · {when(item.publishedAt)}
      </span>
    </a>
  );
}

/** The top story about a stock, as one line in sentence case, without a trailing full stop. */
export function buzzHighlight(row: Pick<StockBuzz, "lead" | "name">): string {
  return headlineWords(row.lead.title, row.name ?? "").replace(/[.!]+$/, "");
}

/**
 * The stocks with the most coverage right now, most first (owner, Nov 11: "where info about positive or negative talk
 * and highlight?"). Each row: rank, logo and ticker, how its news leans (one coloured figure, only when it clearly
 * leans), the day's move, and its top story written out underneath. No coverage bars (owner rule 5): the order already
 * says who is talked about most. Every stock shows, about eight rows at a time with the rest scrolling inside.
 */
export function TalkedAbout({
  rows,
  filters,
  wide = false,
  className = "",
}: {
  rows: StockBuzz[];
  filters: WireFilters;
  /** Full width (the news page): two columns on a wide screen, so the card is never half empty. */
  wide?: boolean;
  className?: string;
}) {
  if (rows.length === 0) return null;
  // The tone column only when some stock's news leans; otherwise the moves sit right after the ticker.
  const toned = rows.some((row) => leanWords(row.tones, row.count) !== "");
  // About eight rows in view, the rest scrolling inside and the box ending on a whole row (owner rule 5).
  const frame = "max-h-[32rem]";
  // Full width: two columns read top to bottom (1 to 7, then 8 on), in a grid so the rows of both columns line up.
  const half = Math.ceil(rows.length / 2);
  const list = wide ? "lg:grid lg:grid-flow-col lg:grid-cols-2 lg:grid-rows-[repeat(var(--rows),auto)]" : "";
  const cols = toned ? "grid-cols-[1.25rem_minmax(0,1fr)_auto_3.75rem]" : "grid-cols-[1.25rem_minmax(0,1fr)_3.75rem]";
  return (
    <Panel flush label="Most talked about" className={className}>
      <WholeRows rem={LIST_REM} cue className={`scrollbar-hide overflow-y-auto overscroll-contain ${frame}`}>
        <ol className={list} style={wide ? ({ "--rows": half } as React.CSSProperties) : undefined}>
          {rows.map((row, index) => (
            <li key={row.ticker} className={`border-b border-oa-border hover:bg-oa-accent ${wide ? (index >= half ? "lg:border-l" : "") : "last:border-b-0"}`}>
              <Link
                href={wireHref({ ...filters, limit: WIRE_PAGE_SIZE }, { ticker: row.ticker, theme: null })}
                prefetch={false}
                className={`block px-4 py-2 ${FOCUS}`}
              >
                <span className={`grid min-h-6 ${cols} items-center gap-x-3`}>
                  <span className={`${NUM} text-[12.5px] text-oa-muted-fg`}>{index + 1}</span>
                  <span className="flex min-w-0 items-center gap-2">
                    <StockLogo ticker={row.ticker} size={18} eager={index < 8} atOnce />
                    <span className={`${NUM} text-[14px] font-medium text-oa-fg`}>{row.ticker}</span>
                  </span>
                  {toned ? (
                    <span className="text-right">
                      {/* No clear lean: a quiet dash keeps the column lined up instead of a hole beside the move. */}
                      {leanWords(row.tones, row.count) ? (
                        <ToneBar counts={row.tones} stories={row.count} />
                      ) : (
                        <span className={`${NUM} text-[12.5px] leading-[18px] text-oa-muted-fg`}>
                          <span aria-hidden="true">–</span>
                          <span className="sr-only">No clear tone</span>
                        </span>
                      )}
                    </span>
                  ) : null}
                  <span className="text-right">{row.pct !== null ? <Delta value={row.pct} digits={1} className="text-[14px] font-medium" /> : null}</span>
                </span>
                {/* The top story, whole and in sentence case, so the row says what the talk is about. */}
                <span className="mt-0.5 block text-pretty pl-[2rem] text-[13px] leading-[19px] text-oa-muted-fg">{buzzHighlight(row)}</span>
              </Link>
            </li>
          ))}
        </ol>
      </WholeRows>
    </Panel>
  );
}
