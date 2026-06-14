"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/auth-context";
import { getFirebaseAuth } from "@/lib/firebase-client";
import { signInWithGoogle } from "@/lib/sign-in";
import { trackLandingCtaClicked } from "@/lib/product-analytics";
import { StockLogo } from "@/components/stock-logo";
import { HERO_HEADLINE_LEAD, HERO_SUBHEAD } from "@/lib/brand-copy";

type IndexData = {
  ticker: string;
  name: string;
  price: number;
  changePct: number;
};

type Props = {
  indices: IndexData[];
  verdict?: unknown;
  isSubscribed?: boolean;
  showIndexSkeleton?: boolean;
  chips?: HeroChip[];
};

function fmtPrice(v: number): string {
  if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return v.toFixed(2);
}

function fmtPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

async function syncServerSession(): Promise<void> {
  const u = getFirebaseAuth().currentUser;
  if (!u) return;
  const idToken = await u.getIdToken();
  await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
}

type HeroChip = {
  ticker: string;
  name: string;
  verdict: string;
  directive: string;
  dayChangePct: number;
};

const DEFAULT_HERO_CHIPS: HeroChip[] = [
  {
    ticker: "AAPL",
    name: "Apple",
    verdict: "Hold",
    directive: "Wait for a pullback before adding",
    dayChangePct: 0.6,
  },
  {
    ticker: "NVDA",
    name: "NVIDIA",
    verdict: "Buy",
    directive: "AI demand still driving the setup",
    dayChangePct: 2.1,
  },
  {
    ticker: "MSFT",
    name: "Microsoft",
    verdict: "Buy",
    directive: "Cloud growth keeps the trend intact",
    dayChangePct: 1.3,
  },
  {
    ticker: "TSLA",
    name: "Tesla",
    verdict: "Sell",
    directive: "Momentum fading after the run",
    dayChangePct: -1.8,
  },
  {
    ticker: "GOOGL",
    name: "Alphabet",
    verdict: "Buy",
    directive: "Search and AI ads look strong",
    dayChangePct: 1.5,
  },
  {
    ticker: "AMD",
    name: "AMD",
    verdict: "Hold",
    directive: "Needs a clean break above resistance",
    dayChangePct: -0.4,
  },
];

const VERDICT_STYLES: Record<string, { text: string; bg: string }> = {
  Buy:        { text: "#10b981", bg: "#ecfdf5" },
  Accumulate: { text: "#10b981", bg: "#ecfdf5" },
  Hold:       { text: "#f59e0b", bg: "#fffbeb" },
  Trim:       { text: "#f59e0b", bg: "#fffbeb" },
  Sell:       { text: "#ef4444", bg: "#fef2f2" },
  Avoid:      { text: "#ef4444", bg: "#fef2f2" },
};

function verdictStyle(v: string): { text: string; bg: string } {
  return VERDICT_STYLES[v] ?? VERDICT_STYLES.Hold;
}

function directiveTeaser(directive: string): string {
  const trimmed = directive.trim();
  if (!trimmed) return "Get the buy/sell signal for this stock.";
  const end = trimmed.search(/[.!?]\s/);
  if (end === -1) return trimmed;
  return trimmed.slice(0, end + 1);
}

function HeroHeadline() {
  return (
    <h1 className="max-w-[720px] flex flex-col items-center font-semibold leading-[1.08] tracking-[-0.04em]">
      <span className="text-[32px] text-[#9ca3af] sm:text-[40px] md:text-[48px] xl:text-[52px]">
        {HERO_HEADLINE_LEAD}
      </span>
      <span className="text-[36px] text-[#111111] sm:text-[44px] md:text-[54px] xl:text-[62px] tracking-[-0.05em]">
        and what to do next.
      </span>
    </h1>
  );
}

function HeroChipCard({ chip }: { chip: HeroChip }) {
  const { user } = useUser();
  const locked = !user;
  return (
    <div className="shrink-0 self-stretch transition-transform duration-200 ease-out hover:-translate-y-1">
      <StockVerdictChip
        ticker={chip.ticker}
        name={chip.name}
        verdict={chip.verdict}
        directive={chip.directive}
        dayChangePct={chip.dayChangePct}
        locked={locked}
      />
    </div>
  );
}

function StockVerdictChip({
  ticker,
  name,
  verdict,
  directive,
  dayChangePct,
  compact,
  locked,
}: {
  ticker: string;
  name: string;
  verdict: string;
  directive: string;
  dayChangePct: number;
  compact?: boolean;
  locked?: boolean;
}) {
  const up = dayChangePct >= 0;
  const changeColor = up ? "#10b981" : "#ef4444";
  const changeBg = up ? "#ecfdf5" : "#fef2f2";
  const logoSize = compact ? 28 : 40;

  const inner = (
    <div
      className={`flex h-full flex-col gap-2.5 rounded-2xl border border-[#e5e7eb] bg-white text-left transition-shadow hover:border-[#d1d5db] hover:shadow-[0_4px_14px_rgba(17,24,39,0.06)] ${
        compact ? "w-[176px] p-2.5" : "w-[204px] p-4"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <StockLogo ticker={ticker} market="US" size={logoSize} eager />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center justify-between gap-1.5">
            <span className={`font-semibold tracking-[-0.01em] text-[#111111] ${compact ? "text-[12px]" : "text-[14px]"}`}>
              {ticker}
            </span>
            <span
              className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 font-semibold tabular-nums ${
                compact ? "text-[9px]" : "text-[11px]"
              }`}
              style={{ background: changeBg, color: changeColor }}
            >
              {up ? "▲" : "▼"} {Math.abs(dayChangePct).toFixed(1)}%
            </span>
          </div>
          <span className={`truncate text-[#9ca3af] ${compact ? "text-[10px]" : "text-[12px]"}`}>
            {name}
          </span>
        </div>
      </div>

      <p
        className={`flex-1 min-h-[2.75em] leading-snug text-[#6b7280] ${
          compact ? "text-[10px] line-clamp-2" : "text-[12px] line-clamp-2"
        }`}
      >
        {locked ? directiveTeaser(directive) : directive}
      </p>

      <span
        className={`mt-auto self-start font-bold rounded-md ${compact ? "text-[10px] px-1.5 py-0.5" : "text-[12px] px-2 py-0.5"} ${
          locked ? "rounded-full" : ""
        }`}
        style={
          locked
            ? { color: "#ffffff", background: "#111111" }
            : { color: verdictStyle(verdict).text, background: verdictStyle(verdict).bg }
        }
      >
        {locked ? "Unlock" : verdict}
      </span>
    </div>
  );

  return (
    <Link
      href={`/stock/${encodeURIComponent(ticker)}`}
      className="flex h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0052ff] focus-visible:ring-offset-2 rounded-2xl"
    >
      {inner}
    </Link>
  );
}

export function HeroSection({
  indices,
  isSubscribed = false,
  showIndexSkeleton = false,
  chips,
}: Props) {
  const router = useRouter();
  const { user } = useUser();
  const [busy, setBusy] = useState(false);

  const displayChips = chips && chips.length > 0 ? chips : DEFAULT_HERO_CHIPS;

  async function startTracking() {
    trackLandingCtaClicked({
      surface: "hero",
      signedIn: Boolean(user),
      destination: user ? "/watchlist" : "/watchlist",
    });
    if (user) {
      router.push("/watchlist");
      return;
    }
    setBusy(true);
    try {
      await signInWithGoogle({ surface: "hero" });
      await syncServerSession().catch(() => undefined);
      router.push("/watchlist");
    } catch (err) {
      console.error("sign-in failed", err);
      setBusy(false);
    }
  }

  const displayIndices = indices.slice(0, 5);

  return (
    <section className="w-full bg-white">
      <div className="flex flex-col items-center gap-10 md:gap-12 pt-10 md:pt-14 pb-10">
        <div className="flex w-full max-w-[1120px] flex-col items-center gap-6 px-4 text-center md:gap-7 lg:px-6">
          <HeroHeadline />
          <p className="max-w-[600px] text-[16px] leading-[1.6] text-[#6b7280] md:text-[19px]">
            {HERO_SUBHEAD}
          </p>
          <HeroCta
            busy={busy}
            isSubscribed={isSubscribed}
            signedIn={Boolean(user)}
            onStart={startTracking}
          />

          <div className="w-full overflow-x-auto py-4 scrollbar-hide md:py-5">
            <div className="flex w-max min-w-full flex-nowrap items-stretch justify-center gap-3 md:gap-4">
              {displayChips.map((chip) => (
                <HeroChipCard key={chip.ticker} chip={chip} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Index strip */}
      {displayIndices.length > 0 && (
        <div className="border-t border-[#f3f4f6] py-3 flex items-center justify-start md:justify-center gap-0 overflow-x-auto scrollbar-hide divide-x divide-[#f3f4f6]">
          {displayIndices.map((idx) => {
            const positive = idx.changePct >= 0;
            return (
              <div key={idx.ticker} className="flex flex-col gap-0.5 px-4 md:px-6 shrink-0 text-center">
                <span className="text-[11px] font-semibold text-[#9ca3af] tracking-[0.06em] uppercase whitespace-nowrap">
                  {idx.name.length > 14 ? idx.ticker : idx.name}
                </span>
                <div className="flex items-baseline justify-center gap-2">
                  <span className="text-[15px] font-semibold tabular-nums text-[#111111]">
                    {fmtPrice(idx.price)}
                  </span>
                  <span
                    className="text-[12px] font-semibold tabular-nums"
                    style={{ color: positive ? "#10b981" : "#ef4444" }}
                  >
                    {fmtPct(idx.changePct)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {displayIndices.length === 0 && showIndexSkeleton && (
        <div className="border-t border-[#f3f4f6] py-3 px-4 md:px-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 animate-pulse">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={`hero-index-skeleton-${i}`} className="flex flex-col items-center gap-2">
                <span className="h-3 w-16 rounded bg-[#f3f4f6]" />
                <span className="h-6 w-20 rounded bg-[#f3f4f6]" />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function HeroCta({
  busy,
  isSubscribed,
  signedIn,
  onStart,
}: {
  busy: boolean;
  isSubscribed: boolean;
  signedIn: boolean;
  onStart: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2.5 w-full">
      <button
        type="button"
        onClick={onStart}
        disabled={busy}
        className="inline-flex w-full sm:w-auto items-center justify-center h-11 px-7 rounded-full bg-[#111111] text-white text-[14px] font-semibold hover:bg-black transition-colors disabled:opacity-60"
      >
        {busy ? "Opening..." : signedIn ? "Open your Radar" : "Track your first stock for free"}
      </button>
      {!isSubscribed && (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          {["Free for 3 stocks", "No credit card", "Pro unlocks unlimited + alerts"].map((p) => (
            <span key={p} className="inline-flex items-center gap-1.5 text-[11px] text-[#9ca3af]">
              <span className="h-1 w-1 rounded-full bg-[#d1d5db]" />
              {p}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
