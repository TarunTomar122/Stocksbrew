"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
  if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return v.toFixed(2);
}

function fmtPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

export function HeroSection({ score, tone, color, indices }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  return (
    <section className="relative w-full overflow-hidden rounded-2xl bg-[#0d0e12] border border-white/5">
      <div className="absolute inset-0 bg-gradient-to-br from-[#1a1035] via-[#0f1120] to-[#0d0e12]" />
      <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-primary/10 blur-[120px]" />
      <div className="absolute bottom-0 left-0 w-72 h-72 rounded-full bg-[#8B5CF6]/10 blur-[100px]" />

      <div className="relative flex flex-col gap-8 px-8 py-10 lg:px-10 lg:py-12">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-8">
          <div className="flex flex-col gap-3 max-w-xl">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 text-[10px] font-bold tracking-[0.18em] uppercase bg-primary/20 text-[#d0bcff] rounded-full">
                Market Intelligence
              </span>
              <span className="text-[10px] font-semibold text-[#9d97b0]">
                Real-time precision analytics
              </span>
            </div>

            <h1 className="font-display text-3xl lg:text-4xl font-black tracking-tight text-white leading-tight">
              Know the market before the market knows itself.
            </h1>

            <p className="text-[13px] text-[#9d97b0] leading-relaxed max-w-xl">
              Track institutional flows, sentiment shifts, and sector rotations across US & Indian markets.
            </p>

            <div className="flex items-center gap-3">
              <a
                href="/heat"
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary text-white text-[12px] font-bold transition-opacity hover:opacity-90"
              >
                <span className="text-[14px]">✦</span>
                <span>Explore Heat</span>
              </a>
              <a
                href="/news"
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/[0.06] border border-white/10 text-white text-[12px] font-bold transition-colors hover:border-primary hover:text-primary"
              >
                Latest News
              </a>
              <a
                href="/screens"
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/[0.06] border border-white/10 text-white text-[12px] font-bold transition-colors hover:border-primary hover:text-primary"
              >
                Thematic Screens
              </a>
            </div>
          </div>

          <div className="flex flex-col gap-1 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold tracking-[0.12em] uppercase text-[#9d97b0]">
                Market Mood
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-[#9d97b0] font-semibold">
                {score < 25 ? "Very Cautious" : score < 45 ? "Cautious" : score < 55 ? "Balanced" : score < 75 ? "Confident" : "Overheated"}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span
                className="text-[44px] font-black tracking-[-0.02em] tabular-nums leading-none"
                style={{ color }}
              >
                {Math.round(score)}
              </span>
              <span
                className="text-[12px] font-bold tracking-[0.15em] uppercase"
                style={{ color }}
              >
                {tone}
              </span>
            </div>
            <div className="mt-2 w-48 h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${score}%`,
                  background: score < 45
                    ? "linear-gradient(90deg, #F97316, #fb923c)"
                    : score < 55
                      ? "linear-gradient(90deg, #FACC15, #fde047)"
                      : "linear-gradient(90deg, #8B5CF6, #a78bfa)"
                }}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="relative max-w-lg">
            <span className="material-symbols-outlined pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base text-[#9d97b0]">
              search
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && query.trim()) {
                  router.push(`/stock/${encodeURIComponent(query.trim().toUpperCase())}`);
                }
              }}
              placeholder="Search tickers, sectors, news…"
              className="w-full bg-white/[0.06] border border-white/10 rounded-full py-3 pl-11 pr-4 text-[14px] text-white placeholder:text-[#9d97b0] outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/25"
            />
          </div>

          {indices.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {indices.map((idx) => {
                const up = idx.changePct > 0;
                const down = idx.changePct < 0;
                const idxColor = up ? "#8B5CF6" : down ? "#F97316" : "#9d97b0";
                return (
                  <div
                    key={idx.ticker}
                    className="flex flex-col gap-1 rounded-xl bg-white/[0.04] border border-white/[0.06] p-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-white tracking-tight">
                        {idx.ticker}
                      </span>
                      <span
                        className="text-[10px] font-bold tabular-nums"
                        style={{ color: idxColor }}
                      >
                        {up ? "▲" : down ? "▼" : "•"} {fmtPct(idx.changePct)}
                      </span>
                    </div>
                    <span className="text-[10px] text-[#9d97b0] truncate">
                      {idx.name}
                    </span>
                    <span className="text-[16px] font-bold text-white tabular-nums leading-tight">
                      {fmtPrice(idx.price)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}