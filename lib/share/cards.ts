/**
 * The words on a share card. Pure rules over facts the page loaders already
 * worked out (lib/share/facts.ts pulls them from lib/xray-data,
 * lib/stress-test-data, lib/dividend-plan-data, lib/memo/server and
 * lib/portfolio-data). Nothing here computes a portfolio figure; it only picks
 * which of those figures to say and says it in the first person.
 *
 * Privacy, by default: percentages and company names only. No dollar amounts,
 * share counts or total value. `hideNames` swaps every company and fund name
 * for a plain description; `showAmounts` lets a dividend card say its dollar
 * figure. `checkCardPrivacy` is the last check before anything is shown or
 * saved, so a rule that slips cannot leak.
 */

import { pctWords, ratioWords, windowWords } from "@/lib/stress-test";
import { fmtFilingDay, fmtPct, joinList } from "@/lib/xray";

import {
  pickVariant,
  variantKey,
  type ShareBarRow,
  type ShareCandidate,
  type ShareCard,
  type ShareKind,
  type ShareLine,
  type ShareOptions,
  type ShareTone,
} from "./types";

/* ── facts: what each loader hands over ─────────────────────────────────── */

export type XrayFacts = {
  /** Biggest companies once funds are opened up, biggest first (up to five). */
  companies: Array<{ name: string; ticker: string; sector: string | null; pct: number; directPct: number; fundPct: number; funds: string[] }>;
  /** Biggest single stock bought directly, percent. */
  maxDirectPct: number;
  /** Biggest sectors once funds are counted (up to four), with the S&P 500's weight. */
  sectors: Array<{ sector: string; pct: number; benchmarkPct: number | null }>;
  /** The two funds that overlap most. */
  overlap: { a: string; b: string; pct: number; shared: number } | null;
  /** Share of the money in funds we cannot open, percent. */
  closedPct: number;
  /** Fund filing dates used, oldest first. */
  filingDates: string[];
};

export type StressEpisodeFacts = {
  id: string;
  name: string;
  start: string;
  end: string;
  kind: "fall" | "rise";
  /** Covered holdings' return, percent. */
  portfolio: number;
  market: number;
  ratio: number | null;
  /** Share of the portfolio the figure covers, as shown on the page; 100 when nothing is missing. */
  coveredPct: number;
  /** Why part is missing: "not-yet" when it was not trading yet, else no prices. Null when nothing is missing. */
  missing: "not-yet" | "no-prices" | null;
  /** The holding that moved the result most in its direction (a stock over a broad fund, as on the page). */
  lead: { name: string; pct: number; fund: boolean } | null;
};

export type StressFacts = { episodes: StressEpisodeFacts[] };

export type DividendFacts = {
  /** Dollars expected over the next twelve months, from holdings with a share count. */
  total: number;
  confirmed: number;
  /** Twelve months, oldest first. */
  months: Array<{ month: string; total: number; names: string[] }>;
  /** Stocks that pay a regular dividend, and every stock in the plan. */
  payers: number;
  stocks: number;
  /** Regular dividends against today's price over the holdings with a cost and a price, percent (the page's own yield). */
  yieldOnPrice: number | null;
  /** Payers whose regular payment rose 3% or more against a year earlier, biggest first. */
  raises: Array<{ name: string; changePct: number }>;
  /** Payers with a payment a year ago to compare with. */
  comparable: number;
  /** Newest dividend record, ISO. */
  asOf: string | null;
};

export type MemoFacts = {
  weekKey: string;
  monday: string;
  friday: string;
  complete: boolean;
  /** The memo's own sentences, rules-written: how the holdings did, and who drove it. */
  performance: string;
  drivers: string | null;
};

export type PortfolioFacts = {
  /** Biggest holdings by value (up to five), share of the portfolio. */
  positions: Array<{ name: string; sector: string | null; pct: number }>;
  top3: number | null;
  /** Biggest sector tilts against the S&P 500 (stocks bought directly; funds are left out). */
  sectors: Array<{ sector: string; pct: number; benchmarkPct: number }>;
  hasFunds: boolean;
  beta: number | null;
  volatility: number | null;
  benchmarkVolatility: number | null;
  pricesAsOf: string | null;
};

export type ShareFacts =
  | { kind: "xray"; facts: XrayFacts }
  | { kind: "stress"; facts: StressFacts }
  | { kind: "dividends"; facts: DividendFacts }
  | { kind: "memo"; facts: MemoFacts }
  | { kind: "portfolio"; facts: PortfolioFacts };

/* ── small words ────────────────────────────────────────────────────────── */

const fin = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function capital(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/** "$1,220", "$84": dividend totals round to the dollar. */
function dollars(value: number): string {
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH_LETTERS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

function monthName(month: string): string {
  return MONTH_NAMES[Number(month.slice(5, 7)) - 1] ?? month;
}

const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
function count(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

/** A stable short hash, so the server can tell the card that was previewed from one built a moment later. */
export function cardHash(card: ShareCard): string {
  const text = JSON.stringify(card);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/* ── one builder per read ───────────────────────────────────────────────── */

type Draft = Omit<ShareCard, "v" | "kind" | "cardId" | "asOf">;
type Builder = { cardId: string; label: string; hasNames: boolean; hasAmounts: boolean; build: (options: ShareOptions) => Draft | null };

function rankLabel(index: number, sector: string | null): string {
  return sector ? `#${index + 1} · ${sector}` : `#${index + 1}`;
}

function xrayBuilders(f: XrayFacts): Builder[] {
  const out: Builder[] = [];
  const footnote = f.filingDates.length > 0 ? `Fund holdings from SEC filings as of ${fmtFilingDay(f.filingDates[f.filingDates.length - 1])}` : "Fund holdings from SEC filings";
  const companyBars = (options: ShareOptions) =>
    f.companies.length >= 2
      ? {
          title: "Biggest companies, funds counted",
          style: "share" as const,
          rows: f.companies.slice(0, 5).map<ShareBarRow>((row, index) => ({
            label: options.hideNames ? rankLabel(index, row.sector) : row.name,
            value: Math.round(row.pct * 10) / 10,
            display: fmtPct(row.pct),
            tone: "flat",
            highlight: index === 0,
          })),
        }
      : null;

  const top = f.companies[0];
  if (top && top.pct > 0) {
    out.push({
      cardId: "top",
      label: "My biggest company",
      hasNames: true,
      hasAmounts: false,
      build: (options) => {
        const name = options.hideNames ? "my biggest company" : top.name;
        const funds = options.hideNames || top.funds.length === 0 ? "my funds" : joinList(top.funds);
        let headline: string;
        const fundsMove = top.fundPct > 0 && (top.directPct === 0 || fmtPct(top.pct) !== fmtPct(top.directPct));
        if (fundsMove && top.directPct > 0) headline = `Once my funds are counted, ${name} is ${fmtPct(top.pct)} of my portfolio, not the ${fmtPct(top.directPct)} I bought directly.`;
        else if (fundsMove && top.pct > f.maxDirectPct) headline = `Once my funds are counted, ${name} is ${fmtPct(top.pct)} of my portfolio, more than any stock I bought.`;
        else if (fundsMove) headline = `Once my funds are counted, ${name} is ${fmtPct(top.pct)} of my portfolio, all of it through ${funds}.`;
        else headline = `${capital(name)} is my biggest company at ${fmtPct(top.pct)} of my portfolio, with my funds counted.`;
        const lines: ShareLine[] = [];
        const second = f.companies[1];
        if (second && second.fundPct > 0 && second.directPct === 0 && !options.hideNames) {
          lines.push({ text: `${second.name} is ${fmtPct(second.pct)}, all of it through my funds.`, tone: "flat" });
        }
        return { topic: "What I really own", headline, lines, bars: companyBars(options), footnote };
      },
    });
  }

  const sector = f.sectors[0];
  // Like the page: shares of the whole compare with the index only when little money sits in funds we cannot open.
  if (sector && sector.benchmarkPct !== null && f.closedPct <= 10) {
    const bench = sector.benchmarkPct;
    out.push({
      cardId: "sector",
      label: `${sector.sector} share`,
      hasNames: false,
      hasAmounts: false,
      build: () => ({
        topic: "What I really own",
        headline: `${sector.sector} is ${fmtPct(sector.pct)} of my portfolio once my funds are counted, against ${fmtPct(bench)} of the S&P 500.`,
        lines: [],
        bars: {
          title: "Sectors, funds counted · S&P 500 weight",
          style: "share",
          rows: f.sectors.slice(0, 4).map((row, index) => ({
            label: row.sector,
            value: Math.round(row.pct * 10) / 10,
            display: row.benchmarkPct !== null ? `${fmtPct(row.pct)} · S&P ${fmtPct(row.benchmarkPct)}` : fmtPct(row.pct),
            tone: "flat",
            highlight: index === 0,
          })),
        },
        footnote,
      }),
    });
  }

  const overlap = f.overlap;
  if (overlap && overlap.pct >= 20 && overlap.shared > 1) {
    out.push({
      cardId: "overlap",
      label: "Funds that overlap",
      hasNames: true,
      hasAmounts: false,
      build: (options) => ({
        topic: "What I really own",
        headline: `${options.hideNames ? "Two of my funds" : `${overlap.a} and ${overlap.b}`} overlap by ${fmtPct(overlap.pct)}: weight for weight, that much of each is in the same ${overlap.shared} companies.`,
        lines: [{ text: "Owning both spreads my money less than two funds suggest.", tone: "flat" }],
        bars: companyBars(options),
        footnote,
      }),
    });
  }
  return out;
}

function stressBuilders(f: StressFacts): Builder[] {
  const usable = f.episodes.filter((item) => fin(item.portfolio) && fin(item.market));
  const falls = usable.filter((item) => item.kind === "fall");
  const picked: StressEpisodeFacts[] = [];
  const add = (item: StressEpisodeFacts | undefined) => {
    if (item && !picked.includes(item)) picked.push(item);
  };
  // The worst fall, the fall it held up best in, the 2022 slide (the one most people remember), then the rally.
  add([...falls].sort((a, b) => a.portfolio - b.portfolio)[0]);
  add([...falls].filter((item) => item.market <= -2).sort((a, b) => b.portfolio - b.market - (a.portfolio - a.market))[0]);
  add(falls.find((item) => item.id === "rates-2022"));
  add(usable.find((item) => item.kind === "rise"));

  return picked.slice(0, 4).map((item) => {
    const fell = item.portfolio < 0;
    const flat = Math.abs(item.portfolio) < 0.05;
    return {
      cardId: item.id,
      label: `The ${item.name}`,
      hasNames: Boolean(item.lead),
      hasAmounts: false,
      build: (options: ShareOptions): Draft => {
        const subject =
          item.missing === null
            ? "my portfolio"
            : item.missing === "not-yet"
              ? `the ${item.coveredPct}% of my portfolio that was trading then`
              : `the ${item.coveredPct}% of my portfolio with prices for those days`;
        const verb = flat ? "would have ended flat" : `would have ${fell ? "fallen" : "risen"} ${pctWords(item.portfolio)}`;
        const compare = ratioWords(item);
        const marketWords = Math.abs(item.market) < 0.05 ? "the S&P 500 was flat" : `the S&P 500 ${item.market < 0 ? "fell" : "rose"} ${pctWords(item.market)}`;
        const same = compare !== null && /about as much as the S&P 500$/.test(compare);
        const headline = same
          ? `In the ${item.name}, ${subject} ${verb}, about the same as the S&P 500.`
          : `In the ${item.name}, ${subject} ${verb} while ${marketWords}.`;
        const lines: ShareLine[] = [];
        if (item.lead && Math.abs(item.lead.pct) >= 0.05) {
          const down = item.lead.pct < 0;
          const who = options.hideNames ? (down ? "My biggest drag" : "My biggest lift") : item.lead.name;
          lines.push({
            text: options.hideNames
              ? `${who} was ${down ? "down" : "up"} ${pctWords(item.lead.pct)}.`
              : `${who} ${down ? "did the most damage" : "added the most"}, ${down ? "down" : "up"} ${pctWords(item.lead.pct)}.`,
            tone: down ? "down" : "up",
          });
        }
        return {
          topic: "Stress test",
          headline,
          lines,
          bars: {
            title: windowWords(item.start, item.end),
            style: "versus",
            rows: [
              { label: "My portfolio", value: Math.round(item.portfolio * 10) / 10, display: signed(item.portfolio), tone: toneOf(item.portfolio), highlight: true },
              { label: "S&P 500", value: Math.round(item.market * 10) / 10, display: signed(item.market), tone: toneOf(item.market) },
            ],
          },
          // On the card itself, so the image says it too: this is a replay, not a prediction.
          footnote: "History, not a forecast · today's holdings",
        };
      },
    };
  });
}

function signed(value: number): string {
  const text = pctWords(value);
  if (text === "0%") return "0%";
  return `${value > 0 ? "+" : "−"}${text}`;
}

function toneOf(value: number): ShareTone {
  if (Math.abs(value) < 0.05) return "flat";
  return value > 0 ? "up" : "down";
}

function dividendBuilders(f: DividendFacts): Builder[] {
  const out: Builder[] = [];
  const footnote = `Announced and estimated dividends${f.asOf ? ` · as of ${fmtFilingDay(f.asOf)}` : ""}`;
  const monthBars = (options: ShareOptions) =>
    f.total > 0
      ? {
          title: options.showAmounts ? "Next twelve months" : "Next twelve months, % of the year",
          style: "months" as const,
          rows: f.months.map<ShareBarRow>((month) => ({
            label: MONTH_LETTERS[Number(month.month.slice(5, 7)) - 1] ?? "",
            // The stored bar is the share of the year unless amounts are on, so no monthly dollars sit in a snapshot.
            value: options.showAmounts ? Math.round(month.total) : Math.round((month.total / f.total) * 1000) / 10,
            display: options.showAmounts ? (month.total > 0 ? dollars(month.total) : null) : month.total > 0 ? `${Math.round((month.total / f.total) * 100)}%` : null,
            tone: "flat",
          })),
        }
      : null;

  if (f.total > 0 || f.payers > 0) {
    const announced = f.total > 0 ? Math.round((f.confirmed / f.total) * 100) : 0;
    out.push({
      cardId: "income",
      label: "What my stocks pay",
      hasNames: false,
      hasAmounts: f.total > 0,
      build: (options) => {
        let headline: string;
        if (options.showAmounts && f.total > 0) {
          headline = `My stocks should pay me about ${dollars(f.total)} in dividends over the next twelve months.`;
        } else if (f.yieldOnPrice !== null && f.yieldOnPrice > 0) {
          headline = `At today's prices, my stocks pay about ${f.yieldOnPrice.toFixed(1)}% a year in dividends.`;
        } else {
          headline =
            f.stocks === 1
              ? "My one stock pays a regular dividend."
              : f.payers >= f.stocks
                ? `All ${count(f.stocks)} of my stocks pay a regular dividend.`
                : `${capital(count(f.payers))} of my ${count(f.stocks)} stocks pay a regular dividend.`;
        }
        const lines: ShareLine[] = [];
        if (f.total > 0) {
          lines.push({
            text:
              announced >= 100
                ? "Every payment in the next twelve months is already announced."
                : announced >= 1
                ? `${announced}% of the next twelve months' payments are announced; the rest are estimates.`
                : "None of it is announced yet, so every month is an estimate from last year's payments.",
            tone: "flat",
          });
        }
        if (f.yieldOnPrice !== null && f.yieldOnPrice > 0 && options.showAmounts) {
          lines.push({ text: `That is about ${f.yieldOnPrice.toFixed(1)}% a year at today's prices.`, tone: "flat" });
        }
        return { topic: "My dividends", headline, lines: lines.slice(0, 2), bars: monthBars(options), footnote };
      },
    });
  }

  if (f.total > 0) {
    const sorted = [...f.months].sort((a, b) => b.total - a.total);
    const top = sorted[0]!;
    const share = Math.round((top.total / f.total) * 100);
    const empty = f.months.filter((month) => month.total <= 0).length;
    // A month only stands out when the money is not spread evenly.
    if (share >= 12 && top.total > (sorted[1]?.total ?? 0)) {
      out.push({
        cardId: "month",
        label: `${monthName(top.month)}, my biggest month`,
        hasNames: top.names.length > 0,
        hasAmounts: true,
        build: (options) => {
          const from =
            options.hideNames || top.names.length === 0
              ? ""
              : top.names.length > 3
                ? `, from ${top.names.slice(0, 3).join(", ")} and others`
                : `, from ${joinList(top.names)}`;
          const amount = options.showAmounts ? `about ${dollars(top.total)}, ` : "";
          const lines: ShareLine[] = [];
          if (empty > 0) lines.push({ text: empty === 1 ? "Only one month of the twelve has nothing coming in." : `${capital(count(empty))} of the twelve months have nothing coming in.`, tone: "flat" });
          return {
            topic: "My dividends",
            headline: `${monthName(top.month)} is my biggest dividend month: ${amount}${share}% of the year's payments${from}.`,
            lines,
            bars: monthBars(options),
            footnote,
          };
        },
      });
    }
  }

  if (f.raises.length > 0) {
    const lead = f.raises[0]!;
    out.push({
      cardId: "raises",
      label: "Dividend raises",
      hasNames: true,
      hasAmounts: false,
      build: (options) => {
        const n = f.raises.length;
        const of =
          f.comparable > 0 && n >= f.comparable
            ? `All ${count(n)} of my dividend stocks`
            : f.comparable > 0
              ? `${capital(count(n))} of my ${count(f.comparable)} dividend stocks`
              : `${capital(count(n))} of my stocks`;
        const verb = f.raises.length === 1 ? "raised its payment" : "raised their payments";
        const led = f.raises.length === 1 ? `, by ${Math.round(lead.changePct)}%` : options.hideNames ? `, the biggest by ${Math.round(lead.changePct)}%` : `, led by ${lead.name} at ${Math.round(lead.changePct)}%`;
        const single = f.raises.length === 1 && !options.hideNames ? `${lead.name} raised its dividend ${Math.round(lead.changePct)}% over the past year.` : null;
        return {
          topic: "My dividends",
          headline: single ?? `${of} ${verb} over the past year${led}.`,
          lines: [],
          bars:
            f.raises.length >= 2
              ? {
                  title: "Raise against a year earlier",
                  style: "share",
                  rows: f.raises.slice(0, 5).map((row, index) => ({
                    label: options.hideNames ? `#${index + 1}` : row.name,
                    value: Math.min(Math.round(row.changePct), 100),
                    display: `+${Math.round(row.changePct)}%`,
                    tone: "up",
                    highlight: index === 0,
                  })),
                }
              : null,
          footnote,
        };
      },
    });
  }
  return out;
}

/** "Your holdings rose 2.1%" becomes "My holdings rose 2.1%". Null when the sentence cannot be put in the first person cleanly. */
export function firstPerson(text: string): string | null {
  const out = text
    .replace(/\bYour\b/g, "My")
    .replace(/\byour\b/g, "my")
    .replace(/\bYou are\b/g, "I am")
    .replace(/\byou are\b/g, "I am");
  return /\byou\b|\byours\b|\byourself\b/i.test(out) ? null : out;
}

/** The first sentence: the memo's figure. What follows can name holdings ("Apple is left out because..."), so it stays off the card. */
export function firstSentence(text: string): string {
  const match = /^.*?[.!?](?=\s|$)/.exec(text.trim());
  return (match ? match[0] : text).trim();
}

function memoBuilders(f: MemoFacts): Builder[] {
  const headline = firstPerson(firstSentence(f.performance));
  if (!headline) return [];
  const drivers = f.drivers ? firstPerson(f.drivers) : null;
  const week = windowWords(f.monday, f.friday);
  return [
    {
      cardId: "week",
      label: f.complete ? "My week" : "My week so far",
      hasNames: Boolean(drivers),
      hasAmounts: false,
      build: (options) => ({
        topic: "My weekly memo",
        headline,
        lines: drivers && !options.hideNames ? [{ text: drivers, tone: "flat" }] : [],
        bars: null,
        footnote: `Week of ${week} · daily closes with dividends`,
      }),
    },
  ];
}

function portfolioBuilders(f: PortfolioFacts): Builder[] {
  const out: Builder[] = [];
  const footnote = f.pricesAsOf ? `Latest prices, weighted by value · ${fmtFilingDay(f.pricesAsOf)}` : "Latest prices, weighted by value";
  const positionBars = (options: ShareOptions) =>
    f.positions.length >= 2
      ? {
          title: "Biggest holdings",
          style: "share" as const,
          rows: f.positions.slice(0, 5).map<ShareBarRow>((row, index) => ({
            label: options.hideNames ? rankLabel(index, row.sector) : row.name,
            value: Math.round(row.pct * 10) / 10,
            display: fmtPct(row.pct),
            tone: "flat",
            highlight: index === 0,
          })),
        }
      : null;

  const lead = f.positions[0];
  if (lead && fin(f.top3) && f.positions.length > 3) {
    const top3 = f.top3;
    out.push({
      cardId: "concentration",
      label: "My three biggest",
      hasNames: true,
      hasAmounts: false,
      build: (options) => ({
        topic: "My portfolio",
        headline: `My three biggest holdings are ${fmtPct(top3)} of my portfolio.`,
        lines: [{ text: options.hideNames ? `The biggest one alone is ${fmtPct(lead.pct)}.` : `${lead.name} alone is ${fmtPct(lead.pct)}.`, tone: lead.pct >= 25 ? "down" : "flat" }],
        bars: positionBars(options),
        footnote,
      }),
    });
  }

  const tilt = f.sectors[0];
  if (tilt && tilt.pct - tilt.benchmarkPct >= 10) {
    out.push({
      cardId: "sector",
      label: `${tilt.sector} tilt`,
      hasNames: false,
      hasAmounts: false,
      build: () => ({
        topic: "My portfolio",
        headline: `${fmtPct(tilt.pct)} of my money is in ${tilt.sector}${f.hasFunds ? " stocks I bought directly" : ""}, against ${fmtPct(tilt.benchmarkPct)} of the S&P 500.`,
        lines: f.hasFunds ? [{ text: "My funds are left out of the sector shares; they hold a bit of everything.", tone: "flat" }] : [],
        bars: {
          title: "Sector · S&P 500 weight",
          style: "share",
          rows: f.sectors.slice(0, 4).map((row, index) => ({
            label: row.sector,
            value: Math.round(row.pct * 10) / 10,
            display: `${fmtPct(row.pct)} · S&P ${fmtPct(row.benchmarkPct)}`,
            tone: "flat",
            highlight: index === 0,
          })),
        },
        footnote,
      }),
    });
  }

  if (fin(f.beta) && f.beta > 0) {
    const beta = f.beta;
    out.push({
      cardId: "swing",
      label: "How much it swings",
      hasNames: false,
      hasAmounts: false,
      build: () => ({
        topic: "My portfolio",
        headline: `When the S&P 500 moves 1%, my portfolio has tended to move ${beta.toFixed(1)}%.`,
        lines:
          fin(f.volatility) && fin(f.benchmarkVolatility)
            ? [
                {
                  text:
                    fmtPct(f.volatility) === fmtPct(f.benchmarkVolatility)
                      ? `Its ups and downs over a year are about the same as the S&P 500's, ${fmtPct(f.volatility)}.`
                      : `Its ups and downs over a year are ${fmtPct(f.volatility)}, against ${fmtPct(f.benchmarkVolatility)} for the S&P 500.`,
                  tone: beta > 1.2 ? "down" : beta < 0.8 ? "up" : "flat",
                },
              ]
            : [],
        bars: null,
        footnote: "A year of daily closes",
      }),
    });
  }
  return out;
}

function buildersFor(input: ShareFacts): Builder[] {
  switch (input.kind) {
    case "xray":
      return xrayBuilders(input.facts);
    case "stress":
      return stressBuilders(input.facts);
    case "dividends":
      return dividendBuilders(input.facts);
    case "memo":
      return memoBuilders(input.facts);
    case "portfolio":
      return portfolioBuilders(input.facts);
  }
}

/* ── privacy ────────────────────────────────────────────────────────────── */

/** Every piece of text a card prints. */
export function cardText(card: ShareCard): string[] {
  return [card.topic, card.headline, ...card.lines.map((line) => line.text), card.bars?.title ?? "", ...(card.bars?.rows ?? []).flatMap((row) => [row.label, row.display ?? ""]), card.footnote].filter(Boolean);
}

const MONEY = /[$€£¥]|\bUSD\b|\bdollars?\b|\b\d[\d,.]*\s*(k|m|bn|million|billion|thousand)\b/i;
const SHARE_COUNT = /\b\d[\d,.]*\s+shares?\b/i;

/**
 * The last check before a card is shown or stored. Returns the problems found
 * (empty when the card is fine): money when amounts are off, share counts
 * always, and any of the given names when names are hidden.
 */
export function checkCardPrivacy(card: ShareCard, options: ShareOptions, names: readonly string[] = [], known: readonly string[] = names): string[] {
  const problems: string[] = [];
  const text = cardText(card);
  // Company names are not amounts: "3M", "Dollar General" and "Dollar Tree" would read as money.
  const unnamed = (piece: string) =>
    [...known].sort((a, b) => b.length - a.length).reduce((out, name) => (name.trim().length >= 2 ? out.split(name).join("·") : out), piece);
  for (const piece of text) {
    const plain = unnamed(piece);
    if (!options.showAmounts && MONEY.test(plain)) problems.push(`amount: ${piece}`);
    if (SHARE_COUNT.test(plain)) problems.push(`share count: ${piece}`);
  }
  if (options.hideNames) {
    for (const name of names) {
      const clean = name.trim();
      // Single letters and very short tickers ("A", "F") would match ordinary words; long enough names only.
      if (clean.length < 2) continue;
      const pattern = new RegExp(`(^|[^A-Za-z0-9])${clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^A-Za-z0-9])`, clean.length <= 3 ? "" : "i");
      if (text.some((piece) => pattern.test(piece))) problems.push(`name: ${clean}`);
    }
  }
  return problems;
}

/** Every name and ticker the facts mention, for the hidden-names check. */
export function factNames(input: ShareFacts): string[] {
  switch (input.kind) {
    case "xray":
      return [
        ...input.facts.companies.flatMap((row) => [row.name, row.ticker, ...row.funds]),
        ...(input.facts.overlap ? [input.facts.overlap.a, input.facts.overlap.b] : []),
      ];
    case "stress":
      return input.facts.episodes.flatMap((item) => (item.lead ? [item.lead.name] : []));
    case "dividends":
      return [...input.facts.months.flatMap((month) => month.names), ...input.facts.raises.map((row) => row.name)];
    case "memo":
      return [];
    case "portfolio":
      return input.facts.positions.map((row) => row.name);
  }
}

/* ── candidates ─────────────────────────────────────────────────────────── */

const OPTION_SETS: ShareOptions[] = [
  { hideNames: false, showAmounts: false },
  { hideNames: true, showAmounts: false },
  { hideNames: false, showAmounts: true },
  { hideNames: true, showAmounts: true },
];

/**
 * Every card a page can make, each with all of its variants. A variant that
 * fails the privacy check is dropped, and a candidate with no safe default
 * variant is dropped whole.
 */
export function buildCandidates(input: ShareFacts, asOf: string): ShareCandidate[] {
  const names = factNames(input);
  const out: ShareCandidate[] = [];
  for (const builder of buildersFor(input)) {
    const variants: ShareCandidate["variants"] = {};
    for (const options of OPTION_SETS) {
      if (options.showAmounts && !builder.hasAmounts) continue;
      if (options.hideNames && !builder.hasNames) continue;
      const draft = builder.build(options);
      if (!draft || !draft.headline.trim()) continue;
      const card: ShareCard = { v: 1, kind: input.kind as ShareKind, cardId: builder.cardId, asOf, ...draft };
      if (checkCardPrivacy(card, options, options.hideNames ? names : [], names).length > 0) continue;
      variants[variantKey(options)] = { card, hash: cardHash(card) };
    }
    if (!variants[variantKey({ hideNames: false, showAmounts: false })]) continue;
    out.push({
      cardId: builder.cardId,
      label: builder.label,
      hasNames: builder.hasNames && Boolean(variants[variantKey({ hideNames: true, showAmounts: false })]),
      namesLocked: builder.hasNames && !variants[variantKey({ hideNames: true, showAmounts: false })],
      hasAmounts: builder.hasAmounts && Boolean(variants[variantKey({ hideNames: false, showAmounts: true })]),
      variants,
    });
  }
  return out;
}

export { pickVariant };
