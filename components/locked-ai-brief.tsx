"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useUser } from "@/lib/auth-context";
import { getFirebaseAuth } from "@/lib/firebase-client";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
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
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 border-t border-[#f3f4f6] pt-3">
      {PRO_BRIEF_BENEFITS.map((benefit) => (
        <div key={benefit.label} className="flex gap-2 rounded-xl bg-[#f8f9fa] px-3 py-2">
          <span className="shrink-0 text-[13px]" aria-hidden>
            {benefit.icon}
          </span>
          <p className="text-[12px] leading-snug text-[#6b7280]">
            <span className="font-semibold text-[#111111]">{benefit.label}</span>{" "}
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
          try {
            const auth = getFirebaseAuth();
            const provider = new GoogleAuthProvider();
            provider.setCustomParameters({ prompt: "select_account" });
            await signInWithPopup(auth, provider);
            router.refresh();
          } catch {
            setError("Sign-in cancelled or failed.");
          }
        },
      }
    : {
        title: `Unlock the ${ticker} Pro brief`,
        body: "Turn this into a monitored name: tikrr reads the latest news, scores the setup, and shows what matters before the next move.",
        label: "Get Pro",
        onClick: () => router.push("/subscribe"),
      };

  return (
    <div className="relative">
      <div
        aria-hidden
        className="pointer-events-none select-none flex flex-col gap-8"
        style={{ filter: "blur(6px)", opacity: 0.55 }}
      >
        <MockDirective ticker={ticker} />
        <MockNewsSignal />
        <MockCatalystsRow />
        <MockSentiment />
      </div>

      <div className="absolute inset-0 flex items-start justify-center pt-16 md:pt-24">
        <div className="w-full max-w-[480px] rounded-2xl border border-[#e5e7eb] bg-white shadow-[0_8px_32px_rgba(17,17,17,0.08)] p-6 flex flex-col gap-4">
          <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-[#eff6ff] px-2.5 py-1 text-[11px] font-semibold tracking-[0.06em] uppercase text-[#0052ff]">
            <span aria-hidden>🔒</span> Pro · AI tab
          </span>
          <h3 className="text-[18px] font-semibold text-[#111111] tracking-[-0.01em]">
            {cta.title}
          </h3>
          <p className="text-[13px] text-[#6b7280] leading-relaxed">{cta.body}</p>
          <ProBriefBenefits />
          <button
            type="button"
            onClick={() => cta.onClick()}
            className="inline-flex items-center justify-center h-[40px] rounded-full bg-[#111111] px-5 text-[13px] font-semibold text-white hover:-translate-y-[1px] active:translate-y-0 transition-transform"
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
      <section className="overflow-hidden rounded-3xl border border-[#e5e7eb] bg-white p-5 md:p-6 flex flex-col gap-4">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#eff6ff] px-2.5 py-1 text-[11px] font-semibold tracking-[0.08em] uppercase text-[#0052ff]">
          <span aria-hidden>✨</span> Pro · AI tab
        </span>
        <h3 className="text-[20px] font-semibold text-[#111111] tracking-[-0.02em]">
          Start AI coverage for {ticker}
        </h3>
        <p className="text-[13px] text-[#6b7280] leading-relaxed max-w-[640px]">
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
        body={`Synthesis did not finish cleanly${onDemandError ? `: ${onDemandError}` : ""}. tikrr will retry on the next pass.`}
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
          ? "We found some sources, but not enough high-confidence material for a full brief yet. tikrr will keep scanning and publish here automatically."
          : "We checked for fresh stock-specific news and did not find enough yet. tikrr will keep scanning on the next passes and publish here automatically."
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
      shell: "border border-[#bfdbfe] bg-[#eff6ff]",
      badge: "text-[#1d4ed8]",
      body: "text-[#1e3a8a]",
      footnote: "text-[#64748b]",
    },
    working: {
      shell: "border border-[#fed7aa] bg-[#fff7ed]",
      badge: "text-[#c2410c]",
      body: "text-[#7c2d12]",
      footnote: "text-[#9a3412]/80",
    },
    ready: {
      shell: "border border-[#bbf7d0] bg-[#f0fdf4]",
      badge: "text-[#047857]",
      body: "text-[#065f46]",
      footnote: "text-[#047857]/80",
    },
    failed: {
      shell: "border border-[#fecaca] bg-[#fef2f2]",
      badge: "text-[#b91c1c]",
      body: "text-[#991b1b]",
      footnote: "text-[#b45309]",
    },
  };
  const palette = styles[tone];

  return (
    <section className={`overflow-hidden rounded-3xl p-5 md:p-6 flex flex-col gap-5 ${palette.shell}`}>
      <div className="flex flex-col gap-2 max-w-[680px]">
        <span
          className={`inline-flex w-fit items-center rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${palette.badge}`}
        >
          {badge}
        </span>
        <h3 className="text-[20px] font-semibold tracking-[-0.02em] text-[#111111]">{title}</h3>
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
    <div className="flex items-center gap-2 rounded-2xl bg-white px-3 py-2.5">
      <span
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
          done ? "bg-[#10b981] text-white" : "bg-[#f3f4f6] text-[#9ca3af]"
        }`}
        aria-hidden
      >
        {done ? "✓" : "•"}
      </span>
      <span className="text-[12px] font-semibold text-[#374151]">{label}</span>
    </div>
  );
}

function MockDirective({ ticker }: { ticker: string }) {
  return (
    <section className="rounded-2xl border border-[#e5e7eb] bg-white p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#eff6ff] text-[16px]">
          🎯
        </span>
        <span className="text-[12px] font-semibold tracking-[0.06em] uppercase text-[#0052ff]">
          Strategic directive
        </span>
      </div>
      <p className="text-[15px] font-semibold text-[#111111] leading-snug">
        Accumulate {ticker} into the next earnings print - recent guide-up has
        not yet been priced into the multiple.
      </p>
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-[#ecfdf5] px-2.5 py-1 text-[11px] font-semibold text-[#065f46]">
          Accumulate
        </span>
        <span className="text-[12px] text-[#6b7280]">High confidence</span>
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
      <h3 className="text-[16px] font-semibold text-[#111111]">News signal</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {tiles.map((t) => (
          <div
            key={t.title}
            className="rounded-2xl border border-[#e5e7eb] bg-white p-4 flex flex-col gap-2"
          >
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#f3f4f6] text-[16px]">
              {t.emoji}
            </span>
            <span className="text-[12px] font-semibold tracking-[0.04em] uppercase text-[#6b7280]">
              {t.title}
            </span>
            <p className="text-[13px] text-[#111111] leading-snug">{t.body}</p>
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
      <h3 className="text-[16px] font-semibold text-[#111111]">
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
                  className="rounded-xl border border-[#e5e7eb] bg-white p-3"
                >
                  <p className="text-[13px] font-semibold text-[#111111]">
                    {c.title}
                  </p>
                  <p className="text-[12px] text-[#6b7280] mt-0.5">{c.detail}</p>
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
      <h3 className="text-[16px] font-semibold text-[#111111]">Sentiment lanes</h3>
      <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5 flex flex-col gap-3">
        {lanes.map((l) => (
          <div key={l.label} className="flex items-center gap-4">
            <span className="text-[12px] font-medium text-[#6b7280] w-44 shrink-0">
              {l.label}
            </span>
            <div className="flex-1 h-1.5 rounded-full bg-[#f3f4f6] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#10b981]"
                style={{ width: `${l.pct}%` }}
              />
            </div>
            <span className="text-[12px] font-semibold text-[#111111] tabular-nums w-10 text-right">
              {l.pct}%
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
