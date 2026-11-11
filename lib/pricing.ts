/** Display pricing for US Pro (checkout amounts live in Dodo). */
export const US_PRO_MONTHLY = 19;
export const US_PRO_YEARLY = 190;

export const US_PRO_MONTHLY_LABEL = `$${US_PRO_MONTHLY}`;
export const US_PRO_YEARLY_LABEL = `$${US_PRO_YEARLY}`;
export const US_PRO_MONTHLY_MO = `$${US_PRO_MONTHLY}/mo`;
export const US_PRO_PLAN_LINE = `${US_PRO_MONTHLY_MO} or ${US_PRO_YEARLY_LABEL}/yr`;

/** Rounded percent saved vs paying monthly for 12 months. */
export const US_YEARLY_SAVE_PCT = Math.round(
  (1 - US_PRO_YEARLY / (US_PRO_MONTHLY * 12)) * 100,
);

/**
 * The Pro trial at US checkout, in days. The real length is set on the Dodo
 * product; this is the number the copy promises. lib/llms.test.ts fails when a
 * "N-day" trial line in the app says something else.
 */
export const US_PRO_TRIAL_DAYS = 3;
