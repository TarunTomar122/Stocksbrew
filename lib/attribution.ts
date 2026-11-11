/**
 * "How did you hear about us?" answers. Ids are stored on the user doc
 * (`heard_about_us`) and sent to PostHog as a person property, so never rename
 * one; add new ones. `ai` (ChatGPT, Claude, Perplexity and the like) was added
 * on 2026-11-11 to see what AI answers bring in. Keep "other" last.
 */
export const ATTRIBUTION_SOURCES = [
  { id: "google", label: "Google or Bing" },
  { id: "ai", label: "ChatGPT or similar" },
  { id: "reddit", label: "Reddit" },
  { id: "x", label: "X" },
  { id: "youtube", label: "YouTube" },
  { id: "friend", label: "A friend" },
  { id: "other", label: "Somewhere else" },
] as const;

export type AttributionSourceId = (typeof ATTRIBUTION_SOURCES)[number]["id"];

export const ATTRIBUTION_SOURCE_IDS = new Set<string>(ATTRIBUTION_SOURCES.map((s) => s.id));

export function isAttributionSourceId(value: string): value is AttributionSourceId {
  return ATTRIBUTION_SOURCE_IDS.has(value);
}
