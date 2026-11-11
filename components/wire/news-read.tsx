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

/** Eight rows of Most talked about: the one scroll height both cards of the news read share. */
const LIST_HEIGHT = "max-h-[20.5rem]";
const LIST_HEIGHT_LG = "lg:max-h-[20.5rem]";

/** Fewer labelled stories than this is too thin to say how something's news leans. */
const MIN_FOR_LEAN = 3;

/**
 * "75% negative": the larger side as a share of all the stories (neutral ones included), only when the news clearly
 * leans one way. Nothing at all otherwise (owner rule 1): "No clear lean" on every card said nothing, many times.
 */
export function leanWords(counts: ToneCounts, total: number = totalOf(counts)): string {
  if (total < MIN_FOR_LEAN) return "";
  const lean = leanOf(counts);
  if (lean !== "positive" && lean !== "negative") return "";
  const share = Math.round(((lean === "positive" ? counts.positive : counts.negative) / total) * 100);
  return `${share}% ${lean}`;
}

function leanText(counts: ToneCounts): string {
  if (counts.positive > counts.negative) return "text-signal-bullish";
  if (counts.negative > counts.positive) return "text-signal-bearish";
  return "";
}

/**
 * How the news on something leans, in one figure ("75% negative"), with the three counts for screen readers.
 * Nothing at all when it does not clearly lean.
 */
export function ToneBar({ counts, className = "" }: { counts: ToneCounts; className?: string }) {
  const words = leanWords(counts);
  if (!words) return null;
  const label = `${counts.positive} positive, ${counts.negative} negative, ${counts.neutral} neutral`;
  return (
    <span className={`${NUM} inline-flex items-center text-[12.5px] leading-[18px] ${className}`} title={label}>
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" className={leanText(counts)}>
        {words}
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
 * beside Most talked about with the same scroll height (`LIST_HEIGHT`), each card sized to its own content, so
 * neither is stretched over empty space (owner rule 4).
 */
export function ThemesPanel({ themes, filters, className = "" }: { themes: NewsTheme[]; filters: WireFilters; className?: string }) {
  if (themes.length === 0) return null;
  // Fewer themes get more headlines each, so the card has real content up to the list's height.
  const perTheme = themes.length === 1 ? 8 : themes.length === 2 ? 5 : themes.length === 3 ? 4 : 3;
  return (
    <Panel flush label="What is driving the news" className={className}>
      <ol className={`scrollbar-hide divide-y divide-oa-border lg:overflow-y-auto lg:overscroll-contain ${LIST_HEIGHT_LG}`}>
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
 * shows, about eight rows at a time with the rest scrolling inside.
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
  // The tone column only when some stock's news leans; otherwise the moves sit right after the ticker.
  const toned = rows.some((row) => leanWords(row.tones) !== "");
  // About eight rows in view, the rest scrolling inside; alone on its row, every stock shows in two columns.
  const frame = wide ? "max-lg:max-h-[20.5rem] max-lg:overflow-y-auto max-lg:overscroll-contain" : `${LIST_HEIGHT} overflow-y-auto overscroll-contain`;
  const list = wide ? "gap-x-0 lg:columns-2" : "";
  return (
    <Panel flush label="Most talked about" className={className}>
      <div className={`scrollbar-hide ${frame}`}>
        <ol className={`scrollbar-hide ${list}`}>
          {rows.map((row, index) => (
            <li key={row.ticker} className={`break-inside-avoid border-b border-oa-border hover:bg-oa-accent ${wide ? "" : "last:border-b-0"}`}>
              <Link
                href={wireHref({ ...filters, limit: WIRE_PAGE_SIZE }, { ticker: row.ticker, theme: null })}
                prefetch={false}
                className={`grid min-h-10 ${toned ? "grid-cols-[1.25rem_minmax(0,1fr)_6.5rem_4rem]" : "grid-cols-[1.25rem_minmax(0,1fr)_4rem]"} items-center gap-x-3 px-4 py-2 ${FOCUS}`}
              >
                <span className={`${NUM} text-[12.5px] text-oa-muted-fg`}>{index + 1}</span>
                <span className="flex min-w-0 items-center gap-2">
                  <StockLogo ticker={row.ticker} size={18} eager={index < 8} />
                  <span className={`${NUM} text-[14px] font-medium text-oa-fg`}>{row.ticker}</span>
                </span>
                {/* A fixed column, so the moves line up whether or not a stock's news has a lean. */}
                {toned ? (
                  <span className="text-right">
                    <ToneBar counts={row.tones} />
                  </span>
                ) : null}
                <span className="text-right">{row.pct !== null ? <Delta value={row.pct} digits={1} className="text-[14px] font-medium" /> : null}</span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </Panel>
  );
}
