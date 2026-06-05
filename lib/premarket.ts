import { unstable_cache } from "next/cache";
import { adminFirestore } from "@/lib/firebase-admin";

export type PremarketRow = {
  instrument_id: string;
  ticker: string;
  name: string;
  logo_url: string | null;
  sector: string | null;
  pre_market_price: number;
  previous_close: number;
  pre_market_change_pct: number;
};

export type PremarketMovers = {
  market: "US" | "IN";
  generated_at: string;
  date: string;
  market_state: string;
  candidate_count: number;
  quoted_count: number;
  gappers_up: PremarketRow[];
  gappers_down: PremarketRow[];
  by_ticker: Record<string, { pre_market_change_pct: number; pre_market_price: number }>;
};

async function getPremarketMoversUncached(
  market: "US" | "IN" = "US",
): Promise<PremarketMovers | null> {
  const doc = await adminFirestore
    .collection("tm_premarket_movers")
    .doc(`${market.toUpperCase()}__latest`)
    .get();
  if (!doc.exists) return null;
  return doc.data() as PremarketMovers;
}

export const getPremarketMovers = unstable_cache(
  getPremarketMoversUncached,
  ["premarket-movers"],
  { revalidate: 120 },
);

type EasternParts = {
  weekday: string;
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
};

function easternParts(ref = new Date()): EasternParts {
  const parts: Partial<EasternParts> = {};
  for (const p of new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(ref)) {
    if (p.type === "weekday") parts.weekday = p.value;
    if (p.type === "year") parts.year = p.value;
    if (p.type === "month") parts.month = p.value;
    if (p.type === "day") parts.day = p.value;
    if (p.type === "hour") parts.hour = p.value;
    if (p.type === "minute") parts.minute = p.value;
  }
  return parts as EasternParts;
}

function easternDateIso(parts: EasternParts): string {
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** US regular-session pre-market: Mon–Fri, 4:00–9:30 ET. */
export function isUsPremarketWindow(ref = new Date()): boolean {
  const parts = easternParts(ref);
  if (parts.weekday === "Sat" || parts.weekday === "Sun") return false;
  const mins = Number(parts.hour) * 60 + Number(parts.minute);
  return mins >= 4 * 60 && mins < 9 * 60 + 30;
}

/** True only during the live pre-market window.
 * The Firestore doc can stay stamped PRE after the open; we gate on clock time too. */
export function isPremarketLive(
  doc: PremarketMovers | null,
  market: "US" | "IN" = "US",
): boolean {
  if (!doc) return false;
  if (market === "US" && !isUsPremarketWindow()) return false;

  const todayEt = easternDateIso(easternParts());
  const docDate = String(doc.date || "").slice(0, 10);
  if (docDate !== todayEt) return false;

  return String(doc.market_state || "").toUpperCase().startsWith("PRE");
}
