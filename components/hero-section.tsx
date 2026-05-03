"use client";

import { useRouter } from "next/navigation";

type IndexData = {
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

function sparklinePath(points: number[], width = 96, height = 28): string {
  if (points.length < 2) return "";
  const step = width / (points.length - 1);
  return points
    .map((y, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(2)},${(height - y * height).toFixed(2)}`)
    .join(" ");
}

export function HeroSection({ score, tone, color, indices }: Props) {
  const router = useRouter();

  const moodLabel =
    score < 25 ? "Very Cautious" :
    score < 45 ? "Cautious" :
    score < 55 ? "Balanced" :
    score < 75 ? "Confident" : "Overheated";

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

      <div className="relative grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-10 px-6 md:px-10 lg:px-14 pt-14 md:pt-20 pb-0 min-h-[560px]">
        {/* Left: copy + CTA */}
        <div className="flex flex-col gap-7 max-w-[560px] z-10">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[12px] font-medium text-white/80 backdrop-blur-sm">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full"
              style={{ background: color }}
            />
            Market mood: {moodLabel} · {Math.round(score)}
          </span>

          <h1 className="text-white text-[44px] md:text-[56px] lg:text-[64px] font-semibold leading-[1.05] tracking-[-0.04em]">
          Wall Street's
            <br />
            Morning Routine.
          </h1>

          <p className="text-[16px] md:text-[17px] text-white/70 leading-[1.55] max-w-[480px]">
            Tikrr surfaces institutional flows, sentiment shifts, and sector
            rotations across US markets — so you spot the move before
            the headline.
          </p>

          <div className="flex items-center gap-3 flex-wrap pt-1">
            <button
              type="button"
              onClick={() => router.push("/heat")}
              className="inline-flex items-center justify-center h-[44px] px-6 rounded-full bg-white text-[#111111] text-[14px] font-semibold tracking-tight transition-transform hover:-translate-y-[1px] active:translate-y-0"
            >
              Get Started
            </button>
            <button
              type="button"
              onClick={() => router.push("/news")}
              className="inline-flex items-center justify-center h-[44px] px-5 rounded-full border border-white/20 bg-white/5 text-white text-[14px] font-medium hover:bg-white/10 transition-colors"
            >
              See latest news
            </button>
          </div>

          <p className="text-[12px] text-white/50 pt-1">
            Pro $9/mo · cancel anytime
          </p>
        </div>

        {/* Right: floating product artifacts */}
        <div className="relative hidden lg:block min-h-[420px]">
          {FLOATING_CARDS.map((c) => {
            const positive = c.changePct >= 0;
            const path = sparklinePath(c.spark);
            const sparkColor = positive ? "#34d399" : "#f87171";
            return (
              <div
                key={c.ticker}
                className={`hero-card-float absolute ${c.pos} w-[140px] h-[140px] rounded-[28px] p-[1.5px] shadow-[0_22px_50px_rgba(0,0,0,0.45)]`}
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
                  className="relative flex h-full w-full flex-col rounded-[26px] text-white overflow-hidden"
                  style={{ background: c.gradient }}
                >
                  {/* Watermark icon */}
                  <span
                    aria-hidden
                    className="material-symbols-outlined absolute -right-2 -bottom-2 text-white/10 select-none pointer-events-none"
                    style={{ fontSize: 96, fontVariationSettings: "'wght' 600" }}
                  >
                    {c.icon}
                  </span>

                  {/* Day-change chip */}
                  <span
                    className="absolute top-2.5 right-2.5 inline-flex items-center gap-0.5 rounded-full bg-black/40 backdrop-blur-sm px-2 py-0.5 text-[10px] font-semibold tabular-nums ring-1 ring-white/10"
                    style={{ color: positive ? "#34d399" : "#f87171" }}
                  >
                    {positive ? "▲" : "▼"} {Math.abs(c.changePct).toFixed(2)}%
                  </span>

                  {/* Ticker + name */}
                  <div className="flex flex-col items-start gap-0.5 px-3.5 pt-3.5">
                    <span className="text-[24px] font-semibold tracking-tight leading-none">
                      {c.ticker}
                    </span>
                    <span className="text-[10px] text-white/70">{c.name}</span>
                  </div>

                  {/* Sparkline */}
                  <svg
                    viewBox="0 0 96 28"
                    width="96"
                    height="28"
                    aria-hidden
                    className="absolute bottom-3 left-3 right-3"
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
