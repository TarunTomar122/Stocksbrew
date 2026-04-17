import { NormalizedArticle, TopicSentimentRange } from "@/lib/types";

const POSITIVE_TERMS = [
  "gain",
  "gains",
  "rally",
  "surge",
  "surges",
  "rise",
  "rises",
  "upside",
  "beat",
  "beats",
  "buyback",
  "bullish",
  "rebound",
  "approval",
  "dividend",
  "upgrade",
  "strong",
];

const NEGATIVE_TERMS = [
  "fall",
  "falls",
  "drop",
  "drops",
  "tumble",
  "tumbles",
  "crash",
  "slump",
  "weak",
  "bearish",
  "outflow",
  "risk",
  "war",
  "cuts",
  "probe",
  "concern",
  "cancels",
  "inflation",
];

function countMatches(text: string, terms: string[]): number {
  return terms.reduce((score, term) => {
    const regex = new RegExp(`\\b${term}\\b`, "gi");
    return score + (text.match(regex)?.length ?? 0);
  }, 0);
}

export function scoreSentiment(text: string): number {
  const normalized = text.toLowerCase();
  const positive = countMatches(normalized, POSITIVE_TERMS);
  const negative = countMatches(normalized, NEGATIVE_TERMS);
  const raw = (positive - negative) / Math.max(1, positive + negative, 3);
  return Math.max(-1, Math.min(1, Number(raw.toFixed(2))));
}

export function labelSentiment(score: number): string {
  if (score >= 0.45) {
    return "bullish";
  }
  if (score >= 0.15) {
    return "constructive";
  }
  if (score > -0.15) {
    return "mixed";
  }
  if (score > -0.45) {
    return "cautious";
  }
  return "bearish";
}

export function summarizeTopicSentiment(articles: NormalizedArticle[]): TopicSentimentRange {
  const scores = articles.map((article) => article.sentimentScore);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const average = Number((scores.reduce((sum, score) => sum + score, 0) / Math.max(1, scores.length)).toFixed(2));

  return {
    min,
    max,
    average,
    label: labelSentiment(average),
  };
}
