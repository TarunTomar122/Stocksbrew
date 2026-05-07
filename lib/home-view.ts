import { unstable_cache } from "next/cache";

import { adminFirestore } from "@/lib/firebase-admin";
import type { DashboardView, SnapshotRow } from "@/lib/types";
import type { ThematicScreensDoc } from "@/lib/screens";
import type { NewsArticle } from "@/lib/news";

export type HomeView = {
  market: "US" | "IN";
  universe_id?: string;
  ai_universe_id?: string;
  dashboard?: DashboardView | null;
  market_snapshot_rows?: SnapshotRow[];
  thematic_screens?: ThematicScreensDoc | null;
  news?: NewsArticle[];
  updated_at?: string;
};

async function getHomeViewUncached(market: "US" | "IN" = "US"): Promise<HomeView | null> {
  const doc = await adminFirestore.collection("tm_home_view").doc(market).get();
  if (!doc.exists) return null;
  const data = doc.data() as HomeView;
  return {
    ...data,
    market,
    market_snapshot_rows: Array.isArray(data.market_snapshot_rows) ? data.market_snapshot_rows : [],
    news: Array.isArray(data.news) ? data.news : [],
  };
}

const getHomeViewCached = unstable_cache(
  getHomeViewUncached,
  ["home-view"],
  { revalidate: 60 },
);

export async function getHomeView(market: "US" | "IN" = "US"): Promise<HomeView | null> {
  return getHomeViewCached(market);
}
