/** Display pricing for US Pro (checkout amounts live in Dodo). */
export const US_PRO_MONTHLY = 9;
export const US_PRO_YEARLY = 99;

export const US_PRO_MONTHLY_LABEL = `$${US_PRO_MONTHLY}`;
export const US_PRO_YEARLY_LABEL = `$${US_PRO_YEARLY}`;
export const US_PRO_MONTHLY_MO = `$${US_PRO_MONTHLY}/mo`;
export const US_PRO_PLAN_LINE = `${US_PRO_MONTHLY_MO} or ${US_PRO_YEARLY_LABEL}/yr`;

/** Rounded percent saved vs paying monthly for 12 months. */
export const US_YEARLY_SAVE_PCT = Math.round(
  (1 - US_PRO_YEARLY / (US_PRO_MONTHLY * 12)) * 100,
);
