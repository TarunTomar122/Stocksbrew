import Link from "next/link";

import { CardGrid, Delta, Empty, FOCUS, Ticker } from "@/components/oa/kit";
import { HeadlineLine, ToneBar, leanWords } from "@/components/wire/news-read";
import type { CompanyGroup } from "@/lib/wire-companies";
import { WIRE_PAGE_SIZE, wireHref, type WireFilters } from "@/lib/wire-shared";

/**
 * The wire read by company, stock first (owner rule 7). One card per company in the news: who it is and how the
 * stock is moving, how its news leans (said once per card, never as a mark on every headline), and the few
 * headlines worth opening as the evidence, whole and in sentence case. The whole card opens all its stories.
 */

/** The headlines a card shows; the rest are one click away. */
const HEADLINE_SLOTS = 3;

function CompanyCard({ group, filters }: { group: CompanyGroup; filters: WireFilters }) {
  const items = group.items.slice(0, HEADLINE_SLOTS);
  return (
    // The whole card opens the company's stories; the stock and each headline keep their own links above it.
    // No "see more" arrow repeated on every card (owner, Nov 11).
    <article className="oa-surface relative flex h-full min-w-0 flex-col border border-oa-border bg-oa-card transition-colors hover:border-[color-mix(in_srgb,var(--oa-fg)_25%,transparent)]">
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
      <ul className="flex flex-1 flex-col gap-2.5 px-4 py-3">
        {items.map((item) => (
          <li key={item.id}>
            <HeadlineLine item={item} companyName={group.name ?? ""} className="relative z-10" />
          </li>
        ))}
      </ul>
      <Link
        href={wireHref({ ...filters, limit: WIRE_PAGE_SIZE }, { ticker: group.ticker, theme: null })}
        prefetch={false}
        aria-label={`All ${group.count} ${group.count === 1 ? "story" : "stories"} about ${group.name || group.ticker}`}
        className="absolute inset-0 z-0 rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
      />
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
