import {
  seedAssessment,
  seedEvidence,
  seedScore,
  seedThesis,
} from "../seed";
import type {
  EvidenceItem,
  RelevanceAssessment,
  ThesisDraft,
  ThesisScore,
} from "../types";

export const thesis: ThesisDraft = seedThesis;
export const evidence: EvidenceItem[] = seedEvidence;
export const assessments: RelevanceAssessment[] = seedAssessment;
export const thesisScore: ThesisScore = seedScore;

export const dailyScoreHistory: { date: string; score: number }[] = [
  { date: "May 11", score: 0.69 },
  { date: "May 14", score: 0.64 },
  { date: "May 17", score: 0.72 },
  { date: "May 19", score: 0.78 },
  { date: "May 21", score: 0.76 },
];

export const portfolioImpact = {
  allocation: 18.0,
  allocationChange: "1.8",
  contribution: "11.2",
  contributionLabel: "12m idea P/L contribution",
  riskExposure: "high",
  correlatedAssets: thesis.beneficiaryTickers,
  notes:
    "This thesis now drives a concentrated AI stack bet. Demand and memory pricing remain supportive, but custom silicon and export policy are the two cleanest ways the thesis can break.",
};
