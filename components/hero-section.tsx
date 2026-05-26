"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/auth-context";
import { getFirebaseAuth } from "@/lib/firebase-client";
import { signInWithGoogle } from "@/lib/sign-in";
import { StockLogo } from "@/components/stock-logo";
import { ExpandableYoutubeVideo } from "@/components/expandable-youtube-video";
import { HERO_SUBHEAD } from "@/lib/brand-copy";

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

const YT_VIDEO_ID = "i7tbJL58PMA";

// pos = absolute coordinates (no negatives — avoids overflow-hidden clipping)
// rotate = applied to outer wrapper; hover translate applied to inner card (keeps transforms independent)
const SCATTERED_CHIPS: {
  ticker: string;
  verdict: "Buy" | "Hold" | "Sell";
  pos: { top?: string; bottom?: string; left?: string; right?: string };
  rotate: string;
}[] = [
  // ── left side — vary x-offset dramatically so they don't read as a column ──
  { ticker: "AAPL",  verdict: "Hold", pos: { top: "4%",    left: "9%"  }, rotate: "-3deg"   },
  { ticker: "NVDA",  verdict: "Buy",  pos: { top: "44%",   left: "2%"  }, rotate: "2deg"    },
  { ticker: "MSFT",  verdict: "Buy",  pos: { bottom: "4%", left: "17%" }, rotate: "-1.5deg" },
  // ── right side ─────────────────────────────────────────────────────────────
  { ticker: "TSLA",  verdict: "Sell", pos: { top: "6%",    right: "4%"  }, rotate: "3deg"    },
  { ticker: "GOOGL", verdict: "Buy",  pos: { top: "43%",   right: "13%" }, rotate: "-2.5deg" },
  { ticker: "AMD",   verdict: "Hold", pos: { bottom: "3%", right: "5%"  }, rotate: "2deg"    },
];

const VERDICT_STYLES = {
  Buy:  { text: "#10b981", bg: "#ecfdf5" },
  Hold: { text: "#f59e0b", bg: "#fffbeb" },
  Sell: { text: "#ef4444", bg: "#fef2f2" },
};

const MOBILE_CHIPS = SCATTERED_CHIPS.slice(0, 4);

function StockVerdictChip({
  ticker,
  verdict,
  rotate,
  compact,
}: {
  ticker: string;
  verdict: "Buy" | "Hold" | "Sell";
  rotate?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-1.5 rounded-xl border border-[#e5e7eb] bg-white shadow-[0_2px_12px_rgba(0,0,0,0.06)] ${
        compact ? "px-2.5 py-1.5" : "px-3 py-2 shadow-[0_2px_16px_rgba(0,0,0,0.07)]"
      }`}
      style={rotate ? { transform: `rotate(${rotate})` } : undefined}
    >
      <StockLogo ticker={ticker} market="US" size={compact ? 18 : 22} />
      <span className={`font-semibold text-[#111111] ${compact ? "text-[11px]" : "text-[12px]"}`}>
        {ticker}
      </span>
      <span
        className={`font-bold rounded-md ${compact ? "text-[10px] px-1 py-0.5" : "text-[11px] px-1.5 py-0.5"}`}
        style={{ color: VERDICT_STYLES[verdict].text, background: VERDICT_STYLES[verdict].bg }}
      >
        {verdict}
      </span>
    </div>
  );
}

export function HeroSection({ indices, isSubscribed = false, showIndexSkeleton = false }: Props) {
  const router = useRouter();
  const { user } = useUser();
  const [busy, setBusy] = useState(false);

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

        {/* Headline block — centered, with scattered floating chips */}
        <div className="relative w-full flex items-center justify-center" style={{ minHeight: "220px" }}>

          {/* Scattered stock chips — desktop only */}
          <div className="hidden lg:block absolute inset-0 select-none">
            {SCATTERED_CHIPS.map((s) => (
              <div
                key={s.ticker}
                className="absolute transition-transform duration-200 ease-out hover:-translate-y-1.5"
                style={{ ...s.pos, transform: `rotate(${s.rotate})` }}
              >
                <StockVerdictChip ticker={s.ticker} verdict={s.verdict} />
              </div>
            ))}
          </div>

          {/* Center text */}
          <div className="relative flex flex-col items-center gap-4 text-center w-full max-w-[540px] px-4 lg:px-0">
            <h1 className="text-[30px] sm:text-[40px] md:text-[52px] font-semibold text-[#111111] tracking-[-0.04em] leading-[1.05]">
              Know exactly what to do with your stocks.
            </h1>

            <p className="text-[15px] md:text-[17px] text-[#6b7280] leading-[1.55] max-w-[380px]">
              {HERO_SUBHEAD}
            </p>

            {/* Stock chips — mobile / tablet (desktop uses scattered layout above) */}
            <div className="flex lg:hidden flex-wrap items-center justify-center gap-2.5 w-full max-w-[340px]">
              {MOBILE_CHIPS.map((s) => (
                <StockVerdictChip
                  key={s.ticker}
                  ticker={s.ticker}
                  verdict={s.verdict}
                  rotate={s.rotate}
                  compact
                />
              ))}
            </div>

            <div className="flex flex-col items-center gap-2.5 w-full">
              <button
                type="button"
                onClick={startTracking}
                disabled={busy}
                className="inline-flex w-full sm:w-auto items-center justify-center h-11 px-7 rounded-full bg-[#111111] text-white text-[14px] font-semibold hover:bg-black transition-colors disabled:opacity-60"
              >
                {busy ? "Opening..." : user ? "Open your Radar" : "Track your first stock for free"}
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
          </div>
        </div>

        {/* Video embed — full width on mobile, capped on desktop */}
        <div className="relative w-full max-w-[860px] mx-auto px-0 md:px-6 lg:px-0">

          {/* Browser frame + video */}
          <div className="w-full">
            <div className="hidden sm:flex items-center gap-1.5 rounded-t-2xl bg-[#f3f4f6] border border-b-0 border-[#e5e7eb] px-4 py-2.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ef4444] opacity-70" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#f59e0b] opacity-70" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#10b981] opacity-70" />
              <div className="mx-3 flex-1 rounded-md bg-white border border-[#e5e7eb] px-3 py-0.5 text-[11px] text-[#9ca3af] text-center">
                www.stocksbrew.online/watchlist
              </div>
            </div>
            <div className="relative w-full rounded-2xl sm:rounded-t-none sm:rounded-b-2xl overflow-hidden border sm:border-t-0 border-[#e5e7eb] shadow-[0_20px_60px_rgba(0,0,0,0.10)] isolate" style={{ paddingBottom: "56.25%" }}>
              <div className="absolute inset-0 overflow-hidden rounded-2xl sm:rounded-t-none sm:rounded-b-2xl">
                <ExpandableYoutubeVideo
                  videoId={YT_VIDEO_ID}
                  title="See stocksbrew in action"
                  previewLabel="See stocksbrew in action"
                  className="h-full w-full rounded-2xl sm:rounded-t-none sm:rounded-b-2xl"
                />
              </div>
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
