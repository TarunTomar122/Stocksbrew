/**
 * Insights, not data: the shared shape every page uses for its "read".
 *
 * An insight is a conclusion drawn from real numbers we already hold: what
 * changed, how big it is compared with normal, who it touches, and what to do
 * about it. Builders compute these with plain rules (shares, ranks, changes
 * against a baseline, thresholds) in a page's loader. No model writes the
 * numbers, and an insight that cannot be backed by data is left out rather
 * than padded.
 */

export type InsightTone = "up" | "down" | "flat";

export type Insight = {
  /** Stable key for React lists. */
  id: string;
  tone: InsightTone;
  /** One plain sentence with the number in it: "62% of today's stock news is positive, up from 48% yesterday." */
  text: string;
  /** Optional second clause on why it matters or what to do: "Chips lead it; NVDA is the exception." */
  soWhat?: string;
  /** Tickers the insight is about, shown as small logo chips. */
  tickers?: string[];
  /**
   * The lead stock's company name, shown in place of its ticker where the row
   * leads with one stock ("Hims & Hers fell 16.5%..." under the HIMS logo).
   * The sentence still starts with the ticker so the row knows its subject.
   */
  leadName?: string;
  /** Where to go to act or dig in. */
  action?: InsightAction;
  /**
   * A second, smaller next step beside the first, when the finding invites one
   * ("Watch HIMS for me" next to "Why did it fall?"). Two at most per finding.
   */
  secondAction?: InsightAction;
};

/** A next step offered right where a finding is: a plain label and where it goes. */
export type InsightAction = { label: string; href: string };

export type TheRead = {
  /** The one-line headline of the page's read: "A risk-on morning, led by chips." */
  headline: string;
  /** The supporting insights, most important first. Three is plenty. */
  insights: Insight[];
  /** Short source and time line, e.g. "412 stories from 38 sources" / an ISO time. */
  source?: string;
  asOf?: string | null;
  /** Stocks the headline itself tells, so lists under the read can leave them out. */
  headlineTickers?: string[];
  /** Next steps for the headline itself, shown right under it. Two at most. */
  actions?: InsightAction[];
};

/** Whole-number percentage share, or null when the base is empty. */
export function sharePct(part: number, whole: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return null;
  return Math.round((part / whole) * 100);
}

/** Split counts into percentages that always add up to 100 (largest remainder). */
export function balancePct(counts: Record<string, number>): Record<string, number> {
  const keys = Object.keys(counts);
  const total = keys.reduce((sum, key) => sum + Math.max(0, counts[key] || 0), 0);
  const out: Record<string, number> = {};
  if (total <= 0) {
    for (const key of keys) out[key] = 0;
    return out;
  }
  const raw = keys.map((key) => ({ key, exact: (Math.max(0, counts[key] || 0) / total) * 100 }));
  let assigned = 0;
  for (const item of raw) {
    out[item.key] = Math.floor(item.exact);
    assigned += out[item.key];
  }
  raw
    .sort((a, b) => b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact)))
    .slice(0, 100 - assigned)
    .forEach((item) => {
      out[item.key] += 1;
    });
  return out;
}

/** Tone of a signed number with a dead band: within ±band it reads as flat. */
export function toneOfChange(value: number | null | undefined, band = 0): InsightTone {
  if (value === null || value === undefined || !Number.isFinite(value) || Math.abs(value) <= band) return "flat";
  return value > 0 ? "up" : "down";
}

/** Drop empty insights and cap the list, so a page never shows filler. */
export function pickInsights(items: Array<Insight | null | undefined | false>, max = 3): Insight[] {
  return items.filter((item): item is Insight => Boolean(item && item.text.trim())).slice(0, max);
}
