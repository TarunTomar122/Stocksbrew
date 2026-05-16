import type { StockFacts, StockFundamentals } from "@/lib/stock";

type Props = {
  facts: StockFacts | null;
  fundamentals?: StockFundamentals | null;
  currentPrice?: number;
  currency?: string;
  isSubscribed?: boolean;
  fundamentalsUpdatedAt?: string;
};

function pickNumber(...values: Array<number | null | undefined>): number | null {
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

function formatPct(value?: number | null, signed = true): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  const sign = signed && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function formatMoney(value?: number | null, currency = "$"): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000_000) return `${currency}${(value / 1_000_000_000_000).toFixed(2)}T`;
  if (abs >= 1_000_000_000) return `${currency}${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${currency}${(value / 1_000_000).toFixed(2)}M`;
  return `${currency}${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatNumber(value?: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function pctTone(value?: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "text-[#111111]";
  return value >= 0 ? "text-[#10b981]" : "text-[#ef4444]";
}

function formatRelative(iso?: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.round((Date.now() - then) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function parseEventDateLabel(label?: string): Date | null {
  if (!label) return null;
  const cleaned = label
    .split("/")[0]
    .replace(/\s+(AMC|BMO|TAS|DMH)$/i, "")
    .trim();
  if (!cleaned) return null;

  const hasYear = /\b\d{4}\b/.test(cleaned);
  const dateText = hasYear ? cleaned : `${cleaned} ${new Date().getFullYear()}`;
  const withYear = new Date(dateText);
  if (Number.isNaN(withYear.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (withYear >= today) return withYear;

  const rolled = new Date(withYear);
  rolled.setFullYear(rolled.getFullYear() + 1);
  const daysAway = (rolled.getTime() - today.getTime()) / 86_400_000;
  return daysAway <= 180 ? rolled : null;
}

function isForwardEvent(event?: NonNullable<StockFacts["events"]>[number]): boolean {
  if (!event?.date_label) return false;
  if (event.date) {
    const eventDate = new Date(`${event.date}T00:00:00Z`);
    if (Number.isNaN(eventDate.getTime())) return false;
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    return eventDate >= today;
  }
  return parseEventDateLabel(event.date_label) !== null;
}

function Stat({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium tracking-[0.06em] uppercase text-[#9ca3af]">
        {label}
      </span>
      <span className={`text-[18px] font-semibold tabular-nums ${valueClass ?? "text-[#111111]"}`}>
        {value}
      </span>
    </div>
  );
}

function ReturnBar({ label, value }: { label: string; value?: number | null }) {
  const has = typeof value === "number" && Number.isFinite(value);
  const positive = has && value! >= 0;
  const width = has ? Math.min(100, Math.max(6, Math.abs(value!) * 1.2)) : 0;
  return (
    <div className="flex items-center gap-4">
      <span className="text-[12px] font-medium tracking-[0.06em] uppercase text-[#9ca3af] w-20 shrink-0">
        {label}
      </span>
      <div className="flex-1 h-1.5 rounded-full bg-[#f3f4f6] overflow-hidden">
        <div
          className={`h-full rounded-full ${positive ? "bg-[#10b981]" : "bg-[#ef4444]"}`}
          style={{ width: `${width}%` }}
        />
      </div>
      <span
        className={`text-[13px] font-semibold tabular-nums w-16 text-right ${
          has ? (positive ? "text-[#10b981]" : "text-[#ef4444]") : "text-[#9ca3af]"
        }`}
      >
        {formatPct(value)}
      </span>
    </div>
  );
}

function OwnershipDonut({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div
      className="grid h-[88px] w-[88px] place-items-center rounded-full shrink-0"
      style={{
        background: `conic-gradient(#7c3aed ${clamped}%, #f3f4f6 ${clamped}% 100%)`,
      }}
      aria-hidden
    >
      <div className="grid h-[68px] w-[68px] place-items-center rounded-full bg-white">
        <span className="text-[16px] font-semibold tabular-nums text-[#111111]">
          {clamped.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

export function StockFactsPanel({
  facts,
  fundamentals,
  currentPrice,
  currency = "$",
  isSubscribed = false,
  fundamentalsUpdatedAt,
}: Props) {
  const returns = facts?.returns ?? {};
  const stats = facts?.quick_stats ?? {};
  const fin = facts?.financials ?? {};
  const inst = facts?.institutions;
  const event = facts?.events?.find(isForwardEvent);
  const target = facts?.analyst?.target_price;
  const analystCount = facts?.analyst?.analyst_count ?? 0;
  const upside =
    typeof currentPrice === "number" &&
    typeof target === "number" &&
    currentPrice > 0
      ? ((target - currentPrice) / currentPrice) * 100
      : null;
  const instPct =
    inst?.ownership_pct ?? stats.institutional_ownership_pct ?? null;
  const topHolders = inst?.top_holders ?? [];

  // Fall back to the Yahoo-sourced fundamentals doc when stock_facts hasn't
  // populated the value yet - same number, different collection.
  const marketCap = pickNumber(stats.market_cap, fundamentals?.market_cap);
  const peTtm = pickNumber(stats.pe_ttm, fundamentals?.pe_ttm);
  const recoScore = pickNumber(stats.recommendation_score);
  const epsNextY = pickNumber(stats.eps_next_year_growth_pct);

  const keyStats: Array<{
    label: string;
    value: string;
    valueClass?: string;
  }> = [];
  if (marketCap !== null)
    keyStats.push({ label: "Market cap", value: formatMoney(marketCap, currency) });
  if (peTtm !== null)
    keyStats.push({ label: "P/E (TTM)", value: formatNumber(peTtm) });
  if (epsNextY !== null)
    keyStats.push({
      label: "EPS next Y",
      value: formatPct(epsNextY),
      valueClass: pctTone(epsNextY),
    });
  if (recoScore !== null)
    keyStats.push({ label: "Reco score", value: formatNumber(recoScore) });
  if (typeof target === "number")
    keyStats.push({ label: "Avg target", value: formatMoney(target, currency) });
  if (upside !== null)
    keyStats.push({
      label: "Implied upside",
      value: formatPct(upside),
      valueClass: pctTone(upside),
    });
  if (analystCount > 0)
    keyStats.push({ label: "Analysts", value: `${analystCount}` });
  if (event?.date_label)
    keyStats.push({
      label: `Next ${event.title?.toLowerCase() ?? "event"}`,
      value: event.date_label,
    });
  if (typeof fundamentals?.week_52_high === "number")
    keyStats.push({
      label: "52W high",
      value: formatMoney(fundamentals.week_52_high, currency),
    });
  if (typeof fundamentals?.week_52_low === "number")
    keyStats.push({
      label: "52W low",
      value: formatMoney(fundamentals.week_52_low, currency),
    });
  if (typeof fundamentals?.dividend_yield === "number")
    keyStats.push({
      label: "Div yield",
      value: formatPct(fundamentals.dividend_yield * 100, false),
    });
  if (typeof fundamentals?.beta === "number")
    keyStats.push({
      label: "Beta",
      value: formatNumber(fundamentals.beta),
    });

  const finStats: Array<{ label: string; value: string; valueClass?: string }> = [];
  if (typeof fin.revenue === "number")
    finStats.push({ label: "Revenue", value: formatMoney(fin.revenue, currency) });
  if (typeof fin.revenue_growth_yoy_pct === "number")
    finStats.push({
      label: "Rev growth",
      value: formatPct(fin.revenue_growth_yoy_pct),
      valueClass: pctTone(fin.revenue_growth_yoy_pct),
    });
  if (typeof fin.operating_income === "number")
    finStats.push({
      label: "Operating inc.",
      value: formatMoney(fin.operating_income, currency),
    });
  if (typeof fin.net_income === "number")
    finStats.push({
      label: "Net income",
      value: formatMoney(fin.net_income, currency),
    });

  const hasReturns =
    typeof returns.one_month_pct === "number" ||
    typeof returns.three_month_pct === "number" ||
    typeof returns.six_month_pct === "number" ||
    typeof returns.one_year_pct === "number";

  const hasOwnership = typeof instPct === "number" || topHolders.length > 0;

  if (
    keyStats.length === 0 &&
    finStats.length === 0 &&
    !hasReturns &&
    !hasOwnership
  ) {
    return null;
  }

  const hasFinancials = finStats.length > 0;

  return (
    <div className="flex flex-col gap-10">
      {/* Key stats */}
      {keyStats.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-[18px] font-semibold text-[#111111] tracking-[-0.01em]">
              Key stats
            </h3>
            <span className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#9ca3af]">
              Updated {formatRelative(fundamentalsUpdatedAt) || "-"}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-5">
            {keyStats.map((s) => (
              <Stat
                key={s.label}
                label={s.label}
                value={s.value}
                valueClass={s.valueClass}
              />
            ))}
          </div>
        </section>
      )}

      {/* Returns */}
      {hasReturns && (
        <section className="flex flex-col gap-4 pt-8 border-t border-[#e5e7eb]">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h3 className="text-[18px] font-semibold text-[#111111] tracking-[-0.01em]">
              Returns
            </h3>
            <span className="text-[12px] text-[#6b7280]">Price action</span>
          </div>
          <div className="flex flex-col gap-3 max-w-[640px]">
            <ReturnBar label="1 month" value={returns.one_month_pct} />
            <ReturnBar label="3 months" value={returns.three_month_pct} />
            <ReturnBar label="6 months" value={returns.six_month_pct} />
            <ReturnBar label="1 year" value={returns.one_year_pct} />
          </div>
        </section>
      )}

      {/* Ownership */}
      {hasOwnership && (
        <section className="flex flex-col gap-4 pt-8 border-t border-[#e5e7eb]">
          <h3 className="text-[18px] font-semibold text-[#111111] tracking-[-0.01em]">
            Ownership
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-8 items-start">
            <div className="flex items-center gap-5">
              {typeof instPct === "number" && <OwnershipDonut pct={instPct} />}
              <div className="flex flex-col gap-3">
                {typeof instPct === "number" && (
                  <div className="flex flex-col">
                    <span className="text-[11px] font-medium tracking-[0.06em] uppercase text-[#9ca3af]">
                      Institutional
                    </span>
                    <span className="text-[13px] text-[#6b7280]">
                      footprint of total float
                    </span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  {inst?.total_holders && (
                    <Stat label="Holders" value={inst.total_holders} />
                  )}
                  {inst?.total_value_label && (
                    <Stat label="Value" value={inst.total_value_label} />
                  )}
                </div>
              </div>
            </div>

            {topHolders.length > 0 && (
              <div className="relative flex flex-col gap-2 min-w-0 overflow-hidden">
                <span className="text-[11px] font-medium tracking-[0.06em] uppercase text-[#9ca3af]">
                  Top holders
                </span>
                <ul className="flex flex-col">
                  {topHolders.slice(0, 5).map((h) => {
                    const isNeg = h.change_pct?.startsWith("-");
                    return (
                      <li
                        key={`${h.name}-${h.date}`}
                        className="flex items-center justify-between gap-3 py-2 border-t border-[#f3f4f6] first:border-t-0"
                      >
                        <div className="flex flex-col min-w-0">
                          <span className="text-[13px] font-semibold text-[#111111] truncate">
                            {h.name}
                          </span>
                          <span className="text-[11px] text-[#6b7280]">{h.date}</span>
                        </div>
                        <span
                          className={`shrink-0 text-[12px] font-semibold tabular-nums ${
                            h.change_pct
                              ? isNeg
                                ? "text-[#ef4444]"
                                : "text-[#10b981]"
                              : "text-[#6b7280]"
                          }`}
                        >
                          {h.change_pct || h.market_value || "-"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Financials */}
      {hasFinancials && (
        <section className="flex flex-col gap-4 pt-8 border-t border-[#e5e7eb]">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h3 className="text-[18px] font-semibold text-[#111111] tracking-[-0.01em]">
              Financials
            </h3>
            {fin.fiscal_year && (
              <span className="text-[12px] font-medium tracking-[0.08em] uppercase text-[#9ca3af]">
                FY {fin.fiscal_year}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-5">
            {finStats.map((s) => (
              <Stat
                key={s.label}
                label={s.label}
                value={s.value}
                valueClass={s.valueClass}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
