"use client";

import Link from "next/link";
import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/auth-context";
import { getFirebaseAuth } from "@/lib/firebase-client";
import { signInWithGoogle } from "@/lib/sign-in";
import { StockLogo } from "@/components/stock-logo";

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

export function HeroSection({ indices, isSubscribed = false }: Props) {
  const router = useRouter();
  const { user } = useUser();
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const postYT = useCallback((func: string) => {
    iframeRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: "command", func, args: [] }),
      "*"
    );
  }, []);

  function toggleMute() {
    postYT(muted ? "unMute" : "mute");
    setMuted((v) => !v);
  }
  function togglePlay() {
    postYT(playing ? "pauseVideo" : "playVideo");
    setPlaying((v) => !v);
  }

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
    <section className="w-full overflow-hidden">
      <div className="flex flex-col items-center gap-8 pt-10 md:pt-16 pb-10">

        {/* Headline block — centered, with scattered floating chips */}
        <div className="relative w-full flex items-center justify-center" style={{ minHeight: "220px" }}>

          {/* Scattered stock chips — desktop only */}
          <div className="hidden lg:block absolute inset-0 select-none">
            {SCATTERED_CHIPS.map((s) => (
              /* outer div: position + static rotation */
              <div
                key={s.ticker}
                className="absolute"
                style={{ ...s.pos, transform: `rotate(${s.rotate})` }}
              >
                {/* inner div: hover lift — independent of rotation transform */}
                <div className="flex items-center gap-2 rounded-xl border border-[#e5e7eb] bg-white px-3 py-2 shadow-[0_2px_16px_rgba(0,0,0,0.07)] transition-all duration-200 ease-out hover:-translate-y-1.5 hover:shadow-[0_10px_28px_rgba(0,0,0,0.11)] cursor-default">
                  <StockLogo ticker={s.ticker} market="US" size={22} />
                  <span className="text-[12px] font-semibold text-[#111111]">{s.ticker}</span>
                  <span
                    className="text-[11px] font-bold px-1.5 py-0.5 rounded-md"
                    style={{ color: VERDICT_STYLES[s.verdict].text, background: VERDICT_STYLES[s.verdict].bg }}
                  >
                    {s.verdict}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Center text */}
          <div className="relative flex flex-col items-center gap-4 text-center w-full max-w-[540px] px-4 lg:px-0">
            <h1 className="text-[30px] sm:text-[40px] md:text-[52px] font-semibold text-[#111111] tracking-[-0.04em] leading-[1.05]">
              Know exactly what to do with your stocks.
            </h1>

            <p className="text-[15px] md:text-[17px] text-[#6b7280] leading-[1.55] max-w-[400px]">
              Personalized AI analysis on every stock you own, every morning.
            </p>

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
                tikrr.online/watchlist
              </div>
            </div>
            <div className="relative w-full rounded-2xl sm:rounded-t-none sm:rounded-b-2xl overflow-hidden border sm:border-t-0 border-[#e5e7eb] shadow-[0_20px_60px_rgba(0,0,0,0.10)]" style={{ paddingBottom: "56.25%" }}>
              <iframe
                ref={iframeRef}
                src={`https://www.youtube.com/embed/${YT_VIDEO_ID}?autoplay=1&mute=1&loop=1&playlist=${YT_VIDEO_ID}&controls=0&modestbranding=1&rel=0&playsinline=1&iv_load_policy=3&disablekb=1&enablejsapi=1`}
                title="See tikrr in action"
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 h-full w-full"
                style={{ border: 0 }}
              />
              {/* Custom controls — bottom-right, just mute + play/pause */}
              <div className="absolute bottom-3 right-3 flex items-center gap-1.5 z-10">
                <button
                  type="button"
                  onClick={togglePlay}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm hover:bg-black/80 transition-colors"
                  aria-label={playing ? "Pause" : "Play"}
                >
                  {playing ? (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><rect x="2" y="1" width="3" height="10" rx="1"/><rect x="7" y="1" width="3" height="10" rx="1"/></svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M3 1.5l7 4.5-7 4.5V1.5z"/></svg>
                  )}
                </button>
                <button
                  type="button"
                  onClick={toggleMute}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm hover:bg-black/80 transition-colors"
                  aria-label={muted ? "Unmute" : "Mute"}
                >
                  {muted ? (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M2 5h2.5L8 2v10L4.5 9H2V5z"/><path d="M10.5 5.5l2 2-2 2M12.5 5.5l-2 2 2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none"/></svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M2 5h2.5L8 2v10L4.5 9H2V5z"/><path d="M10 5.5a3 3 0 010 3M11.5 4a5 5 0 010 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none"/></svg>
                  )}
                </button>
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
    </section>
  );
}
