"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/auth-context";
import { getFirebaseAuth } from "@/lib/firebase-client";
import { signInWithGoogle } from "@/lib/sign-in";

type IndexData = {
  ticker: string;
  name: string;
  price: number;
  changePct: number;
};

type FeaturedStock = {
  ticker: string;
  name: string;
  price: number;
  changePct: number;
};

type Props = {
  score: number;
  tone: string;
  color: string;
  indices: IndexData[];
  featuredStock?: FeaturedStock;
  isSubscribed?: boolean;
};

function fmtPrice(v: number): string {
  if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return v.toFixed(2);
}

function fmtPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

const FLOATING_CARDS: {
  ticker: string;
  name: string;
  gradient: string;
  pos: string;
  rot: string;
  delay: string;
  /** Material Symbols glyph used as a watermark icon on the tile. */
  icon: string;
  /** Day-change pct shown on the floating chip. */
  changePct: number;
  /** 0–1 sparkline points; rendered behind the ticker. */
  spark: number[];
}[] = [
  {
    ticker: "TSLA",
    name: "Tesla",
    gradient: "linear-gradient(135deg,#1c1c1c 0%,#0a0a0a 100%)",
    pos: "top-[18%] left-[18%]",
    rot: "-8deg",
    delay: "0s",
    icon: "bolt",
    changePct: 2.43,
    spark: [0.4, 0.32, 0.45, 0.38, 0.55, 0.62, 0.58, 0.7, 0.75, 0.82],
  },
  {
    ticker: "NVDA",
    name: "NVIDIA",
    gradient: "linear-gradient(135deg,#76b900 0%,#3a5e00 100%)",
    pos: "top-[10%] right-[20%]",
    rot: "6deg",
    delay: "1.5s",
    icon: "memory",
    changePct: 4.12,
    spark: [0.28, 0.34, 0.4, 0.5, 0.48, 0.6, 0.66, 0.78, 0.86, 0.92],
  },
  {
    ticker: "AMZN",
    name: "Amazon",
    gradient: "linear-gradient(135deg,#ff9900 0%,#cc6f00 100%)",
    pos: "top-[46%] right-[14%]",
    rot: "10deg",
    delay: "3s",
    icon: "local_shipping",
    changePct: -1.18,
    spark: [0.7, 0.65, 0.6, 0.62, 0.58, 0.5, 0.45, 0.4, 0.38, 0.32],
  },
  {
    ticker: "AAPL",
    name: "Apple",
    gradient: "linear-gradient(135deg,#3a3a3c 0%,#1c1c1e 100%)",
    pos: "bottom-[16%] left-[24%]",
    rot: "-4deg",
    delay: "4.5s",
    icon: "phone_iphone",
    changePct: 0.84,
    spark: [0.45, 0.5, 0.46, 0.52, 0.55, 0.58, 0.54, 0.62, 0.65, 0.68],
  },
];

const PROOF_POINTS = [
  "Free Radar for your first watchlist",
  "No credit card to start",
  "Pro is $9/mo when you want alerts",
];

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

function sparklinePath(points: number[], width = 96, height = 28): string {
  if (points.length < 2) return "";
  const step = width / (points.length - 1);
  return points
    .map((y, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(2)},${(height - y * height).toFixed(2)}`)
    .join(" ");
}

export function HeroSection({ score, tone, color, indices, featuredStock, isSubscribed = false }: Props) {
  const router = useRouter();
  const { user } = useUser();
  const [busy, setBusy] = useState(false);

  const moodLabel =
    score < 25 ? "Very Cautious" :
    score < 45 ? "Cautious" :
    score < 55 ? "Balanced" :
    score < 75 ? "Confident" : "Overheated";

  const stock = featuredStock ?? {
    ticker: "NVDA",
    name: "NVIDIA",
    price: 0,
    changePct: 4.12,
  };
  const stockChange = fmtPct(stock.changePct);
  const sampleMove =
    stock.ticker === "NVDA"
      ? "NVDA is up because investors still like its AI growth story. The move is healthier if the stock keeps most of today's gain by the close."
      : "The stock is moving higher today. The move is more useful if it stays strong near the close instead of giving the gain back.";
  const samplePattern =
    stock.ticker === "NVDA"
      ? "This matters because NVDA often leads the AI trade. If it stays strong, other chip stocks may get attention too."
      : "This matters because a stock that stays strong all day usually has more serious buyers than one that spikes and fades.";
  const sampleWatch =
    stock.ticker === "NVDA"
      ? "Watch the final hour. If NVDA gives back most of the gain, wait for a better entry instead of chasing."
      : "Watch the final hour. If the stock gives back most of the gain, the move is weaker than it first looked.";

  async function startFreeRadar() {
    if (user) {
      router.push("/watchlist");
      return;
    }
    setBusy(true);
    try {
      await signInWithGoogle();
      await syncServerSession().catch(() => undefined);
      router.push("/onboarding");
    } catch (err) {
      console.error("sign-in failed", err);
      setBusy(false);
    }
  }

  return (
    <section className="relative w-full overflow-hidden rounded-[24px]">
      {/* Base navy gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_50%_120%,#1e3a8a_0%,#0b1228_45%,#050816_85%)]" />

      {/* Light beam behind headline */}
      <div
        className="absolute inset-x-0 top-0 h-full pointer-events-none"
        style={{
          background:
            "conic-gradient(from 200deg at 50% 110%, transparent 0deg, rgba(59,130,246,0.18) 30deg, rgba(59,130,246,0.35) 60deg, rgba(59,130,246,0.18) 90deg, transparent 120deg)",
          mixBlendMode: "screen",
        }}
        aria-hidden
      />

      {/* Subtle planet horizon glow */}
      <div
        className="absolute -bottom-[40%] left-1/2 -translate-x-1/2 h-[80%] w-[140%] rounded-[50%] pointer-events-none"
        style={{
          background:
            "radial-gradient(50% 50% at 50% 50%, rgba(59,130,246,0.35) 0%, rgba(59,130,246,0.08) 55%, transparent 80%)",
          filter: "blur(20px)",
        }}
        aria-hidden
      />

      <div className="relative grid grid-cols-1 lg:grid-cols-[0.95fr_1.05fr] gap-10 px-6 md:px-10 lg:px-14 py-10 md:py-14 min-h-[560px]">
        {/* Left: copy + CTA */}
        <div className="flex flex-col justify-center gap-7 max-w-[610px] z-10">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[12px] font-medium text-white/80 backdrop-blur-sm">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: color }}
            />
            Today&apos;s market mood: {moodLabel} · {Math.round(score)}
          </span>

          <h1 className="text-white text-[44px] md:text-[56px] lg:text-[64px] font-semibold leading-[1.05] tracking-[-0.04em]">
            Your 5-minute
            <br />
            AI market brief.
          </h1>

          <p className="text-[16px] md:text-[17px] text-white/70 leading-[1.55] max-w-[480px]">
            Tikrr turns market data, news, technicals, and your watchlist into
            a plain-English Radar so you know what changed, what matters, and
            which tickers need attention today.
          </p>

          <div className="flex items-center gap-3 flex-wrap pt-1">
            <button
              type="button"
              onClick={startFreeRadar}
              disabled={busy}
              className="inline-flex items-center justify-center h-[44px] px-6 rounded-full bg-white text-[#111111] text-[14px] font-semibold tracking-tight transition-transform hover:-translate-y-[1px] active:translate-y-0"
            >
              {busy ? "Opening Radar..." : user ? "Check your Radar" : "Start free Radar"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/heat")}
              className="inline-flex items-center justify-center h-[44px] px-5 rounded-full border border-white/20 bg-white/5 text-white text-[14px] font-medium hover:bg-white/10 transition-colors"
            >
              See live market map
            </button>
          </div>

          {!isSubscribed && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
              {PROOF_POINTS.map((point) => (
                <span key={point} className="inline-flex items-center gap-1.5 text-[12px] text-white/55">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-white/35" />
                  {point}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Right: concrete product artifact */}
        <div className="relative hidden lg:flex min-h-[420px] items-center justify-center">
          <div className="relative z-10 w-full max-w-[560px] rounded-[28px] border border-white/15 bg-white/[0.08] p-4 shadow-[0_30px_80px_rgba(0,0,0,0.35)] backdrop-blur-md">
            <div className="rounded-[22px] bg-white text-[#111111] shadow-[0_18px_50px_rgba(0,0,0,0.20)] overflow-hidden">
              <div className="flex items-center justify-between gap-4 border-b border-[#eef0f3] px-5 py-4">
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[#0052ff]">
                    Free daily brief
                  </span>
                  <h2 className="text-[20px] font-semibold tracking-[-0.02em]">
                    What changed before you trade
                  </h2>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ecfdf5] px-3 py-1 text-[12px] font-semibold text-[#047857]">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
                  Live style
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 border-b border-[#eef0f3] px-5 py-4">
                <div className="rounded-2xl bg-[#f8fafc] p-4">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#9ca3af]">
                    Market pulse
                  </span>
                  <p className="mt-2 text-[24px] font-semibold tracking-[-0.03em]">
                    {Math.round(score)}
                  </p>
                  <p className="text-[12px] text-[#6b7280]">{tone || moodLabel}</p>
                </div>
                <div className="rounded-2xl bg-[#f8fafc] p-4">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#9ca3af]">
                    Stock example
                  </span>
                  <p className="mt-2 text-[24px] font-semibold tracking-[-0.03em]">
                    {stock.ticker}
                  </p>
                  <p className={stock.changePct < 0 ? "text-[12px] font-semibold text-[#ef4444]" : "text-[12px] font-semibold text-[#10b981]"}>
                    {stockChange}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 px-5 py-5">
                {[
                  {
                    label: `${stock.ticker} brief`,
                    text: sampleMove,
                    icon: "monitoring",
                    tone: "#0052ff",
                  },
                  {
                    label: "Why this pattern matters",
                    text: samplePattern,
                    icon: "filter_alt",
                    tone: "#047857",
                  },
                  {
                    label: "What to watch next",
                    text: sampleWatch,
                    icon: "radar",
                    tone: "#92400e",
                  },
                ].map((item) => (
                  <div key={item.label} className="flex gap-3 rounded-2xl border border-[#eef0f3] p-3">
                    <span
                      aria-hidden
                      className="material-symbols-outlined mt-0.5"
                      style={{ fontSize: 20, color: item.tone, fontVariationSettings: "'wght' 600" }}
                    >
                      {item.icon}
                    </span>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#9ca3af]">
                        {item.label}
                      </span>
                      <p className="text-[13px] leading-snug text-[#374151]">{item.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {FLOATING_CARDS.map((c) => {
            const positive = c.changePct >= 0;
            const path = sparklinePath(c.spark);
            const sparkColor = positive ? "#34d399" : "#f87171";
            return (
              <div
                key={c.ticker}
                className={`hero-card-float absolute ${c.pos} w-[112px] h-[112px] rounded-[24px] p-[1.5px] shadow-[0_22px_50px_rgba(0,0,0,0.35)] opacity-70`}
                style={
                  {
                    background:
                      "linear-gradient(180deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.05) 100%)",
                    ["--rot" as string]: c.rot,
                    animationDelay: c.delay,
                  } as React.CSSProperties
                }
              >
                <div
                  className="relative flex h-full w-full flex-col rounded-[22px] text-white overflow-hidden"
                  style={{ background: c.gradient }}
                >
                  {/* Watermark icon */}
                  <span
                    aria-hidden
                    className="material-symbols-outlined absolute -right-2 -bottom-2 text-white/10 select-none pointer-events-none"
                    style={{ fontSize: 74, fontVariationSettings: "'wght' 600" }}
                  >
                    {c.icon}
                  </span>

                  {/* Day-change chip */}
                  <span
                    className="absolute top-2 right-2 inline-flex items-center gap-0.5 rounded-full bg-black/40 backdrop-blur-sm px-1.5 py-0.5 text-[9px] font-semibold tabular-nums ring-1 ring-white/10"
                    style={{ color: positive ? "#34d399" : "#f87171" }}
                  >
                    {positive ? "▲" : "▼"} {Math.abs(c.changePct).toFixed(2)}%
                  </span>

                  {/* Ticker + name */}
                  <div className="flex flex-col items-start gap-0.5 px-3 pt-3">
                    <span className="text-[20px] font-semibold tracking-tight leading-none">
                      {c.ticker}
                    </span>
                    <span className="text-[9px] text-white/70">{c.name}</span>
                  </div>

                  {/* Sparkline */}
                  <svg
                    viewBox="0 0 96 28"
                    width="96"
                    height="28"
                    aria-hidden
                    className="absolute bottom-2.5 left-2.5 right-2.5"
                    preserveAspectRatio="none"
                  >
                    <path
                      d={path}
                      fill="none"
                      stroke={sparkColor}
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity="0.95"
                    />
                  </svg>
                </div>
              </div>
            );
          })}

          {/* Centre anchor with pulsing rings */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <span
              aria-hidden
              className="hero-pulse absolute inset-0 -m-2 rounded-full border border-white/20"
            />
            <span
              aria-hidden
              className="hero-pulse absolute inset-0 -m-2 rounded-full border border-white/15"
              style={{ animationDelay: "1.6s" }}
            />
            <div className="relative h-3 w-3 rounded-full bg-white/40 shadow-[0_0_60px_20px_rgba(59,130,246,0.35)]" />
          </div>
        </div>
      </div>

    </section>
  );
}
