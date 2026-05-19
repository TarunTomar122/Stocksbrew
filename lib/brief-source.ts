export const LLM_BRIEF_SOURCE = "llm" as const;

export type BriefSource = "rules" | typeof LLM_BRIEF_SOURCE;

/** True for LLM-generated briefs (`llm` or legacy Firestore `mimo`). */
export function isLlmBriefSource(source: unknown): boolean {
  const normalized = String(source || "").toLowerCase();
  return normalized === LLM_BRIEF_SOURCE || normalized === "mimo";
}
