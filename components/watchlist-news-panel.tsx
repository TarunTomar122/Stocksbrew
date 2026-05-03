"use client";

import type { NewsArticle } from "@/lib/news";
import { RadarStyleNewsFeed } from "@/components/radar-style-news-feed";

export function WatchlistNewsPanel({
  articles,
  radarTickers,
}: {
  articles: NewsArticle[];
  radarTickers: string[];
}) {
  return <RadarStyleNewsFeed variant="radar" articles={articles} radarTickers={radarTickers} />;
}
