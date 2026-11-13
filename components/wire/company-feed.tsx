import Link from "next/link";
import type * as React from "react";

import { Delta, Empty, FOCUS, NUM, Ticker, fmtMoney } from "@/components/oa/kit";
import { HeadlineLine, RowTone } from "@/components/wire/news-read";
import { ToneColumns } from "@/components/wire/tone-columns";
import { COMPANY_PAGE, type CompanyGroup } from "@/lib/wire-companies";
import { cardHeadline, splitByTone, totalOf } from "@/lib/wire-read";
import { WIRE_PAGE_SIZE, wireHref, type WireFilters } from "@/lib/wire-shared";

/**
 * The wire read by company, stock first (owner rule 7). One card per company in the news: who it is and how the
 * stock is moving, how its news leans (said once per card, never as a mark on every headline), and the few
 * headlines worth opening as the evidence, whole and in sentence case. The whole card opens all its stories.
 * This is the page's one feed: each section splits its cards into good news on the left and mixed or bad on the right
 * (components/wire/tone-columns.tsx), about four a column in view and the rest behind one "Show N more", never a box
 * scrolling inside (owner, Nov 12). Past what is loaded, the same button becomes "More companies".
 */

function CompanyCard({ group, filters }: { group: CompanyGroup; filters: WireFilters }) {
  // One headline per card, at most 15 words (owner rule 8); the card itself opens the rest.
  const lead = cardHeadline(group.items, group.name ?? "");
  return (
    // The whole card opens the company's stories; the stock and each headline keep their own links above it.
    // No "see more" arrow repeated on every card (owner, Nov 11).
    <article className={`oa-surface relative flex min-w-0 flex-col border border-oa-border bg-oa-card transition-colors hover:border-[color-mix(in_srgb,var(--oa-fg)_25%,transparent)]`}>
      {/* The move and, only when the news clearly leans, its tone, both on the title row: a separate tone strip on some
          cards and not others left their neighbours with an empty band at the bottom (owner rule 4). Each piece has its
          own place (judge90, 390px: ticker, tone and price ran into each other): a narrow card puts the tone under the
          company and the price's day under the price; from 26rem it is one line. The header is its own size container. */}
      <header className="border-b border-oa-border px-4 py-2.5 [container-type:inline-size]">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 [grid-template-areas:'stock_price'_'tone_day'] [@container(min-width:26rem)]:grid-cols-[minmax(0,1fr)_auto_auto] [@container(min-width:26rem)]:[grid-template-areas:'stock_tone_price']">
          <Ticker symbol={group.ticker} name={group.name} size={22} atOnce className="relative z-10 min-w-0 [grid-area:stock]" />
          {/* The company's tone, the same words as its row in Most talked about (rowTone), on every toned card. A card
              with no tone read sits in "No read yet", where its group header says so once. Under the logo's width on a
              narrow card, so it reads as the company's. */}
          {totalOf(group.tones) > 0 ? (
            <span className="min-w-0 pl-[30px] [grid-area:tone] [@container(min-width:26rem)]:pl-0">
              <RowTone counts={group.tones} stories={group.count} />
            </span>
          ) : null}
          <span className="flex items-baseline justify-end gap-3 whitespace-nowrap [grid-area:price]">
            {/* Today's price beside its move (owner rule 4), from the stock's latest quote. */}
            {group.price != null ? (
              <span className={`${NUM} text-[14px] text-oa-fg`}>
                {fmtMoney(group.price)}
              </span>
            ) : null}
            {group.pct !== null ? <Delta value={group.pct} digits={1} className="text-[14px] font-medium" /> : null}
            {/* An earlier session's price and move say their day after them: "$37.53 −7.7% yesterday" (lib/wire-prices.ts). */}
            {group.priceDay ? <span className="-ml-1.5 hidden text-[12.5px] text-oa-muted-fg [@container(min-width:26rem)]:inline">{group.priceDay}</span> : null}
          </span>
          {group.priceDay ? (
            <span className="whitespace-nowrap text-right text-[12.5px] leading-[18px] text-oa-muted-fg [grid-area:day] [@container(min-width:26rem)]:hidden">{group.priceDay}</span>
          ) : null}
        </div>
      </header>
      {/* No footer count: the tone above is the card's one figure (owner rule 5), and the card itself opens the rest. */}
      {lead ? (
        <div className="flex-1 px-4 py-3">
          <HeadlineLine item={lead} companyName={group.name ?? ""} className="relative z-10" />
        </div>
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

/** The filters a fold belongs to: everything but the page size, which "More companies" grows within the same feed. */
function foldKey(filters: WireFilters): string {
  return JSON.stringify({ ...filters, limit: null });
}

/** One section's company cards, good news left and mixed or bad right, folded per column. */
function CompanyColumns({
  groups,
  filters,
  label,
  startOpen = false,
  more = null,
}: {
  groups: CompanyGroup[];
  filters: WireFilters;
  label: string;
  startOpen?: boolean;
  more?: React.ReactNode;
}) {
  // Good, mixed or bad, and not read yet; a section where no card has any tone read is one list (ToneColumns).
  const { good, bad, unread } = splitByTone(groups);
  const card = (group: CompanyGroup) => (
    <li key={group.ticker}>
      <CompanyCard group={group} filters={filters} />
    </li>
  );
  return (
    <ToneColumns
      // A new filter is a new feed: it starts folded again, whatever the last one was left at.
      key={foldKey(filters)}
      good={good.map(card)}
      bad={bad.map(card)}
      unread={unread.map(card)}
      cut={4}
      variant="cards"
      label={label}
      startOpen={startOpen}
      more={more}
    />
  );
}

export function CompanyFeed({
  groups,
  filters,
  shown,
  canShowMore,
  signedIn,
}: {
  /** Companies with a headline to show (`hasCardHeadline`), already filtered by the page before it picked their prices. */
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
  const restLabel = filters.mine ? "Your companies" : "In the news today";
  return (
    <div className="flex flex-col gap-6">
      {mine.length ? (
        <section>
          <h2 className="oa-label mb-2.5">Your companies</h2>
          <CompanyColumns groups={mine} filters={filters} label="Your companies" />
        </section>
      ) : null}
      {rest.length ? (
        <section>
          {/* Signed out the section has no visible title; screen readers still get one over its two tone headers. */}
          <h2 className={mine.length || signedIn ? "oa-label mb-2.5" : "sr-only"}>{restLabel}</h2>
          <CompanyColumns
            groups={rest}
            filters={filters}
            label={restLabel}
            // A later page of the feed opens unfolded: the reader already asked for more.
            startOpen={shown > COMPANY_PAGE}
            more={
              canShowMore && total > rest.length ? (
                <Link
                  href={wireHref(filters, { limit: filters.limit + WIRE_PAGE_SIZE })}
                  prefetch={false}
                  scroll={false}
                  className={`mt-2 flex h-9 items-center justify-center rounded-md text-[13px] font-medium text-oa-muted-fg hover:bg-oa-accent hover:text-oa-fg ${FOCUS}`}
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
