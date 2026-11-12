import * as React from "react";
import Link from "next/link";

import { Delta, Empty, FOCUS, NUM, Panel, Ticker, Verdict, fmtAgo, fmtDay } from "@/components/oa/kit";
import { capitalize, stampWords } from "@/lib/day-words";
import type { PolicyData, RedditData, RedditThread } from "@/lib/signals";
import { MoreLocked } from "@/components/oa/gate";
import { KindIcon } from "@/components/oa/nav-icon";
import { RedditMark } from "@/components/reddit-mark";
import { StockLogo } from "@/components/stock-logo";
import type { Plan } from "@/lib/entitlements";
import {
  POLICY_PAGE_SIZE,
  filterPolicy,
  inRedditList,
  rankReddit,
  redditHighlight,
  redditMovesToday,
  signalsHref,
  type MentionVelocity,
  type PolicyPost,
  type RedditName,
  type SignalsFilters,
  type Stance,
} from "@/lib/signals-shared";
import { moodWord } from "@/lib/tone";
import { sentenceCase } from "@/lib/plain-copy";
import { AppLink } from "@/components/oa/app-link";

const CHIP = "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border px-3 text-[14px] transition-colors sm:h-8 " + FOCUS;
const CHIP_ON = "border-[color-mix(in_srgb,var(--ink)_55%,transparent)] bg-oa-card font-medium text-oa-fg";
const CHIP_OFF = "border-oa-border text-oa-muted-fg hover:bg-oa-accent hover:text-oa-fg";

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
const LIST_SCROLL = "max-h-[36rem] overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

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
              {thread.tickers.length ? (
                <span className={`${NUM} inline-flex flex-wrap items-center gap-x-1.5`}>
                  ·
                  {thread.tickers.map((ticker) => (
                    <span key={ticker} className="inline-flex items-center gap-1">
                      <StockLogo ticker={ticker} size={13} />
                      {ticker}
                    </span>
                  ))}
                </span>
              ) : null}
            </p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** A section title with its kind's mark (owner VISUALS CHECK): Reddit's own mark, the scales for policy. */
function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="flex shrink-0 text-oa-muted-fg">{icon}</span>
      <span className="truncate">{children}</span>
    </span>
  );
}

/**
 * Reddit first (owner, Nov 12): every name Reddit is talking about in one ranked table, then the threads behind the
 * counts. The old Today tab's Reddit card was the top of this same list, so it is drawn once, here.
 */
export function RedditSection({ data }: { data: RedditData }) {
  const names = rankReddit(data.names.filter(inRedditList));
  const days = Math.round(data.windowHours / 24);
  return (
    <>
      <Panel
        id="reddit"
        label={<SectionTitle icon={<RedditMark size={16} />}>What Reddit is talking about</SectionTitle>}
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
          <div className={LIST_SCROLL}>
            <RedditTable names={names} all={data.names} wide />
          </div>
        ) : (
          <Empty className="!py-6">Reddit has not said much about stocks lately.</Empty>
        )}
      </Panel>
      <ThreadList threads={data.threads} />
    </>
  );
}

/* ── Policy ────────────────────────────────────────────────────────────── */

const POLICY_COLS = "lg:grid lg:grid-cols-[8.5rem_minmax(0,1fr)_minmax(0,11rem)_5.5rem] lg:items-center lg:gap-x-4";

/**
 * When a post went up, in day words (owner rule 4: "say yesterday"): "Today, 7:04 AM", "Yesterday, 1:47 AM",
 * "Monday, 4:29 PM", and the date only past six days ("Nov 5, 7:02 PM"). The time stays: a post's hour against the
 * market's open matters. Worked out at request time (the page is dynamic), so "today" is never a day stale.
 */
function postedWords(iso: string): string {
  const stamp = stampWords(iso).replace(/ ET$/, "");
  // stampWords gives only the time for today.
  return /^\d/.test(stamp) ? `Today, ${stamp}` : capitalize(stamp);
}
function PolicyLine({ post }: { post: PolicyPost }) {
  const stamp = postedWords(post.publishedAt);
  return (
    <div className={`px-4 py-2.5 lg:py-2 ${POLICY_COLS}`}>
      <div className="flex items-baseline justify-between gap-3 lg:contents">
        <time dateTime={post.publishedAt} className={`${NUM} whitespace-nowrap text-[12.5px] leading-5 text-oa-muted-fg`}>
          {stamp}
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

function PolicyDetail({ post }: { post: PolicyPost }) {
  return (
    <div className="border-t border-oa-border bg-oa-bg px-4 py-3 lg:pl-[10.5rem]">
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
        <span>{postedWords(post.publishedAt)} ET</span>
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

/**
 * Posts newest first: one line each, the full text, the names and the links behind a click. The column words stay put
 * at the top of the list's scroll box.
 */
function PolicyList({ posts }: { posts: PolicyPost[] }) {
  return (
    <>
      <div className={`sticky top-0 z-[2] hidden border-b border-oa-border bg-oa-bg px-4 py-2 ${POLICY_COLS}`}>
        <span className="oa-caption">Posted</span>
        <span className="oa-caption">What it said</span>
        <span className="oa-caption">Names, since</span>
        <span className="oa-caption text-right">S&amp;P since</span>
      </div>
      {/* Phone: the column words once, not "S&P since" on every row (owner, Nov 11). */}
      <div className="sticky top-0 z-[2] flex items-center justify-between gap-3 border-b border-oa-border bg-oa-bg px-4 py-2 lg:hidden">
        <span className="oa-caption">Posted, what it said</span>
        <span className="oa-caption">S&amp;P 500 since</span>
      </div>
      <ol>
        {posts.map((post) => (
          <li key={post.id} className="border-b border-oa-border last:border-b-0">
            <details className="group">
              <summary data-track="signal_opened" data-track-kind="policy" className={`cursor-pointer list-none hover:bg-oa-accent group-open:bg-oa-bg group-open:hover:bg-oa-accent [&::-webkit-details-marker]:hidden ${FOCUS}`}>
                <PolicyLine post={post} />
              </summary>
              <PolicyDetail post={post} />
            </details>
          </li>
        ))}
      </ol>
    </>
  );
}

/**
 * The President's market posts, under Reddit (owner, Nov 12), newest first, with the two filters in the card's head
 * (on a phone, on their own row under it). About eight posts in view, then the list scrolls inside (owner rule 5).
 */
export function PolicySection({
  data,
  filters,
  archive = null,
  className = "",
}: {
  data: PolicyData;
  filters: SignalsFilters;
  /** Posts older than the plan's archive, counted on the server and never sent. */
  archive?: { hidden: number; days: number; plan: Plan; trialEligible: boolean } | null;
  className?: string;
}) {
  const rows = filterPolicy(data.posts, filters.show);
  const visible = rows.slice(0, filters.limit);
  const named = data.posts.filter((post) => post.names.length > 0).length;
  // Filters only when the filter picks out something different (owner rule 4: no "Names a company 0" chip), or when it
  // is already on, so there is a way back to every post.
  const chips: ChipItem[] = (named > 0 && named < data.posts.length) || filters.show !== "all"
    ? [
        { id: "all", label: "All market posts", count: data.posts.length, href: signalsHref(filters, { show: "all", limit: POLICY_PAGE_SIZE }, "policy") },
        { id: "named", label: "Names a company", count: named, href: signalsHref(filters, { show: "named", limit: POLICY_PAGE_SIZE }, "policy") },
      ]
    : [];
  return (
    <>
      <Panel
        id="policy"
        className={className}
        label={<SectionTitle icon={<KindIcon name="scale" />}>What the President posted</SectionTitle>}
        right={chips.length ? <ChipRow items={chips} current={filters.show} className="hidden sm:flex" /> : undefined}
        flush
      >
        {chips.length ? <ChipRow items={chips} current={filters.show} className="!mx-0 border-b border-oa-border py-2 sm:hidden" /> : null}
        {visible.length ? (
          <div className={LIST_SCROLL}>
            <PolicyList posts={visible} />
          </div>
        ) : (
          <Empty className="!py-6">
            {data.posts.length ? "None of these posts named a company." : "The President has not posted about the market lately."}
          </Empty>
        )}
        {visible.length < rows.length ? (
          <div className="border-t border-oa-border p-2 text-center">
            <Link
              href={signalsHref(filters, { limit: filters.limit + POLICY_PAGE_SIZE }, "policy")}
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

