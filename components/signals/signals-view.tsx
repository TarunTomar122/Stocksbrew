import * as React from "react";
import Link from "next/link";

import { Delta, Empty, FOCUS, NUM, Panel, TabBar, Ticker, Verdict, fmtAgo, fmtDay, fmtStampETDate, type TabItem } from "@/components/oa/kit";
import type { MoversData, PolicyData, RedditData, RedditThread } from "@/lib/signals";
import { MoreLocked } from "@/components/oa/gate";
import { StockLogo } from "@/components/stock-logo";
import type { Plan } from "@/lib/entitlements";
import {
  POLICY_PAGE_SIZE,
  filterPolicy,
  inRedditList,
  moverCounts,
  rankReddit,
  redditHighlight,
  redditMovesToday,
  signalsHref,
  type MentionVelocity,
  type PolicyPost,
  type RedditName,
  type SignalsFilters,
  type Stance,
  type TodayPick,
} from "@/lib/signals-shared";
import { moodWord } from "@/lib/tone";
import { sentenceCase } from "@/lib/plain-copy";
import { AppLink } from "@/components/oa/app-link";

const CHIP = "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border px-3 text-[14px] transition-colors sm:h-8 " + FOCUS;
const CHIP_ON = "border-[color-mix(in_srgb,var(--ink)_55%,transparent)] bg-oa-card font-medium text-oa-fg";
const CHIP_OFF = "border-oa-border text-oa-muted-fg hover:bg-oa-accent hover:text-oa-fg";
const LINK = "rounded text-oa-primary hover:underline " + FOCUS;

type ChipItem = { id: string; label: string; href: string; count?: number };

function ChipRow({ items, current, className = "" }: { items: ChipItem[]; current: string; className?: string }) {
  return (
    <div className={`oa-scroll-fade -mx-2 flex gap-1.5 overflow-x-auto px-4 pr-9 [scrollbar-width:none] sm:mx-0 sm:px-0 sm:pr-0 [&::-webkit-scrollbar]:hidden ${className}`}>
      {items.map((item) => (
        <AppLink key={item.id} href={item.href} aria-current={item.id === current ? "true" : undefined} className={`${CHIP} ${item.id === current ? CHIP_ON : CHIP_OFF}`}>
          {item.label}
          {item.count != null ? <span className={`${NUM} text-[12.5px] text-oa-muted-fg`}>{item.count}</span> : null}
        </AppLink>
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
  policy,
}: {
  tabs: TabItem[];
  filters: SignalsFilters;
  policy: PolicyData;
}) {
  let chips: ChipItem[] = [];
  if (filters.tab === "policy") {
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

/* ── Reddit ────────────────────────────────────────────────────────────── */

/** Only a name running hot says so. For the rest the post count says enough. */
function paceWords(velocity: MentionVelocity): string | null {
  if (velocity.state === "rising" && velocity.ratio !== null) return `${velocity.ratio.toFixed(1)}× the usual talk`;
  if (velocity.state === "new") return "new today";
  return null;
}

/**
 * The mood as one coloured word (Hopeful, Worried, Mixed). With no lean, or posts only counted and not read, a quiet
 * dash keeps the column lined up (owner rule 4), never a "no clear lean" phrase.
 */
function MoodWord({ name }: { name: RedditName }) {
  const mood = name.stanceRead && name.stance !== "neutral" ? moodWord(name.stance) : null;
  if (!mood)
    return (
      <span className="text-[13px] text-oa-muted-fg">
        <span aria-hidden="true">–</span>
        <span className="sr-only">No clear mood</span>
      </span>
    );
  const tone = mood.tone === "up" ? "text-signal-bullish" : mood.tone === "down" ? "text-signal-bearish" : "text-oa-muted-fg";
  return <span className={`text-[13px] font-medium ${tone}`}>{mood.word}</span>;
}

/**
 * Narrow (the Today card beside another, and every phone): rank, stock, mood, posts, today's move, with what is said
 * on a line underneath. Wide (a card with the row to itself, on a wide screen): what is said moves up into its own
 * column between the stock and the mood, so the row is one line and the space beside a short ticker is not left
 * blank. Tickers only, never the long fund or company name (owner rule 3).
 */
const REDDIT_COLS = "grid grid-cols-[1.25rem_minmax(0,1fr)_4rem_2.5rem_3.75rem] items-center gap-x-2";
const REDDIT_COLS_WIDE =
  "grid grid-cols-[1.25rem_minmax(0,1fr)_4rem_2.5rem_3.75rem] items-center gap-x-2 lg:grid-cols-[1.75rem_5.5rem_minmax(0,1fr)_5.5rem_3.5rem_4.5rem] lg:gap-x-4";

/** What is being said, then "1.5× the usual talk" or "new today" only when it is true. */
function SaidWords({ said, pace }: { said: string | null; pace: string | null }) {
  return (
    <>
      {said}
      {pace ? (
        <span className={`${said ? "ml-1.5" : ""} inline-flex h-[18px] items-center rounded border border-oa-border bg-oa-bg px-1.5 align-[1px] text-[11.5px] font-medium leading-none text-oa-fg`}>
          {pace}
        </span>
      ) : null}
    </>
  );
}

/**
 * One name: rank, stock, mood, posts and today's move, and what is being said written out (owner rule 2: nothing to
 * open to read it). A name with nothing said gets no empty line. The row is the link to the stock: no chevron, no
 * link text.
 */
function RedditLine({ name, rank, wide, movesToday }: { name: RedditName; rank: number; wide: boolean; movesToday: ReadonlyMap<string, number> }) {
  const said = redditHighlight(name, movesToday);
  const pace = paceWords(name.velocity);
  const cols = wide ? REDDIT_COLS_WIDE : REDDIT_COLS;
  const hasSaid = Boolean(said || pace);
  return (
    <div className="relative px-4 py-2 transition-colors hover:bg-oa-accent">
      <div className={cols}>
        <span className={`${NUM} text-[12.5px] text-oa-muted-fg`}>
          <span className="sr-only">Rank </span>
          {rank}
        </span>
        <Ticker symbol={name.ticker} size={20} stretch className="min-w-0" />
        {wide ? (
          <span className="hidden min-w-0 text-pretty text-[13px] leading-[19px] text-oa-muted-fg lg:block">
            {hasSaid ? <SaidWords said={said} pace={pace} /> : null}
          </span>
        ) : null}
        <span className="min-w-0 truncate">
          <MoodWord name={name} />
        </span>
        <span className={`${NUM} text-right text-[14px] text-oa-fg`}>{name.mentions}</span>
        <span className="text-right">{name.dayPct !== null ? <Delta value={name.dayPct} digits={1} className="text-[13.5px] font-medium" /> : null}</span>
      </div>
      {hasSaid ? (
        <p className={`mt-0.5 text-pretty pl-[1.75rem] text-[13px] leading-[19px] text-oa-muted-fg ${wide ? "lg:hidden" : ""}`}>
          <SaidWords said={said} pace={pace} />
        </p>
      ) : null}
    </div>
  );
}

/**
 * The ranked Reddit list (owner, Nov 11: "this table was better off earlier without cards"): one name per row, the
 * column words once in a header that stays put, every name in the list. The caller sets the scroll height.
 */
function RedditTable({ names, wide = false, all = names }: { names: RedditName[]; wide?: boolean; all?: RedditName[] }) {
  const cols = wide ? REDDIT_COLS_WIDE : REDDIT_COLS;
  // A highlight's "while Nvidia declined" goes when Nvidia is up today (lib/signals-shared.ts withoutContradictedClause);
  // `all` is every name in the scan, so a stock left out of a short list still counts.
  const movesToday = redditMovesToday(all);
  return (
    <>
      <div className="sticky top-0 z-[2] border-b border-oa-border bg-oa-bg px-4 py-2">
        <div className={cols}>
          <span className="oa-caption">#</span>
          <span className="oa-caption">Stock</span>
          {wide ? <span className="oa-caption hidden lg:block">What people say</span> : null}
          <span className="oa-caption">Mood</span>
          <span className="oa-caption text-right">Posts</span>
          <span className="oa-caption text-right">Today</span>
        </div>
      </div>
      <ol data-track-links="signal_opened" data-track-kind="reddit">
        {names.map((name, index) => (
          <li key={name.ticker} className="border-b border-oa-border last:border-b-0">
            <RedditLine name={name} rank={index + 1} wide={wide} movesToday={movesToday} />
          </li>
        ))}
      </ol>
    </>
  );
}

// About eight rows in view, then the list scrolls inside with no bar showing (owner rule 5).
const REDDIT_SCROLL = "max-h-[36rem] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

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
  const names = rankReddit(data.names.filter(inRedditList));
  const days = Math.round(data.windowHours / 24);
  return (
    <>
      <Panel
        label="Loudest names on Reddit"
        right={
          // No "0 posts" over an empty list (owner rule 4).
          data.postCount > 0 ? (
            <span className="hidden sm:inline">
              {data.postCount.toLocaleString("en-US")} posts, last {days} days
            </span>
          ) : undefined
        }
        flush
      >
        {names.length ? (
          <div className={REDDIT_SCROLL}>
            <RedditTable names={names} wide />
          </div>
        ) : (
          <Empty title="Nothing yet">No Reddit names to show yet.</Empty>
        )}
      </Panel>
      <ThreadList threads={data.threads} />
    </>
  );
}

/* ── Policy ────────────────────────────────────────────────────────────── */

const POLICY_COLS = "lg:grid lg:grid-cols-[6.5rem_minmax(0,1fr)_minmax(0,11rem)_5.5rem] lg:items-center lg:gap-x-4";
const POLICY_COLS_COMPACT = "lg:grid lg:grid-cols-[4rem_minmax(0,1fr)_4.5rem] lg:items-center lg:gap-x-3";

function PolicyLine({ post, compact }: { post: PolicyPost; compact: boolean }) {
  // A column of many posts keeps each one's date (and `compact` cuts it to the day).
  const stamp = fmtStampETDate(post.publishedAt).replace(" ET", "");
  return (
    <div className={`px-4 py-2.5 lg:py-2 ${compact ? POLICY_COLS_COMPACT : POLICY_COLS}`}>
      <div className="flex items-baseline justify-between gap-3 lg:contents">
        <time dateTime={post.publishedAt} className={`${NUM} whitespace-nowrap text-[12.5px] leading-5 text-oa-muted-fg`}>
          {compact ? stamp.split(", ")[0] : stamp}
        </time>
        <span className="text-right text-[13px] lg:order-last lg:hidden">
          {post.market ? (
            <>
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
              <StockLogo ticker={name.ticker} size={14} className="self-center" />
              <span className={`${NUM} font-medium text-oa-fg`}>{name.ticker}</span>
              {name.since ? <Delta value={name.since.pct} className="text-[12.5px]" /> : null}
            </span>
          ))}
          {post.names.length > 2 ? <span className="text-oa-muted-fg">+{post.names.length - 2}</span> : null}
        </span>
      )}
      <span
        className="hidden text-right lg:block"
        title={post.market ? `SPY from the ${fmtDay(post.market.fromDate)} close to ${fmtDay(post.market.toDate)}` : undefined}
      >
        {/* No session since the post yet: the cell stays empty rather than saying "n/a". */}
        {post.market ? <Delta value={post.market.pct} className="text-[14px]" /> : null}
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
            <Link prefetch={false}
              key={name.ticker}
              href={`/stock/${encodeURIComponent(name.ticker)}`}
              title={name.since ? `${name.company}: from the ${fmtDay(name.since.fromDate)} close to ${fmtDay(name.since.toDate)}` : name.company}
              className={`inline-flex h-10 items-center gap-1.5 rounded border border-oa-border bg-oa-card px-2 text-[12.5px] hover:border-oa-fg sm:h-7 ${FOCUS}`}
            >
              <StockLogo ticker={name.ticker} size={16} />
              <span className={`${NUM} font-medium text-oa-fg`}>{name.ticker}</span>
              {name.since ? <Delta value={name.since.pct} className="text-[12.5px]" /> : <span className="text-oa-muted-fg">no price</span>}
              <span className="text-oa-muted-fg">since</span>
            </Link>
          ))}
        </div>
      ) : null}
      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] leading-[18px] text-oa-muted-fg">
        <span>{fmtStampETDate(post.publishedAt)}</span>
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
      <div className={`hidden border-b border-oa-border bg-oa-bg px-4 py-2 ${compact ? `sticky top-0 z-[1] ${POLICY_COLS_COMPACT}` : POLICY_COLS}`}>
        <span className="oa-caption">Posted</span>
        <span className="oa-caption">What it said</span>
        {compact ? null : <span className="oa-caption">Names, since</span>}
        <span className="oa-caption text-right">{compact ? "S&P" : "S&P since"}</span>
      </div>
      {/* Phone: the column words once, not "S&P since" on every row (owner, Nov 11). */}
      <div className={`flex items-center justify-between gap-3 border-b border-oa-border bg-oa-bg px-4 py-2 lg:hidden ${compact ? "sticky top-0 z-[1]" : ""}`}>
        <span className="oa-caption">Posted, what it said</span>
        <span className="oa-caption">S&amp;P 500 since</span>
      </div>
      <ol>
        {posts.map((post) => (
          <li key={post.id} className="border-b border-oa-border last:border-b-0">
            <details className="group">
              <summary data-track="signal_opened" data-track-kind="policy" className={`cursor-pointer list-none hover:bg-oa-accent group-open:bg-oa-bg group-open:hover:bg-oa-accent [&::-webkit-details-marker]:hidden ${FOCUS}`}>
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
    <AppLink href={href} className={LINK}>
      {children}
    </AppLink>
  );
}


/**
 * The Today cards' lists: one fixed height, about eight Reddit rows (each with its line of what is said), scrolling inside with no bar showing (owner
 * rule), so the two cards end level and neither leaves an empty block under its rows.
 */
const TODAY_SCROLL = "max-h-[32rem] overflow-y-auto lg:h-[32rem] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

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
  const listed = reddit.names.filter(inRedditList).length;
  const newestPost = policy.posts[0];
  // A card with nothing in it is not drawn (owner rule 4): the other one takes the row, and the gap is said in a line below.
  const showReddit = pick.reddit.length > 0 || pick.policy.length === 0;
  const showPolicy = pick.policy.length > 0;
  const pair = showReddit && showPolicy;
  // Side by side, both lists take one fixed height so the cards end level; alone, a list is as tall as its rows (up to the cap).
  const scroll = pair ? TODAY_SCROLL : TODAY_SCROLL.replace(" lg:h-[32rem]", "");
  return (
    <>
      <div className={`mb-5 grid items-stretch gap-5 ${pair ? "lg:grid-cols-2" : ""}`}>
        {showReddit ? (
          <Panel
            fill
            label="What Reddit is talking about"
            right={
              // Only when the card holds fewer names than the Reddit tab lists; it scrolls every one it holds.
              listed > pick.reddit.length ? <SeeAll href={signalsHref(filters, { tab: "reddit" })}>All {listed} names</SeeAll> : null
            }
            flush
          >
            {pick.reddit.length ? (
              <div className={scroll}>
                <RedditTable names={pick.reddit} all={reddit.names} wide={!pair} />
              </div>
            ) : (
              <Empty className="!py-6">Nothing yet.</Empty>
            )}
          </Panel>
        ) : null}
        {showPolicy ? (
          <Panel
            fill
            label="What the President posted"
            right={
              <>
                {newestPost ? <span className="hidden sm:inline">latest {fmtAgo(newestPost.publishedAt, now)} ago</span> : null}
                {/* Only when the card holds fewer than there are: a card that already scrolls every post needs no "all" link. */}
                {policy.posts.length > pick.policy.length ? <SeeAll href={signalsHref(filters, { tab: "policy" })}>All {policy.posts.length} posts</SeeAll> : null}
              </>
            }
            flush
          >
            <div className={scroll}>
              <PolicyList posts={pick.policy} compact />
            </div>
          </Panel>
        ) : null}
      </div>
      {/* Signals is what people are saying. The day's moves and their reasons live on Market today, so they are one line here, not a second copy of the same list. */}
      <p className="text-[14px] leading-5 text-oa-muted-fg">
        {counts.all ? (
          <>
            {counts.all} {counts.all === 1 ? "stock" : "stocks"} moved{movers.thresholdPct ? ` ${movers.thresholdPct}% or more` : " a lot"} today (
            <span className="text-signal-bullish">{counts.up} up</span>, <span className="text-signal-bearish">{counts.down} down</span>).{" "}
          </>
        ) : null}
        <SeeAll href="/explore#moves">See each move on Market today</SeeAll>.
        {/* Today lists only posts that lean (lib/signals-shared.ts pickToday): with posts but none leaning, say that. */}
        {showPolicy ? null : policy.posts.length > 0 ? " The President's latest market posts did not lean either way." : " The President has not posted about the market lately."}
        {showReddit ? null : " Reddit has not said much about stocks lately."}
      </p>

    </>
  );
}
