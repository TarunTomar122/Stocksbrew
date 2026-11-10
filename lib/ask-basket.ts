import type { BasketCard, BasketEvidence, BasketLine } from "@/lib/ask-cards";
import type { InvestmentTheme, ThemeCandidate } from "@/lib/investment-themes";
import type { ThematicScreen } from "@/lib/screens";

/**
 * Idea to basket. A thesis in plain words goes in; a list of companies comes
 * out, each with what it does, why it fits, the evidence and what would break
 * it.
 *
 * Lines come from three places, in this order of trust: our research themes
 * (written and reviewed, with a failure case per company), the live screens
 * (rule matches, refreshed daily), and names the model proposes, which only
 * survive if they resolve in the catalog. The reasoning can be the model's.
 * The evidence never is: it is filled from `BasketFacts` loaded by the tool.
 *
 * Pure: no network, no store.
 */

export type ProposedLine = {
  ticker: string;
  why_it_fits: string;
  breaks_if: string;
};

/** What we know about a company from the store, loaded by the tool layer. */
export type BasketFacts = {
  ticker: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  description: string | null;
  price: number | null;
  day_change_pct: number | null;
  market_cap: number | null;
  pe_ttm: number | null;
  /** One-year total return in percent, from adjusted daily closes. */
  r_1y_pct: number | null;
  score: number | null;
  verdict: string | null;
  quote_source: string;
  quote_as_of: string | null;
  history_source: string | null;
  history_as_of: string | null;
};

export type DraftLine = {
  ticker: string;
  company: string | null;
  role: string | null;
  why_it_fits: string;
  breaks_if: string;
  note: string | null;
  origin: BasketLine["origin"];
  origin_label: string;
  /** How well the line matched the words of the thesis. Higher is closer. */
  fit: number;
};

export type BasketDraft = {
  title: string;
  thesis: string;
  lines: DraftLine[];
  built_from: BasketCard["built_from"];
  idea_risk: string | null;
  lens: BasketLens | null;
};

export type BasketLens = "cheap" | "momentum";

export const BASKET_MAX_LINES = 10;
export const BASKET_MIN_THEME_SCORE = 2;

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "benefit", "benefits", "build", "but", "by", "companies", "company", "could",
  "find", "for", "from", "get", "give", "has", "have", "i", "idea", "in", "into", "is", "it", "its", "like", "list", "me",
  "my", "name", "names", "of", "on", "or", "play", "plays", "should", "show", "some", "stock", "stocks", "that", "the",
  "their", "them", "theme", "thesis", "this", "to", "want", "what", "which", "who", "will", "win", "winners", "with",
  "would", "basket", "exposure", "exposed", "best", "top", "good", "us", "spending", "trade", "trades",
]);

const CHEAP_WORDS = ["cheap", "undervalued", "value", "bargain", "inexpensive", "discount", "discounted"];
const MOMENTUM_WORDS = ["momentum", "breakout", "breakouts", "strongest", "leaders", "trending"];

/** Words that mean the same thing for matching purposes. */
const SYNONYMS: Record<string, string[]> = {
  ai: ["artificial", "intelligence", "compute", "gpu", "datacenter", "data", "center", "hyperscaler"],
  grid: ["electric", "electricity", "electrical", "power", "transmission", "utility", "utilities", "electrification"],
  power: ["grid", "electric", "electricity", "energy", "utility", "nuclear"],
  nuclear: ["uranium", "reactor", "reactors", "smr"],
  uranium: ["nuclear", "reactor", "fuel"],
  defense: ["defence", "military", "aerospace", "weapons", "missile", "munitions"],
  cyber: ["cybersecurity", "security", "zero", "trust"],
  cybersecurity: ["cyber", "security"],
  robots: ["robotics", "automation", "robot", "humanoid"],
  robotics: ["robots", "automation", "robot"],
  water: ["utilities", "infrastructure", "treatment", "desalination"],
  space: ["satellite", "satellites", "launch", "orbit", "rocket"],
  chips: ["semiconductor", "semiconductors", "chip", "foundry", "memory"],
  semiconductor: ["chips", "chip", "foundry", "memory"],
  bank: ["banks", "financials", "lender", "lending", "insurance"],
  banks: ["bank", "financials", "lender", "lending"],
  drug: ["pharma", "biotech", "healthcare", "obesity", "glp"],
  health: ["healthcare", "pharma", "biotech", "medical"],
  metals: ["materials", "mining", "copper", "lithium", "rare", "earth"],
  copper: ["materials", "mining", "metals"],
  lithium: ["materials", "mining", "battery", "batteries"],
  oil: ["energy", "gas", "lng", "upstream"],
};

function stem(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/** Lowercase content words, stemmed, with duplicates removed. */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (!raw || raw.length < 2 || STOP_WORDS.has(raw)) continue;
    const word = stem(raw);
    if (!out.includes(word)) out.push(word);
  }
  return out;
}

/** The thesis words plus their synonyms, each with a weight: 1 for a word the person used, 0.5 for a synonym. */
export function thesisTerms(thesis: string): Map<string, number> {
  const terms = new Map<string, number>();
  const words = tokenize(thesis).filter((word) => !CHEAP_WORDS.includes(word) && !MOMENTUM_WORDS.includes(word));
  for (const word of words) terms.set(word, 1);
  for (const word of words) {
    for (const synonym of SYNONYMS[word] ?? []) {
      const key = stem(synonym);
      if (!terms.has(key)) terms.set(key, 0.5);
    }
  }
  return terms;
}

export function detectLens(thesis: string): BasketLens | null {
  const words = thesis.toLowerCase().split(/[^a-z]+/);
  if (words.some((word) => CHEAP_WORDS.includes(word))) return "cheap";
  if (words.some((word) => MOMENTUM_WORDS.includes(word))) return "momentum";
  return null;
}

function overlap(terms: Map<string, number>, text: string): number {
  if (!text) return 0;
  const words = new Set(tokenize(text));
  let score = 0;
  for (const [term, weight] of terms) if (words.has(term)) score += weight;
  return score;
}

function candidateText(candidate: ThemeCandidate): string {
  return [candidate.company, candidate.role, candidate.benefitMechanism, candidate.catalyst ?? "", candidate.evidence ?? ""].join(" ");
}

export type ThemeMatch = { theme: InvestmentTheme; score: number };

/** Themes ranked by how many thesis words they share. The name counts double: it is what the theme is about. */
export function matchThemes(thesis: string, themes: InvestmentTheme[]): ThemeMatch[] {
  const terms = thesisTerms(thesis);
  if (terms.size === 0) return [];
  const matches: ThemeMatch[] = [];
  for (const theme of themes) {
    const head = overlap(terms, `${theme.name} ${theme.slug.replace(/-/g, " ")}`) * 2;
    const body = overlap(terms, `${theme.cardDescription} ${theme.description}`);
    const lines = Math.min(3, Math.max(0, ...theme.candidates.map((candidate) => overlap(terms, candidateText(candidate)))));
    const score = head + body + lines;
    if (score >= BASKET_MIN_THEME_SCORE) matches.push({ theme, score });
  }
  return matches.sort((a, b) => b.score - a.score);
}

export type ScreenMatch = { screen: ThematicScreen; score: number };

/** Live screens that fit the words or the lens of the thesis. */
export function matchScreens(thesis: string, screens: ThematicScreen[]): ScreenMatch[] {
  const terms = thesisTerms(thesis);
  const lens = detectLens(thesis);
  const matches: ScreenMatch[] = [];
  for (const screen of screens) {
    if (!screen.matches?.length) continue;
    const text = `${screen.title} ${screen.tagline} ${screen.hook} ${screen.id.replace(/[-_]/g, " ")}`;
    let score = overlap(terms, text);
    const lower = text.toLowerCase();
    if (lens === "cheap" && /value|cheap|undervalued|discount|bargain/.test(lower)) score += 2;
    if (lens === "momentum" && /momentum|breakout|trend|leader/.test(lower)) score += 2;
    if (score >= 2) matches.push({ screen, score });
  }
  return matches.sort((a, b) => b.score - a.score);
}

function titleFor(thesis: string): string {
  const trimmed = thesis.replace(/\s+/g, " ").trim().replace(/[.?!]+$/, "");
  const text = trimmed.length > 84 ? `${trimmed.slice(0, 81).trimEnd()}...` : trimmed;
  return text ? text[0]!.toUpperCase() + text.slice(1) : "Basket";
}

function clean(text: string | null | undefined, max = 320): string {
  const value = (text ?? "").replace(/\s+/g, " ").trim();
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

/**
 * Choose the lines, before any evidence is attached. Theme lines first, then
 * screen matches, then the model's own proposals for tickers nobody else
 * suggested. A proposal for a ticker a theme already covers keeps the theme's
 * reviewed reasoning.
 */
export function draftBasket(input: {
  thesis: string;
  themes: InvestmentTheme[];
  screens: ThematicScreen[];
  proposed?: ProposedLine[];
  ideaRisk?: string | null;
  maxLines?: number;
}): BasketDraft {
  const max = Math.min(BASKET_MAX_LINES, Math.max(1, input.maxLines ?? BASKET_MAX_LINES));
  const terms = thesisTerms(input.thesis);
  const lens = detectLens(input.thesis);
  const lines = new Map<string, DraftLine>();
  const builtFrom: BasketCard["built_from"] = [];

  // A second theme only joins when it fits nearly as well as the first; otherwise it dilutes the idea.
  const ranked = matchThemes(input.thesis, input.themes);
  const themeMatches = ranked.filter((match, index) => index === 0 || (index === 1 && match.score >= ranked[0]!.score * 0.7));
  for (const [themeIndex, { theme }] of themeMatches.entries()) {
    const scored = [...theme.candidates, ...theme.watchlist].map((candidate, index) => ({
      candidate,
      fit: overlap(terms, candidateText(candidate)),
      index,
    }));
    // A theme is broader than most theses. When some of its companies speak to
    // the thesis directly, keep only those; otherwise take the theme as it is.
    // A word the person used (fit of 1 or more) beats a synonym (0.5). When the thesis names the theme itself
    // ("energy stocks"), the whole theme is the answer. When it names something narrower ("uranium"), only the
    // companies that mention it are: two right names beat ten loosely related ones.
    const exact = scored.filter((row) => row.fit >= 1);
    const related = scored.filter((row) => row.fit > 0);
    const namesTheme = overlap(terms, `${theme.name} ${theme.slug.replace(/-/g, " ")}`) >= 1;
    if (themeIndex > 0 && exact.length === 0 && !namesTheme) continue;
    const pool = namesTheme && exact.length < 3 ? scored : exact.length > 0 ? exact : related.length >= 3 ? related : scored;
    const chosen = [...pool].sort((a, b) => b.fit - a.fit || a.index - b.index);
    let added = 0;
    for (const { candidate, fit } of chosen) {
      const ticker = candidate.ticker.trim().toUpperCase();
      if (!ticker || lines.has(ticker)) continue;
      lines.set(ticker, {
        ticker,
        company: candidate.company,
        role: candidate.role || null,
        why_it_fits: clean(candidate.benefitMechanism),
        breaks_if: clean(candidate.failureCase),
        note: candidate.evidence ? clean(candidate.evidence, 200) : null,
        origin: "theme",
        origin_label: `${theme.name} theme`,
        fit: fit + 2,
      });
      added += 1;
      if (added >= 8) break;
    }
    if (added > 0) builtFrom.push({ kind: "theme", name: theme.name, href: `/themes/${theme.slug}` });
  }

  // Screens fill in when no theme covers the idea. Next to a theme they add rule matches that share none of its subject.
  const screenMatches = builtFrom.length === 0 ? matchScreens(input.thesis, input.screens).slice(0, 2) : [];
  for (const { screen } of screenMatches) {
    let added = 0;
    for (const row of screen.matches) {
      const ticker = (row.ticker ?? "").trim().toUpperCase();
      if (!ticker || lines.has(ticker)) continue;
      lines.set(ticker, {
        ticker,
        company: row.name ?? null,
        role: row.sector ?? null,
        why_it_fits: clean(`It passes the "${screen.title}" screen today: ${screen.tagline}`),
        breaks_if: clean(`It stops passing the screen. ${screen.hook}`),
        note: null,
        origin: "screen",
        origin_label: `${screen.title} screen`,
        fit: 1,
      });
      added += 1;
      if (added >= 5) break;
    }
    if (added > 0) builtFrom.push({ kind: "screen", name: screen.title, href: `/screens/${screen.id}` });
  }

  for (const proposal of input.proposed ?? []) {
    const ticker = (proposal.ticker ?? "").trim().toUpperCase().replace(/^\$/, "");
    if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(ticker)) continue;
    const why = clean(proposal.why_it_fits);
    const breaks = clean(proposal.breaks_if);
    if (!why || !breaks) continue;
    const existing = lines.get(ticker);
    if (existing) {
      // The model picked it too: that is a vote for relevance, nothing more.
      existing.fit += 1.5;
      continue;
    }
    lines.set(ticker, {
      ticker,
      company: null,
      role: null,
      why_it_fits: why,
      breaks_if: breaks,
      note: null,
      origin: "proposed",
      origin_label: "Suggested by the copilot, checked against our catalog",
      fit: 1.5,
    });
  }

  const ordered = [...lines.values()].sort((a, b) => b.fit - a.fit);
  const themeRisk = themeMatches[0]?.theme.resilienceNote ? clean(themeMatches[0].theme.resilienceNote, 400) : null;
  return {
    title: titleFor(input.thesis),
    thesis: clean(input.thesis, 400),
    // Keep a few spares: some will not resolve in the catalog.
    lines: ordered.slice(0, max + 6),
    built_from: builtFrom,
    idea_risk: clean(input.ideaRisk, 400) || themeRisk,
    lens,
  };
}

function usd(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function compactUsd(value: number): string {
  const units: Array<[number, string]> = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
  ];
  for (const [size, unit] of units) {
    if (Math.abs(value) >= size) return `$${(value / size).toFixed(value / size >= 100 ? 0 : value / size >= 10 ? 1 : 2)}${unit}`;
  }
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

function signedPct(value: number, digits = 1): string {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(digits)}%`;
}

/** The evidence rows for one company. Only facts we hold: a missing figure is left out, never zero. */
export function evidenceFor(facts: BasketFacts): BasketEvidence[] {
  const out: BasketEvidence[] = [];
  if (facts.price !== null) {
    const move = facts.day_change_pct !== null ? ` (${signedPct(facts.day_change_pct, 2)} today)` : "";
    out.push({ label: "Price", value: `${usd(facts.price)}${move}`, source: facts.quote_source, as_of: facts.quote_as_of });
  }
  if (facts.market_cap !== null && facts.market_cap > 0) {
    out.push({ label: "Market value", value: compactUsd(facts.market_cap), source: facts.quote_source, as_of: facts.quote_as_of });
  }
  if (facts.pe_ttm !== null && facts.pe_ttm > 0) {
    out.push({ label: "P/E, trailing", value: `${facts.pe_ttm.toFixed(1)}x`, source: facts.quote_source, as_of: facts.quote_as_of });
  }
  if (facts.r_1y_pct !== null && facts.history_source) {
    out.push({ label: "1-year return", value: signedPct(facts.r_1y_pct), source: facts.history_source, as_of: facts.history_as_of });
  }
  if (facts.score !== null) {
    const verdict = facts.verdict ? `, ${facts.verdict.toLowerCase()}` : "";
    out.push({ label: "Our score", value: `${Math.round(facts.score)} of 100${verdict}`, source: "stocksbrew research", as_of: facts.quote_as_of });
  }
  return out;
}

function firstSentence(text: string | null, max = 190): string {
  const value = (text ?? "").replace(/\s+/g, " ").trim();
  if (!value) return "";
  const end = value.search(/(?<=[a-z0-9)])\.\s+[A-Z]/);
  const sentence = end > 40 ? value.slice(0, end + 1) : value;
  return sentence.length > max ? `${sentence.slice(0, max - 1).trimEnd()}…` : sentence;
}

/** The catalog fills some descriptions with a note about where the row came from. That is not what a company does. */
function isRealDescription(text: string | null): boolean {
  const value = (text ?? "").trim();
  return value.length >= 40 && !/\buniverse\b|\btracked (in|for)\b|sourced\)|\bS&P 500 sourced\b/i.test(value);
}

function whatItDoes(line: DraftLine, facts: BasketFacts): string {
  const described = isRealDescription(facts.description) ? firstSentence(facts.description) : "";
  if (described) return described;
  const field = [facts.industry, facts.sector].filter(Boolean).join(", ");
  if (line.role && field) return `${line.role}. ${field}.`;
  return line.role || field || "No business description on file.";
}

/**
 * Attach evidence and finish the card. A line whose ticker did not resolve is
 * dropped and listed, so nothing unverified is ever shown as a company.
 */
export function finishBasket(
  draft: BasketDraft,
  factsByTicker: Map<string, BasketFacts | null>,
  options: { maxLines?: number; asOf?: string | null; unavailable?: Set<string> } = {},
): BasketCard {
  const max = Math.min(BASKET_MAX_LINES, Math.max(1, options.maxLines ?? BASKET_MAX_LINES));
  const kept: Array<{ line: BasketLine; facts: BasketFacts; fit: number }> = [];
  const dropped: BasketCard["dropped"] = [];
  for (const draftLine of draft.lines) {
    const facts = factsByTicker.get(draftLine.ticker) ?? null;
    if (!facts) {
      dropped.push({
        ticker: draftLine.ticker,
        reason: options.unavailable?.has(draftLine.ticker) ? "We could not load its data just now." : "Not in our US catalog, so we could not check it.",
      });
      continue;
    }
    const evidence = evidenceFor(facts);
    if (draftLine.note) {
      evidence.push({ label: "Research note", value: draftLine.note, source: draftLine.origin_label, as_of: null });
    }
    kept.push({
      fit: draftLine.fit,
      facts,
      line: {
        ticker: facts.ticker,
        company: facts.name ?? draftLine.company ?? facts.ticker,
        what_it_does: whatItDoes(draftLine, facts),
        why_it_fits: draftLine.why_it_fits,
        breaks_if: draftLine.breaks_if,
        evidence,
        origin: draftLine.origin,
        origin_label: draftLine.origin_label,
      },
    });
  }

  if (draft.lens === "cheap") {
    // Cheapest first on trailing P/E. A company with no P/E (losses, or no data) cannot be called cheap, so it goes last.
    kept.sort((a, b) => {
      const pa = a.facts.pe_ttm !== null && a.facts.pe_ttm > 0 ? a.facts.pe_ttm : Infinity;
      const pb = b.facts.pe_ttm !== null && b.facts.pe_ttm > 0 ? b.facts.pe_ttm : Infinity;
      return pa - pb || b.fit - a.fit;
    });
  } else if (draft.lens === "momentum") {
    kept.sort((a, b) => (b.facts.r_1y_pct ?? -Infinity) - (a.facts.r_1y_pct ?? -Infinity) || b.fit - a.fit);
  }

  const lines = kept.slice(0, max).map((row) => row.line);
  const stamps = kept
    .slice(0, max)
    .map((row) => row.facts.quote_as_of)
    .filter((value): value is string => Boolean(value))
    .sort();
  return {
    card: "basket",
    title: draft.title,
    thesis: draft.thesis,
    lines,
    built_from: draft.built_from,
    dropped: dropped.slice(0, 8),
    idea_risk: draft.idea_risk,
    ranked_by:
      draft.lens === "cheap"
        ? "Ordered by trailing P/E, lowest first. Companies without one are last."
        : draft.lens === "momentum"
          ? "Ordered by one-year return, highest first."
          : null,
    source: "stocksbrew themes, screens and market data",
    as_of: options.asOf ?? stamps[stamps.length - 1] ?? null,
  };
}
