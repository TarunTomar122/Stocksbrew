import type { MarketEventScenario } from "@/lib/market-events-shared";

const CASE_ORDER: MarketEventScenario["case"][] = ["bear", "base", "bull"];

const CASE_META: Record<
  MarketEventScenario["case"],
  { label: string; color: string; soft: string; text: string }
> = {
  bear: { label: "Bear", color: "#ef4444", soft: "#fef2f2", text: "#b91c1c" },
  base: { label: "Neutral", color: "#0052ff", soft: "#eff6ff", text: "#1d4ed8" },
  bull: { label: "Bull", color: "#10b981", soft: "#ecfdf5", text: "#047857" },
};

const TIE_BREAK: Record<MarketEventScenario["case"], number> = {
  bull: 0,
  base: 1,
  bear: 2,
};

function leadScenario(
  scenarios: MarketEventScenario[] | undefined,
): MarketEventScenario | null {
  const valid = (scenarios ?? []).filter(
    (scenario) =>
      CASE_ORDER.includes(scenario.case) && Number.isFinite(scenario.probability_pct),
  );
  if (valid.length === 0) return null;

  return [...valid].sort((a, b) => {
    const pctDiff = b.probability_pct - a.probability_pct;
    if (pctDiff !== 0) return pctDiff;
    return TIE_BREAK[a.case] - TIE_BREAK[b.case];
  })[0];
}

export function EarningsScenarioBar({
  scenarios,
  compact = false,
  className = "",
}: {
  scenarios: MarketEventScenario[] | undefined;
  compact?: boolean;
  className?: string;
}) {
  const lead = leadScenario(scenarios);
  if (!lead) return null;

  const meta = CASE_META[lead.case];
  const pct = Math.round(lead.probability_pct);

  return (
    <span
      className={`inline-flex w-fit items-center gap-2 rounded-lg font-semibold uppercase tracking-[0.06em] ${
        compact ? "px-2 py-1 text-[10px]" : "px-2.5 py-1.5 text-[11px] sm:text-[12px]"
      } ${className}`}
      style={{ background: meta.soft, color: meta.text }}
      aria-label={`${meta.label} case ${pct}%`}
    >
      <span
        className={`inline-block shrink-0 rounded-full ${compact ? "h-1.5 w-1.5" : "h-2 w-2"}`}
        style={{ background: meta.color }}
        aria-hidden
      />
      {meta.label}
      <span className="tabular-nums text-[#111111]">{pct}%</span>
    </span>
  );
}
