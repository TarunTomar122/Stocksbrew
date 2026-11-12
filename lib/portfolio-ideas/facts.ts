import { growthBars } from "@/lib/call-evidence";
import type { ScreenerRow } from "@/lib/screener-shared";

import type { CallWord } from "./types";

/**
 * The "why" under each idea card, as figures with bars instead of the call's sentence (owner, Nov 12: "this entire
 * page is like super text heavy... make it super visual"). Built from the screener row's own fields, never parsed
 * from the reason's numbers:
 * - sales growth over four quarters, with the bars the call is measured against (lib/call-evidence.ts `growthBars`,
 *   the same rule backend/call_reason.py writes into the reason);
 * - the five-day move against the median of similar companies (the same groups as backend/agentdata/screener.py
 *   `peer_moves`: the industry when it has a plain name, else the sector);
 * - the P/E against its own median.
 *
 * A threshold marker is drawn only when the call's own change sentence (the screener row's `call_change`, the second
 * sentence of a company reason) names that kind of condition, so a card never shows a bar the call is not actually
 * measured against. The caller passes that sentence only when it still stands in the reason shown for today's call.
 */

export type FactMark = { value: number; label: string };

export type StockFact =
  | { kind: "sales"; value: number; marks: FactMark[] }
  | { kind: "move"; value: number; peer: number; peerLabel: string }
  | { kind: "pe"; value: number; usual: number; mark: boolean };

export type CardFacts = {
  rows: StockFact[];
  /** What would change the call, at most 12 words, or null when the reason names nothing we can draw. */
  change: string | null;
};

const fin = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

// Industry words -> how a reader names the group, as backend/call_reason.py `_PEER_INDUSTRY` (first match wins).
const PEER_INDUSTRY: ReadonlyArray<readonly [string, string]> = [
  ["asset management", "brokers and asset managers"],
  ["custody", "brokers and asset managers"],
  ["capital markets", "brokers and asset managers"],
  ["automotive retail", "retailers"],
  ["auto dealer", "retailers"],
  ["gas utilit", "utilities"],
  ["industrial gas", "chemical makers"],
  ["chemical", "chemical makers"],
  ["semiconductor", "chip stocks"],
  ["software", "software stocks"],
  ["bank", "bank stocks"],
  ["biotech", "biotech stocks"],
  ["drug", "drug makers"],
  ["pharma", "drug makers"],
  ["oil", "oil and gas stocks"],
  ["natural gas", "oil and gas stocks"],
  ["beverage", "drink makers"],
  ["restaurant", "restaurant stocks"],
  ["insurance", "insurers"],
  ["reit", "property trusts"],
  ["aerospace", "aerospace and defense stocks"],
  ["auto", "car and parts makers"],
  ["internet", "internet stocks"],
  ["entertainment", "media stocks"],
  ["airline", "airlines"],
  ["medical", "medical device makers"],
  ["credit services", "card and lending companies"],
  ["retail", "retailers"],
  ["utilities", "utilities"],
  ["telecom", "telecom stocks"],
  ["computer hardware", "hardware makers"],
  ["communication equipment", "network equipment makers"],
  ["information technology services", "IT services companies"],
];

const PEER_SECTOR: Record<string, string> = {
  technology: "tech stocks",
  "health care": "health care stocks",
  financials: "financial stocks",
  "consumer discretionary": "consumer stocks",
  "consumer staples": "food, drink and household stocks",
  "communication services": "media and telecom stocks",
  industrials: "industrial stocks",
  energy: "energy stocks",
  materials: "materials stocks",
  "real estate": "property stocks",
  utilities: "utilities",
};

/** ["industry", "chip stocks"], ["sector", "tech stocks"], or ["", ""] when unknown. */
export function peerLabel(industry: string | null | undefined, sector: string | null | undefined): ["industry" | "sector" | "", string] {
  const text = String(industry ?? "").trim().toLowerCase();
  if (text) for (const [needle, label] of PEER_INDUSTRY) if (text.includes(needle)) return ["industry", label];
  const label = PEER_SECTOR[String(sector ?? "").trim().toLowerCase()] ?? "";
  return label ? ["sector", label] : ["", ""];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * How the rest of each wanted stock's industry (else its sector) moved over five days: the median, without the stock
 * itself, from at least `minPeers` others.
 */
export function peerMoves(rows: readonly ScreenerRow[], wanted: Iterable<string>, minPeers = 4): Map<string, { label: string; ret1w: number }> {
  const groups = new Map<string, ScreenerRow[]>();
  const keysOf = new Map<string, string[]>();
  for (const row of rows) {
    const [kind, label] = peerLabel(row.industry, row.sector);
    const [, sectorLabel] = peerLabel("", row.sector);
    const keys = [kind === "industry" ? `industry:${label}` : "", sectorLabel ? `sector:${sectorLabel}` : ""].filter(Boolean);
    keysOf.set(row.symbol, keys);
    for (const key of keys) {
      const list = groups.get(key);
      if (list) list.push(row);
      else groups.set(key, [row]);
    }
  }
  const out = new Map<string, { label: string; ret1w: number }>();
  for (const symbol of wanted) {
    for (const key of keysOf.get(symbol) ?? []) {
      const others = (groups.get(key) ?? []).filter((row) => row.symbol !== symbol);
      if (others.length < minPeers) continue;
      const values = others.map((row) => row.ret_1w).filter(fin);
      if (values.length < minPeers) continue;
      out.set(symbol, { label: key.slice(key.indexOf(":") + 1), ret1w: median(values) });
      break;
    }
  }
  return out;
}

const SALES_CHANGE = /sales (?:growth (?:stays above|falls below|below|back above)|shrink|growing again)/i;
const PE_CHANGE = /P\/E (?:climbs back above|falls back to|back at)/i;

function times(value: number): string {
  return value >= 10 ? String(Math.round(value)) : value.toFixed(1).replace(/\.0$/, "");
}

/** The bars a call is measured against on sales growth: Keep both ways, Buy more the floor, Sell some the way back. */
export function salesMarks(growth: number, call: CallWord | null): FactMark[] {
  const bars = growthBars(growth, null);
  if (call === "Hold") {
    const marks: FactMark[] = [];
    if (bars.down !== null) marks.push({ value: bars.down, label: "lower" });
    if (bars.up !== null) marks.push({ value: bars.up, label: "raise" });
    return marks;
  }
  if (call === "Add") return bars.down !== null ? [{ value: bars.down, label: "stop" }] : [];
  if (call === "Trim") return bars.recover !== null ? [{ value: bars.recover, label: "stop" }] : [];
  return [];
}

/**
 * The change sentence's condition, figure first, in the call words a step away (one step at a time: Buy more and Sell
 * some only ever move to Keep; Keep moves either way): "Buy more above 17% sales growth · Sell some below 9%".
 */
function changeLine(call: CallWord | null, sales: StockFact | null, pe: StockFact | null): string | null {
  if (sales?.kind === "sales" && sales.marks.length > 0) {
    const [first, second] = sales.marks;
    const down = (bar: FactMark) => (bar.value === 0 ? "Sell some if sales shrink" : `Sell some below ${bar.value}% sales growth`);
    if (call === "Hold" && first && second)
      return `Buy more above ${second.value}% sales growth · ${first.value === 0 ? "Sell some if sales shrink" : `Sell some below ${first.value}%`}`;
    if (call === "Hold" && first) return down(first);
    if (call === "Add" && first) return first.value === 0 ? "Keep if sales shrink" : `Keep below ${first.value}% sales growth`;
    if (call === "Trim" && first) return first.value === 0 ? "Keep once sales grow again" : `Keep above ${first.value}% sales growth`;
  }
  if (pe?.kind === "pe" && pe.mark) {
    const usual = times(pe.usual);
    if (call === "Add") return `Keep if the P/E tops ${usual}`;
    if (call === "Trim") return `Keep if the P/E falls to ${usual}`;
    if (call === "Hold") return `Buy more if the P/E falls to ${usual}`;
  }
  return null;
}

/** Up to two figure rows for one stock's card, and what would change its call. */
export function cardFacts(
  row: Pick<ScreenerRow, "rev_growth" | "ret_1w" | "pe" | "pe_hist_median"> | null | undefined,
  peer: { label: string; ret1w: number } | null | undefined,
  call: CallWord | null,
  /** The call's change sentence, or null when there is none for today's call. */
  change: string | null,
): CardFacts {
  if (!row) return { rows: [], change: null };
  const text = change ?? "";
  const salesGate = SALES_CHANGE.test(text);
  const peGate = PE_CHANGE.test(text);
  const sales: StockFact | null = fin(row.rev_growth) ? { kind: "sales", value: row.rev_growth, marks: salesGate ? salesMarks(row.rev_growth, call) : [] } : null;
  const move: StockFact | null =
    fin(row.ret_1w) && peer && fin(peer.ret1w) && Math.abs(row.ret_1w - peer.ret1w) >= 2
      ? { kind: "move", value: row.ret_1w, peer: peer.ret1w, peerLabel: peer.label }
      : null;
  const pe: StockFact | null =
    fin(row.pe) && row.pe > 0 && fin(row.pe_hist_median) && row.pe_hist_median > 0
      ? { kind: "pe", value: row.pe, usual: row.pe_hist_median, mark: peGate && !salesGate }
      : null;
  const peFar = pe?.kind === "pe" && Math.abs(pe.value / pe.usual - 1) >= 0.15;
  // The condition the call names comes first, then the bigger story: a move well apart from its group, else the P/E.
  const order: Array<StockFact | null> = peGate && !salesGate ? [pe, sales, move] : [sales, move, peFar ? pe : null, pe];
  const rows: StockFact[] = [];
  for (const fact of order) if (fact && !rows.some((have) => have.kind === fact.kind) && rows.length < 2) rows.push(fact);
  return { rows, change: changeLine(call, sales, pe) };
}
