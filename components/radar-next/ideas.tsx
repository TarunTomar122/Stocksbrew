import Link from "next/link";

import { StockLogo } from "@/components/stock-logo";
import type { IdeaCard } from "@/components/radar-next/types";

function scoreColor(value: number | null): string {
  if (value === null) return "var(--rn-muted)";
  if (value >= 70) return "var(--rn-bull)";
  if (value >= 50) return "var(--signal-neutral)";
  return "var(--rn-bear)";
}

function currencySymbol(code: string | null): string {
  if (code === "INR") return "₹";
  if (code === "USD") return "$";
  return code ?? "";
}

function priceText(idea: IdeaCard): string {
  if (idea.price === null) return "–";
  return `${currencySymbol(idea.currency)}${idea.price.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function changeText(value: number | null): string {
  if (value === null) return "–";
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}%`;
}

function IdeaRow({ idea }: { idea: IdeaCard }) {
  const moveColor =
    idea.dayChangePct === null
      ? "var(--rn-muted)"
      : idea.dayChangePct >= 0
        ? "var(--rn-bull)"
        : "var(--rn-bear)";
  return (
    <Link
      href={idea.href}
      className="group grid min-w-0 gap-3 py-4 no-underline transition-colors hover:bg-[var(--rn-card-2)] sm:grid-cols-[minmax(9rem,0.8fr)_minmax(15rem,1.5fr)_7rem_5rem_7rem] sm:items-center sm:px-3"
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <StockLogo ticker={idea.ticker} market={idea.market} size={28} className="shrink-0" />
        <span className="min-w-0">
          <span className="block text-[13px] font-bold text-[var(--rn-ink)] group-hover:underline">{idea.ticker}</span>
          <span className="block truncate text-[10.5px] text-[var(--rn-muted)]">{idea.name}</span>
        </span>
      </span>

      <span className="min-w-0 text-[11.5px] leading-relaxed text-[var(--rn-muted)]">
        {idea.reason}
        {idea.tag ? <span className="ml-1 font-mono text-[9px] uppercase tracking-wide text-[var(--rn-ink)]">· {idea.tag}</span> : null}
      </span>

      <span className="flex items-baseline justify-between gap-2 sm:block sm:text-right">
        <span className="font-mono text-[12.5px] font-semibold tabular-nums text-[var(--rn-ink)]">{priceText(idea)}</span>
        <span className="font-mono text-[10.5px] font-semibold tabular-nums sm:mt-1 sm:block" style={{ color: moveColor }}>
          {changeText(idea.dayChangePct)}
        </span>
      </span>

      <span className="hidden text-right font-mono text-[12px] font-bold tabular-nums sm:block" style={{ color: scoreColor(idea.score) }}>
        {idea.score === null ? "–" : Math.round(idea.score)}
      </span>

      <span className="hidden text-right font-mono text-[10.5px] font-semibold tabular-nums sm:block" style={{ color: (idea.targetUpsidePct ?? 0) >= 0 ? "var(--rn-bull)" : "var(--rn-bear)" }}>
        {idea.targetUpsidePct === null ? "–" : `${idea.targetUpsidePct >= 0 ? "+" : ""}${Math.round(idea.targetUpsidePct)}% target`}
      </span>
    </Link>
  );
}

export function Ideas({
  fits,
  top,
  unusual,
}: {
  fits: IdeaCard[];
  top: IdeaCard[];
  unusual: IdeaCard[];
}) {
  const seen = new Set<string>();
  const ideas = [...unusual, ...fits, ...top].filter((idea) => {
    const key = `${idea.market}:${idea.ticker}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (ideas.length === 0) return null;

  return (
    <section aria-labelledby="rn-ideas">
      <div className="mb-3">
        <div>
          <span className="rn-kick">Discovery</span>
          <h2 id="rn-ideas" className="mt-1 text-[22px] font-bold tracking-[-0.025em] text-[var(--rn-ink)] sm:text-[26px]">
            Ideas to explore
          </h2>
        </div>
      </div>

      <div className="divide-y divide-[var(--rn-line)] border-y border-[var(--rn-line)]">
        {ideas.map((idea) => <IdeaRow key={`${idea.market}-${idea.ticker}`} idea={idea} />)}
      </div>
    </section>
  );
}
