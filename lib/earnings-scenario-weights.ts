import type { EarningsIntelDoc, EarningsIntelScenario } from "@/lib/earnings-intel";
import type { MarketEvent, MarketEventScenario } from "@/lib/market-events-shared";

const INTEL_CASE_ORDER: EarningsIntelScenario["case"][] = ["bull", "base", "bear"];

type ScenarioContext = {
  direction?: string;
  day_change_pct?: number | null;
  report?: EarningsIntelDoc["report"];
};

function roundPct(value: number): number {
  return Math.max(0, Math.round(value));
}

function parsePctFromText(text: string | undefined): number | null {
  if (!text) return null;
  const match = text.match(/(-?\d+(?:\.\d+)?)\s*%/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function scenarioMap(scenarios: MarketEventScenario[]): Record<MarketEventScenario["case"], number> {
  const map: Record<MarketEventScenario["case"], number> = { bear: 0, base: 0, bull: 0 };
  for (const scenario of scenarios) {
    map[scenario.case] = roundPct(scenario.probability_pct);
  }
  return map;
}

export function isGenericScenarioSplit(scenarios: MarketEventScenario[] | undefined): boolean {
  if (!scenarios?.length) return true;
  const map = scenarioMap(scenarios);
  const active = [map.bear, map.base, map.bull].filter((value) => value > 0);
  if (active.length < 2) return true;

  const signature = `${map.bear}/${map.base}/${map.bull}`;
  const genericSignatures = new Set([
    "20/50/30",
    "30/50/20",
    "25/50/25",
    "30/40/30",
    "33/34/33",
    "33/33/34",
    "34/33/33",
  ]);
  if (genericSignatures.has(signature)) return true;
  return map.bear === map.base && map.base === map.bull;
}

function normalizeWeights(
  bear: number,
  base: number,
  bull: number,
): MarketEventScenario[] {
  const floor = 8;
  let b = Math.max(floor, bear);
  let n = Math.max(floor, base);
  let u = Math.max(floor, bull);
  const total = b + n + u;
  b = roundPct((b / total) * 100);
  n = roundPct((n / total) * 100);
  u = 100 - b - n;
  if (u < floor) {
    u = floor;
    const remainder = 100 - u;
    b = Math.max(floor, roundPct((b / (b + n)) * remainder));
    n = 100 - u - b;
  }
  if (b < floor) b = floor;
  if (n < floor) n = floor;
  u = 100 - b - n;
  return [
    { case: "bear", probability_pct: b },
    { case: "base", probability_pct: n },
    { case: "bull", probability_pct: u },
  ];
}

export function deriveScenarioWeights(context: ScenarioContext): MarketEventScenario[] {
  let bear = 28;
  let base = 44;
  let bull = 28;

  const facts = context.report?.facts;
  const blob = [
    facts?.reported_vs_expected,
    facts?.guidance_signal,
    facts?.price_reaction,
    facts?.post_earnings_narrative,
    context.direction,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const dayChange =
    typeof context.day_change_pct === "number" && Number.isFinite(context.day_change_pct)
      ? context.day_change_pct
      : parsePctFromText(facts?.price_reaction) ?? 0;

  if (/\b(beat|raised|above|strong|surge|exceeded|outperform)\b/.test(blob)) {
    bull += 14;
    bear -= 9;
    base -= 5;
  } else if (/\b(miss|cut|below|weak|lowered|declined|underperform)\b/.test(blob)) {
    bear += 14;
    bull -= 9;
    base -= 5;
  }

  const moveSkew = Math.max(-16, Math.min(16, dayChange * 0.42));
  bull += moveSkew;
  bear -= moveSkew;

  if (context.direction === "positive" && moveSkew === 0) {
    bull += 8;
    bear -= 5;
    base -= 3;
  } else if (context.direction === "negative" && moveSkew === 0) {
    bear += 8;
    bull -= 5;
    base -= 3;
  }

  const confidence = context.report?.confidence?.score_0_100;
  if (typeof confidence === "number" && Number.isFinite(confidence)) {
    const spread = ((confidence - 50) / 50) * 10;
    const lean =
      dayChange > 0.5 ? 1 : dayChange < -0.5 ? -1 : context.direction === "positive" ? 1 : context.direction === "negative" ? -1 : 0;
    if (lean > 0) {
      bull += spread;
      base -= spread * 0.65;
      bear -= spread * 0.35;
    } else if (lean < 0) {
      bear += spread;
      base -= spread * 0.65;
      bull -= spread * 0.35;
    }
  }

  return normalizeWeights(bear, base, bull);
}

export function resolveDisplayScenarios(
  raw: MarketEventScenario[] | undefined,
  context: ScenarioContext,
): MarketEventScenario[] | undefined {
  if (raw?.length && !isGenericScenarioSplit(raw)) return raw;
  return deriveScenarioWeights(context);
}

export function resolveEventScenarios(
  event: MarketEvent,
  report?: EarningsIntelDoc["report"],
): MarketEventScenario[] | undefined {
  const raw = report?.scenarios_30_90d?.map((scenario) => ({
    case: scenario.case,
    probability_pct: scenario.probability_pct,
  }));
  return resolveDisplayScenarios(raw, {
    direction: event.direction,
    day_change_pct: event.day_change_pct,
    report,
  });
}

export function resolveIntelScenarios(
  doc: EarningsIntelDoc,
  dayChangePct?: number | null,
): MarketEventScenario[] | undefined {
  const raw = doc.report?.scenarios_30_90d?.map((scenario) => ({
    case: scenario.case,
    probability_pct: scenario.probability_pct,
  }));
  const priceReaction = parsePctFromText(doc.report?.facts?.price_reaction);
  const dayChange =
    typeof dayChangePct === "number" && Number.isFinite(dayChangePct)
      ? dayChangePct
      : priceReaction;
  return resolveDisplayScenarios(raw, {
    day_change_pct: dayChange,
    report: doc.report,
  });
}

export function mergeIntelScenarios(
  doc: EarningsIntelDoc,
  dayChangePct?: number | null,
): EarningsIntelScenario[] {
  const resolved = resolveIntelScenarios(doc, dayChangePct) ?? [];
  const rawByCase = new Map(
    (doc.report?.scenarios_30_90d ?? []).map((row) => [row.case, row]),
  );
  return INTEL_CASE_ORDER.map((caseName) => {
    const display = resolved.find((row) => row.case === caseName);
    const raw = rawByCase.get(caseName);
    if (!display && !raw) return null;
    return {
      case: caseName,
      probability_pct: display?.probability_pct ?? raw!.probability_pct,
      thesis: raw?.thesis ?? "",
      triggers: raw?.triggers ?? [],
      invalidators: raw?.invalidators ?? [],
    };
  }).filter((row): row is EarningsIntelScenario => Boolean(row));
}
