import { buildMarketOverview, buildTopicOverview } from "@/lib/overview";
import { fetchFeed } from "@/lib/rss";
import { listSourcesForMarket, listTrackedSourcesForMarket } from "@/lib/sources";
import { BuildSnapshotOptions, FeedBucket, MarketSnapshot, NormalizedArticle } from "@/lib/types";
import { unique } from "@/lib/utils";
import { summarizeTopicSentiment } from "@/lib/sentiment";

function topKeyPoints(articles: NormalizedArticle[], limit = 4): string[] {
  const points: string[] = [];

  for (const article of articles) {
    for (const point of article.articleKeyPoints || []) {
      const cleaned = point.trim();
      if (cleaned && !points.includes(cleaned)) {
        points.push(cleaned);
      }
      if (points.length >= limit) {
        return points;
      }
    }
  }

  return points;
}

function dedupeArticles(articles: NormalizedArticle[]): NormalizedArticle[] {
  const seen = new Set<string>();

  return articles.filter((article) => {
    if (seen.has(article.url)) {
      return false;
    }
    seen.add(article.url);
    return true;
  });
}

function buildTopics(articles: NormalizedArticle[]): FeedBucket[] {
  const grouped = new Map<string, NormalizedArticle[]>();

  for (const article of articles) {
    const bucket = grouped.get(article.topicKey) ?? [];
    bucket.push(article);
    grouped.set(article.topicKey, bucket);
  }

  return Array.from(grouped.entries())
    .map(([topicKey, topicArticles]) => {
      const sortedArticles = topicArticles.sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
      const topic: FeedBucket = {
        slug: topicKey,
        name: sortedArticles[0]?.topicLabel ?? topicKey,
        kind: sortedArticles[0]?.topicKind ?? "theme",
        market: sortedArticles[0]?.market ?? "IN",
        articleCount: sortedArticles.length,
        sourceCount: unique(sortedArticles.map((article) => article.sourceId)).length,
        sources: unique(sortedArticles.map((article) => article.sourceName)),
        tags: unique(sortedArticles.flatMap((article) => article.tags)),
        sector_tags: unique(sortedArticles.flatMap((article) => article.sector_tags || [])),
        stock_candidates: unique(sortedArticles.flatMap((article) => article.stock_candidates || [])),
        signal_types: unique(sortedArticles.flatMap((article) => article.signal_types || [])),
        overview: "",
        keyPoints: topKeyPoints(sortedArticles),
        highlights: sortedArticles.slice(0, 3).map((article) => ({
          id: article.id,
          title: article.title,
          source_name: article.sourceName,
          url: article.url,
          published_at: article.publishedAt,
          summary: article.articleOverview,
          sentiment_label: article.sentimentLabel,
        })),
        sentiment: summarizeTopicSentiment(sortedArticles),
        latestPublishedAt: sortedArticles[0]?.publishedAt ?? new Date(0).toISOString(),
        timeline: sortedArticles.slice(0, 6).map((article) => ({
          id: article.id,
          title: article.title,
          summary: article.articleOverview,
          timestamp: article.publishedAt,
          source_name: article.sourceName,
          article_url: article.url,
        })),
        articles: sortedArticles,
      };

      topic.overview = buildTopicOverview(topic);
      return topic;
    })
    .sort((left, right) => {
      if (right.articleCount !== left.articleCount) {
        return right.articleCount - left.articleCount;
      }
      return right.latestPublishedAt.localeCompare(left.latestPublishedAt);
    });
}

export async function buildMarketSnapshot(options: BuildSnapshotOptions = {}): Promise<MarketSnapshot> {
  const market = options.market ?? "IN";
  const includeReviewSources = options.includeReviewSources ?? false;
  const fetchImpl = options.fetchImpl ?? fetch;

  const activeSources = listSourcesForMarket(market, includeReviewSources);
  const trackedSources = listTrackedSourcesForMarket(market);

  const settled = await Promise.allSettled(activeSources.map((source) => fetchFeed(source, fetchImpl)));
  const articles = dedupeArticles(
    settled.flatMap((result) => (result.status === "fulfilled" ? result.value : [])),
  ).sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));

  const topics = buildTopics(articles);
  const sourceMap = new Map<string, { articleCount: number; lastSeenAt: string | null }>();

  for (const article of articles) {
    const current = sourceMap.get(article.sourceId) ?? { articleCount: 0, lastSeenAt: null };
    current.articleCount += 1;
    current.lastSeenAt = current.lastSeenAt && current.lastSeenAt > article.publishedAt
      ? current.lastSeenAt
      : article.publishedAt;
    sourceMap.set(article.sourceId, current);
  }

  const snapshotWithoutOverview = {
    market,
    generatedAt: new Date().toISOString(),
    includeReviewSources,
    stats: {
      articleCount: articles.length,
      bucketCount: topics.length,
      topicCount: topics.length,
      liveSourceCount: activeSources.length,
      trackedSourceCount: trackedSources.length,
    },
    sources: trackedSources.map((source) => ({
      ...source,
      isLive: activeSources.some((active) => active.id === source.id),
      articleCount: sourceMap.get(source.id)?.articleCount ?? 0,
      lastSeenAt: sourceMap.get(source.id)?.lastSeenAt ?? null,
    })),
    buckets: topics,
    topics,
  };

  return {
    ...snapshotWithoutOverview,
    overview: buildMarketOverview(snapshotWithoutOverview),
  };
}

export async function buildTopicSnapshot(slug: string, options: BuildSnapshotOptions = {}): Promise<FeedBucket | null> {
  const snapshot = await buildMarketSnapshot(options);
  return snapshot.buckets.find((topic) => topic.slug === slug) ?? null;
}
