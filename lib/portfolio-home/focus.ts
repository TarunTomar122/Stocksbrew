import { plainLeftOut, signedPct, signedPoints, pct } from "@/lib/memo/format";
import type { Memo } from "@/lib/memo/types";
import { fmtPlanDay } from "@/lib/dividend-plan";

import { pickNoticed, TOOL_GROUPS, TOOL_HREF, TOOL_TITLES, toolCard, type HomeMode, type HomeSources, type Noticed, type ToolId } from "./pick";

/**
 * What the My stocks overview leads with. Of everything the agent noticed
 * (./pick.ts), the two or three changes that ask the person for a decision go
 * first, each with one next step. Everything else (the other findings, then
 * each tool not already named in a finding, with its one live figure) waits
 * behind one fold, so nothing is said twice on the page. Pure, so it can be tested.
 */

export const MAX_LEAD = 3;

export type LeadAction = {
  label: string;
  href: string;
  /** "watch" sets up an agent (read back before anything is saved); "open" goes to the page with the evidence. */
  kind: "watch" | "open";
};

export type Lead = Noticed & { action: LeadAction };

/** One of the weekly memo's facts on the overview: a figure and the words that read on from it. */
export type MemoFact = {
  id: "week" | "driver" | "risk";
  /** What the figure is, in two or three words: "So far this week", "Biggest drag", "Main risk". */
  caption: string;
  figure: string;
  /** The words that read on from the figure: "against +2.0% for the S&P 500". */
  label: string;
  tone: "up" | "down" | "flat";
  ticker: string | null;
};

export type FoldRow = {
  key: string;
  /** What it is: the finding's caption ("Dividends") or the tool in plain words ("Plan for a goal"). */
  title: string;
  href: string;
  ticker: string | null;
  /** The tool's one live figure; findings have none. */
  figure: string | null;
  text: string;
  tone: Noticed["tone"] | null;
  tool: ToolId;
  /** The weekly memo's row only: the week in two or three figures (memoFacts). Empty when the memo has no view. */
  facts?: MemoFact[];
  /** The weekly memo's row only: which week, "Week of Nov 9". */
  note?: string;
};

export type Focus = {
  lead: Lead[];
  fold: FoldRow[];
};

/**
 * The one next step on a finding that needs the person. A report coming up gets the
 * agent request (a reminder, or a big-move watch when it is too close for one);
 * everything else goes to the page where the decision is made.
 */
export function leadAction(item: Noticed): LeadAction {
  if (item.tool === "earnings" && item.watch) return { label: item.watch.request, href: item.watch.href, kind: "watch" };
  if (item.id.startsWith("reason-") && item.ticker) return { label: `Review ${item.ticker}`, href: item.open.href, kind: "open" };
  return { label: item.open.label, href: item.open.href, kind: "open" };
}

/**
 * Where a tool goes. The example's tax-loss figure comes from the ideas page, which shows it; the Taxes page
 * needs your own lots, so a visitor would land on a sign-in box there.
 */
export function toolHref(id: ToolId, mode: HomeMode): string {
  return id === "taxes" && mode === "example" ? TOOL_HREF.ideas : TOOL_HREF[id];
}

/**
 * The tools a finding already speaks for, so their rows are not shown again. The reason watcher's findings are
 * about one stock, not the Portfolio tool's value; a trim idea already names the biggest company (the x-ray's
 * figure); a tax-loss idea is the Taxes figure.
 */
function toolsOf(item: Noticed): ToolId[] {
  if (item.id.startsWith("reason")) return [];
  if (item.id.startsWith("ideas-trim-")) return ["ideas", "xray"];
  if (item.id.startsWith("ideas-loss-")) return ["ideas", "taxes"];
  return [item.tool];
}

/**
 * The findings for the overview: pickNoticed without the next dividend, which is a date rather than a
 * decision. The log's "Coming up" says it (./log.ts) and the dividends tool row with the year's total stands
 * in for it here, so it should not take one of the five places.
 */
export function focusNoticed(sources: Omit<HomeSources, "goal">, mode: HomeMode): Noticed[] {
  return pickNoticed({ ...sources, dividends: { state: "empty" } }, mode);
}

/**
 * The weekly memo in figures, for the overview (owner rule 3: no paragraph to read): the week's move against the
 * S&P 500, the holding that moved it most, and the first thing the memo says could hurt. Each only when the memo
 * has it; a memo stored before the page went visual has none of the first two.
 */
export function memoFacts(memo: Memo): MemoFact[] {
  const out: MemoFact[] = [];
  const view = memo.view ?? null;
  if (view && view.portfolioPct !== null) {
    out.push({
      id: "week",
      caption: memo.complete ? "This week" : "So far this week",
      figure: signedPct(view.portfolioPct),
      label: view.marketPct !== null ? `against ${signedPct(view.marketPct)} for the S&P 500` : "",
      tone: Math.abs(view.portfolioPct) < 0.05 ? "flat" : view.portfolioPct > 0 ? "up" : "down",
      ticker: null,
    });
  }
  const top = view ? [...view.movers].sort((a, b) => Math.abs(b.points) - Math.abs(a.points))[0] : undefined;
  if (top && Math.abs(top.points) >= 0.05) {
    out.push({
      id: "driver",
      caption: top.points < 0 ? "Biggest drag" : "Biggest lift",
      figure: `${signedPoints(top.points)} pts`,
      // A running week says "so far": it is measured from Friday's close, not over the past five trading days.
      label: `${top.ticker} ${Math.abs(top.pct) < 0.05 ? "barely moved" : `${top.pct > 0 ? "rose" : "fell"} ${pct(top.pct)}`}${memo.complete ? "" : " so far this week"}`,
      tone: top.points < 0 ? "down" : "up",
      ticker: top.ticker,
    });
  }
  // The main risk is a risk the memo found (a sector, a report, a shock), not a call that changed: the memo page
  // shows calls on their own (lib/memo/view.ts cardItems).
  const risk = memo.hurt.find((item) => item.kind !== "call" && item.kind !== "drivers" && item.card?.figure && item.card.label);
  if (risk?.card) {
    out.push({ id: "risk", caption: "Main risk", figure: risk.card.figure, label: risk.card.label, tone: "flat", ticker: risk.tickers.length === 1 ? risk.tickers[0]! : null });
  }
  return out;
}

/** The memo's line can be from an older week; its first evidence sentence says which ("From the memo for the week of Nov 2, …"). */
function foldText(item: Noticed): string {
  if (item.tool !== "memo") return item.card?.sentence ?? item.text;
  // Stored memos may still say who the figure leaves out as how the sum works; say it as a fact.
  const text = plainLeftOut(item.text, "figure");
  const dated = item.evidence ? /^[^.]*\./.exec(item.evidence)?.[0] : null;
  return dated ? `${text} ${dated}` : text;
}

/** "One thing needs you this week." Short, one idea; the rows under it say what and why. */
export function focusHeadline(count: number, mode: HomeMode): string {
  const example = mode === "example";
  if (count <= 0) return example ? "Nothing in the example needs a decision this week." : "Nothing needs a decision from you this week.";
  const words = ["One thing", "Two things", "Three things"][count - 1] ?? `${count} things`;
  const verb = count === 1 ? "needs" : "need";
  return example ? `${words} in the example ${verb} a look this week.` : `${words} ${verb} you this week.`;
}

/**
 * Splits the findings into the lead and the fold. `noticed` is pickNoticed's
 * output, already ranked. With nothing that needs the person, the top finding
 * (usually the memo's line on the week) leads on its own, so the page still
 * opens on a read rather than a blank.
 */
export function prioritise(all: Noticed[], sources: Partial<HomeSources>, mode: HomeMode): Focus {
  // In case a caller passes pickNoticed's list: the next dividend belongs to the log (see focusNoticed).
  const noticed = all.filter((item) => item.tool !== "dividends");
  const urgent = noticed.filter((item) => item.needsYou).slice(0, MAX_LEAD);
  const leadItems = urgent.length > 0 ? urgent : noticed.slice(0, 1);
  const lead = leadItems.map((item) => ({ ...item, action: leadAction(item) }));
  const leadIds = new Set(lead.map((item) => item.id));
  const rest = noticed.filter((item) => !leadIds.has(item.id));

  const said = new Set(noticed.flatMap(toolsOf));
  const memo = sources.memo?.state === "ready" ? sources.memo.value.memo : null;
  const findingRows: FoldRow[] = rest.map((item) => ({
    key: item.id,
    title: item.caption,
    href: item.open.href,
    ticker: item.ticker,
    figure: item.card?.figure ?? null,
    text: foldText(item),
    tone: item.tone,
    tool: item.tool,
    ...(item.tool === "memo" && memo ? { facts: memoFacts(memo), note: `Week of ${fmtPlanDay(memo.monday)}` } : {}),
  }));
  const toolRows: FoldRow[] = TOOL_GROUPS.flatMap((group) => group.tools)
    .filter((id) => !said.has(id))
    .map((id) => {
      const card = toolCard(id, sources, mode);
      return { key: `tool-${id}`, title: TOOL_TITLES[id], href: toolHref(id, mode), ticker: null, figure: card.figure, text: card.detail, tone: null, tool: id };
    });
  return { lead, fold: [...findingRows, ...toolRows] };
}
