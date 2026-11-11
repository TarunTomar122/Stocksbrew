/**
 * The rollout switch for the tighter Free/Pro line (PAYWALL_V2=1).
 *
 * There is one entitlements table (lib/entitlements.ts); this flag only picks
 * which of its rules are live. next.config.js inlines PAYWALL_V2 into the
 * client and server bundles at build time, so a lock card in the browser and
 * the route that enforces it always read the same rule. The Python jobs read
 * the same variable (backend/subscription_entitlement.py).
 *
 * Pure: no imports, so copy modules can read it without a cycle.
 */

export const PAYWALL_V2: boolean = process.env.PAYWALL_V2 === "1";

/** "v1" or "v2", sent with every paywall and checkout event so the two lines can be compared. */
export const PAYWALL_VARIANT: "v1" | "v2" = PAYWALL_V2 ? "v2" : "v1";

/** How many stocks the agent covers in full on Free: five today, three on the tighter line. */
export const FREE_COVERED_STOCKS: number = PAYWALL_V2 ? 3 : 5;

const WORDS: Record<number, string> = { 1: "one", 2: "two", 3: "three", 4: "four", 5: "five" };

/** "three" or "five", for sentences. */
export const FREE_COVERED_WORD: string = WORDS[FREE_COVERED_STOCKS] ?? String(FREE_COVERED_STOCKS);
