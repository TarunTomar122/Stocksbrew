import { AnimatedIcon } from "@/components/animated-icon";
import { ReturnsPriceChart } from "@/components/returns-price-chart";
import { PRICE_HISTORY_CHART_MIN, type PriceHistoryPoint } from "@/lib/price-history-chart";
import type { StockFacts, StockFundamentals } from "@/lib/stock";
import { SHOW_DATA_FRESHNESS_UI, freshnessInfo } from "@/lib/freshness";

type Props = {
  facts: StockFacts | null;
  fundamentals?: StockFundamentals | null;
  currentPrice?: number;
  currency?: string;
  ticker?: string;
  priceHistory?: PriceHistoryPoint[];
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
  if (typeof value !== "number" || !Number.isFinite(value)) return "text-on-surface";
  return value >= 0 ? "text-[#10b981]" : "text-[#ef4444]";
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
      <span className="text-[11px] font-medium tracking-[0.06em] uppercase text-on-surface-variant">
        {label}
      </span>
      <span className={`text-[18px] font-semibold tabular-nums ${valueClass ?? "text-on-surface"}`}>
        {value}
      </span>
    </div>
  );
}

function ReturnTile({ label, value }: { label: string; value?: number | null }) {
  const has = typeof value === "number" && Number.isFinite(value);
  const positive = has && value! >= 0;
  return (
    <div className="rounded-xl bg-surface-container-low px-3 py-3">
      <span className="text-[10px] font-semibold tracking-[0.08em] uppercase text-on-surface-variant">
        {label}
      </span>
      <p
        className={`mt-1 text-[18px] font-semibold tabular-nums leading-none ${
          has ? (positive ? "text-[#10b981]" : "text-[#ef4444]") : "text-on-surface-variant"
        }`}
      >
        {formatPct(value)}
      </p>
    </div>
  );
}

function formatInstOwnershipPct(pct: number): string {
  if (pct > 100) return ">99%";
  return `${pct.toFixed(1)}%`;
}

function ownershipSummary(pct: number, ticker: string): string {
  if (pct >= 85) {
    return `Big funds own most of ${ticker}. Typical for a large U.S. stock.`;
  }
  if (pct >= 60) {
    return `Institutions hold the majority of ${ticker}'s shares.`;
  }
  if (pct >= 40) {
    return `Institutions own a sizable slice of ${ticker}, with more room for retail holders.`;
  }
  return `Institutions own a smaller share of ${ticker} than many large caps.`;
}

function formatFilingPeriod(date?: string): string | null {
  if (!date?.trim()) return null;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  const quarter = Math.floor(parsed.getMonth() / 3) + 1;
  return `Q${quarter} ${parsed.getFullYear()} filing`;
}

function describeHolderMove(change?: string): { label: string; tone: "up" | "down" | "neutral" } {
  if (!change?.trim()) return { label: "n/a", tone: "neutral" };
  const raw = change.trim();
  if (/^new$/i.test(raw)) return { label: "New position", tone: "up" };
  const num = Number.parseFloat(raw.replace("%", ""));
  if (!Number.isFinite(num)) return { label: raw, tone: "neutral" };
  if (num < 0) return { label: `Trimmed ${Math.abs(num).toFixed(1)}% of stake`, tone: "down" };
  if (num > 0) return { label: `Added ${num.toFixed(1)}% to stake`, tone: "up" };
  return { label: "Unchanged", tone: "neutral" };
}

function parseHolderMove(change?: string): {
  verb: string;
  detail: string;
  tone: "up" | "down" | "neutral";
} {
  const { label, tone } = describeHolderMove(change);
  if (label === "New position") return { verb: "New", detail: "position", tone };
  const pct = label.match(/[\d.]+/)?.[0];
  if (label.startsWith("Trimmed")) {
    return { verb: "Trimmed", detail: pct ? `${pct}%` : "stake", tone };
  }
  if (label.startsWith("Added")) {
    return { verb: "Added", detail: pct ? `${pct}%` : "stake", tone };
  }
  return { verb: label, detail: "", tone };
}

function holderInitials(name: string): string {
  const cleaned = name.replace(/,.*$/, "").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  return cleaned.slice(0, 2).toUpperCase();
}

const HOLDER_MOVE_STYLES = {
  up: { pill: "tint-bull text-[#10b981]", detail: "text-[#10b981]" },
  down: { pill: "tint-bear text-[#ef4444]", detail: "text-[#ef4444]" },
  neutral: { pill: "bg-surface-container text-on-surface-variant", detail: "text-on-surface-variant" },
} as const;

function HolderMoveRow({
  name,
  date,
  changePct,
}: {
  name: string;
  date?: string;
  changePct?: string;
}) {
  const move = parseHolderMove(changePct);
  const filing = formatFilingPeriod(date);
  const styles = HOLDER_MOVE_STYLES[move.tone];

  return (
    <li className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface-container-low sm:gap-4 sm:px-5">
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg tint-brand text-[11px] font-bold tracking-tight text-[#7c3aed]"
        aria-hidden
      >
        {holderInitials(name)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-on-surface">{name}</p>
        {filing ? <p className="mt-0.5 text-[11px] text-on-surface-variant">{filing}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${styles.pill}`}>
          {move.verb}
        </span>
        {move.detail ? (
          <span className={`min-w-[2.5rem] text-right text-[12px] font-bold tabular-nums ${styles.detail}`}>
            {move.detail}
          </span>
        ) : null}
      </div>
    </li>
  );
}

function formatHolderCount(value?: string | number | null): string | null {
  if (value == null || value === "") return null;
  const num = typeof value === "number" ? value : Number.parseInt(String(value).replace(/,/g, ""), 10);
  if (Number.isFinite(num)) return num.toLocaleString();
  return String(value);
}

function isMeaningfulHoldingsValue(label?: string): boolean {
  if (!label?.trim()) return false;
  if (/[BMT]/i.test(label)) return true;
  const num = Number.parseFloat(label.replace(/[^\d.]/g, ""));
  return Number.isFinite(num) && num >= 1_000_000;
}

function OwnershipTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-surface-container-low px-3 py-3">
      <span className="text-[10px] font-semibold tracking-[0.08em] uppercase text-on-surface-variant">
        {label}
      </span>
      <p className="mt-1 text-[17px] font-semibold leading-snug text-on-surface">{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] leading-snug text-on-surface-variant">{hint}</p> : null}
    </div>
  );
}

export function StockFactsPanel({
  facts,
  fundamentals,
  currentPrice,
  currency = "$",
  ticker = "",
  priceHistory = [],
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
  const factsFreshness = SHOW_DATA_FRESHNESS_UI
    ? freshnessInfo(fundamentalsUpdatedAt, {
        agingHours: 24 * 7,
        staleHours: 24 * 14,
      })
    : null;

  return (
    <div className="flex flex-col gap-10">
      {/* Key stats */}
      {keyStats.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-[18px] font-semibold text-on-surface tracking-[-0.01em]">
              Key stats
            </h3>
            {factsFreshness ? (
              <span className={`text-[11px] font-semibold tracking-[0.08em] uppercase ${factsFreshness.toneClass}`}>
                {factsFreshness.label}
                {factsFreshness.relative ? ` · ${factsFreshness.relative}` : ""}
              </span>
            ) : null}
          </div>
          {factsFreshness?.status === "stale" && (
            <p className="rounded-xl tint-bear px-3 py-2 text-[12px] leading-relaxed text-[#ef4444]">
              Fundamentals are older than 14 days. Treat valuation and analyst stats as stale until the next fundamentals refresh.
            </p>
          )}
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
        <section className="flex flex-col gap-4 pt-8 border-t border-outline-variant">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h3 className="text-[18px] font-semibold text-on-surface tracking-[-0.01em]">
              Returns
            </h3>
            <span className="text-[12px] text-on-surface-variant">Price action</span>
          </div>
          <div className="flex w-full max-w-[640px] flex-col gap-5">
            {ticker && priceHistory.length >= PRICE_HISTORY_CHART_MIN ? (
              <ReturnsPriceChart series={priceHistory} ticker={ticker} currency={currency} />
            ) : null}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <ReturnTile label="1 month" value={returns.one_month_pct} />
              <ReturnTile label="3 months" value={returns.three_month_pct} />
              <ReturnTile label="6 months" value={returns.six_month_pct} />
              <ReturnTile label="1 year" value={returns.one_year_pct} />
            </div>
          </div>
        </section>
      )}

      {/* Who owns it */}
      {hasOwnership && (
        <section className="flex flex-col gap-5 pt-8 border-t border-outline-variant">
          <div className="flex items-start gap-3.5">
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl tint-brand text-[#7c3aed]"
              aria-hidden
            >
              <AnimatedIcon name="corporate_fare" size={22} aria-hidden />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <h3 className="text-[20px] font-semibold tracking-[-0.02em] text-on-surface md:text-[22px]">
                Who owns it
              </h3>
              {typeof instPct === "number" && ticker ? (
                <p className="max-w-2xl text-[14px] leading-relaxed text-on-surface-variant md:text-[15px]">
                  {ownershipSummary(instPct, ticker)}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid max-w-3xl grid-cols-2 gap-2.5 sm:grid-cols-3">
            {typeof instPct === "number" ? (
              <OwnershipTile
                label="Fund-owned"
                value={formatInstOwnershipPct(instPct)}
                hint="of shares outstanding"
              />
            ) : null}
            {formatHolderCount(inst?.total_holders) ? (
              <OwnershipTile
                label="Institutions"
                value={formatHolderCount(inst?.total_holders)!}
                hint="reporting holders"
              />
            ) : null}
            {topHolders[0]?.name ? (
              <OwnershipTile
                label="Largest holder"
                value={topHolders[0].name}
                hint="latest filing"
              />
            ) : null}
            {isMeaningfulHoldingsValue(inst?.total_value_label) ? (
              <OwnershipTile
                label="Institutional value"
                value={inst!.total_value_label!}
                hint="total reported"
              />
            ) : null}
          </div>

          {topHolders.length > 0 ? (
            <div className="max-w-3xl overflow-hidden rounded-2xl bg-surface shadow-[0_1px_2px_rgba(17,24,39,0.04)]">
              <div className="flex items-center justify-between gap-3 border-b border-outline-variant bg-surface-container-low px-4 py-3 sm:px-5">
                <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-on-surface-variant">
                  Recent filing moves
                </span>
                <span className="text-[11px] text-on-surface-variant">13F · quarterly</span>
              </div>
              <ul className="divide-y divide-[#f3f4f6]">
                {topHolders.slice(0, 5).map((h) => (
                  <HolderMoveRow
                    key={`${h.name}-${h.date}`}
                    name={h.name ?? "Unknown"}
                    date={h.date}
                    changePct={h.change_pct}
                  />
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      )}

      {/* Financials */}
      {hasFinancials && (
        <section className="flex flex-col gap-4 pt-8 border-t border-outline-variant">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h3 className="text-[18px] font-semibold text-on-surface tracking-[-0.01em]">
              Financials
            </h3>
            {fin.fiscal_year && (
              <span className="text-[12px] font-medium tracking-[0.08em] uppercase text-on-surface-variant">
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
