import { unstable_cache } from "next/cache";

import { buildDividendIdeas, IDEA_RULE, isRealEstate, passesRule, yearlyPayMonths, type DividendIdeas, type IdeaStock } from "@/lib/dividend-ideas";
import { parseHistoryDoc, planStock, type AnnouncedDividend, type DividendHistory, type DividendPlan } from "@/lib/dividend-plan";
import { getAnnounced } from "@/lib/dividend-plan-data";
import { adminFirestore } from "@/lib/firebase-admin";
import { shortCompanyName } from "@/lib/plain-copy";
import { getScreenerSnapshot } from "@/lib/screener";
import type { ScreenerRow } from "@/lib/screener-shared";
import type { CallWord } from "@/lib/stock-chart";
import { matchingCompanyReason } from "@/lib/stock-read";

/**
 * Server side of "For more dividend income" on /portfolio/dividends. Read-only.
 *
 * - The rule's fields (payout, years of raises, our call and its company
 *   reason, the last close) come from the screening snapshot
 *   (`tm_screener_snapshot`, backend/agentdata/screener.py).
 * - The yield and the months each stock pays come from its own payment record
 *   (`tm_dividend_history`) and any announced dividends (`tm_agent_calendar`),
 *   projected with the planner's own model (`planStock`), so the months line
 *   up with the person's chart.
 *
 * The list of stocks that pass is the same for everyone, so it is cached per
 * day; the person's holdings and empty months are applied per request.
 */

const HISTORY = "tm_dividend_history";

export type DividendIdeasData = DividendIdeas & {
  /** The close the yields are worked out on. */
  pricesAsOf: string | null;
};

type Pool = { stocks: IdeaStock[]; pricesAsOf: string | null };

function fin(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function callOf(row: ScreenerRow): CallWord | null {
  return row.call === "Add" || row.call === "Hold" || row.call === "Trim" ? row.call : null;
}

/** The snapshot rows worth reading a payment record for: a loose version of the rule on the snapshot's own fields. */
function maybe(row: ScreenerRow): boolean {
  const call = callOf(row);
  if (call !== "Add" && call !== "Hold") return false;
  if (!fin(row.div_growth_years) || row.div_growth_years < IDEA_RULE.minRaiseYears) return false;
  // The snapshot's yield is trailing; the rule's is the current rate. Leave room either side.
  if (!fin(row.div_yield) || row.div_yield < IDEA_RULE.minYield * 0.7 || row.div_yield > IDEA_RULE.maxYield * 1.3) return false;
  if (!isRealEstate(row.sector) && (!fin(row.payout) || row.payout <= 0 || row.payout >= IDEA_RULE.maxPayout)) return false;
  return fin(row.price) && row.price > 0;
}

async function readHistories(symbols: string[]): Promise<Map<string, DividendHistory>> {
  const out = new Map<string, DividendHistory>();
  for (let i = 0; i < symbols.length; i += 100) {
    const chunk = symbols.slice(i, i + 100);
    const snaps = await adminFirestore.getAll(...chunk.map((symbol) => adminFirestore.collection(HISTORY).doc(symbol)));
    snaps.forEach((snap, index) => {
      const parsed = snap.exists ? parseHistoryDoc(snap.data()) : null;
      // Keyed by the id we asked for, not the document's own symbol field.
      if (parsed) out.set(chunk[index]!, parsed);
    });
  }
  return out;
}

async function readPool(today: string): Promise<Pool> {
  const snapshot = await getScreenerSnapshot();
  // Thrown, not returned empty, so a failed read is not cached as "no stock passes" for an hour.
  if (!snapshot) throw new Error("screener snapshot unavailable");
  const rows = snapshot.rows.filter(maybe);
  const since = new Date(Date.parse(`${today.slice(0, 7)}-01T00:00:00Z`) - 130 * 86_400_000).toISOString().slice(0, 10);
  const [histories, announced] = await Promise.all([
    readHistories(rows.map((row) => row.symbol)),
    getAnnounced(since).catch(() => [] as Array<AnnouncedDividend & { ticker: string }>),
  ]);
  const announcedOf = new Map<string, AnnouncedDividend[]>();
  for (const row of announced) {
    const list = announcedOf.get(row.ticker) ?? [];
    list.push({ exDate: row.exDate, payDate: row.payDate, amount: row.amount });
    announcedOf.set(row.ticker, list);
  }

  const stocks: IdeaStock[] = [];
  for (const row of rows) {
    const history = histories.get(row.symbol);
    if (!history) continue;
    const call = callOf(row);
    // Twice, as the row's Ticker shortens it again, so the sentence and the row say the same name ("PNC Financial Services").
    const name = shortCompanyName(shortCompanyName(row.name)) || row.symbol;
    const plan = planStock(
      {
        ticker: row.symbol,
        name,
        shares: null,
        avgCost: null,
        price: row.price ?? null,
        history,
        announced: announcedOf.get(row.symbol) ?? [],
        payout: fin(row.payout) ? row.payout : null,
        sector: row.sector ?? null,
      },
      today,
    );
    if (plan.status !== "pays") continue;
    const payMonths = yearlyPayMonths(plan.payments, history, today);
    const callReason = row.call_reason
      ? matchingCompanyReason({ text: row.call_reason, call, source: row.call_reason_source ?? null }, call, today)
      : null;
    const idea = passesRule({
      ticker: row.symbol,
      name,
      sector: row.sector ?? null,
      price: row.price ?? null,
      perYear: history.perYear,
      latestAmount: history.latestAmount,
      yearAgoAmount: history.yearAgoAmount,
      payout: fin(row.payout) ? row.payout : null,
      raiseYears: fin(row.div_growth_years) ? row.div_growth_years : null,
      call,
      callReason,
      payMonths,
    });
    if (idea) stocks.push(idea);
  }
  return { stocks, pricesAsOf: snapshot.meta.price_history_to ?? snapshot.meta.as_of_day ?? null };
}

// The snapshot is rebuilt once a night and the payment records once a day; an hour is plenty. Keyed by the day,
// so the twelve-month window always matches the person's plan.
const getPool = unstable_cache(readPool, ["dividend-ideas-pool-v4"], { revalidate: 3600 });

/** The section for one plan, or null when the stored data cannot be read. */
export async function loadDividendIdeas(plan: DividendPlan, options: { example?: boolean } = {}): Promise<DividendIdeasData | null> {
  const pool = await getPool(plan.today).catch((error) => {
    console.warn("[dividends] ideas read failed:", error);
    return null;
  });
  if (!pool) return null;
  return { ...buildDividendIdeas(plan, pool.stocks, options), pricesAsOf: pool.pricesAsOf };
}
