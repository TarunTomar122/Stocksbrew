/**
 * Store reads for the parts of a standing job that agent recipes added (lib/agent-jobs.ts): one investor's own
 * disclosures and 13F filings, insider (Form 4) trades read the way tm_insider_trades stores them, new risks in 10-K
 * and 10-Q filings, the confirmed reasons for big moves, and tonight's after-hours quotes. Only lib/agent-jobs-data.ts
 * imports this, so the pure modules stay safe for the browser.
 *
 * Every row carries the day anyone could first have read it, and the loaders never read past `end`, so a replay day
 * never sees what came after it. Reads are shared for a few minutes in this process (the nightly runner checks many
 * jobs in turn); a failed read is never kept and comes back as null, which the evaluator says as "could not check".
 */

import { etDayOf } from "@/lib/day-words";
import { getExtendedQuotes } from "@/lib/extended-quotes-server";
import { getFilingChangesFor } from "@/lib/filing-changes/server";
import { quote } from "@/lib/filing-changes/words";
import { adminFirestore } from "@/lib/firebase-admin";
import { isConfirmedMove } from "@/lib/seo/families";
import type { AgentFacts, FilingRiskFact } from "@/lib/agent-jobs";

const KEEP_MS = 5 * 60_000;
type Kept<T> = { at: number; value: Promise<T> };
const kept = new Map<string, Kept<unknown>>();

function remember<T>(key: string, load: () => Promise<T | null>): Promise<T | null> {
  // Keys carry the date, so old ones are dropped as new ones come in (a long-lived server never piles them up).
  for (const [old, entry] of kept) if (Date.now() - entry.at >= KEEP_MS) kept.delete(old);
  const hit = kept.get(key) as Kept<T | null> | undefined;
  if (hit && Date.now() - hit.at < KEEP_MS) return hit.value;
  const value = load().catch(() => null);
  kept.set(key, { at: Date.now(), value });
  void value.then((result) => {
    if (result == null) kept.delete(key);
  });
  return value;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/* ── one member of Congress ─────────────────────────────────────────────── */

/**
 * A member's disclosed trades from their own reports (tm_follow_trades, the rows their /follow page shows), on the
 * day each was disclosed. A Senate report its amendment restated is left out; the amendment's rows stand for it.
 */
export function loadMemberTrades(personId: string, from: string): Promise<AgentFacts["congress"] | null> {
  return remember(`member:${personId}:${from}`, async () => {
    const snap = await adminFirestore
      .collection("tm_follow_trades")
      .where("person_id", "==", personId)
      .select("trade_id", "doc_id", "person_id", "person_name", "ticker", "tx_type", "amount_low", "amount_high", "disclosure_date", "source_url", "superseded_by")
      .get();
    return snap.docs
      .map((doc) => doc.data() as Record<string, unknown>)
      .filter((row) => !row.superseded_by)
      .map((row) => ({
        id: text(row.trade_id) || text(row.doc_id),
        person_id: text(row.person_id),
        person: text(row.person_name),
        ticker: text(row.ticker).toUpperCase(),
        tx_type: text(row.tx_type),
        amount_low: finite(row.amount_low),
        amount_high: finite(row.amount_high),
        disclosed: text(row.disclosure_date).slice(0, 10),
        url: text(row.source_url) || null,
      }))
      .filter((trade) => trade.id && trade.ticker && DAY_RE.test(trade.disclosed) && trade.disclosed >= from);
  });
}

/* ── one fund ───────────────────────────────────────────────────────────── */

/** A fund's 13F filings (tm_follow_activity, by its /follow page id) on their filing day, with the tickers it bought. */
export function loadFundFilings(sourceId: string, from: string): Promise<AgentFacts["fund_filings"] | null> {
  return remember(`fund:${sourceId}:${from}`, async () => {
    const snap = await adminFirestore.collection("tm_follow_activity").where("source_id", "==", sourceId).get();
    return snap.docs
      .map((doc) => doc.data() as Record<string, unknown>)
      .filter((row) => text(row.type) === "13f_filing" && !row.superseded_by)
      .map((row) => {
        const items = Array.isArray(row.items) ? (row.items as Array<Record<string, unknown>>) : [];
        // New positions first, then the biggest additions by how much weight they gained.
        const buys = items
          .filter((item) => item.action === "new" || item.action === "added")
          .sort(
            (a, b) =>
              Number(b.action === "new") - Number(a.action === "new") ||
              (finite(b.weight) ?? 0) - (finite(b.prev_weight) ?? 0) - ((finite(a.weight) ?? 0) - (finite(a.prev_weight) ?? 0)),
          )
          .map((item) => text(item.ticker).toUpperCase())
          .filter(Boolean);
        return {
          id: text(row.id),
          source_id: text(row.source_id),
          fund: text(row.name),
          date: text(row.date).slice(0, 10),
          headline: text(row.headline),
          url: text(row.url) || null,
          tickers: [...new Set(items.map((item) => text(item.ticker).toUpperCase()).filter(Boolean))],
          buys: [...new Set(buys)],
        };
      })
      .filter((filing) => filing.id && filing.fund && DAY_RE.test(filing.date) && filing.date >= from);
  });
}

/* ── insider trades ─────────────────────────────────────────────────────── */

/**
 * Open-market insider trades filed since `from` (tm_insider_trades, written by backend/agentdata from SEC Form 4).
 * The store names the stock `symbol` and the person `insider`; `filed_at` is New York time, so its first ten
 * characters are the filing day.
 */
export function loadInsiderTrades(from: string): Promise<AgentFacts["insiders"] | null> {
  return remember(`insiders:${from}`, async () => {
    const snap = await adminFirestore
      .collection("tm_insider_trades")
      .where("filed_at", ">=", from)
      .select("id", "accession", "symbol", "ticker", "insider", "person", "insider_name", "role", "tx_type", "value", "filed_at", "filing_date", "url")
      .get();
    return snap.docs
      .map((doc) => doc.data() as Record<string, unknown>)
      .map((row) => ({
        id: text(row.id) || text(row.accession),
        ticker: (text(row.symbol) || text(row.ticker)).toUpperCase(),
        person: text(row.insider) || text(row.person) || text(row.insider_name),
        role: text(row.role) || null,
        tx_type: text(row.tx_type),
        value: finite(row.value),
        filed: (text(row.filed_at) || text(row.filing_date)).slice(0, 10),
        url: text(row.url) || null,
      }))
      .filter((trade) => trade.id && trade.ticker && trade.person && DAY_RE.test(trade.filed) && trade.filed >= from);
  });
}

/* ── new risks in 10-K and 10-Q filings ─────────────────────────────────── */

/**
 * Each stored 10-K and 10-Q comparison of these stocks (tm_filing_changes: the newest and its history), once per
 * filing, on the day it reached the SEC: the risk list was public then and the comparison is rules only. A live run
 * keeps which filings it already looked at (lib/agent-jobs.ts AgentJob.told), so one compared a night late, or compared
 * again when the reading improved, is still said exactly once. Unreadable comparisons are left out.
 */
export async function loadFilingRisks(tickers: readonly string[]): Promise<FilingRiskFact[] | null> {
  if (tickers.length === 0) return [];
  const docs = await getFilingChangesFor(tickers).catch(() => null);
  if (!docs) return null;
  const out: FilingRiskFact[] = [];
  for (const doc of docs) {
    const seen = new Set<string>();
    for (const comparison of [doc.latest, ...doc.history]) {
      const accession = comparison.filing.accession;
      if (!accession || seen.has(accession) || comparison.status === "unreadable") continue;
      seen.add(accession);
      const filed = comparison.filing.filed.slice(0, 10);
      if (!DAY_RE.test(filed)) continue;
      const lead = comparison.status === "changes" ? comparison.added[0] ?? null : null;
      const said = lead ? quote(lead, 14) : null;
      out.push({
        ticker: doc.ticker,
        form: comparison.filing.form,
        filed,
        day: filed,
        accession,
        added: comparison.status === "changes" ? comparison.added.length : 0,
        first: said?.fits ? said.text : null,
        url: comparison.filing.url || null,
      });
    }
  }
  return out;
}

/* ── reasons for big moves ──────────────────────────────────────────────── */

type AnomalyRow = Parameters<typeof isConfirmedMove>[0] & {
  ticker?: string;
  narrative_as_of?: string | null;
  move_explanation?: { headline?: unknown } | null;
};

/**
 * Confirmed reasons for moves since `from` (tm_daily_anomalies: the dated documents plus the live one), one per stock
 * and session. A reason counts only when it was written by the end of its own session's day, so a replay never reads
 * a reason researched later.
 */
export function loadMoveReasons(from: string, end: string): Promise<NonNullable<AgentFacts["move_reasons"]> | null> {
  return remember(`reasons:${from}:${end}`, async () => {
    const collection = adminFirestore.collection("tm_daily_anomalies");
    const [snap, latest] = await Promise.all([collection.where("date", ">=", from).get(), collection.doc("US__latest").get()]);
    const docs = snap.docs.filter((doc) => doc.id !== "US__latest").map((doc) => doc.data() as Record<string, unknown>);
    if (latest.exists) docs.push(latest.data() as Record<string, unknown>);
    const best = new Map<string, { ticker: string; day: string; headline: string; at: string }>();
    for (const data of docs) {
      const day = text(data.date).slice(0, 10);
      if (!DAY_RE.test(day) || day < from || day > end) continue;
      for (const row of Array.isArray(data.anomalies) ? (data.anomalies as AnomalyRow[]) : []) {
        if (!row || !isConfirmedMove(row)) continue;
        const ticker = text(row.ticker).toUpperCase();
        const headline = text(row.move_explanation?.headline);
        const at = text(row.narrative_as_of);
        const written = at ? etDayOf(at) : null;
        if (!ticker || !headline || !written || written > day) continue;
        const key = `${ticker}|${day}`;
        const held = best.get(key);
        if (!held || at > held.at) best.set(key, { ticker, day, headline, at });
      }
    }
    return [...best.values()].map(({ ticker, day, headline }) => ({ ticker, day, headline: /[.!?]$/.test(headline) ? headline : `${headline}.` }));
  });
}

/* ── tonight's after-hours quotes ───────────────────────────────────────── */

const CLOCK = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });

/**
 * Each stock's after-hours print from the session `day` (tm_extended_quotes keeps only the latest), for a live check
 * on a report night. A pre-market print is not tonight's move and is left out.
 */
export async function loadTonightQuotes(tickers: readonly string[], day: string): Promise<NonNullable<AgentFacts["extended"]> | null> {
  if (tickers.length === 0) return {};
  const quotes = await getExtendedQuotes(tickers, { strict: true }).catch(() => null);
  if (!quotes) return null;
  const out: NonNullable<AgentFacts["extended"]> = {};
  for (const [ticker, entry] of quotes) {
    const post = entry.session === "post" ? entry : entry.lastPost;
    if (!post || !(post.price > 0) || !Number.isFinite(post.changePct)) continue;
    if (etDayOf(post.asOf) !== day) continue;
    out[ticker] = { day, change_pct: post.changePct, price: post.price, as_of: `${CLOCK.format(new Date(post.asOf))} ET` };
  }
  return out;
}
