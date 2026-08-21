"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";

import { StockLogo } from "@/components/stock-logo";
import { captureEvent } from "@/lib/posthog";

export type AgentDemoStock = {
  ticker: string;
  name: string;
  logoUrl: string | null;
  currency: string;
  price: number | null;
  dayChangePct: number | null;
  headline: string | null;
  thesis: string | null;
  changed: string | null;
  matters: string | null;
  call: string | null;
  drivers: string[];
  risks: string[];
  peTtm: number | null;
  targetUpsidePct: number | null;
  revenueGrowthPct: number | null;
  rsi: number | null;
  score: number | null;
  asOf: string | null;
};

export type AgentDemoCompareStock = {
  ticker: string;
  name: string;
  logoUrl: string | null;
  price: number | null;
  peTtm: number | null;
  targetPrice: number | null;
  overall: number | null;
  growth: number | null;
  valuation: number | null;
  momentum: number | null;
};

export type AgentDemoMarket = {
  title: string | null;
  body: string | null;
  sentimentLabel: string | null;
  sentimentScore: number | null;
  macro: Array<{ label: string; value: number; changePct: number }>;
  sectors: Array<{ sector: string; flowPct: number }>;
  asOf: string | null;
};

export type AgentsDemoData = {
  stock: AgentDemoStock;
  comparison: AgentDemoCompareStock[];
  market: AgentDemoMarket;
};

type DemoMode = "research" | "compare" | "market";

const PROMPTS: Record<DemoMode, { label: string; prompt: string; tool: string }> = {
  research: {
    label: "Spend $1,000",
    prompt: "I have $1,000. Should I buy NVDA or AMD?",
    tool: "Compared NVDA and AMD using current stock research",
  },
  compare: {
    label: "Compare all three",
    prompt: "Compare NVDA, AMD and AVGO. Where is the strongest setup, and what am I paying for it?",
    tool: "Compared NVDA, AMD and AVGO",
  },
  market: {
    label: "Explain today",
    prompt: "My tech stocks are red. Is this company news or the whole market?",
    tool: "Checked the US market brief and NVIDIA's current move",
  },
};

function money(value: number | null, currency = "USD"): string {
  if (value === null) return "Not enough current evidence";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: value >= 100 ? 0 : 2,
  }).format(value);
}

function metric(value: number | null, suffix = ""): string {
  return value === null ? "Not enough current evidence" : `${value.toFixed(1)}${suffix}`;
}

function dateLabel(value: string | null): string {
  if (!value) return "Freshness unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Freshness unavailable"
    : `Stocksbrew data as of ${date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
}

function ToolCall({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5 flex items-center gap-2 font-mono text-[10px] text-oa-muted-fg">
      <span className="rounded bg-oa-primary/10 px-1.5 py-1 font-medium text-oa-primary">Stocksbrew</span>
      <span className="min-w-0 truncate">{children}</span>
    </div>
  );
}

function ResearchAnswer({ stock, stocks }: { stock: AgentDemoStock; stocks: AgentDemoCompareStock[] }) {
  const amd = stocks.find((item) => item.ticker === "AMD");
  const nvdaScore = stock.score ?? stocks.find((item) => item.ticker === "NVDA")?.overall ?? null;
  const preferNvda = amd?.overall === null || amd?.overall === undefined || (nvdaScore !== null && nvdaScore >= amd.overall);
  const preferred = preferNvda ? "NVDA" : "AMD";
  const alternative = preferNvda ? "AMD" : "NVDA";

  return (
    <div className="mt-5 space-y-4">
      <p className="text-[16px] font-medium">I&apos;d lean {preferred}, but I wouldn&apos;t put the full $1,000 in today.</p>
      <p>{preferred} has the stronger current Stocksbrew score. {alternative} may still be the better value, so this is a quality-versus-price decision rather than an obvious all-in bet.</p>
      <p><strong>How I&apos;d do it:</strong> $500 now, then keep $500 for a pullback or the next earnings update.</p>
      <p><strong>What would change my mind:</strong> {preferred} losing its growth advantage, or {alternative} closing the quality gap while staying cheaper.</p>
    </div>
  );
}

function CompareAnswer({ stocks }: { stocks: AgentDemoCompareStock[] }) {
  const scoreLeader = useMemo(
    () => [...stocks].filter((stock) => stock.overall !== null).sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1))[0],
    [stocks],
  );
  const valueLeader = useMemo(
    () => [...stocks].filter((stock) => stock.peTtm !== null && (stock.peTtm ?? 0) > 0).sort((a, b) => (a.peTtm ?? Infinity) - (b.peTtm ?? Infinity))[0],
    [stocks],
  );

  if (!stocks.length) return <p className="mt-5">Not enough current evidence to compare these stocks.</p>;

  return (
    <div className="mt-5 space-y-4">
      <p className="text-[16px] font-medium">{scoreLeader ? `${scoreLeader.ticker} has the strongest setup right now.` : "Not enough current evidence to name a leader."}</p>
      <p>{valueLeader ? `${valueLeader.ticker} is the cheapest on available earnings, so it deserves a look if valuation matters more than the highest overall score.` : "Not enough current evidence to compare valuation."}</p>
      <div className="overflow-x-auto border-y border-oa-border">
        <table className="w-full min-w-[520px] text-left text-[11px]">
          <thead className="text-oa-muted-fg"><tr><th className="py-2.5 font-medium">Stock</th><th className="py-2.5 font-medium">Price</th><th className="py-2.5 font-medium">P/E</th><th className="py-2.5 font-medium">Stocksbrew score</th></tr></thead>
          <tbody className="divide-y divide-oa-border">
            {stocks.map((stock) => (
              <tr key={stock.ticker}>
                <td className="py-3"><span className="flex items-center gap-2"><StockLogo ticker={stock.ticker} logoUrl={stock.logoUrl} size={24} /><span className="font-medium">{stock.ticker}</span></span></td>
                <td className="py-3">{money(stock.price)}</td>
                <td className="py-3">{metric(stock.peTtm, "x")}</td>
                <td className="py-3 font-medium">{metric(stock.overall)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p><strong>The decision hinge:</strong> choose the leader for business quality; choose the cheaper name only if you believe its execution can catch up.</p>
    </div>
  );
}

function MarketAnswer({ market, stock }: { market: AgentDemoMarket; stock: AgentDemoStock }) {
  const nasdaq = market.macro.find((item) => item.label.toLowerCase().includes("nasdaq"));
  const isDiverging = stock.dayChangePct !== null && stock.dayChangePct < 0 && nasdaq && nasdaq.changePct >= 0;

  return (
    <div className="mt-5 space-y-4">
      <p className="text-[16px] font-medium">{isDiverging ? "This does not look like a market-wide tech selloff." : "The broader market may be contributing to the move."}</p>
      {stock.dayChangePct !== null && nasdaq ? <p>NVDA is {Math.abs(stock.dayChangePct).toFixed(2)}% {stock.dayChangePct >= 0 ? "higher" : "lower"} while the Nasdaq is {Math.abs(nasdaq.changePct).toFixed(2)}% {nasdaq.changePct >= 0 ? "higher" : "lower"}. {isDiverging ? "That points to stock-specific pressure." : "The two are moving in the same direction."}</p> : <p>Not enough current evidence to separate the stock move from the market.</p>}
      <p><strong>What I&apos;d check next:</strong> NVIDIA-specific news, earnings and valuation. The index {isDiverging ? "isn't confirming the drop" : "does not rule out a broader move"}.</p>
    </div>
  );
}

export function AgentsPageDemo({ data }: { data: AgentsDemoData }) {
  const [mode, setMode] = useState<DemoMode>("research");
  const active = PROMPTS[mode];
  const freshness = mode === "market" ? data.market.asOf : data.stock.asOf;

  useEffect(() => {
    captureEvent("agents_page_viewed", { surface: "agents" });
  }, []);

  function selectMode(next: DemoMode) {
    setMode(next);
    captureEvent("agents_demo_interaction", { mode: next });
  }

  return (
    <div className="overflow-hidden rounded-[1.5rem] border border-oa-border bg-oa-card shadow-[0_24px_70px_-42px_rgba(0,0,0,0.55)]">
      <div className="flex items-center justify-between border-b border-oa-border px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2.5">
          <Image src="/agent-logos/claude-code.svg" alt="" width={20} height={20} />
          <span className="text-[12px] font-medium">Claude</span>
          <span className="text-[11px] text-oa-muted-fg">connected to Stocksbrew</span>
        </div>
        <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-signal-bullish">OAuth</span>
      </div>

      <div className="px-4 py-5 sm:px-7 sm:py-7">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Real Stocksbrew agent examples">
          {(Object.keys(PROMPTS) as DemoMode[]).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={mode === key}
              onClick={() => selectMode(key)}
              className={`rounded-full border px-3 py-1.5 text-[10px] font-medium transition-colors ${mode === key ? "border-oa-primary bg-oa-primary text-white" : "border-oa-border text-oa-muted-fg hover:text-oa-fg"}`}
            >
              {PROMPTS[key].label}
            </button>
          ))}
        </div>

        <div className="mt-7 ml-auto max-w-[92%] rounded-2xl rounded-tr-md bg-oa-accent px-4 py-3 text-[13px] leading-relaxed sm:max-w-[86%] sm:px-5 sm:py-4 sm:text-[14px]">
          {active.prompt}
        </div>

        <div className="mt-7 text-[13px] leading-[1.65] sm:text-[14px]">
          <ToolCall>{active.tool}</ToolCall>
          {mode === "research" ? <ResearchAnswer stock={data.stock} stocks={data.comparison} /> : null}
          {mode === "compare" ? <CompareAnswer stocks={data.comparison} /> : null}
          {mode === "market" ? <MarketAnswer market={data.market} stock={data.stock} /> : null}
        </div>

        <p className="mt-6 border-t border-oa-border pt-4 text-[10px] text-oa-muted-fg">{dateLabel(freshness)} · informational only</p>
      </div>
    </div>
  );
}
