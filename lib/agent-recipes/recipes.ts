/**
 * Agent recipes: ready-made standing jobs offered from the page a person is on (a stock, an investor, a thesis or an
 * idea basket), each one an existing template of lib/agent-jobs.ts with its options set for that subject. Nothing
 * here invents a trigger: a recipe is only a prefilled draft, checked again by parseJobDraft before it is replayed or
 * saved. Pure: safe on the client.
 */

import { cleanTickers, MAX_SCOPE_TICKERS, parseJobDraft, type AgentJobDraft, type AgentTrigger } from "@/lib/agent-jobs";

export type RecipeSubject =
  | { kind: "stock"; ticker: string; name: string | null }
  | { kind: "fund"; id: string; name: string }
  | { kind: "congress"; id: string; name: string }
  /** An idea basket or a thesis (a basket with lines): its own nightly check plus a filing watch on its stocks. */
  | { kind: "basket"; id: string; name: string; tickers: string[]; thesis: boolean; enabled: boolean };

export type RecipeId = "report" | "risks" | "insiders" | "move" | "trades" | "buys" | "lines" | "filings";

export type RecipeChoice = { value: number; label: string };

/** The icon names a recipe row uses (components/oa/nav-icon.tsx KindIcon). */
export type RecipeIcon = "calendar" | "filings" | "person" | "pulse" | "briefcase" | "capitol" | "target";

export type Recipe = {
  id: RecipeId;
  /** A few words: what it tells you about. */
  title: string;
  /** One line, at most 15 words: when it speaks. */
  line: string;
  /** Where the facts come from, named in the sheet after "From". */
  source: string;
  icon: RecipeIcon;
  /** A size to pick (a move, a dollar floor), with the one used when nothing is picked. */
  choices?: { label: string; values: RecipeChoice[]; fallback: number };
  /** The job it saves, or null for the basket's own nightly check (switched on, not created). */
  draft: AgentJobDraft | null;
};

export const SUBJECT_RE = /^(stock|fund|congress|basket):([A-Za-z0-9.\-]{1,80})$/;

/** "stock:NVDA" and friends, the way a page names its subject to the recipe routes. */
export function subjectKey(subject: Pick<RecipeSubject, "kind"> & ({ ticker: string } | { id: string })): string {
  return `${subject.kind}:${"ticker" in subject ? subject.ticker : subject.id}`;
}

export function parseSubjectKey(raw: unknown): { kind: RecipeSubject["kind"]; id: string } | null {
  const match = SUBJECT_RE.exec(String(raw ?? "").trim());
  if (!match) return null;
  const kind = match[1] as RecipeSubject["kind"];
  const id = kind === "stock" ? match[2]!.toUpperCase() : match[2]!.toLowerCase();
  if (kind === "stock" && cleanTickers([id]).length !== 1) return null;
  return { kind, id };
}

function money(value: number): string {
  if (value >= 1_000_000) return `$${Number((value / 1_000_000).toFixed(1))}M`;
  return `$${Math.round(value / 1_000)}K`;
}

const INSIDER_FLOORS: RecipeChoice[] = [100_000, 500_000, 1_000_000].map((value) => ({ value, label: money(value) }));
const CONGRESS_FLOORS: RecipeChoice[] = [15_000, 50_000, 100_000].map((value) => ({ value, label: money(value) }));
const MOVE_SIZES: RecipeChoice[] = [3, 5, 8].map((value) => ({ value, label: `${value}%` }));

/** The picked size when it is one on offer, else the recipe's own. */
function pick(choices: RecipeChoice[], wanted: number | null | undefined, fallback: number): number {
  return choices.some((choice) => choice.value === wanted) ? (wanted as number) : fallback;
}

/** Checked again exactly as any other draft is (parseJobDraft), so a recipe can never save what the form could not. */
function draft(raw: Record<string, unknown>): AgentJobDraft | null {
  const parsed = parseJobDraft(raw, { hidden: [] });
  return parsed.ok ? parsed.draft : null;
}

/**
 * An investor recipe whose draft lost its investor (an id the draft checks refuse) would watch every fund or every
 * member instead: it is offered as not ready rather than saved as something else.
 */
function guardWho(recipes: Recipe[]): Recipe[] {
  return recipes.map((recipe) => (recipe.draft?.trigger.type === "event" && recipe.draft.trigger.who ? recipe : { ...recipe, draft: null }));
}

/**
 * The recipes for a subject, in the order the sheet lists them. `picked` holds a chosen size per recipe; a value that
 * is not on offer falls back to the recipe's own.
 */
export function recipesFor(subject: RecipeSubject, picked: Partial<Record<RecipeId, number>> = {}): Recipe[] {
  if (subject.kind === "stock") {
    const t = subject.ticker;
    const floor = pick(INSIDER_FLOORS, picked.insiders, 100_000);
    const size = pick(MOVE_SIZES, picked.move, 5);
    const one = { kind: "tickers", tickers: [t] };
    return [
      {
        id: "report",
        title: "Its report is coming up",
        line: "Three days before, then the night of, with the after-hours move.",
        source: "the earnings calendar and after-hours quotes",
        icon: "calendar",
        draft: draft({ template: "earnings-ahead", name: `${t}: report coming up`, scope: one, trigger: { days_before: 3, night_of: true } }),
      },
      {
        id: "risks",
        title: "A filing adds a risk",
        line: "When a new 10-K or 10-Q lists a risk the last one didn't.",
        source: "risk factors in SEC 10-K and 10-Q filings",
        icon: "filings",
        draft: draft({ template: "filing-risks", name: `${t}: new risks in filings`, scope: one, trigger: {} }),
      },
      {
        id: "insiders",
        title: `Insiders buy ${money(floor)} or more`,
        line: `An executive or director reports buying ${t} shares.`,
        source: "SEC Form 4 filings",
        icon: "person",
        choices: { label: "At least", values: INSIDER_FLOORS, fallback: 100_000 },
        draft: draft({ template: "insider-trade", name: `${t}: insider buys of ${money(floor)}+`, scope: one, trigger: { side: "buy", min_value: floor } }),
      },
      {
        id: "move",
        title: `A move of ${size}% or more`,
        line: "A close that far from the day before, with the reason when we find one.",
        source: "daily closes and our research on why stocks moved",
        icon: "pulse",
        choices: { label: "Move", values: MOVE_SIZES, fallback: 5 },
        draft: draft({ template: "big-move", name: `${t}: moves of ${size}% or more`, scope: one, trigger: { pct: size, reason: true } }),
      },
    ];
  }
  if (subject.kind === "fund") {
    const who = { kind: "fund", id: subject.id, name: subject.name };
    return guardWho([
      {
        id: "trades",
        title: "Every new 13F",
        line: "Each new quarterly 13F, with what it bought.",
        source: "SEC 13F filings",
        icon: "briefcase",
        draft: draft({ template: "fund-filing", scope: { kind: "any" }, trigger: { who } }),
      },
    ]);
  }
  if (subject.kind === "congress") {
    const who = { kind: "congress", id: subject.id, name: subject.name };
    const floor = pick(CONGRESS_FLOORS, picked.buys, 15_000);
    return guardWho([
      {
        id: "trades",
        title: "Every new disclosure",
        line: "Each new trade they report to the House or Senate.",
        source: "House and Senate trade disclosures",
        icon: "capitol",
        draft: draft({ template: "congress-trade", scope: { kind: "any" }, trigger: { who } }),
      },
      {
        id: "buys",
        title: `Buys of ${money(floor)} or more`,
        line: "Only their purchases of at least this size.",
        source: "House and Senate trade disclosures",
        icon: "capitol",
        choices: { label: "At least", values: CONGRESS_FLOORS, fallback: 15_000 },
        draft: draft({
          template: "congress-trade",
          name: `${subject.name}'s buys of ${money(floor)}+`,
          scope: { kind: "any" },
          trigger: { who, side: "buy", min_value: floor },
        }),
      },
    ]);
  }
  const tickers = cleanTickers(subject.tickers, MAX_SCOPE_TICKERS);
  return [
    {
      id: "lines",
      title: subject.thesis ? "A line breaks" : "A reason breaks",
      line: subject.thesis
        ? "Every night, each line against new reports and 10-K or 10-Q risks."
        : "Every night, each company's reason against its latest figures.",
      source: "company reports and SEC filings",
      icon: "target",
      draft: null,
    },
    {
      id: "filings",
      title: "A big filing hits one",
      line: "Deals, impairments, auditor changes and other major 8-Ks on these stocks.",
      source: "SEC 8-K filings",
      icon: "filings",
      draft: tickers.length
        ? draft({ template: "sec-filing", name: `${subject.name}: big filings`, scope: { kind: "tickers", tickers }, trigger: { filings: { major: true } } })
        : null,
    },
  ];
}

export function recipeById(subject: RecipeSubject, id: string, size?: number | null): Recipe | null {
  const known = recipesFor(subject).find((recipe) => recipe.id === id);
  if (!known) return null;
  return recipesFor(subject, size != null ? { [known.id]: size } : {}).find((recipe) => recipe.id === id) ?? null;
}

/* ── is it already standing? ────────────────────────────────────────────── */

/** Plain data with its keys in order at every depth, so two equal rules print the same. */
function sortedDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedDeep);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, sortedDeep(entry)]));
}

/**
 * The rule without its size or its extras: a 3% move watch on NVDA (with or without the reason) stands for the 5%
 * recipe, and a plain 3-days-before earnings watch for the report-night one, so nobody stacks near-copies.
 */
function ruleKey(job: Pick<AgentJobDraft, "template" | "trigger" | "scope">): string {
  const trigger = { ...(job.trigger as AgentTrigger & Record<string, unknown>) };
  for (const extra of ["pct", "min_value", "reason", "night_of", "days_before"]) delete trigger[extra];
  if (trigger.type === "event" && trigger.who) trigger.who = { ...trigger.who, name: "" };
  const scope = job.scope.kind === "tickers" ? { kind: "tickers", tickers: [...job.scope.tickers].sort() } : job.scope;
  return JSON.stringify(sortedDeep([job.template, trigger, scope]));
}

/** The person's job that already does what this recipe would, if there is one (archived jobs are never passed in). */
export function standingJob<T extends Pick<AgentJobDraft, "template" | "trigger" | "scope">>(recipe: Recipe, jobs: readonly T[]): T | null {
  if (!recipe.draft) return null;
  const key = ruleKey(recipe.draft);
  return jobs.find((job) => ruleKey(job) === key) ?? null;
}

/**
 * Whether every recipe for this basket or thesis already stands: its own nightly check is on and a job watches its
 * stocks' big filings. The page then offers no entry (nothing left to switch on).
 */
export function basketFullyWatched<T extends Pick<AgentJobDraft, "template" | "trigger" | "scope">>(subject: Extract<RecipeSubject, { kind: "basket" }>, jobs: readonly T[]): boolean {
  if (!subject.enabled) return false;
  return recipesFor(subject).every((recipe) => recipe.id === "lines" || !recipe.draft || standingJob(recipe, jobs) !== null);
}
