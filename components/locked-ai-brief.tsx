"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { useUser } from "@/lib/auth-context";
import { signInWithGoogle } from "@/lib/sign-in";
import {
  trackPaywallShown,
  trackPaywallUnlockClicked,
} from "@/lib/product-analytics";
import { TrackButton } from "@/components/track-button";

type Props = {
  ticker: string;
  instrumentId: string;
  isSubscribed: boolean;
  isTracked?: boolean;
  onDemandStatus?: string;
  onDemandError?: string;
};

const PRO_BRIEF_BENEFITS: { icon: string; label: string; text: string }[] = [
  {
    icon: "🎯",
    label: "Clear stance",
    text: "bullish, mixed, or bearish with conviction",
  },
  {
    icon: "📰",
    label: "News translated",
    text: "what changed and why the stock should care",
  },
  {
    icon: "⚡",
    label: "Catalysts & risks",
    text: "earnings, guidance, ratings, and pressure points",
  },
  {
    icon: "📊",
    label: "Sentiment lanes",
    text: "where news, analysts, and the crowd are leaning",
  },
];

function ProBriefBenefits() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 border-t border-outline-variant pt-3">
      {PRO_BRIEF_BENEFITS.map((benefit) => (
        <div key={benefit.label} className="flex gap-2 rounded-xl bg-surface-container-low px-3 py-2">
          <span className="shrink-0 text-[13px]" aria-hidden>
            {benefit.icon}
          </span>
          <p className="text-[12px] leading-snug text-on-surface-variant">
            <span className="font-semibold text-on-surface">{benefit.label}</span>{" "}
            {benefit.text}
          </p>
        </div>
      ))}
    </div>
  );
}

// A blurred mock of the AI brief layout: Strategic Directive, News signal,
// Catalysts/Drivers/Risks, Sentiment. Sits behind the unlock CTA so free
// users see exactly what they get on the AI tier.
export function LockedAiBrief({
  ticker,
  instrumentId,
  isSubscribed,
  isTracked = false,
  onDemandStatus = "",
  onDemandError = "",
}: Props) {
  const { user, loading } = useUser();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || (user && isSubscribed)) return;
    trackPaywallShown({
      surface: "locked_ai_brief",
      ticker,
      signedIn: Boolean(user),
    });
  }, [loading, user, isSubscribed, ticker]);

  if (loading) return null;
  if (user && isSubscribed) {
    return (
      <ProBriefPreparingState
        ticker={ticker}
        instrumentId={instrumentId}
        isSubscribed={isSubscribed}
        isTracked={isTracked}
        onDemandStatus={onDemandStatus}
        onDemandError={onDemandError}
      />
    );
  }

  const cta = !user
    ? {
        title: `See the AI brief for ${ticker}`,
        body: "Free covers the launch list. Pro brings this same AI layer to any ticker you add to Radar.",
        label: "Start your 3-day free trial",
        onClick: async () => {
          trackPaywallUnlockClicked({
            surface: "locked_ai_brief",
            ticker,
            signedIn: false,
          });
          try {
            await signInWithGoogle({ surface: "locked_ai_brief" });
            router.refresh();
          } catch {
            setError("Sign-in cancelled or failed.");
          }
        },
      }
    : {
        title: `Get the stance on ${ticker} every morning`,
        body: "Turn this into a monitored name: stocksbrew reads the latest news, scores the setup, and shows what matters before the next move.",
        label: "Get Pro",
        onClick: () => {
          trackPaywallUnlockClicked({
            surface: "locked_ai_brief",
            ticker,
            signedIn: true,
          });
          router.push("/subscribe");
        },
      };

  return (
    <div className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none flex max-h-[260px] select-none flex-col gap-8 overflow-hidden"
        style={{ filter: "blur(6px)", opacity: 0.5 }}
      >
        <MockDirective ticker={ticker} />
        <MockNewsSignal />
      </div>

      <div className="relative z-10 -mt-32 flex justify-center px-4 pb-4 sm:-mt-36">
        <div className="panel w-full max-w-[480px] p-6 flex flex-col gap-4" style={{ boxShadow: "0 8px 40px rgba(0,0,0,0.18), inset 0 0 0 1px color-mix(in srgb, var(--signal-bullish) 18%, transparent)" }}>
          <span className="inline-flex items-center gap-1.5 self-start font-mono text-[11px] font-semibold tracking-[0.14em] uppercase" style={{ color: "var(--signal-bullish)" }}>
            🔒 The Call · Pro
          </span>
          <h3 className="text-[18px] font-semibold text-on-surface tracking-[-0.01em]">
            {cta.title}
          </h3>
          <p className="text-[13px] text-on-surface-variant leading-relaxed">{cta.body}</p>
          <ProBriefBenefits />
          <button
            type="button"
            onClick={() => cta.onClick()}
            className="h-[42px] w-full rounded-md font-mono text-[13px] font-bold transition-opacity hover:opacity-90"
            style={{ background: "var(--signal-bullish)", color: "var(--background)" }}
          >
            {cta.label}
          </button>
          {error && (
            <p className="text-[12px] font-medium text-[#ef4444]">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ProBriefPreparingState({
  ticker,
  instrumentId,
  isSubscribed,
  isTracked,
  onDemandStatus,
  onDemandError,
}: {
  ticker: string;
  instrumentId: string;
  isSubscribed: boolean;
  isTracked: boolean;
  onDemandStatus: string;
  onDemandError: string;
}) {
  if (!isTracked) {
    return (
      <RadarBriefInvitation
        ticker={ticker}
        action={
          <TrackButton
            ticker={ticker}
            instrumentId={instrumentId}
            tier="free"
            isSubscribed={isSubscribed}
            isTracked={false}
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
          { done: true, label: "In your Radar" },
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
          { done: true, label: "In your Radar" },
          { done: true, label: "Sources analyzed" },
          { done: true, label: "AI brief ready" },
        ]}
      />
    );
  }

  return (
    <BriefPreparingPanel
      tone="working"
      badge={isRunningLike ? "Live research desk" : "In the research queue"}
      title={`${ticker} is being built into a real brief`}
      body="We are checking what changed, testing it against the numbers, and writing the call. The finished brief will replace this automatically."
      steps={[
        { done: true, label: "In your Radar" },
        { done: false, label: "Evidence pass" },
        { done: false, label: "Editorial synthesis" },
      ]}
      footnote={
        normalizedStatus === "running"
          ? "Usually ready within 10–15 minutes. You can leave this page."
          : normalizedStatus === "retry"
          ? "The first source pass was thin, so we widened the search."
          : "Queued behind the names already on the research desk."
      }
    />
  );
}

function RadarBriefInvitation({
  ticker,
  action,
}: {
  ticker: string;
  action: ReactNode;
}) {
  const additions = [
    {
      number: "01",
      title: "A morning stance",
      detail: "A clear bullish, mixed, or bearish read when the evidence changes.",
    },
    {
      number: "02",
      title: "The reason behind the move",
      detail: "News and price action translated into what actually matters for the stock.",
    },
    {
      number: "03",
      title: "Catalysts and risks",
      detail: "The dates, pressure points, and invalidation signals worth watching next.",
    },
  ];

  return (
    <section className="relative overflow-hidden border-y border-outline-variant bg-surface">
      <span
        aria-hidden
        className="pointer-events-none absolute -right-2 top-2 select-none font-mono text-[88px] font-bold leading-none tracking-[-0.08em] text-on-surface opacity-[0.035] sm:text-[124px]"
      >
        {ticker}
      </span>

      <div className="relative grid lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
        <div className="flex flex-col justify-between gap-8 px-5 py-7 sm:px-7 sm:py-9 lg:min-h-[330px] lg:px-9">
          <div className="max-w-[650px]">
            <div className="mb-5 flex items-center gap-3 font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-on-surface-variant">
              <span className="h-px w-8 bg-on-surface" aria-hidden />
              The missing layer
            </div>
            <h3 className="max-w-[620px] text-[28px] font-semibold leading-[1.08] tracking-[-0.045em] text-on-surface sm:text-[34px]">
              {ticker} has the numbers. Radar adds the judgment.
            </h3>
            <p className="mt-4 max-w-[560px] text-[14px] leading-7 text-on-surface-variant">
              Price, fundamentals, technicals, and Wall Street data are already live below.
              Add {ticker} once and we will build the first evidence-backed brief for your Radar.
            </p>
          </div>

          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="w-fit">{action}</div>
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-on-surface-variant">
              First read usually takes 10–15 min
            </span>
          </div>
        </div>

        <div className="border-t border-outline-variant bg-surface-container-low px-5 py-7 sm:px-7 lg:border-l lg:border-t-0 lg:px-8 lg:py-9">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.15em] text-on-surface-variant">
            What switches on
          </p>
          <div className="mt-4 divide-y divide-outline-variant">
            {additions.map((item) => (
              <div key={item.number} className="grid grid-cols-[38px_1fr] gap-3 py-4 first:pt-2 last:pb-0">
                <span className="pt-0.5 font-mono text-[10px] font-semibold text-primary">
                  {item.number}
                </span>
                <div>
                  <p className="text-[14px] font-semibold tracking-[-0.01em] text-on-surface">
                    {item.title}
                  </p>
                  <p className="mt-1 text-[12px] leading-5 text-on-surface-variant">
                    {item.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="relative flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-outline-variant px-5 py-3 font-mono text-[9.5px] uppercase tracking-[0.08em] text-on-surface-variant sm:px-7 lg:px-9">
        <span className="font-semibold text-on-surface">Already live</span>
        <span>Price position</span>
        <span>Financial depth</span>
        <span>Street targets</span>
        <span className="ml-auto hidden text-primary sm:inline">Radar adds the daily call →</span>
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
      title={`${ticker} is on Radar. Brief coming soon.`}
      body={
        usedFallbackSources
          ? "We found some sources, but not enough high-confidence material for a full brief yet. stocksbrew will keep scanning and publish here automatically."
          : "We checked for fresh stock-specific news and did not find enough yet. stocksbrew will keep scanning on the next passes and publish here automatically."
      }
      steps={[
        { done: true, label: "In your Radar" },
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

function MockDirective({ ticker }: { ticker: string }) {
  return (
    <section className="rounded-2xl bg-surface p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg tint-info text-[16px]">
          🎯
        </span>
        <span className="text-[12px] font-semibold tracking-[0.06em] uppercase text-[#0052ff]">
          Strategic directive
        </span>
      </div>
      <p className="text-[15px] font-semibold text-on-surface leading-snug">
        Accumulate {ticker} into the next earnings print - recent guide-up has
        not yet been priced into the multiple.
      </p>
      <div className="flex items-center gap-2">
        <span className="rounded-full tint-bull px-2.5 py-1 text-[11px] font-semibold text-[#10b981]">
          Accumulate
        </span>
        <span className="text-[12px] text-on-surface-variant">High confidence</span>
      </div>
    </section>
  );
}

function MockNewsSignal() {
  const tiles = [
    { emoji: "📰", title: "What changed", body: "Margin guide came in 220bps above sell-side consensus on stronger pricing." },
    { emoji: "🎯", title: "Why it matters", body: "Sets up multiple expansion if Q4 print confirms the durability of the new tier." },
    { emoji: "🔭", title: "What to watch", body: "Channel checks ahead of Apr 29 print and any signal on FY26 backlog growth." },
  ];
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-[16px] font-semibold text-on-surface">News signal</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {tiles.map((t) => (
          <div
            key={t.title}
            className="rounded-2xl bg-surface p-4 flex flex-col gap-2"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-surface-container text-[16px]">
              {t.emoji}
            </span>
            <span className="text-[12px] font-semibold tracking-[0.04em] uppercase text-on-surface-variant">
              {t.title}
            </span>
            <p className="text-[13px] text-on-surface leading-snug">{t.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function MockCatalystsRow() {
  const sections = [
    {
      emoji: "⚡",
      label: "Catalysts",
      tone: "#0052ff",
      cards: [
        { title: "Earnings - Apr 29 AMC", detail: "Street looking for +18% EPS." },
        { title: "Investor day - May 14", detail: "Multi-year capacity update." },
      ],
    },
    {
      emoji: "📈",
      label: "Drivers",
      tone: "#10b981",
      cards: [
        { title: "AI infra demand", detail: "Hyperscaler capex still inflecting." },
        { title: "Mix shift", detail: "Higher-margin tier now 38% of revenue." },
      ],
    },
    {
      emoji: "⚠️",
      label: "Risks",
      tone: "#ef4444",
      cards: [
        { title: "Concentration", detail: "Top customer = 22% of bookings." },
        { title: "Inventory", detail: "Channel weeks-on-hand at 3yr high." },
      ],
    },
  ];
  return (
    <section className="flex flex-col gap-4">
      <h3 className="text-[16px] font-semibold text-on-surface">
        Catalysts · Drivers · Risks
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {sections.map((s) => (
          <div key={s.label} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[14px]">{s.emoji}</span>
              <span
                className="text-[12px] font-semibold tracking-[0.06em] uppercase"
                style={{ color: s.tone }}
              >
                {s.label}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {s.cards.map((c) => (
                <div
                  key={c.title}
                  className="rounded-xl bg-surface p-3"
                >
                  <p className="text-[13px] font-semibold text-on-surface">
                    {c.title}
                  </p>
                  <p className="text-[12px] text-on-surface-variant mt-0.5">{c.detail}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function MockSentiment() {
  const lanes = [
    { label: "Tier-1 newswires", pct: 72 },
    { label: "Sell-side notes", pct: 64 },
    { label: "Retail / X", pct: 51 },
  ];
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-[16px] font-semibold text-on-surface">Sentiment lanes</h3>
      <div className="rounded-2xl bg-surface p-5 flex flex-col gap-3">
        {lanes.map((l) => (
          <div key={l.label} className="flex items-center gap-4">
            <span className="text-[12px] font-medium text-on-surface-variant w-44 shrink-0">
              {l.label}
            </span>
            <div className="flex-1 h-1.5 rounded-full bg-surface-container overflow-hidden">
              <div
                className="h-full rounded-full bg-[#10b981]"
                style={{ width: `${l.pct}%` }}
              />
            </div>
            <span className="text-[12px] font-semibold text-on-surface tabular-nums w-10 text-right">
              {l.pct}%
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
