import Link from "next/link";

import { StockLogo } from "@/components/stock-logo";
import type { DecisionCard } from "@/components/radar-next/types";

function money(value: number | null, currency: string): string {
  if (value === null) return "Price unavailable";
  return `${currency}${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function move(value: number | null): string | null {
  if (value === null) return null;
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}%`;
}

function directionColor(direction: DecisionCard["direction"]): string {
  if (direction === "bullish") return "var(--rn-bull)";
  if (direction === "bearish") return "var(--rn-bear)";
  return "var(--rn-muted)";
}

function decisionPills(item: DecisionCard): string[] {
  const trigger = item.nextTrigger?.replace(/^Zone reached:\s*/i, "").trim();
  return [item.catalyst, trigger].filter((value): value is string => Boolean(value));
}

export function DecisionQueue({
  items,
  openLoops = 0,
}: {
  items: DecisionCard[];
  openLoops?: number;
}) {
  const visibleItems = items.slice(0, 3);
  if (visibleItems.length === 0) return null;

  return (
    <section aria-labelledby="rn-decisions">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <span className="rn-kick">Today</span>
          <h2 id="rn-decisions" className="mt-1 text-[21px] font-bold tracking-[-0.025em] text-[var(--rn-ink)] sm:text-[25px]">
            Decisions worth looking at
          </h2>
        </div>
        <p className="font-mono text-[10.5px] text-[var(--rn-muted)]">
          {visibleItems.length} actionable · {openLoops} open {openLoops === 1 ? "checkpoint" : "checkpoints"}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {visibleItems.map((item, index) => {
            const color = directionColor(item.direction);
            const dayMove = move(item.dayChangePct);
            const pills = decisionPills(item);
            return (
              <Link
                key={`${item.market}-${item.ticker}-${item.action}`}
                href={item.href}
                className="group flex min-h-[10.5rem] min-w-0 flex-col rounded-xl border border-[var(--rn-line)] bg-[var(--rn-card)] p-4 no-underline transition-colors hover:bg-[var(--rn-card-2)]"
                style={item.urgent ? { borderColor: color } : undefined}
              >
                <span className="flex min-w-0 items-start justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <StockLogo ticker={item.ticker} market={item.market} size={30} className="shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-bold text-[var(--rn-ink)] group-hover:underline">
                        {item.ticker}
                      </span>
                      <span className="block font-mono text-[9.5px] uppercase tracking-wide text-[var(--rn-muted)]">
                        {item.positionLabel ?? "Tracked"}
                      </span>
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-mono text-[12px] font-semibold tabular-nums text-[var(--rn-ink)]">
                      {money(item.price, item.currency)}
                    </span>
                    {dayMove ? (
                      <span
                        className="mt-0.5 block font-mono text-[9.5px] font-semibold"
                        style={{ color: (item.dayChangePct ?? 0) >= 0 ? "var(--rn-bull)" : "var(--rn-bear)" }}
                      >
                        {dayMove}
                      </span>
                    ) : null}
                  </span>
                </span>

                <span className="mt-4 min-w-0">
                  <span className="block text-[14px] font-bold leading-snug" style={{ color }}>
                    {item.action}
                  </span>
                  {item.driver ? (
                    <span className="mt-2 block text-[11.5px] leading-relaxed text-[var(--rn-muted)]">
                      <span className="font-semibold text-[var(--rn-ink)]">Why:</span> {item.driver}
                    </span>
                  ) : null}
                  {pills.length > 0 ? (
                    <span className="mt-2.5 flex flex-wrap gap-1.5">
                      {pills.map((pill) => (
                        <span
                          key={pill}
                          className="rounded-full border border-[var(--rn-line)] bg-[var(--rn-card-2)] px-2.5 py-1 text-[10.5px] font-medium leading-none text-[var(--rn-muted)]"
                        >
                          {pill}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </span>

                <span className="mt-auto flex items-center justify-between gap-3 pt-4 font-mono text-[9.5px] uppercase tracking-wide text-[var(--rn-muted)]">
                  <span>{item.urgent ? "Needs review" : "On watch"}</span>
                  <span>
                    {item.score !== null ? `Score ${Math.round(item.score)}` : String(index + 1).padStart(2, "0")}
                  </span>
                </span>
              </Link>
            );
        })}
      </div>
    </section>
  );
}
