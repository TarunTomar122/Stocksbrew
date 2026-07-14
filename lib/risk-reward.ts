export const MAX_RISK_REWARD_RATIO = 100;

export function capRiskRewardRatio(ratio: number): number {
  return Math.min(ratio, MAX_RISK_REWARD_RATIO);
}

export function formatRiskRewardRatio(ratio: number): string {
  const capped = capRiskRewardRatio(ratio);
  return capped >= 10 ? `${Math.round(capped)} : 1` : `${capped.toFixed(1)} : 1`;
}
