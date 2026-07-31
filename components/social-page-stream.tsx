import Link from "next/link";

import { FeedLockedSection, FeedRowLockedBlur } from "@/components/feed-row-lock-teaser";
import { StockLogo } from "@/components/stock-logo";
import { getSessionUser } from "@/lib/auth-server";
import { relativeTime } from "@/lib/freshness";
import { getRedditCues, hasRedditBrief } from "@/lib/reddit-cues";
import { socialDataState } from "@/lib/social-data";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

const FREE_SOCIAL_CARDS = 3;

const TONE: Record<string, { label: string; color: string; background: string }> = {
  bullish: { label: "Bullish", color: "var(--signal-bullish)", background: "#ecfdf5" },
  bearish: { label: "Bearish", color: "var(--signal-bearish)", background: "#fef2f2" },
  neutral: { label: "Mixed", color: "var(--signal-neutral)", background: "#f1f5f9" },
  mixed: { label: "Mixed", color: "var(--signal-neutral)", background: "#f1f5f9" },
};

function age(value?: string): string {
  return value ? relativeTime(value) : "time unavailable";
}

export async function SocialPageStream() {
  const [snapshot, session] = await Promise.all([
    getRedditCues("US").catch(() => null),
    getSessionUser().catch(() => null),
  ]);
  const userDoc = session ? await getUserDoc(session.uid).catch(() => null) : null;
  const isSubscribed = resolveIsSubscribed(userDoc);
  const state = socialDataState(snapshot);

  if (!snapshot || state === "empty") {
    return (
      <section className="rounded-xl border border-outline-variant bg-surface px-5 py-10">
        <p className="text-[15px] font-semibold text-on-surface">Social scan is rebuilding.</p>
        <p className="mt-1 text-[13px] text-on-surface-variant">
          No reliable ticker discussion rows are available yet.
        </p>
      </section>
    );
  }

  const stateLabel =
    state === "stale"
      ? `Last updated ${age(snapshot.generated_at)}`
      : state === "partial"
      ? `Limited signal · ${age(snapshot.generated_at)}`
      : `Live signal · ${age(snapshot.generated_at)}`;
  const insights = snapshot.tickers.filter(hasRedditBrief).slice(0, 12);
  const visibleInsights = isSubscribed
    ? insights
    : [...insights.slice(0, FREE_SOCIAL_CARDS), ...insights.slice(FREE_SOCIAL_CARDS, FREE_SOCIAL_CARDS + 2)];

  if (insights.length === 0) {
    return (
      <section className="rounded-xl border border-outline-variant bg-surface px-5 py-10">
        <p className="text-[15px] font-semibold text-on-surface">No strong social insight right now.</p>
        <p className="mt-1 text-[13px] text-on-surface-variant">
          We&apos;ll show a name when the discussion has a clear investment angle.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-outline-variant py-3 font-mono text-[10px] uppercase tracking-[0.08em] text-on-surface-variant">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-landing-brand" aria-hidden />
          <span
            style={{
              color: state === "fresh" ? "var(--signal-bullish)" : "var(--signal-neutral)",
            }}
          >
            {stateLabel}
          </span>
        </div>
        <span>{insights.length} names with a clear read</span>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibleInsights.map((row, index) => {
            const tone = TONE[row.sentiment] ?? TONE.neutral;
            const locked = !isSubscribed && index >= FREE_SOCIAL_CARDS;
            const body = (
              <>
                <div className="flex min-w-0 items-center gap-2.5">
                  <StockLogo ticker={row.ticker} market="US" size={30} />
                  <div className="min-w-0">
                    <p className="font-mono text-[13px] font-bold text-on-surface group-hover:text-landing-brand">
                      {row.ticker}
                    </p>
                    {row.company_name ? (
                      <p className="truncate text-[10.5px] text-on-surface-variant">
                        {row.company_name}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className="ml-auto shrink-0 rounded-full px-2 py-1 font-mono text-[9.5px] font-semibold uppercase tracking-[0.06em]"
                    style={{ color: tone.color, backgroundColor: tone.background }}
                  >
                    {tone.label}
                  </span>
                </div>

                {locked ? (
                  <FeedRowLockedBlur
                    variant="reddit"
                    ticker={row.ticker}
                    previewLines={[row.catalysts?.[0] || row.summary, row.summary]}
                    size="block"
                    className="mt-4"
                  />
                ) : (
                  <>
                  {row.catalysts?.[0] ? (
                    <p className="mt-4 text-[14px] font-semibold leading-[1.4] text-on-surface">
                      {row.catalysts[0]}
                    </p>
                  ) : null}
                  <p className="mt-2 text-[12.5px] leading-[1.55] text-on-surface-variant">
                    {row.summary}
                  </p>
                  </>
                )}

                <div className="mt-auto flex items-center justify-between gap-3 pt-4 font-mono text-[9.5px] text-on-surface-variant">
                  <span>{row.mention_count} mentions</span>
                  <span>{age(row.latest_post_at)}</span>
                </div>
              </>
            );
            return (
              locked ? (
                <div
                  key={row.ticker}
                  className="group flex min-w-0 flex-col rounded-xl border border-outline-variant bg-surface p-4 shadow-card"
                >
                  {body}
                </div>
              ) : <Link
                key={row.ticker}
                href={`/stock/${encodeURIComponent(row.ticker)}`}
                className="group flex min-w-0 flex-col rounded-xl border border-outline-variant bg-surface p-4 shadow-card transition-all hover:border-outline hover:shadow-card-hover"
              >
                {body}
              </Link>
            );
          })}
          {!isSubscribed && insights.length > FREE_SOCIAL_CARDS ? (
            <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface sm:col-span-2 xl:col-span-3">
              <FeedLockedSection
                surface="reddit_buzz"
                count={insights.length - FREE_SOCIAL_CARDS}
                noun="social reads"
                signedInLabel="Unlock all with Pro"
              />
            </div>
          ) : null}
      </section>
    </div>
  );
}
