"use client";

import type { ReactNode } from "react";

import { useUser } from "@/lib/auth-context";
import { TrackButton } from "@/components/track-button";

type Props = {
  ticker: string;
  instrumentId: string;
  currentPrice?: number;
  currency?: string;
  isSubscribed: boolean;
  isTracked?: boolean;
  onDemandStatus?: string;
  onDemandError?: string;
};

export function LockedAiBrief({
  ticker,
  instrumentId,
  currentPrice,
  currency = "$",
  isSubscribed,
  isTracked = false,
  onDemandStatus = "",
  onDemandError = "",
}: Props) {
  const { user, loading } = useUser();

  if (loading) return null;
  if (user) {
    return (
      <ProBriefPreparingState
        ticker={ticker}
        instrumentId={instrumentId}
        currentPrice={currentPrice}
        currency={currency}
        isSubscribed={isSubscribed}
        isTracked={isTracked}
        onDemandStatus={onDemandStatus}
        onDemandError={onDemandError}
      />
    );
  }

  return (
    <RadarBriefInvitation
      ticker={ticker}
      currentPrice={currentPrice}
      currency={currency}
      action={
        <TrackButton
          ticker={ticker}
          instrumentId={instrumentId}
          tier="free"
          isSubscribed={false}
          isTracked={false}
          untrackedLabel="Generate analysis"
          signedOutLabel="Sign in to generate"
        />
      }
    />
  );
}

function ProBriefPreparingState({
  ticker,
  instrumentId,
  currentPrice,
  currency,
  isSubscribed,
  isTracked,
  onDemandStatus,
  onDemandError,
}: {
  ticker: string;
  instrumentId: string;
  currentPrice?: number;
  currency: string;
  isSubscribed: boolean;
  isTracked: boolean;
  onDemandStatus: string;
  onDemandError: string;
}) {
  if (!isTracked) {
    return (
      <RadarBriefInvitation
        ticker={ticker}
        currentPrice={currentPrice}
        currency={currency}
        action={
          <TrackButton
            ticker={ticker}
            instrumentId={instrumentId}
            tier="free"
            isSubscribed={isSubscribed}
            isTracked={false}
            untrackedLabel={`Track ${ticker}`}
          />
        }
      />
    );
  }

  const normalizedStatus = String(onDemandStatus || "").toLowerCase();
  const isTerminalNoNews = normalizedStatus === "no_articles" || normalizedStatus === "no_brief";
  const isFailed = normalizedStatus === "failed";
  const isComplete = normalizedStatus === "complete";
  const isRunningLike =
    normalizedStatus === "queued" || normalizedStatus === "running" || normalizedStatus === "retry";

  if (isTerminalNoNews) {
    return <CoveragePausedBrief ticker={ticker} status={normalizedStatus} />;
  }

  if (isFailed) {
    return (
      <BriefPreparingPanel
        tone="failed"
        badge="Retry queued"
        title={`${ticker} brief hit a snag`}
        body={`Synthesis did not finish cleanly${onDemandError ? `: ${onDemandError}` : ""}. stocksbrew will retry on the next pass.`}
        steps={[
          { done: true, label: "In your Watchlist" },
          { done: true, label: "Sources fetched" },
          { done: false, label: "Retry scheduled" },
        ]}
        footnote="Overview and scorecard data are still available while we retry."
      />
    );
  }

  if (isComplete) {
    return (
      <BriefPreparingPanel
        tone="ready"
        badge="Brief ready"
        title={`${ticker} brief is ready`}
        body="Synthesis finished. Refresh this tab if you still see the preparing state."
        steps={[
          { done: true, label: "In your Watchlist" },
          { done: true, label: "Sources analyzed" },
          { done: true, label: "AI brief ready" },
        ]}
      />
    );
  }

  return (
    <BriefPreparingPanel
      tone="working"
      badge={isRunningLike ? "AI research in progress" : "Research queued"}
      title={`Researching ${ticker}`}
      body="We are reading the latest sources and will publish the AI brief here automatically."
      steps={[
        { done: true, label: "Tracked" },
        { done: false, label: "Researching" },
        { done: false, label: "AI brief" },
      ]}
      footnote={
        normalizedStatus === "running"
          ? "Usually ready in 10–15 minutes."
          : normalizedStatus === "retry"
          ? "The first source pass was thin, so we widened the search."
          : "Queued behind the names already on the research desk."
      }
    />
  );
}

function RadarBriefInvitation({
  ticker,
  currentPrice,
  currency,
  action,
}: {
  ticker: string;
  currentPrice?: number;
  currency: string;
  action: ReactNode;
}) {
  return (
    <section className="border-y border-outline-variant bg-surface px-5 py-6 sm:px-7 sm:py-7 lg:px-9">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
            AI brief
            {typeof currentPrice === "number" ? (
              <span className="ml-2 text-on-surface-variant">
                {ticker} {currency}{currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            ) : null}
          </p>
          <h3 className="mt-2 text-[22px] font-semibold tracking-[-0.03em] text-on-surface sm:text-[24px]">
            Generate AI analysis for {ticker}
          </h3>
          <p className="mt-2 text-[13px] leading-6 text-on-surface-variant">
            Add it to your Watchlist. We’ll read the latest filings, earnings and news, then build the brief here.
          </p>
        </div>
        <div className="shrink-0">
          {action}
          <p className="mt-2 text-center font-mono text-[9px] uppercase tracking-[0.06em] text-on-surface-variant">
            usually 10–15 min
          </p>
        </div>
      </div>
    </section>
  );
}

function CoveragePausedBrief({
  ticker,
  status,
}: {
  ticker: string;
  status: string;
}) {
  const usedFallbackSources = status === "no_brief";

  return (
    <BriefPreparingPanel
      tone="paused"
      badge="Expanding coverage"
      title={`${ticker} is in your Watchlist. Research is underway.`}
      body={
        usedFallbackSources
          ? "We found some sources, but not enough high-confidence material for a full brief yet. stocksbrew will keep scanning and publish here automatically."
          : "We checked for fresh stock-specific news and did not find enough yet. stocksbrew will keep scanning on the next passes and publish here automatically."
      }
      steps={[
        { done: true, label: "In your Watchlist" },
        { done: true, label: "Initial sources checked" },
        { done: false, label: "Brief publishes when ready" },
      ]}
      footnote="Price, scorecard, and technicals are still live on Overview while we fill this in."
    />
  );
}

type BriefPanelTone = "paused" | "working" | "ready" | "failed";

function BriefPreparingPanel({
  tone,
  badge,
  title,
  body,
  steps,
  action,
  footnote,
}: {
  tone: BriefPanelTone;
  badge: string;
  title: string;
  body: string;
  steps: Array<{ done: boolean; label: string }>;
  action?: ReactNode;
  footnote?: string;
}) {
  const styles: Record<
    BriefPanelTone,
    { accent: string; badge: string; footnote: string }
  > = {
    paused: {
      accent: "var(--signal-neutral)",
      badge: "text-on-surface-variant",
      footnote: "text-on-surface-variant",
    },
    working: {
      accent: "var(--primary)",
      badge: "text-primary",
      footnote: "text-on-surface-variant",
    },
    ready: {
      accent: "var(--signal-bullish)",
      badge: "text-[var(--signal-bullish)]",
      footnote: "text-on-surface-variant",
    },
    failed: {
      accent: "var(--signal-bearish)",
      badge: "text-[var(--signal-bearish)]",
      footnote: "text-on-surface-variant",
    },
  };
  const palette = styles[tone];
  const isWorking = tone === "working";

  return (
    <section
      className="relative overflow-hidden border-y border-outline-variant bg-surface"
      aria-live={isWorking ? "polite" : undefined}
    >
      {isWorking ? <div className="brief-research-scan" aria-hidden /> : null}
      <div className="relative px-5 py-7 sm:px-7 sm:py-8 lg:px-9">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="max-w-[680px]">
            <div className={`flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.15em] ${palette.badge}`}>
              {isWorking ? <span className="brief-research-pulse" aria-hidden /> : <span className="h-2 w-2 rounded-full" style={{ background: palette.accent }} aria-hidden />}
              {badge}
            </div>
            <h3 className="mt-3 text-[24px] font-semibold leading-tight tracking-[-0.035em] text-on-surface sm:text-[28px]">
              {title}
            </h3>
            <p className="mt-3 max-w-[620px] text-[13px] leading-6 text-on-surface-variant">
              {body}
            </p>
          </div>
          {footnote ? (
            <p className={`max-w-[280px] border-l-2 pl-3 font-mono text-[10px] leading-5 uppercase tracking-[0.06em] ${palette.footnote}`} style={{ borderColor: palette.accent }}>
              {footnote}
            </p>
          ) : null}
        </div>

        <div className="mt-7 grid border-y border-outline-variant sm:grid-cols-3">
          {steps.map((step, index) => (
            <BriefStatusStep
              key={step.label}
              done={step.done}
              label={step.label}
              index={index}
              active={isWorking && !step.done && (index === 1 || steps[index - 1]?.done)}
              accent={palette.accent}
            />
          ))}
        </div>

        {action ? <div className="mt-6 w-fit">{action}</div> : null}
      </div>
    </section>
  );
}

function BriefStatusStep({
  done,
  label,
  index,
  active,
  accent,
}: {
  done: boolean;
  label: string;
  index: number;
  active: boolean;
  accent: string;
}) {
  return (
    <div className="flex min-h-[76px] items-center gap-3 border-outline-variant px-1 py-4 sm:border-r sm:px-4 sm:last:border-r-0">
      <span className="font-mono text-[10px] font-semibold tabular-nums text-on-surface-variant" aria-hidden>
        0{index + 1}
      </span>
      <div className="min-w-0">
        <p className="text-[12px] font-semibold text-on-surface">{label}</p>
        <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.08em]" style={{ color: done || active ? accent : "var(--on-surface-variant)" }}>
          {done ? "complete" : active ? "working now" : "up next"}
        </p>
      </div>
    </div>
  );
}
