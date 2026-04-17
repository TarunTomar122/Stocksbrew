import { FeedBucket, MarketSnapshot } from "@/lib/types";
import { truncate } from "@/lib/utils";

export function buildTopicOverview(topic: FeedBucket): string {
  const leadingArticles = topic.articles
    .slice(0, 2)
    .map((article) => article.title)
    .join("; ");

  return truncate(
    `${topic.name} is active across ${topic.sourceCount} sources and ${topic.articleCount} items. The tone is ${topic.sentiment.label}, with recent coverage centered on ${leadingArticles}.`,
    220,
  );
}

export function buildMarketOverview(snapshot: Omit<MarketSnapshot, "overview">): string {
  const leadingTopics = (snapshot.buckets || snapshot.topics || [])
    .slice(0, 3)
    .map((topic) => topic.name)
    .join(", ");

  return truncate(
    `tikrr is tracking ${snapshot.stats.bucketCount ?? snapshot.stats.topicCount} fixed market buckets from ${snapshot.stats.liveSourceCount} live ${snapshot.market === "IN" ? "Indian" : "US"} market sources. Coverage currently leans into ${leadingTopics || "market structure"} with review-sensitive publisher feeds ${snapshot.includeReviewSources ? "included" : "held back until cleared"}.`,
    240,
  );
}
