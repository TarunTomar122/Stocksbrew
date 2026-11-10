import Link from "next/link";

import { CardGrid, Delta, Empty, FOCUS, Ticker } from "@/components/oa/kit";
import { HeadlineLine, ToneBar } from "@/components/wire/news-read";
import type { CompanyGroup } from "@/lib/wire-companies";
import { totalOf } from "@/lib/wire-read";
import { WIRE_PAGE_SIZE, wireHref, type WireFilters } from "@/lib/wire-shared";

/**
 * The wire read by company. One card per company in the news: who it is, how
 * the stock is moving, how its news leans, and the few headlines worth
 * opening. The full list for a company is one click away.
 */

/** Every card has room for this many headlines, so cards in a row match and their footers line up. */
const HEADLINE_SLOTS = 3;

function CompanyCard({ group, filters }: { group: CompanyGroup; filters: WireFilters }) {
  const items = group.items.slice(0, HEADLINE_SLOTS);
  const more = group.count - items.length;
  return (
    <article className="oa-surface flex h-full min-w-0 flex-col border border-oa-border bg-oa-card">
      <header className="flex items-center justify-between gap-3 border-b border-oa-border px-4 py-2.5">
        <Ticker symbol={group.ticker} name={group.name} size={22} className="min-w-0" />
        {group.pct !== null ? <Delta value={group.pct} digits={1} className="shrink-0 text-[14px] font-medium" /> : null}
      </header>
      {totalOf(group.tones) > 0 ? (
        <div className="flex min-h-9 items-center border-b border-oa-border bg-oa-bg px-4 py-1.5">
          <ToneBar counts={group.tones} showWord />
        </div>
      ) : null}
      <ul className="flex flex-1 flex-col gap-2.5 px-4 py-3">
        {items.map((item) => (
          // Two lines of headline and one of source each, whatever the text, so cards in a row line up.
          <li key={item.id} className="min-h-[58px]">
            <HeadlineLine item={item} />
          </li>
        ))}
      </ul>
      <Link
        href={wireHref({ ...filters, limit: WIRE_PAGE_SIZE }, { ticker: group.ticker, theme: null })}
        prefetch={false}
        className={`oa-card-foot mt-auto flex min-h-10 items-center justify-between border-t border-oa-border px-4 py-2 text-[13px] text-oa-muted-fg hover:bg-oa-accent hover:text-oa-fg ${FOCUS}`}
      >
        <span>
          {group.count} {group.count === 1 ? "story" : "stories"} in 24h
          {more > 0 ? ` · ${more} more` : ""}
        </span>
        <span aria-hidden="true">→</span>
      </Link>
    </article>
  );
}

function CompanyGrid({ groups, filters }: { groups: CompanyGroup[]; filters: WireFilters }) {
  return (
    <CardGrid cols={2}>
      {groups.map((group) => (
        <CompanyCard key={group.ticker} group={group} filters={filters} />
      ))}
    </CardGrid>
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
          <CompanyGrid groups={rest} filters={filters} />
          {canShowMore && total > rest.length ? (
            <Link
              href={wireHref(filters, { limit: filters.limit + WIRE_PAGE_SIZE })}
              prefetch={false}
              scroll={false}
              className={`mt-3 flex h-10 items-center justify-center rounded-md border border-oa-border bg-oa-card text-[14px] font-medium text-oa-fg hover:bg-oa-accent ${FOCUS}`}
            >
              More companies ({total - rest.length})
            </Link>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
