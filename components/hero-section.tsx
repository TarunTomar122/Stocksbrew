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
}[] = [
  {
    ticker: "TSLA",
    name: "Tesla",
    gradient: "linear-gradient(135deg,#1c1c1c 0%,#0a0a0a 100%)",
    pos: "top-[18%] left-[18%]",
    rot: "-8deg",
    delay: "0s",
  },
  {
    ticker: "NVDA",
    name: "NVIDIA",
    gradient: "linear-gradient(135deg,#76b900 0%,#3a5e00 100%)",
    pos: "top-[10%] right-[20%]",
    rot: "6deg",
    delay: "1.5s",
  },
  {
    ticker: "AMZN",
    name: "Amazon",
    gradient: "linear-gradient(135deg,#ff9900 0%,#cc6f00 100%)",
    pos: "top-[46%] right-[14%]",
    rot: "10deg",
    delay: "3s",
  },
  {
    ticker: "AAPL",
    name: "Apple",
    gradient: "linear-gradient(135deg,#3a3a3c 0%,#1c1c1e 100%)",
    pos: "bottom-[16%] left-[24%]",
    rot: "-4deg",
    delay: "4.5s",
  },
];

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
            Know the market
            <br />
            before it knows itself.
          </h1>

          <p className="text-[16px] md:text-[17px] text-white/70 leading-[1.55] max-w-[480px]">
            Tikrr surfaces institutional flows, sentiment shifts, and sector
            rotations across US and Indian markets — so you spot the move before
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
            Free during beta · No card required
          </p>
        </div>

        {/* Right: floating product artifacts */}
        <div className="relative hidden lg:block min-h-[420px]">
          {FLOATING_CARDS.map((c) => (
            <div
              key={c.ticker}
              className={`hero-card-float absolute ${c.pos} w-[120px] h-[120px] rounded-[26px] p-[2px] shadow-[0_18px_40px_rgba(0,0,0,0.45)]`}
              style={
                {
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.35) 0%, rgba(255,255,255,0.08) 100%)",
                  ["--rot" as string]: c.rot,
                  animationDelay: c.delay,
                } as React.CSSProperties
              }
            >
              <div
                className="flex h-full w-full flex-col items-center justify-center rounded-[24px] text-white"
                style={{ background: c.gradient }}
              >
                <span className="text-[22px] font-semibold tracking-tight">
                  {c.ticker}
                </span>
                <span className="text-[11px] text-white/70 mt-1">{c.name}</span>
              </div>
            </div>
          ))}

          {/* Center disc with logo dot to anchor the cluster */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-white/40 shadow-[0_0_60px_20px_rgba(255,255,255,0.25)]" />
        </div>
      </div>

      {/* Glass index strip docked into the hero */}
      {indices.length > 0 && (
        <div className="relative z-10 mt-10 md:mt-14 px-4 md:px-6 pb-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-md">
            {indices.slice(0, 4).map((idx) => {
              const up = idx.changePct > 0;
              const down = idx.changePct < 0;
              const tone = up
                ? "text-[#34d399]"
                : down
                  ? "text-[#f87171]"
                  : "text-white/60";
              return (
                <div
                  key={idx.ticker}
                  className="bg-[#0b1228]/60 px-5 py-5 flex flex-col gap-1"
                >
                  <span className="text-[11px] font-medium tracking-[0.08em] uppercase text-white/50">
                    {idx.name || idx.ticker}
                  </span>
                  <span className="text-[22px] md:text-[24px] font-semibold text-white tabular-nums tracking-tight">
                    {fmtPrice(idx.price)}
                  </span>
                  <span className={`text-[12px] font-semibold tabular-nums ${tone}`}>
                    {up ? "▲" : down ? "▼" : "•"} {fmtPct(idx.changePct)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
