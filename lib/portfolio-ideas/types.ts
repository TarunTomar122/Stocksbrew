import type { Term } from "@/lib/portfolio-tax";

/**
 * Rebalancing and tax-loss ideas: the shapes shared by the pure rules, the
 * server loader and the page. Nothing here trades or connects to a broker;
 * every idea is arithmetic on holdings the person entered (or the example).
 */

export type { Term };
export type CallWord = "Add" | "Hold" | "Trim";
export type IdeasSubject = "mine" | "example";

/** One open lot: shares still held at one cost, bought (or saved) on one day. */
export type IdeaLot = {
  /** YYYY-MM-DD, or null when we do not know when it was bought. */
  acquired: string | null;
  shares: number;
  costPerShare: number;
};

export type IdeaHolding = {
  ticker: string;
  name: string;
  instrumentId: string;
  /** A fund (ETF): never trimmed for concentration, and its look-alikes are funds. */
  fund: boolean;
  shares: number | null;
  price: number | null;
  /** shares x price, else a value the person typed in, else null. */
  value: number | null;
  /** Today's move in percent, from the same quote as `price`; null when the price is an older close. */
  dayPct?: number | null;
  /** Open lots; empty when the cost is unknown. */
  lots: IdeaLot[];
  /** Where the lots come from: the Taxes page, the average cost and saved day, or nowhere. */
  basis: "lots" | "saved" | "none";
  /** Buys of this stock in the last 30 days (YYYY-MM-DD), for the wash-sale warning. */
  recentBuys: string[];
  call: CallWord | null;
  /** The company-specific reason for the call, when it was written for this call. */
  callReason: string | null;
  sector: string | null;
  industry: string | null;
  marketCap: number | null;
  ret1y: number | null;
};

/** Percent rates the estimate assumes: short term for a year or less, long term for longer. */
export type TaxRates = { short: number; long: number };

export type SaleTax = {
  shares: number;
  proceeds: number;
  /** Gain (negative: loss) by holding term, on the shares matched to a lot. */
  short: number;
  long: number;
  unknown: number;
  gain: number;
  /** Estimated tax at the rates; negative when the sale is a loss that lowers tax. */
  tax: number;
  /** Shares sold beyond the lots we know, so with no cost: not in the estimate. */
  unmatchedShares: number;
  /** When every short-term share in a gain turns long term within 90 days: that day, and the tax then at today's price. */
  waitUntil: string | null;
  waitTax: number | null;
};

export type TrimKind = "company" | "sector" | "drift";

export type TrimIdea = {
  id: string;
  kind: TrimKind;
  ticker: string;
  name: string;
  call: CallWord | null;
  callReason: string | null;
  shares: number;
  /** Dollars the sale would raise at today's price. */
  amount: number;
  /** Share of the holding sold, percent. */
  ofHolding: number;
  /** What the idea is about: the company, or the sector for a sector trim. */
  subject: string;
  /**
   * The subject's share of the portfolio today and after this one sale on its
   * own, percent, on the x-ray's base (funds counted). Never after the other
   * trims: every number on a card is measured against today's portfolio.
   */
  before: number;
  after: number;
  /** The line the idea aims for, percent. */
  target: number;
  reached: boolean;
  /** Part of the company held through funds, percent of the portfolio (company ideas). */
  viaFunds: number;
  /** One plain sentence: "Selling about 20 NVIDIA shares would bring it from 14% to 10% of this portfolio." */
  sentence: string;
  /** Why it came up, one sentence. */
  why: string;
  /** FIFO estimate, or null when the cost is unknown. */
  tax: SaleTax | null;
  /** Selling the highest-cost lots first instead, when that saves real money. */
  cheaper: SaleTax | null;
};

export type AddIdea = {
  id: string;
  ticker: string;
  name: string;
  call: CallWord | null;
  callReason: string | null;
  shares: number;
  amount: number;
  before: number;
  after: number;
  sector: string | null;
  sentence: string;
};

export type SectorShift = {
  sector: string;
  before: number;
  after: number;
  benchmark: number;
  target: number;
  /** Why the trims stop short of the target, when they do. */
  shortBy: string | null;
};

export type RebalancePlan = {
  total: number;
  trims: TrimIdea[];
  adds: AddIdea[];
  proceeds: number;
  /** Proceeds no add idea uses. */
  leftover: number;
  /** Sum of the trims' estimated tax, when every trim has a cost. */
  taxTotal: number | null;
  sectors: SectorShift[];
  /** Companies above the line only through funds, which a trim of a stock cannot fix. */
  fundOnly: Array<{ ticker: string; name: string; pct: number }>;
  /** Companies above the line held directly, but with no share count or price to size a trim from. */
  unsized: Array<{ ticker: string; name: string; pct: number }>;
  /** Companies above the line left out because only the biggest few get an idea. */
  moreOver: Array<{ ticker: string; name: string; pct: number }>;
  /** Every company above the line once funds are counted, biggest first, whatever happened to it. */
  companiesOver: Array<{ ticker: string; name: string; pct: number }>;
  /** Above the line, but our call is Buy more or Keep, so no idea sells them. */
  buyMoreOver: Array<{ ticker: string; name: string; pct: number; callReason: string | null; call: "Add" | "Hold" }>;
  /** Companies above the line whose trim would be too small to matter (under the minimum sale). */
  small: Array<{ ticker: string; name: string; pct: number }>;
  /** Set when there is nothing to do: why that is a fine answer. */
  quiet: string | null;
};

export type SimilarPick = {
  ticker: string;
  name: string;
  fund: boolean;
  /** One sentence on why it is similar, with the numbers. */
  why: string;
  call: CallWord | null;
  held: boolean;
  /** For a stock: its size and past-year move, for the side-by-side bars. */
  marketCap?: number | null;
  ret1y?: number | null;
  /** For a fund: how much of the two funds is in the same companies, percent. */
  overlap?: number | null;
};

export type LossIdea = {
  id: string;
  ticker: string;
  name: string;
  fund: boolean;
  /** Shares in the lots that sit below their cost. */
  shares: number;
  value: number;
  cost: number;
  /** Negative dollars. */
  loss: number;
  lossPct: number;
  term: Term;
  /** Tax it could save at the rates, if there are gains to set it against (positive dollars). */
  taxSaved: number;
  short: number;
  long: number;
  unknown: number;
  /** When a short-term losing lot turns long term within 60 days. */
  longTermOn: string | null;
  /** The latest buy in the last 30 days, which would make a sale today a possible wash sale. */
  recentBuy: string | null;
  /** The recent "buy" is only the day the holding was saved, not a recorded buy. */
  recentIsSave: boolean;
  /** First day it is safe to buy it back after a sale today. */
  buyBackFrom: string;
  call: CallWord | null;
  callReason: string | null;
  similar: SimilarPick[];
  /** The holding's own size and past-year move, beside its look-alikes'. */
  marketCap?: number | null;
  ret1y?: number | null;
  /** "Tell me if UNH falls another 5%": a ready request for the agents page. */
  watch: { label: string; href: string } | null;
};

export type IdeasResult = {
  subject: IdeasSubject;
  today: string;
  rates: TaxRates;
  plan: RebalancePlan;
  losses: LossIdea[];
  /** How the tax is worked out: lots from the Taxes page, saved days, a mix, or not at all. */
  basis: "lots" | "saved" | "mixed" | "none";
};
