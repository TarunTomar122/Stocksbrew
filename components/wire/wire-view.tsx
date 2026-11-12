import Link from "next/link";

import { Delta, Empty, FOCUS, NUM, Panel, Ticker } from "@/components/oa/kit";
import { StockLogo } from "@/components/stock-logo";
import { ToneBar, headlineWords, leanWords } from "@/components/wire/news-read";
import type { WireQuote } from "@/lib/wire";
import type { ToneCounts } from "@/lib/wire-read";
import {
  WIRE_PAGE_SIZE,
  WIRE_TOPICS,
  etTime,
  hasActiveFilter,
  wireHref,
  type WireDay,
  type WireFilters,
  type WireItem,
  type WireTopic,
} from "@/lib/wire-shared";

const CHIP =
  "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border px-3 text-[14px] transition-colors lg:h-8 " + FOCUS;
const CHIP_ON = "border-[color-mix(in_srgb,var(--ink)_55%,transparent)] bg-oa-card font-medium text-oa-fg";
const CHIP_OFF = "border-oa-border text-oa-muted-fg hover:bg-oa-accent hover:text-oa-fg";
const FIELD = "h-10 rounded-md border border-oa-border bg-oa-card px-3 text-[14px] text-oa-fg placeholder:text-oa-muted-fg lg:h-8 " + FOCUS;

/* ── Filters ───────────────────────────────────────────────────────────── */

/** Search and ticker, small enough to sit on the title row. */
export function WireSearch({ filters }: { filters: WireFilters }) {
  return (
    <form action="/news" method="get" className="flex items-center gap-2">
      {filters.topic ? <input type="hidden" name="topic" value={filters.topic} /> : null}
      {filters.mine ? <input type="hidden" name="mine" value="1" /> : null}
      <label className="sr-only" htmlFor="wire-q">
        Search headlines
      </label>
      <input id="wire-q" name="q" type="search" defaultValue={filters.q} placeholder="Search" autoComplete="off" className={`${FIELD} w-[8.5rem] min-w-0 sm:w-56`} />
      <label className="sr-only" htmlFor="wire-ticker">
        Ticker
      </label>
      <input
        id="wire-ticker"
        name="ticker"
        type="text"
        defaultValue={filters.ticker ?? ""}
        placeholder="Ticker"
        autoComplete="off"
        autoCapitalize="characters"
        maxLength={8}
        className={`${NUM} ${FIELD} w-[4.75rem] !px-2 uppercase placeholder:normal-case sm:w-24`}
      />
      <button type="submit" aria-label="Filter the wire" className={`${FIELD} !px-2.5 font-medium hover:bg-oa-accent`}>
        <span className="max-sm:hidden">Filter</span>
        <span aria-hidden="true" className="sm:hidden">→</span>
      </button>
    </form>
  );
}

/** One row of topic chips. */
export function WireFilterBar({
  filters,
  topicCounts,
  mineCount,
  signedIn,
}: {
  filters: WireFilters;
  topicCounts: Record<WireTopic, number>;
  /** Headlines that touch the signed-in person's stocks; null when they track none. */
  mineCount: number | null;
  signedIn: boolean;
}) {
  const base = { ...filters, limit: WIRE_PAGE_SIZE };
  return (
    <div className="oa-scroll-fade -mx-2 mb-3 flex items-center gap-2 overflow-x-auto px-4 pr-9 [scrollbar-width:none] sm:mx-0 sm:px-0 lg:flex-wrap [&::-webkit-scrollbar]:hidden">
      <Link prefetch={false} href={wireHref(base, { topic: null })} aria-current={!filters.topic ? "true" : undefined} className={`${CHIP} ${!filters.topic ? CHIP_ON : CHIP_OFF}`}>
        Everything
      </Link>
      {WIRE_TOPICS.map((topic) => {
        const active = filters.topic === topic.id;
        return (
          <Link prefetch={false} key={topic.id} href={wireHref(base, { topic: active ? null : topic.id })} aria-current={active ? "true" : undefined} className={`${CHIP} ${active ? CHIP_ON : CHIP_OFF}`}>
            {topic.label}
            <span className={`${NUM} text-[12.5px] text-oa-muted-fg`}>{topicCounts[topic.id]}</span>
          </Link>
        );
      })}
      {signedIn && mineCount !== null ? (
        <Link prefetch={false} href={wireHref(base, { mine: !filters.mine })} aria-current={filters.mine ? "true" : undefined} className={`${CHIP} ${filters.mine ? CHIP_ON : CHIP_OFF}`}>
          My stocks
          <span className={`${NUM} text-[12.5px] text-oa-muted-fg`}>{mineCount}</span>
        </Link>
      ) : null}
      {hasActiveFilter(filters) ? (
        <Link prefetch={false} href="/news" className={`shrink-0 rounded px-1.5 text-[14px] text-oa-muted-fg underline decoration-oa-border underline-offset-2 hover:text-oa-fg ${FOCUS}`}>
          Clear all
        </Link>
      ) : null}
    </div>
  );
}

/* ── Stream ────────────────────────────────────────────────────────────── */

function TickerMove({ ticker, quote, filters }: { ticker: string; quote: WireQuote | undefined; filters: WireFilters }) {
  return (
    <Link prefetch={false}
      href={wireHref({ ...filters, limit: WIRE_PAGE_SIZE }, { ticker })}
      title={quote?.name ? `${quote.name}: filter the wire to ${ticker}` : `Filter the wire to ${ticker}`}
      className={`inline-flex items-baseline gap-1 rounded text-[12.5px] hover:underline max-lg:min-h-8 max-lg:items-center ${FOCUS}`}
    >
      <StockLogo ticker={ticker} size={14} className="mr-0.5 self-center" />
      <span className={`${NUM} font-medium text-oa-fg`}>{ticker}</span>
      {quote?.pct != null ? <Delta value={quote.pct} digits={1} className="text-[12.5px]" /> : null}
    </Link>
  );
}

/**
 * One headline, one line: time, source, headline, the tickers it names with
 * today's move. A press release is said in a word, because most rows are not one.
 */
function WireRow({ item, quotes, filters }: { item: WireItem; quotes: Record<string, WireQuote>; filters: WireFilters }) {
  const shown = item.tickers.slice(0, 3);
  const extra = item.tickers.length - shown.length;
  const kind = item.sourceKind === "official" ? "official release" : item.sourceKind === "press_release" ? "press release" : null;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-x-3 border-b border-oa-border px-4 py-2.5 last:border-b-0 hover:bg-oa-accent lg:grid-cols-[4.25rem_8rem_minmax(0,1fr)_auto] lg:items-baseline lg:py-2">
      <p className={`${NUM} flex gap-x-2 text-[12.5px] leading-5 text-oa-muted-fg lg:contents`}>
        <time dateTime={item.publishedAt} className="shrink-0">
          {etTime(item.publishedAt)}
        </time>
        <span className="min-w-0 truncate" title={item.source || undefined}>
          {item.source || "Source not given"}
        </span>
      </p>
      {/* The whole headline in sentence case (owner rule 8); its tone is said once above the stream, not on every row. */}
      <p className="min-w-0 text-pretty text-[15px] font-medium leading-[22px] text-oa-fg lg:text-[14px] lg:leading-5">
        <a href={item.url} target="_blank" rel="noopener noreferrer" className={`rounded hover:underline ${FOCUS}`}>
          {headlineWords(item.title)}
        </a>
        {kind ? <span className="ml-2 whitespace-nowrap text-[12.5px] font-normal text-oa-muted-fg">{kind}</span> : null}
      </p>
      {shown.length ? (
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 max-lg:items-center lg:mt-0 lg:max-w-[17rem] lg:justify-end">
          {shown.map((ticker) => (
            <TickerMove key={ticker} ticker={ticker} quote={quotes[ticker]} filters={filters} />
          ))}
          {extra > 0 ? <span className={`${NUM} text-[12.5px] text-oa-muted-fg`}>+{extra}</span> : null}
        </div>
      ) : (
        <span className="hidden lg:block" />
      )}
    </div>
  );
}

export function WireStream({
  days,
  quotes,
  filters,
  shown,
  total,
}: {
  days: WireDay[];
  quotes: Record<string, WireQuote>;
  filters: WireFilters;
  shown: number;
  total: number;
}) {
  if (days.length === 0) {
    return (
      <Panel flush>
        <Empty title="No headlines match these filters">
          {filters.ticker
            ? `No headlines on ${filters.ticker} in the last 14 days.`
            : "Try a wider topic or clear the search."}
        </Empty>
      </Panel>
    );
  }
  return (
    <Panel flush>
      {days.map((group) => (
        <div key={group.day}>
          {/* Not the kit's sticky StreamDay: inside a Panel (overflow hidden) its mobile offset covers the first row. */}
          <h2 className="oa-caption flex items-center justify-between gap-3 border-b border-oa-border bg-oa-bg px-4 py-1.5">
            <span>{group.label}</span>
            <span className={`${NUM} text-oa-muted-fg`}>{group.items.length}</span>
          </h2>
          {group.items.map((item) => (
            <WireRow key={item.id} item={item} quotes={quotes} filters={filters} />
          ))}
        </div>
      ))}
      {shown < total ? (
        <div className="border-t border-oa-border p-2 text-center">
          <Link
            href={wireHref(filters, { limit: filters.limit + WIRE_PAGE_SIZE })}
            scroll={false}
            className={`inline-block rounded-md px-3 py-1.5 text-[14px] font-medium text-oa-muted-fg hover:bg-oa-accent hover:text-oa-fg ${FOCUS}`}
          >
            Show {Math.min(WIRE_PAGE_SIZE, total - shown)} more of {total - shown}
          </Link>
        </div>
      ) : null}
    </Panel>
  );
}

/** Shown above the stream when the wire is filtered to one name. */
export function TickerStrip({
  ticker,
  quote,
  count,
  tones,
  toneStories,
  filters,
}: {
  ticker: string;
  quote: WireQuote | undefined;
  count: number;
  /** How its headlines lean, said once here instead of on every row below. */
  tones?: ToneCounts;
  /** How many stories `tones` was counted over, labelled or not. */
  toneStories?: number;
  filters: WireFilters;
}) {
  return (
    <div className="oa-surface mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 border border-oa-border bg-oa-card px-4 py-3">
      <Ticker symbol={ticker} name={quote?.name && quote.name !== ticker ? quote.name : null} size={22} />
      {quote?.pct != null ? (
        <span className="text-[14px] text-oa-muted-fg">
          <Delta value={quote.pct} /> today
        </span>
      ) : null}
      <span className={`${NUM} text-[14px] text-oa-muted-fg`}>
        {count} headline{count === 1 ? "" : "s"} in 14 days
      </span>
      {/* The lean is over the last day's stories, so it says "today" beside the 14-day count. */}
      {tones && leanWords(tones, toneStories) ? (
        <span className="text-[14px] text-oa-muted-fg">
          <ToneBar counts={tones} stories={toneStories} className="[&_span]:text-[14px]" /> today
        </span>
      ) : null}
      <span className="ml-auto flex items-center gap-3 text-[14px]">
        <Link prefetch={false} href={`/stock/${encodeURIComponent(ticker)}`} className={`rounded font-medium text-oa-primary hover:underline ${FOCUS}`}>
          Open {ticker}
        </Link>
        <Link prefetch={false} href={wireHref({ ...filters, limit: WIRE_PAGE_SIZE }, { ticker: null })} className={`rounded text-oa-muted-fg hover:text-oa-fg hover:underline ${FOCUS}`}>
          Remove filter
        </Link>
      </span>
    </div>
  );
}

