export type MarketCode = "IN" | "US";

export type SourceKind = "exchange" | "regulator" | "publisher";
export type UsageStatus = "enabled" | "review_required" | "planned";

export type SourceDefinition = {
  id: string;
  name: string;
  kind: SourceKind;
  marketCodes: MarketCode[];
  market_codes?: MarketCode[];
  homepageUrl: string;
  homepage_url?: string;
  feedUrl: string;
  feed_url?: string;
  verificationUrl: string;
  verification_url?: string;
  verifiedAt: string;
  verified_at?: string;
  usageStatus: UsageStatus;
  usage_status?: UsageStatus;
  enabledByDefault: boolean;
  enabled_by_default?: boolean;
  usageNotes: string;
  usage_notes?: string;
  licensing_notes?: string;
  tags: string[];
  coverage_modes?: string[];
  signal_types?: string[];
  sector_tags?: string[];
};

export type NormalizedArticle = {
  id: string;
  sourceId: string;
  source_id?: string;
  sourceName: string;
  source_name?: string;
  sourceKind: SourceKind;
  source_kind?: SourceKind;
  market: MarketCode;
  title: string;
  url: string;
  summary: string;
  articleOverview: string;
  article_overview?: string;
  articleKeyPoints: string[];
  article_key_points?: string[];
  publishedAt: string;
  published_at?: string;
  topicKey: string;
  topic_key?: string;
  topicLabel: string;
  topic_label?: string;
  topicKind: string;
  topic_kind?: string;
  tags: string[];
  sector_tags?: string[];
  stock_candidates?: string[];
  stock_tickers?: string[];
  signal_types?: string[];
  bucket_keys?: string[];
  bucket_labels?: string[];
  bucket_kinds?: string[];
  sentimentScore: number;
  sentiment_score?: number;
  sentimentLabel: string;
  sentiment_label?: string;
  entityMentions: Array<Record<string, unknown>>;
  entity_mentions?: Array<Record<string, unknown>>;
  enrichmentSource: string;
  enrichment_source?: string;
  source_lane?: string;
  focus_ticker?: string;
};

export type TopicSentimentRange = {
  min: number;
  max: number;
  average: number;
  label: string;
};

export type BucketHighlight = {
  id: string;
  title: string;
  source_name?: string;
  url: string;
  published_at: string;
  summary?: string;
  sentiment_label?: string;
};

export type TimelineEvent = {
  id: string;
  title: string;
  summary?: string;
  timestamp: string;
  source_name?: string;
  article_url?: string;
};

export type FeedBucket = {
  slug: string;
  name: string;
  kind: string;
  market: MarketCode;
  articleCount: number;
  article_count?: number;
  sourceCount: number;
  source_count?: number;
  sources: string[];
  tags: string[];
  sector_tags?: string[];
  stock_candidates?: string[];
  signal_types?: string[];
  overview: string;
  keyPoints: string[];
  key_points?: string[];
  highlights: BucketHighlight[];
  sentiment: TopicSentimentRange;
  latestPublishedAt: string;
  latest_published_at?: string;
  recent_count?: number;
  previous_count?: number;
  related_buckets?: Array<Record<string, unknown>>;
  timeline: TimelineEvent[];
  articles: NormalizedArticle[];
};

export type TopicCluster = FeedBucket;

export type SourceSnapshot = SourceDefinition & {
  isLive?: boolean;
  is_live?: boolean;
  articleCount?: number;
  article_count?: number;
  lastSeenAt?: string | null;
  last_seen_at?: string | null;
};

export type MarketSnapshot = {
  market: MarketCode;
  snapshot_id?: string;
  as_of_date?: string;
  generatedAt: string;
  generated_at?: string;
  overview: string;
  includeReviewSources: boolean;
  include_review_sources?: boolean;
  stats: {
    articleCount?: number;
    article_count?: number;
    bucketCount?: number;
    bucket_count?: number;
    topicCount?: number;
    topic_count?: number;
    liveSourceCount?: number;
    live_source_count?: number;
    trackedSourceCount?: number;
    tracked_source_count?: number;
  };
  sources: SourceSnapshot[];
  pulse?: Record<string, unknown>;
  big_narratives?: Array<Record<string, unknown>>;
  most_active?: Array<Record<string, unknown>>;
  buckets: FeedBucket[];
  topics?: FeedBucket[];
};

export type BuildSnapshotOptions = {
  market?: MarketCode;
  includeReviewSources?: boolean;
  fetchImpl?: typeof fetch;
};
