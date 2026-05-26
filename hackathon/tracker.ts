import type {
  EvidenceItem,
  HookAssessment,
  RelevanceAssessment,
  ThesisDraft,
  ThesisScore,
} from "./types";

const POSITIVE_TERMS = [
  "raised",
  "accelerated",
  "strong",
  "beat",
  "up",
  "surge",
  "expansion",
  "sold out",
  "healthy",
  "elevated",
];

const NEGATIVE_TERMS = [
  "cut",
  "weak",
  "slowdown",
  "pressure",
  "falling",
  "decline",
  "restriction",
  "ban",
  "delay",
  "digest",
];

function tokenize(text: string) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function countHits(tokens: string[], candidates: string[]) {
  return candidates.reduce((total, candidate) => {
    const parts = tokenize(candidate);
    if (parts.length === 0) return total;
    return parts.every((part) => tokens.includes(part)) ? total + 1 : total;
  }, 0);
}

function classifyDirection(text: string, kind: "confirming" | "disconfirming"): HookAssessment["direction"] {
  const tokens = tokenize(text);
  const positiveHits = countHits(tokens, POSITIVE_TERMS);
  const negativeHits = countHits(tokens, NEGATIVE_TERMS);

  if (positiveHits === negativeHits) return "neutral";
  if (kind === "confirming") return positiveHits > negativeHits ? "support" : "weaken";
  return negativeHits > positiveHits ? "support" : "weaken";
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function assessEvidence(thesis: ThesisDraft, evidence: EvidenceItem[]): RelevanceAssessment[] {
  const now = new Date().toISOString();

  return evidence.map((item) => {
    const body = `${item.headline} ${item.summary}`;
    const tokens = tokenize(body);

    const assessments = thesis.evidenceHooks.map((hook) => {
      const entityHits = countHits(tokens, hook.entityNames);
      const keywordHits = countHits(tokens, hook.keywords);
      const sourceMatch = hook.sourceTypes.includes(item.sourceType) ? 1 : 0;
      const rawScore = entityHits * 0.45 + keywordHits * 0.25 + sourceMatch * 0.3;
      const matchScore = clamp(rawScore, 0, 1);
      const direction = classifyDirection(body, hook.kind);
      const explanationParts = [];

      if (entityHits > 0) explanationParts.push(`${entityHits} entity hit`);
      if (keywordHits > 0) explanationParts.push(`${keywordHits} keyword hit`);
      if (sourceMatch > 0) explanationParts.push(`source=${item.sourceType}`);

      return {
        hookId: hook.id,
        driverId: hook.driverId,
        matchScore,
        direction: matchScore < 0.2 ? "neutral" : direction,
        explanation: explanationParts.join(", ") || "low overlap",
        snippet: item.headline,
      };
    });

    const strongest = assessments
      .filter((assessment) => assessment.matchScore >= 0.2)
      .sort((left, right) => right.matchScore - left.matchScore)[0];

    return {
      thesisId: thesis.id,
      evidenceId: item.id,
      assessedAt: now,
      strongestDirection: strongest?.direction || "neutral",
      assessments,
    };
  });
}

export function updateThesisScore(thesis: ThesisDraft, assessments: RelevanceAssessment[]): ThesisScore {
  const driverTotals: Record<string, number> = {};
  const driverCounts: Record<string, number> = {};

  for (const result of assessments) {
    for (const assessment of result.assessments) {
      if (assessment.matchScore < 0.2) continue;
      const signal =
        assessment.direction === "support"
          ? assessment.matchScore
          : assessment.direction === "weaken"
            ? -assessment.matchScore
            : 0;

      driverTotals[assessment.driverId] = (driverTotals[assessment.driverId] || 0) + signal;
      driverCounts[assessment.driverId] = (driverCounts[assessment.driverId] || 0) + 1;
    }
  }

  const driverScores: Record<string, number> = {};
  for (const driver of thesis.drivers) {
    const average =
      driverCounts[driver.id] && driverCounts[driver.id] > 0
        ? driverTotals[driver.id] / driverCounts[driver.id]
        : 0;
    driverScores[driver.id] = clamp(0.5 + average * 0.45, 0.05, 0.95);
  }

  const weightTotal = thesis.drivers.reduce((sum, driver) => sum + driver.weight, 0) || 1;
  const overallConfidence = thesis.drivers.reduce(
    (sum, driver) => sum + (driverScores[driver.id] || 0.5) * driver.weight,
    0,
  ) / weightTotal;

  const disproofAlerts = thesis.disproofConditions.map((condition) => {
    const score = driverScores[condition.driverId] || 0.5;
    const triggered = score < 0.35;
    return {
      conditionId: condition.id,
      triggered,
      detail: triggered
        ? `Driver at ${(score * 100).toFixed(0)}%, below disproof threshold`
        : `Driver stable at ${(score * 100).toFixed(0)}%`,
    };
  });

  return {
    thesisId: thesis.id,
    overallConfidence,
    driverScores,
    disproofAlerts,
    lastUpdated: new Date().toISOString(),
  };
}
