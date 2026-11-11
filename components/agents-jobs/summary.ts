import { calendarDays, triggerLabel, type AgentJobDraft } from "@/lib/agent-jobs";

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** When the after-close run starts, "5:30 PM ET", kept on one line. */
function runTime(time: string | null | undefined): string {
  return (time ?? "5:30 PM ET").replace(/ /g, " ");
}

/** When an agent checks, in one line for the phone summary. */
export function checksWhenShort(trigger: AgentJobDraft["trigger"], time?: string | null): string {
  const at = runTime(time);
  if (trigger.type === "schedule" && trigger.cadence === "weekly") return `Checks from ${at} every ${WEEKDAY_NAMES[trigger.weekday ?? 1] ?? "Monday"}.`;
  return `Checks from ${at} each market day.`;
}

/**
 * When the earnings warning arrives. The rule counts calendar days (lib/agent-jobs.ts earningsWithin), but the
 * checks only run on market days, so it comes on the first market day within that many days of the report: a
 * Wednesday report with 3 days set is flagged on Monday, not on the Sunday before.
 */
export function earningsWhen(trigger: AgentJobDraft["trigger"]): string | null {
  if (trigger.type !== "event" || trigger.event !== "earnings_approaching") return null;
  return `It tells you on the first market day within ${calendarDays(trigger.days_before ?? 3)} of the report.`;
}

/** How it tells you, in one line for the phone summary: the earnings timing when that is the rule. */
export function tellsShort(trigger: AgentJobDraft["trigger"]): string {
  return earningsWhen(trigger) ?? "It emails you when it finds something.";
}

/**
 * What the agent watches, in a few words for the phone summary: "NVDA: 3 calendar days before earnings". A
 * schedule agent goes by its name ("Weekly review"), because the line under it already says the day.
 */
export function watchSummary(
  draft: Pick<AgentJobDraft, "trigger" | "scope">,
  options: { signedIn: boolean; tracked: number; title: string },
): string {
  const { trigger, scope } = draft;
  const what = trigger.type === "schedule" ? options.title : triggerLabel(trigger);
  const who =
    scope.kind === "tickers"
      ? scope.tickers.length > 0
        ? scope.tickers.slice(0, 4).join(", ") + (scope.tickers.length > 4 ? ` and ${scope.tickers.length - 4} more` : "")
        : "No stocks picked yet"
      : scope.kind === "any"
        ? "Any stock"
        : options.signedIn && options.tracked > 0
          ? `Your ${options.tracked} tracked ${options.tracked === 1 ? "stock" : "stocks"}`
          : "The stocks you track";
  // "Closes above $180" reads on after the colon in lower case; "SEC filing", "8-K" or "13F" keep theirs.
  const lower = trigger.type !== "schedule" && /^[A-Z][a-z]/.test(what) ? what.charAt(0).toLowerCase() + what.slice(1) : what;
  return `${who}: ${lower}`;
}
