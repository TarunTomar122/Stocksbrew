import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import {
  loadDeskBrief,
  loadDeskCalendar,
  loadDeskFollow,
  loadDeskMarkets,
  loadDeskMovers,
  loadDeskScreens,
  loadDeskSignals,
  loadDeskStrategies,
  loadDeskThemes,
  loadDeskWire,
  todayET,
  type DeskBrief,
  type DeskData,
  type DeskMover,
} from "@/app/(app)/explore/desk-data";
import { TheRead } from "@/components/oa/insight";
import { AskBox } from "@/components/explore-desk/ask-box";
import { ToneBar } from "@/components/wire/news-read";
import {
  AppPage,
  Delta,
  Empty,
  FOCUS,
  MoveBar,
  NUM,
  PageHead,
  Panel,
  ShowMore,
  SourceLine,
  Sparkline,
  Tag,
  Ticker,
  Verdict,
  fmtAgo,
  fmtDay,
  fmtMoney,
  fmtStampET,
  toneText,
} from "@/components/oa/kit";
import { Bar, PanelGhost } from "@/components/oa/kit/skeleton";
import { EXPLORE_SUGGESTIONS } from "@/lib/ask-config";
import { followTakeaway, mergeDeskRead, strategiesTakeaway } from "@/lib/explore-insights";
import { fmtFrac, type ActivityItem } from "@/lib/follow-shared";
import { moodWord, netSide, type ToneWord } from "@/lib/tone";
import { ogImage } from "@/lib/og/url";
import { sentenceCase } from "@/lib/plain-copy";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  const shareImage = ogImage(["page", "explore"], "Today's read of the US stock market", { daily: true });
  return {
    title: "Stock Research Today: Top Stories, Movers and Ideas",
    description:
      "The stocksbrew research desk: ask the copilot, then read today's top stories, the biggest movers with a confirmed reason, what reports today, and previews of the screener, themes, signals, markets, strategies and followed investors.",
    keywords: ["stock research", "stock screener", "market movers today", "earnings today", "investment themes", "13F filings", "insider trades"],
    alternates: { canonical: "/explore" },
    openGraph: {
      title: "Stock Research Today: Top Stories, Movers and Ideas · stocksbrew",
      description: "Ask a question, then read what moved today and why, with the source and time on every number.",
      url: "https://www.stocksbrew.online/explore",
      images: [shareImage],
    },
    twitter: {
      card: "summary_large_image",
      title: "Explore · stocksbrew",
      description: "Ask a question, then read what moved today and why, with the source and time on every number.",
      images: [shareImage],
    },
  };
}

/** Each desk preview shows this many rows, so a row of panels carries the same weight. */
const DESK_ROWS = 4;

const SESSION: Record<string, string> = { bmo: "Before open", amc: "After close", during: "In session" };

/** "$0.52" or "−$0.52": the sign goes before the currency. */
function signedMoney(value: number): string {
  return `${value < 0 ? "−" : ""}${fmtMoney(Math.abs(value))}`;
}

const BOUGHT = new Set(["new", "added", "buy"]);
const SOLD = new Set(["reduced", "sold", "sell"]);

/**
 * Which way a lawmaker's report leaned, weighed by the middle of each dollar
 * bracket. Only when it both bought and sold: one-sided, the sentence says it.
 * A 13F preview carries a few lines per side with no dollars, too few to weigh,
 * so funds get no chip here (their own page weighs the whole filing).
 */
function filingLean(kind: string, items: ActivityItem[]): ToneWord | null {
  if (kind === "fund") return null;
  const known = items.filter((item) => BOUGHT.has(item.action) || SOLD.has(item.action));
  if (!known.some((item) => BOUGHT.has(item.action)) || !known.some((item) => SOLD.has(item.action))) return null;
  const priced = known.every((item) => item.amount_low != null);
  let bought = 0;
  let sold = 0;
  for (const item of known) {
    const size = priced ? ((item.amount_low ?? 0) + (item.amount_high ?? item.amount_low ?? 0)) / 2 : 1;
    if (BOUGHT.has(item.action)) bought += size;
    else sold += size;
  }
  return netSide(bought, sold);
}

/** Bullish, bearish or mixed as a chip; a neutral or unread lean gets nothing. */
function MoodChip({ raw }: { raw: string | null | undefined }) {
  const mood = String(raw ?? "").trim().toLowerCase() === "neutral" ? null : moodWord(raw);
  return mood ? <Verdict tone={mood.tone}>{mood.word}</Verdict> : null;
}

function askHref(question: string): string {
  return `/ask?q=${encodeURIComponent(question)}`;
}

function OpenLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className={`rounded font-medium text-oa-fg underline decoration-oa-border underline-offset-2 hover:decoration-oa-fg ${FOCUS}`}>
      {children}
    </a>
  );
}

/**
 * A way to ask about one row. With `quiet` it stays out of the way until the
 * row is hovered or focused (desktop); a phone has Ask in its own panel.
 */
function AskLink({ question, children = "Ask", quiet = false }: { question: string; children?: React.ReactNode; quiet?: boolean }) {
  return (
    <a
      href={askHref(question)}
      className={`h-6 shrink-0 items-center rounded border border-oa-border bg-oa-card px-1.5 text-[12.5px] font-medium text-oa-muted-fg hover:border-[color-mix(in_srgb,var(--oa-primary)_40%,transparent)] hover:text-oa-primary ${FOCUS} ${
        quiet ? "hidden opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 lg:inline-flex" : "inline-flex"
      }`}
    >
      {children}
    </a>
  );
}

/* ── cross-asset strip ──────────────────────────────────────────────────── */

function MarketsStrip({ markets }: { markets: NonNullable<DeskData["markets"]> }) {
  const asOf = fmtStampET(markets.as_of);
  return (
    <section aria-label="Markets" className="mb-4">
      {/* One slim row of context above the lead: it scrolls sideways on a phone instead of stacking. */}
      <ul className="oa-scroll-fade -mx-2 flex gap-x-6 overflow-x-auto px-4 pr-9 [scrollbar-width:none] sm:mx-0 sm:px-0 sm:pr-0 lg:flex-wrap lg:justify-between lg:gap-y-1 [&::-webkit-scrollbar]:hidden">
        {markets.tiles.map((tile) => (
          <li key={tile.id} className="shrink-0">
            <a href={tile.href} className={`block rounded py-0.5 hover:underline ${FOCUS}`}>
              <span className="block whitespace-nowrap text-[12.5px] leading-[18px] text-oa-muted-fg">{tile.name}</span>
              <span className="flex items-baseline gap-2 whitespace-nowrap">
                <span className={`${NUM} text-[14px] font-medium leading-5 text-oa-fg`}>{tile.level}</span>
                <span className={`${NUM} text-[12.5px] leading-5 ${toneText(tile.tone)}`}>{tile.change ?? "n/a"}</span>
              </span>
            </a>
          </li>
        ))}
        {asOf ? (
          <li className="shrink-0 self-end pb-0.5 text-[12.5px] leading-5 text-oa-muted-fg">as of {asOf}</li>
        ) : null}
      </ul>
    </section>
  );
}

/** A panel's first row: what the rows under it add up to, in one sentence. Nothing when the data has no line to give. */
function Takeaway({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  return <p className="border-b border-oa-border px-4 py-2.5 text-pretty text-[14px] font-medium leading-5 text-oa-fg">{text}</p>;
}

/* ── movers ─────────────────────────────────────────────────────────────── */

/**
 * One side of the lead: the names that moved most, largest first. A reason is
 * printed only when it was confirmed against a source; a name with no line
 * under it has none yet, and the panel says so once.
 */
function MoverRows({ title, rows }: { title: string; rows: DeskMover[] }) {
  const max = Math.max(0, ...rows.map((row) => Math.abs(row.changePct ?? 0)));
  return (
    <div className="min-w-0">
      <p className="oa-caption border-b border-oa-border bg-oa-bg px-4 py-1.5">{title}</p>
      <ul data-track-links="mover_opened" data-track-list={title.toLowerCase().slice(0, 30)} className="max-sm:[&>li:nth-child(n+4)]:hidden">
        {rows.map((row) => (
          <li key={row.ticker} className="group border-b border-oa-border px-4 py-2 last:border-b-0 hover:bg-oa-accent">
            <div className="flex items-center justify-between gap-3">
              <Ticker symbol={row.ticker} name={row.name && row.name.toUpperCase() !== row.ticker.toUpperCase() ? row.name : null} wrap className="min-w-0" />
              <span className="flex shrink-0 items-center gap-3">
                <AskLink quiet question={`Why did ${row.ticker} move today, and what does it change?`}>Ask why</AskLink>
                {row.price !== null ? <span className={`${NUM} hidden text-[12.5px] text-oa-muted-fg sm:inline`}>{fmtMoney(row.price)}</span> : null}
                <MoveBar value={row.changePct} max={max} width={48} className="max-sm:hidden" />
                <Delta value={row.changePct} className="w-[4.5rem] text-right text-[15px] font-medium" />
              </span>
            </div>
            {row.reason ? (
              <p className="mt-0.5 max-w-[68ch] text-pretty pl-7 text-[14px] leading-5 text-oa-muted-fg">{row.reason}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── the panels, one per source ─────────────────────────────────────────── */

/** Stocks in the news: one row per stock, ranked by how much is being said about it now. */
async function StoriesPanel({ wire, nowMs }: { wire: Promise<DeskData["wire"]>; nowMs: number }) {
  // The panel's own read is folded into the page's read at the top; the panel opens on its stock rows.
  const { stocks } = await wire;
  return (
    <Panel fill label="Stocks in the news" right={<OpenLink href="/news">Open the wire</OpenLink>} flush>
      {stocks.length === 0 ? (
        <Empty title="The wire is quiet">No stock has made the news yet today.</Empty>
      ) : (
        <ul>
          {stocks.map((stock) => (
            <li key={stock.ticker} className="border-b border-oa-border px-4 py-2.5 last:border-b-0 hover:bg-oa-accent">
              <div className="flex items-center justify-between gap-3">
                <Ticker symbol={stock.ticker} name={stock.name} size={18} wrap className="min-w-0" />
                <span className="flex shrink-0 items-center gap-3">
                  <ToneBar counts={stock.tones} className="max-sm:hidden" />
                  {stock.pct !== null ? <Delta value={stock.pct} digits={1} className="w-[4.25rem] text-right text-[14px] font-medium" /> : null}
                </span>
              </div>
              <a
                href={stock.lead.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`mt-1 block max-w-[72ch] text-pretty pl-[26px] text-[14px] leading-5 text-oa-fg hover:underline ${FOCUS}`}
              >
                {sentenceCase(stock.lead.title)}
              </a>
              <p className={`${NUM} mt-0.5 flex flex-wrap items-center gap-x-2 pl-[26px] text-[12.5px] leading-[18px] text-oa-muted-fg`}>
                <span className="min-w-0 truncate">{stock.lead.source || "Unknown source"}</span>
                <span aria-hidden="true">·</span>
                <span>{fmtAgo(stock.lead.publishedAt, nowMs)}</span>
                <span aria-hidden="true">·</span>
                <Link href={`/news?ticker=${encodeURIComponent(stock.ticker)}`} prefetch={false} className={`rounded hover:text-oa-fg hover:underline ${FOCUS}`}>
                  {stock.count} {stock.count === 1 ? "story" : "stories"}
                </Link>
                <ToneBar counts={stock.tones} className="sm:hidden" />
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** The lead: what is moving today and why. */
async function MoversPanel({ movers: pending }: { movers: Promise<DeskData["movers"]> }) {
  const movers = await pending;
  const all = [...movers.up, ...movers.down];
  const asOf = movers.asOf ? fmtStampET(movers.asOf) : "";
  return (
    <Panel
      label="What is moving today, and why"
      right={
        <>
          {asOf ? <span className="hidden sm:inline">as of {asOf}</span> : null}
          <OpenLink href="/signals">All movers</OpenLink>
        </>
      }
      flush
      className="mb-5"
    >
      {all.length > 0 ? (
        <>
          <Takeaway text={movers.takeaway} />
          <div className={`grid ${movers.up.length > 0 && movers.down.length > 0 ? "lg:grid-cols-2" : ""} lg:divide-x lg:divide-oa-border max-lg:[&>*+*]:border-t max-lg:[&>*+*]:border-oa-border`}>
            {movers.up.length > 0 ? <MoverRows title="Biggest gains" rows={movers.up} /> : null}
            {movers.down.length > 0 ? <MoverRows title="Biggest drops" rows={movers.down} /> : null}
          </div>
          {asOf ? (
            <p className="border-t border-oa-border bg-oa-bg px-4 py-1.5 text-[12.5px] leading-[18px] text-oa-muted-fg sm:hidden">
              As of {asOf}.
            </p>
          ) : null}
        </>
      ) : (
        <Empty title="No big movers yet">Nothing has moved enough to flag today.</Empty>
      )}
    </Panel>
  );
}

async function CalendarPanel({ calendar, brief, today }: { calendar: Promise<Pick<DeskData, "earnings" | "ipos">>; brief: Promise<DeskBrief>; today: string }) {
  const [{ earnings, ipos }, { calendarLine }] = await Promise.all([calendar, brief]);
  return (
    <Panel fill className="min-h-0" label={`On the calendar · ${fmtDay(today)}`} right={<OpenLink href="/calendar">Open calendar</OpenLink>} flush>
      {earnings.today.length === 0 && earnings.next.length === 0 && ipos.length === 0 ? (
        <Empty title="Nothing scheduled">No earnings or IPOs in the next week.</Empty>
      ) : (
        <>
          <Takeaway text={calendarLine} />
          {earnings.today.length > 0 ? (
            <ul>
              {earnings.today.map((event) => (
                <li key={`${event.ticker}-today`} className="flex items-center justify-between gap-3 border-b border-oa-border px-4 py-2 last:border-b-0">
                  <Ticker symbol={event.ticker} name={event.company} wrap className="min-w-0" />
                  <span className="flex shrink-0 items-center gap-2">
                    {event.eps_estimate !== null ? (
                      <span className={`${NUM} hidden text-[12.5px] text-oa-muted-fg sm:inline lg:hidden xl:inline`}>EPS est. {signedMoney(event.eps_estimate)}</span>
                    ) : null}
                    <Tag tone="primary">{SESSION[event.time] ?? "Today"}</Tag>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="border-b border-oa-border px-4 py-2.5 text-[14px] text-oa-muted-fg">No earnings today.</p>
          )}
          {earnings.next.length > 0 ? (
            <p className="border-b border-oa-border px-4 py-2.5 text-[14px] leading-6 text-oa-muted-fg last:border-b-0">
              <span className="oa-caption mr-2">Next up</span>
              {earnings.next.map((event, index) => (
                <span key={`${event.ticker}-${event.event_date}`}>
                  {index > 0 ? <span className="mx-1.5" aria-hidden="true">·</span> : null}
                  <a href={`/stock/${event.ticker}`} className={`${NUM} font-medium text-oa-fg hover:underline`}>
                    {event.ticker}
                  </a>{" "}
                  <span className={NUM}>{fmtDay(event.event_date)}</span>
                </span>
              ))}
            </p>
          ) : null}
          {ipos.length > 0 ? (
            <p className="border-b border-oa-border px-4 py-2.5 text-[14px] leading-6 text-oa-muted-fg last:border-b-0">
              <span className="oa-caption mr-2">IPOs</span>
              {ipos.map((ipo, index) => (
                <span key={`${ipo.ticker}-${ipo.ipo_date}`}>
                  {index > 0 ? <span className="mx-1.5" aria-hidden="true">·</span> : null}
                  <span className="text-oa-fg">{ipo.company}</span> <span className={NUM}>{fmtDay(ipo.ipo_date)}</span>
                </span>
              ))}
            </p>
          ) : null}
        </>
      )}
    </Panel>
  );
}

async function ScreensPanel({ screens: pending }: { screens: Promise<DeskData["screens"]> }) {
  const screens = await pending;
  return (
    <Panel fill label="Screener" right={<OpenLink href="/screener">Open</OpenLink>} flush>
      {screens.items.length === 0 ? (
        <Empty>No screen results yet today.</Empty>
      ) : (
        <>
          <Takeaway text={screens.takeaway} />
          <ul>
            {screens.items.slice(0, DESK_ROWS).map((screen) => (
              <li key={screen.id} className="border-b border-oa-border px-4 py-2 last:border-b-0">
                <div className="flex items-baseline justify-between gap-3">
                  <a href={`/screens/${screen.id}`} className={`min-w-0 truncate text-[14px] font-medium text-oa-fg hover:underline ${FOCUS}`}>
                    {screen.title}
                  </a>
                  <span className={`${NUM} shrink-0 text-[12.5px] text-oa-muted-fg`}>
                    {screen.matchCount} {screen.matchCount === 1 ? "match" : "matches"}
                  </span>
                </div>
                <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                  {screen.top.map((row) => (
                    <span key={row.ticker} className="inline-flex items-baseline gap-1.5">
                      <a href={`/stock/${row.ticker}`} className={`${NUM} text-[12.5px] font-medium text-oa-fg hover:underline`}>
                        {row.ticker}
                      </a>
                      {row.changePct !== null ? <Delta value={row.changePct} className="text-[12px]" /> : null}
                    </span>
                  ))}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

async function ThemesPanel({ themes: pending }: { themes: Promise<DeskData["themes"]> }) {
  const themes = await pending;
  return (
    <Panel fill label="Themes" right={<OpenLink href="/themes">Open</OpenLink>} flush>
      {themes.length === 0 ? (
        <Empty>No themes are published yet.</Empty>
      ) : (
        <>
          <ul>
            {themes.slice(0, DESK_ROWS).map((theme) => (
              <li key={theme.slug} className="group border-b border-oa-border px-4 py-2 last:border-b-0">
                <div className="flex items-baseline justify-between gap-3">
                  <a href={`/themes/${theme.slug}`} className={`min-w-0 truncate text-[14px] font-medium text-oa-fg hover:underline ${FOCUS}`}>
                    {theme.name}
                  </a>
                  <AskLink quiet question={`Build me a basket for the ${theme.name} theme.`}>Build a basket</AskLink>
                </div>
                <p className={`${NUM} mt-0.5 truncate text-[12.5px] text-oa-muted-fg`}>{theme.tickers.join("  ")}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

async function SignalsPanel({ signals, brief, nowMs }: { signals: Promise<Pick<DeskData, "reddit" | "posts">>; brief: Promise<DeskBrief>; nowMs: number }) {
  const [{ reddit, posts }, { signalsLine }] = await Promise.all([signals, brief]);
  const hasSignals = reddit.items.length + posts.items.length > 0;
  return (
    <Panel fill label="Signals" right={<OpenLink href="/signals">Open</OpenLink>} flush>
      {hasSignals ? (
        <>
          <Takeaway text={signalsLine} />
          <ul>
            {reddit.items.slice(0, DESK_ROWS / 2).map((row) => (
              <li key={`r-${row.ticker}`} className="border-b border-oa-border px-4 py-2 last:border-b-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <a href={`/stock/${row.ticker}`} className={`${NUM} text-[14px] font-medium text-oa-fg hover:underline`}>
                      {row.ticker}
                    </a>
                    <span className="text-[12.5px] text-oa-muted-fg">Reddit</span>
                    <MoodChip raw={row.sentiment} />
                  </span>
                  <span className={`${NUM} shrink-0 text-[12.5px] text-oa-muted-fg`}>{row.mentions} mentions</span>
                </div>
                {row.summary ? <p className="mt-0.5 text-[12.5px] leading-[18px] text-oa-muted-fg">{row.summary}</p> : null}
              </li>
            ))}
            {posts.items.slice(0, DESK_ROWS - Math.min(reddit.items.length, DESK_ROWS / 2)).map((post) => (
              <li key={`p-${post.url}`} className="border-b border-oa-border px-4 py-2 last:border-b-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <a href={`/stock/${post.ticker}`} className={`${NUM} text-[14px] font-medium text-oa-fg hover:underline`}>
                      {post.ticker}
                    </a>
                    <span className="text-[12.5px] text-oa-muted-fg">Trump post</span>
                    <MoodChip raw={post.sentiment} />
                  </span>
                  <span className={`${NUM} shrink-0 text-[12.5px] text-oa-muted-fg`}>{fmtAgo(post.publishedAt, nowMs)}</span>
                </div>
                <p className="mt-0.5 text-[12.5px] leading-[18px] text-oa-muted-fg">
                  <a href={post.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    “{post.said}”
                  </a>
                </p>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <Empty>Nothing in the last day.</Empty>
      )}
    </Panel>
  );
}

async function FollowPanel({ follow: pending }: { follow: Promise<DeskData["follow"]> }) {
  const follow = await pending;
  return (
    <Panel fill label="Follow" right={<OpenLink href="/follow">Open</OpenLink>} flush>
      {follow.length === 0 ? (
        <Empty>No new filings yet.</Empty>
      ) : (
        <>
          <Takeaway text={followTakeaway(follow)} />
          <ul>
            {follow.slice(0, DESK_ROWS).map((item) => {
              const lean = filingLean(item.kind, item.items ?? []);
              return (
                <li key={item.id} className="grid grid-cols-[3.25rem_minmax(0,1fr)] gap-x-2 border-b border-oa-border px-4 py-2 last:border-b-0">
                  <span className={`${NUM} pt-0.5 text-[12px] text-oa-muted-fg`}>{fmtDay(item.date)}</span>
                  <span className="min-w-0">
                    <span className="flex items-baseline gap-2">
                      <a href={`/follow/${item.source_id}`} className={`min-w-0 truncate text-[14px] font-medium text-oa-fg hover:underline ${FOCUS}`}>
                        {item.name}
                      </a>
                      <span className="shrink-0 text-[12.5px] text-oa-muted-fg">{item.kind === "fund" ? "Fund" : "Congress"}</span>
                    </span>
                    <span className="mt-0.5 block text-[12.5px] leading-[18px] text-oa-muted-fg">
                      {lean && lean.tone !== "flat" ? (
                        <Verdict tone={lean.tone} className="mr-1.5 align-[-5px]">
                          {lean.word}
                        </Verdict>
                      ) : null}
                      {item.headline}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Panel>
  );
}

async function StrategiesPanel({ strategies: pending }: { strategies: Promise<DeskData["strategies"]> }) {
  const strategies = await pending;
  return (
    <Panel fill label="Strategies" right={<OpenLink href="/strategies">Open</OpenLink>} flush>
      {strategies.length === 0 ? (
        <Empty>No strategy is published yet.</Empty>
      ) : (
        <>
          <Takeaway text={strategiesTakeaway(strategies)} />
          <ul>
            {strategies.map((strategy) => {
              const test = strategy.backtest;
              return (
                <li key={strategy.slug} className="border-b border-oa-border px-4 py-2 last:border-b-0">
                  <div className="flex items-center justify-between gap-3">
                    <a href={`/strategies/${strategy.slug}`} className={`min-w-0 truncate text-[14px] font-medium text-oa-fg hover:underline ${FOCUS}`}>
                      {strategy.name}
                    </a>
                    {test ? <Sparkline values={test.spark.strategy} width={56} height={18} tone="flat" /> : null}
                  </div>
                  <p className="mt-0.5 text-[12.5px] leading-[18px] text-oa-muted-fg">
                    {test && test.strategy.annualized_return !== null ? (
                      <>
                        <span className={`${NUM} text-oa-fg`}>{fmtFrac(test.strategy.annualized_return)}</span> a year in a backtest,{" "}
                        <span className={NUM}>
                          {test.period.start.slice(0, 4)} to {test.period.end.slice(0, 4)}
                        </span>
                        {test.benchmark.annualized_return !== null ? (
                          <>
                            {" "}
                            (benchmark <span className={NUM}>{fmtFrac(test.benchmark.annualized_return)}</span>)
                          </>
                        ) : null}
                      </>
                    ) : (
                      "Live record only, no backtest."
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
          <div className="mt-auto border-t border-oa-border bg-oa-bg px-4 py-1.5">
            <SourceLine note="Backtested, not real returns" />
          </div>
        </>
      )}
    </Panel>
  );
}

async function MarketsPanel({ markets: pending, brief }: { markets: Promise<DeskData["markets"]>; brief: Promise<DeskBrief> }) {
  const [markets, { marketsLine }] = await Promise.all([pending, brief]);
  return (
    <Panel fill label="Markets" right={<OpenLink href="/markets">Open</OpenLink>} flush>
      {markets && markets.readings.length > 0 ? (
        <>
          <Takeaway text={marketsLine} />
          <ul>
            {markets.readings.slice(0, DESK_ROWS).map((reading) => (
              <li key={reading.key} className="border-b border-oa-border px-4 py-2 last:border-b-0">
                <a href={reading.href} {...(reading.external ? { target: "_blank", rel: "noopener noreferrer" } : {})} className={`block rounded hover:underline ${FOCUS}`}>
                  <span className="flex items-center justify-between gap-2 text-[14px] font-medium leading-5 text-oa-fg">
                    {reading.label}
                    {reading.verdict && reading.verdict.tone !== "flat" ? <Verdict tone={reading.verdict.tone}>{reading.verdict.word}</Verdict> : null}
                  </span>
                  <span className="mt-0.5 block text-pretty text-[12.5px] leading-[18px] text-oa-muted-fg">{reading.text}</span>
                </a>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <Empty>Quotes are unavailable right now.</Empty>
      )}
    </Panel>
  );
}

/* ── the page ───────────────────────────────────────────────────────────── */

/** One read for the whole desk: the brief with the news read folded in, stocks first (see `mergeDeskRead`). */
async function ReadSlot({ brief, wire }: { brief: Promise<DeskBrief>; wire: Promise<DeskData["wire"]> }) {
  const [{ read }, news] = await Promise.all([brief, wire]);
  return <TheRead read={mergeDeskRead(read, news.read)} label="Today's read" className="mb-4" />;
}

async function MarketsStripSlot({ markets: pending }: { markets: Promise<DeskData["markets"]> }) {
  const markets = await pending;
  return markets ? <MarketsStrip markets={markets} /> : null;
}

/** The cross-asset strip's size: one slim row. */
function MarketsStripGhost() {
  return (
    <div className="mb-4 flex gap-6 overflow-hidden" aria-busy="true">
      {Array.from({ length: 7 }, (_, index) => (
        <div key={index} className="shrink-0 py-0.5">
          <Bar className="h-3 w-20" />
          <Bar className="mt-2 h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

/**
 * The head needs no data, so it is on screen at once. Each panel then waits
 * only for its own source: every loader is started here, side by side, and
 * awaited inside the panel that shows it.
 *
 * Order: the day's read, a slim row of market levels, then the lead (what is
 * moving today and why), then the wire beside Ask and the calendar, then the
 * desk previews, each led by its one-line takeaway.
 */
export default function ExplorePage() {
  const now = new Date();
  const nowMs = now.getTime();
  const today = todayET(now);
  const markets = loadDeskMarkets(today);
  const brief = loadDeskBrief(today);
  const wire = loadDeskWire(today);

  return (
    <AppPage width="wide">
      <PageHead title="Market today" />

      <Suspense fallback={<div className="mb-4"><PanelGhost rows={3} lines={2} /></div>}>
        <ReadSlot brief={brief} wire={wire} />
      </Suspense>

      <Suspense fallback={<MarketsStripGhost />}>
        <MarketsStripSlot markets={markets} />
      </Suspense>

      <Suspense fallback={<div className="mb-5"><PanelGhost rows={5} lines={2} /></div>}>
        <MoversPanel movers={loadDeskMovers(today)} />
      </Suspense>

      <div className="grid items-stretch gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <Suspense fallback={<PanelGhost rows={9} lines={2} />}>
          <StoriesPanel wire={wire} nowMs={nowMs} />
        </Suspense>

        <div className="grid min-w-0 grid-rows-[auto_minmax(0,1fr)] gap-5">
          <Panel label="Ask about a stock or an idea">
            <AskBox suggestions={EXPLORE_SUGGESTIONS} />
          </Panel>
          <Suspense fallback={<PanelGhost rows={4} />}>
            <CalendarPanel calendar={loadDeskCalendar(today)} brief={brief} today={today} />
          </Suspense>
        </div>
      </div>

      <h2 className="oa-label mb-2 mt-8">More to explore</h2>
      {/* On a phone the six previews wait behind one button; the lead above is the point of the page. */}
      <ShowMore label="Show the screener, themes and 4 more">
        <div className="grid items-stretch gap-5 md:grid-cols-2 xl:grid-cols-3">
        <Suspense fallback={<PanelGhost rows={4} lines={2} />}>
          <ScreensPanel screens={loadDeskScreens(today)} />
        </Suspense>
        <Suspense fallback={<PanelGhost rows={4} lines={2} />}>
          <ThemesPanel themes={loadDeskThemes(today)} />
        </Suspense>
        <Suspense fallback={<PanelGhost rows={4} lines={2} />}>
          <SignalsPanel signals={loadDeskSignals(today)} brief={brief} nowMs={nowMs} />
        </Suspense>
        <Suspense fallback={<PanelGhost rows={4} lines={2} />}>
          <FollowPanel follow={loadDeskFollow(today)} />
        </Suspense>
        <Suspense fallback={<PanelGhost rows={4} lines={2} />}>
          <StrategiesPanel strategies={loadDeskStrategies(today)} />
        </Suspense>
        <Suspense fallback={<PanelGhost rows={4} lines={2} />}>
          <MarketsPanel markets={markets} brief={brief} />
        </Suspense>
        </div>
      </ShowMore>
    </AppPage>
  );
}
