import type { Metadata } from "next";
import Link from "next/link";

import { AgentClientLogos } from "@/components/agent-client-logos";
import { AgentSetupPrompt } from "@/components/agent-setup-prompt";
import {
  AgentsPageDemo,
  type AgentDemoStock,
  type AgentsDemoData,
} from "@/components/agents-page-demo";
import { AnimatedIcon } from "@/components/animated-icon";
import { StockLogo } from "@/components/stock-logo";
import { AGENT_DAILY_CALL_LIMIT } from "@/lib/agent-access-config";
import {
  getAgentRadarChanges,
  getMarketAgentBrief,
  getStockAgentDetail,
} from "@/lib/agent-intelligence";
import { getSessionUser } from "@/lib/auth-server";
import { compareStocks } from "@/lib/compare-stocks";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

export const metadata: Metadata = {
  title: "Stocksbrew for Agents | Stock Intelligence for Claude, Codex and Cursor",
  description: "Give Claude, Codex, Cursor or your own AI agent structured stock intelligence, financials, valuation, earnings, analyst context, news, technicals, market context and your Watchlist.",
  keywords: [
    "stock market MCP server",
    "AI Stock Agent for Research, Watchlist, and Alerts",
    "financial data MCP",
    "AI stock research",
    "stock market data for AI agents",
    "Claude stock market MCP",
    "Claude Code stock analysis",
    "Codex stock market data",
    "Cursor stock research",
    "stock API for AI agents",
    "financial data for AI agents",
    "Let your agent keep up with your stocks",
    "Research any stock",
    "Hermes stock research",
    "OpenClaw stock research",
    "Telegram stock research bot",
  ],
  alternates: { canonical: "/agents" },
  openGraph: {
    title: "Give your AI the stock-market context it is missing",
    description: "Connect Stocksbrew once and give your agent current stock intelligence, market context and your Watchlist through MCP or REST.",
    url: "https://www.stocksbrew.online/agents",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Stocksbrew for AI agents",
    description: "Current stock intelligence for Claude, Codex, Cursor and your own agents.",
  },
};

const FAQS = [
  ["What does Stocksbrew give my agent?", "Fundamentals, financial history, valuation, earnings, price history, analyst context, news, technicals, market context and your Watchlist where available."],
  ["Why not just let my agent search the web?", "Web search is useful for finding pages. Stocksbrew gives the agent one current, consistent stock view and keeps missing evidence explicit."],
  ["What happens when evidence is missing?", "The response says not enough current evidence instead of filling the gap with an invented thesis."],
  ["What agents can I use?", "Any compatible MCP client using OAuth, including Claude Code, Codex, Cursor, Hermes and OpenClaw. Custom agents can use the REST API."],
  ["Can Stocksbrew place trades?", "No. Stocksbrew is research infrastructure. It cannot place trades or access a brokerage."],
  ["Is my Watchlist available to my agent?", "Yes, with the Watchlist permission. Your agent can read tracked stocks, holdings context, alerts and changes. It should ask before making a change."],
  ["Is this real-time market data?", "Prices and third-party figures can be delayed. Responses include the freshness information Stocksbrew has for each source."],
  ["What does it cost?", `Stocksbrew Pro is $9 per month and includes ${AGENT_DAILY_CALL_LIMIT} agent calls per UTC day.`],
  ["Is there an API?", "Yes. Use remote MCP with OAuth for compatible agents, or the REST API with a personal token for custom integrations."],
] as const;

type StockShowcase = {
  scores: Array<{ label: string; value: number | null }>;
  financialHistory: Array<{ period: string; revenue: number | null; operatingMarginPct: number | null }>;
  valuation: Array<{ label: string; value: number | null; suffix: string }>;
  analystLabel: string | null;
  analystCount: number | null;
  businessQuestion: { question: string; answer: string } | null;
};

type WatchlistPreview = {
  headline: string;
  body: string;
  asOf: string | null;
  items: Array<{
    ticker: string;
    headline: string;
    changed: string;
    matters: string;
  }>;
};

function JsonLd() {
  return (
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "SoftwareApplication", name: "Stocksbrew for AI Agents", applicationCategory: "FinanceApplication", operatingSystem: "Web", url: "https://www.stocksbrew.online/agents", description: metadata.description, offers: { "@type": "Offer", price: "9", priceCurrency: "USD" } },
        { "@type": "WebAPI", name: "Stocksbrew Agent API", url: "https://www.stocksbrew.online/developers", documentation: "https://www.stocksbrew.online/developers", description: "Stock intelligence, market context, Watchlist changes and alerts through MCP and REST." },
        { "@type": "FAQPage", mainEntity: FAQS.map(([question, answer]) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) },
      ],
    }) }} />
  );
}

function stringsFrom(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    if (typeof entry === "string") return entry;
    if (!entry || typeof entry !== "object") return null;
    const record = entry as Record<string, unknown>;
    const detail = record.detail ?? record.risk ?? record.text ?? record.body ?? record.description;
    const label = record.label ?? record.title ?? record.event;
    if (typeof detail === "string" && typeof label === "string" && detail !== label) {
      return detail.toLowerCase().includes(label.toLowerCase()) ? detail : `${label}: ${detail}`;
    }
    if (typeof detail === "string") return detail;
    return typeof label === "string" ? label : null;
  }).filter((entry): entry is string => Boolean(entry)).slice(0, 3);
}

function money(value: number | null, currency = "USD"): string {
  if (value === null) return "Not enough current evidence";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: value >= 100 ? 0 : 2 }).format(value);
}

function compactMoney(value: number | null): string {
  if (value === null) return "Not enough current evidence";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function number(value: number | null, suffix = ""): string {
  return value === null ? "Not enough current evidence" : `${value.toFixed(1)}${suffix}`;
}

function SectionIntro({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="max-w-3xl text-balance text-[32px] font-semibold leading-[1.08] tracking-[-0.045em] sm:text-[46px]">{title}</h2>
      <p className="mt-5 max-w-2xl text-pretty text-[15px] leading-relaxed text-on-surface-variant sm:text-[16px]">{description}</p>
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="grid grid-cols-[90px_1fr_34px] items-center gap-3 py-2 text-[11px]">
      <span className="text-on-surface-variant">{label}</span>
      <span className="h-1.5 overflow-hidden rounded-full bg-surface-container"><span className="block h-full rounded-full bg-landing-brand" style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }} /></span>
      <span className="text-right font-semibold">{value === null ? "N/A" : Math.round(value)}</span>
    </div>
  );
}

function StockResearchView({ stock, showcase }: { stock: AgentDemoStock; showcase: StockShowcase }) {
  const maxRevenue = Math.max(1, ...showcase.financialHistory.map((item) => item.revenue ?? 0));
  return (
    <div className="mt-10 overflow-hidden rounded-[1.5rem] border border-outline-variant bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-outline-variant px-5 py-5 sm:px-7">
        <div className="flex items-center gap-3">
          <StockLogo ticker={stock.ticker} logoUrl={stock.logoUrl} size={42} eager />
          <div><p className="text-[17px] font-semibold">{stock.name}</p><p className="mt-0.5 text-[11px] text-on-surface-variant">{stock.ticker} · live Stocksbrew stock detail</p></div>
        </div>
        <div className="text-right"><p className="font-mono text-[22px] font-semibold">{money(stock.price, stock.currency)}</p><p className={`text-[11px] ${stock.dayChangePct !== null && stock.dayChangePct < 0 ? "text-signal-bearish" : "text-signal-bullish"}`}>{stock.dayChangePct === null ? "Change unavailable" : `${stock.dayChangePct >= 0 ? "+" : ""}${stock.dayChangePct.toFixed(2)}% today`}</p></div>
      </div>

      <div className="grid lg:grid-cols-[1.15fr_0.85fr]">
        <div className="p-5 sm:p-7 lg:border-r lg:border-outline-variant">
          <div className="flex items-center gap-2"><AnimatedIcon name="corporate_fare" size={18} className="text-landing-brand" /><h3 className="text-[14px] font-semibold">Business and current read</h3></div>
          <p className="mt-5 text-[17px] font-medium leading-relaxed">{stock.headline || "Not enough current evidence for a current headline."}</p>
          {stock.thesis && stock.thesis !== stock.headline ? <p className="mt-4 text-[13px] leading-relaxed text-on-surface-variant">{stock.thesis}</p> : null}
          <div className="mt-6 divide-y divide-on-surface/15 border-y border-on-surface/15 text-[13px] leading-relaxed">
            <div className="grid gap-2 py-5 sm:grid-cols-[140px_1fr]"><strong>What changed</strong><span className="font-medium text-on-surface-variant">{stock.changed || "Not enough current evidence"}</span></div>
            <div className="grid gap-2 py-5 sm:grid-cols-[140px_1fr]"><strong>What supports it</strong><span className="font-medium text-on-surface-variant">{stock.drivers[0] || "Not enough current evidence"}</span></div>
            <div className="grid gap-2 py-5 sm:grid-cols-[140px_1fr]"><strong>What could hurt</strong><span className="font-medium text-on-surface-variant">{stock.risks[0] || "Not enough current evidence"}</span></div>
          </div>
        </div>

        <div className="border-t border-outline-variant p-5 sm:p-7 lg:border-t-0">
          <div className="flex items-center gap-2"><AnimatedIcon name="analytics" size={18} className="text-landing-brand" /><h3 className="text-[14px] font-semibold">Current numbers</h3></div>
          <dl className="mt-4 divide-y divide-outline-variant text-[12px]">
            {showcase.valuation.map((item) => <div key={item.label} className="flex items-center justify-between gap-4 py-3"><dt className="text-on-surface-variant">{item.label}</dt><dd className="font-semibold">{number(item.value, item.suffix)}</dd></div>)}
            <div className="flex items-center justify-between gap-4 py-3"><dt className="text-on-surface-variant">Analyst view</dt><dd className="font-semibold">{showcase.analystLabel || "Not enough current evidence"}{showcase.analystCount ? ` · ${showcase.analystCount}` : ""}</dd></div>
          </dl>
          <div className="mt-6 flex items-center gap-2"><AnimatedIcon name="query_stats" size={18} className="text-landing-brand" /><h3 className="text-[14px] font-semibold">Stocksbrew scores</h3></div>
          <div className="mt-3">{showcase.scores.map((item) => <ScoreBar key={item.label} {...item} />)}</div>
        </div>
      </div>

      <div className="grid border-t border-outline-variant lg:grid-cols-2">
        <div className="p-5 sm:p-7 lg:border-r lg:border-outline-variant">
          <div className="flex items-center gap-2"><AnimatedIcon name="show_chart" size={18} className="text-landing-brand" /><h3 className="text-[14px] font-semibold">Revenue history</h3></div>
          <div className="mt-5 space-y-4">
            {showcase.financialHistory.length ? showcase.financialHistory.map((item) => (
              <div key={item.period} className="grid grid-cols-[54px_1fr_auto] items-center gap-3 text-[11px]">
                <span className="text-on-surface-variant">{item.period}</span>
                <span className="h-2 overflow-hidden rounded-full bg-surface-container"><span className="block h-full rounded-full bg-signal-bullish" style={{ width: `${Math.max(8, ((item.revenue ?? 0) / maxRevenue) * 100)}%` }} /></span>
                <span className="font-semibold">{compactMoney(item.revenue)}</span>
              </div>
            )) : <p className="text-[12px] text-on-surface-variant">Not enough current evidence.</p>}
          </div>
        </div>
        <div className="border-t border-outline-variant p-5 sm:p-7 lg:border-t-0">
          <div className="flex items-center gap-2"><AnimatedIcon name="psychology" size={18} className="text-landing-brand" /><h3 className="text-[14px] font-semibold">A business question</h3></div>
          {showcase.businessQuestion ? <><p className="mt-5 text-[14px] font-semibold leading-relaxed">{showcase.businessQuestion.question}</p><p className="mt-3 text-[12px] leading-relaxed text-on-surface-variant">{showcase.businessQuestion.answer}</p></> : <p className="mt-5 text-[12px] text-on-surface-variant">Not enough current evidence.</p>}
        </div>
      </div>
    </div>
  );
}

function WatchlistView({ preview }: { preview: WatchlistPreview }) {
  return (
    <div className="mt-10 overflow-hidden rounded-[1.5rem] border border-outline-variant bg-surface">
      <div className="border-b border-outline-variant px-5 py-5 sm:px-7"><p className="font-mono text-[10px] text-landing-brand">get_radar_changes()</p><p className="mt-4 text-[18px] font-semibold">{preview.headline}</p><p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-on-surface-variant">{preview.body}</p></div>
      <div className="divide-y divide-outline-variant">
        {preview.items.map((item) => <div key={`${item.ticker}-${item.headline}`} className="grid gap-4 px-5 py-5 sm:grid-cols-[150px_1fr] sm:px-7"><div className="flex items-center gap-3"><StockLogo ticker={item.ticker} size={32} /><strong>{item.ticker}</strong></div><div><p className="text-[13px] font-semibold">{item.headline}</p><p className="mt-2 text-[12px] leading-relaxed text-on-surface-variant">{item.changed}</p><p className="mt-2 text-[12px] leading-relaxed"><strong>Why it matters:</strong> {item.matters}</p></div></div>)}
      </div>
      <p className="border-t border-outline-variant px-5 py-4 text-[10px] text-on-surface-variant sm:px-7">Actual signed-in Watchlist changes · {preview.asOf || "freshness unavailable"}</p>
    </div>
  );
}

export default async function AgentsPage() {
  const session = await getSessionUser();
  const [userDoc, detail, comparison, marketBrief, radarChanges] = await Promise.all([
    session ? getUserDoc(session.uid).catch(() => null) : Promise.resolve(null),
    getStockAgentDetail({ ticker: "NVDA" }).catch(() => null),
    compareStocks(["NVDA", "AMD", "AVGO"]).catch(() => ({ stocks: [], missing_tickers: [] })),
    getMarketAgentBrief({ market: "US" }).catch(() => null),
    session ? getAgentRadarChanges(session.uid).catch(() => null) : Promise.resolve(null),
  ]);
  const subscribed = resolveIsSubscribed(userDoc);
  const intelligence = detail?.stocksbrew_intelligence;
  const facts = detail?.stock_page.source_documents.facts;
  const call = intelligence?.call?.action?.label ?? intelligence?.call?.stance ?? null;
  const comparedNvda = comparison.stocks.find((item) => item.ticker === "NVDA");
  const revenueGrowth = detail?.fundamentals.revenue_growth_yoy_pct ?? null;
  const dayChange = detail?.market_data.day_change_pct ?? null;
  const roic = facts?.quality?.roic_pct ?? null;
  const priceToSales = facts?.valuation?.price_to_sales ?? null;
  const priceToFcf = facts?.valuation?.price_to_fcf ?? null;
  const groundedChanged = dayChange !== null && revenueGrowth !== null
    ? `Shares are ${Math.abs(dayChange).toFixed(2)}% ${dayChange >= 0 ? "higher" : "lower"} today, while revenue is still growing ${revenueGrowth.toFixed(1)}% year over year.`
    : null;
  const groundedSupport = revenueGrowth !== null && roic !== null
    ? `Revenue is growing ${revenueGrowth.toFixed(1)}% year over year and ROIC is ${roic.toFixed(1)}%, showing strong growth and capital efficiency.`
    : null;
  const groundedRisk = priceToSales !== null && priceToFcf !== null
    ? `At ${priceToSales.toFixed(1)}x sales and ${priceToFcf.toFixed(1)}x free cash flow, any meaningful growth slowdown would leave the valuation exposed.`
    : null;
  const groundedHeadline = revenueGrowth !== null && priceToSales !== null
    ? "NVIDIA is still growing unusually fast, but its valuation assumes AI demand stays strong."
    : null;
  const stock: AgentDemoStock = {
    ticker: detail?.instrument.ticker ?? "NVDA",
    name: detail?.instrument.name ?? "NVIDIA Corporation",
    logoUrl: detail?.stock_page.source_documents.summary?.logo_url ?? comparedNvda?.logo_url ?? null,
    currency: detail?.instrument.currency ?? "USD",
    price: detail?.market_data.price ?? null,
    dayChangePct: detail?.market_data.day_change_pct ?? null,
    headline: groundedHeadline ?? intelligence?.headline ?? null,
    thesis: intelligence?.thesis ?? null,
    changed: intelligence?.what_changed ?? groundedChanged,
    matters: intelligence?.why_it_matters ?? null,
    call,
    drivers: groundedSupport ? [groundedSupport] : stringsFrom(intelligence?.drivers),
    risks: groundedRisk ? [groundedRisk] : stringsFrom(intelligence?.risks),
    peTtm: detail?.fundamentals.pe_ttm ?? null,
    targetUpsidePct: intelligence?.target_upside_pct ?? null,
    revenueGrowthPct: revenueGrowth,
    rsi: detail?.technicals.rsi_14 ?? null,
    score: detail?.scores?.overall ?? null,
    asOf: detail?.detail_as_of ?? detail?.as_of ?? null,
  };
  const showcase: StockShowcase = {
    scores: [
      { label: "Overall", value: detail?.scores?.overall ?? null },
      { label: "Growth", value: detail?.scores?.growth ?? null },
      { label: "Quality", value: detail?.scores?.quality ?? null },
      { label: "Valuation", value: detail?.scores?.valuation ?? null },
      { label: "Momentum", value: detail?.scores?.momentum ?? null },
    ],
    financialHistory: (facts?.financial_history ?? []).slice(-4).map((item) => ({ period: item.period, revenue: item.revenue ?? null, operatingMarginPct: item.operating_margin_pct ?? null })),
    valuation: [
      { label: "Forward P/E", value: facts?.valuation?.forward_pe ?? null, suffix: "x" },
      { label: "Price / sales", value: facts?.valuation?.price_to_sales ?? null, suffix: "x" },
      { label: "Price / free cash flow", value: facts?.valuation?.price_to_fcf ?? null, suffix: "x" },
      { label: "ROIC", value: facts?.quality?.roic_pct ?? null, suffix: "%" },
    ],
    analystLabel: facts?.analyst?.label ?? null,
    analystCount: facts?.analyst?.analyst_count ?? null,
    businessQuestion: detail?.stock_page.business_questions[0] ?? null,
  };
  const market: AgentsDemoData["market"] = {
    title: marketBrief?.brief?.title ?? null,
    body: marketBrief?.brief?.body ?? marketBrief?.context?.today_brief ?? null,
    sentimentLabel: marketBrief?.sentiment?.label ?? null,
    sentimentScore: marketBrief?.sentiment?.score ?? null,
    macro: (marketBrief?.macro ?? []).map((item) => ({ label: item.label, value: item.value, changePct: item.day_change_pct })),
    sectors: (marketBrief?.sector_flows ?? []).map((item) => ({ sector: item.sector, flowPct: item.flow_pct })),
    asOf: marketBrief?.as_of ?? null,
  };
  const demoData: AgentsDemoData = {
    stock,
    comparison: comparison.stocks.map((item) => ({
      ticker: item.ticker,
      name: item.name,
      logoUrl: item.logo_url,
      price: item.price,
      peTtm: item.pe_ttm,
      targetPrice: item.analyst_target_price,
      overall: item.scores.overall,
      growth: item.scores.growth,
      valuation: item.scores.valuation,
      momentum: item.scores.momentum,
    })),
    market,
  };
  const watchlist: WatchlistPreview | null = radarChanges ? {
    headline: radarChanges.headline,
    body: radarChanges.body,
    asOf: radarChanges.as_of,
    items: radarChanges.attention_items.slice(0, 3).map((item) => ({ ticker: item.ticker, headline: item.headline, changed: item.what_changed, matters: item.why_it_matters })),
  } : null;

  return (
    <main className="landing-page min-w-0 flex-grow bg-surface text-on-surface">
      <JsonLd />

      <section className="border-b border-outline-variant">
        <div className="mx-auto grid max-w-[1120px] gap-12 px-5 py-14 sm:px-8 sm:py-20 lg:grid-cols-[0.82fr_1.18fr] lg:items-center lg:gap-16 lg:py-24">
          <div>
            <h1 className="max-w-xl text-balance text-[40px] font-semibold leading-[1.02] tracking-[-0.055em] sm:text-[60px]">Your AI finally understands your stocks.</h1>
            <p className="mt-6 max-w-lg text-pretty text-[16px] leading-[1.65] text-on-surface-variant sm:text-[18px]">Stocksbrew gives Claude, Codex or Cursor the current research, market context and Watchlist data behind every answer.</p>
            <div className="mt-8 flex flex-wrap gap-3"><Link href={subscribed ? "#connect" : "/subscribe"} className="landing-btn-primary px-5 py-3 text-[13px]">{subscribed ? "Connect Stocksbrew" : "Start with Stocksbrew Pro"}</Link><Link href="#real-data" className="landing-btn-secondary px-5 py-3 text-[13px]">See the real data ↓</Link></div>
          </div>
          <AgentsPageDemo data={demoData} />
        </div>
      </section>

      <section id="real-data" className="scroll-mt-24 border-b border-outline-variant bg-surface-container-low/20">
        <div className="mx-auto max-w-[1120px] px-5 py-16 sm:px-8 lg:py-24">
          <SectionIntro title="What changed at NVIDIA?" description="See the live research behind the answer, including financials, valuation, analysts and signals." />
          <StockResearchView stock={stock} showcase={showcase} />
        </div>
      </section>

      {watchlist && watchlist.items.length ? <section className="border-b border-outline-variant"><div className="mx-auto max-w-[1120px] px-5 py-16 sm:px-8 lg:py-24"><SectionIntro title="What changed on my Watchlist?" description="Your answer explains what changed, why it matters and what deserves another look." /><WatchlistView preview={watchlist} /></div></section> : null}

      <section id="connect" className="scroll-mt-24 border-b border-outline-variant bg-surface-container-low/20">
        <div className="mx-auto max-w-[820px] px-5 py-16 sm:px-8 lg:py-24">
          <SectionIntro title="Connect your agent." description="Copy one prompt into Claude Code, Codex, Cursor or another MCP client." />
          <AgentClientLogos compact className="mt-7" />
          <AgentSetupPrompt compact className="mt-8" />
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-on-surface-variant"><span>OAuth keeps your token out of the chat.</span><Link href="/developers" className="font-semibold text-landing-brand">Full tool reference →</Link></div>
        </div>
      </section>

      <section className="border-b border-outline-variant"><div className="mx-auto grid max-w-[1120px] gap-8 px-5 py-16 sm:px-8 lg:grid-cols-[1fr_auto] lg:items-end lg:py-20"><div><h2 className="max-w-xl text-balance text-[32px] font-semibold leading-tight tracking-[-0.04em] sm:text-[42px]">Included with Pro.</h2><p className="mt-4 max-w-xl text-pretty text-[15px] leading-relaxed text-on-surface-variant">Current stock research, market context, Watchlist changes, MCP and REST access.</p></div><div className="lg:text-right"><p className="font-mono text-[42px] font-semibold tracking-[-0.05em]">$9<span className="text-[15px] font-normal tracking-normal text-on-surface-variant"> / month</span></p><p className="mt-2 text-[11px] text-on-surface-variant">{AGENT_DAILY_CALL_LIMIT} agent calls per day · cancel anytime</p><Link href={subscribed ? "#connect" : "/subscribe"} className="landing-btn-primary mt-6 px-5 py-3 text-[13px]">{subscribed ? "Connect your agent" : "Start with Pro"}</Link></div></div></section>

      <section className="mx-auto max-w-[820px] px-5 py-16 sm:px-8 lg:py-24"><h2 className="text-[32px] font-semibold tracking-[-0.04em] sm:text-[42px]">Questions before you connect.</h2><div className="mt-8 divide-y divide-outline-variant border-y border-outline-variant">{FAQS.map(([question, answer]) => <details key={question} className="group py-5"><summary className="flex cursor-pointer list-none items-center justify-between gap-5 text-[15px] font-semibold [&::-webkit-details-marker]:hidden">{question}<span aria-hidden className="font-mono text-[18px] font-normal text-on-surface-variant transition-transform group-open:rotate-45">+</span></summary><p className="mt-3 max-w-3xl text-[13px] leading-relaxed text-on-surface-variant">{answer}</p></details>)}</div></section>

    </main>
  );
}
