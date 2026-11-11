import * as React from "react";
import Link from "next/link";

import { Delta, Empty, FOCUS, NUM, Panel, TabBar, Tag, Ticker, Verdict, fmtAgo, fmtCompact, fmtDay, fmtMoney, fmtStampET, type TabItem } from "@/components/oa/kit";
import type { MoversData, PolicyData, RedditData, RedditThread } from "@/lib/signals";
import { MoreLocked } from "@/components/oa/gate";
import type { Plan } from "@/lib/entitlements";
import {
  POLICY_PAGE_SIZE,
  filterMovers,
  filterPolicy,
  moverCounts,
  rankReddit,
  signalsHref,
  velocityLabel,
  type MentionVelocity,
  type Mover,
  type PolicyPost,
  type RedditName,
  type SignalsFilters,
  type Stance,
  type TodayPick,
} from "@/lib/signals-shared";
import { moodWord } from "@/lib/tone";
import { plainFinance, sentenceCase } from "@/lib/plain-copy";

const CHIP = "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border px-3 text-[14px] transition-colors sm:h-8 " + FOCUS;
const CHIP_ON = "border-[color-mix(in_srgb,var(--ink)_55%,transparent)] bg-oa-card font-medium text-oa-fg";
const CHIP_OFF = "border-oa-border text-oa-muted-fg hover:bg-oa-accent hover:text-oa-fg";
const LINK = "rounded text-oa-primary hover:underline " + FOCUS;

type ChipItem = { id: string; label: string; href: string; count?: number };

function ChipRow({ items, current, className = "" }: { items: ChipItem[]; current: string; className?: string }) {
  return (
    <div className={`oa-scroll-fade -mx-2 flex gap-1.5 overflow-x-auto px-4 pr-9 [scrollbar-width:none] sm:mx-0 sm:px-0 sm:pr-0 [&::-webkit-scrollbar]:hidden ${className}`}>
      {items.map((item) => (
        <a key={item.id} href={item.href} aria-current={item.id === current ? "true" : undefined} className={`${CHIP} ${item.id === current ? CHIP_ON : CHIP_OFF}`}>
          {item.label}
          {item.count != null ? <span className={`${NUM} text-[12.5px] text-oa-muted-fg`}>{item.count}</span> : null}
        </a>
      ))}
    </div>
  );
}

/**
 * The one row of controls: the tabs, and on a desktop the current tab's
 * filters at the right end of the same line. On a phone the filters are a
 * second, sideways-scrolling row.
 */
export function SignalsBar({
  tabs,
  filters,
  movers,
  policy,
}: {
  tabs: TabItem[];
  filters: SignalsFilters;
  movers: MoversData;
  policy: PolicyData;
}) {
  let chips: ChipItem[] = [];
  if (filters.tab === "movers") {
    const counts = moverCounts(movers.movers);
    chips = [
      { id: "all", label: "All", count: counts.all, href: signalsHref(filters, { show: "all" }) },
      { id: "explained", label: "With a reason", count: counts.explained, href: signalsHref(filters, { show: "explained" }) },
      { id: "unexplained", label: "No confirmed reason", count: counts.unexplained, href: signalsHref(filters, { show: "unexplained" }) },
      { id: "up", label: "Up", count: counts.up, href: signalsHref(filters, { show: "up" }) },
      { id: "down", label: "Down", count: counts.down, href: signalsHref(filters, { show: "down" }) },
    ];
  } else if (filters.tab === "policy") {
    const named = policy.posts.filter((post) => post.names.length > 0).length;
    chips = [
      { id: "all", label: "All market posts", count: policy.posts.length, href: signalsHref(filters, { show: "all", limit: POLICY_PAGE_SIZE }) },
      { id: "named", label: "Names a company", count: named, href: signalsHref(filters, { show: "named", limit: POLICY_PAGE_SIZE }) },
    ];
  }
  return (
    <div className="mb-3 lg:mb-4 lg:flex lg:items-center lg:gap-6 lg:border-b lg:border-oa-border">
      <TabBar tabs={tabs} current={filters.tab} className="!mb-0 min-w-0 lg:flex-1 lg:!border-b-0" />
      {chips.length ? <ChipRow items={chips} current={filters.show} className="mt-2 lg:mt-0 lg:shrink-0" /> : null}
    </div>
  );
}

/**
 * Mood as a chip (glyph and word on a soft tint), never as coloured text, so it
 * reads as a label and not as a price move. Neutral prints nothing.
 */
function StanceWord({ stance, className = "" }: { stance: Stance | string | null | undefined; className?: string }) {
  const mood = stance === "neutral" ? null : moodWord(stance);
  return mood ? (
    <Verdict tone={mood.tone} className={className}>
      {mood.word}
    </Verdict>
  ) : null;
}

/* ── Movers ────────────────────────────────────────────────────────────── */

/**
 * The movers table. One line per stock, biggest move first, so the list reads
 * as a ranking: who, how much, what kind of news, the headline. The paragraph
 * and the sources sit behind a click, because thirty of them at once is a
 * wall nobody reads.
 */
const MOVER_COLS = "lg:grid lg:grid-cols-[1.75rem_minmax(0,13rem)_4.5rem_9rem_minmax(0,11rem)_minmax(0,1fr)_1.25rem] lg:items-center lg:gap-x-4";

function MoveBar({ pct, max, always = false }: { pct: number; max: number; /** Show on a phone too. */ always?: boolean }) {
  const width = max > 0 ? Math.max(6, Math.round((Math.abs(pct) / max) * 100)) : 0;
  return (
    <span aria-hidden="true" className={`${always ? "block w-10 lg:w-12" : "hidden w-12 lg:block"} h-1.5 shrink-0 overflow-hidden rounded-full bg-oa-bg`}>
      <span className={`block h-full rounded-full ${pct >= 0 ? "bg-signal-bullish" : "bg-signal-bearish"}`} style={{ width: `${width}%` }} />
    </span>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-4 shrink-0 text-oa-muted-fg transition-transform group-open:rotate-90">
      <path d="m6 3.5 4.5 4.5L6 12.5" />
    </svg>
  );
}

function MoverLine({ mover, rank, max }: { mover: Mover; rank: number; max: number }) {
  const cause = mover.explained ? mover.cause ?? "Company news" : "No confirmed reason";
  const headline = mover.explained
    ? mover.headline
    : mover.searched
      ? "Searched the news, filings and outside sources. Nothing specific."
      : "No specific cause found yet.";
  return (
    <div className={`px-4 py-3 lg:py-2.5 ${MOVER_COLS}`}>
      {/* who and how much: always the first thing on the line */}
      <div className="flex items-center gap-2 lg:contents">
        <span aria-label={`Rank ${rank}`} className={`${NUM} w-5 shrink-0 text-[12.5px] text-oa-muted-fg lg:w-auto`}>
          {rank}
        </span>
        <Ticker symbol={mover.ticker} name={mover.name} size={20} className="min-w-0 flex-1 lg:flex-none" />
        <span className={`${NUM} hidden text-right text-[13px] text-oa-muted-fg lg:block`}>{mover.price !== null ? fmtMoney(mover.price) : ""}</span>
        <span className="flex shrink-0 items-center justify-end gap-2.5">
          <MoveBar pct={mover.pct} max={max} />
          <Delta value={mover.pct} className="text-[15px] font-semibold lg:w-[4.75rem] lg:text-right" />
        </span>
      </div>
      {/* what kind of news, then the headline */}
      <p className={`mt-1.5 flex min-w-0 items-center gap-1.5 pl-7 text-[13px] leading-5 lg:mt-0 lg:pl-0 ${mover.explained ? "text-oa-fg" : "text-oa-muted-fg"}`}>
        <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${mover.explained ? "bg-oa-primary" : "bg-oa-border"}`} />
        <span className="truncate">{cause}</span>
      </p>
      <p className={`mt-0.5 min-w-0 pl-7 text-[14px] leading-[21px] lg:mt-0 lg:pl-0 ${mover.explained ? "font-medium text-oa-fg" : "text-oa-muted-fg"}`}>
        {plainFinance(sentenceCase(headline))}
      </p>
      <span className="hidden lg:block">{mover.explained ? <Chevron /> : null}</span>
    </div>
  );
}

function MoverDetail({ mover }: { mover: Mover }) {
  const facts = [
    mover.price !== null ? fmtMoney(mover.price) : null,
    mover.volume !== null ? `${fmtCompact(mover.volume)} shares` : null,
    mover.confidence ? `${mover.confidence} confidence` : null,
  ].filter(Boolean);
  return (
    <div className="grid gap-x-10 gap-y-3 border-t border-oa-border bg-oa-bg px-4 py-4 pl-11 lg:grid-cols-[minmax(0,62ch)_minmax(0,1fr)] lg:pl-[3.75rem]">
      <div className="min-w-0">
        {mover.why ? <p className="text-pretty text-[14.5px] leading-[23px] text-oa-fg">{mover.why}</p> : null}
        {facts.length ? <p className={`${NUM} mt-2 text-[12.5px] leading-[18px] text-oa-muted-fg`}>{facts.join(" · ")}</p> : null}
      </div>
      {mover.evidence.length ? (
        <div className="min-w-0">
          <p className="oa-caption">Sources</p>
          <ul className="mt-1.5 flex flex-col gap-1">
            {mover.evidence.slice(0, 3).map((source, index) => (
              <li key={index} className="min-w-0">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`text-[13px] leading-5 text-oa-fg underline decoration-oa-border underline-offset-2 hover:decoration-oa-primary ${FOCUS}`}
                >
                  {sentenceCase(source.title)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function MoversTab({ data, filters }: { data: MoversData; filters: SignalsFilters }) {
  const rows = filterMovers(data.movers, filters.show);
  const max = rows.reduce((top, mover) => Math.max(top, Math.abs(mover.pct)), 0);
  return (
    <>
      <Panel flush>
        {rows.length ? (
          <>
            <div className={`hidden border-b border-oa-border bg-oa-bg px-4 py-2 ${MOVER_COLS}`}>
              <span className="oa-caption">#</span>
              <span className="oa-caption">Stock</span>
              <span className="oa-caption text-right">Price</span>
              <span className="oa-caption text-right">Move today</span>
              <span className="oa-caption">Kind of news</span>
              <span className="oa-caption">What happened</span>
              <span />
            </div>
            <ol>
              {rows.map((mover, index) => (
                <li key={mover.ticker} className="border-b border-oa-border last:border-b-0">
                  {mover.explained ? (
                    <details className="group">
                      <summary data-track="mover_opened" data-track-ticker={mover.ticker} data-track-list="movers" className={`cursor-pointer list-none hover:bg-oa-accent [&::-webkit-details-marker]:hidden ${FOCUS}`}>
                        <MoverLine mover={mover} rank={index + 1} max={max} />
                      </summary>
                      <MoverDetail mover={mover} />
                    </details>
                  ) : (
                    <MoverLine mover={mover} rank={index + 1} max={max} />
                  )}
                </li>
              ))}
            </ol>
          </>
        ) : (
          <Empty title={data.movers.length ? "No moves match this filter" : "No unusual moves right now"}>
            {data.movers.length
              ? "Pick another filter to see the rest of today's list."
              : "Nothing has moved past today's threshold yet."}
          </Empty>
        )}
      </Panel>
    </>
  );
}

/* ── Reddit ────────────────────────────────────────────────────────────── */

/**
 * Posts per day for the last week, oldest on the left. Every day gets a slot
 * on a baseline, so a quiet day reads as a gap and not as a missing bar; the
 * last 24 hours is the dark bar the rest is measured against.
 */
function VelocityBars({ velocity }: { velocity: MentionVelocity }) {
  const max = Math.max(1, ...velocity.daily);
  const width = 8;
  const gap = 3;
  const height = 24;
  const total = velocity.daily.length * (width + gap) - gap;
  return (
    <svg
      viewBox={`0 0 ${total} ${height + 2}`}
      width={total}
      height={height + 2}
      role="img"
      aria-label={`Posts per day, oldest first: ${velocity.daily.join(", ")}`}
      className="shrink-0"
    >
      <line x1="0" x2={total} y1={height + 1} y2={height + 1} stroke="var(--oa-border)" strokeWidth="1" />
      {velocity.daily.map((count, index) => {
        const barHeight = count === 0 ? 0 : Math.max(3, (count / max) * height);
        const last = index === velocity.daily.length - 1;
        return (
          <rect
            key={index}
            x={index * (width + gap)}
            y={height - barHeight}
            width={width}
            height={barHeight}
            rx={1.5}
            fill={last ? "var(--oa-fg)" : "var(--oa-muted-fg)"}
            opacity={last ? 0.9 : 0.4}
          />
        );
      })}
    </svg>
  );
}

/** Only a name running hot is tagged. For the rest the numbers beside it say enough. */
function Pace({ velocity }: { velocity: MentionVelocity }) {
  if (velocity.state === "rising" && velocity.ratio !== null) return <Tag tone="primary" caps={false}>{velocity.ratio.toFixed(1)}× the usual talk</Tag>;
  if (velocity.state === "new") return <Tag tone="primary" caps={false}>New today</Tag>;
  return null;
}

const REDDIT_COLS =
  "lg:grid lg:grid-cols-[1.75rem_minmax(0,1fr)_4.5rem_5.5rem_7.5rem_minmax(0,19rem)_4.5rem_1.25rem] lg:items-center lg:gap-x-4";
/** The Today tab is half as wide: the pace wording is left to the opened row. */
const REDDIT_COLS_COMPACT =
  "lg:grid lg:grid-cols-[1.75rem_minmax(0,1fr)_4.5rem_4.75rem_minmax(0,6.5rem)_4.25rem_1.25rem] lg:items-center lg:gap-x-3";

function RedditLine({ name, rank, compact }: { name: RedditName; rank: number; compact: boolean }) {
  return (
    <div className={`px-4 py-2.5 lg:py-2 ${compact ? REDDIT_COLS_COMPACT : REDDIT_COLS}`}>
      <div className="flex items-center gap-2 lg:contents">
        <span aria-label={`Rank ${rank}`} className={`${NUM} w-5 shrink-0 text-[12.5px] text-oa-muted-fg lg:w-auto`}>
          {rank}
        </span>
        <Ticker symbol={name.ticker} name={compact ? null : name.company} size={20} className="min-w-0 flex-1 lg:flex-none" />
        <span className={`${NUM} shrink-0 text-right text-[14px] text-oa-fg`}>
          {name.mentions} <span className="text-[12.5px] text-oa-muted-fg lg:hidden">post{name.mentions === 1 ? "" : "s"}</span>
        </span>
        <span className="hidden text-[14px] lg:block">
          <StanceWord stance={name.stance} />
        </span>
        <span className="hidden lg:block" title="Posts naming it in each of the last seven 24-hour periods, newest on the right">
          <VelocityBars velocity={name.velocity} />
        </span>
        {compact ? null : (
          <span className="hidden min-w-0 items-center gap-2 text-[12.5px] lg:flex">
            <Pace velocity={name.velocity} />
            <span className={`${NUM} truncate text-oa-muted-fg`}>{velocityLabel(name.velocity)}</span>
          </span>
        )}
        <span className="hidden text-right lg:block">{name.dayPct !== null ? <Delta value={name.dayPct} className="text-[14px]" /> : null}</span>
        <span className="hidden lg:block">
          <Chevron />
        </span>
      </div>
      {/* phone: the mood, the pace and the week on a second line */}
      <div className="mt-1 flex items-center justify-between gap-3 pl-7 text-[13px] lg:hidden">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <StanceWord stance={name.stance} />
          <Pace velocity={name.velocity} />
          {name.dayPct !== null ? <Delta value={name.dayPct} className="text-[13px]" /> : null}
          <span className="text-oa-muted-fg">today</span>
        </span>
        <VelocityBars velocity={name.velocity} />
      </div>
    </div>
  );
}

function RedditDetail({ name }: { name: RedditName }) {
  return (
    <div className="border-t border-oa-border bg-oa-bg px-4 py-3 pl-11 lg:pl-[3.75rem]">
      <p className={`max-w-[70ch] text-pretty text-[14px] leading-[22px] ${name.summary ? "text-oa-fg" : "text-oa-muted-fg"}`}>
        {name.summary || "Too few posts to tell what is being said."}
      </p>
      <p className="mt-1.5 flex max-w-[70ch] flex-wrap gap-x-2 gap-y-0.5 text-[12.5px] leading-[18px] text-oa-muted-fg">
        <span className="lg:hidden">{velocityLabel(name.velocity)} ·</span>
        {name.latestPostAt ? <span>last post {fmtAgo(name.latestPostAt)} ago</span> : null}
        {name.subreddits.length ? <span>· {name.subreddits.map((sub) => `r/${sub}`).join(", ")}</span> : null}
        {name.catalysts.length ? <span className="basis-full">Talking about: {name.catalysts.join("; ")}</span> : null}
      </p>
    </div>
  );
}

/** The ranked Reddit list: one line per name, what is being said behind a click. */
function RedditList({ names, compact = false }: { names: RedditName[]; compact?: boolean }) {
  return (
    <>
      <div className={`hidden border-b border-oa-border bg-oa-bg px-4 py-2 ${compact ? REDDIT_COLS_COMPACT : REDDIT_COLS}`}>
        <span className="oa-caption">#</span>
        <span className="oa-caption">Stock</span>
        <span className="oa-caption text-right">Posts</span>
        <span className="oa-caption">Mood</span>
        <span className="oa-caption">7 days</span>
        {compact ? null : <span className="oa-caption">Last 24h against usual</span>}
        <span className="oa-caption text-right">Today</span>
        <span />
      </div>
      <ol>
        {names.map((name, index) => (
          <li key={name.ticker} className="border-b border-oa-border last:border-b-0">
            <details className="group">
              <summary data-track="signal_opened" data-track-kind="reddit" data-track-ticker={name.ticker} className={`cursor-pointer list-none hover:bg-oa-accent [&::-webkit-details-marker]:hidden ${FOCUS}`}>
                <RedditLine name={name} rank={index + 1} compact={compact} />
              </summary>
              <RedditDetail name={name} />
            </details>
          </li>
        ))}
      </ol>
    </>
  );
}

function ThreadList({ threads }: { threads: RedditThread[] }) {
  if (!threads.length) return null;
  return (
    <Panel label="Threads behind the counts" right={<span className={NUM}>{threads.length}</span>} flush className="mt-5">
      <ul className="grid lg:grid-cols-2 lg:gap-x-px lg:bg-oa-border">
        {threads.map((thread) => (
          <li key={thread.url} className="border-b border-oa-border bg-oa-card px-4 py-2 hover:bg-oa-accent">
            <a href={thread.url} target="_blank" rel="noopener noreferrer" className={`rounded text-[14px] font-medium leading-5 text-oa-fg hover:underline ${FOCUS}`}>
              {sentenceCase(thread.title)}
            </a>
            <p className="mt-0.5 flex flex-wrap gap-x-2 text-[12.5px] leading-[18px] text-oa-muted-fg">
              <span>r/{thread.subreddit}</span>
              {thread.published ? <span>· {fmtAgo(thread.published)} ago</span> : null}
              {thread.tickers.length ? <span className={NUM}>· {thread.tickers.join(" ")}</span> : null}
            </p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function RedditTab({ data }: { data: RedditData }) {
  const names = rankReddit(data.names);
  const days = Math.round(data.windowHours / 24);
  return (
    <>
      <Panel
        label="Loudest names on Reddit"
        right={
          <span>
            <span className="hidden sm:inline">
              {data.postCount.toLocaleString("en-US")} posts, last {days} days
            </span>
          </span>
        }
        flush
      >
        {names.length ? <RedditList names={names} /> : <Empty title="Nothing yet">No Reddit names to show yet.</Empty>}
      </Panel>
      <ThreadList threads={data.threads} />
    </>
  );
}

/* ── Policy ────────────────────────────────────────────────────────────── */

const POLICY_COLS = "lg:grid lg:grid-cols-[6.5rem_minmax(0,1fr)_minmax(0,11rem)_5.5rem_1.25rem] lg:items-center lg:gap-x-4";
const POLICY_COLS_COMPACT = "lg:grid lg:grid-cols-[4rem_minmax(0,1fr)_4.5rem_1.25rem] lg:items-center lg:gap-x-3";

function PolicyLine({ post, compact }: { post: PolicyPost; compact: boolean }) {
  const stamp = fmtStampET(post.publishedAt).replace(" ET", "");
  return (
    <div className={`px-4 py-2.5 lg:py-2 ${compact ? POLICY_COLS_COMPACT : POLICY_COLS}`}>
      <div className="flex items-baseline justify-between gap-3 lg:contents">
        <time dateTime={post.publishedAt} className={`${NUM} whitespace-nowrap text-[12.5px] leading-5 text-oa-muted-fg`}>
          {compact ? stamp.split(", ")[0] : stamp}
        </time>
        <span className="text-right text-[13px] lg:order-last lg:hidden">
          {post.market ? (
            <>
              <span className="text-oa-muted-fg">S&amp;P since </span>
              <Delta value={post.market.pct} className="text-[13px]" />
            </>
          ) : null}
        </span>
      </div>
      <p className="mt-0.5 min-w-0 text-pretty text-[14px] leading-5 text-oa-fg lg:mt-0 group-open:lg:text-oa-muted-fg">
        {post.stance !== "neutral" ? (
          <>
            <StanceWord stance={post.stance} className="mr-1.5 align-[-3px]" />
          </>
        ) : null}
        {post.summary}
      </p>
      {compact ? null : (
        <span className="hidden min-w-0 items-center gap-x-3 overflow-hidden whitespace-nowrap text-[12.5px] lg:flex">
          {post.names.slice(0, 2).map((name) => (
            <span key={name.ticker} className="inline-flex items-baseline gap-1.5">
              <span className={`${NUM} font-medium text-oa-fg`}>{name.ticker}</span>
              {name.since ? <Delta value={name.since.pct} className="text-[12.5px]" /> : null}
            </span>
          ))}
          {post.names.length > 2 ? <span className="text-oa-muted-fg">+{post.names.length - 2}</span> : null}
        </span>
      )}
      <span
        className="hidden text-right lg:block"
        title={post.market ? `SPY from the ${fmtDay(post.market.fromDate)} close to ${fmtDay(post.market.toDate)}` : "No session since the post"}
      >
        {post.market ? <Delta value={post.market.pct} className="text-[14px]" /> : <span className="text-[12.5px] text-oa-muted-fg">n/a</span>}
      </span>
      <span className="hidden lg:block">
        <Chevron />
      </span>
    </div>
  );
}

function PolicyDetail({ post, compact }: { post: PolicyPost; compact: boolean }) {
  return (
    <div className={`border-t border-oa-border bg-oa-bg px-4 py-3 ${compact ? "lg:pl-[5.75rem]" : "lg:pl-[8.5rem]"}`}>
      <p className="max-w-[70ch] text-pretty text-[14px] leading-[22px] text-oa-fg">{post.summary}</p>
      {post.names.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {post.names.map((name) => (
            <a
              key={name.ticker}
              href={`/stock/${encodeURIComponent(name.ticker)}`}
              title={name.since ? `${name.company}: from the ${fmtDay(name.since.fromDate)} close to ${fmtDay(name.since.toDate)}` : name.company}
              className={`inline-flex h-10 items-center gap-1.5 rounded border border-oa-border bg-oa-card px-2 text-[12.5px] hover:border-oa-fg sm:h-7 ${FOCUS}`}
            >
              <span className={`${NUM} font-medium text-oa-fg`}>{name.ticker}</span>
              {name.since ? <Delta value={name.since.pct} className="text-[12.5px]" /> : <span className="text-oa-muted-fg">no price</span>}
              <span className="text-oa-muted-fg">since</span>
            </a>
          ))}
        </div>
      ) : null}
      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] leading-[18px] text-oa-muted-fg">
        <span>{fmtStampET(post.publishedAt)}</span>
        {post.market ? (
          <span title={`SPY from the ${fmtDay(post.market.fromDate)} close to ${fmtDay(post.market.toDate)}`}>
            · S&amp;P 500 since <Delta value={post.market.pct} className="text-[12.5px]" />
          </span>
        ) : (
          <span>· S&amp;P 500 since: no session yet</span>
        )}
        <a href={post.url} target="_blank" rel="noopener noreferrer" className="underline decoration-oa-border underline-offset-2 hover:text-oa-fg">
          · the post
        </a>
        {post.archiveUrl ? (
          <a href={post.archiveUrl} target="_blank" rel="noopener noreferrer" className="underline decoration-oa-border underline-offset-2 hover:text-oa-fg">
            · archive copy
          </a>
        ) : null}
      </p>
    </div>
  );
}

/** Posts newest first: one line each, the full text, the names and the links behind a click. */
function PolicyList({ posts, compact = false }: { posts: PolicyPost[]; compact?: boolean }) {
  return (
    <>
      <div className={`hidden border-b border-oa-border bg-oa-bg px-4 py-2 ${compact ? POLICY_COLS_COMPACT : POLICY_COLS}`}>
        <span className="oa-caption">Posted</span>
        <span className="oa-caption">What it said</span>
        {compact ? null : <span className="oa-caption">Names, since</span>}
        <span className="oa-caption text-right">{compact ? "S&P" : "S&P since"}</span>
        <span />
      </div>
      <ol>
        {posts.map((post) => (
          <li key={post.id} className="border-b border-oa-border last:border-b-0">
            <details className="group">
              <summary data-track="signal_opened" data-track-kind="policy" className={`cursor-pointer list-none hover:bg-oa-accent [&::-webkit-details-marker]:hidden ${FOCUS}`}>
                <PolicyLine post={post} compact={compact} />
              </summary>
              <PolicyDetail post={post} compact={compact} />
            </details>
          </li>
        ))}
      </ol>
    </>
  );
}

export function PolicyTab({
  data,
  filters,
  archive = null,
}: {
  data: PolicyData;
  filters: SignalsFilters;
  /** Posts older than the plan's archive, counted on the server and never sent. */
  archive?: { hidden: number; days: number; plan: Plan; trialEligible: boolean } | null;
}) {
  const rows = filterPolicy(data.posts, filters.show);
  const visible = rows.slice(0, filters.limit);
  return (
    <>
      <Panel flush>
        {visible.length ? <PolicyList posts={visible} /> : <Empty title="No posts yet">No market-related posts in this window.</Empty>}
        {visible.length < rows.length ? (
          <div className="border-t border-oa-border p-2 text-center">
            <Link
              href={signalsHref(filters, { limit: filters.limit + POLICY_PAGE_SIZE })}
              scroll={false}
              className={`inline-flex min-h-10 items-center rounded-md px-3 text-[14px] font-medium text-oa-muted-fg hover:bg-oa-accent hover:text-oa-fg ${FOCUS}`}
            >
              Show {Math.min(POLICY_PAGE_SIZE, rows.length - visible.length)} more of {rows.length - visible.length}
            </Link>
          </div>
        ) : null}
        {archive && visible.length >= rows.length ? (
          <MoreLocked
            feature="signals_archive"
            plan={archive.plan}
            hidden={archive.hidden}
            noun={`older ${archive.hidden === 1 ? "post" : "posts"} past the last ${archive.days} days`}
            trialEligible={archive.trialEligible}
          />
        ) : null}
      </Panel>
    </>
  );
}

/* ── Today ─────────────────────────────────────────────────────────────── */

function SeeAll({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className={LINK}>
      {children}
    </a>
  );
}

const TODAY_MOVER_COLS = "grid grid-cols-[1.25rem_minmax(0,1fr)_auto_1rem] items-center gap-x-2 lg:grid-cols-[1.75rem_5.5rem_minmax(0,1fr)_8.5rem_1.25rem] lg:gap-x-3";

/** The lead of the Today tab: the moves we can explain, largest first, one line each. */
function TodayMovers({ movers }: { movers: Mover[] }) {
  // Bars share one scale, so a 16% drop looks twice the size of an 8% one.
  const max = Math.max(...movers.map((mover) => Math.abs(mover.pct)), 0);
  return (
    <ol>
      {movers.map((mover, index) => (
        <li key={mover.ticker} className="border-b border-oa-border last:border-b-0">
          <details className="group">
            <summary data-track="mover_opened" data-track-ticker={mover.ticker} data-track-list="today" className={`cursor-pointer list-none px-4 py-2.5 hover:bg-oa-accent [&::-webkit-details-marker]:hidden ${FOCUS}`}>
              <div className={TODAY_MOVER_COLS}>
                <span aria-label={`Rank ${index + 1}`} className={`${NUM} text-[12.5px] text-oa-muted-fg`}>
                  {index + 1}
                </span>
                <Ticker symbol={mover.ticker} size={20} className="min-w-0" />
                <p className="col-span-3 col-start-2 row-start-2 mt-0.5 min-w-0 text-pretty text-[14px] leading-5 text-oa-fg lg:col-span-1 lg:col-start-3 lg:row-start-1 lg:mt-0 lg:font-medium">
                  {plainFinance(sentenceCase(mover.headline))}
                </p>
                <span className="flex items-center justify-end gap-2">
                  <MoveBar pct={mover.pct} max={max} always />
                  <Delta value={mover.pct} className="text-right text-[15px] font-semibold" />
                </span>
                <Chevron />
              </div>
            </summary>
            <MoverDetail mover={mover} />
          </details>
        </li>
      ))}
    </ol>
  );
}

export function TodayTab({
  pick,
  movers,
  reddit,
  policy,
  filters,
  now,
}: {
  pick: TodayPick;
  movers: MoversData;
  reddit: RedditData;
  policy: PolicyData;
  filters: SignalsFilters;
  now: number;
}) {
  const counts = moverCounts(movers.movers);
  const newestPost = policy.posts[0];
  const moversHref = signalsHref(filters, { tab: "movers" });
  return (
    <>
      <div className="mb-5 grid items-stretch gap-5 lg:grid-cols-2">
        <Panel
          fill
          label="What Reddit is talking about"
          right={
            <>
              <SeeAll href={signalsHref(filters, { tab: "reddit" })}>All {reddit.names.length} names</SeeAll>
            </>
          }
          flush
        >
          {pick.reddit.length ? <RedditList names={pick.reddit} compact /> : <Empty className="!py-6">Nothing yet.</Empty>}
        </Panel>
        <Panel
          fill
          label="What the President posted"
          right={
            <>
              {newestPost ? <span className="hidden sm:inline">latest {fmtAgo(newestPost.publishedAt, now)} ago</span> : null}
              <SeeAll href={signalsHref(filters, { tab: "policy" })}>All {policy.posts.length} posts</SeeAll>
            </>
          }
          flush
        >
          {pick.policy.length ? <PolicyList posts={pick.policy} compact /> : <Empty className="!py-6">No market posts yet.</Empty>}
        </Panel>
      </div>
      {/* What moved comes after what people said: the moves have their own page (Why stocks moved). */}
      <Panel
        label={
          <>
            Big moves with a known reason <span className={`${NUM} ml-1.5 hidden font-normal text-oa-muted-fg sm:inline`}>{counts.explained} of {counts.all}</span>
          </>
        }
        right={<SeeAll href={moversHref}>All {counts.all} moves</SeeAll>}
        flush
      >
        {pick.movers.length ? (
          <TodayMovers movers={pick.movers} />
        ) : (
          <Empty className="!py-6">No move on today&apos;s list has a confirmed reason yet.</Empty>
        )}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-oa-border bg-oa-bg px-4 py-2 text-[12.5px] leading-5 text-oa-muted-fg">
          {counts.all ? (
            <span>
              {counts.all} stocks moved{movers.thresholdPct ? ` ${movers.thresholdPct}% or more` : " a lot"}: <span className="text-signal-bullish">{counts.up} up</span>,{" "}
              <span className="text-signal-bearish">{counts.down} down</span>.
            </span>
          ) : (
            <span>No moves past the threshold.</span>
          )}
          {pick.unexplained.length ? (
            <span className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
              <SeeAll href={`${moversHref}&show=unexplained`}>{counts.unexplained} with no reason found yet</SeeAll>
              {pick.unexplained.map((mover) => (
                <a key={mover.ticker} href={`/stock/${encodeURIComponent(mover.ticker)}`} data-track="mover_opened" data-track-list="unexplained" className={`inline-flex items-baseline gap-1.5 rounded hover:underline ${FOCUS}`}>
                  <span className={`${NUM} font-medium text-oa-fg`}>{mover.ticker}</span>
                  <Delta value={mover.pct} className="text-[12.5px]" />
                </a>
              ))}
            </span>
          ) : counts.all ? (
            <span>Every move on today&apos;s list has a reason attached.</span>
          ) : null}
        </div>
      </Panel>

    </>
  );
}
