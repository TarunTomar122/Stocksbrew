/**
 * Near-identical insider rows folded into one, for the insider trade lists.
 * When several insiders of one company in the same kind of job trade the same
 * way on the same day at about the same price (a board buying together, an
 * officer group selling into one window), the list says it once:
 * "12 vice presidents" with their total, instead of twelve rows that differ
 * only in the name.
 */
import type { InsiderTrade } from "@/lib/follow-shared";

export type RoleKind = "director" | "vp" | "chief" | "owner" | "officer";

export type InsiderGroup = {
  kind: "group";
  key: string;
  symbol: string;
  company: string;
  side: "buy" | "sell";
  role: RoleKind;
  /** "12 vice presidents". */
  label: string;
  /** "Jun He, Lipen Yuan and 10 more". */
  names: string;
  /** Members, newest filing first. */
  trades: InsiderTrade[];
  shares: number;
  /** Null when no member's filing gave a value. */
  value: number | null;
  /** Share-weighted average of the members that state a price. */
  price: number | null;
  transaction_date: string;
  /** The newest member's filing time and Form 4. */
  filed_at: string;
  url: string;
  plan_10b5_1: boolean;
};

export type InsiderListItem = { kind: "trade"; trade: InsiderTrade } | InsiderGroup;

/** Different insiders needed before their rows fold into one. */
export const GROUP_MIN = 3;
/** Prices within this fraction of the group's first price count as the same price. */
export const GROUP_PRICE_TOLERANCE = 0.01;

const ROLE_WORDS: Record<RoleKind, [string, string]> = {
  director: ["director", "directors"],
  vp: ["vice president", "vice presidents"],
  chief: ["senior executive", "senior executives"],
  owner: ["10% owner", "10% owners"],
  officer: ["officer", "officers"],
};

/** The kind of job, from the role line the Form 4 job writes ("SVP and CFO", "Director", "10% owner"). */
export function roleKind(role: string): RoleKind {
  const text = role || "";
  if (/\b(chief|ceo|cfo|coo|cto|president)\b/i.test(text.replace(/vice president/gi, ""))) return "chief";
  if (/\b[SE]?VP\b|vice president/i.test(text)) return "vp";
  const parts = text.split(",").map((part) => part.trim().toLowerCase()).filter(Boolean);
  if (parts.length > 0 && parts.every((part) => part === "director")) return "director";
  if (parts.length > 0 && parts.every((part) => part === "10% owner" || part === "director")) return "owner";
  return "officer";
}

function similarPrice(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) <= Math.abs(a) * GROUP_PRICE_TOLERANCE;
}

function namesLine(trades: InsiderTrade[], shown = 2): string {
  const names = [...new Set(trades.map((trade) => trade.insider).filter(Boolean))];
  const head = names.slice(0, shown);
  const rest = names.length - head.length;
  if (rest > 0) return `${head.join(", ")} and ${rest} more`;
  if (head.length <= 1) return head.join("");
  return `${head.slice(0, -1).join(", ")} and ${head[head.length - 1]}`;
}

function toGroup(key: string, role: RoleKind, members: InsiderTrade[]): InsiderGroup {
  const first = members[0]!;
  // The filing time shown and the Form 4 it opens are the same, newest filing.
  const newest = members.reduce((best, trade) => (trade.filed_at > best.filed_at ? trade : best), first);
  const people = new Set(members.map((trade) => trade.insider_id || trade.insider)).size;
  const valued = members.filter((trade) => trade.value !== null);
  const priced = members.filter((trade) => trade.price !== null && trade.shares > 0);
  const pricedShares = priced.reduce((sum, trade) => sum + trade.shares, 0);
  return {
    kind: "group",
    key,
    symbol: first.symbol,
    company: first.company,
    side: first.tx_type,
    role,
    label: `${people} ${ROLE_WORDS[role][people === 1 ? 0 : 1]}`,
    names: namesLine(members),
    trades: members,
    shares: members.reduce((sum, trade) => sum + trade.shares, 0),
    value: valued.length > 0 ? valued.reduce((sum, trade) => sum + (trade.value ?? 0), 0) : null,
    price: pricedShares > 0 ? priced.reduce((sum, trade) => sum + (trade.price ?? 0) * trade.shares, 0) / pricedShares : null,
    transaction_date: first.transaction_date,
    filed_at: newest.filed_at,
    url: newest.url,
    plan_10b5_1: first.plan_10b5_1,
  };
}

/**
 * The list with near-identical rows folded: same stock, same side, same trade
 * day, same kind of job, the same 10b5-1 status and a price within 1%. A group
 * takes the place of its first row, so the list keeps its order; fewer than
 * GROUP_MIN rows stay as they are.
 */
export function groupInsiderTrades(trades: ReadonlyArray<InsiderTrade>, min = GROUP_MIN): InsiderListItem[] {
  type Bucket = { key: string; role: RoleKind; price: number | null; members: InsiderTrade[] };
  const buckets = new Map<string, Bucket[]>();
  const bucketOf: Bucket[] = [];
  for (const trade of trades) {
    const role = roleKind(trade.role);
    const base = [trade.symbol, trade.tx_type, trade.transaction_date, role, trade.plan_10b5_1 ? "plan" : "open"].join("|");
    const list = buckets.get(base) ?? [];
    let bucket = list.find((item) => similarPrice(item.price, trade.price));
    if (!bucket) {
      bucket = { key: `${base}|${list.length}`, role, price: trade.price, members: [] };
      list.push(bucket);
      buckets.set(base, list);
    }
    bucket.members.push(trade);
    bucketOf.push(bucket);
  }
  const out: InsiderListItem[] = [];
  const emitted = new Set<Bucket>();
  trades.forEach((trade, index) => {
    const bucket = bucketOf[index]!;
    // Three filings from one person are three trades, not a group of people.
    if (new Set(bucket.members.map((member) => member.insider_id || member.insider)).size < min) {
      out.push({ kind: "trade", trade });
      return;
    }
    if (emitted.has(bucket)) return;
    emitted.add(bucket);
    out.push(toGroup(bucket.key, bucket.role, bucket.members));
  });
  return out;
}
