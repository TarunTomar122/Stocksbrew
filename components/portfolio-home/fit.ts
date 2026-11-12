/**
 * How the My stocks overview fills its rows (owner rule 4, BALANCE CHECK: "empty space on left side, u didn't fix all
 * possible cases"). There is no side rail: the holdings, the weekly memo's figures and the agents are cards in ONE
 * grid, 1, 2, 3 or 4 across by width, and each part starts in the cells the one before it left. So no row can end
 * short but the very last, and the counts here make that one full too:
 * - the holdings show the cards that need a look, every quiet one behind one button;
 * - the memo shows as many of the week's movers as it takes, up to two rows; every card is one cell wide, never
 *   stretched over two (owner, Nov 12: "not a good idea to stretch this card it should be fixed width");
 * - the quiet agents can share one card.
 * A part that starts a row gets a heading over the whole row; one that starts beside the part before it says its
 * name at the top of its first card instead. Everything is decided on the server from the counts, for each width and
 * for the holdings folded or open, as plain classes: nothing is measured and nothing moves after the first paint.
 */

/** Cards across at each width: phone, `sm`, `xl`, `2xl`. */
export const COLS = [1, 2, 3, 4] as const;

/** The one grid, at the column counts in COLS. `group/fold` carries the holdings' open state (./fold-cards.tsx). */
export const CARD_GRID = "grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";

// Written out whole so Tailwind sees every class. The OPEN_ ones apply while the holdings are opened.
const HIDE = ["hidden", "sm:hidden", "xl:hidden", "2xl:hidden"] as const;
const DISPLAY = {
  block: ["block", "sm:block", "xl:block", "2xl:block"],
  flex: ["flex", "sm:flex", "xl:flex", "2xl:flex"],
  inline: ["inline", "sm:inline", "xl:inline", "2xl:inline"],
  "inline-flex": ["inline-flex", "sm:inline-flex", "xl:inline-flex", "2xl:inline-flex"],
} as const;
const OPEN_HIDE = ["group-data-[open=true]/fold:hidden", "sm:group-data-[open=true]/fold:hidden", "xl:group-data-[open=true]/fold:hidden", "2xl:group-data-[open=true]/fold:hidden"] as const;
const OPEN_DISPLAY = {
  block: ["group-data-[open=true]/fold:block", "sm:group-data-[open=true]/fold:block", "xl:group-data-[open=true]/fold:block", "2xl:group-data-[open=true]/fold:block"],
  flex: ["group-data-[open=true]/fold:flex", "sm:group-data-[open=true]/fold:flex", "xl:group-data-[open=true]/fold:flex", "2xl:group-data-[open=true]/fold:flex"],
  inline: ["group-data-[open=true]/fold:inline", "sm:group-data-[open=true]/fold:inline", "xl:group-data-[open=true]/fold:inline", "2xl:group-data-[open=true]/fold:inline"],
  "inline-flex": ["group-data-[open=true]/fold:inline-flex", "sm:group-data-[open=true]/fold:inline-flex", "xl:group-data-[open=true]/fold:inline-flex", "2xl:group-data-[open=true]/fold:inline-flex"],
} as const;
type Display = keyof typeof DISPLAY;

/** One class per width, written only where it changes from the narrower width. */
function stepped<T>(values: readonly T[], pick: (value: T, at: number) => string): string {
  const out: string[] = [];
  values.forEach((value, at) => {
    if (at === 0 || value !== values[at - 1]) out.push(pick(value, at));
  });
  return out.join(" ");
}

const same = <T>(a: readonly T[], b: readonly T[]) => a.every((value, at) => value === b[at]);

/**
 * Shown or hidden at each width in COLS, folded (`shown`) and, when it differs, with the holdings open (`open`).
 * Nothing at all when shown everywhere in both.
 */
export function showAt(shown: readonly boolean[], display: Display = "block", open: readonly boolean[] = shown): string {
  const base = shown.every(Boolean) ? "" : stepped(shown, (on, at) => (on ? DISPLAY[display][at]! : HIDE[at]!));
  // Open: every width written from the phone up, since a folded class at a narrower width would otherwise leak in.
  const opened = same(shown, open) ? "" : stepped(open, (on, at) => (on ? OPEN_DISPLAY[display][at]! : OPEN_HIDE[at]!));
  return `${base} ${opened}`.trim();
}

/** Empty cells left at the end of the last row. */
export function gap(cells: number, cols: number): number {
  return cells % cols === 0 ? 0 : cols - (cells % cols);
}

/* ── the holdings ─────────────────────────────────────────────────────── */

/**
 * How many holding cards show before the fold, at `cols` across: exactly the ones that need a look (they come
 * first), every quiet one behind one "Show N more" (owner, Nov 12: "why show me all when only 6 needs a look"); the
 * memo and agents fill the rest of that row. With none that need a look, two rows (four on a phone).
 */
export function holdingsShown(total: number, need: number, cols: number): number {
  if (total <= 0) return 0;
  if (need > 0) return Math.min(total, need);
  return Math.min(total, Math.max(4, cols * 2));
}

/* ── the memo and the agents, after the holdings ──────────────────────── */

export type MemoCounts = {
  /** Figure cards (the main risk), shown first. */
  facts: number;
  /** The week's movers available, biggest first. */
  movers: number;
};

export type AgentCounts = {
  /** Agent cards (flagged, failed and waiting first, quiet last). */
  lines: number;
  /** Of them, quiet ones (last in order). Two or more can share one card. */
  quiet: number;
};

export type FlowPlan = {
  /** Null when there is no memo. */
  memo: {
    /** Cards shown, figures first. */
    cells: number;
    /** It starts beside the holdings, so its first card carries its name; else a heading over its row. */
    inline: boolean;
  } | null;
  agents: { merged: boolean; inline: boolean } | null;
  /** Empty cells left in the last row: 0 unless there is too little to fill it. */
  empty: number;
};

/** Whether score `a` beats `b`: the first place they differ decides, lower wins. */
function lower(a: readonly number[], b: readonly number[]): boolean {
  const at = a.findIndex((value, i) => value !== b[i]);
  return at >= 0 && a[at]! < b[at]!;
}

/** At most this many rows of memo cards; the memo page has the rest. */
const MEMO_ROWS = 2;
/** A phone shows the main risk and two movers. */
const PHONE_MEMO_CELLS = 3;

/**
 * The memo and agents after `holdings` cards at `cols` across, chosen so the last row ends full: every option for the
 * memo (how many movers) and the agents (quiet ones in one card or not), scored by the empty cells left, then by how
 * few parts start beside another, then by showing more of the memo, then by the plainer cards.
 */
export function planFlow(holdings: number, memo: MemoCounts | null, agents: AgentCounts | null, cols: number): FlowPlan {
  const memoMax = memo ? memo.facts + memo.movers : 0;
  const cap = cols === 1 ? PHONE_MEMO_CELLS : cols * MEMO_ROWS;
  const memoChoices: Array<{ cells: number } | null> = [];
  if (memoMax > 0) {
    // Every figure first (as many as fit), then movers.
    const least = Math.max(1, Math.min(memo!.facts, cap));
    for (let cells = least; cells <= Math.min(memoMax, cap); cells++) memoChoices.push({ cells });
  } else memoChoices.push(null);
  const agentChoices: Array<{ merged: boolean; count: number } | null> = [];
  if (agents && agents.lines > 0) {
    agentChoices.push({ merged: false, count: agents.lines });
    if (agents.quiet >= 2 && cols >= 2) agentChoices.push({ merged: true, count: agents.lines - agents.quiet + 1 });
  } else agentChoices.push(null);

  let best: { plan: FlowPlan; score: number[] } | null = null;
  for (const m of memoChoices) {
    const memoStart = holdings;
    const memoWidth = m?.cells ?? 0;
    // Two rows counted from where it starts, so a memo beside the holdings still ends within two rows.
    if (m && cols > 1 && memoWidth > cap - (memoStart % cols)) continue;
    for (const a of agentChoices) {
      const agentStart = memoStart + memoWidth;
      const total = agentStart + (a?.count ?? 0);
      const empty = holdings + memoWidth + (a?.count ?? 0) === 0 ? 0 : gap(total, cols);
      const memoInline = Boolean(m) && memoStart % cols !== 0;
      const agentsInline = Boolean(a) && agentStart % cols !== 0;
      // A memo with no figure starts on a mover card, which links to its stock: started beside the holdings, nothing
      // would link to the memo itself, so that is the last resort.
      const memoLinkless = memoInline && memo!.facts === 0 ? 1 : 0;
      const score = [empty, memoLinkless, Number(memoInline) + Number(agentsInline), -(m?.cells ?? 0), a?.merged ? 1 : 0];
      const plan: FlowPlan = {
        memo: m ? { cells: m.cells, inline: memoInline } : null,
        agents: a ? { merged: a.merged, inline: agentsInline } : null,
        empty,
      };
      if (!best || lower(score, best.score)) best = { plan, score };
    }
  }
  return best!.plan;
}
