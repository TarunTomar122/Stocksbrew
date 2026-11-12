import { FieldValue } from "firebase-admin/firestore";
import { unstable_cache } from "next/cache";

import { adminFirestore } from "@/lib/firebase-admin";
import { toFundFacts, type FundFacts } from "@/lib/funds/server";
import { fundKindOf } from "@/lib/funds/tickers";
import { fundRequestStateOf, type FundRequestState } from "@/lib/funds/adding";

/**
 * Funds on demand. Any US ETF or mutual fund we do not cover yet is filed in
 * `stock_requests/{TICKER}`, the same queue as a stock request, when someone
 * opens its page, imports or types it, or follows it. The VPS worker
 * (backend/scripts/process_fund_requests.py, every two minutes, and the
 * 30-minute stock request lane) confirms it with Yahoo and covers it.
 */

export type { FundRequestState } from "@/lib/funds/adding";

/** A request from a signed-in person carries their uid, as the "ask us to add" request does. */
export type FundRequester = { uid?: string | null; emails?: string[]; source: "page" | "import" | "typed" | "follow" | "ask" };

/** Most fund requests one import files at once. */
export const MAX_FUND_REQUESTS = 20;

/** File (or re-file) one fund request. Returns what the person should be told. Never throws. */
export async function queueFundRequest(ticker: string, who: FundRequester): Promise<FundRequestState> {
  const key = ticker.trim().toUpperCase();
  const kind = fundKindOf(key);
  if (!kind) return "none";
  const ref = adminFirestore.collection("stock_requests").doc(key);
  const now = new Date().toISOString();
  const emails = (who.emails ?? []).map((email) => email.toLowerCase()).filter(Boolean);
  try {
    return await adminFirestore.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? ((snap.data() ?? {}) as Record<string, unknown>) : null;
      const state = fundRequestStateOf(data);
      // Covered, already on its way, or Yahoo said it is no fund: nothing to write.
      if (state === "ready" || state === "adding" || data?.fund_check === "not_a_fund") return state;
      const people = {
        ...(who.uid ? { requester_uids: FieldValue.arrayUnion(who.uid), last_requested_by: who.uid } : {}),
        ...(emails.length ? { requester_emails: FieldValue.arrayUnion(...emails) } : {}),
      };
      if (!data) {
        tx.set(ref, {
          query: key,
          market: "US",
          count: 1,
          requested_at: now,
          last_requested_at: now,
          status: "queued",
          fulfilled: false,
          kind: "fund",
          fund_kind: kind,
          source: who.source,
          ...(who.uid ? { requested_by: who.uid, requester_uids: [who.uid] } : {}),
          ...(emails.length ? { requester_emails: emails, requester_email: emails[0] } : {}),
        });
      } else {
        // An older request the stock path could not place ("needs_confirmation"): the fund path gets a go at it.
        tx.update(ref, {
          count: (typeof data.count === "number" ? data.count : 1) + 1,
          last_requested_at: now,
          status: "queued",
          fulfilled: false,
          resolve_error: "",
          kind: "fund",
          fund_kind: kind,
          ...people,
        });
      }
      return "adding" as const;
    });
  } catch (error) {
    console.warn(JSON.stringify({ svc: "fund-on-demand", msg: "queue_failed", ticker: key, error: String(error).slice(0, 200) }));
    return "none";
  }
}

/** File requests for every fund among these tickers we do not cover yet (an import, a follow). At most MAX_FUND_REQUESTS. */
export async function queueFundRequests(tickers: string[], who: FundRequester): Promise<Record<string, FundRequestState>> {
  const unique = [...new Set(tickers.map((ticker) => ticker.trim().toUpperCase()).filter((ticker) => fundKindOf(ticker)))].slice(0, MAX_FUND_REQUESTS);
  const out: Record<string, FundRequestState> = {};
  for (const ticker of unique) out[ticker] = await queueFundRequest(ticker, who);
  return out;
}

/** Where the request for this fund stands, read fresh. "none" when the store cannot be read. */
export async function readFundRequestState(ticker: string): Promise<FundRequestState> {
  const snap = await adminFirestore.collection("stock_requests").doc(ticker.trim().toUpperCase()).get().catch(() => null);
  return fundRequestStateOf(snap?.exists ? ((snap.data() ?? {}) as Record<string, unknown>) : null);
}

/** The cache tag the adding page's facts read carries; revalidated once the request is fulfilled. */
export function fundOnDemandTag(ticker: string): string {
  return `fund-on-demand:${ticker.trim().toUpperCase()}`;
}

/**
 * The facts of a fund outside the catalogue, cached for 30 seconds only (the
 * catalogue and getFundFacts keep an hour), so a fund the worker just covered
 * gets its page within a minute.
 */
export async function onDemandFundFacts(ticker: string): Promise<FundFacts | null> {
  const key = ticker.trim().toUpperCase();
  if (!fundKindOf(key)) return null;
  const load = unstable_cache(
    async () => {
      const snap = await adminFirestore.collection("tm_fund_facts").doc(key).get();
      return snap.exists ? (snap.data() as Record<string, unknown>) : null;
    },
    ["fund-on-demand-facts-v1", key],
    { revalidate: 30, tags: [fundOnDemandTag(key)] },
  );
  return toFundFacts(await load().catch(() => null));
}
