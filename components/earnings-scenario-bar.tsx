import type { MarketEventScenario } from "@/lib/market-events-shared";

const CASE_ORDER: MarketEventScenario["case"][] = ["bear", "base", "bull"];

type Lean = "bull" | "bear" | "mixed";

const LEAN_META: Record<Lean, { color: string; text: string; sentence: string }> = {
  bull: {
    color: "#10b981",
    text: "#047857",
    sentence: "Expect a bullish move in the near term.",
  },
  bear: {
    color: "#ef4444",
    text: "#b91c1c",
    sentence: "Expect a bearish move in the near term.",
  },
  mixed: {
    color: "#0052ff",
    text: "#1d4ed8",
    sentence: "Expect range-bound trading in the near term.",
  },
};

function readScenarios(
  scenarios: MarketEventScenario[] | undefined,
): { lean: Lean; confidence: number } | null {
  const valid = (scenarios ?? []).filter(
    (s) => CASE_ORDER.includes(s.case) && Number.isFinite(s.probability_pct),
  );
  if (valid.length === 0) return null;

  const total = valid.reduce((sum, s) => sum + Math.max(0, s.probability_pct), 0);
  if (total <= 0) return null;

  const pct = (c: MarketEventScenario["case"]) => {
    const found = valid.find((s) => s.case === c);
    return found ? (found.probability_pct / total) * 100 : 0;
  };
  const bull = pct("bull");
  const bear = pct("bear");
  const neutral = pct("base");

  // Lean is set by the stronger directional case; confidence rolls the neutral
  // case into the lean (a bullish-or-flat read versus a bearish-or-flat read).
  let lean: Lean = "mixed";
  let confidence = neutral;
  if (bull > bear) {
    lean = "bull";
    confidence = bull + neutral;
  } else if (bear > bull) {
    lean = "bear";
    confidence = bear + neutral;
  } else {
    lean = "mixed";
    confidence = Math.max(bull, bear) + neutral;
  }

  return { lean, confidence: Math.min(100, Math.round(confidence)) };
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
  const read = readScenarios(scenarios);
  if (!read) return null;

  const meta = LEAN_META[read.lean];

  return (
    <div className={`flex w-full flex-col gap-1.5 ${className}`}>
      <p
        className={`flex items-center gap-1.5 font-medium leading-snug ${
          compact ? "text-[11px]" : "text-[12px]"
        }`}
        style={{ color: meta.text }}
      >
        <span
          className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: meta.color }}
          aria-hidden
        />
        {meta.sentence}
      </p>
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#f3f4f6]">
          <span
            className="block h-full rounded-full"
            style={{ width: `${read.confidence}%`, background: meta.color }}
          />
        </div>
        <span
          className={`shrink-0 tabular-nums font-semibold text-[#6b7280] ${
            compact ? "text-[10px]" : "text-[11px]"
          }`}
        >
          {read.confidence}% confidence
        </span>
      </div>
    </div>
  );
}
