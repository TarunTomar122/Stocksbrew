import { pickInsights, type Insight, type TheRead } from "@/lib/insights";

import { COMPANY_LINE } from "./rebalance";
import type { IdeasResult, LossIdea, TrimIdea } from "./types";
import { callPlain, fmtPct, joinList, portfolioWord, usd } from "./words";

/**
 * The read on top of the ideas page: what is out of line, what fixing it
 * would cost in tax at the assumed rates, and what loss could be sold for
 * tax. Rules over the plan; nothing is written by a model.
 */

function taxClause(trim: TrimIdea, rates: IdeasResult["rates"]): string {
  const tax = trim.tax;
  if (!tax || tax.unmatchedShares > 0) return "";
  if (Math.abs(tax.tax) < 5) return "; the sale would be close to its cost, so about no tax";
  if (tax.tax < 0) return `; it would be sold at a loss, which could lower tax by about ${usd(tax.tax)}`;
  const hasShort = Math.abs(tax.short) >= 1 || Math.abs(tax.unknown) >= 1;
  const hasLong = Math.abs(tax.long) >= 1;
  const rate =
    hasShort && hasLong
      ? `${rates.short}% on the short-term part and ${rates.long}% on the long-term part`
      : hasLong
        ? `the ${rates.long}% long-term rate`
        : `the ${rates.short}% short-term rate`;
  return `; the tax on that sale would be about ${usd(tax.tax)} at ${rate}`;
}

function lossSentence(loss: LossIdea, subject: IdeasResult["subject"]): Insight {
  const look = loss.similar[0];
  const taxPart = loss.taxSaved >= 5 ? `; selling could cut tax by about ${usd(loss.taxSaved)} if there are gains to set it against` : "";
  return {
    id: `loss-${loss.ticker}`,
    tone: "down",
    text: `${loss.ticker} is ${usd(loss.loss)} (${Math.abs(Math.round(loss.lossPct))}%) below what ${subject === "example" ? "was" : "you"} paid${taxPart}.`,
    soWhat: look ? `${look.name} is a similar ${look.fund ? "fund" : "company"} to hold meanwhile.` : undefined,
    tickers: [loss.ticker],
    leadName: loss.name,
  };
}

export function buildIdeasRead(result: IdeasResult): TheRead | null {
  const { plan, losses, subject, rates } = result;
  if (!(plan.total > 0)) return null;
  const where = portfolioWord(subject);
  const companyTrims = plan.trims.filter((trim) => trim.kind === "company");
  // Every company over the line, trimmed or not (two share classes are one company).
  const overCount = new Set(companyTrims.map((trim) => trim.subject)).size + plan.moreOver.length + plan.unsized.length + plan.fundOnly.length;
  const paid = subject === "example" ? "what was paid" : "what you paid";
  const sectorShift = plan.sectors[0] ?? null;
  const lossTotal = losses.reduce((sum, loss) => sum + loss.loss, 0);

  let headline: string;
  if (companyTrims.length > 0 && overCount >= 2) {
    headline = `${overCount} companies are each above ${COMPANY_LINE}% of ${where} once the funds are counted, led by ${companyTrims[0]!.subject} at ${fmtPct(companyTrims[0]!.before)}.`;
  } else if (companyTrims.length > 0) {
    headline = `${companyTrims[0]!.subject} is ${fmtPct(companyTrims[0]!.before)} of ${where} once the funds are counted, above the ${COMPANY_LINE}% line we use for one company.`;
  } else if (sectorShift && plan.trims.length > 0) {
    headline = `${sectorShift.sector} is ${fmtPct(sectorShift.before)} of ${where}, against ${fmtPct(sectorShift.benchmark)} of the S&P 500.`;
  } else if (plan.trims.length > 0) {
    const drift = plan.trims[0]!;
    headline = `${drift.name} has grown to ${fmtPct(drift.before)} of ${where}, well past its share of the money put in.`;
  } else if (losses.length > 0) {
    headline = `Nothing needs rebalancing, but ${losses.length === 1 ? `${losses[0]!.name} sits` : `${losses.length} holdings sit`} ${usd(lossTotal)} below ${paid}.`;
  } else {
    headline = "Nothing needs rebalancing, and no holding is far enough below its cost to be worth selling for tax.";
  }

  const insights: Array<Insight | null> = [];
  const lead = plan.trims[0];
  if (lead) {
    insights.push({
      id: `trim-${lead.ticker}`,
      tone: "flat",
      text: `${lead.ticker}: ${lead.sentence.replace(/\.$/, "")}${taxClause(lead, rates)}.`,
      soWhat: lead.call ? `Our call on it is ${callPlain(lead.call)}${lead.call === "Add" ? ", so this is only about size" : ""}.` : undefined,
      tickers: [lead.ticker],
      leadName: lead.name,
    });
  }
  if (sectorShift) {
    insights.push({
      id: `sector-${sectorShift.sector}`,
      tone: "flat",
      text: `${sectorShift.sector} is ${fmtPct(sectorShift.before)} of ${where} against ${fmtPct(sectorShift.benchmark)} of the S&P 500; the trims below would bring it to ${fmtPct(sectorShift.after)}.`,
      soWhat: sectorShift.shortBy ?? undefined,
    });
  } else if (plan.trims.length > 1) {
    const rest = [...new Set(plan.trims.slice(1).map((trim) => trim.name))];
    insights.push({
      id: "trim-rest",
      tone: "flat",
      text: `${joinList(rest)} ${rest.length === 1 ? "has" : "have"} a trim idea too, below.`,
      tickers: plan.trims.slice(1, 4).map((trim) => trim.ticker),
    });
  }
  if (plan.adds.length > 0) {
    const names = plan.adds.map((add) => add.name);
    insights.push({
      id: "adds",
      tone: "up",
      text: `The ${usd(plan.proceeds)} raised could go to ${joinList(names)}, where our call is Buy more and the sector is not already heavy.`,
      soWhat: plan.leftover >= 100 ? `About ${usd(plan.leftover)} would be left with no holding we would add to.` : undefined,
      tickers: plan.adds.map((add) => add.ticker),
    });
  }
  if (losses[0]) insights.push(lossSentence(losses[0], subject));
  if (plan.trims.length === 0 && plan.quiet) {
    insights.unshift({ id: "quiet", tone: "flat", text: plan.quiet });
  }

  return { headline, insights: pickInsights(insights), asOf: null };
}
