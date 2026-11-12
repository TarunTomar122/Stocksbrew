import Link from "next/link";

import { Delta, FOCUS, NUM, Panel, fmtMoney } from "@/components/oa/kit";
import { StockLogo } from "@/components/stock-logo";
import { ToneColumns } from "@/components/wire/tone-columns";
import { headlineCase } from "@/lib/plain-copy";
import { rowTone, splitByTone, toneLean, toneWord, type StockBuzz, type ToneCounts } from "@/lib/wire-read";
import { WIRE_PAGE_SIZE, etDay, etTime, wireHref, type WireFilters, type WireItem } from "@/lib/wire-shared";

const ET_WEEKDAY = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" });

/** "3:06 AM" today, "Mon 11:26 PM" for an earlier New York day. */
export function when(iso: string): string {
  const time = etTime(iso);
  return etDay(iso) === etDay(Date.now()) ? time : `${ET_WEEKDAY.format(new Date(iso))} ${time}`;
}

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
 * One headline: linked, whole (never cut off), in sentence case. Its source and time are the link's title, not a line
 * under it (owner rule 4). No tone mark on every line (owner rule 1): the card it sits in says the tone once.
 */
export function HeadlineLine({ item, companyName = "", className = "" }: { item: WireItem; companyName?: string; className?: string }) {
  const source = `${item.source || "Unknown source"}${item.sourceKind === "press_release" ? ", release" : ""} · ${when(item.publishedAt)}`;
  return (
    <a href={item.url} target="_blank" rel="noopener noreferrer" title={source} className={`group block rounded ${FOCUS} ${className}`}>
      <span className="block text-pretty text-[14.5px] leading-5 text-oa-fg group-hover:underline">{headlineWords(item.title, companyName)}</span>
      <span className="sr-only"> ({source})</span>
    </a>
  );
}

/** The top story about a stock, as one line in sentence case, without a trailing full stop. */
export function buzzHighlight(row: Pick<StockBuzz, "lead" | "name">): string {
  return row.lead ? headlineWords(row.lead.title, row.name ?? "").replace(/[.!]+$/, "") : "";
}

/**
 * A ranked row's tone ("75% negative", "62% neutral", "Mixed", "No clear lean"), coloured by side, with the counts for
 * screen readers. Every row says one (owner rule 3); where the stories cannot support a tone it says so plainly.
 */
export function RowTone({ counts, stories }: { counts: ToneCounts; stories: number }) {
  const word = rowTone(counts, stories);
  const label = `${counts.positive} positive, ${counts.negative} negative, ${counts.neutral} neutral of ${stories} ${stories === 1 ? "story" : "stories"}`;
  const colour = word.side === "positive" ? "text-signal-bullish" : word.side === "negative" ? "text-signal-bearish" : "text-oa-muted-fg";
  return (
    <span className={`${NUM} inline-flex items-center text-right text-[12.5px] leading-[18px]`} title={label}>
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" className={colour}>
        {word.text}
      </span>
    </span>
  );
}

/**
 * The stocks with the most coverage right now, most first (owner, Nov 11: "where info about positive or negative talk
 * and highlight?"). Each row: rank, logo and ticker, the tone of its news (rowTone: "75% negative", "62% neutral", or
 * plainly "No clear lean"), the day's move, and its top story written out underneath. No coverage bars (owner rule 5): the order already
 * says who is talked about most. Good news sits in the left column and mixed or bad in the right (owner, Nov 12),
 * each keeping its rank number, five a column in view and the rest behind one "Show N more".
 */
export function TalkedAbout({ rows, filters, className = "" }: { rows: StockBuzz[]; filters: WireFilters; className?: string }) {
  if (rows.length === 0) return null;
  // The tone column once any stock's news has a tone the labels support; then every row says one. With none (the
  // labeller behind), the same "No clear lean" on every row would say nothing many times (owner rule 1).
  const toned = rows.some((row) => toneWord(row.tones, row.count) !== null);
  // The last column holds the price and the move: wide enough for "$1,234.56 −16.6%" so the rows line up.
  // On a phone the ticker keeps its width and the tone takes what is left, so the two never run together.
  const cols = toned
    ? "grid-cols-[1.25rem_auto_minmax(0,1fr)_auto] sm:grid-cols-[1.25rem_minmax(0,1fr)_auto_minmax(8.5rem,auto)]"
    : "grid-cols-[1.25rem_minmax(0,1fr)_auto] sm:grid-cols-[1.25rem_minmax(0,1fr)_minmax(8.5rem,auto)]";
  const rank = new Map(rows.map((row, index) => [row.ticker, index + 1]));
  const item = (row: StockBuzz, index: number) => {
    const place = rank.get(row.ticker) ?? 0;
    return (
      // Each column is its own list, so the item carries its overall rank for screen readers too.
      <li key={row.ticker} value={place} className="hover:bg-oa-accent">
        <Link href={wireHref({ ...filters, limit: WIRE_PAGE_SIZE }, { ticker: row.ticker, theme: null })} prefetch={false} className={`block px-4 py-2 ${FOCUS}`}>
          <span className={`grid min-h-6 ${cols} items-center gap-x-3`}>
            <span className={`${NUM} text-[12.5px] text-oa-muted-fg`}>{place}</span>
            <span className="flex min-w-0 items-center gap-2">
              <StockLogo ticker={row.ticker} size={18} eager={index < 5} atOnce />
              <span className={`${NUM} text-[14px] font-medium text-oa-fg`}>{row.ticker}</span>
            </span>
            {toned ? (
              <span className="text-right">
                <RowTone counts={row.tones} stories={row.count} />
              </span>
            ) : null}
            {/* Today's price beside its move (owner rule 4), from the stock's latest quote. */}
            <span className="flex items-baseline justify-end gap-2 whitespace-nowrap">
              {row.price != null ? (
                <span className={`${NUM} text-[14px] text-oa-fg`}>
                  {fmtMoney(row.price)}
                </span>
              ) : null}
              {row.pct !== null ? <Delta value={row.pct} digits={1} className="text-[14px] font-medium" /> : null}
              {row.priceDay ? <span className="-ml-1 text-[12.5px] text-oa-muted-fg">{row.priceDay}</span> : null}
            </span>
          </span>
          {/* The top story, whole and in sentence case, so the row says what the talk is about. */}
          {row.lead ? <span className="mt-0.5 block text-pretty pl-[2rem] text-[13px] leading-[19px] text-oa-muted-fg">{buzzHighlight(row)}</span> : null}
        </Link>
      </li>
    );
  };
  const { good, bad, unread } = splitByTone(rows);
  return (
    <Panel flush label="Most talked about" className={className}>
      <ToneColumns good={good.map(item)} bad={bad.map(item)} unread={unread.map(item)} cut={5} variant="rows" label="Most talked about" ordered />
    </Panel>
  );
}
