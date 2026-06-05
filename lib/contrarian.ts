import { unstable_cache } from "next/cache";
import { adminFirestore } from "@/lib/firebase-admin";

export type ContrarianCard = {
  ticker: string;
  instrument_id: string;
  name: string;
  sector: string | null;
  crowd_label: string;
  crowd_side: "bull" | "bear";
  our_stance: string;
  our_side: "bull" | "bear";
  reason: string;
  upside_pct: number | null;
};

export type ContrarianCalls = {
  market: "US" | "IN";
  generated_at: string;
  date: string;
  cards: ContrarianCard[];
};

async function getContrarianCallsUncached(
  market: "US" | "IN" = "US",
): Promise<ContrarianCalls | null> {
  const doc = await adminFirestore
    .collection("tm_contrarian_calls")
    .doc(`${market.toUpperCase()}__latest`)
    .get();
  if (!doc.exists) return null;
  return doc.data() as ContrarianCalls;
}

// Cached so every homepage load is served the same precomputed payload rather
// than re-querying. The job refreshes the underlying doc on a schedule.
export const getContrarianCalls = unstable_cache(
  getContrarianCallsUncached,
  ["contrarian-calls"],
  { revalidate: 300 },
);
