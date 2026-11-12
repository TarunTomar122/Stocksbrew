import { caseWireHeadlines } from "@/lib/wire-casing";

import type { ReportData, ReportExtras, SectionData, SectionOwnership } from "./types";

/**
 * The slice of the report the sections draw, shaped on the server so only
 * what they show goes to the browser (types.ts `SectionData`). The chart's
 * ranges, article summaries and tags, and every Follow slug on the site are
 * left behind.
 */
export function toSectionData(data: ReportData, extras: Omit<ReportExtras, "timeline">): SectionData {
  const { stock } = data;
  const people = new Set((extras.congress ?? []).map((trade) => trade.person_id));
  return {
    stock: {
      ticker: stock.ticker,
      name: stock.name,
      instrument_id: stock.instrument_id,
      price: stock.price,
      day_change_pct: stock.day_change_pct,
      description: stock.description,
      sector: stock.sector,
      industry: stock.industry,
      exchange: stock.exchange,
      country: stock.country,
    },
    market: data.market,
    currency: data.currency,
    nowIso: data.nowIso,
    facts: data.facts,
    fundamentals: data.fundamentals,
    intelPro: data.intelPro,
    technicals: extras.technicals,
    earnings: data.earnings,
    ownership: sectionOwnership(extras.ownership),
    congress: extras.congress,
    followSlugs: extras.followSlugs.filter((slug) => people.has(slug)),
    // Headlines in sentence case as /news writes them (lib/wire-casing.ts), the stock's own name kept as written; a
    // company's own release keeps its product names (the casing reads `sourceKind`), and excerpts teach it the day's words.
    news: caseWireHeadlines(
      extras.news.map((article) => ({ ...article, sourceKind: article.source_kind ?? "", excerpt: article.summary })),
      { [stock.ticker]: stock.name },
    ).map((article) => ({
      id: article.id,
      title: article.title,
      url: article.url,
      source_name: article.source_name,
      // One ISO form, so the row's day words read it whatever shape the feed stored.
      published_at: isoOr(article.published_at),
      tone: article.tone ?? null,
    })),
    reddit: extras.reddit,
    peers: extras.peers,
    series: data.series
      ? {
          source: data.series.source,
          adjusted: data.series.adjusted,
          firstDate: data.series.firstDate,
          lastDate: data.series.lastDate,
          fetchedAt: data.series.fetchedAt,
          allTimeHigh: data.series.allTimeHigh,
          allTimeLow: data.series.allTimeLow,
          longReturns: data.series.longReturns,
        }
      : null,
    multiple: data.multiple,
  };
}

/** The stamp as ISO when it parses, else as it came. */
function isoOr(value: string): string {
  const at = Date.parse(value);
  return Number.isFinite(at) ? new Date(at).toISOString() : value;
}

/** Fund rows and exits the Ownership section shows (sections.tsx); the rest only count toward the flow line. */
const FUND_ROWS = 8;
const FUND_EXITS = 4;

function sectionOwnership(ownership: ReportExtras["ownership"]): SectionOwnership {
  const funds = ownership.funds;
  return {
    insiders: ownership.insiders,
    funds: funds
      ? {
          ...funds,
          rows: funds.rows.slice(0, FUND_ROWS),
          exits: funds.exits.slice(0, FUND_EXITS),
          added: funds.rows.filter((row) => row.action === "new" || row.action === "added").length,
          cut: funds.rows.filter((row) => row.action === "trimmed").length + funds.exits.length,
        }
      : null,
  };
}

/** No extras yet: what the top of the page alone says about which sections will have something. */
export const NO_EXTRAS: Omit<ReportExtras, "timeline"> = {
  technicals: null,
  ownership: { funds: null, insiders: null },
  congress: null,
  followSlugs: [],
  news: [],
  reddit: null,
  peers: [],
};
