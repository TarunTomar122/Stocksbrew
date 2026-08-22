import { AnimatedIcon } from "@/components/animated-icon";
import Link from "next/link";
import { StockLogo } from "@/components/stock-logo";
import type { EarningsIntelDoc } from "@/lib/earnings-intel";
import { resolveIntelScenarios } from "@/lib/earnings-scenario-weights";
import type { StockSummary } from "@/lib/stock";

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function confidenceLabel(score: number) {
  if (score >= 75) return { text: "High conviction", className: "bg-[#ecfdf5] text-[#10b981]" };
  if (score >= 50) return { text: "Moderate", className: "bg-[#eff6ff] text-[var(--oa-primary)]" };
  return { text: "Use caution", className: "bg-[#fef3c7] text-[#b45309]" };
}

function topScenario(doc: EarningsIntelDoc) {
  const scenarios = resolveIntelScenarios(doc) ?? [];
  if (!scenarios.length) return null;
  return [...scenarios].sort((a, b) => b.probability_pct - a.probability_pct)[0];
}

type EarningsIntelListProps = {
  docs: EarningsIntelDoc[];
  stockByTicker: Record<string, StockSummary | null>;
  market: "US" | "IN";
};

export function EarningsIntelList({ docs, stockByTicker, market }: EarningsIntelListProps) {
  if (docs.length === 0) {
    return (
      <div className="mx-4 rounded-2xl border border-dashed border-[var(--oa-border)] bg-[#fafafa] px-6 py-12 text-center sm:mx-0">
        <AnimatedIcon name="analytics" size={40} className="text-[var(--oa-muted-fg)]" aria-hidden />
        <h2 className="mt-4 text-lg font-medium text-[var(--oa-fg)]">No reports yet</h2>
        <p className="mx-auto mt-2 max-w-md text-base leading-relaxed text-[var(--oa-muted-fg)]">
          Post-earnings briefs land here after companies report. Check the{" "}
          <Link href="/earnings" className="font-medium text-[var(--oa-primary)] hover:underline">
            earnings calendar
          </Link>{" "}
          for upcoming dates.
        </p>
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3 px-4 sm:px-0">
        <div>
          <h2 className="text-sm font-medium uppercase tracking-widest text-[var(--oa-muted-fg)]">
            All reports
          </h2>
          <p className="mt-1 text-base text-[var(--oa-muted-fg)]">
            {docs.length} post-earnings {docs.length === 1 ? "brief" : "briefs"}, newest first
          </p>
        </div>
        <p className="text-sm text-[var(--oa-muted-fg)]">Tap a card for the full brief</p>
      </div>

      <ul className="flex flex-col gap-3 px-0 sm:gap-4">
        {docs.map((doc) => {
          const stock = stockByTicker[doc.ticker] ?? null;
          const confidence = doc.report?.confidence?.score_0_100;
          const conf =
            confidence != null && Number.isFinite(confidence)
              ? confidenceLabel(confidence)
              : null;
          const leadScenario = topScenario(doc);

          return (
            <li key={doc.doc_id}>
              <Link
                href={`/earnings-intel/${encodeURIComponent(doc.ticker)}`}
                className="group block border-y border-[var(--oa-border)] bg-oa-card transition-colors hover:bg-[#fafafa] sm:rounded-2xl sm:border sm:hover:border-[var(--oa-fg)] sm:hover:shadow-sm"
              >
                <div className="flex gap-4 px-4 py-5 sm:p-6">
                  <StockLogo
                    ticker={doc.ticker}
                    logoUrl={stock?.logo_url}
                    market={doc.market ?? market}
                    size={48}
                    className="shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 gap-y-1">
                      <span className="text-base font-medium text-[var(--oa-fg)]">{doc.ticker}</span>
                      {stock?.name ? (
                        <span className="truncate text-sm text-[var(--oa-muted-fg)]">{stock.name}</span>
                      ) : null}
                      <span className="w-full text-xs text-[var(--oa-muted-fg)] sm:ml-auto sm:w-auto">
                        Earnings {formatDate(doc.event_date)}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      {conf ? (
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${conf.className}`}
                        >
                          {confidence != null ? `${Math.round(confidence)} · ` : ""}
                          {conf.text}
                        </span>
                      ) : null}
                      {leadScenario ? (
                        <span className="inline-flex items-center rounded-full bg-[var(--oa-bg)] px-2.5 py-0.5 text-xs font-medium capitalize text-[var(--oa-fg)]">
                          {leadScenario.case} {Math.round(leadScenario.probability_pct)}%
                        </span>
                      ) : null}
                    </div>

                    <h3 className="mt-3 text-lg font-medium leading-snug tracking-tight text-[var(--oa-fg)] group-hover:text-[var(--oa-primary)] sm:text-xl">
                      {doc.report?.headline || `${doc.ticker} earnings update`}
                    </h3>
                    <p className="mt-2 text-base leading-relaxed text-[var(--oa-muted-fg)]">
                      {doc.report?.summary || "Open full report"}
                    </p>
                    <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[var(--oa-fg)]">
                      Read full report
                      <AnimatedIcon
                        name="arrow_forward"
                        size={18}
                        className="transition-transform group-hover:translate-x-0.5"
                        aria-hidden
                      />
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
