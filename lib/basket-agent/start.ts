/**
 * The basket the editor opens with: from one of our theme books (`?theme=`), or from an Ask basket answer (`?idea=`
 * and `?tickers=`), re-run through the Ask basket's own selection so each company comes with its reviewed reason.
 * Also the companies the editor suggests adding. Reads only; nothing is saved here.
 */

import { draftBasket } from "@/lib/ask-basket";
import { absoluteDay, etToday } from "@/lib/day-words";
import { getInvestmentTheme, INVESTMENT_THEMES } from "@/lib/investment-themes";
import { getThematicScreens, type ThematicScreen } from "@/lib/screens";
import { getCoverage } from "@/lib/seo/family-data";

import { SHORT_REASONS } from "./short-reasons";

import {
  cleanTicker,
  datedReason,
  inferKind,
  MAX_IDEA,
  MAX_LINES,
  nameFromIdea,
  reasonText,
  type BasketDraft,
  type BasketLineDraft,
} from "./model";

export type Suggestion = {
  ticker: string;
  company: string | null;
  reason: string;
};
export type StartingBasket = { draft: BasketDraft; suggestions: Suggestion[] };

/** How long the page waits for today's screens before it goes on with the themes alone (rule 11: no slow page). */
const SCREENS_MS = 1200;

export { reasonText };

/** Every reviewed reason we have for a ticker, from any theme. */
function themeReason(
  ticker: string,
): { company: string; reason: string } | null {
  for (const theme of INVESTMENT_THEMES) {
    const found = [...theme.candidates, ...theme.watchlist].find(
      (candidate) => candidate.ticker.trim().toUpperCase() === ticker,
    );
    if (found)
      return {
        company: found.company,
        reason: reasonText(found.benefitMechanism),
      };
  }
  return null;
}

export function fromTheme(slug: string): StartingBasket | null {
  const theme = getInvestmentTheme(slug);
  if (!theme) return null;
  const idea = reasonText(theme.cardDescription) || theme.name;
  const kind = inferKind(`${theme.name} ${idea}`);
  const lines: BasketLineDraft[] = theme.candidates
    .slice(0, MAX_LINES)
    .map((candidate) => ({
      ticker: candidate.ticker.trim().toUpperCase(),
      company: candidate.company,
      kind,
      reason: reasonText(candidate.benefitMechanism),
    }));
  const taken = new Set(lines.map((line) => line.ticker));
  const suggestions = theme.watchlist
    .map((candidate) => ({
      ticker: candidate.ticker.trim().toUpperCase(),
      company: candidate.company,
      reason: reasonText(candidate.benefitMechanism),
    }))
    .filter((entry) => !taken.has(entry.ticker));
  return {
    draft: {
      name: theme.name,
      idea,
      source: { kind: "theme", slug: theme.slug },
      lines,
    },
    suggestions,
  };
}

async function screensSoon(): Promise<ThematicScreen[]> {
  const read = getThematicScreens("US")
    .then((doc) => doc?.screens ?? [])
    .catch(() => [] as ThematicScreen[]);
  return Promise.race([
    read,
    new Promise<ThematicScreen[]>((resolve) =>
      setTimeout(() => resolve([]), SCREENS_MS),
    ),
  ]);
}

/**
 * From an Ask basket answer: the idea in the person's words and the tickers the answer listed. The Ask basket's own
 * selection runs again on the idea (themes, then today's screens) for each company's reason; a company it does not
 * pick keeps a reviewed reason from any theme, or none (the editor asks for one). An idea too long to keep whole is
 * kept to its first sentence when that fits, else whole (the editor asks for a shorter one), never cut mid-sentence.
 */
export async function fromIdea(
  ideaRaw: string,
  tickersRaw: string[],
): Promise<StartingBasket> {
  const whole = ideaRaw.replace(/\s+/g, " ").trim();
  const first = whole.split(/(?<=[.!?])\s+/)[0] ?? "";
  const idea =
    whole.length <= MAX_IDEA ? whole : first.length <= MAX_IDEA ? first : whole;
  const picked = draftBasket({
    thesis: idea,
    themes: INVESTMENT_THEMES,
    screens: await screensSoon(),
    maxLines: MAX_LINES,
  });
  const label = absoluteDay(etToday());
  const reasonOf = (text: string | null | undefined) =>
    reasonText(datedReason(text ?? "", label));
  const byTicker = new Map(picked.lines.map((line) => [line.ticker, line]));
  // Only companies we follow: the agent could not check the rest. Names come from the same list.
  const coverage = await getCoverage().catch(() => null);
  const followed = (ticker: string) =>
    !coverage || coverage.bySymbol.size === 0 || coverage.bySymbol.has(ticker);
  const asked = [
    ...new Set(
      tickersRaw
        .map(cleanTicker)
        .filter(
          (ticker): ticker is string => ticker !== null && followed(ticker),
        ),
    ),
  ].slice(0, MAX_LINES);
  const tickers =
    asked.length > 0
      ? asked
      : picked.lines.slice(0, 8).map((line) => line.ticker);
  const kind = inferKind(idea);
  const lines: BasketLineDraft[] = tickers.map((ticker) => {
    const line = byTicker.get(ticker);
    const reviewed = line ? null : themeReason(ticker);
    return {
      ticker,
      company:
        line?.company ??
        reviewed?.company ??
        coverage?.bySymbol.get(ticker)?.name ??
        null,
      kind,
      reason: reasonOf(line?.why_it_fits) || reviewed?.reason || "",
    };
  });
  const taken = new Set(lines.map((line) => line.ticker));
  const suggestions = picked.lines
    .filter((line) => !taken.has(line.ticker))
    .slice(0, 8)
    .map((line) => ({
      ticker: line.ticker,
      company: line.company,
      reason: reasonOf(line.why_it_fits),
    }));
  return {
    draft: { name: nameFromIdea(idea), idea, source: { kind: "ask" }, lines },
    suggestions,
  };
}

/** The reviewed reasons we have for a ticker, as a basket line stores them, from every theme. */
export function reviewedReasons(ticker: string): string[] {
  return INVESTMENT_THEMES.flatMap((theme) => [
    ...theme.candidates,
    ...theme.watchlist,
  ])
    .filter((candidate) => candidate.ticker.trim().toUpperCase() === ticker)
    .map((candidate) => reasonText(candidate.benefitMechanism));
}

/** The editor's card lines: our short line for each ticker that has one, and the reviewed reasons it stands for. */
export function shortsFor(
  tickers: readonly string[],
): Record<string, { short: string; reasons: string[] }> {
  const out: Record<string, { short: string; reasons: string[] }> = {};
  for (const ticker of tickers) {
    const short = SHORT_REASONS[ticker];
    if (short) out[ticker] = { short, reasons: reviewedReasons(ticker) };
  }
  return out;
}
