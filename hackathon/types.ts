export interface ThesisEntity {
  name: string;
  type: "company" | "sector" | "theme" | "product" | "metric";
  ticker?: string;
  role?: "beneficiary" | "risk" | "signal-owner";
  description: string;
}

export interface ThesisDriver {
  id: string;
  label: string;
  description: string;
  polarity: "bullish" | "bearish";
  category: "demand" | "supply" | "pricing" | "competition" | "regulation" | "profitability";
  weight: number;
  horizon: "short" | "medium" | "long";
  trackedEntityNames: string[];
  evidenceKeywords: string[];
}

export interface DisproofCondition {
  id: string;
  condition: string;
  driverId: string;
  threshold: string;
  horizon: "short" | "medium" | "long";
  signals: string[];
}

export interface EvidenceHook {
  id: string;
  label: string;
  driverId: string;
  kind: "confirming" | "disconfirming";
  entityNames: string[];
  keywords: string[];
  sourceTypes: string[];
}

export interface ThesisDraft {
  id: string;
  title: string;
  rawText: string;
  summary: string;
  horizonMonths: number;
  sectors: string[];
  beneficiaryTickers: string[];
  riskTickers: string[];
  entities: ThesisEntity[];
  drivers: ThesisDriver[];
  disproofConditions: DisproofCondition[];
  evidenceHooks: EvidenceHook[];
  createdAt: string;
  updatedAt: string;
}

export interface EvidenceItem {
  id: string;
  source: string;
  sourceType: "transcript" | "filing" | "reported-news" | "industry-data" | "macro" | "market-data";
  url?: string;
  headline: string;
  summary: string;
  date: string;
  entities: string[];
  tags: string[];
}

export interface HookAssessment {
  hookId: string;
  driverId: string;
  matchScore: number;
  direction: "support" | "weaken" | "neutral";
  explanation: string;
  snippet: string;
}

export interface RelevanceAssessment {
  thesisId: string;
  evidenceId: string;
  assessedAt: string;
  strongestDirection: "support" | "weaken" | "neutral";
  assessments: HookAssessment[];
}

export interface ThesisScore {
  thesisId: string;
  overallConfidence: number;
  driverScores: Record<string, number>;
  disproofAlerts: { conditionId: string; triggered: boolean; detail: string }[];
  lastUpdated: string;
}
