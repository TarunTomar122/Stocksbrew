/** Filter boilerplate when EPS actuals never landed in the pipeline. */

const MISSING_ACTUAL_MARKERS = [
  "not yet available",
  "not available",
  "unavailable",
  "cannot confirm",
  "no beat or miss",
  "no confirmed beat",
  "not reported",
  "not captured",
  "do not state a beat",
  "lacked eps",
  "absent eps",
  "no eps data",
  "no eps disclosure",
] as const;

export function isMissingActualEarningsCopy(text: string | null | undefined): boolean {
  const lower = String(text ?? "").trim().toLowerCase();
  if (!lower) return true;
  return MISSING_ACTUAL_MARKERS.some((marker) => lower.includes(marker));
}

export function pickEarningsHookLine(
  evidence: string[] | undefined,
  fallbackTitle?: string,
): string {
  const lines = (evidence ?? []).map((line) => line.trim()).filter(Boolean);
  const useful = lines.find((line) => !isMissingActualEarningsCopy(line));
  if (useful) return useful;
  return String(fallbackTitle ?? "").trim();
}

const SENTENCE_ABBREV_END =
  /\b(?:Inc|Corp|Corporation|Ltd|Limited|Co|Company|Lp|Jr|Sr|Dr|Mr|Mrs|Ms|Prof|vs|St|Dept|Est|approx|etc|U\.S|U\.K)\.$/i;

function isDecimalPoint(text: string, index: number): boolean {
  return (
    index > 0 &&
    index < text.length - 1 &&
    /\d/.test(text[index - 1]!) &&
    /\d/.test(text[index + 1]!)
  );
}

function endsWithAbbreviation(textThroughPeriod: string): boolean {
  return SENTENCE_ABBREV_END.test(textThroughPeriod);
}

function isSentenceEnd(text: string, index: number): boolean {
  const punct = text[index];
  if (punct !== "." && punct !== "!" && punct !== "?") return false;

  if (punct === "." && isDecimalPoint(text, index)) return false;
  if (punct === "." && endsWithAbbreviation(text.slice(0, index + 1))) return false;

  let next = index + 1;
  while (next < text.length && text[next] === " ") next += 1;
  if (next >= text.length) return true;

  if (punct === "!" || punct === "?") return true;

  // Period: new sentence usually starts with a capital or quote.
  return /[A-Z"“(]/.test(text[next]!);
}

/** First sentence for compact earnings cards. */
export function firstSentence(text: string | null | undefined): string {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return "";

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === "." || ch === "!" || ch === "?") {
      if (isSentenceEnd(trimmed, i)) {
        return trimmed.slice(0, i + 1).trim();
      }
    }
  }
  return trimmed;
}

export function earningsIntelHref(ticker: string): string {
  const symbol = String(ticker ?? "").trim();
  if (!symbol) return "/earnings-intel";
  return `/earnings-intel/${encodeURIComponent(symbol)}`;
}
