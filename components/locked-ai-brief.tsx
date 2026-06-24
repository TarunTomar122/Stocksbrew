"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
        label: "Sign in with Google",
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
      <section className="overflow-hidden rounded-3xl bg-surface p-5 md:p-6 flex flex-col gap-4">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full tint-info px-2.5 py-1 text-[11px] font-semibold tracking-[0.08em] uppercase text-[#0052ff]">
          <span aria-hidden>✨</span> Pro · AI tab
        </span>
        <h3 className="text-[20px] font-semibold text-on-surface tracking-[-0.02em]">
          Start AI coverage for {ticker}
        </h3>
        <p className="text-[13px] text-on-surface-variant leading-relaxed max-w-[640px]">
          Add this stock to Radar and our AI agent will start researching it immediately.
          Your first brief appears here as soon as synthesis is ready.
        </p>
        <div className="pt-1">
          <TrackButton
            ticker={ticker}
            instrumentId={instrumentId}
            tier="free"
            isSubscribed={isSubscribed}
            isTracked={false}
          />
        </div>
      </section>
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
      badge={isRunningLike ? "Research in progress" : "Queued"}
      title={`Researching ${ticker} now`}
      body="We are collecting fresh sources, scoring the setup, and generating your first brief. This tab updates automatically once it is ready."
      steps={[
        { done: true, label: "In your Radar" },
        { done: normalizedStatus === "running" || normalizedStatus === "retry", label: "Sources collecting" },
        { done: false, label: "AI brief ready" },
      ]}
      footnote={
        normalizedStatus === "running"
          ? "Running on-demand synthesis now."
          : normalizedStatus === "retry"
          ? "Retrying with a broader source pass."
          : "Queued for on-demand synthesis."
      }
    />
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
  footnote,
}: {
  tone: BriefPanelTone;
  badge: string;
  title: string;
  body: string;
  steps: Array<{ done: boolean; label: string }>;
  footnote?: string;
}) {
  const styles: Record<
    BriefPanelTone,
    { shell: string; badge: string; body: string; footnote: string }
  > = {
    paused: {
      shell: "tint-info",
      badge: "text-[#3b82f6]",
      body: "text-[#3b82f6]",
      footnote: "text-on-surface-variant",
    },
    working: {
      shell: "tint-warn",
      badge: "text-[#f59e0b]",
      body: "text-[#f59e0b]",
      footnote: "text-[#f59e0b]/80",
    },
    ready: {
      shell: "tint-bull",
      badge: "text-[#10b981]",
      body: "text-[#10b981]",
      footnote: "text-[#10b981]/80",
    },
    failed: {
      shell: "tint-bear",
      badge: "text-[#ef4444]",
      body: "text-[#ef4444]",
      footnote: "text-[#f59e0b]",
    },
  };
  const palette = styles[tone];

  return (
    <section className={`overflow-hidden rounded-3xl p-5 md:p-6 flex flex-col gap-5 ${palette.shell}`}>
      <div className="flex flex-col gap-2 max-w-[680px]">
        <span
          className={`inline-flex w-fit items-center rounded-full bg-surface px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${palette.badge}`}
        >
          {badge}
        </span>
        <h3 className="text-[20px] font-semibold tracking-[-0.02em] text-on-surface">{title}</h3>
        <p className={`text-[13px] leading-relaxed ${palette.body}`}>{body}</p>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {steps.map((step) => (
          <BriefStatusStep key={step.label} done={step.done} label={step.label} />
        ))}
      </div>

      {footnote ? <p className={`text-[12px] leading-relaxed ${palette.footnote}`}>{footnote}</p> : null}
    </section>
  );
}

function BriefStatusStep({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-surface px-3 py-2.5">
      <span
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
          done ? "bg-[#10b981] text-white" : "bg-surface-container text-on-surface-variant"
        }`}
        aria-hidden
      >
        {done ? "✓" : "•"}
      </span>
      <span className="text-[12px] font-semibold text-on-surface">{label}</span>
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
