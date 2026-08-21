import { AnimatedIcon } from "@/components/animated-icon";
import Link from "next/link";
import type { ReactNode } from "react";
import { EarningsIntelShare } from "@/components/earnings-intel-share";
import { StockLogo } from "@/components/stock-logo";
import { TrackButton } from "@/components/track-button";
import type { EarningsIntelDoc, EarningsIntelScenario } from "@/lib/earnings-intel";
import { mergeIntelScenarios } from "@/lib/earnings-scenario-weights";
import type { StockSummary } from "@/lib/stock";
import { currencySymbolFor } from "@/lib/utils";

type Props = {
  doc: EarningsIntelDoc;
  stock: StockSummary | null;
  market: "US" | "IN";
  isSubscribed: boolean;
  isTracked: boolean;
  tier: "ai_launch" | "ai_personal" | "free";
};

function formatEventDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatGeneratedAt(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtPrice(v: number, currency: string): string {
  if (!Number.isFinite(v)) return "—";
  return `${currency}${v.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function fmtAbs(v: number, currency: string): string {
  return `${v >= 0 ? "+" : ""}${currency}${Math.abs(v).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtCap(n?: number | null): string | null {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return null;
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  return n.toLocaleString();
}

const FACT_ITEMS: {
  key: keyof NonNullable<EarningsIntelDoc["report"]["facts"]>;
  label: string;
  icon: string;
  iconBg: string;
  iconFg: string;
}[] = [
  { key: "reported_vs_expected", label: "Earnings print", icon: "receipt_long", iconBg: "bg-[#f5f0ff]", iconFg: "text-[#6b38d4]" },
  { key: "guidance_signal", label: "Guidance", icon: "signpost", iconBg: "bg-[#eff6ff]", iconFg: "text-[var(--oa-primary)]" },
  { key: "price_reaction", label: "Price reaction", icon: "candlestick_chart", iconBg: "bg-[#fef3c7]", iconFg: "text-[#b45309]" },
  { key: "post_earnings_narrative", label: "Street narrative", icon: "newspaper", iconBg: "bg-[var(--oa-bg)]", iconFg: "text-[var(--oa-fg)]" },
];

const INTERP_ITEMS: {
  key: keyof NonNullable<EarningsIntelDoc["report"]["interpretation"]>;
  label: string;
  icon: string;
}[] = [
  { key: "what_changed", label: "What changed", icon: "swap_horiz" },
  { key: "what_market_is_pricing", label: "What the market is pricing", icon: "sell" },
  { key: "fundamental_implication", label: "Fundamental takeaway", icon: "insights" },
];

function scenarioStyle(caseName: EarningsIntelScenario["case"], isLead: boolean) {
  const labels: Record<EarningsIntelScenario["case"], string> = {
    bull: "Bull",
    base: "Base",
    bear: "Bear",
  };
  const icons: Record<EarningsIntelScenario["case"], string> = {
    bull: "trending_up",
    base: "balance",
    bear: "trending_down",
  };

  if (!isLead) {
    return {
      card: "bg-[#fafafa] border-[var(--oa-border)]",
      chip: "bg-[var(--oa-bg)] text-[var(--oa-muted-fg)]",
      bar: "bg-[var(--oa-border)]",
      icon: icons[caseName],
      iconFg: "text-[var(--oa-muted-fg)]",
      label: labels[caseName],
    };
  }

  switch (caseName) {
    case "bull":
      return {
        card: "bg-[#ecfdf5] border-[#d1fae5]",
        chip: "bg-[#10b981] text-white",
        bar: "bg-[#10b981]",
        icon: icons.bull,
        iconFg: "text-[#10b981]",
        label: labels.bull,
      };
    case "bear":
      return {
        card: "bg-[#fef2f2] border-[#fecaca]",
        chip: "bg-[#ef4444] text-white",
        bar: "bg-[#ef4444]",
        icon: icons.bear,
        iconFg: "text-[#ef4444]",
        label: labels.bear,
      };
    default:
      return {
        card: "bg-[#eff6ff] border-[#bfdbfe]",
        chip: "bg-[var(--oa-primary)] text-white",
        bar: "bg-[var(--oa-primary)]",
        icon: icons.base,
        iconFg: "text-[var(--oa-primary)]",
        label: labels.base,
      };
  }
}

function MaterialIcon({ name, className = "" }: { name: string; className?: string }) {
  return <AnimatedIcon name={name} size={18} className={className} aria-hidden />;
}

function InsightCard({
  icon,
  iconBg,
  iconFg,
  label,
  children,
  className = "",
}: {
  icon: string;
  iconBg?: string;
  iconFg?: string;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-3 rounded-2xl border border-[var(--oa-border)] p-5 ${className}`}>
      <div className="flex items-center gap-2.5">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconBg ?? "bg-[var(--oa-bg)]"} ${iconFg ?? "text-[var(--oa-fg)]"}`}
        >
          <MaterialIcon name={icon} className="text-base" />
        </span>
        <p className="text-sm font-medium text-[var(--oa-fg)]">{label}</p>
      </div>
      <div className="w-full text-base leading-relaxed text-[var(--oa-fg)]">{children}</div>
    </div>
  );
}

function confidenceTone(score: number) {
  if (score >= 75) return { ring: "#10b981", label: "High conviction" };
  if (score >= 50) return { ring: "var(--oa-primary)", label: "Moderate" };
  return { ring: "#f59e0b", label: "Use caution" };
}

function orderedScenarios(scenarios: EarningsIntelScenario[]) {
  const order: EarningsIntelScenario["case"][] = ["bull", "base", "bear"];
  return [...scenarios].sort((a, b) => order.indexOf(a.case) - order.indexOf(b.case));
}

function SectionHeading({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--oa-bg)] text-[var(--oa-fg)]">
        <MaterialIcon name={icon} />
      </span>
      <p className="text-xs font-medium uppercase tracking-widest text-[var(--oa-muted-fg)]">
        {children}
      </p>
    </div>
  );
}

export function EarningsIntelReport({
  doc,
  stock,
  market,
  isSubscribed,
  isTracked,
  tier,
}: Props) {
  const currency = currencySymbolFor(stock?.currency ?? market);
  const scenarios = mergeIntelScenarios(doc, stock?.day_change_pct);
  const leadScenarioCase =
    scenarios.length > 0
      ? [...scenarios].sort((a, b) => b.probability_pct - a.probability_pct)[0]?.case
      : null;
  const confidence = doc.report?.confidence?.score_0_100 ?? null;
  const confidenceReason = doc.report?.confidence?.reason?.trim();
  const monitorList = doc.report?.decision_guide?.key_monitor_list || [];

  const pct = stock?.day_change_pct ?? 0;
  const abs = stock?.day_change_abs ?? 0;
  const positive = pct >= 0;
  const changeBg = positive ? "bg-[#ecfdf5]" : "bg-[#fef2f2]";
  const changeFg = positive ? "text-[#10b981]" : "text-[#ef4444]";
  const mcap = fmtCap(stock?.fundamentals?.market_cap);
  const pe = stock?.fundamentals?.pe_ttm;
  const confTone =
    confidence !== null && Number.isFinite(confidence) ? confidenceTone(confidence) : null;

  return (
    <div className="flex w-full min-w-0 flex-col gap-5 text-base text-[var(--oa-fg)] sm:gap-8">
      <div className="flex flex-col gap-3 px-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-3 sm:gap-y-2 sm:px-0">
        <div className="flex flex-col gap-1.5 text-sm text-[var(--oa-muted-fg)] sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-2">
          <Link
            href="/earnings-intel"
            className="font-medium uppercase tracking-wide text-[var(--oa-muted-fg)] transition-colors hover:text-[var(--oa-fg)]"
          >
            ← Earnings Intel
          </Link>
          <span className="hidden text-[var(--oa-border)] sm:inline">·</span>
          <span className="text-[var(--oa-muted-fg)]">Event {formatEventDate(doc.event_date)}</span>
          <span className="hidden text-[var(--oa-border)] sm:inline">·</span>
          <span className="text-[var(--oa-muted-fg)]">Generated {formatGeneratedAt(doc.generated_at)}</span>
        </div>
        <div className="hidden sm:block">
          <EarningsIntelShare ticker={doc.ticker} headline={doc.report?.headline} />
        </div>
      </div>

      <article
        id="earnings-intel-report"
        className="w-full min-w-0 divide-y divide-[var(--oa-border)] border-y border-[var(--oa-border)] bg-oa-card sm:rounded-[20px] sm:border"
      >
        <header className="px-4 py-5 sm:px-8 sm:py-8 md:p-10">
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:gap-8">
            <div className="min-w-0">
              <Link
                href={`/stock/${encodeURIComponent(doc.ticker)}`}
                className="flex items-start gap-3 sm:gap-4 group"
              >
                <StockLogo ticker={doc.ticker} logoUrl={stock?.logo_url} market={market} size={44} />
                <div className="min-w-0 flex-1">
                  <h1 className="text-xl font-medium leading-tight tracking-tight text-[var(--oa-fg)] transition-colors group-hover:text-[var(--oa-primary)] sm:text-2xl md:text-3xl">
                    {stock?.name || doc.ticker}
                  </h1>
                  <p className="mt-1 text-sm font-medium leading-snug text-[var(--oa-muted-fg)]">
                    <span className="text-[var(--oa-fg)] transition-colors group-hover:text-[var(--oa-primary)]">
                      {doc.ticker}
                    </span>
                    {stock?.exchange ? ` · ${stock.exchange}` : ""}
                    {stock?.sector ? ` · ${stock.sector}` : ""}
                  </p>
                </div>
              </Link>

              {stock ? (
                <div className="mt-4 sm:mt-5">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-2">
                    <span className="text-[1.75rem] font-medium tabular-nums tracking-tight text-[var(--oa-fg)] sm:text-3xl md:text-4xl">
                      {fmtPrice(stock.price, currency)}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-sm font-medium tabular-nums ${changeBg} ${changeFg}`}
                    >
                      {positive ? "▲" : "▼"} {fmtPct(pct)}
                    </span>
                  </div>
                  {Number.isFinite(abs) && abs !== 0 ? (
                    <p className={`mt-1 text-sm font-medium tabular-nums ${changeFg}`}>
                      {fmtAbs(abs, currency)} today
                    </p>
                  ) : null}
                  <ul className="mt-3 flex flex-col gap-1 text-sm text-[var(--oa-muted-fg)] sm:mt-2 sm:flex-row sm:flex-wrap sm:gap-x-3 sm:gap-y-1">
                    {mcap ? <li className="sm:list-none">Mkt cap {currency}{mcap}</li> : null}
                    {typeof pe === "number" && Number.isFinite(pe) ? (
                      <li className="sm:list-none">P/E {pe.toFixed(1)}</li>
                    ) : null}
                    {stock.day_high != null && stock.day_low != null ? (
                      <li className="sm:list-none">
                        Day {fmtPrice(stock.day_low, currency)} – {fmtPrice(stock.day_high, currency)}
                      </li>
                    ) : null}
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="mt-5 flex flex-col gap-4 border-t border-[var(--oa-bg)] pt-5 lg:mt-0 lg:border-t-0 lg:pt-0 lg:items-end">
            {confidence !== null && confTone ? (
              <div className="flex w-full items-center gap-3 rounded-xl bg-[#f8f9fa] px-4 py-3 sm:w-auto sm:bg-transparent sm:px-0 sm:py-0">
                <div
                  className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full sm:h-14 sm:w-14"
                  style={{
                    background: `conic-gradient(${confTone.ring} ${Math.round(confidence)}%, var(--oa-border) 0)`,
                  }}
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-oa-card text-sm font-medium tabular-nums text-[var(--oa-fg)] sm:h-11 sm:w-11">
                    {Math.round(confidence)}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-[var(--oa-muted-fg)]">
                    Confidence
                  </p>
                  <p className="text-sm font-medium text-[var(--oa-fg)]">{confTone.label}</p>
                </div>
              </div>
            ) : null}
            {stock ? (
              <div className="w-full [&_button]:flex [&_button]:h-11 [&_button]:w-full [&_button]:justify-center [&_span]:flex [&_span]:h-11 [&_span]:w-full [&_span]:justify-center sm:[&_button]:inline-flex sm:[&_button]:h-10 sm:[&_button]:w-auto sm:[&_span]:inline-flex sm:[&_span]:h-10 sm:[&_span]:w-auto lg:justify-end">
                <TrackButton
                  ticker={stock.ticker}
                  instrumentId={stock.instrument_id}
                  tier={tier}
                  isSubscribed={isSubscribed}
                  isTracked={isTracked}
                  variant="pill"
                  trackedAsBadge
                />
              </div>
            ) : null}
          </div>
          </div>
        </header>

        <section className="px-4 py-5 sm:px-8 sm:py-8 md:p-10">
          <SectionHeading icon="menu_book">The read</SectionHeading>
          <h2 className="mt-4 text-xl font-medium leading-snug tracking-tight text-[var(--oa-fg)] sm:mt-5 sm:text-2xl md:text-[1.75rem]">
            {doc.report?.headline}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-[var(--oa-fg)] sm:mt-5 sm:text-lg">
            {doc.report?.summary}
          </p>
          {confidenceReason ? (
            <p className="mt-5 text-base leading-relaxed text-[var(--oa-muted-fg)]">
              <span className="font-medium text-[var(--oa-fg)]">Confidence note: </span>
              {confidenceReason}
            </p>
          ) : null}
        </section>

        <section className="px-4 py-5 sm:px-8 sm:py-8 md:p-10">
          <SectionHeading icon="fact_check">What happened</SectionHeading>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {FACT_ITEMS.map(({ key, label, icon, iconBg, iconFg }) => {
              const text = doc.report?.facts?.[key]?.trim();
              if (!text) return null;
              return (
                <InsightCard
                  key={key}
                  icon={icon}
                  iconBg={iconBg}
                  iconFg={iconFg}
                  label={label}
                  className="bg-[#fafafa]"
                >
                  {text}
                </InsightCard>
              );
            })}
          </div>
        </section>

        <section className="px-4 py-5 sm:px-8 sm:py-8 md:p-10">
          <SectionHeading icon="lightbulb">So what</SectionHeading>
          <div className="mt-5 flex flex-col gap-4">
            {INTERP_ITEMS.map(({ key, label, icon }) => {
              const text = doc.report?.interpretation?.[key]?.trim();
              if (!text) return null;
              return (
                <InsightCard
                  key={key}
                  icon={icon}
                  iconBg="bg-[#f5f0ff]"
                  iconFg="text-[#6b38d4]"
                  label={label}
                  className="bg-oa-card md:p-6"
                >
                  {text}
                </InsightCard>
              );
            })}
          </div>
        </section>

        {scenarios.length > 0 ? (
          <section className="px-4 py-5 sm:px-8 sm:py-8 md:p-10">
            <SectionHeading icon="alt_route">Next 30–90 days</SectionHeading>
            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
              {orderedScenarios(scenarios).map((s) => {
                const isLead = s.case === leadScenarioCase;
                const style = scenarioStyle(s.case, isLead);
                const prob = Math.min(100, Math.max(0, s.probability_pct));
                return (
                  <div key={s.case} className={`flex flex-col rounded-2xl border p-5 ${style.card}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`flex h-10 w-10 items-center justify-center rounded-xl bg-oa-card/80 ${style.iconFg}`}
                        >
                          <MaterialIcon name={style.icon} />
                        </span>
                        <span
                          className={`rounded-md px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide ${style.chip}`}
                        >
                          {style.label}
                        </span>
                      </div>
                      <span className="text-xl font-medium tabular-nums text-[var(--oa-fg)]">
                        {Math.round(prob)}%
                      </span>
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-oa-card/70">
                      <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${prob}%` }} />
                    </div>
                    <p className="mt-4 flex-1 text-base leading-relaxed text-[var(--oa-fg)]">{s.thesis}</p>
                    {s.triggers?.length ? (
                      <ul className="mt-4 space-y-2 border-t border-black/5 pt-4 text-sm leading-snug text-[var(--oa-muted-fg)]">
                        {s.triggers.slice(0, 2).map((t) => (
                          <li key={t} className="flex gap-2">
                            <MaterialIcon name="bolt" className="mt-0.5 shrink-0 text-[var(--oa-muted-fg)]" />
                            <span>{t}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        <section className="px-4 py-5 sm:px-8 sm:py-8 md:p-10">
          <SectionHeading icon="checklist">What to do</SectionHeading>
          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
            <InsightCard
              icon="account_balance_wallet"
              iconBg="bg-[#ecfdf5]"
              iconFg="text-[#10b981]"
              label="If you hold it"
              className="bg-[#fafafa] md:p-6"
            >
              {doc.report?.decision_guide?.for_holders || "—"}
            </InsightCard>
            <InsightCard
              icon="visibility"
              iconBg="bg-[#eff6ff]"
              iconFg="text-[var(--oa-primary)]"
              label="If you're watching"
              className="bg-[#fafafa] md:p-6"
            >
              {doc.report?.decision_guide?.for_watchers || "—"}
            </InsightCard>
          </div>
          {monitorList.length > 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-[var(--oa-border)] bg-[#fafafa] p-5">
              <div className="flex items-center gap-2">
                <MaterialIcon name="radar" className="text-[var(--oa-muted-fg)]" />
                <p className="text-xs font-medium uppercase tracking-widest text-[var(--oa-muted-fg)]">
                  Add to Watchlist
                </p>
              </div>
              <ul className="mt-3 flex flex-wrap gap-2">
                {monitorList.map((item) => (
                  <li
                    key={item}
                    className="rounded-full border border-[var(--oa-border)] bg-oa-card px-3.5 py-1.5 text-sm text-[var(--oa-fg)]"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </article>

      <div className="px-4 sm:hidden">
        <p className="mb-3 text-center text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--oa-muted-fg)]">
          Share this report
        </p>
        <EarningsIntelShare
          ticker={doc.ticker}
          headline={doc.report?.headline}
          variant="stacked"
        />
      </div>

      <p className="px-4 text-center text-xs text-[var(--oa-muted-fg)] sm:px-0">
        Stocksbrew post-earnings read · not investment advice
      </p>
    </div>
  );
}
