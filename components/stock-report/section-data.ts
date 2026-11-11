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
    news: extras.news.map((article) => ({
      id: article.id,
      title: article.title,
      url: article.url,
      source_name: article.source_name,
      published_at: article.published_at,
      sentiment_label: article.sentiment_label,
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
