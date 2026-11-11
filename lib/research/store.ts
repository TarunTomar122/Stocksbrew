import { randomBytes } from "node:crypto";

import { adminFirestore } from "@/lib/firebase-admin";
import {
  RESEARCH_COLLECTION,
  RESEARCH_SHARES_COLLECTION,
  isReportKey,
  isShareId,
  isStale,
  type ResearchIndexItem,
  type ResearchReport,
} from "@/lib/research/types";

/**
 * Saved research reports, through the store adapter (LocalDB in production).
 * Additive only: `tm_research_reports/{uid}__{TICKER}__{key}` holds a report,
 * `tm_research_reports/{uid}__index` lists a person's reports, and
 * `tm_research_shares/{share_id}` points a public link at one report. Turning
 * a link off marks it revoked; nothing is deleted.
 */

/** Reports listed on a person's index. Past the cap, runs that failed go first so finished reports stay listed. */
const MAX_INDEXED = 120;

export function reportDocId(uid: string, ticker: string, key: string): string {
  return `${uid}__${ticker}__${key}`;
}

function indexDocId(uid: string): string {
  return `${uid}__index`;
}

/** The store holds JSON; undefined values are rejected, so round-trip first. */
function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export type ResearchStore = {
  save(report: ResearchReport): Promise<void>;
  list(uid: string): Promise<ResearchIndexItem[]>;
  get(uid: string, ticker: string, key: string): Promise<ResearchReport | null>;
  setShare(uid: string, ticker: string, key: string, on: boolean): Promise<string | null>;
  getShared(shareId: string): Promise<ResearchReport | null>;
};

function indexItem(report: ResearchReport): ResearchIndexItem {
  return {
    key: report.key,
    ticker: report.ticker,
    name: report.name,
    status: report.status,
    created_at: report.created_at,
    headline: report.body?.headline || report.body?.summary[0] || null,
  };
}

async function save(report: ResearchReport): Promise<void> {
  const ref = adminFirestore.collection(RESEARCH_COLLECTION).doc(reportDocId(report.uid, report.ticker, report.key));
  const indexRef = adminFirestore.collection(RESEARCH_COLLECTION).doc(indexDocId(report.uid));
  await adminFirestore.runTransaction(async (tx) => {
    const indexSnap = await tx.get(indexRef);
    const previous = indexSnap.exists && Array.isArray(indexSnap.data()?.items) ? (indexSnap.data()!.items as ResearchIndexItem[]) : [];
    // The first save of a new run claims the person's one slot: a fresh run already in the index (from any
    // server instance) refuses it inside the same transaction, so two tabs cannot both start a report.
    const isNew = !previous.some((item) => item && item.key === report.key && item.ticker === report.ticker);
    if (isNew && report.status === "running" && runningItem(previous, Date.parse(report.created_at) || Date.now())) {
      throw new Error("research_running");
    }
    const all = [indexItem(report), ...previous.filter((item) => item && !(item.key === report.key && item.ticker === report.ticker))];
    const items = (all.length > MAX_INDEXED ? all.filter((item, index) => index === 0 || item.status !== "failed") : all).slice(0, MAX_INDEXED);
    tx.set(ref, plain({ kind: "report", ...report }));
    tx.set(indexRef, plain({ kind: "index", uid: report.uid, updated_at: report.updated_at, items }));
  });
}

async function list(uid: string): Promise<ResearchIndexItem[]> {
  if (!uid) return [];
  const snap = await adminFirestore.collection(RESEARCH_COLLECTION).doc(indexDocId(uid)).get();
  const items = snap.exists ? (snap.data()?.items as unknown) : null;
  if (!Array.isArray(items)) return [];
  return items.filter((item): item is ResearchIndexItem => Boolean(item) && isReportKey((item as ResearchIndexItem).key) && typeof (item as ResearchIndexItem).ticker === "string");
}

function asReport(data: Record<string, unknown> | undefined, uid: string): ResearchReport | null {
  if (!data || data.uid !== uid || !isReportKey(data.key)) return null;
  const { kind: _kind, ...rest } = data;
  return rest as unknown as ResearchReport;
}

async function get(uid: string, ticker: string, key: string): Promise<ResearchReport | null> {
  if (!uid || !isReportKey(key)) return null;
  const snap = await adminFirestore.collection(RESEARCH_COLLECTION).doc(reportDocId(uid, ticker, key)).get();
  return snap.exists ? asReport(snap.data(), uid) : null;
}

/** Turn the public link on (returns its id, the same one as before if it had one) or off (returns null). */
async function setShare(uid: string, ticker: string, key: string, on: boolean): Promise<string | null> {
  const ref = adminFirestore.collection(RESEARCH_COLLECTION).doc(reportDocId(uid, ticker, key));
  return adminFirestore.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const report = snap.exists ? asReport(snap.data(), uid) : null;
    if (!report || report.status !== "ready") throw new Error("research_not_found");
    const now = new Date().toISOString();
    if (on) {
      const shareId = report.share_id && isShareId(report.share_id) ? report.share_id : randomBytes(12).toString("hex");
      tx.set(adminFirestore.collection(RESEARCH_SHARES_COLLECTION).doc(shareId), {
        share_id: shareId,
        uid,
        ticker,
        key,
        revoked: false,
        updated_at: now,
      });
      tx.set(ref, { share_id: shareId }, { merge: true });
      return shareId;
    }
    if (report.share_id && isShareId(report.share_id)) {
      tx.set(adminFirestore.collection(RESEARCH_SHARES_COLLECTION).doc(report.share_id), { revoked: true, updated_at: now }, { merge: true });
    }
    tx.set(ref, { share_id: null }, { merge: true });
    return null;
  });
}

async function getShared(shareId: string): Promise<ResearchReport | null> {
  if (!isShareId(shareId)) return null;
  const snap = await adminFirestore.collection(RESEARCH_SHARES_COLLECTION).doc(shareId).get();
  const data = snap.exists ? (snap.data() as { uid?: string; ticker?: string; key?: string; revoked?: boolean }) : null;
  if (!data || data.revoked || typeof data.uid !== "string" || typeof data.ticker !== "string" || !isReportKey(data.key)) return null;
  const report = await get(data.uid, data.ticker, data.key);
  // The report must still point at this link: turning it off and on again mints a new one only if the old was cleared.
  if (!report || report.status !== "ready" || report.share_id !== shareId) return null;
  return report;
}

export const researchStore: ResearchStore = { save, list, get, setShare, getShared };

/** A report in progress for this person, if one is still fresh. Used to refuse a second run at once. */
export function runningItem(items: ResearchIndexItem[], now: number = Date.now()): ResearchIndexItem | null {
  return (
    items.find((item) => item.status === "running" && !isStale({ status: "running", updated_at: item.created_at }, now)) ?? null
  );
}
