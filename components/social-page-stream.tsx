import Link from "next/link";

import { StockLogo } from "@/components/stock-logo";
import { relativeTime } from "@/lib/freshness";
import { getRedditCues } from "@/lib/reddit-cues";
import { socialDataState } from "@/lib/social-data";

const TONE: Record<string, { label: string; color: string }> = {
  bullish: { label: "Bullish", color: "var(--signal-bullish)" },
  bearish: { label: "Bearish", color: "var(--signal-bearish)" },
  neutral: { label: "Mixed", color: "var(--signal-neutral)" },
  mixed: { label: "Mixed", color: "var(--signal-neutral)" },
};

function age(value?: string): string {
  return value ? relativeTime(value) : "time unavailable";
}

export async function SocialPageStream() {
  const snapshot = await getRedditCues("US").catch(() => null);
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
      ? `Stale · last built ${age(snapshot.generated_at)}`
      : state === "partial"
      ? `Partial coverage · built ${age(snapshot.generated_at)}`
      : `Current · built ${age(snapshot.generated_at)}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-outline-variant py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[10px] uppercase tracking-[0.08em] text-on-surface-variant">
          <span
            style={{
              color: state === "fresh" ? "var(--signal-bullish)" : "var(--signal-neutral)",
            }}
          >
            {stateLabel}
          </span>
          <span>{snapshot.window_hours / 24}-day rolling window</span>
          <span>{snapshot.deduplicated_post_count} unique posts</span>
          <span>{snapshot.duplicate_post_count} reposts removed</span>
          <span>{snapshot.subreddits.length} communities configured</span>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-on-surface-variant">
          Source · Reddit
        </span>
      </div>

      <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface">
        <div className="hidden grid-cols-[minmax(150px,0.7fr)_110px_120px_minmax(300px,2fr)_120px] gap-4 border-b border-outline-variant bg-surface-container-low px-4 py-2.5 font-mono text-[9.5px] uppercase tracking-[0.08em] text-on-surface-variant md:grid">
          <span>Stock</span>
          <span>Volume</span>
          <span>Tone</span>
          <span>Dominant topic</span>
          <span className="text-right">Latest</span>
        </div>
        <div className="divide-y divide-outline-variant/60">
          {snapshot.tickers.map((row) => {
            const tone = TONE[row.sentiment] ?? TONE.neutral;
            return (
              <Link
                key={row.ticker}
                href={`/stock/${encodeURIComponent(row.ticker)}`}
                className="group grid gap-2 px-4 py-3.5 transition-colors hover:bg-surface-container-low md:grid-cols-[minmax(150px,0.7fr)_110px_120px_minmax(300px,2fr)_120px] md:items-center md:gap-4"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <StockLogo ticker={row.ticker} market="US" size={28} />
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
                </div>
                <p className="font-mono text-[12px] font-semibold tabular-nums text-on-surface">
                  {row.mention_count}{" "}
                  <span className="text-[10px] font-normal text-on-surface-variant">posts</span>
                </p>
                <p
                  className="font-mono text-[10.5px] font-semibold uppercase"
                  style={{ color: tone.color }}
                >
                  {tone.label}
                </p>
                <div className="min-w-0">
                  <p className="line-clamp-2 text-[13px] leading-[1.45] text-on-surface">
                    {row.summary}
                  </p>
                  {row.source_subreddits?.length ? (
                    <p className="mt-1 truncate font-mono text-[9.5px] text-on-surface-variant">
                      r/{row.source_subreddits.slice(0, 3).join(" · r/")}
                    </p>
                  ) : null}
                </div>
                <p className="font-mono text-[10.5px] text-on-surface-variant md:text-right">
                  {age(row.latest_post_at)}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      {snapshot.top_posts.length ? (
        <details className="rounded-xl border border-outline-variant bg-surface">
          <summary className="cursor-pointer px-4 py-3 text-[12px] font-semibold text-on-surface">
            Recent source posts{" "}
            <span className="ml-1 font-normal text-on-surface-variant">· secondary context</span>
          </summary>
          <div className="divide-y divide-outline-variant/60 border-t border-outline-variant">
            {snapshot.top_posts.slice(0, 8).map((post, index) => (
              <a
                key={`${post.url || post.title}-${index}`}
                href={post.url}
                target="_blank"
                rel="noreferrer"
                className="grid gap-1 px-4 py-3 hover:bg-surface-container-low sm:grid-cols-[minmax(0,1fr)_170px]"
              >
                <p className="line-clamp-1 text-[12.5px] text-on-surface">{post.title}</p>
                <p className="font-mono text-[9.5px] text-on-surface-variant sm:text-right">
                  r/{post.subreddit} · {age(post.published)}
                </p>
              </a>
            ))}
          </div>
        </details>
      ) : null}

      <p className="text-[11px] leading-relaxed text-on-surface-variant">
        Social measures attention and directional discussion from public Reddit threads. It is not
        verified news, a causal explanation, or a StocksBrew recommendation.
      </p>
    </div>
  );
}
