import { describe, expect, it } from "vitest";

import { groupOf, type ProposalAction, type ProposalCard } from "@/lib/proposals";

import { cardAction, layoutPlan, planHasTile, proposalBlocks, type PlannedBlock } from "./groups";

function card(id: string, action: ProposalAction, title = `Title ${id}`): ProposalCard {
  return {
    id,
    kind: "level_reached",
    ticker: "ticker" in action ? action.ticker : null,
    title,
    why: [`Line ${id}.`],
    read: [],
    figures: [],
    status: "pending",
    result: null,
    created_at: "2026-11-12T12:00:00.000Z",
    level: null,
    usualPct: null,
    does: null,
    actionType: action.type,
    quote: null,
    group: groupOf(action),
  };
}

// Two other actions that group (practice tickets are no longer proposed, owner Nov 13).
const buy = (ticker: string): ProposalAction => ({ type: "alert_earnings", ticker, instrument_id: `US_${ticker}`, report_date: "2026-11-20", label: "" });
const pause = (name: string): ProposalAction => ({ type: "agent_enable", job_id: `job-${name}`, job_name: name, enabled: false });
const alert = (ticker: string, price: number, replaces: number | null = null): ProposalAction => ({
  type: "alert_price",
  ticker,
  instrument_id: `US_${ticker}`,
  condition: "below",
  price,
  replaces: replaces === null ? null : { alert_id: "a1", price: replaces },
});

describe("proposal groups", () => {
  // Judge 89: the same action printed on four cards on /agent.
  it("puts two or more cards of one action under one heading, and loose cards first", () => {
    const cards = [card("asts", alert("ASTS", 33.66)), card("lly", buy("LLY")), card("dell", buy("DELL")), card("oust", buy("OUST")), card("meta", buy("META"))];
    const blocks = proposalBlocks(cards);
    expect(blocks.map((block) => [block.heading, block.cards.map((entry) => entry.id)])).toEqual([
      [null, ["asts"]],
      ["Get a reminder the day before each report", ["lly", "dell", "oust", "meta"]],
    ]);
    // The lone alert and the status tile share a row; the group's four fill two.
    expect(layoutPlan(blocks, true).map((block) => [block.cards.length, block.guests.length, block.tile])).toEqual([
      [1, 0, true],
      [4, 0, false],
    ]);
  });

  it("keeps a lone card of its kind as a plain card, and reminders apart from pauses", () => {
    const blocks = proposalBlocks([card("a", buy("A")), card("b", pause("B")), card("c", alert("C", 10))]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.heading).toBeNull();
    expect(blocks[0]!.cards.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
  });

  it("groups alerts too, each card keeping its own level", () => {
    const blocks = proposalBlocks([card("a", alert("A", 33.66), "Set an alert on A at $33.66"), card("b", alert("B", 152, 120), "Move B's $120 alert to $152")]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.heading).toBe("Set price alerts");
    expect(blocks[0]!.cards.map((entry) => cardAction(entry, true))).toEqual(["Alert at $33.66", "Move the $120 alert to $152"]);
  });

  it("says the whole title on a loose card and nothing more than the ticker under a reminders heading", () => {
    const loose = card("a", buy("A"), "Get a reminder the day before A reports");
    expect(cardAction(loose, false)).toBe("Get a reminder the day before A reports");
    expect(cardAction(loose, true)).toBeNull();
  });

  it("puts no status tile when every block's rows are full", () => {
    const blocks = proposalBlocks([card("a", buy("A")), card("b", buy("B")), card("c", alert("C", 1)), card("d", alert("D", 2))]);
    expect(blocks.map((block) => block.cards.length)).toEqual([2, 2]);
    expect(planHasTile(layoutPlan(blocks, true))).toBe(false);
  });

  it("reads an older card without its group as a loose card", () => {
    const old = { ...card("a", buy("A")), group: undefined } as unknown as ProposalCard;
    const blocks = proposalBlocks([old, card("b", buy("B"))]);
    expect(blocks).toEqual([{ key: "loose", heading: null, cards: [old, expect.objectContaining({ id: "b" })] }]);
  });

  it("names a basket by its name when short, else as your idea basket", () => {
    const edit = (name: string): ProposalAction => ({ type: "basket_edit", basket_id: "b1", basket_name: name, op: "drop", ticker: "ARM", company: null, kind: "growth", reason: null });
    expect(groupOf(edit("AI chips")).heading).toBe("Drop from “AI chips”");
    expect(groupOf(edit("The long list of every chip maker I like")).heading).toBe("Drop from your idea basket");
  });
});

/** Cells per block, two across: its cards, guests and the tile. */
const cells = (block: PlannedBlock) => block.cards.length + block.guests.length + (block.tile ? 1 : 0);

describe("the layout plan, two across", () => {
  const alerts = (n: number) => Array.from({ length: n }, (_, i) => card(`a${i}`, alert(`A${i}`, 10 + i)));
  const buys = (n: number) => Array.from({ length: n }, (_, i) => card(`b${i}`, buy(`B${i}`)));
  // Lone cards: one of each kind no other card shares.
  const lone = (n: number) =>
    [card("l0", { type: "watch_add", ticker: "L0", instrument_id: "US_L0" }), card("l1", pause("L1")), card("l2", { type: "agent_enable", job_id: "job-L2", job_name: "L2", enabled: true })].slice(0, n);

  // Judge 89 follow-up: 1 lone card beside a group of 3 left an empty slot. Every mix of up to five cards, with and
  // without the status, ends every row full whenever anything can fill it.
  it("ends every row full for every mix of lone and grouped cards", () => {
    const mixes: Array<[string, ProposalCard[]]> = [
      ["1+2", [...lone(1), ...buys(2)]],
      ["1+3", [...lone(1), ...buys(3)]],
      ["2+3", [...lone(2), ...buys(3)]],
      ["0+4", buys(4)],
      ["0+5", buys(5)],
      ["1+4", [...lone(1), ...buys(4)]],
      ["2+2", [...buys(2), ...alerts(2)]],
      ["3+2", [...buys(3), ...alerts(2)]],
      ["1+2+2", [...lone(1), ...buys(2), ...alerts(2)]],
      ["3+0", lone(3)],
      ["1+0", lone(1)],
    ];
    for (const [name, list] of mixes) {
      const plan = layoutPlan(proposalBlocks(list), true);
      // Every card shows exactly once.
      const shown = plan.flatMap((block) => [...block.cards, ...block.guests].map((entry) => entry.id)).sort();
      expect(shown, name).toEqual(list.map((entry) => entry.id).sort());
      // The tile in one place at most, and every block whole.
      expect(plan.filter((block) => block.tile).length, name).toBeLessThanOrEqual(1);
      for (const block of plan) expect(cells(block) % 2, `${name} ${block.key}`).toBe(0);
    }
  });

  it("sets the lone card in the group's last row for 1+3, with no tile needed", () => {
    const plan = layoutPlan(proposalBlocks([...lone(1), ...buys(3)]), true);
    expect(plan).toHaveLength(1);
    expect(plan[0]!.heading).toBe("Get a reminder the day before each report");
    expect(plan[0]!.guests.map((entry) => entry.id)).toEqual(["l0"]);
    expect(plan[0]!.tile).toBe(false);
    // The guest keeps its whole title; the group's own cards say only their part.
    expect(cardAction(plan[0]!.guests[0]!, false)).toBe("Title l0");
  });

  it("for 2+3 moves the least pressing lone card into the group and tiles the other", () => {
    const plan = layoutPlan(proposalBlocks([...lone(2), ...buys(3)]), true);
    expect(plan.map((block) => [block.cards.map((entry) => entry.id), block.guests.map((entry) => entry.id), block.tile])).toEqual([
      [["l0"], [], true],
      [["b0", "b1", "b2"], ["l1"], false],
    ]);
  });

  it("without the status, a lone odd card keeps its one empty slot rather than a made-up filler", () => {
    const plan = layoutPlan(proposalBlocks(lone(1)), false);
    expect(plan).toEqual([expect.objectContaining({ tile: false, guests: [] })]);
    // Still whole when a lone card can fill the group.
    expect(layoutPlan(proposalBlocks([...lone(1), ...buys(3)]), false).every((block) => cells(block) % 2 === 0)).toBe(true);
  });
});
