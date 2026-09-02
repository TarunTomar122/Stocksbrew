import { unstable_cache } from "next/cache";

import { adminFirestore } from "@/lib/firebase-admin";
import { getLocalDBDocument } from "@/lib/localdb";
import type { DashboardView, SnapshotRow } from "@/lib/types";
import type { ThematicScreensDoc } from "@/lib/screens";
import type { NewsArticle } from "@/lib/news";

export type HomeView = {
  market: "US" | "IN";
  universe_id?: string;
  ai_universe_id?: string;
  dashboard?: DashboardView | null;
  market_snapshot_rows?: SnapshotRow[];
  market_snapshot_row_count?: number;
  thematic_screens?: ThematicScreensDoc | null;
  news?: NewsArticle[];
  updated_at?: string;
};

export type HomeNewsView = {
  market: "US" | "IN";
  universe_id?: string;
  ai_universe_id?: string;
  news?: NewsArticle[];
  news_count?: number;
  updated_at?: string;
};

async function getHomeViewUncached(market: "US" | "IN" = "US"): Promise<HomeView | null> {
  const localData =
    (await getLocalDBDocument<HomeView>(`tm_home_view_core/${market}`)) ??
    (await getLocalDBDocument<HomeView>(`tm_home_view/${market}`));
  if (localData) {
    return {
      ...localData,
      market,
      market_snapshot_rows: Array.isArray(localData.market_snapshot_rows)
        ? localData.market_snapshot_rows
        : [],
      news: Array.isArray(localData.news) ? localData.news : [],
    };
  }

  const compactDoc = await adminFirestore.collection("tm_home_view_core").doc(market).get();
  const doc = compactDoc.exists
    ? compactDoc
    : await adminFirestore.collection("tm_home_view").doc(market).get();
  if (!doc.exists) return null;
  const data = doc.data() as HomeView;
  return {
    ...data,
    market,
    market_snapshot_rows: Array.isArray(data.market_snapshot_rows) ? data.market_snapshot_rows : [],
    news: Array.isArray(data.news) ? data.news : [],
  };
}

async function getHomeNewsUncached(market: "US" | "IN" = "US"): Promise<HomeNewsView | null> {
  const localData =
    (await getLocalDBDocument<HomeNewsView>(`tm_home_news/${market}`)) ??
    (await getLocalDBDocument<HomeNewsView>(`tm_home_view/${market}`));
  if (localData) {
    return {
      ...localData,
      market,
      news: Array.isArray(localData.news) ? localData.news : [],
    };
  }

  const compactDoc = await adminFirestore.collection("tm_home_news").doc(market).get();
  const doc = compactDoc.exists
    ? compactDoc
    : await adminFirestore.collection("tm_home_view").doc(market).get();
  if (!doc.exists) return null;
  const data = doc.data() as HomeNewsView;
  return {
    ...data,
    market,
    news: Array.isArray(data.news) ? data.news : [],
  };
}

const getHomeViewCached = unstable_cache(
  getHomeViewUncached,
  ["home-view"],
  { revalidate: 60 },
);

const getHomeNewsCached = unstable_cache(
  getHomeNewsUncached,
  ["home-news"],
  { revalidate: 60 },
);

export async function getHomeView(market: "US" | "IN" = "US"): Promise<HomeView | null> {
  return getHomeViewCached(market);
}

export async function getHomeNews(market: "US" | "IN" = "US"): Promise<HomeNewsView | null> {
  return getHomeNewsCached(market);
}
