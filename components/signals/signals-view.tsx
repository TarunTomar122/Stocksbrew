import * as React from "react";
import Link from "next/link";

import { Delta, Empty, FOCUS, NUM, Panel, TabBar, Ticker, Verdict, fmtAgo, fmtDay, fmtMoney, fmtStampET, type TabItem } from "@/components/oa/kit";
import type { MoversData, PolicyData, RedditData, RedditThread } from "@/lib/signals";
import { MoreLocked } from "@/components/oa/gate";
import { StockLogo } from "@/components/stock-logo";
import { StockCard, StockChip, StockChipRow, fillLastRow } from "@/components/briefing/stock-card";
import type { Plan } from "@/lib/entitlements";
import {
  POLICY_PAGE_SIZE,
  filterMovers,
  filterPolicy,
  moverCounts,
  rankReddit,
  signalsHref,
  type MentionVelocity,
  type Mover,
  type PolicyPost,
  type RedditName,
  type SignalsFilters,
  type Stance,
  type TodayPick,
} from "@/lib/signals-shared";
import { moodWord } from "@/lib/tone";
import { firstFullSentence, plainFinance, sentenceCase } from "@/lib/plain-copy";
import { moveHref } from "@/lib/seo/families";
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
      { id: "unexplained", label: "Without a reason", count: counts.unexplained, href: signalsHref(filters, { show: "unexplained" }) },
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
 * as a ranking: who, how much, what kind of news, the headline, and the reason
 * written out under it. The row opens the move's own page, which has the
 * sources; a move with no reason opens the stock.
 */
const MOVER_COLS = "lg:grid lg:grid-cols-[1.75rem_minmax(0,13rem)_4.5rem_5rem_minmax(0,11rem)_minmax(0,1fr)] lg:items-center lg:gap-x-4";

function MoverLine({ mover, rank, day }: { mover: Mover; rank: number; day: string | null }) {
  // No reason found: the row is just the stock and its move, with nothing written in its place (owner, Nov 11).
  const cause = mover.explained ? mover.cause ?? "Company news" : null;
  const headline = mover.explained ? mover.headline : null;
  const why = mover.explained && mover.why && mover.why !== headline ? mover.why : null;
  // The move page lists the sources. It is only built for a move with a firm reason (lib/seo/families.ts
  // isConfirmedMove: medium or high confidence and at least one source), so anything looser opens the stock.
  const firm = mover.explained && (mover.confidence === "high" || mover.confidence === "medium") && mover.evidence.length > 0;
  const href = firm && day ? moveHref(mover.ticker, day) : undefined;
  return (
    <div className="relative px-4 py-3 transition-colors hover:bg-oa-accent lg:py-2.5">
      <div className={MOVER_COLS}>
        {/* who and how much: always the first thing on the line */}
        <div className="flex items-center gap-2 lg:contents">
          <span aria-label={`Rank ${rank}`} className={`${NUM} w-5 shrink-0 text-[12.5px] text-oa-muted-fg lg:w-auto`}>
            {rank}
          </span>
          <Ticker symbol={mover.ticker} name={mover.name} href={href} stretch size={20} className="min-w-0 flex-1 lg:flex-none" />
          <span className={`${NUM} hidden text-right text-[13px] text-oa-muted-fg lg:block`}>{mover.price !== null ? fmtMoney(mover.price) : ""}</span>
          <Delta value={mover.pct} className="shrink-0 text-[15px] font-semibold lg:w-[4.75rem] lg:text-right" />
        </div>
        {/* what kind of news, then the headline */}
        {/* The empty cells stay on a wide screen to hold the columns; on a phone they are not drawn. */}
        <p className={`mt-1.5 flex min-w-0 items-baseline gap-1.5 pl-7 text-[13px] leading-5 text-oa-fg lg:mt-0 lg:pl-0 ${cause ? "" : "max-lg:hidden"}`}>
          {cause ? (
            <>
              <span aria-hidden="true" className="size-1.5 shrink-0 translate-y-[-1px] rounded-full bg-oa-primary" />
              {/* Wraps instead of cutting off: "Earnings miss and analyst target cut" reads whole. */}
              <span className="min-w-0 text-pretty">{cause}</span>
            </>
          ) : null}
        </p>
        <p className={`mt-0.5 min-w-0 pl-7 text-[14px] font-medium leading-[21px] text-oa-fg lg:mt-0 lg:pl-0 ${headline ? "" : "max-lg:hidden"}`}>
          {headline ? plainFinance(sentenceCase(headline)) : null}
        </p>
        {/* The reason, always in view under the headline (owner rule 2: nothing to open to read it). */}
        {why ? (
          <p className="mt-1 min-w-0 text-pretty pl-7 text-[13.5px] leading-5 text-oa-muted-fg lg:col-start-2 lg:col-end-7 lg:mt-1 lg:max-w-[110ch] lg:pl-0">{why}</p>
        ) : null}
      </div>
    </div>
  );
}

export function MoversTab({ data, filters }: { data: MoversData; filters: SignalsFilters }) {
  const rows = filterMovers(data.movers, filters.show);
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
            </div>
            <ol data-track-links="mover_opened" data-track-list="movers">
              {rows.map((mover, index) => (
                <li key={mover.ticker} className="border-b border-oa-border last:border-b-0">
                  <MoverLine mover={mover} rank={index + 1} day={data.day} />
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

/** Only a name running hot says so. For the rest the post count says enough. */
function paceWords(velocity: MentionVelocity): string | null {
  if (velocity.state === "rising" && velocity.ratio !== null) return `${velocity.ratio.toFixed(1)}× the usual talk`;
  if (velocity.state === "new") return "new today";
  return null;
}

/**
 * What is being said about a name, as one sentence: the mood first when the posts lean one way ("Worried: board
 * investigation and national-security allegations."), nothing about mood when they don't.
 */
function redditSentence(name: RedditName, full: boolean): string | null {
  const said = full ? (name.summary ? firstFullSentence(name.summary) : name.catalysts[0] ?? null) : (name.catalysts[0] ?? (name.summary ? firstFullSentence(name.summary) : null));
  const mood = name.stanceRead && name.stance !== "neutral" ? moodWord(name.stance) : null;
  const clean = said ? said.trim().replace(/[.!]+$/, "") : "";
  if (!clean) return mood ? `${mood.word}.` : null;
  if (!mood || mood.tone === "flat") return `${clean.charAt(0).toUpperCase()}${clean.slice(1)}.`;
  // The line keeps its own first capital after the colon, so "CEO", "AI" and "Nvidia" are never lowered.
  return `${mood.word}: ${clean.charAt(0).toUpperCase()}${clean.slice(1)}.`;
}

/**
 * The Reddit names as stock cards (owner rule 3): logo and ticker, the post count as the one big figure, what is
 * being said as one sentence, and one highlighted fact only when a name is running hot. Every name is in the list;
 * about eight show at a time and the rest scroll inside with no bar (owner rule 5). The card opens the stock.
 */
function RedditCards({ names, wide = false, full = false }: { names: RedditName[]; wide?: boolean; full?: boolean }) {
  const cols = wide ? ({ sm: 2, lg: 3 } as const) : ({ sm: 2 } as const);
  const posts = (count: number) => `${count} ${count === 1 ? "post" : "posts"}`;
  const rows = names.map((name) => {
    const pace = paceWords(name.velocity);
    const foot = full
      ? [name.subreddits.length ? name.subreddits.slice(0, 2).map((sub) => `r/${sub}`).join(", ") : null, name.latestPostAt ? `${fmtAgo(name.latestPostAt)} ago` : null]
          .filter(Boolean)
          .join(" · ")
      : "";
    return { name, sentence: redditSentence(name, full), fact: pace ? cap(pace) : null, foot: foot || null };
  });
  // A name with nothing said about it is a chip under the cards, not an empty card (owner rule 4).
  const cards = rows.filter((row) => row.sentence || row.fact || row.foot);
  const bare = rows.filter((row) => !(row.sentence || row.fact || row.foot));
  return (
    <div data-track-links="signal_opened" data-track-kind="reddit" className="p-3">
      {cards.length > 0 ? (
        <ul className={`grid grid-flow-row-dense grid-cols-1 gap-3 sm:grid-cols-2 ${wide ? "lg:grid-cols-3" : ""}`}>
          {cards.map(({ name, sentence, fact, foot }, index) => (
            <StockCard
              key={name.ticker}
              ticker={name.ticker}
              // Ticker only (owner rule): fund names like "SPDR S&P 500 ETF Trust" wrapped to three lines in a narrow card.
              name={name.ticker}
              figure={posts(name.mentions)}
              sentence={sentence}
              fact={fact}
              foot={foot}
              fill={fillLastRow(index, cards.length, cols)}
              cover={
                <Link
                  href={`/stock/${encodeURIComponent(name.ticker)}`}
                  prefetch={false}
                  aria-label={`${name.ticker}, ${name.mentions} Reddit ${name.mentions === 1 ? "post" : "posts"}`}
                  className="absolute inset-0 z-0 rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
                />
              }
            />
          ))}
        </ul>
      ) : null}
      {bare.length > 0 ? (
        <StockChipRow label="Also talked about" className={cards.length > 0 ? "mt-3" : ""}>
          {bare.map(({ name }) => (
            <StockChip key={name.ticker} ticker={name.ticker} figure={posts(name.mentions)} label={`${name.ticker}, ${name.mentions} Reddit ${name.mentions === 1 ? "post" : "posts"}`} />
          ))}
        </StockChipRow>
      ) : null}
    </div>
  );
}

// About eight cards in view, then the list scrolls inside with no bar showing (owner rule 5).
const REDDIT_SCROLL = "max-h-[40rem] overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

function cap(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
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
        {names.length ? (
          <div className={REDDIT_SCROLL}>
            <RedditCards names={names} wide full />
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
const TODAY_SCROLL = "max-h-[32rem] overflow-y-auto lg:h-[32rem] overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

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
              // Only when the card holds fewer names than there are; it scrolls every one it holds.
              reddit.names.length > pick.reddit.length ? <SeeAll href={signalsHref(filters, { tab: "reddit" })}>All {reddit.names.length} names</SeeAll> : null
            }
            flush
          >
            {pick.reddit.length ? (
              <div className={scroll}>
                <RedditCards names={pick.reddit} wide={!pair} />
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
      {/* Signals is what people are saying. The day's moves and their reasons live on Why stocks moved, so they are one line here, not a third copy of the same list. */}
      <p className="text-[14px] leading-5 text-oa-muted-fg">
        {counts.all ? (
          <>
            {counts.all} {counts.all === 1 ? "stock" : "stocks"} moved{movers.thresholdPct ? ` ${movers.thresholdPct}% or more` : " a lot"} today (
            <span className="text-signal-bullish">{counts.up} up</span>, <span className="text-signal-bearish">{counts.down} down</span>).{" "}
          </>
        ) : null}
        <Link prefetch={false} href="/movers" className="font-medium text-oa-fg underline decoration-oa-border underline-offset-2 hover:decoration-oa-fg">
          See why each one moved
        </Link>{" "}
        or <SeeAll href={moversHref}>the full list here</SeeAll>.
        {showPolicy ? null : " The President has not posted about the market lately."}
        {showReddit ? null : " Reddit has not said much about stocks lately."}
      </p>

    </>
  );
}
