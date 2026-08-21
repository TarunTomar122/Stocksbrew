import Link from "next/link";

import { FeedUnlockBar } from "@/components/feed-row-lock-teaser";

type RedditCtx = {
  sentiment?: string;
  summary?: string;
  mention_count?: number;
  catalysts?: string[];
};

type Visual = {
  what_changed?: string;
  why_it_matters?: string;
  what_to_watch?: string;
};

function RedditMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <path
        fill="#FF4500"
        d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"
      />
    </svg>
  );
}

function sentimentColor(s: string) {
  return s === "bearish" ? "var(--signal-bearish)" : s === "bullish" ? "var(--signal-bullish)" : "var(--accent-terminal)";
}

const n = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const sign = (v: number, d = 1) => `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;

/** Editorial "why the stock moved today" card. */
export function TodaysMoveCard({
  dayPct,
  up,
  overview,
  overviewHeadline,
  visual,
}: {
  dayPct: number;
  up: boolean;
  overview?: string;
  overviewHeadline?: string;
  visual?: Visual | null;
}) {
  return (
    <section className="panel flex h-full flex-col p-5 md:p-6">
      <p className="mb-3 font-label text-[11px] font-semibold uppercase tracking-[0.14em] text-on-surface-variant">
        Today&apos;s move{" "}
        <span className="font-mono normal-case tracking-normal" style={{ color: up ? "var(--signal-bullish)" : "var(--signal-bearish)" }}>
          {up ? "▲" : "▼"} {sign(dayPct, 1)}
        </span>
      </p>
      {overview ? (
        <>
          {overviewHeadline && (
            <p className="mb-2 font-headline text-[17px] font-bold leading-snug tracking-[-0.01em] text-on-surface">{overviewHeadline}</p>
          )}
          <p className="text-[14px] leading-relaxed text-on-surface/90">{overview}</p>
        </>
      ) : (
        <div className="grid gap-4">
          {([["what changed", visual?.what_changed], ["why it matters", visual?.why_it_matters], ["what to watch", visual?.what_to_watch]] as const).map(
            ([k, v]) =>
              v ? (
                <div key={k}>
                  <p className="mb-1 font-label text-[11px] font-semibold uppercase tracking-[0.1em] text-accent-terminal">{k}</p>
                  <p className="text-[13px] leading-relaxed text-on-surface/90">{v}</p>
                </div>
              ) : null,
          )}
        </div>
      )}
    </section>
  );
}

export function hasRedditBuzzData(reddit: RedditCtx | null | undefined): boolean {
  return Boolean(reddit?.summary?.trim() || n(reddit?.mention_count));
}

const REDDIT_ORANGE = "#fa4303";

/** Cohesive Reddit buzz card for the stock page activity cluster. */
export function StockRedditBuzzRailCard({
  ticker,
  reddit,
  isSubscribed,
  crowdScore,
  crowdLabel,
  crowdColor,
}: {
  ticker: string;
  reddit: RedditCtx;
  isSubscribed: boolean;
  /** Optional overall crowd-sentiment score (0-100), shown alongside the Reddit summary. */
  crowdScore?: number | null;
  crowdLabel?: string | null;
  crowdColor?: string;
}) {
  const mentions = n(reddit.mention_count) ? reddit.mention_count! : null;
  const catalysts = (reddit.catalysts ?? []).filter(Boolean).slice(0, 3);
  const sentimentClr = sentimentColor(reddit.sentiment ?? "");
  const labelColor = crowdColor ?? sentimentClr;

  return (
    <section className="mt-6 min-w-0 rounded-[20px] border border-oa-border bg-oa-card p-4 sm:mt-8 sm:rounded-[26px] sm:p-6">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0" style={{ color: REDDIT_ORANGE }} aria-hidden>
          <RedditMark size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[16px] font-medium text-oa-fg">r/stocks · Reddit buzz</p>
            {reddit.sentiment && (
              <span
                className="shrink-0 rounded-full border border-oa-border bg-oa-bg px-2.5 py-0.5 text-[12px] font-medium capitalize"
                style={{ color: sentimentClr }}
              >
                {reddit.sentiment}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[14px] leading-snug text-oa-muted-fg">
            {mentions != null ? (
              <>
                <span className="font-medium text-oa-fg">{mentions}</span> posts about {ticker}
              </>
            ) : (
              <>Retail chatter about {ticker}</>
            )}
          </p>
        </div>
      </div>

      <div className="mt-4 border-t border-oa-border pt-4">
        {isSubscribed ? (
          <div className="space-y-3.5">
            {reddit.summary?.trim() && (
              <p className="max-w-[62ch] text-[15px] leading-7 text-oa-fg/90">{reddit.summary}</p>
            )}

            {catalysts.length > 0 && (
              <ul className="space-y-2.5">
                {catalysts.map((c, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <span
                      aria-hidden
                      className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: REDDIT_ORANGE }}
                    />
                    <span className="text-[14px] leading-snug text-oa-fg/80">{c}</span>
                  </li>
                ))}
              </ul>
            )}

            {n(crowdScore) && (
              <div className="flex items-baseline gap-3">
                <span
                  className="oa-mono text-3xl font-medium leading-none tabular-nums text-oa-fg"
                  style={{ color: labelColor }}
                >
                  {Math.round(crowdScore!)}
                  <span className="text-[13px] font-normal text-oa-muted-fg">/100</span>
                </span>
                {crowdLabel && (
                  <span className="text-xs font-medium capitalize text-oa-muted-fg">
                    {crowdLabel}
                  </span>
                )}
              </div>
            )}

            <Link
              href="/pulse"
              className="group inline-flex items-center gap-1.5 text-[13px] font-medium text-oa-muted-fg transition-colors hover:text-oa-fg"
            >
              <span className="group-hover:underline">See all Reddit buzz</span>
              <span aria-hidden className="transition-transform group-hover:translate-x-0.5" style={{ color: REDDIT_ORANGE }}>
                ›
              </span>
            </Link>
          </div>
        ) : (
          <div className="relative h-40 overflow-hidden rounded-[16px] bg-oa-secondary">
            <div aria-hidden className="pointer-events-none select-none space-y-3 p-4 blur-[6px]">
              <div className="h-3 w-full rounded bg-oa-fg/20" />
              <div className="h-3 w-10/12 rounded bg-oa-fg/20" />
              <div className="mt-5 h-2.5 w-24 rounded bg-oa-fg/20" />
              <div className="h-2.5 w-3/5 rounded bg-oa-fg/20" />
            </div>
            <div className="absolute inset-0 flex items-center justify-center bg-oa-bg/75 px-4">
              <FeedUnlockBar
                surface="stock_tab"
                compact
                signedOutLabel="Start your 3-day free trial"
                signedInLabel="Unlock Reddit buzz"
                buttonClassName="!rounded-full !border-none !bg-none !bg-primary !px-4 !py-2 !text-xs !font-semibold !text-on-primary"
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/** Reddit social conversation card. */
export function SocialConversationCard({
  ticker,
  reddit,
}: {
  ticker: string;
  reddit: RedditCtx;
}) {
  const mentions = n(reddit.mention_count) ? reddit.mention_count! : null;

  return (
    <section className="panel flex h-full flex-col overflow-hidden">
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-5 py-3.5 md:px-6"
        style={{
          borderColor: "var(--outline-variant)",
          background: "color-mix(in srgb, #FF4500 5%, var(--surface-container-low))",
        }}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <RedditMark />
          <div className="min-w-0">
            <p className="font-mono text-[12px] font-semibold text-on-surface">r/stocks crowd</p>
            <p className="font-mono text-[10px] text-on-surface-variant">
              {mentions != null ? `${mentions} posts on ${ticker}` : `Retail chatter on ${ticker}`}
            </p>
          </div>
        </div>
        {reddit.sentiment && (
          <span
            className="sentiment-pill ml-auto rounded-full px-2.5 py-0.5 font-mono text-[10px] capitalize"
            style={{ color: sentimentColor(reddit.sentiment) }}
          >
            {reddit.sentiment}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5 md:p-6">
        <p className="text-[15px] leading-relaxed text-on-surface">{reddit.summary}</p>
        {(reddit.catalysts?.length ?? 0) > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {reddit.catalysts!.map((c, i) => (
              <span
                key={i}
                className="rounded-full border px-2.5 py-1 font-mono text-[10px] text-on-surface-variant"
                style={{
                  borderColor: "var(--outline-variant)",
                  background: "color-mix(in srgb, #FF4500 4%, var(--surface-container-low))",
                }}
              >
                {c}
              </span>
            ))}
          </div>
        )}
        <div className="mt-auto flex justify-end pt-4">
          <Link
            href="/pulse"
            className="font-mono text-[11px] text-on-surface-variant transition-colors hover:text-accent-terminal"
          >
            See all Reddit buzz →
          </Link>
        </div>
      </div>
    </section>
  );
}
