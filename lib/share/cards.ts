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
  type ShareChip,
  type ShareCurve,
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
  lead: { name: string; ticker?: string; pct: number; fund: boolean } | null;
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
  raises: Array<{ name: string; ticker?: string; changePct: number }>;
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
  /** The page's picture of the week (lib/memo/view.ts), percentages only. Missing on memos written before the page had one. */
  week?: MemoWeekFacts | null;
};

export type MemoWeekFacts = {
  /** The page's short headline: "Up so far, 0.2 points ahead of the S&P 500". */
  headline: string;
  portfolioPct: number | null;
  marketPct: number | null;
  /** The close before Monday (at 0), then each close in the week, percent from that close. */
  curve: Array<{ day: string; portfolio: number; market: number | null }>;
  /** Up to three that helped most, then up to three that hurt most: the stock's own move and its points of the week's move. */
  movers: Array<{ ticker: string; name: string; pct: number; points: number }>;
};

export type PortfolioFacts = {
  /** Biggest holdings by value (up to five), share of the portfolio. */
  positions: Array<{ name: string; ticker?: string | null; sector: string | null; pct: number }>;
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

/** "Holding A", "Holding B": a stock with its name hidden. */
function holdingLetter(index: number): string {
  return `Holding ${String.fromCharCode(65 + (index % 26))}`;
}

/** "That is 37 points more than the S&P 500's 37%." The figure beside it says my own share. */
function gapHeadline(pct: number, benchmark: number): string {
  // The gap between the two numbers as printed, so "13%" and "11%" never come out as "1 point".
  const shown = (value: number) => Number.parseFloat(fmtPct(value)) || 0;
  const gap = Math.round(shown(pct) - shown(benchmark));
  if (Math.abs(gap) < 1) return `That is about the same as the S&P 500's ${fmtPct(benchmark)}.`;
  return `That is ${Math.abs(gap)} ${Math.abs(gap) === 1 ? "point" : "points"} ${gap > 0 ? "more" : "less"} than the S&P 500's ${fmtPct(benchmark)}.`;
}

/**
 * The card in one or two sentences, for places that show words only (the list
 * of shared cards, a link's description): the big number with its label, then
 * the headline.
 */
export function cardSummary(card: Pick<ShareCard, "figure" | "headline">): string {
  if (!card.figure) return card.headline;
  const headline = /[.!?]$/.test(card.headline) ? card.headline : `${card.headline}.`;
  return `${card.figure.value} ${card.figure.label}. ${headline}`;
}

/** "+2.1" / "−0.4": percentage points, signed, one decimal. */
function signedPoints(value: number): string {
  const text = Math.abs(value).toFixed(1);
  if (text === "0.0") return "0.0";
  return `${value > 0 ? "+" : "−"}${text}`;
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
            ticker: options.hideNames ? null : row.ticker || null,
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
        // The big number says the share; the headline says what the funds did to it.
        let headline: string;
        const fundsMove = top.fundPct > 0 && (top.directPct === 0 || fmtPct(top.pct) !== fmtPct(top.directPct));
        if (fundsMove && top.directPct > 0) headline = `I bought ${fmtPct(top.directPct)} directly; my funds add the rest.`;
        else if (fundsMove && top.pct > f.maxDirectPct) headline = `That is more than any stock I bought directly, all of it through ${funds}.`;
        else if (fundsMove) headline = `All of it comes through ${funds}.`;
        else headline = `${capital(name)} is my biggest company, with what my funds hold counted.`;
        const lines: ShareLine[] = [];
        const second = f.companies[1];
        if (second && second.fundPct > 0 && second.directPct === 0 && !options.hideNames) {
          lines.push({ text: `${second.name} is ${fmtPct(second.pct)}, all of it through my funds.`, tone: "flat" });
        }
        return {
          topic: "What I really own",
          headline,
          lines,
          bars: companyBars(options),
          figure: { value: fmtPct(top.pct), label: options.hideNames ? "of my portfolio is my biggest company, funds counted" : `of my portfolio is ${top.name}, funds counted`, tone: "flat" },
          footnote,
        };
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
        headline: gapHeadline(sector.pct, bench),
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
            benchmark: row.benchmarkPct !== null ? Math.round(row.benchmarkPct * 10) / 10 : null,
          })),
        },
        figure: { value: fmtPct(sector.pct), label: `of my portfolio is in ${sector.sector}, funds counted`, tone: "flat" },
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
        headline: `Weight for weight, that much of each fund is in the same ${overlap.shared} companies.`,
        lines: [{ text: "Owning both spreads my money less than two funds suggest.", tone: "flat" }],
        bars: companyBars(options),
        figure: { value: fmtPct(overlap.pct), label: options.hideNames ? "overlap between two of my funds" : `overlap between ${overlap.a} and ${overlap.b}`, tone: "flat" },
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
        const compare = ratioWords(item);
        const marketWords = Math.abs(item.market) < 0.05 ? "the S&P 500 was flat" : `the S&P 500 ${item.market < 0 ? "fell" : "rose"} ${pctWords(item.market)}`;
        const same = compare !== null && /about as much as the S&P 500$/.test(compare);
        // The big number is my result; the headline puts the S&P 500 beside it, and says what the figure covers.
        const covers = item.missing === null ? "" : `That counts ${subject}. `;
        const headline = same ? `${covers}About the same as the S&P 500 over the same days.` : `${covers}${capital(marketWords)} over the same days.`;
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
          figure: {
            value: signed(item.portfolio),
            // The headline says which part of the portfolio the figure covers when some was not trading yet.
            label: `${item.missing === null ? "my portfolio" : "what I own"} in the ${item.name}`,
            tone: toneOf(item.portfolio),
          },
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
  const peak = f.total > 0 ? [...f.months].sort((a, b) => b.total - a.total)[0]?.month ?? null : null;
  const monthBars = (options: ShareOptions, mark: string | null = null) =>
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
            highlight: mark !== null && month.month === mark,
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
        const payersWords =
          f.stocks === 1
            ? "My one stock pays a regular dividend."
            : f.payers >= f.stocks
              ? `All ${count(f.stocks)} of my stocks pay a regular dividend.`
              : `${capital(count(f.payers))} of my ${count(f.stocks)} stocks pay a regular dividend.`;
        const hasYield = f.yieldOnPrice !== null && f.yieldOnPrice > 0;
        // The big number is the money or the yield; the headline says how many of my stocks pay.
        const figureIsCount = !(options.showAmounts && f.total > 0) && !hasYield && f.stocks > 1;
        let headline: string;
        if (options.showAmounts && f.total > 0 && hasYield) headline = `That is about ${f.yieldOnPrice!.toFixed(1)}% a year at today's prices.`;
        else if (!figureIsCount || f.total <= 0) headline = payersWords;
        else headline = announced >= 100 ? "Every payment in the next twelve months is already announced." : announced >= 1 ? `${announced}% of the next twelve months' payments are announced; the rest are estimates.` : "None of it is announced yet, so every month is an estimate from last year's payments.";
        const lines: ShareLine[] = [];
        if (f.total > 0 && !(figureIsCount && f.total > 0)) {
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
        if (options.showAmounts && f.total > 0 && hasYield) lines.push({ text: payersWords, tone: "flat" });
        const figure: ShareCard["figure"] =
          options.showAmounts && f.total > 0
            ? { value: dollars(f.total), label: "in dividends over the next twelve months", tone: "flat" }
            : hasYield
              ? { value: `${f.yieldOnPrice!.toFixed(1)}%`, label: "a year in dividends at today's prices", tone: "flat" }
              : f.total > 0
                ? f.stocks > 1
                  ? { value: f.payers >= f.stocks ? `All ${f.stocks}` : `${f.payers} of ${f.stocks}`, label: "stocks I own pay a regular dividend", tone: "flat" }
                  : null
                : null;
        return { topic: "My dividends", headline, lines: lines.slice(0, 2), bars: monthBars(options, peak), figure, footnote };
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
                ? `${top.names.slice(0, 3).join(", ")} and others`
                : joinList(top.names);
          const amount = options.showAmounts ? `about ${dollars(top.total)}` : "";
          const lines: ShareLine[] = [];
          const emptyWords = empty === 1 ? "Only one month of the twelve has nothing coming in." : `${capital(count(empty))} of the twelve months have nothing coming in.`;
          // The big number is the month's share; the headline says who pays it (and how much, with amounts on).
          let headline: string;
          if (from && amount) headline = `That is ${amount}, from ${from}.`;
          else if (from) headline = `${monthName(top.month)}'s payments come from ${from}.`;
          else if (amount) headline = `That is ${amount}, my biggest dividend month.`;
          else headline = empty > 0 ? emptyWords : `${monthName(top.month)} is my biggest dividend month.`;
          if (empty > 0 && headline !== emptyWords) lines.push({ text: emptyWords, tone: "flat" });
          return {
            topic: "My dividends",
            headline,
            lines,
            bars: monthBars(options, top.month),
            figure: { value: `${share}%`, label: `of the year's dividends land in ${monthName(top.month)}`, tone: "flat" },
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
        // The big number is the biggest raise; the headline says how many raised ("one of my four", never "all one").
        const headline =
          n === 1
            ? f.comparable > 1
              ? `It is the only one of my ${count(f.comparable)} dividend stocks that raised its payment over the past year.`
              : "It raised its payment over the past year."
            : `${of} ${verb} over the past year.`;
        return {
          topic: "My dividends",
          headline,
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
                    ticker: options.hideNames ? null : row.ticker || null,
                  })),
                }
              : null,
          figure: {
            value: `+${Math.round(lead.changePct)}%`,
            label: options.hideNames ? "my biggest dividend raise this past year" : `the dividend raise at ${lead.name} this past year`,
            tone: "up",
          },
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
  const sentence = firstPerson(firstSentence(f.performance));
  if (!sentence) return [];
  const drivers = f.drivers ? firstPerson(f.drivers) : null;
  const week = windowWords(f.monday, f.friday);
  const footnote = `Week of ${week} · daily closes with dividends`;
  const view = f.week ?? null;
  const portfolioPct = view && fin(view.portfolioPct) ? view.portfolioPct : null;
  // The page's own short headline when the memo has a picture; the memo's first sentence otherwise (older memos).
  const short = view ? firstPerson(view.headline) : null;
  const curve: ShareCurve | null =
    view && view.curve.length >= 2
      ? {
          // No S&P 500 line without a close for every day, and then the title does not promise one.
          title: `${f.complete ? "My week" : "My week so far"}${view.curve.every((point) => fin(point.market)) ? " against the S&P 500" : ""}`,
          days: view.curve.map((point) => point.day),
          mine: view.curve.map((point) => Math.round(point.portfolio * 100) / 100),
          market: view.curve.every((point) => fin(point.market)) ? view.curve.map((point) => Math.round(point.market! * 100) / 100) : null,
        }
      : null;
  // Best first, then the worst last, so the chips read from the lift to the drag.
  const movers = view ? [...view.movers].sort((a, b) => b.points - a.points) : [];
  const chips = (options: ShareOptions): ShareChip[] =>
    movers.slice(0, 6).map((mover, index) => ({
      ticker: options.hideNames ? null : mover.ticker,
      label: options.hideNames ? holdingLetter(index) : mover.ticker,
      display: signed(mover.pct),
      tone: toneOf(mover.pct),
    }));
  const out: Builder[] = [
    {
      cardId: "week",
      label: f.complete ? "My week" : "My week so far",
      hasNames: Boolean(drivers) || movers.length > 0,
      hasAmounts: false,
      build: (options) => {
        if (portfolioPct === null || !short) {
          return { topic: "My weekly memo", headline: sentence, lines: drivers && !options.hideNames ? [{ text: drivers, tone: "flat" }] : [], bars: null, footnote };
        }
        return {
          topic: "My weekly memo",
          headline: short,
          lines: [],
          bars: null,
          figure: { value: signed(portfolioPct), label: f.complete ? "my holdings this week" : "my holdings so far this week", tone: toneOf(portfolioPct) },
          curve,
          chips: movers.length > 0 ? chips(options) : null,
          footnote,
        };
      },
    },
  ];

  // Who moved it: each holding's points of the week's move, the biggest either way first.
  if (portfolioPct !== null && movers.length >= 2) {
    const lead = [...movers].sort((a, b) => Math.abs(b.points) - Math.abs(a.points))[0]!;
    if (Math.abs(lead.points) >= 0.05) {
      const helped = lead.points > 0;
      out.push({
        cardId: "movers",
        label: "Who moved my week",
        hasNames: true,
        hasAmounts: false,
        build: (options) => {
          const leadIndex = movers.indexOf(lead);
          // The big number is the biggest part; the headline names the biggest one the other way.
          const other = [...movers].filter((mover) => (helped ? mover.points < 0 : mover.points > 0)).sort((a, b) => Math.abs(b.points) - Math.abs(a.points))[0];
          const otherWho = other ? (options.hideNames ? (helped ? "my biggest drag" : "my biggest lift") : other.name) : null;
          const headline = other
            ? `${capital(otherWho!)} ${other.points < 0 ? "took" : "added"} ${Math.abs(other.points).toFixed(1)} ${Math.abs(other.points).toFixed(1) === "1.0" ? "point" : "points"} ${other.points < 0 ? "off" : "back"}.`
            : helped
              ? "Every holding that moved much added to my week."
              : "Every holding that moved much held my week back.";
          return {
            topic: "My weekly memo",
            headline,
            lines: [],
            bars: {
              title: "Points each holding added to my week",
              style: "signed",
              rows: movers.slice(0, 6).map<ShareBarRow>((mover, index) => ({
                label: options.hideNames ? holdingLetter(index) : mover.name,
                value: Math.round(mover.points * 100) / 100,
                display: signedPoints(mover.points),
                tone: toneOf(mover.points),
                highlight: index === leadIndex,
                ticker: options.hideNames ? null : mover.ticker,
              })),
            },
            figure: {
              value: signedPoints(lead.points),
              label: options.hideNames ? `points of my week came from ${helped ? "my biggest lift" : "my biggest drag"}` : `points of my week came from ${lead.name}`,
              tone: toneOf(lead.points),
            },
            footnote,
          };
        },
      });
    }
  }
  return out;
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
            ticker: options.hideNames ? null : row.ticker || null,
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
        // The big number is the three together; the headline is the biggest one alone.
        headline: options.hideNames ? `The biggest one alone is ${fmtPct(lead.pct)}.` : `${lead.name} alone is ${fmtPct(lead.pct)}.`,
        lines: [],
        bars: positionBars(options),
        figure: { value: fmtPct(top3), label: "of my money is in my three biggest holdings", tone: "flat" },
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
        headline: gapHeadline(tilt.pct, tilt.benchmarkPct),
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
            benchmark: Math.round(row.benchmarkPct * 10) / 10,
          })),
        },
        figure: { value: fmtPct(tilt.pct), label: `of my money is in ${tilt.sector}${f.hasFunds ? " stocks I bought directly" : ""}`, tone: "flat" },
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
        // The big number is the move per 1%; the headline is the year's ups and downs beside the S&P 500's.
        headline:
          fin(f.volatility) && fin(f.benchmarkVolatility)
            ? fmtPct(f.volatility) === fmtPct(f.benchmarkVolatility)
              ? `My ups and downs over a year are about the same as the S&P 500's, ${fmtPct(f.volatility)}.`
              : `My ups and downs over a year are ${fmtPct(f.volatility)}, against ${fmtPct(f.benchmarkVolatility)} for the S&P 500.`
            : `When the S&P 500 moves 1%, my portfolio has tended to move ${beta.toFixed(1)}%.`,
        // The bars carry the year's ups and downs; the line would say the same numbers again.
        lines: [],
        bars:
          fin(f.volatility) && fin(f.benchmarkVolatility)
            ? {
                title: "Ups and downs over a year",
                style: "versus",
                rows: [
                  { label: "My portfolio", value: Math.round(f.volatility * 10) / 10, display: fmtPct(f.volatility), tone: "flat", highlight: true },
                  { label: "S&P 500", value: Math.round(f.benchmarkVolatility * 10) / 10, display: fmtPct(f.benchmarkVolatility), tone: "flat" },
                ],
              }
            : null,
        figure: { value: `${beta.toFixed(1)}%`, label: "my usual move when the S&P 500 moves 1%", tone: "flat" },
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
  return [
    card.topic,
    card.headline,
    ...card.lines.map((line) => line.text),
    card.figure?.value ?? "",
    card.figure?.label ?? "",
    card.bars?.title ?? "",
    ...(card.bars?.rows ?? []).flatMap((row) => [row.label, row.display ?? "", row.ticker ?? ""]),
    card.curve?.title ?? "",
    ...(card.chips ?? []).flatMap((chip) => [chip.label, chip.display, chip.ticker ?? ""]),
    card.footnote,
  ].filter(Boolean);
}

/** Tickers a card draws logos for. With names hidden there must be none. */
export function cardLogos(card: ShareCard): string[] {
  return [...(card.bars?.rows ?? []).map((row) => row.ticker), ...(card.chips ?? []).map((chip) => chip.ticker)].filter((ticker): ticker is string => Boolean(ticker));
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
    // A logo names the company as plainly as its name does.
    for (const ticker of cardLogos(card)) problems.push(`logo: ${ticker}`);
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
      return input.facts.episodes.flatMap((item) => (item.lead ? [item.lead.name, item.lead.ticker ?? ""] : []));
    case "dividends":
      return [...input.facts.months.flatMap((month) => month.names), ...input.facts.raises.flatMap((row) => [row.name, row.ticker ?? ""])];
    case "memo":
      return (input.facts.week?.movers ?? []).flatMap((mover) => [mover.name, mover.ticker]);
    case "portfolio":
      return input.facts.positions.flatMap((row) => [row.name, row.ticker ?? ""]);
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
