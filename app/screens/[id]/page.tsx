import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { ScreenMatchesTable } from "@/components/screen-matches-table";
import { OaSiteHeader } from "@/components/oa/oa-site-header";
import { getCurrentMarket } from "@/lib/market";
import { scrubLegacyBrand } from "@/lib/brand";
import { getScreenById } from "@/lib/screens";

type Props = {
  params: { id: string };
  searchParams: { market?: string };
};

const SCREEN_META_INFO: Record<string, { title: string; subtitle: string }> = {
  tikrr_top: { title: "Top stocksbrew Score", subtitle: "Stocks with the best overall score across growth, momentum, quality and valuation." },
  quality_compounders: { title: "Quality Compounders", subtitle: "Strong businesses built to grow year after year." },
  cheap_growth: { title: "Growth at a Fair Price", subtitle: "Still growing fast, not priced for perfection yet." },
  momentum_leaders: { title: "On a Tear", subtitle: "Strong recent gains with the longer trend intact." },
  oversold_quality: { title: "Quality on Sale", subtitle: "Great businesses that just got marked down." },
  near_52w_high: { title: "Near New Highs", subtitle: "Stocks within 3% of their 52-week peak." },
  smart_money: { title: "Where the Pros Are", subtitle: "Heavy institutional ownership, solid overall scores." },
};

function screenMetaDescription(subtitle: string): string {
  return `${subtitle} Browse US matches and compare the metrics behind each pick.`;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = params.id;
  const market = (new URLSearchParams(params as unknown as Record<string, string>).get("market") as "US" | "IN") ?? "US";
  const info = SCREEN_META_INFO[id];
  if (info) {
    const description = screenMetaDescription(info.subtitle);
    return {
      title: info.title,
      description,
      alternates: { canonical: `/screens/${id}` },
      openGraph: {
        title: `${info.title} · stocksbrew`,
        description,
        url: `https://www.stocksbrew.online/screens/${id}`,
      },
      twitter: {
        card: "summary_large_image",
        title: `${info.title} · stocksbrew`,
        description,
      },
    };
  }
  return {
    title: id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    description: "Curated stock screen based on growth, momentum, quality and valuation.",
    alternates: { canonical: `/screens/${id}` },
  };
}

const SCREEN_META: Record<
  string,
  { icon: string; color: string; fg: string; kicker: string }
> = {
  tikrr_top:           { icon: "✦",  color: "#7c3aed", fg: "#ffffff", kicker: "Composite" },
  quality_compounders: { icon: "Q",  color: "#10b981", fg: "#ffffff", kicker: "Quality" },
  cheap_growth:        { icon: "↗",  color: "var(--oa-primary)", fg: "#ffffff", kicker: "Growth value" },
  momentum_leaders:    { icon: "▲",  color: "#f59e0b", fg: "var(--oa-fg)", kicker: "Momentum" },
  oversold_quality:    { icon: "↓",  color: "#ef4444", fg: "#ffffff", kicker: "Mean reversion" },
  near_52w_high:       { icon: "↑",  color: "#10b981", fg: "#ffffff", kicker: "Breakouts" },
  smart_money:         { icon: "●",  color: "#1c1c1e", fg: "#ffffff", kicker: "Institutional" },
};

const COLUMN_LEGEND = [
  {
    label: "stocksbrew score",
    body: "Overall score blending growth, momentum, quality and valuation.",
    direction: "Higher = stronger overall",
  },
  {
    label: "Valuation",
    body: "How cheaply priced vs. earnings, sales and cash flow.",
    direction: "Higher = cheaper",
  },
  {
    label: "Growth",
    body: "Revenue and earnings momentum vs. peers and history.",
    direction: "Higher = faster growth",
  },
  {
    label: "Quality",
    body: "Margins, returns on capital, balance sheet strength.",
    direction: "Higher = healthier",
  },
  {
    label: "Momentum",
    body: "Price action, distance from 52-week highs, trend strength.",
    direction: "Higher = stronger trend",
  },
  {
    label: "Signal",
    body: "What made this stock match the screen. RSI for oversold names, distance from 52w high for breakouts, institutional ownership for smart money.",
    direction: "Why this stock matched",
  },
];

export default async function ScreenDetailPage({ params, searchParams }: Props) {
  const market =
    searchParams.market === "IN" || searchParams.market === "US"
      ? (searchParams.market as "US" | "IN")
      : getCurrentMarket();

  const result = await getScreenById(market, params.id);
  if (!result) notFound();
  const { screen } = result;
  const display = SCREEN_META_INFO[screen.id] ?? {
    title: scrubLegacyBrand(screen.title),
    subtitle: scrubLegacyBrand(screen.tagline),
  };

  const meta = SCREEN_META[screen.id] ?? {
    icon: "S",
    color: "#475569",
    fg: "#ffffff",
    kicker: "Screen",
  };

  return (
    <main className="oa-landing flex-grow">
      <OaSiteHeader />
      <div className="mx-auto w-full max-w-[76rem] px-4 py-10 flex flex-col gap-10 sm:px-6 sm:py-14">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-[13px] text-[var(--oa-muted-fg)]">
          <Link
            href="/screens"
            className="hover:text-[var(--oa-fg)] transition-colors"
          >
            Screens
          </Link>
          <span className="text-[var(--oa-border)]">/</span>
          <span className="text-[var(--oa-fg)]">{display.title}</span>
        </nav>

        {/* Header */}
        <header className="flex flex-col gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium tracking-[0.05em] uppercase"
              style={{ background: `${meta.color}1A`, color: meta.color }}
            >
              <span aria-hidden>{meta.icon}</span>
              {meta.kicker}
            </span>
            <span className="text-[11px] font-medium tracking-[0.1em] uppercase text-[var(--oa-muted-fg)]">
              {market}
            </span>
          </div>

          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div className="flex flex-col gap-2 max-w-[680px]">
              <h1 className="text-[30px] md:text-[36px] font-medium tracking-[-0.02em] text-[var(--oa-fg)] leading-[1.15]">
                {display.title}
              </h1>
              <p className="text-[15px] text-oa-muted-fg leading-[1.55]">
                {display.subtitle}
              </p>
            </div>
            <div className="flex items-baseline gap-2 tabular-nums">
              <span className="text-[28px] font-medium text-[var(--oa-fg)] leading-none">
                {screen.match_count}
              </span>
              <span className="text-[12px] font-medium text-[var(--oa-muted-fg)]">
                {screen.match_count === 1 ? "match" : "matches"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[13px] text-[var(--oa-muted-fg)] flex-wrap pt-1 border-t border-[var(--oa-bg)]">
            <span className="text-[11px] font-medium tracking-[0.1em] uppercase text-[var(--oa-muted-fg)]">
              Rule
            </span>
            <span className="text-[13px] text-[var(--oa-fg)]">
              {screen.hook}
            </span>
            <span className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-[var(--oa-muted-fg)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
              Refreshes daily
            </span>
          </div>
        </header>

        {/* Column legend */}
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h2 className="text-[14px] font-medium text-[var(--oa-fg)] tracking-[-0.01em]">
              How to read this table
            </h2>
            <span className="text-[12px] text-[var(--oa-muted-fg)]">
              All scores 0–100 · higher is better
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {COLUMN_LEGEND.map((c) => (
              <div
                key={c.label}
                className="flex flex-col gap-2 rounded-2xl border border-[var(--oa-border)] bg-oa-card p-4"
              >
                <span className="text-[13px] font-medium text-[var(--oa-fg)] tracking-[-0.01em]">
                  {c.label}
                </span>
                <p className="text-[12px] text-[var(--oa-muted-fg)] leading-snug">
                  {c.body}
                </p>
                <span
                  className={`inline-flex items-center gap-1 text-[11px] font-medium mt-1 ${
                    c.label === "Signal" ? "text-[var(--oa-muted-fg)]" : "text-[#10b981]"
                  }`}
                >
                  {c.label !== "Signal" && <span aria-hidden>↑</span>}
                  {c.direction}
                </span>
              </div>
            ))}
          </div>
        </section>

        <ScreenMatchesTable
          matches={screen.matches}
          screenId={screen.id}
          market={market}
        />

        {/* CTA */}
        <section className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 rounded-[24px] border border-[var(--oa-border)] bg-oa-card px-6 py-5">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium tracking-[0.12em] uppercase text-[var(--oa-muted-fg)]">
              Want this screen in your inbox?
            </span>
            <span className="text-[14px] text-[var(--oa-fg)] leading-snug max-w-[520px]">
              Subscribers get daily updates on new matches, drop-offs and Watchlist alerts when a screen they follow changes.
            </span>
          </div>
          <Link
            href="/subscribe"
            className="inline-flex items-center justify-center h-[40px] px-5 rounded-full bg-[var(--oa-fg)] text-white text-[13px] font-medium tracking-tight hover:-translate-y-[1px] active:translate-y-0 transition-transform shrink-0 w-fit"
          >
            Save this screen
          </Link>
        </section>
      </div>
    </main>
  );
}
