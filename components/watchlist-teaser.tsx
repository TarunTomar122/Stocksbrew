"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";

import { useUser } from "@/lib/auth-context";
import { getFirebaseAuth } from "@/lib/firebase-client";
import type { WatchlistRow } from "@/lib/watchlist-view";

type Props = {
  isSubscribed: boolean;
  rows: WatchlistRow[];
  headline: string | null;
};

type SampleRow = {
  ticker: string;
  sector: string;
  change: number;
  overall: number;
  verdict: "Buy" | "Hold" | "Watch" | "Sell";
  flag: { kind: "bearish" | "bullish" | "neutral"; label: string } | null;
};

// Realistic-looking sample rows for the blurred preview. Shown to anon and
// non-subscribed users so they can see the shape of what they'd get - verdicts,
// red-flag chips, score bars. This is the "you're missing this" surface.
const SAMPLE_ROWS: SampleRow[] = [
  {
    ticker: "NVDA",
    sector: "Semiconductors",
    change: 2.4,
    overall: 82,
    verdict: "Buy",
    flag: { kind: "bullish", label: "52w high" },
  },
  {
    ticker: "MSFT",
    sector: "Software",
    change: -0.6,
    overall: 78,
    verdict: "Hold",
    flag: null,
  },
  {
    ticker: "RELIANCE",
    sector: "Energy",
    change: 1.1,
    overall: 71,
    verdict: "Buy",
    flag: { kind: "bullish", label: "breakout" },
  },
  {
    ticker: "TSLA",
    sector: "Automotive",
    change: -2.8,
    overall: 58,
    verdict: "Watch",
    flag: { kind: "bearish", label: "overbought" },
  },
  {
    ticker: "TCS",
    sector: "IT Services",
    change: 0.4,
    overall: 66,
    verdict: "Hold",
    flag: null,
  },
];

function formatPct(v: number): { text: string; positive: boolean } {
  const positive = v >= 0;
  return { text: `${positive ? "+" : ""}${v.toFixed(2)}%`, positive };
}

function MiniRow({
  ticker,
  sector,
  change,
  overall,
}: {
  ticker: string;
  sector: string;
  change: number;
  overall: number;
}) {
  const pct = formatPct(change);
  return (
    <div className="grid grid-cols-[1.4fr_1fr_0.8fr] gap-4 px-5 py-3 items-center">
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-bold text-on-surface">{ticker}</span>
        <span className="text-[10px] font-semibold tracking-wide uppercase text-on-surface-variant truncate">
          {sector}
        </span>
      </div>
      <div
        className={`text-sm font-bold tabular-nums text-right ${
          pct.positive ? "text-signal-bullish" : "text-signal-bearish"
        }`}
      >
        {pct.text}
      </div>
      <div className="text-sm font-bold text-on-surface tabular-nums text-right">
        {overall.toFixed(0)}
      </div>
    </div>
  );
}

function VerdictPill({ verdict }: { verdict: SampleRow["verdict"] }) {
  const tone =
    verdict === "Buy"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
      : verdict === "Sell"
        ? "border-rose-500/40 bg-rose-500/10 text-rose-700"
        : verdict === "Watch"
          ? "border-amber-500/40 bg-amber-500/10 text-amber-700"
          : "border-outline-variant/40 bg-surface-container-low text-on-surface-variant";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-[0.12em] uppercase ${tone}`}
    >
      {verdict}
    </span>
  );
}

function FlagPill({ flag }: { flag: NonNullable<SampleRow["flag"]> }) {
  const tone =
    flag.kind === "bearish"
      ? "border-rose-500/40 bg-rose-500/10 text-rose-700"
      : flag.kind === "bullish"
        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700"
        : "border-amber-500/40 bg-amber-500/10 text-amber-700";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tone}`}
    >
      <span className="material-symbols-outlined text-[11px] leading-none">
        {flag.kind === "bearish" ? "warning" : flag.kind === "bullish" ? "trending_up" : "bolt"}
      </span>
      {flag.label}
    </span>
  );
}

function ScoreBar({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  const tone = clamped >= 70 ? "bg-emerald-500" : clamped >= 50 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 rounded-full bg-surface-container-high overflow-hidden">
        <div className={`h-full ${tone}`} style={{ width: `${clamped}%` }} />
      </div>
      <span className="text-[11px] font-bold text-on-surface tabular-nums">{clamped.toFixed(0)}</span>
    </div>
  );
}

// Fake but realistic sparkline - six points per row, shape keyed to the day %.
function sparkPath(seed: number, positive: boolean): string {
  const pts = [0, 1, 2, 3, 4, 5].map((i) => {
    const t = i / 5;
    const drift = positive ? 8 * t : -8 * t;
    const wiggle = Math.sin(seed + i * 1.3) * 3;
    return { x: i * 10, y: 10 - drift + wiggle };
  });
  return pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
}

function RichSampleRow({ row, seed }: { row: SampleRow; seed: number }) {
  const pct = formatPct(row.change);
  return (
    <div className="grid grid-cols-[1.3fr_0.8fr_0.9fr_1.1fr_1.2fr] gap-3 px-5 py-3 items-center">
      {/* Ticker + sector */}
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-bold text-on-surface">{row.ticker}</span>
        <span className="text-[10px] font-semibold tracking-wide uppercase text-on-surface-variant truncate">
          {row.sector}
        </span>
      </div>
      {/* Verdict pill */}
      <div>
        <VerdictPill verdict={row.verdict} />
      </div>
      {/* Day change + sparkline */}
      <div className="flex items-center justify-end gap-2">
        <svg width="60" height="20" viewBox="0 0 50 20" className="flex-shrink-0">
          <path
            d={sparkPath(seed, pct.positive)}
            fill="none"
            stroke={pct.positive ? "rgb(16,185,129)" : "rgb(244,63,94)"}
            strokeWidth="1.5"
          />
        </svg>
        <span
          className={`text-sm font-bold tabular-nums ${
            pct.positive ? "text-signal-bullish" : "text-signal-bearish"
          }`}
        >
          {pct.text}
        </span>
      </div>
      {/* Score bar */}
      <div className="flex justify-end">
        <ScoreBar value={row.overall} />
      </div>
      {/* Flag (or placeholder) */}
      <div className="flex justify-end">
        {row.flag ? (
          <FlagPill flag={row.flag} />
        ) : (
          <span className="text-[10px] text-on-surface-variant italic">no flags</span>
        )}
      </div>
    </div>
  );
}

function FeatureCallout({
  icon,
  title,
  body,
  divider = false,
}: {
  icon: string;
  title: string;
  body: string;
  divider?: boolean;
}) {
  return (
    <div
      className={`flex items-start gap-3 px-5 py-4 ${
        divider ? "sm:border-l sm:border-outline-variant/20" : ""
      }`}
    >
      <span className="material-symbols-outlined text-indigo-600 text-[20px] leading-none mt-0.5">
        {icon}
      </span>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[12px] font-bold text-on-surface">{title}</span>
        <span className="text-[11px] text-on-surface-variant leading-snug">{body}</span>
      </div>
    </div>
  );
}

function BlurredSampleGrid() {
  return (
    <div
      className="select-none pointer-events-none"
      style={{ filter: "blur(4px)" }}
      aria-hidden="true"
    >
      <div className="grid grid-cols-[1.3fr_0.8fr_0.9fr_1.1fr_1.2fr] gap-3 px-5 py-2 border-b border-outline-variant/20">
        <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-on-surface-variant">
          Ticker
        </span>
        <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-on-surface-variant">
          Verdict
        </span>
        <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-on-surface-variant text-right">
          Today
        </span>
        <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-on-surface-variant text-right">
          AI score
        </span>
        <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-on-surface-variant text-right">
          Alerts
        </span>
      </div>
      <ul className="divide-y divide-outline-variant/20">
        {SAMPLE_ROWS.map((r, i) => (
          <li key={r.ticker}>
            <RichSampleRow row={r} seed={i * 1.7 + 0.4} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function TeaserOverlay({
  title,
  body,
  cta,
  onClick,
}: {
  title: string;
  body: string;
  cta: string;
  onClick: () => void;
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-2xl border border-indigo-500/30 bg-surface-container-lowest p-6 text-center shadow-2xl">
        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-[10px] font-bold tracking-[0.18em] uppercase text-indigo-700">
          Pro
        </div>
        <h3 className="mt-3 text-lg font-semibold text-on-surface">{title}</h3>
        <p className="mt-1.5 text-sm text-on-surface-variant">{body}</p>
        <button
          type="button"
          onClick={onClick}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
        >
          {cta}
        </button>
      </div>
    </div>
  );
}

function RealMiniGrid({ rows }: { rows: WatchlistRow[] }) {
  const top = rows.slice(0, 5);
  return (
    <>
      <div className="grid grid-cols-[1.4fr_1fr_0.8fr] gap-4 px-5 py-2 border-b border-outline-variant/20">
        <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-on-surface-variant">
          Ticker
        </span>
        <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-on-surface-variant text-right">
          Day
        </span>
        <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-on-surface-variant text-right">
          Score
        </span>
      </div>
      <ul className="divide-y divide-outline-variant/20">
        {top.map((r) => (
          <li key={r.instrument_id}>
            <MiniRow
              ticker={r.ticker}
              sector={r.sector_label || r.market}
              change={r.day_change_pct ?? 0}
              overall={r.scores.overall ?? 0}
            />
          </li>
        ))}
      </ul>
    </>
  );
}

export function WatchlistTeaser({ isSubscribed, rows, headline }: Props) {
  const { user, loading } = useUser();
  const router = useRouter();
  const [signingIn, setSigningIn] = useState(false);

  if (loading) return null;

  async function handleSignIn() {
    if (signingIn) return;
    setSigningIn(true);
    try {
      const auth = getFirebaseAuth();
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, provider);
      router.refresh();
    } catch {
      // user cancelled, no-op
    } finally {
      setSigningIn(false);
    }
  }

  const signedIn = Boolean(user);
  const isTeaser = !signedIn || !isSubscribed;
  const hasRows = rows.length > 0;

  // --- Case: signed-in subscriber with radar stocks → real mini preview ---
  if (signedIn && isSubscribed && hasRows) {
    return (
      <section className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest overflow-hidden">
        <header className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/20">
          <div>
            <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-on-surface-variant">
              Your Radar
            </div>
            {headline && (
              <h3 className="mt-1 text-base font-semibold text-on-surface">{headline}</h3>
            )}
          </div>
          <Link
            href="/watchlist"
            className="text-[11px] font-bold tracking-[0.15em] uppercase text-primary hover:underline"
          >
            View all →
          </Link>
        </header>
        <RealMiniGrid rows={rows} />
      </section>
    );
  }

  // --- Case: signed-in subscriber with empty Radar → show a real sample
  //     preview of what Radar looks like, plus the three feature
  //     callouts, plus a clear "how to add" nudge. No blur - subscribers have
  //     already paid the ticket, they should see the full shape. ---
  if (signedIn && isSubscribed && !hasRows) {
    return (
      <section className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest overflow-hidden">
        <header className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/20">
          <div>
            <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-on-surface-variant">
              Your Radar · empty
            </div>
            <h3 className="mt-1 text-base font-semibold text-on-surface">
              Nothing in Radar yet - here&apos;s what you&apos;ll get
            </h3>
          </div>
          <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-on-surface-variant">
            Sample preview
          </span>
        </header>

        {/* Feature callouts - what Radar actually delivers */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-0 border-b border-outline-variant/20">
          <FeatureCallout
            icon="schedule"
            title="Twice-daily brief"
            body="AM + close read on every stock you track."
          />
          <FeatureCallout
            icon="warning"
            title="Alerts"
            body="RSI, 52-week levels, earnings - when they fire."
            divider
          />
          <FeatureCallout
            icon="trending_up"
            title="Momentum"
            body="Breakouts and crossovers across your list."
            divider
          />
        </div>

        {/* Unblurred sample grid so they see exactly what a row looks like */}
        <div className="grid grid-cols-[1.3fr_0.8fr_0.9fr_1.1fr_1.2fr] gap-3 px-5 py-2 border-b border-outline-variant/20">
          <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-on-surface-variant">
            Ticker
          </span>
          <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-on-surface-variant">
            Verdict
          </span>
          <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-on-surface-variant text-right">
            Today
          </span>
          <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-on-surface-variant text-right">
            AI score
          </span>
          <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-on-surface-variant text-right">
            Alerts
          </span>
        </div>
        <ul className="divide-y divide-outline-variant/20 opacity-90">
          {SAMPLE_ROWS.slice(0, 3).map((r, i) => (
            <li key={r.ticker}>
              <RichSampleRow row={r} seed={i * 1.7 + 0.4} />
            </li>
          ))}
        </ul>

        {/* Footer nudge with the concrete action */}
        <div className="flex items-center justify-between px-5 py-4 bg-indigo-500/5 border-t border-indigo-500/20">
          <p className="text-sm text-on-surface-variant">
            Open any stock and hit{" "}
            <span className="font-semibold text-on-surface">Add to Radar</span> to start yours.
          </p>
          <Link
            href="/"
            className="text-[11px] font-bold tracking-[0.15em] uppercase text-primary hover:underline"
          >
            Browse stocks →
          </Link>
        </div>
      </section>
    );
  }

  // --- Case: anon or non-subscribed → blurred sample + CTA overlay ---
  const teaserTitle = "Your Radar";
  const teaserBody = "Twice-daily AI on the tickers you track.";
  const ctaLabel = signedIn ? "Unlock Radar" : "Sign in to start";
  const onClick = signedIn ? () => router.push("/subscribe") : handleSignIn;

  return (
    <section className="rounded-2xl border border-outline-variant/30 bg-surface-container-lowest overflow-hidden relative">
      <header className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/20">
        <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-on-surface-variant">
          Radar
        </div>
      </header>
      <div className="relative min-h-[260px]">
        <BlurredSampleGrid />
        <TeaserOverlay
          title={teaserTitle}
          body={teaserBody}
          cta={ctaLabel}
          onClick={onClick}
        />
      </div>
      {isTeaser && void signingIn}
    </section>
  );
}
