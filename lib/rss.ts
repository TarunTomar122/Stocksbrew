import { XMLParser } from "fast-xml-parser";

import { scoreSentiment, labelSentiment } from "@/lib/sentiment";
import { SourceDefinition, NormalizedArticle } from "@/lib/types";
import { inferTopic } from "@/lib/topicing";
import { coerceIsoDate, slugify, stripHtml } from "@/lib/utils";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: false,
});

type RawItem = {
  title?: string;
  link?: string;
  description?: string;
  pubDate?: string;
  guid?: string;
};

function arrayify<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function normalizeItem(source: SourceDefinition, item: RawItem): NormalizedArticle | null {
  const title = stripHtml(item.title ?? "");
  const url = stripHtml(item.link ?? item.guid ?? "");

  if (!title || !url) {
    return null;
  }

  const summary = stripHtml(item.description ?? "");
  const topic = inferTopic(title, summary);
  const sentimentScore = scoreSentiment(`${title} ${summary}`);
  const publishedAt = coerceIsoDate(item.pubDate, new Date().toISOString());

  return {
    id: `${source.id}:${slugify(url)}`,
    sourceId: source.id,
    sourceName: source.name,
    sourceKind: source.kind,
    market: source.marketCodes[0],
    title,
    url,
    summary,
    articleOverview: summary,
    articleKeyPoints: [],
    publishedAt,
    topicKey: topic.key,
    topicLabel: topic.label,
    topicKind: topic.kind,
    tags: topic.tags,
    sector_tags: [],
    stock_candidates: [],
    stock_tickers: [],
    signal_types: [],
    bucket_keys: [topic.key],
    bucket_labels: [topic.label],
    bucket_kinds: [topic.kind],
    sentimentScore,
    sentimentLabel: labelSentiment(sentimentScore),
    entityMentions: [],
    enrichmentSource: "heuristic",
  };
}

export function parseRssFeed(xml: string, source: SourceDefinition): NormalizedArticle[] {
  const document = parser.parse(xml);
  const items = arrayify<RawItem>(document?.rss?.channel?.item);

  return items
    .map((item) => normalizeItem(source, item))
    .filter((item): item is NormalizedArticle => Boolean(item));
}

export async function fetchFeed(source: SourceDefinition, fetchImpl: typeof fetch): Promise<NormalizedArticle[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetchImpl(source.feedUrl, {
      signal: controller.signal,
      headers: {
        "user-agent": "trace-money/0.1 (+https://local.trace-money.dev)",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch ${source.id}: ${response.status}`);
    }

    const xml = await response.text();
    return parseRssFeed(xml, source);
  } finally {
    clearTimeout(timer);
  }
}
