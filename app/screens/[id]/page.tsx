import Link from "next/link";
import { notFound } from "next/navigation";

import { ScreenMatchesTable } from "@/components/screen-matches-table";
import { getSessionUser } from "@/lib/auth-server";
import { getCurrentMarket } from "@/lib/market";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";
import { getScreenById } from "@/lib/screens";

type Props = {
  params: { id: string };
  searchParams: { market?: string };
};

const SCREEN_META: Record<
  string,
  { icon: string; color: string; fg: string; kicker: string }
> = {
  tikrr_top:           { icon: "✦",  color: "#7c3aed", fg: "#ffffff", kicker: "Composite" },
  quality_compounders: { icon: "Q",  color: "#10b981", fg: "#ffffff", kicker: "Quality" },
  cheap_growth:        { icon: "↗",  color: "#0052ff", fg: "#ffffff", kicker: "Growth value" },
  momentum_leaders:    { icon: "▲",  color: "#f59e0b", fg: "#111111", kicker: "Momentum" },
  oversold_quality:    { icon: "↓",  color: "#ef4444", fg: "#ffffff", kicker: "Mean reversion" },
  near_52w_high:       { icon: "↑",  color: "#10b981", fg: "#ffffff", kicker: "Breakouts" },
  smart_money:         { icon: "●",  color: "#1c1c1e", fg: "#ffffff", kicker: "Institutional" },
};

const COLUMN_LEGEND = [
  {
    label: "Tikrr score",
    body: "Composite that blends all four pillars with our model weights.",
    direction: "Higher = stronger overall",
  },
  {
    label: "Valuation",
    body: "How richly priced vs. fundamentals — earnings, sales, cash flow.",
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
    body: "Screen-specific evidence — RSI for oversold names, distance from 52w high for breakouts, institutional ownership for smart money, otherwise overall match strength.",
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

  const session = await getSessionUser();
  const userDoc = session ? await getUserDoc(session.uid) : null;
  const isSubscribed = resolveIsSubscribed(userDoc);

  const meta = SCREEN_META[screen.id] ?? {
    icon: "S",
    color: "#475569",
    fg: "#ffffff",
    kicker: "Screen",
  };

  return (
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-screen-xl px-6 md:px-10 lg:px-16 py-12 md:py-16 flex flex-col gap-10">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-[13px] text-[#6b7280]">
          <Link
            href="/screens"
            className="hover:text-[#111111] transition-colors"
          >
            Screens
          </Link>
          <span className="text-[#d1d5db]">/</span>
          <span className="text-[#111111]">{screen.title}</span>
        </nav>

        {/* Header */}
        <header className="flex flex-col gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold tracking-[0.05em] uppercase"
              style={{ background: `${meta.color}1A`, color: meta.color }}
            >
              <span aria-hidden>{meta.icon}</span>
              {meta.kicker}
            </span>
            <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-[#9ca3af]">
              {market}
            </span>
          </div>

          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div className="flex flex-col gap-2 max-w-[680px]">
              <h1 className="text-[30px] md:text-[36px] font-semibold tracking-[-0.02em] text-[#111111] leading-[1.15]">
                {screen.title}
              </h1>
              <p className="text-[15px] text-[#4a4d55] leading-[1.55]">
                {screen.tagline}
              </p>
            </div>
            <div className="flex items-baseline gap-2 tabular-nums">
              <span className="text-[28px] font-semibold text-[#111111] leading-none">
                {screen.match_count}
              </span>
              <span className="text-[12px] font-medium text-[#6b7280]">
                {screen.match_count === 1 ? "match" : "matches"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[13px] text-[#6b7280] flex-wrap pt-1 border-t border-[#f3f4f6]">
            <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-[#9ca3af]">
              Rule
            </span>
            <span className="text-[13px] text-[#374151]">
              {screen.hook}
            </span>
            <span className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-[#6b7280]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
              Refreshes daily
            </span>
          </div>
        </header>

        {/* Column legend */}
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h2 className="text-[14px] font-semibold text-[#111111] tracking-[-0.01em]">
              How to read this table
            </h2>
            <span className="text-[12px] text-[#6b7280]">
              All scores 0–100 · higher is better
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {COLUMN_LEGEND.map((c) => (
              <div
                key={c.label}
                className="flex flex-col gap-2 rounded-2xl border border-[#e5e7eb] bg-white p-4"
              >
                <span className="text-[13px] font-semibold text-[#111111] tracking-[-0.01em]">
                  {c.label}
                </span>
                <p className="text-[12px] text-[#6b7280] leading-snug">
                  {c.body}
                </p>
                <span
                  className={`inline-flex items-center gap-1 text-[11px] font-medium mt-1 ${
                    c.label === "Signal" ? "text-[#6b7280]" : "text-[#10b981]"
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
          isSubscribed={isSubscribed}
        />

        {/* CTA */}
        <section className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 rounded-[24px] border border-[#e5e7eb] bg-white px-6 py-5">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[#6b7280]">
              Want this screen in your inbox?
            </span>
            <span className="text-[14px] text-[#111111] leading-snug max-w-[520px]">
              Subscribers get daily updates on new matches, drop-offs, and Radar alerts when a screen they follow changes.
            </span>
          </div>
          <Link
            href="/subscribe"
            className="inline-flex items-center justify-center h-[40px] px-5 rounded-full bg-[#111111] text-white text-[13px] font-semibold tracking-tight hover:-translate-y-[1px] active:translate-y-0 transition-transform shrink-0 w-fit"
          >
            Save this screen
          </Link>
        </section>
      </div>
    </main>
  );
}
