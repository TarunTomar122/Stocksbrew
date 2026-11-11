import Link from "next/link";

import { Delta, FOCUS, NUM, Panel, Ticker } from "@/components/oa/kit";
import { StockLogo } from "@/components/stock-logo";
import { sentenceCase } from "@/lib/plain-copy";
import { leanOf, totalOf, type NewsTheme, type StockBuzz, type ToneCounts } from "@/lib/wire-read";
import { WIRE_PAGE_SIZE, etDay, etTime, wireHref, type WireFilters, type WireItem } from "@/lib/wire-shared";

const ET_WEEKDAY = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" });

/** "3:06 AM" today, "Mon 11:26 PM" for an earlier New York day. */
export function when(iso: string): string {
  const time = etTime(iso);
  return etDay(iso) === etDay(Date.now()) ? time : `${ET_WEEKDAY.format(new Date(iso))} ${time}`;
}

/** "75% negative": whichever side is larger, as a share of all the stories (neutral ones included). */
export function leanWords(counts: ToneCounts, total: number = totalOf(counts)): string {
  if (total <= 0) return "";
  if (counts.positive === 0 && counts.negative === 0) return "No clear lean";
  if (counts.positive === counts.negative) return "Evenly split";
  const positive = counts.positive > counts.negative;
  const share = Math.round(((positive ? counts.positive : counts.negative) / total) * 100);
  return `${share}% ${positive ? "positive" : "negative"}`;
}

function leanText(counts: ToneCounts): string {
  if (counts.positive > counts.negative) return "text-signal-bullish";
  if (counts.negative > counts.positive) return "text-signal-bearish";
  return "";
}

/**
 * How the news on something leans, in one figure ("75% negative"), with the three counts for screen readers.
 * Nothing at all when there are no labelled stories.
 */
export function ToneBar({ counts, className = "", showWord = false }: { counts: ToneCounts; className?: string; showWord?: boolean }) {
  const total = totalOf(counts);
  if (total === 0) return null;
  const lean = leanOf(counts);
  const word = lean === "positive" ? "Mostly positive" : lean === "negative" ? "Mostly negative" : "Mixed";
  const label = `${counts.positive} positive, ${counts.negative} negative, ${counts.neutral} neutral`;
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} title={label}>
      {/* "Mixed" only beside a figure; "Mixed No clear lean" would say the same thing twice. */}
      {showWord && lean === "mixed" && /%/.test(leanWords(counts, total)) ? <span className="text-[13px] font-medium text-oa-fg">{word}</span> : null}
      {/* No tone bar (owner, Nov 11): the one figure beside it says the same. */}
      <span className={`${NUM} inline-flex items-center gap-1.5 text-[12.5px] leading-[18px] text-oa-muted-fg`}>
        <span className="sr-only">{label}</span>
        {/* One figure, not two counts to compare (owner, Nov 11): the larger side as a share of all the stories. */}
        <span aria-hidden="true" className={leanText(counts)}>
          {leanWords(counts, total)}
        </span>
      </span>
    </span>
  );
}

/**
 * A source headline as a person would write it: a Scraped Title Case headline goes to sentence case (owner rule 8)
 * through the shared `sentenceCase`, the step the briefing's `unTitle` (components/briefing/card-words.ts) starts
 * with. `unTitle`'s second step, which lowers the last word of a capitalised run inside an ordinary headline, is
 * left out here: in the wire's headlines that run is usually a person ("Jensen Huang faces scrutiny" came out as
 * "Jensen huang"). A headline already written as a sentence stays exactly as its source wrote it.
 */
export function headlineWords(title: string, companyName = ""): string {
  return sentenceCase(title, companyName);
}

/**
 * One headline: linked, whole (never cut off), in sentence case, with its source and time. No tone mark on every
 * line (owner rule 1): the card or theme it sits in says the tone once.
 */
export function HeadlineLine({ item, companyName = "", className = "" }: { item: WireItem; companyName?: string; className?: string }) {
  return (
    <a href={item.url} target="_blank" rel="noopener noreferrer" title={item.excerpt || undefined} className={`group block rounded ${FOCUS} ${className}`}>
      <span className="block text-pretty text-[14px] leading-5 text-oa-fg group-hover:underline">{headlineWords(item.title, companyName)}</span>
      <span className={`${NUM} mt-0.5 block text-[12.5px] leading-[18px] text-oa-muted-fg`}>
        {item.source || "Unknown source"}
        {item.sourceKind === "press_release" ? " · release" : ""} · {when(item.publishedAt)}
      </span>
    </a>
  );
}

/**
 * The stories driving the news, stock first (owner rule 7): each theme leads with the stocks it moves and their
 * day, then its name and its one tone figure, then its best headlines as the evidence. On a wide screen it sits
 * beside Most talked about at one shared height and scrolls inside past that, so neither card is stretched over
 * empty space (owner rule 4).
 */
export function ThemesPanel({ themes, filters, className = "" }: { themes: NewsTheme[]; filters: WireFilters; className?: string }) {
  if (themes.length === 0) return null;
  // Fewer themes get more headlines each, so the card has real content to fill its height.
  const perTheme = themes.length <= 2 ? 6 : themes.length === 3 ? 4 : 3;
  return (
    <Panel fill flush label="What is driving the news" className={className}>
      <ol className="scrollbar-hide divide-y divide-oa-border lg:max-h-[30rem] lg:overflow-y-auto lg:overscroll-contain">
        {themes.map((theme) => {
          const href = wireHref({ ...filters, limit: WIRE_PAGE_SIZE }, { theme: theme.name, ticker: null, topic: null, q: "", mine: false });
          const lean = leanWords(theme.tones);
          const fresh = theme.prevCount === 0;
          return (
            <li key={theme.name} className="px-4 py-3">
              {theme.tickers.length ? (
                <div className="mb-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
                  {theme.tickers.slice(0, 5).map((row, index) => (
                    <span key={row.ticker} className="inline-flex items-center gap-1.5">
                      <Ticker symbol={row.ticker} size={index === 0 ? 22 : 16} className={index === 0 ? "text-[15px] font-semibold" : ""} />
                      {row.pct !== null ? <Delta value={row.pct} digits={1} className={index === 0 ? "text-[14px] font-medium" : "text-[12.5px]"} /> : null}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <h3 className="min-w-0 text-pretty text-[15px] font-semibold leading-[22px] text-oa-fg">
                  <Link href={href} prefetch={false} className={`rounded hover:underline ${FOCUS}`}>
                    {theme.name}
                  </Link>
                </h3>
                {/* One figure, the lean (owner rule 5); "new today" is said in words, not as a second count. */}
                {lean || fresh ? (
                  <span className={`${NUM} shrink-0 text-[12.5px] leading-[18px] text-oa-muted-fg`}>
                    {lean ? <span className={leanText(theme.tones)}>{lean}</span> : null}
                    {lean && fresh ? " · " : null}
                    {fresh ? "new today" : null}
                  </span>
                ) : null}
              </div>
              <ul className="mt-2 flex flex-col gap-2.5">
                {theme.items.slice(0, perTheme).map((item) => (
                  <li key={item.id}>
                    <HeadlineLine item={item} />
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

/**
 * The stocks with the most coverage right now, most first: the ticker, how its news leans (one figure) and the
 * day's move. No coverage bars (owner rule 5): the order already says who is talked about most. Every stock
 * shows, about eight rows at a time with the rest scrolling inside; on a wide screen the list takes the height
 * of the themes beside it.
 */
export function TalkedAbout({
  rows,
  filters,
  wide = false,
  className = "",
}: {
  rows: StockBuzz[];
  filters: WireFilters;
  /** Alone on its row (no themes beside it): two columns on a wide screen, every stock in view, so the card is never half empty. */
  wide?: boolean;
  className?: string;
}) {
  if (rows.length === 0) return null;
  const frame = wide
    ? "max-lg:max-h-[20.5rem] max-lg:overflow-y-auto max-lg:overscroll-contain"
    : "relative min-h-0 flex-1 max-lg:max-h-[20.5rem] max-lg:overflow-y-auto max-lg:overscroll-contain lg:min-h-[20.5rem]";
  const list = wide ? "gap-x-0 lg:columns-2" : "lg:absolute lg:inset-0 lg:overflow-y-auto lg:overscroll-contain";
  return (
    <Panel fill flush label="Most talked about" className={className}>
      <div className={`scrollbar-hide ${frame}`}>
        <ol className={`scrollbar-hide ${list}`}>
          {rows.map((row, index) => (
            <li key={row.ticker} className={`break-inside-avoid border-b border-oa-border hover:bg-oa-accent ${wide ? "" : "last:border-b-0"}`}>
              <Link
                href={wireHref({ ...filters, limit: WIRE_PAGE_SIZE }, { ticker: row.ticker, theme: null })}
                prefetch={false}
                className={`grid min-h-10 grid-cols-[1.25rem_minmax(0,1fr)_6.5rem_4rem] items-center gap-x-3 px-4 py-2 ${FOCUS}`}
              >
                <span className={`${NUM} text-[12.5px] text-oa-muted-fg`}>{index + 1}</span>
                <span className="flex min-w-0 items-center gap-2">
                  <StockLogo ticker={row.ticker} size={18} eager={index < 8} />
                  <span className={`${NUM} text-[14px] font-medium text-oa-fg`}>{row.ticker}</span>
                </span>
                {/* A fixed column, so the moves line up whether or not a stock's news has a lean. */}
                <span className="text-right">
                  <ToneBar counts={row.tones} />
                </span>
                <span className="text-right">{row.pct !== null ? <Delta value={row.pct} digits={1} className="text-[14px] font-medium" /> : null}</span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </Panel>
  );
}
