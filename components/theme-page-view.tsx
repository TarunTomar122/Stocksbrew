import Link from "next/link";

import {
  FeedStickyUnlock,
  FeedUnlockBar,
} from "@/components/feed-row-lock-teaser";
import { StockLogo } from "@/components/stock-logo";
import { TrackButton } from "@/components/track-button";
import { SquircleSurface } from "@/components/oa/squircle";
import { resolveStockTier } from "@/lib/ai-launch-tier";
import { FREE_THEME_VISIBLE_LIMIT } from "@/lib/pro-features";
import type { InvestmentTheme, ThemeCandidate } from "@/lib/investment-themes";

export type ThemeCandidateQuote = ThemeCandidate & {
  price?: number;
  changePct?: number;
};

type Props = {
  theme: InvestmentTheme;
  candidates: ThemeCandidateQuote[];
  watchlist: ThemeCandidateQuote[];
  isSubscribed: boolean;
  trackedIds: string[];
  trackedCount: number;
};

function instrumentId(ticker: string): string {
  return `US_${ticker.toUpperCase().replace(/[.-]/g, "_")}`;
}

function money(value: number): string {
  return value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}

function changeLabel(value: number): string {
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}%`;
}

function scoreLabel(candidate: ThemeCandidate): string {
  if (typeof candidate.stocksbrewScore !== "number") return "—";
  return `${candidate.stocksbrewLabel} · ${candidate.stocksbrewScore.toFixed(1)}`;
}

function CandidateIdentity({
  candidate,
  trackedIds,
  trackedCount,
  isSubscribed,
}: {
  candidate: ThemeCandidateQuote;
  trackedIds: string[];
  trackedCount: number;
  isSubscribed: boolean;
}) {
  const id = instrumentId(candidate.ticker);
  return (
    <div className="flex min-w-0 items-start gap-3">
      <StockLogo ticker={candidate.ticker} size={38} circle eager />
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[17px] font-medium tracking-tight text-oa-fg">
            {candidate.ticker}
          </span>
          <span className="pointer-events-auto opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <TrackButton
              ticker={candidate.ticker}
              instrumentId={id}
              tier={resolveStockTier(id, trackedIds)}
              isSubscribed={isSubscribed}
              isTracked={trackedIds.includes(id)}
              trackedCount={trackedCount}
              variant="icon"
              untrackedLabel="Track"
            />
          </span>
        </div>
        <p className="mt-0.5 truncate text-[13px] text-oa-muted-fg">
          {candidate.company}
        </p>
        <p className="mt-2 text-[12px] text-oa-muted-fg">{candidate.role}</p>
      </div>
    </div>
  );
}

function Quote({ candidate }: { candidate: ThemeCandidateQuote }) {
  if (typeof candidate.price !== "number")
    return <span className="text-[15px] tabular-nums text-oa-muted-fg">—</span>;
  return (
    <div className="text-left sm:text-right">
      <p className="text-[15px] font-medium tabular-nums text-oa-fg">
        ${money(candidate.price)}
      </p>
      {typeof candidate.changePct === "number" ? (
        <p
          className={`mt-0.5 text-[13px] font-medium tabular-nums ${candidate.changePct >= 0 ? "text-[#087f5b]" : "text-[#b42318]"}`}
        >
          {changeLabel(candidate.changePct)}
        </p>
      ) : null}
    </div>
  );
}

function CandidateRow({
  candidate,
  trackedIds,
  trackedCount,
  isSubscribed,
}: {
  candidate: ThemeCandidateQuote;
  trackedIds: string[];
  trackedCount: number;
  isSubscribed: boolean;
}) {
  return (
    <div className="group relative border-t border-oa-border/80 px-5 py-5 first:border-t-0 sm:px-6">
      <Link
        href={`/stock/${encodeURIComponent(candidate.ticker)}`}
        aria-label={`Open ${candidate.ticker} stock page`}
        className="absolute inset-0 z-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-oa-fg/40"
      />
      <div className="pointer-events-none relative z-10 grid gap-4 sm:grid-cols-[minmax(16rem,0.8fr)_minmax(0,2fr)_7rem] sm:items-start sm:gap-4">
        <CandidateIdentity
          candidate={candidate}
          trackedIds={trackedIds}
          trackedCount={trackedCount}
          isSubscribed={isSubscribed}
        />
        <div className="min-w-0">
          <p className="text-[16px] leading-6 text-oa-fg">
            {candidate.benefitMechanism}
          </p>
          <p
            className={`mt-3 text-[14px] font-medium ${typeof candidate.stocksbrewScore === "number" ? "text-[#087f5b]" : "text-oa-muted-fg"}`}
          >
            {scoreLabel(candidate)}
          </p>
        </div>
        <div className="text-left sm:text-right">
          <Quote candidate={candidate} />
        </div>
      </div>
    </div>
  );
}

function LockedCandidateRow({ candidate }: { candidate: ThemeCandidateQuote }) {
  return (
    <div className="border-t border-oa-border/80 px-5 py-5 sm:px-6" aria-hidden>
      <div className="pointer-events-none grid select-none gap-4 blur-[5px] sm:grid-cols-[minmax(16rem,0.8fr)_minmax(0,2fr)_7rem] sm:items-start sm:gap-4">
        <div className="flex items-center gap-3">
          <StockLogo ticker={candidate.ticker} size={38} circle />
          <div>
            <p className="text-[17px] font-medium">{candidate.ticker}</p>
            <p className="text-[13px]">{candidate.company}</p>
            <p className="mt-2 text-[12px]">{candidate.role}</p>
          </div>
        </div>
        <div>
          <p className="text-[16px] leading-6">{candidate.benefitMechanism}</p>
          <p className="mt-2 text-[14px] font-medium">{scoreLabel(candidate)}</p>
        </div>
        <div className="text-right">
          <Quote candidate={candidate} />
        </div>
      </div>
    </div>
  );
}

function WatchlistCard({ candidate }: { candidate: ThemeCandidateQuote }) {
  return (
    <Link
      href={`/stock/${encodeURIComponent(candidate.ticker)}`}
      className="group rounded-[24px] outline-none focus-visible:ring-2 focus-visible:ring-oa-fg/40 sm:rounded-[30px]"
    >
      <SquircleSurface className="h-full border border-oa-border p-5 transition-[border-color,box-shadow,transform] duration-200 group-hover:-translate-y-0.5 group-hover:border-oa-fg/25 group-hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <StockLogo ticker={candidate.ticker} size={36} circle />
            <div className="min-w-0">
              <p className="text-[17px] font-medium text-oa-fg">
                {candidate.ticker}
              </p>
              <p className="truncate text-[13px] text-oa-muted-fg">
                {candidate.company}
              </p>
            </div>
          </div>
          <Quote candidate={candidate} />
        </div>
        <p className="mt-5 inline-flex rounded-full border border-oa-border px-2.5 py-1 text-[12px] text-oa-muted-fg">
          {candidate.role}
        </p>
        <p className="mt-4 text-[14px] leading-5 text-oa-muted-fg">
          {candidate.benefitMechanism}
        </p>
      </SquircleSurface>
    </Link>
  );
}

export function ThemePageView({
  theme,
  candidates,
  watchlist,
  isSubscribed,
  trackedIds,
  trackedCount,
}: Props) {
  const visibleCandidates = isSubscribed
    ? candidates
    : candidates.slice(0, FREE_THEME_VISIBLE_LIMIT);
  const lockedCount = isSubscribed
    ? 0
    : Math.max(0, candidates.length - FREE_THEME_VISIBLE_LIMIT);
  const lockedPreviewCandidates = isSubscribed
    ? []
    : candidates.slice(FREE_THEME_VISIBLE_LIMIT, FREE_THEME_VISIBLE_LIMIT + 1);
  return (
    <div className="mx-auto flex w-full max-w-[76rem] flex-col gap-10 px-4 py-8 sm:gap-14 sm:px-6 sm:py-12">
      <div>
        <Link
          href="/explore"
          className="text-[14px] text-oa-muted-fg hover:text-oa-fg hover:underline"
        >
          ← Explore themes
        </Link>
        <div className="mt-8 max-w-3xl">
          <h1 className="text-balance text-[2.5rem] font-medium leading-[1.04] tracking-tight text-oa-fg sm:text-5xl">
            {theme.name}
          </h1>
          <p className="mt-4 text-[17px] leading-7 text-oa-muted-fg sm:text-[18px]">
            {theme.description}
          </p>
        </div>
      </div>

      <section aria-label="Theme research">
        <SquircleSurface className="overflow-hidden border border-oa-border">
          <div className="hidden grid-cols-[minmax(16rem,0.8fr)_minmax(0,2fr)_7rem] gap-4 border-b border-oa-border bg-oa-bg/60 px-6 py-3 text-[11px] font-medium uppercase tracking-[0.12em] text-oa-muted-fg sm:grid">
            <span>Company</span>
            <span>Why it matters</span>
            <span className="text-right">Signal</span>
          </div>
          {visibleCandidates.map((candidate) => (
            <CandidateRow
              key={candidate.ticker}
              candidate={candidate}
              trackedIds={trackedIds}
              trackedCount={trackedCount}
              isSubscribed={isSubscribed}
            />
          ))}
          {lockedPreviewCandidates.map((candidate) => (
            <LockedCandidateRow key={candidate.ticker} candidate={candidate} />
          ))}
          {lockedCount > 0 ? (
            <FeedUnlockBar
              surface="theme_page"
              description={`${lockedCount} more names and their full research context are available with Pro.`}
              compact
            />
          ) : null}
        </SquircleSurface>
        {lockedCount > 0 ? <FeedStickyUnlock surface="theme_page" /> : null}
      </section>

      {watchlist.length > 0 ? (
        <section aria-labelledby="theme-watchlist-heading">
          <div>
            <h2
              id="theme-watchlist-heading"
              className="text-[28px] font-medium tracking-tight text-oa-fg sm:text-3xl"
            >
              Other names worth tracking
            </h2>
            <p className="mt-2 text-[15px] leading-6 text-oa-muted-fg">
              Smaller or higher-risk exposure that belongs on the radar.
            </p>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {watchlist.map((candidate) => (
              <WatchlistCard key={candidate.ticker} candidate={candidate} />
            ))}
          </div>
        </section>
      ) : null}

      {theme.resources.length > 0 ? (
        <section
          aria-labelledby="theme-resources-heading"
          className="border-t border-oa-border/70 pt-8"
        >
          <h2
            id="theme-resources-heading"
            className="text-[20px] font-medium tracking-tight text-oa-fg"
          >
            Resources for deeper research
          </h2>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-3">
            {theme.resources.map((resource) => (
              <a
                key={resource.href}
                href={resource.href}
                target="_blank"
                rel="noreferrer"
                className="text-[14px] text-oa-muted-fg underline decoration-oa-border underline-offset-4 hover:text-oa-fg"
              >
                {resource.label} ↗
              </a>
            ))}
          </div>
        </section>
      ) : null}

      <p className="text-[13px] text-oa-muted-fg">
        Curated research map · research only, not investment advice.
      </p>
    </div>
  );
}
