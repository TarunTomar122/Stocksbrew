import { pickInsights, type Insight, type TheRead } from "@/lib/insights";
import type { HarvestRow, TaxPicture } from "@/lib/portfolio-tax";

/**
 * The read on the tax tab: what this year's sells add up to, what losses the
 * open lots could take today, and which of those a sale now would trip into a
 * wash sale. Plain sums over the lots the person entered; nothing is guessed.
 */

function usd(value: number): string {
  return `$${Math.round(Math.abs(value)).toLocaleString("en-US")}`;
}

function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** Tickers by the size of their loss, largest first, one entry per stock. */
function lossTickers(rows: HarvestRow[]): string[] {
  const byTicker = new Map<string, number>();
  for (const row of rows) byTicker.set(row.ticker, (byTicker.get(row.ticker) ?? 0) + row.loss);
  return [...byTicker.entries()].sort((a, b) => a[1] - b[1]).map(([ticker]) => ticker);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function buildTaxRead(picture: TaxPicture, currentYear: number): TheRead | null {
  if (picture.instruments.length === 0) return null;
  const year = picture.years.find((summary) => summary.year === currentYear) ?? null;
  const gains = year?.total ?? 0;
  const losses = picture.harvestTotals.total; // negative or zero
  const harvestNames = lossTickers(picture.harvest);

  let headline: string;
  if (losses < -0.5 && gains > 0.5) {
    headline =
      Math.abs(losses) >= gains
        ? `Your open losses (${usd(losses)}) are larger than the ${usd(gains)} you have realised in ${currentYear}.`
        : `You have realised ${usd(gains)} in ${currentYear}; open losses of ${usd(losses)} could offset ${Math.round((Math.abs(losses) / gains) * 100)}% of it.`;
  } else if (gains > 0.5) {
    headline = `You have realised ${usd(gains)} of gains in ${currentYear}, and no open lot is below its cost.`;
  } else if (gains < -0.5) {
    headline = `You have realised a net loss of ${usd(gains)} in ${currentYear}.`;
  } else if (losses < -0.5) {
    headline = `No gains realised in ${currentYear}; ${usd(losses)} of losses sit in open lots.`;
  } else {
    headline = `Nothing realised in ${currentYear}, and no open lot is below its cost.`;
  }

  const insights: Array<Insight | null> = [];

  if (year && Math.abs(year.total) > 0.5 && Math.abs(year.short) > 0.5) {
    const shortShare = Math.round((Math.abs(year.short) / (Math.abs(year.short) + Math.abs(year.long) + Math.abs(year.unknown))) * 100);
    insights.push({
      id: "term",
      tone: year.short > 0 ? "down" : "flat",
      text: `${shortShare}% of this year's realised result is short term (${year.short >= 0 ? "" : "−"}${usd(year.short)}), against ${year.long >= 0 ? "" : "−"}${usd(year.long)} long term.`,
      soWhat: year.short > 0 ? "Short-term gains are taxed as ordinary income." : undefined,
    });
  }

  if (picture.harvest.length > 0) {
    const named = harvestNames.slice(0, 3);
    const more = harvestNames.length - named.length;
    insights.push({
      id: "harvest",
      tone: "down",
      text: `${usd(losses)} of losses across ${picture.harvest.length} open ${picture.harvest.length === 1 ? "lot" : "lots"}: ${joinAnd(more > 0 ? [...named, `${more} more`] : named)}.`,
      soWhat: Math.abs(picture.harvestTotals.short) > 0.5 ? `${usd(picture.harvestTotals.short)} of it is short term.` : undefined,
      tickers: named,
    });
  }

  const washRisk = picture.harvest.filter((row) => row.recentBuys.length > 0);
  if (washRisk.length > 0) {
    const names = [...new Set(washRisk.map((row) => row.ticker))];
    insights.push({
      id: "wash-risk",
      tone: "flat",
      text: `${names.length === 1 ? `${names[0]} was` : `${joinAnd(names.slice(0, 3))} were`} bought in the last 30 days, so selling at a loss now could be a wash sale.`,
      soWhat: "Wait until the window clears or the loss may be disallowed.",
      tickers: names.slice(0, 3),
    });
  }

  // A losing lot that turns long term soon: selling before that date keeps the loss short term.
  const turning = picture.harvest
    .filter((row) => row.longTermOn && daysBetween(picture.today, row.longTermOn) > 0 && daysBetween(picture.today, row.longTermOn) <= 60)
    .sort((a, b) => (a.longTermOn as string).localeCompare(b.longTermOn as string))[0];
  if (turning) {
    insights.push({
      id: "turning",
      tone: "flat",
      text: `${turning.ticker} lot at a ${usd(turning.loss)} loss turns long term in ${daysBetween(picture.today, turning.longTermOn as string)} days.`,
      soWhat: "A loss taken before then counts as short term.",
      tickers: [turning.ticker],
    });
  }

  if (year && year.washSales > 0) {
    insights.push({
      id: "wash",
      tone: "down",
      text: `${year.washSales} ${year.washSales === 1 ? "sale" : "sales"} this year had a buy of the same stock within 30 days${year.washDisallowed > 0.5 ? `, about ${usd(year.washDisallowed)} of loss at risk` : ""}.`,
    });
  }

  return { headline, insights: pickInsights(insights), asOf: null };
}
