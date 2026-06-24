"use client";

import { useState } from "react";
import type { StockIntelPro } from "@/lib/types";

const EMOJI: Record<string, string> = { growth: "🌱", momentum: "🚀", valuation: "🏷️", quality: "🏛️" };
const KEYS = ["growth", "momentum", "valuation", "quality"] as const;
type Key = (typeof KEYS)[number];

function scoreColor(v: number) {
  return v >= 85 ? "var(--signal-bullish)" : v >= 60 ? "var(--signal-neutral)" : "var(--signal-bearish)";
}

export function FundamentalsBreakdown({ pillars }: { pillars: StockIntelPro["pillars"] }) {
  const [active, setActive] = useState<Key>("growth");
  const p = pillars[active];
  const metrics = (p?.metrics ?? []).filter((m) => m.value != null || m.summary);

  return (
    <div>
      {/* pillar tabs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {KEYS.map((key) => {
          const pl = pillars[key];
          const on = key === active;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActive(key)}
              className="inset p-3.5 text-left transition-all"
              style={on ? { boxShadow: "inset 0 0 0 1.5px var(--on-surface)" } : undefined}
            >
              <div className="flex items-center justify-between">
                <span className="text-[14px]">{EMOJI[key]}</span>
                <span className="font-mono text-[15px] font-bold tabular-nums text-on-surface">{pl.score}</span>
              </div>
              <p className="mt-1 font-mono text-[11px] capitalize text-on-surface-variant">{key}</p>
              <div className="mt-2 h-1.5 rounded" style={{ background: "var(--background)" }}>
                <div className="h-1.5 rounded" style={{ width: `${Math.max(0, Math.min(100, pl.score))}%`, background: scoreColor(pl.score) }} />
              </div>
            </button>
          );
        })}
      </div>

      {/* selected pillar's metrics */}
      {metrics.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-on-surface-variant">{EMOJI[active]} {active} · {p.verdict}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {metrics.map((m, i) => {
              const tone = m.score == null ? "var(--on-surface)" : m.score >= 70 ? "var(--signal-bullish)" : m.score <= 40 ? "var(--signal-bearish)" : "var(--signal-neutral)";
              return (
                <div key={i} className="inset p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[12px] text-on-surface">{m.label}</span>
                    {m.value != null && <span className="font-mono text-[13px] font-bold tabular-nums" style={{ color: tone }}>{Number.isInteger(m.value) ? m.value : m.value.toFixed(1)}</span>}
                  </div>
                  {m.summary && <p className="mt-0.5 text-[11px] leading-snug text-on-surface-variant">{m.summary}</p>}
                  {m.benchmark != null && m.benchmark_label && <p className="mt-0.5 font-mono text-[10px] text-on-surface-variant">{m.benchmark_label}: {Number.isInteger(m.benchmark) ? m.benchmark : m.benchmark.toFixed(1)}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
