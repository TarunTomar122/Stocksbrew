import { slugify, unique } from "@/lib/utils";

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "to",
  "for",
  "of",
  "on",
  "at",
  "in",
  "with",
  "from",
  "after",
  "ahead",
  "amid",
  "today",
  "what",
  "lies",
  "more",
  "check",
  "details",
  "india",
  "indian",
  "market",
  "markets",
  "stock",
  "stocks",
  "share",
  "shares",
]);

const RULES = [
  { kind: "ipo", label: "IPO Watch", keywords: ["ipo", "issue booked", "gmp", "listing"] },
  { kind: "indices", label: "Indices and breadth", keywords: ["sensex", "nifty", "bank nifty", "midcap", "smallcap"] },
  { kind: "rates", label: "Rates and currency", keywords: ["bond", "yield", "rupee", "forex", "usd"] },
  { kind: "commodities", label: "Oil and commodities", keywords: ["oil", "crude", "brent", "wti", "gold", "silver"] },
  { kind: "regulation", label: "Regulatory and exchange updates", keywords: ["circular", "notice", "announcement", "disclosure", "compliance"] },
  { kind: "corporate-action", label: "Corporate actions", keywords: ["dividend", "buyback", "board meeting", "bonus", "rights issue"] },
];

function cleanEntity(entity: string): string {
  return entity
    .replace(/\b(day|issue|news|share price|stock price)\b/gi, "")
    .replace(/[|:,;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractEntity(title: string): string | null {
  const patterns = [
    /^(.{2,70}?)\s+IPO\b/i,
    /^(.{2,70}?)\s+(?:shares?|stock)\b/i,
    /^(.{2,70}?)\s+(?:falls?|drops?|tumbles?|surges?|rises?|jumps?|slips?|gains?|posts?|plans?|cancels?|approves?)\b/i,
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (!match) {
      continue;
    }
    const entity = cleanEntity(match[1]);
    const words = entity.split(/\s+/).filter(Boolean);
    if (words.length >= 1 && words.length <= 6) {
      return entity;
    }
  }

  return null;
}

function findRule(text: string) {
  const normalized = text.toLowerCase();
  return RULES.find((rule) => rule.keywords.some((keyword) => normalized.includes(keyword)));
}

function fallbackLabel(title: string): string {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word && !STOPWORDS.has(word))
    .slice(0, 3);

  if (words.length === 0) {
    return "Market signal";
  }

  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

export function inferTopic(title: string, summary: string) {
  const rule = findRule(`${title} ${summary}`);
  const entity = extractEntity(title);

  if (entity && rule?.kind === "ipo") {
    return {
      key: `ipo:${slugify(entity)}`,
      label: `${entity} IPO`,
      kind: "ipo",
      tags: unique([rule.kind, "company", "primary-market"]),
    };
  }

  if (entity && rule?.kind === "corporate-action") {
    return {
      key: `company:${slugify(entity)}`,
      label: entity,
      kind: "company",
      tags: unique([rule.kind, "company"]),
    };
  }

  if (entity && !rule) {
    return {
      key: `company:${slugify(entity)}`,
      label: entity,
      kind: "company",
      tags: ["company"],
    };
  }

  if (rule) {
    return {
      key: `${rule.kind}:${slugify(rule.label)}`,
      label: rule.label,
      kind: rule.kind,
      tags: [rule.kind],
    };
  }

  const label = fallbackLabel(title);
  return {
    key: `theme:${slugify(label)}`,
    label,
    kind: "theme",
    tags: ["theme"],
  };
}
