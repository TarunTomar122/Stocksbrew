import { instrumentIdOf } from "@/lib/email-subscribers";
import { linkSubscriberToAccount } from "@/lib/email-subscribers-store";
import { FREE_COVERED_STOCKS } from "@/lib/paywall-flag";

/**
 * A new account whose address had the no-account morning email: link the signup to the account (so the address
 * never gets two morning emails) and, when the signup was confirmed and the account follows nothing yet, start it on
 * the signup's stocks, up to the free limit. Called once, when /api/auth/session makes the user doc. Never throws:
 * signing in must not fail over this.
 */

type AddStock = (input: {
  uid: string;
  instrumentId: string;
  positionType: "watchlist";
  skipRebuild: boolean;
  mutationId: string;
  requestedBy: "email_seed";
}) => Promise<unknown>;

export type SeedDeps = {
  link?: typeof linkSubscriberToAccount;
  readTracked?: (uid: string) => Promise<string[]>;
  add?: AddStock;
  limit?: number;
};

export async function seedFromSubscription(input: { uid: string; email: string | null | undefined }, deps: SeedDeps = {}): Promise<string[]> {
  const email = String(input.email ?? "").trim().toLowerCase();
  if (!email) return [];
  try {
    const link = deps.link ?? linkSubscriberToAccount;
    const tickers = await link({ uid: input.uid, email, limit: deps.limit ?? FREE_COVERED_STOCKS });
    if (!tickers.length) return [];
    const readTracked =
      deps.readTracked ??
      (async (uid: string) => {
        const { getTrackedStocks } = await import("@/lib/watchlist");
        return getTrackedStocks(uid);
      });
    if ((await readTracked(input.uid)).length > 0) return [];
    const add: AddStock =
      deps.add ??
      (async (args) => {
        const { addRadarStock } = await import("@/lib/radar-mutations");
        return addRadarStock(args);
      });
    const added: string[] = [];
    for (const [index, ticker] of tickers.entries()) {
      try {
        await add({
          uid: input.uid,
          instrumentId: instrumentIdOf(ticker),
          positionType: "watchlist",
          // One rebuild of the person's view, after the last stock.
          skipRebuild: index < tickers.length - 1,
          mutationId: `email-seed-${input.uid}-${ticker}`,
          requestedBy: "email_seed",
        });
        added.push(ticker);
      } catch (error) {
        console.warn(`[email-capture] seed ${ticker} failed for ${input.uid.slice(0, 6)}:`, (error as Error)?.message);
      }
    }
    return added;
  } catch (error) {
    console.warn(`[email-capture] link failed for ${input.uid.slice(0, 6)}:`, (error as Error)?.message);
    return [];
  }
}
