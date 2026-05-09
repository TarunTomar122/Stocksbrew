import { unstable_cache } from "next/cache";

import { adminFirestore } from "@/lib/firebase-admin";

export type ScreenMatchRow = {
  instrument_id: string;
  ticker: string;
  logo_url?: string | null;
  name?: string;
  sector?: string | null;
  price?: number | null;
  day_change_pct?: number | null;
  overall_score?: number | null;
  overall_verdict?: string | null;
  pillar_scores?: {
    valuation?: number | null;
    growth?: number | null;
    quality?: number | null;
    momentum?: number | null;
  };
  match_score?: number | null;
  above_200dma?: boolean;
  rsi_14?: number | null;
  from_52w_high_pct?: number | null;
  inst_own_pct?: number | null;
};

export type ThematicScreen = {
  id: string;
  title: string;
  tagline: string;
  hook: string;
  match_count: number;
  matches: ScreenMatchRow[];
};

export type ThematicScreensDoc = {
  market: string;
  universe_id: string;
  generated_at: string;
  coverage: {
    instruments: number;
    intel_pro_docs: number;
    technical_docs: number;
  };
  screens: ThematicScreen[];
};

async function getThematicScreensUncached(
  market: "US" | "IN" = "US",
): Promise<ThematicScreensDoc | null> {
  const doc = await adminFirestore
    .collection("tm_thematic_screens")
    .doc(market)
    .get();
  return doc.exists ? (doc.data() as ThematicScreensDoc) : null;
}

const getThematicScreensCached = unstable_cache(
  getThematicScreensUncached,
  ["thematic-screens"],
  { revalidate: 300 },
);

export async function getThematicScreens(
  market: "US" | "IN" = "US",
): Promise<ThematicScreensDoc | null> {
  return getThematicScreensCached(market);
}

export async function getScreenById(
  market: "US" | "IN",
  screenId: string,
): Promise<{ doc: ThematicScreensDoc; screen: ThematicScreen } | null> {
  const doc = await getThematicScreens(market);
  if (!doc) return null;
  const screen = doc.screens.find((s) => s.id === screenId);
  if (!screen) return null;
  return { doc, screen };
}
