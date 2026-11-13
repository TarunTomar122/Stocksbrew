import Link from "next/link";

import { StockLogo } from "@/components/stock-logo";
import type { BasketAgent, BasketRun } from "@/lib/basket-agent/model";
import { capitalize, dayWords } from "@/lib/day-words";
import {
  STATUS_WORDS,
  thesisHref,
  type ThesisState,
} from "@/lib/thesis-monitor/model";

import { NUM } from "./parts";

const LINK =
  "inline-flex h-8 items-center rounded-lg border border-oa-border bg-oa-secondary px-3 text-sm font-medium text-oa-secondary-fg hover:bg-[color-mix(in_srgb,var(--oa-secondary)_95%,var(--ink))]";

/** What the latest check found, as one figure: "1 broken", "2 weaker", "all hold". */
function figureOf(
  run: BasketRun | null,
): { text: string; tone: string } | null {
  if (!run) return null;
  if (run.decision === "could_not_check")
    return { text: "couldn't check", tone: "text-oa-muted-fg" };
  const broken = run.statuses.filter(
    (status) => status.verdict === "broken" || status.verdict === "played_out",
  ).length;
  const weaker = run.statuses.filter(
    (status) => status.verdict === "weaker",
  ).length;
  if (broken > 0)
    return { text: `${broken} to drop`, tone: "text-signal-bearish" };
  if (run.changes.length > 0)
    return { text: `${run.changes.length} to add`, tone: "text-oa-primary" };
  if (weaker > 0) return { text: `${weaker} weaker`, tone: "text-oa-fg" };
  return { text: "all hold", tone: "text-oa-muted-fg" };
}

/**
 * The person's idea baskets on /agents: one row per basket (its first logos, the name, how many companies, what the
 * latest check found, when it ran), the row itself the link. One "Watch an idea" in the header.
 */
/** A thesis's latest check as the row's figure: "Under strain", "Holds". */
function thesisFigure(state: ThesisState): { text: string; tone: string } {
  const tone =
    state.status === "broken"
      ? "text-signal-bearish"
      : state.status === "strain"
        ? "text-oa-primary"
        : "text-oa-muted-fg";
  return {
    text: `thesis ${STATUS_WORDS[state.status].toLowerCase()}`,
    tone,
  };
}

export function BasketList({
  baskets,
  runs,
  theses = {},
  today,
  overPlan = new Set<string>(),
  nextCheck = null,
}: {
  baskets: BasketAgent[];
  runs: BasketRun[];
  /** The latest thesis check of each basket that has one (lib/thesis-monitor), by basket id. */
  theses?: Readonly<Record<string, ThesisState | undefined>>;
  today: string;
  /** Switched on, but past the plan's room: the nightly run leaves them out. */
  overPlan?: ReadonlySet<string>;
  /** When the next check runs, in words ("Monday"), for a basket not checked yet. */
  nextCheck?: string | null;
}) {
  const latest = new Map<string, BasketRun>();
  for (const run of runs)
    if (!latest.has(run.basket_id)) latest.set(run.basket_id, run);
  return (
    <section
      aria-labelledby="idea-baskets"
      className="oa-surface mt-4 min-w-0 overflow-hidden border border-oa-border bg-oa-card"
    >
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-oa-border px-4 py-2">
        <h2
          id="idea-baskets"
          className="flex items-baseline gap-2 text-[16px] font-semibold text-oa-fg"
        >
          Idea baskets
          {baskets.length > 0 ? (
            <span className={`${NUM} text-[14px] text-oa-primary`}>
              {baskets.length}
            </span>
          ) : null}
        </h2>
        <Link prefetch={false} href="/agents/baskets/new" className={LINK}>
          Watch an idea
        </Link>
      </div>
      {baskets.length === 0 ? (
        <p className="px-4 py-3 text-[14px] leading-5 text-oa-muted-fg">
          Turn an idea into a basket your agent checks every market day.
        </p>
      ) : (
        <ul className="divide-y divide-oa-border">
          {baskets.map((basket) => {
            // A thesis over holdings has no basket runs: its own check is its record.
            const holdings = basket.source.kind === "holdings";
            const thesis = theses[basket.id] ?? null;
            const run = holdings ? null : (latest.get(basket.id) ?? null);
            const figure = thesis ? thesisFigure(thesis) : figureOf(run);
            const checked = thesis?.day ?? run?.day ?? null;
            return (
              <li
                key={basket.id}
                className="relative flex min-w-0 items-center gap-3 px-4 py-2.5 transition-colors hover:bg-oa-accent"
              >
                <span className="flex shrink-0 -space-x-1.5">
                  {basket.lines.slice(0, 4).map((line) => (
                    <StockLogo
                      key={line.ticker}
                      ticker={line.ticker}
                      size={22}
                    />
                  ))}
                </span>
                <span className="min-w-0 flex-1 leading-5">
                  <Link
                    prefetch={false}
                    href={
                      holdings
                        ? thesisHref(basket.id)
                        : `/agents/baskets/${encodeURIComponent(basket.id)}`
                    }
                    className="block truncate text-[14.5px] font-medium text-oa-fg after:absolute after:inset-0"
                  >
                    {basket.name}
                  </Link>
                  <span
                    className={`${NUM} block text-[12.5px] text-oa-muted-fg`}
                  >
                    {basket.lines.length}{" "}
                    {basket.lines.length === 1 ? "company" : "companies"}
                    {figure ? (
                      <>
                        {" · "}
                        <span className={figure.tone}>{figure.text}</span>
                      </>
                    ) : null}
                  </span>
                </span>
                <span className="shrink-0 text-right text-[12.5px] leading-5 text-oa-muted-fg">
                  {!basket.enabled
                    ? "Paused"
                    : overPlan.has(basket.id)
                      ? "Paused by your plan"
                      : checked
                        ? capitalize(dayWords(checked, today))
                        : nextCheck
                          ? `Checks ${nextCheck}`
                          : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
