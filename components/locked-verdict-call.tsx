"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { VerdictCallChart } from "@/components/verdict-call-chart";
import { useUser } from "@/lib/auth-context";
import { signInWithGoogle } from "@/lib/sign-in";
import { trackPaywallShown, trackPaywallUnlockClicked } from "@/lib/product-analytics";
import type { StockReturns } from "@/lib/chart-range";

const KICK = "font-mono text-[11px] uppercase tracking-[0.13em] text-on-surface-variant";
const LOCK_ACCENT = "var(--accent-terminal)";

type Point = { date: string; close: number };

function signPct(v: number, d = 1) {
  return `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;
}

function buildCtaContent(input: {
  ticker: string;
  dayPct?: number;
  overviewHeadline?: string;
  fundamentalsScore?: number | null;
  preEarningsDays?: number | null;
}): { eyebrow: string; headline: string | null; headlineSub: string | null; body: string; perks: string[] } {
  const { ticker, dayPct, overviewHeadline, fundamentalsScore, preEarningsDays } = input;

  if (typeof fundamentalsScore === "number" && Number.isFinite(fundamentalsScore)) {
    const score = Math.round(fundamentalsScore);
    return {
      eyebrow: `${ticker} scorecard`,
      headline: `${score}/100`,
      headlineSub: "vs sector peers",
      body: `Fundamentals look ${score >= 75 ? "strong" : score >= 55 ? "mixed" : "weak"} — see if we'd add, hold, or trim.`,
      perks: ["Add · Hold · Trim", "Target & break levels", "Drivers & risks"],
    };
  }
  if (overviewHeadline && typeof dayPct === "number" && Number.isFinite(dayPct)) {
    const short = overviewHeadline.length > 64 ? `${overviewHeadline.slice(0, 61)}…` : overviewHeadline;
    return {
      eyebrow: "today's move",
      headline: signPct(dayPct),
      headlineSub: ticker,
      body: `${short} Sign in to see if that changes our call.`,
      perks: ["Our stance", "Chart levels", "What flips it"],
    };
  }
  if (typeof preEarningsDays === "number" && preEarningsDays >= 0 && preEarningsDays <= 14) {
    return {
      eyebrow: "earnings setup",
      headline: `${preEarningsDays}d`,
      headlineSub: "until report",
      body: `Get our setup, likely reaction, and levels to watch on ${ticker}.`,
      perks: ["Pre-earnings setup", "Reaction map", "Key levels"],
    };
  }
  return {
    eyebrow: "our call",
    headline: null,
    headlineSub: null,
    body: `Sign in free to see our stance, chart levels, drivers, and what flips the call on ${ticker}.`,
    perks: ["Add · Hold · Trim", "Target & break", "Drivers & risks"],
  };
}

function LockedVerdictCta({
  ticker,
  signedIn,
  fundamentalsScore,
  dayPct,
  overviewHeadline,
  preEarningsDays,
  onSignIn,
  onGetPro,
  error,
}: {
  ticker: string;
  signedIn: boolean;
  fundamentalsScore?: number | null;
  dayPct?: number;
  overviewHeadline?: string;
  preEarningsDays?: number | null;
  onSignIn: () => void;
  onGetPro: () => void;
  error: string | null;
}) {
  const content = buildCtaContent({ ticker, dayPct, overviewHeadline, fundamentalsScore, preEarningsDays });
  const cta = signedIn
    ? { label: "Get Pro", sub: "Unlock our call on every name you add to Radar", onClick: onGetPro }
    : { label: "Sign in with Google", sub: "Free on the launch list · Pro unlocks any ticker in Radar", onClick: onSignIn };

  return (
    <div
      className="relative mt-5 overflow-hidden rounded-2xl border-2 p-4 sm:p-5"
      style={{
        borderColor: `color-mix(in srgb, ${LOCK_ACCENT} 38%, var(--outline-variant))`,
        background: `linear-gradient(145deg, color-mix(in srgb, ${LOCK_ACCENT} 16%, var(--surface)) 0%, color-mix(in srgb, var(--signal-bullish) 11%, var(--surface)) 52%, var(--surface) 100%)`,
        boxShadow: `0 10px 36px color-mix(in srgb, ${LOCK_ACCENT} 14%, transparent), inset 0 1px 0 color-mix(in srgb, white 35%, transparent)`,
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full opacity-40 blur-2xl"
        style={{ background: `color-mix(in srgb, ${LOCK_ACCENT} 55%, transparent)` }}
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`${KICK} font-semibold`} style={{ color: LOCK_ACCENT }}>
            {content.eyebrow}
          </p>
          {content.headline ? (
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <p className="text-[2rem] font-extrabold leading-none tracking-tight tabular-nums text-on-surface sm:text-[2.35rem]">
                {content.headline}
              </p>
              {content.headlineSub ? (
                <p className="font-mono text-[12px] font-semibold uppercase tracking-[0.08em] text-on-surface-variant">
                  {content.headlineSub}
                </p>
              ) : null}
            </div>
          ) : null}
          <p className={`text-[13px] font-medium leading-relaxed text-on-surface sm:text-[14px] ${content.headline ? "mt-2" : "mt-1.5"}`}>
            {content.body}
          </p>
        </div>
        <span
          className="shrink-0 rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em]"
          style={{
            color: LOCK_ACCENT,
            borderColor: `color-mix(in srgb, ${LOCK_ACCENT} 30%, var(--outline-variant))`,
            background: `color-mix(in srgb, ${LOCK_ACCENT} 12%, var(--surface))`,
          }}
        >
          pro
        </span>
      </div>

      <div className="relative mt-3.5 flex flex-wrap gap-2">
        {content.perks.map((perk) => (
          <span
            key={perk}
            className="rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-on-surface-variant"
            style={{
              borderColor: `color-mix(in srgb, ${LOCK_ACCENT} 22%, var(--outline-variant))`,
              background: `color-mix(in srgb, var(--surface) 72%, transparent)`,
            }}
          >
            {perk}
          </span>
        ))}
      </div>

      <button
        type="button"
        onClick={() => cta.onClick()}
        className="relative mt-4 flex h-11 w-full items-center justify-center rounded-xl font-mono text-[14px] font-bold tracking-tight transition-transform hover:-translate-y-px active:translate-y-0 sm:h-12 sm:text-[15px]"
        style={{
          background: "var(--signal-bullish)",
          color: "var(--background)",
          boxShadow: "0 6px 20px color-mix(in srgb, var(--signal-bullish) 35%, transparent)",
        }}
      >
        {cta.label}
      </button>
      <p className="relative mt-2 text-center text-[11px] leading-relaxed text-on-surface-variant">{cta.sub}</p>
      {error ? <p className="relative mt-2 text-center text-[12px] font-medium text-[#ef4444]">{error}</p> : null}
    </div>
  );
}

function RedactedLine({ width = "72%" }: { width?: string }) {
  return (
    <span
      aria-hidden
      className="inline-block h-[0.92em] max-w-full rounded-md align-[-0.08em]"
      style={{
        width,
        background: "color-mix(in srgb, var(--on-surface) 14%, var(--surface-container-high))",
      }}
    />
  );
}

function LockedConvictionDots() {
  return (
    <div className="flex flex-col gap-1 pt-1">
      <div className="flex gap-1" aria-hidden>
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className="h-2.5 w-2.5 rounded-full"
            style={{ boxShadow: "inset 0 0 0 1px var(--outline-variant)", opacity: i === 2 ? 1 : 0.55 }}
          />
        ))}
      </div>
      <span className="font-mono text-[10px] uppercase text-on-surface-variant">locked</span>
    </div>
  );
}

function LockedInsightCard({ tone, title }: { tone: "bullish" | "bearish"; title: string }) {
  const accent = tone === "bullish" ? "var(--signal-bullish)" : "var(--signal-bearish)";
  const widths = tone === "bullish" ? ["88%", "76%", "64%"] : ["82%", "70%", "58%"];

  return (
    <div className="relative min-w-0 overflow-hidden rounded-xl bg-surface-container-low/50 p-3 sm:p-4">
      <p className={`${KICK} mb-3`} style={{ color: accent }}>
        {title}
      </p>
      <ul className="space-y-2.5" aria-hidden>
        {widths.map((width, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="mt-[0.35rem] h-1 w-1 shrink-0 rounded-full" style={{ background: accent, opacity: 0.45 }} />
            <RedactedLine width={width} />
          </li>
        ))}
      </ul>
      <div
        className="pointer-events-none absolute inset-0 flex items-end justify-center pb-3"
        style={{
          background: "linear-gradient(180deg, transparent 35%, color-mix(in srgb, var(--surface) 88%, transparent))",
        }}
      >
        <span className="rounded-full bg-surface/90 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-on-surface-variant">
          sign in to read
        </span>
      </div>
    </div>
  );
}

function LockedMetricsStrip() {
  const rows = [
    { label: "Target", width: "54%" },
    { label: "Break", width: "48%" },
    { label: "Risk / reward", width: "42%" },
  ];

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-x-4 gap-y-5 border-t border-outline-variant/50 pt-5 sm:gap-x-6">
      {rows.map((row) => (
        <div key={row.label} className="min-w-0">
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-on-surface-variant sm:text-[9.5px]">
            {row.label}
          </p>
          <div className="mt-1.5">
            <RedactedLine width={row.width} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function LockedVerdictCall({
  ticker,
  hist,
  returns,
  currency,
  currentPrice,
  dayPct,
  overviewHeadline,
  fundamentalsScore,
  preEarningsDays,
}: {
  ticker: string;
  hist: Point[];
  returns?: StockReturns | null;
  currency: string;
  currentPrice: number;
  dayPct?: number;
  overviewHeadline?: string;
  fundamentalsScore?: number | null;
  preEarningsDays?: number | null;
}) {
  const { user, loading } = useUser();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || user) return;
    trackPaywallShown({ surface: "locked_verdict_call", ticker, signedIn: false });
  }, [loading, user, ticker]);

  if (loading) return null;

  const signedIn = Boolean(user);

  async function handleSignIn() {
    trackPaywallUnlockClicked({ surface: "locked_verdict_call", ticker, signedIn: false });
    try {
      await signInWithGoogle({ surface: "locked_verdict_call" });
      router.refresh();
    } catch {
      setError("Sign-in cancelled or failed.");
    }
  }

  function handleGetPro() {
    trackPaywallUnlockClicked({ surface: "locked_verdict_call", ticker, signedIn: true });
    router.push("/subscribe");
  }

  const callSlot = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <p className={KICK} style={{ color: `color-mix(in srgb, ${LOCK_ACCENT} 70%, var(--on-surface-variant))` }}>
          our call
        </p>
        <span
          className="rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em]"
          style={{
            color: LOCK_ACCENT,
            borderColor: `color-mix(in srgb, ${LOCK_ACCENT} 25%, var(--outline-variant))`,
            background: `color-mix(in srgb, ${LOCK_ACCENT} 8%, var(--surface))`,
          }}
        >
          pro
        </span>
      </div>

      <div className="mt-1.5 flex flex-wrap items-end gap-x-3 gap-y-2">
        <h2 className="text-[1.65rem] font-extrabold leading-[1.05] tracking-tight sm:text-4xl lg:text-[2.65rem] lg:leading-none">
          <RedactedLine width="11rem" />
        </h2>
        <LockedConvictionDots />
      </div>

      <div className="mt-5 space-y-2" aria-hidden>
        <RedactedLine width="100%" />
        <RedactedLine width="92%" />
        <RedactedLine width="78%" />
      </div>

      <LockedMetricsStrip />

      <LockedVerdictCta
        ticker={ticker}
        signedIn={signedIn}
        fundamentalsScore={fundamentalsScore}
        dayPct={dayPct}
        overviewHeadline={overviewHeadline}
        preEarningsDays={preEarningsDays}
        onSignIn={handleSignIn}
        onGetPro={handleGetPro}
        error={error}
      />
    </>
  );

  return (
    <div>
      <VerdictCallChart
        callSlot={callSlot}
        hist={hist}
        returns={returns}
        currency={currency}
        zones={[]}
        lineColor={LOCK_ACCENT}
        currentPrice={currentPrice}
      />

      <div className="mt-6 grid gap-4 border-t border-outline-variant/50 pt-6 sm:grid-cols-2 sm:gap-0 sm:divide-x sm:divide-outline-variant/40">
        <div className="sm:pr-6">
          <LockedInsightCard tone="bullish" title="drivers" />
        </div>
        <div className="sm:pl-6">
          <LockedInsightCard tone="bearish" title="risks" />
        </div>
      </div>
    </div>
  );
}
