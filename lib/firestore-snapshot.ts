import { adminFirestore } from "@/lib/firebase-admin";
import { MarketSnapshot } from "@/lib/types";

function normalizeSnapshot(payload: any): MarketSnapshot {
  const buckets = (payload.buckets || payload.topics || []).map((bucket: any) => ({
    ...bucket,
    articleCount: bucket.articleCount ?? bucket.article_count ?? 0,
    sourceCount: bucket.sourceCount ?? bucket.source_count ?? 0,
    latestPublishedAt: bucket.latestPublishedAt ?? bucket.latest_published_at ?? "",
    recent_count: bucket.recent_count ?? 0,
    previous_count: bucket.previous_count ?? 0,
    related_buckets: bucket.related_buckets ?? [],
    keyPoints: bucket.keyPoints ?? bucket.key_points ?? [],
    highlights: bucket.highlights || [],
    timeline: bucket.timeline || [],
    articles: (bucket.articles || []).map((article: any) => ({
      ...article,
      sourceId: article.sourceId ?? article.source_id ?? "",
      sourceName: article.sourceName ?? article.source_name ?? "",
      sourceKind: article.sourceKind ?? article.source_kind ?? "publisher",
      publishedAt: article.publishedAt ?? article.published_at ?? "",
      topicKey: article.topicKey ?? article.topic_key ?? "",
      topicLabel: article.topicLabel ?? article.topic_label ?? "",
      topicKind: article.topicKind ?? article.topic_kind ?? "market",
      articleOverview: article.articleOverview ?? article.article_overview ?? article.summary ?? "",
      articleKeyPoints: article.articleKeyPoints ?? article.article_key_points ?? [],
      sentimentScore: article.sentimentScore ?? article.sentiment_score ?? 0,
      sentimentLabel: article.sentimentLabel ?? article.sentiment_label ?? "mixed",
      entityMentions: article.entityMentions ?? article.entity_mentions ?? [],
      enrichmentSource: article.enrichmentSource ?? article.enrichment_source ?? "heuristic",
      source_lane: article.source_lane ?? "broad",
      focus_ticker: article.focus_ticker ?? "",
    })),
  }));

  return {
    ...payload,
    generatedAt: payload.generatedAt || payload.generated_at,
    includeReviewSources: payload.includeReviewSources ?? payload.include_review_sources ?? false,
    stats: {
      articleCount: payload.stats?.articleCount ?? payload.stats?.article_count ?? 0,
      bucketCount: payload.stats?.bucketCount ?? payload.stats?.bucket_count ?? payload.stats?.topicCount ?? payload.stats?.topic_count ?? 0,
      topicCount: payload.stats?.topicCount ?? payload.stats?.topic_count ?? 0,
      liveSourceCount: payload.stats?.liveSourceCount ?? payload.stats?.live_source_count ?? 0,
      trackedSourceCount: payload.stats?.trackedSourceCount ?? payload.stats?.tracked_source_count ?? 0,
    },
    sources: (payload.sources || []).map((source: any) => ({
      ...source,
      homepageUrl: source.homepageUrl ?? source.homepage_url ?? "",
      usageStatus: source.usageStatus ?? source.usage_status ?? "enabled",
      usageNotes: source.usageNotes ?? source.usage_notes ?? source.licensing_notes ?? "",
      isLive: source.isLive ?? source.is_live ?? false,
      articleCount: source.articleCount ?? source.article_count ?? 0,
      lastSeenAt: source.lastSeenAt ?? source.last_seen_at ?? null,
    })),
    pulse: payload.pulse || null,
    big_narratives: payload.big_narratives || [],
    most_active: payload.most_active || [],
    buckets,
    topics: buckets,
  };
}

export async function getLatestMarketSnapshot(market: "IN" | "US"): Promise<MarketSnapshot | null> {
  const latestDoc = await adminFirestore.collection("tm_config").doc("latest_snapshots").get();
  if (!latestDoc.exists) {
    return null;
  }

  const latestData = latestDoc.data() || {};
  const latest = latestData[market];
  if (!latest?.snapshot_id) {
    return null;
  }

  const snapshotRef = adminFirestore.collection("tm_snapshots").doc(String(latest.snapshot_id));
  const [snapshotDoc, bucketDocs] = await Promise.all([
    snapshotRef.get(),
    snapshotRef.collection("buckets").get(),
  ]);

  if (!snapshotDoc.exists) {
    return null;
  }

  const buckets = bucketDocs.docs
    .map((doc) => doc.data())
    .sort((left, right) => {
      const articleDelta = Number(right.article_count || 0) - Number(left.article_count || 0);
      if (articleDelta !== 0) {
        return articleDelta;
      }
      return String(left.name || "").localeCompare(String(right.name || ""));
    });

  return normalizeSnapshot({
    ...snapshotDoc.data(),
    buckets,
  });
}
