import Link from "next/link";

import { Delta, FOCUS, NUM, Panel, Ticker, ToneGlyph } from "@/components/oa/kit";
import { StockLogo } from "@/components/stock-logo";
import { balancePct } from "@/lib/insights";
import { leanOf, totalOf, type NewsTheme, type StockBuzz, type ToneCounts } from "@/lib/wire-read";
import { WIRE_PAGE_SIZE, etDay, etTime, wireHref, type WireFilters, type WireItem } from "@/lib/wire-shared";

const ET_WEEKDAY = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" });

/** "3:06 AM" today, "Mon 11:26 PM" for an earlier New York day. */
export function when(iso: string): string {
  const time = etTime(iso);
  return etDay(iso) === etDay(Date.now()) ? time : `${ET_WEEKDAY.format(new Date(iso))} ${time}`;
}

/**
 * How the news on something leans, as a short bar split good / routine / bad
 * with the counts beside it. Nothing at all when there are no labelled stories.
 */
export function ToneBar({ counts, className = "", showWord = false }: { counts: ToneCounts; className?: string; showWord?: boolean }) {
  const total = totalOf(counts);
  if (total === 0) return null;
  const pct = balancePct({ ...counts });
  const lean = leanOf(counts);
  const word = lean === "positive" ? "Mostly positive" : lean === "negative" ? "Mostly negative" : "Mixed";
  const label = `${counts.positive} positive, ${counts.negative} negative, ${counts.neutral} neutral`;
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} title={label}>
      {showWord ? <span className="text-[13px] font-medium text-oa-fg">{word}</span> : null}
      <span aria-hidden="true" className="flex h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-oa-bg">
        <span style={{ width: `${pct.positive}%`, background: "var(--signal-bullish)" }} />
        <span style={{ width: `${pct.neutral}%`, background: "color-mix(in srgb, var(--oa-muted-fg) 35%, transparent)" }} />
        <span style={{ width: `${pct.negative}%`, background: "var(--signal-bearish)" }} />
      </span>
      <span className={`${NUM} inline-flex items-center gap-1.5 text-[12.5px] leading-[18px] text-oa-muted-fg`}>
        <span className="sr-only">{label}</span>
        {/* Words, not bare triangles: readers could not tell what the counts were. */}
        <span aria-hidden="true">
          {counts.positive} good, {counts.negative} bad
        </span>
      </span>
    </span>
  );
}

/** One headline: linked, clamped, with its source and time, and its tone mark when it has one. */
export function HeadlineLine({ item, clamp = 2, className = "" }: { item: WireItem; clamp?: 1 | 2; className?: string }) {
  const tone = item.tone === "bullish" ? "up" : item.tone === "bearish" ? "down" : null;
  return (
    <a href={item.url} target="_blank" rel="noopener noreferrer" title={item.excerpt || undefined} className={`group flex gap-2 rounded ${FOCUS} ${className}`}>
      {tone ? <ToneGlyph tone={tone} className="mt-[5px]" /> : <span aria-hidden="true" className="mt-[7px] size-1.5 shrink-0 rounded-full bg-oa-border" />}
      <span className="min-w-0">
        <span className={`${clamp === 1 ? "line-clamp-1" : "line-clamp-2"} text-pretty text-[14px] leading-5 text-oa-fg group-hover:underline`}>{item.title}</span>
        <span className={`${NUM} mt-0.5 block truncate text-[12.5px] leading-[18px] text-oa-muted-fg`}>
          {item.source || "Unknown source"}
          {item.sourceKind === "press_release" ? " · release" : ""} · {when(item.publishedAt)}
        </span>
      </span>
    </a>
  );
}

function changeNote(count: number, prev: number): string | null {
  if (prev === 0) return "new today";
  if (count >= prev * 2) return `${prev} the day before`;
  return null;
}

/** The stories driving the news: each theme with its lean, the stocks it touches and its best headlines. */
export function ThemesPanel({ themes, filters, className = "" }: { themes: NewsTheme[]; filters: WireFilters; className?: string }) {
  if (themes.length === 0) return null;
  return (
    <Panel fill flush label="What is driving the news" className={className}>
      <ol className="divide-y divide-oa-border">
        {themes.map((theme) => {
          const note = changeNote(theme.count, theme.prevCount);
          const href = wireHref({ ...filters, limit: WIRE_PAGE_SIZE }, { theme: theme.name, ticker: null, topic: null, q: "", mine: false });
          const more = theme.count - Math.min(2, theme.items.length);
          return (
            <li key={theme.name} className="px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <h3 className="min-w-0 text-[15px] font-semibold leading-[22px] text-oa-fg">
                  <Link href={href} prefetch={false} className={`rounded hover:underline ${FOCUS}`}>
                    {theme.name}
                  </Link>
                </h3>
                <span className="flex shrink-0 items-center gap-3">
                  <ToneBar counts={theme.tones} />
                  <span className={`${NUM} text-[12.5px] text-oa-muted-fg`}>
                    {theme.count} stories{note ? ` · ${note}` : ""}
                  </span>
                </span>
              </div>
              {theme.tickers.length ? (
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                  {theme.tickers.slice(0, 5).map((row) => (
                    <span key={row.ticker} className="inline-flex items-center gap-1.5">
                      <Ticker symbol={row.ticker} size={16} />
                      {row.pct !== null ? <Delta value={row.pct} digits={1} className="text-[12.5px]" /> : null}
                    </span>
                  ))}
                </div>
              ) : null}
              <ul className="mt-2 flex flex-col gap-2">
                {theme.items.slice(0, 2).map((item) => (
                  <li key={item.id}>
                    <HeadlineLine item={item} clamp={1} />
                  </li>
                ))}
              </ul>
              {more > 0 ? (
                <Link href={href} prefetch={false} className={`mt-1.5 inline-block rounded text-[13px] font-medium text-oa-primary hover:underline ${FOCUS}`}>
                  {more} more →
                </Link>
              ) : null}
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

/** The stocks with the most coverage right now: share of the talk, its lean, the day's move. */
export function TalkedAbout({ rows, filters, className = "" }: { rows: StockBuzz[]; filters: WireFilters; className?: string }) {
  if (rows.length === 0) return null;
  const top = Math.max(...rows.map((row) => row.share), 1);
  return (
    <Panel fill flush label="Most talked about" right={<span>share of coverage</span>} className={className}>
      <ol>
        {rows.map((row, index) => (
          <li key={row.ticker} className={`border-b border-oa-border last:border-b-0 hover:bg-oa-accent ${index >= 10 ? "max-lg:hidden" : ""}`}>
            <Link
              href={wireHref({ ...filters, limit: WIRE_PAGE_SIZE }, { ticker: row.ticker, theme: null })}
              prefetch={false}
              className={`grid grid-cols-[1.25rem_minmax(0,1fr)_auto_4rem] items-center gap-x-3 px-4 py-2 ${FOCUS}`}
            >
              <span className={`${NUM} text-[12.5px] text-oa-muted-fg`}>{index + 1}</span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="flex min-w-0 items-center gap-2">
                  <StockLogo ticker={row.ticker} size={18} />
                  <span className={`${NUM} text-[14px] font-medium text-oa-fg`}>{row.ticker}</span>
                  <span className={`${NUM} text-[12.5px] text-oa-muted-fg`}>{row.share}%</span>
                </span>
                <span aria-hidden="true" className="block h-1 w-full max-w-[9rem] overflow-hidden rounded-full bg-oa-bg">
                  <span className="block h-full rounded-full bg-oa-primary" style={{ width: `${Math.max(4, (row.share / top) * 100)}%` }} />
                </span>
              </span>
              <span className="flex flex-col items-end gap-0.5">
                <ToneBar counts={row.tones} />
                <span className={`${NUM} text-[12px] text-oa-muted-fg`}>{row.count} stories</span>
              </span>
              <span className="text-right">{row.pct !== null ? <Delta value={row.pct} digits={1} className="text-[14px] font-medium" /> : null}</span>
            </Link>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
