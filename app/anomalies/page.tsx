import type { Metadata } from "next";

import { StockLogo } from "@/components/stock-logo";
import { getDailyAnomalies, type DailyAnomaliesDoc } from "@/lib/daily-anomalies";
import { getCurrentMarket } from "@/lib/market";
import Link from "next/link";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "Market Movers Today — Biggest Stock Moves",
  description:
    "Stocks with the biggest price moves today. See what's surging, what's dropping, and why — with AI-enriched context on each move.",
  alternates: { canonical: "/anomalies" },
  openGraph: {
    title: "Market Movers Today · Tikrr",
    description: "Stocks with the biggest price moves today — what's surging, what's dropping, and why.",
    url: "https://www.tikrr.online/anomalies",
  },
  twitter: {
    title: "Market Movers Today · Tikrr",
    description: "Stocks with the biggest price moves today — what's surging, what's dropping, and why.",
  },
};

function fmtPrice(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return v.toFixed(2);
}

function fmtPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function AnomalyRow({
  item,
}: {
  item: NonNullable<DailyAnomaliesDoc["anomalies"]>[number];
}) {
  const isUp = item.direction === "up";
  const changeColor = isUp ? "#10b981" : "#ef4444";

  return (
    <Link
      href={`/stock/${encodeURIComponent(item.ticker)}`}
      className="group flex items-center gap-4 px-5 py-4 border-t border-[#f3f4f6] hover:bg-[#fafafa] transition-colors first:border-t-0"
    >
      {/* Logo */}
      <StockLogo ticker={item.ticker} logoUrl={item.logo_url} size={36} />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[14px] font-semibold text-[#111111] group-hover:text-[#0052ff] transition-colors">
            {item.ticker}
          </span>
          <span className="text-[12px] text-[#9ca3af] truncate max-w-[160px]">
            {item.name}
          </span>
        </div>
        {item.headline && (
          <p className="text-[12px] text-[#374151] leading-snug line-clamp-1">
            {item.headline}
          </p>
        )}
        {item.catalyst && (
          <span className="mt-1.5 inline-flex items-center rounded-md bg-[#f3f4f6] px-2 py-0.5 text-[10px] font-medium text-[#6b7280]">
            {item.catalyst}
          </span>
        )}
      </div>

      {/* Price + change */}
      <div className="flex flex-col items-end shrink-0 gap-0.5">
        <span className="text-[14px] font-semibold tabular-nums text-[#111111]">
          ${fmtPrice(item.price)}
        </span>
        <span
          className="text-[13px] font-bold tabular-nums"
          style={{ color: changeColor }}
        >
          {isUp ? "▲" : "▼"} {fmtPct(item.day_change_pct)}
        </span>
      </div>
    </Link>
  );
}

export default async function AnomaliesPage() {
  const market = getCurrentMarket();
  const data = await getDailyAnomalies(market).catch(() => null);

  if (!data || data.anomalies.length === 0) {
    return (
      <main className="flex-grow">
        <div className="mx-auto w-full max-w-screen-2xl px-6 md:px-10 lg:px-16 py-12">
          <h1 className="text-[28px] font-semibold text-[#111111] tracking-[-0.02em] mb-2">
            Market Movers
          </h1>
          <p className="text-[14px] text-[#6b7280]">
            No significant moves detected today. Check back during market hours.
          </p>
        </div>
      </main>
    );
  }

  const ups = data.anomalies.filter((a) => a.direction === "up");
  const downs = data.anomalies.filter((a) => a.direction === "down");

  const sorted = [...data.anomalies].sort(
    (a, b) => Math.abs(b.day_change_pct) - Math.abs(a.day_change_pct),
  );

  const updatedAt = new Date(data.enriched_at || data.generated_at).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });

  return (
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-screen-2xl px-6 md:px-10 lg:px-16 py-10 md:py-14 flex flex-col gap-10">

        {/* Header */}
        <header className="flex items-end justify-between gap-6 flex-wrap">
          <div className="flex flex-col gap-2 max-w-2xl">
            <h1 className="text-[28px] md:text-[34px] font-semibold tracking-[-0.025em] text-[#111111]">
              Market Movers
            </h1>
            <p className="text-[15px] leading-relaxed text-[#374151]">
              Stocks with unusual price moves today — what changed, why it matters, and what to watch next.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#6b7280]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
              Live
            </span>
            <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-[#9ca3af]">
              Updated {updatedAt}
            </span>
          </div>
        </header>

        {/* Stats strip */}
        <div className="flex items-center gap-0 rounded-2xl border border-[#e5e7eb] bg-white overflow-hidden w-fit divide-x divide-[#e5e7eb]">
          <div className="px-6 py-3 text-center">
            <div className="text-[20px] font-semibold tabular-nums text-[#111111]">
              {data.anomalies.length}
            </div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9ca3af] mt-0.5">
              Total movers
            </div>
          </div>
          <div className="px-6 py-3 text-center">
            <div className="text-[20px] font-semibold tabular-nums text-[#10b981]">{ups.length}</div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9ca3af] mt-0.5">
              Surging
            </div>
          </div>
          <div className="px-6 py-3 text-center">
            <div className="text-[20px] font-semibold tabular-nums text-[#ef4444]">{downs.length}</div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#9ca3af] mt-0.5">
              Dropping
            </div>
          </div>
        </div>

        {/* Single combined table sorted by biggest move */}
        <div className="rounded-2xl border border-[#e5e7eb] bg-white overflow-hidden">
          {sorted.map((item) => (
            <AnomalyRow key={item.ticker} item={item} />
          ))}
        </div>

        <footer className="text-[11px] text-[#9ca3af]">
          Not investment advice.
        </footer>
      </div>
    </main>
  );
}
