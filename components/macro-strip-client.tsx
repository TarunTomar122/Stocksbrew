"use client";

import { useCallback, useState } from "react";
import { createPortal } from "react-dom";

import type { GlobalCue, MarketOverview } from "@/lib/api-types";
import { DashboardCard, formatPctCompact, pctClass } from "./primitives";

type MacroCueConfig = {
  label: string;
  unit: string;
  cue: GlobalCue;
  subtitle: string;
  risingMeaning: string;
  fallingMeaning: string;
};

const CUES = (view: MarketOverview): MacroCueConfig[] => [
  {
    label: "Oil (WTI)",
    unit: "$",
    cue: view.globalCues.oil,
    subtitle: "Price of a barrel of crude oil",
    risingMeaning: "When oil goes up, everything gets more expensive — shipping, manufacturing, fuel. Good for energy stocks, but bad for most others. Also makes inflation worse.",
    fallingMeaning: "Cheaper oil means lower costs for businesses and consumers. Usually a tailwind for the market, but energy stocks take a hit.",
  },
  {
    label: "Gold",
    unit: "$",
    cue: view.globalCues.gold,
    subtitle: 'The classic "something\'s wrong" asset',
    risingMeaning: "People buy gold when they're scared — of inflation, a crash, or just uncertainty. Gold going up usually means investors are nervous about stocks.",
    fallingMeaning: "Gold falling means people feel confident enough to put money into stocks instead. Generally a good sign for equity markets.",
  },
  {
    label: "DXY",
    unit: "",
    cue: view.globalCues.dxy,
    subtitle: "How strong the US dollar is vs. other currencies",
    risingMeaning: "A stronger dollar makes US goods expensive abroad and hurts big companies that earn money globally. Also bad for commodities like oil and gold.",
    fallingMeaning: "A weaker dollar helps US companies sell more overseas and boosts commodities. Generally good for global stocks.",
  },
  {
    label: "VIX",
    unit: "",
    cue: view.globalCues.vix,
    subtitle: 'The market\'s "fear meter" — how nervous traders are right now',
    risingMeaning: "VIX going up means traders are buying protection, expecting big swings. Below 15 is calm. Above 30 is outright fear — expect choppy markets.",
    fallingMeaning: "VIX falling means the market is settling down and traders feel more comfortable. Lower fear usually means steadier prices.",
  },
  {
    label: "US 10Y",
    unit: "% ",
    cue: view.globalCues.usTenYear,
    subtitle: "The interest rate the US government pays to borrow money for 10 years",
    risingMeaning: "Higher rates mean borrowing costs more for everyone — companies, mortgages, everything. Growth and tech stocks especially dislike this since their future profits are worth less today.",
    fallingMeaning: "Lower rates are like fuel for growth stocks and real estate. Borrowing gets cheaper, money flows back into equities.",
  },
];

type TooltipState = {
  visible: boolean;
  x: number;
  y: number;
  label: string;
  meaning: string;
  formattedValue: string;
  change: number;
  isUp: boolean;
};

function CursorTooltip({ tip }: { tip: TooltipState }) {
  if (!tip.visible) return null;

  const OFFSET = 16;
  // Estimate tooltip width ~288px, height ~130px; flip left/up near edges
  const style: React.CSSProperties = {
    position: "fixed",
    left: tip.x + OFFSET,
    top: tip.y + OFFSET,
    zIndex: 9999,
    pointerEvents: "none",
  };

  return createPortal(
    <div style={style} className="w-72 rounded-[10px] border border-[#252E42] bg-[#0D1219] p-4 shadow-2xl">
      <p
        className="mb-2 text-[10px] font-bold uppercase tracking-wider"
        style={{ color: tip.isUp ? "#22C55E" : "#EF4444" }}
      >
        {tip.isUp ? "▲" : "▼"} {tip.label} today
      </p>
      <p className="text-[12px] leading-relaxed text-[#F5F6F8]/85">{tip.meaning}</p>
      <div className="mt-3 border-t border-[#1F2738] pt-2.5 font-mono text-[11px] tabular-nums text-[#8C94A8]">
        {tip.formattedValue}
        {" · "}
        <span className={pctClass(tip.change)}>
          {tip.isUp ? "+" : ""}{tip.change.toFixed(2)}% today
        </span>
      </div>
    </div>,
    document.body,
  );
}

export function MacroStripCard({ view }: { view: MarketOverview }) {
  const [tip, setTip] = useState<TooltipState>({
    visible: false, x: 0, y: 0,
    label: "", meaning: "", formattedValue: "", change: 0, isUp: true,
  });

  const showTip = useCallback((
    e: React.MouseEvent,
    cfg: MacroCueConfig,
  ) => {
    const isUp = cfg.cue.change >= 0;
    const formattedValue = cfg.unit === "% "
      ? `${cfg.cue.value.toFixed(2)}%`
      : `${cfg.unit}${cfg.cue.value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
    setTip({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      label: cfg.label,
      meaning: isUp ? cfg.risingMeaning : cfg.fallingMeaning,
      formattedValue,
      change: cfg.cue.change,
      isUp,
    });
  }, []);

  const moveTip = useCallback((e: React.MouseEvent) => {
    setTip((prev) => prev.visible ? { ...prev, x: e.clientX, y: e.clientY } : prev);
  }, []);

  const hideTip = useCallback(() => {
    setTip((prev) => ({ ...prev, visible: false }));
  }, []);

  const cues = CUES(view);

  return (
    <>
      <CursorTooltip tip={tip} />
      <DashboardCard title="Macro backdrop" eyebrow="Hover any row to learn more" padding="none">
        <div className="grid grid-cols-1 divide-y divide-[#1F2738]">
          {cues.map((cfg) => {
            const isUp = cfg.cue.change >= 0;
            const formattedValue = cfg.unit === "% "
              ? `${cfg.cue.value.toFixed(2)}%`
              : `${cfg.unit}${cfg.cue.value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
            return (
              <div
                key={cfg.label}
                className="flex cursor-default items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-[#1A2130]"
                onMouseEnter={(e) => showTip(e, cfg)}
                onMouseMove={moveTip}
                onMouseLeave={hideTip}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium text-[#F5F6F8]">{cfg.label}</p>
                  <p className="text-[10px] text-[#555E75]">{cfg.subtitle}</p>
                </div>
                <div className="flex flex-col items-end">
                  <span className="font-mono text-[13px] font-semibold tabular-nums text-[#F5F6F8]">
                    {formattedValue}
                  </span>
                  <span className={`font-mono text-[11px] tabular-nums ${pctClass(cfg.cue.change)}`}>
                    {isUp ? "▲" : "▼"} {formatPctCompact(Math.abs(cfg.cue.change))}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </DashboardCard>
    </>
  );
}
