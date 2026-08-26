import Link from "next/link";

import { FeedRowLockedBlur } from "@/components/feed-row-lock-teaser";
import { SquircleSurface } from "@/components/oa/squircle";
import { getRedditSentimentMeta } from "@/components/reddit-buzz-row";
import { StockLogo } from "@/components/stock-logo";
import type { RedditTicker } from "@/lib/reddit-cues-shared";

function UpvoteArrow({ color }: { color: string }) {
  return (
    <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden>
      <path d="M5 0L10 8H0L5 0Z" fill={color} />
    </svg>
  );
}

function fmtPrice(v: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: v < 10 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(v);
}

function QuoteLine({
  item,
  variant,
}: {
  item: RedditTicker;
  variant: "home" | "pulse" | "landing";
}) {
  const hasQuote =
    item.company?.trim() ||
    typeof item.price === "number" ||
    typeof item.changePct === "number";
  if (!hasQuote) return null;

  const isThemed = variant === "pulse" || variant === "landing";
  const metaClass =
    variant === "landing"
      ? "text-[13px] text-on-surface-variant"
      : isThemed
        ? variant === "pulse"
          ? "text-base leading-6 text-oa-muted-fg"
          : "text-[11px] text-on-surface-variant"
        : "text-[11px] text-[#6b7280]";
  const priceClass = isThemed
    ? "font-semibold tabular-nums text-on-surface"
    : "font-semibold tabular-nums text-[#111111]";
  const up = typeof item.changePct === "number" && item.changePct >= 0;

  if (variant === "pulse") {
    if (
      typeof item.price !== "number" &&
      typeof item.changePct !== "number"
    ) {
      return null;
    }

    return (
      <div className="mt-0.5 text-base leading-6 text-oa-muted-fg">
        <p className="flex flex-wrap items-center gap-x-2">
          {typeof item.price === "number" ? (
            <span className="font-medium tabular-nums text-oa-fg">
              {fmtPrice(item.price)}
            </span>
          ) : null}
          {typeof item.changePct === "number" ? (
            <span
              className="font-medium tabular-nums"
              style={{
                color: up ? "var(--signal-bullish)" : "var(--signal-bearish)",
              }}
            >
              {up ? "+" : ""}
              {item.changePct.toFixed(2)}%
            </span>
          ) : null}
        </p>
      </div>
    );
  }

  return (
    <p
      className={`mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 ${metaClass}`}
    >
      {item.company?.trim() ? (
        <span className="max-w-full truncate">{item.company.trim()}</span>
      ) : null}
      {typeof item.price === "number" ? (
        <span className={priceClass}>{fmtPrice(item.price)}</span>
      ) : null}
      {typeof item.changePct === "number" ? (
        <span
          className="font-semibold tabular-nums"
          style={{
            color: up ? "var(--signal-bullish)" : "var(--signal-bearish)",
          }}
        >
          {up ? "+" : ""}
          {item.changePct.toFixed(2)}%
        </span>
      ) : null}
    </p>
  );
}
function SentimentTag({
  sentiment,
  large = false,
}: {
  sentiment: string;
  large?: boolean;
}) {
  const s = sentiment.toLowerCase();
  const tone =
    s === "bullish"
      ? "text-[var(--signal-bullish)]"
      : s === "bearish"
        ? "text-[var(--signal-bearish)]"
        : "text-on-surface-variant";

  return (
    <span
      className={`${large ? "text-[12px]" : "text-[10px]"} font-semibold uppercase tracking-[0.06em] ${tone}`}
    >
      {sentiment}
    </span>
  );
}

function PulseSentimentTag({
  sentiment,
  color,
}: {
  sentiment: string;
  color: string;
}) {
  return (
    <span
      className="shrink-0 rounded-full px-2.5 py-1 text-base font-medium capitalize"
      style={{
        color,
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
      }}
    >
      {sentiment.toLowerCase()}
    </span>
  );
}

function TalkingPoints({ catalysts }: { catalysts: string[] }) {
  if (catalysts.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg border border-outline-variant bg-surface-container-low p-3">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-on-surface-variant">
        talking points
      </p>
      <ul className="list-disc space-y-1.5 pl-4 marker:text-on-surface-variant/70">
        {catalysts.map((c, i) => (
          <li key={i} className="text-[11px] leading-snug text-on-surface/85">
            {c}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RedditBuzzCard({
  item,
  locked = false,
  variant = "home",
  showStockLink = true,
  showTalkingPoints = true,
}: {
  item: RedditTicker;
  locked?: boolean;
  variant?: "home" | "pulse" | "landing";
  showStockLink?: boolean;
  showTalkingPoints?: boolean;
}) {
  const isPulse = variant === "pulse";
  const isLanding = variant === "landing";
  const surfaceClass = isLanding
    ? "flex flex-col py-4"
    : "flex h-full flex-col rounded-[14px] border border-[#e5e7eb] bg-white p-4";
  const catalysts = (item.catalysts ?? []).filter(Boolean).slice(0, 3);
  const mentions = item.mention_count > 0 ? item.mention_count : null;
  const sentiment = item.sentiment?.toLowerCase() ?? "neutral";
  const sentimentMeta = getRedditSentimentMeta(sentiment);
  const tickerClass = isLanding
    ? "text-[16px] font-bold tracking-[-0.01em] text-on-surface group-hover:text-landing-brand"
    : isPulse
      ? "text-[16px] font-medium tracking-[-0.01em] text-oa-fg"
      : "text-[14px] font-bold tracking-[-0.01em] text-[#111111] group-hover:text-[#0052ff]";

  const header = (
    <div className="min-w-0">
      <div className="flex items-start gap-2.5">
        <StockLogo
          ticker={item.ticker}
          market="US"
          size={isPulse ? 32 : 28}
          circle={isPulse}
          className="shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <p className={tickerClass}>{item.ticker}</p>
              {!locked && mentions != null ? (
                <div
                  className="flex shrink-0 items-center gap-1"
                  style={{ color: sentimentMeta.color }}
                >
                  <UpvoteArrow color={sentimentMeta.color} />
                  <span
                    className={`${isLanding ? "text-[12.5px]" : "text-[11px]"} font-bold tabular-nums`}
                  >
                    {mentions}
                  </span>
                </div>
              ) : null}
            </div>
            {!locked ? (
              isPulse ? (
                <PulseSentimentTag
                  sentiment={sentiment}
                  color={sentimentMeta.color}
                />
              ) : (
                <SentimentTag sentiment={sentiment} large={isLanding} />
              )
            ) : null}
          </div>
          {!locked ? <QuoteLine item={item} variant={variant} /> : null}
        </div>
      </div>
    </div>
  );

  const body = locked ? (
    <div className="mt-3 min-w-0">
      <FeedRowLockedBlur
        variant="reddit"
        ticker={item.ticker}
        dense
        size="block"
      />
    </div>
  ) : (
    <div className="mt-3 flex flex-1 flex-col">
      {item.summary?.trim() ? (
        <p
          className={`${isLanding ? "text-[14.5px]" : isPulse ? "text-[16px] leading-6" : "text-[12.5px] leading-[1.55]"} text-on-surface/90`}
        >
          {item.summary.trim()}
        </p>
      ) : null}
      {showTalkingPoints && !isPulse ? (
        <TalkingPoints catalysts={catalysts} />
      ) : null}
      {showStockLink && !isLanding && !isPulse ? (
        <span
          className={`mt-3 text-[11px] font-medium ${isPulse ? "text-on-surface-variant group-hover:text-landing-brand" : "text-[#6b7280] group-hover:text-[#0052ff]"}`}
        >
          View {item.ticker} →
        </span>
      ) : null}
    </div>
  );

  const cardContent = (
    <>
      {header}
      {body}
      {showStockLink && isLanding && !locked ? (
        <span className="mt-2.5 text-[12.5px] font-semibold text-landing-reddit">
          View {item.ticker} →
        </span>
      ) : null}
    </>
  );
  const card = isPulse ? (
    <SquircleSurface className="h-full border border-oa-border p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-colors group-hover:bg-oa-accent/60 group-focus-visible:bg-oa-accent/60">
      {cardContent}
    </SquircleSurface>
  ) : (
    <article className={surfaceClass}>{cardContent}</article>
  );

  if (locked) return card;

  return (
    <Link
      href={`/stock/${encodeURIComponent(item.ticker)}`}
      className={`group block ${isLanding ? "w-full min-w-0 rounded-lg py-1 transition-colors hover:bg-surface-container-low/60" : "h-full"}`}
    >
      {card}
    </Link>
  );
}
