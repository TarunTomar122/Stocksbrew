export type AgentRadarRowLabel = {
  ticker?: string | null;
  instrument_name?: string | null;
};

export type CanonicalAgentRadarLabel = {
  ticker: string;
  name: string;
};

/** Prefer the canonical instrument label; a ticker is the safe fallback. */
export function canonicalAgentRadarLabel(
  row: AgentRadarRowLabel,
  canonical?: { ticker?: string | null; name?: string | null },
): CanonicalAgentRadarLabel {
  const ticker = String(canonical?.ticker || row.ticker || "").trim();
  return {
    ticker,
    name: String(canonical?.name || ticker).trim() || ticker,
  };
}
