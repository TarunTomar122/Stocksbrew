import Link from "next/link";
import { StockLogo } from "@/components/stock-logo";
import { relativeTime } from "@/lib/freshness";
import type { PremarketMovers } from "@/lib/premarket";

const PHASE_LABEL: Record<string, string> = {
  trending_up: "trending up",
  distribution: "in distribution",
  correction: "in a correction",
  recovery: "recovering",
  range: "range-bound",
};
const RISK_LABEL: Record<string, string> = { on: "risk-on", off: "risk-off", mixed: "mixed" };

export function PremarketSection({
  movers,
  marketPhase,
  marketRisk,
}: {
  movers: PremarketMovers;
  marketPhase?: string | null;
  marketRisk?: string | null;
}) {
  const all = [...(movers.gappers_up ?? []), ...(movers.gappers_down ?? [])].sort(
    (a, b) => Math.abs(b.pre_market_change_pct) - Math.abs(a.pre_market_change_pct),
  );

  if (all.length === 0) return null;

  const phase = marketPhase ? PHASE_LABEL[marketPhase] : null;
  const risk = marketRisk ? RISK_LABEL[marketRisk] : null;
  const setupLine = phase
    ? `Market is ${phase}${risk ? `, ${risk}` : ""}.`
    : null;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#0052ff]">
            Before the open
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white px-2 py-0.5 text-[10px] font-semibold text-[#6b7280]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
            Pre-market live
          </span>
          <span className="text-[11px] text-[#9ca3af]">
            Updated {relativeTime(movers.generated_at)}
          </span>
        </div>
        {setupLine && (
          <p className="text-[13px] text-[#6b7280]">{setupLine}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {all.slice(0, 8).map((row) => {
          const up = row.pre_market_change_pct >= 0;
          const color = up ? "#10b981" : "#ef4444";
          const bg = up ? "#ecfdf5" : "#fef2f2";
          return (
            <Link
              key={row.ticker}
              href={`/stock/${encodeURIComponent(row.ticker)}`}
              className="group flex items-center justify-between gap-3 rounded-2xl border border-[#e5e7eb] bg-white p-3.5 transition-all hover:border-[#111111] hover:shadow-sm"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <StockLogo ticker={row.ticker} market="US" size={30} logoUrl={row.logo_url} />
                <div className="flex min-w-0 flex-col">
                  <span className="text-[13px] font-semibold text-[#111111] group-hover:text-[#0052ff] transition-colors">
                    {row.ticker}
                  </span>
                  <span className="truncate max-w-[110px] text-[11px] text-[#9ca3af]">
                    {row.name}
                  </span>
                </div>
              </div>
              <span
                className="shrink-0 rounded-md px-2 py-0.5 text-[12px] font-semibold tabular-nums"
                style={{ background: bg, color }}
              >
                {up ? "▲" : "▼"} {Math.abs(row.pre_market_change_pct).toFixed(1)}%
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
