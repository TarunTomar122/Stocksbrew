import Link from "next/link";
import type * as React from "react";

import { CardGrid, Delta, Empty, FOCUS, Ticker } from "@/components/oa/kit";
import { HeadlineLine, ToneBar, leanWords } from "@/components/wire/news-read";
import { WholeRows } from "@/components/wire/whole-rows";
import type { CompanyGroup } from "@/lib/wire-companies";
import { WIRE_PAGE_SIZE, wireHref, type WireFilters } from "@/lib/wire-shared";

/**
 * The wire read by company, stock first (owner rule 7). One card per company in the news: who it is and how the
 * stock is moving, how its news leans (said once per card, never as a mark on every headline), and the few
 * headlines worth opening as the evidence, whole and in sentence case. The whole card opens all its stories.
 * This is the page's one feed: every list of cards shows about three rows at a time and scrolls inside (owner rule 5),
 * so a phone is never handed an endless page, and every company stays one scroll away: "More companies" is the box's
 * last row, so the cards it brings land right where the reader already is.
 */

/**
 * The feed's box: about three cards on a phone, and four rows of two (eight companies) wider up (owner rule 5: about
 * eight in view, the rest in the same scroll), ending on a whole row.
 */
const FEED_REM = 40;
const FEED_WIDE_REM = 56;

/** The headlines a card shows, so eight companies fit in view; the card itself opens the rest. */
const HEADLINE_SLOTS = 2;

function CompanyCard({ group, filters, fill = "" }: { group: CompanyGroup; filters: WireFilters; fill?: string }) {
  const items = group.items.slice(0, HEADLINE_SLOTS);
  return (
    // The whole card opens the company's stories; the stock and each headline keep their own links above it.
    // No "see more" arrow repeated on every card (owner, Nov 11).
    <article data-row="" className={`oa-surface relative flex h-full min-w-0 flex-col border ${fill} border-oa-border bg-oa-card transition-colors hover:border-[color-mix(in_srgb,var(--oa-fg)_25%,transparent)]`}>
      {/* The move and, only when the news clearly leans, its tone, both on the title row: a separate tone strip on some
          cards and not others left their neighbours with an empty band at the bottom (owner rule 4). */}
      <header className="flex items-center justify-between gap-3 border-b border-oa-border px-4 py-2.5">
        <Ticker symbol={group.ticker} name={group.name} size={22} className="relative z-10 min-w-0" />
        <span className="flex shrink-0 items-baseline gap-3">
          {leanWords(group.tones, group.count) ? <ToneBar counts={group.tones} stories={group.count} /> : null}
          {group.pct !== null ? <Delta value={group.pct} digits={1} className="text-[14px] font-medium" /> : null}
        </span>
      </header>
      {/* No footer count: the tone above is the card's one figure (owner rule 5), and the card itself opens the rest. */}
      {/* A followed company whose stories were all bait keeps its card (lib/wire-companies.ts) with no empty list band. */}
      {items.length ? (
        <ul className="flex flex-1 flex-col gap-2.5 px-4 py-3">
          {items.map((item) => (
            <li key={item.id}>
              <HeadlineLine item={item} companyName={group.name ?? ""} className="relative z-10" />
            </li>
          ))}
        </ul>
      ) : null}
      <Link
        href={wireHref({ ...filters, limit: WIRE_PAGE_SIZE }, { ticker: group.ticker, theme: null })}
        prefetch={false}
        aria-label={`All ${group.count} ${group.count === 1 ? "story" : "stories"} about ${group.name || group.ticker}`}
        className="absolute inset-0 z-0 rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
      />
    </article>
  );
}

/** One list of company cards in its bounded box; a lone last card takes its whole row (owner rule 4). */
function CompanyGrid({ groups, filters, more = null }: { groups: CompanyGroup[]; filters: WireFilters; more?: React.ReactNode }) {
  return (
    <WholeRows
      rem={FEED_REM}
      wideRem={FEED_WIDE_REM}
      cue
      className="scrollbar-hide overflow-y-auto max-h-[40rem] sm:max-h-[56rem]"
    >
      <CardGrid cols={2}>
        {groups.map((group, index) => (
          <CompanyCard
            key={group.ticker}
            group={group}
            filters={filters}
            fill={index === groups.length - 1 && groups.length % 2 === 1 ? "md:col-span-2" : ""}
          />
        ))}
      </CardGrid>
      {more}
    </WholeRows>
  );
}

export function CompanyFeed({
  groups,
  filters,
  shown,
  canShowMore,
  signedIn,
}: {
  groups: CompanyGroup[];
  filters: WireFilters;
  /** How many company cards to show before "more companies". */
  shown: number;
  /** False once the URL is at its largest page, so the link never reloads the same page. */
  canShowMore: boolean;
  signedIn: boolean;
}) {
  if (!groups.length) {
    return (
      <Empty title="No companies in the news yet">
        {filters.topic || filters.q || filters.mine ? "Nothing matches these filters today." : "Headlines naming a company show up here as they land."}
      </Empty>
    );
  }
  const mine = filters.mine ? [] : groups.filter((group) => group.mine);
  const rest = (filters.mine ? groups : groups.filter((group) => !group.mine)).slice(0, shown);
  const total = filters.mine ? groups.length : groups.length - mine.length;
  return (
    <div className="flex flex-col gap-6">
      {mine.length ? (
        <section>
          <h2 className="oa-label mb-2.5">Your companies</h2>
          <CompanyGrid groups={mine} filters={filters} />
        </section>
      ) : null}
      {rest.length ? (
        <section>
          {mine.length || signedIn ? <h2 className="oa-label mb-2.5">{filters.mine ? "Your companies" : "In the news today"}</h2> : null}
          <CompanyGrid
            groups={rest}
            filters={filters}
            more={
              canShowMore && total > rest.length ? (
                <Link
                  href={wireHref(filters, { limit: filters.limit + WIRE_PAGE_SIZE })}
                  prefetch={false}
                  scroll={false}
                  className={`mt-3 flex h-10 items-center justify-center rounded-md border border-oa-border bg-oa-card text-[14px] font-medium text-oa-fg hover:bg-oa-accent ${FOCUS}`}
                >
                  More companies ({total - rest.length})
                </Link>
              ) : null
            }
          />
        </section>
      ) : null}
    </div>
  );
}
