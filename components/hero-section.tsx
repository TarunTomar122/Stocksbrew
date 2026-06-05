"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/auth-context";
import { getFirebaseAuth } from "@/lib/firebase-client";
import { signInWithGoogle } from "@/lib/sign-in";
import { StockLogo } from "@/components/stock-logo";
import { HERO_HEADLINE_EMPHASIS, HERO_HEADLINE_LEAD, HERO_SUBHEAD } from "@/lib/brand-copy";

type IndexData = {
  ticker: string;
  name: string;
  price: number;
  changePct: number;
};

export type HeroSpotlight = {
  ticker: string;
  name: string;
  logoUrl: string | null;
  dayChangePct: number;
  headline: string;
  reasoning: string;
  verdict: string | null;
};

type Props = {
  indices: IndexData[];
  verdict?: unknown;
  isSubscribed?: boolean;
  showIndexSkeleton?: boolean;
  spotlight?: HeroSpotlight | null;
  leftChips?: HeroChip[];
  rightChips?: HeroChip[];
  mobileChips?: HeroChip[];
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

// rotate + offsetClass tune the floating feel inside the side columns
type HeroChip = {
  ticker: string;
  name: string;
  verdict: string;
  directive: string;
  dayChangePct: number;
  rotate: string;
  offsetClass?: string;
};

const LEFT_HERO_CHIPS: HeroChip[] = [
  {
    ticker: "AAPL",
    name: "Apple",
    verdict: "Hold",
    directive: "Wait for a pullback before adding",
    dayChangePct: 0.6,
    rotate: "-2.5deg",
    offsetClass: "-translate-y-1 translate-x-2",
  },
  {
    ticker: "NVDA",
    name: "NVIDIA",
    verdict: "Buy",
    directive: "AI demand still driving the setup",
    dayChangePct: 2.1,
    rotate: "1.5deg",
    offsetClass: "translate-x-6",
  },
  {
    ticker: "MSFT",
    name: "Microsoft",
    verdict: "Buy",
    directive: "Cloud growth keeps the trend intact",
    dayChangePct: 1.3,
    rotate: "-1deg",
    offsetClass: "translate-y-1 -translate-x-1",
  },
];

const RIGHT_HERO_CHIPS: HeroChip[] = [
  {
    ticker: "TSLA",
    name: "Tesla",
    verdict: "Sell",
    directive: "Momentum fading after the run",
    dayChangePct: -1.8,
    rotate: "2.5deg",
    offsetClass: "-translate-y-1 -translate-x-2",
  },
  {
    ticker: "GOOGL",
    name: "Alphabet",
    verdict: "Buy",
    directive: "Search and AI ads look strong",
    dayChangePct: 1.5,
    rotate: "-2deg",
    offsetClass: "-translate-x-5",
  },
  {
    ticker: "AMD",
    name: "AMD",
    verdict: "Hold",
    directive: "Needs a clean break above resistance",
    dayChangePct: -0.4,
    rotate: "1.5deg",
    offsetClass: "translate-y-1 translate-x-1",
  },
];

const MOBILE_CHIPS = [...LEFT_HERO_CHIPS.slice(0, 2), ...RIGHT_HERO_CHIPS.slice(0, 2)];

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

function FloatingHeroChip({ chip, compact }: { chip: HeroChip; compact?: boolean }) {
  return (
    <div
      className={`transition-transform duration-200 ease-out hover:-translate-y-1.5 ${chip.offsetClass ?? ""}`}
    >
      <div style={{ transform: `rotate(${chip.rotate})` }}>
        <StockVerdictChip
          ticker={chip.ticker}
          name={chip.name}
          verdict={chip.verdict}
          directive={chip.directive}
          dayChangePct={chip.dayChangePct}
          compact={compact}
        />
      </div>
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
}: {
  ticker: string;
  name: string;
  verdict: string;
  directive: string;
  dayChangePct: number;
  compact?: boolean;
}) {
  const up = dayChangePct >= 0;
  const changeColor = up ? "#10b981" : "#ef4444";
  const changeBg = up ? "#ecfdf5" : "#fef2f2";
  const logoSize = compact ? 28 : 38;

  const inner = (
    <div
      className={`flex flex-col gap-2 rounded-2xl border border-[#e5e7eb] bg-white text-left shadow-[0_8px_28px_rgba(17,24,39,0.08)] transition-shadow hover:shadow-[0_12px_36px_rgba(17,24,39,0.12)] ${
        compact ? "min-w-[156px] max-w-[176px] p-2.5" : "w-[188px] p-3.5"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <StockLogo ticker={ticker} market="US" size={logoSize} eager />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center justify-between gap-1.5">
            <span className={`font-semibold tracking-[-0.01em] text-[#111111] ${compact ? "text-[12px]" : "text-[13px]"}`}>
              {ticker}
            </span>
            <span
              className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 font-semibold tabular-nums ${
                compact ? "text-[9px]" : "text-[10px]"
              }`}
              style={{ background: changeBg, color: changeColor }}
            >
              {up ? "▲" : "▼"} {Math.abs(dayChangePct).toFixed(1)}%
            </span>
          </div>
          <span className={`truncate text-[#9ca3af] ${compact ? "text-[10px]" : "text-[11px]"}`}>
            {name}
          </span>
        </div>
      </div>

      <p className={`leading-snug text-[#6b7280] ${compact ? "text-[10px] line-clamp-2" : "text-[11px] line-clamp-2"}`}>
        {directive}
      </p>

      <span
        className={`self-start font-bold rounded-md ${compact ? "text-[10px] px-1.5 py-0.5" : "text-[11px] px-2 py-0.5"}`}
        style={{ color: verdictStyle(verdict).text, background: verdictStyle(verdict).bg }}
      >
        {verdict}
      </span>
    </div>
  );

  return (
    <Link
      href={`/stock/${encodeURIComponent(ticker)}`}
      className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0052ff] focus-visible:ring-offset-2 rounded-2xl"
    >
      {inner}
    </Link>
  );
}

export function HeroSection({
  indices,
  isSubscribed = false,
  showIndexSkeleton = false,
  spotlight = null,
  leftChips,
  rightChips,
  mobileChips,
}: Props) {
  const router = useRouter();
  const { user } = useUser();
  const [busy, setBusy] = useState(false);

  const left = leftChips && leftChips.length > 0 ? leftChips : LEFT_HERO_CHIPS;
  const right = rightChips && rightChips.length > 0 ? rightChips : RIGHT_HERO_CHIPS;
  const mobile = mobileChips && mobileChips.length > 0 ? mobileChips : MOBILE_CHIPS;

  async function startTracking() {
    if (user) {
      router.push("/watchlist");
      return;
    }
    setBusy(true);
    try {
      await signInWithGoogle();
      await syncServerSession().catch(() => undefined);
      router.push("/watchlist");
    } catch (err) {
      console.error("sign-in failed", err);
      setBusy(false);
    }
  }

  const displayIndices = indices.slice(0, 5);

  return (
    <section className="w-full overflow-hidden bg-white">
      <div className="flex flex-col items-center gap-12 md:gap-20 pt-10 md:pt-16 pb-10">

        {/* Headline block — side columns on desktop, stacked on mobile */}
        <div className="w-full max-w-[1120px] mx-auto px-4 lg:px-6">
          {/* Mobile / tablet */}
          <div className="flex lg:hidden flex-col items-center gap-4 text-center">
            <h1 className="text-[28px] sm:text-[36px] md:text-[46px] font-semibold tracking-[-0.04em] leading-[1.08] max-w-[560px]">
              <span className="text-[#9ca3af]">{HERO_HEADLINE_LEAD}</span>
              <span className="text-[#111111]">{HERO_HEADLINE_EMPHASIS}</span>
            </h1>
            <p className="text-[15px] md:text-[17px] text-[#6b7280] leading-[1.55] max-w-[440px]">
              {HERO_SUBHEAD}
            </p>
            <div className="flex flex-wrap items-stretch justify-center gap-3 w-full max-w-[420px]">
              {mobile.map((chip) => (
                <FloatingHeroChip key={chip.ticker} chip={chip} compact />
              ))}
            </div>
            <HeroCta
              busy={busy}
              isSubscribed={isSubscribed}
              signedIn={Boolean(user)}
              onStart={startTracking}
            />
          </div>

          {/* Desktop — headline centered, cards in left/right gutters */}
          <div className="hidden lg:grid min-h-[360px] grid-cols-[minmax(0,1fr)_minmax(0,560px)_minmax(0,1fr)] items-center gap-x-8 xl:gap-x-10">
            <div className="flex flex-col items-end gap-7 justify-center pr-1 xl:pr-3">
              {left.map((chip) => (
                <FloatingHeroChip key={chip.ticker} chip={chip} />
              ))}
            </div>

            <div className="relative z-10 flex flex-col items-center gap-4 text-center px-2">
              <h1 className="text-[36px] xl:text-[46px] font-semibold tracking-[-0.04em] leading-[1.08]">
                <span className="text-[#9ca3af]">{HERO_HEADLINE_LEAD}</span>
                <span className="text-[#111111]">{HERO_HEADLINE_EMPHASIS}</span>
              </h1>
              <p className="text-[17px] text-[#6b7280] leading-[1.55] max-w-[440px]">
                {HERO_SUBHEAD}
              </p>
              <HeroCta
                busy={busy}
                isSubscribed={isSubscribed}
                signedIn={Boolean(user)}
                onStart={startTracking}
              />
            </div>

            <div className="flex flex-col items-start gap-7 justify-center pl-1 xl:pl-3">
              {right.map((chip) => (
                <FloatingHeroChip key={chip.ticker} chip={chip} />
              ))}
            </div>
          </div>
        </div>

        {/* Live call — a real, current read from stocksbrew (no mockups) */}
        {spotlight && <HeroSpotlightCard spotlight={spotlight} />}

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

function HeroSpotlightCard({ spotlight }: { spotlight: HeroSpotlight }) {
  const up = spotlight.dayChangePct >= 0;
  const changeColor = up ? "#10b981" : "#ef4444";
  const changeBg = up ? "#ecfdf5" : "#fef2f2";

  return (
    <div className="w-full max-w-[560px] mx-auto px-4 lg:px-0">
      <div className="flex items-center justify-center gap-2 pb-3">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#10b981] opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[#10b981]" />
        </span>
        <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[#6b7280]">
          What stocksbrew is flagging right now
        </span>
      </div>

      <article className="flex flex-col gap-3 rounded-[20px] border border-[#e5e7eb] bg-white p-5 shadow-[0_20px_60px_rgba(17,24,39,0.08)]">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <StockLogo
              ticker={spotlight.ticker}
              market="US"
              size={36}
              logoUrl={spotlight.logoUrl}
            />
            <div className="flex min-w-0 flex-col">
              <span className="text-[15px] font-semibold tracking-[-0.01em] text-[#111111]">
                {spotlight.ticker}
              </span>
              <span className="truncate max-w-[180px] text-[12px] text-[#9ca3af]">
                {spotlight.name}
              </span>
            </div>
          </div>
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-[13px] font-semibold tabular-nums"
            style={{ background: changeBg, color: changeColor }}
          >
            {up ? "▲" : "▼"} {Math.abs(spotlight.dayChangePct).toFixed(2)}%
          </span>
        </div>

        <p className="text-[15px] font-semibold leading-snug text-[#111111]">
          {spotlight.headline}
        </p>
        <p className="text-[13px] leading-relaxed text-[#6b7280]">
          {spotlight.reasoning}
        </p>

        {spotlight.verdict && (
          <div className="flex items-center gap-2 border-t border-[#f3f4f6] pt-3">
            <span className="text-[11px] font-medium text-[#9ca3af]">
              Our read
            </span>
            <span className="text-[12px] font-semibold text-[#111111]">
              {spotlight.verdict}
            </span>
          </div>
        )}
      </article>
    </div>
  );
}
