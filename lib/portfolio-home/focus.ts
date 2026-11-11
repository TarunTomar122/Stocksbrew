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

/** The memo's line can be from an older week; its first evidence sentence says which ("From the memo for the week of Nov 2, …"). */
function foldText(item: Noticed): string {
  if (item.tool !== "memo" || !item.evidence) return item.text;
  const dated = /^[^.]*\./.exec(item.evidence)?.[0];
  return dated ? `${item.text} ${dated}` : item.text;
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
  const findingRows: FoldRow[] = rest.map((item) => ({
    key: item.id,
    title: item.caption,
    href: item.open.href,
    ticker: item.ticker,
    figure: null,
    text: foldText(item),
    tone: item.tone,
    tool: item.tool,
  }));
  const toolRows: FoldRow[] = TOOL_GROUPS.flatMap((group) => group.tools)
    .filter((id) => !said.has(id))
    .map((id) => {
      const card = toolCard(id, sources, mode);
      return { key: `tool-${id}`, title: TOOL_TITLES[id], href: toolHref(id, mode), ticker: null, figure: card.figure, text: card.detail, tone: null, tool: id };
    });
  return { lead, fold: [...findingRows, ...toolRows] };
}
