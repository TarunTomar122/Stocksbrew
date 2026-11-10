import { unstable_cache } from "next/cache";

import { adminFirestore } from "@/lib/firebase-admin";
import {
  EARNINGS_DAY_LINK_DAYS,
  EARNINGS_DAY_SITEMAP_DAYS,
  daysSince,
  earningsDayDocId,
  isIndexable,
  latestPerTicker,
  toReport,
  type EarningsDayReport,
} from "@/lib/earnings-day-shared";

/**
 * Readers for `tm_earnings_day` (written by backend/agentdata/earnings_day.py).
 *
 * In `next dev` only, reports saved by the job's `--local-dir` run in
 * backend/.cache/earnings_day_dev/ are read as well, so a page can be checked
 * against real filings without writing to the shared store. Production builds
 * never read the folder.
 */

export const EARNINGS_DAY_COLLECTION = "tm_earnings_day";
const DEV_DIR = "backend/.cache/earnings_day_dev";

function todayET(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function minusDays(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

async function devReports(): Promise<EarningsDayReport[]> {
  if (process.env.NODE_ENV === "production") return [];
  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const folder = path.join(process.cwd(), DEV_DIR);
    const names = (await fs.readdir(folder)).filter((name) => name.endsWith(".json"));
    const docs = await Promise.all(names.map(async (name) => toReport(JSON.parse(await fs.readFile(path.join(folder, name), "utf8")))));
    return docs.filter((doc): doc is EarningsDayReport => doc !== null);
  } catch {
    return [];
  }
}

function merge(stored: EarningsDayReport[], local: EarningsDayReport[]): EarningsDayReport[] {
  const byId = new Map(stored.map((report) => [earningsDayDocId(report.ticker, report.event_date), report]));
  for (const report of local) byId.set(earningsDayDocId(report.ticker, report.event_date), report);
  return [...byId.values()];
}

/** One report by ticker and earnings date, or null. */
export async function getEarningsDayReport(ticker: string, day: string): Promise<EarningsDayReport | null> {
  const local = (await devReports()).find((report) => report.ticker === ticker && report.event_date === day) ?? null;
  if (local) return local;
  const snap = await adminFirestore.collection(EARNINGS_DAY_COLLECTION).doc(earningsDayDocId(ticker, day)).get();
  return snap.exists ? toReport(snap.data()) : null;
}

export const getEarningsDayReportCached = (ticker: string, day: string) =>
  unstable_cache(() => getEarningsDayReport(ticker, day), ["earnings-day", ticker, day], { revalidate: 120 })();

/** Every report on or after `since`, newest first. One query, shared by every reader. */
export async function listEarningsDayReports(since: string): Promise<EarningsDayReport[]> {
  let stored: EarningsDayReport[] = [];
  try {
    const snap = await adminFirestore.collection(EARNINGS_DAY_COLLECTION).where("event_date", ">=", since).get();
    stored = snap.docs.map((doc) => toReport(doc.data())).filter((doc): doc is EarningsDayReport => doc !== null);
  } catch {
    stored = [];
  }
  const local = (await devReports()).filter((report) => report.event_date >= since);
  return merge(stored, local).sort((a, b) => b.event_date.localeCompare(a.event_date) || a.ticker.localeCompare(b.ticker));
}

const listRecentCached = (since: string) =>
  unstable_cache(() => listEarningsDayReports(since), ["earnings-day-recent", since], { revalidate: 120 })();

/** Reports for these tickers from the last `days` days, newest per ticker first. */
export async function recentReportsFor(tickers: readonly string[], days: number, today: string = todayET()): Promise<EarningsDayReport[]> {
  const wanted = new Set(tickers.map((ticker) => ticker.toUpperCase().replace(/^(US|IN)_/, "").replace(/_/g, ".")));
  if (wanted.size === 0) return [];
  const reports = await listRecentCached(minusDays(today, Math.max(0, days)));
  return latestPerTicker(reports.filter((report) => wanted.has(report.ticker)));
}

/** The newest report for one stock, while it is still the one to read (about a quarter). */
export async function latestReportFor(ticker: string, today: string = todayET()): Promise<EarningsDayReport | null> {
  const [report] = await recentReportsFor([ticker], EARNINGS_DAY_LINK_DAYS, today);
  return report && daysSince(report.event_date, today) <= EARNINGS_DAY_LINK_DAYS ? report : null;
}

/** Report pages for the sitemap: indexable ones only, with the day they were last rebuilt. */
export async function sitemapReports(today: string = todayET()): Promise<Array<{ ticker: string; day: string; lastmod: string | undefined }>> {
  const reports = await listEarningsDayReports(minusDays(today, EARNINGS_DAY_SITEMAP_DAYS));
  return reports
    .filter((report) => isIndexable(report))
    .map((report) => ({ ticker: report.ticker, day: report.event_date, lastmod: report.updated_at?.slice(0, 10) || undefined }));
}
