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
      className="group grid min-w-0 gap-3 px-4 py-4 no-underline transition-colors hover:bg-[var(--rn-card-2)] sm:grid-cols-[minmax(9rem,0.8fr)_minmax(15rem,1.5fr)_7rem_5rem_7rem] sm:items-center"
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <StockLogo ticker={idea.ticker} market={idea.market} size={30} className="shrink-0" />
        <span className="min-w-0">
          <span className="block text-[14.5px] font-semibold text-[var(--rn-ink)] group-hover:underline">{idea.ticker}</span>
          <span className="block truncate text-[12px] text-[var(--rn-muted)]">{idea.name}</span>
        </span>
      </span>

      <span className="min-w-0 text-[13px] leading-relaxed text-[var(--rn-muted)]">
        {idea.reason}
        {idea.tag ? <span className="ml-1 font-medium text-[var(--rn-ink)]">· {idea.tag}</span> : null}
      </span>

      <span className="flex items-baseline justify-between gap-2 sm:block sm:text-right">
        <span className="font-mono text-[14px] font-semibold tabular-nums text-[var(--rn-ink)]">{priceText(idea)}</span>
        <span className="font-mono text-[12px] font-medium tabular-nums sm:mt-1 sm:block" style={{ color: moveColor }}>
          {changeText(idea.dayChangePct)}
        </span>
      </span>

      <span className="hidden text-right font-mono text-[15px] font-semibold tabular-nums sm:block" style={{ color: scoreColor(idea.score) }}>
        {idea.score === null ? "–" : Math.round(idea.score)}
      </span>

      <span className="hidden text-right font-mono text-[12px] font-medium tabular-nums sm:block" style={{ color: (idea.targetUpsidePct ?? 0) >= 0 ? "var(--rn-bull)" : "var(--rn-bear)" }}>
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
        <h2 id="rn-ideas" className="text-[16px] font-medium tracking-tight text-[var(--rn-ink)]">
          Ideas to explore
        </h2>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--rn-line)]">
        <div className="hidden grid-cols-[minmax(9rem,0.8fr)_minmax(15rem,1.5fr)_7rem_5rem_7rem] gap-3 border-b border-[var(--rn-line)] bg-[var(--rn-card-2)] px-4 py-3 sm:grid">
          <span className="text-[13px] font-medium text-[var(--rn-muted)]">Company</span>
          <span className="text-[13px] font-medium text-[var(--rn-muted)]">Why it fits</span>
          <span className="text-right text-[13px] font-medium text-[var(--rn-muted)]">Price</span>
          <span className="text-right text-[13px] font-medium text-[var(--rn-muted)]">Score</span>
          <span className="text-right text-[13px] font-medium text-[var(--rn-muted)]">Target</span>
        </div>
        <div className="divide-y divide-[var(--rn-line)]">
          {ideas.map((idea) => <IdeaRow key={`${idea.market}-${idea.ticker}`} idea={idea} />)}
        </div>
      </div>
    </section>
  );
}
