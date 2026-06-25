export const ATTRIBUTION_SOURCES = [
  { id: "x", label: "X" },
  { id: "youtube", label: "YouTube" },
  { id: "google", label: "Google" },
  { id: "friend", label: "Friend" },
  { id: "reddit", label: "Reddit" },
  { id: "other", label: "Other" },
] as const;

export type AttributionSourceId = (typeof ATTRIBUTION_SOURCES)[number]["id"];

export const ATTRIBUTION_SOURCE_IDS = new Set<string>(ATTRIBUTION_SOURCES.map((s) => s.id));

export function isAttributionSourceId(value: string): value is AttributionSourceId {
  return ATTRIBUTION_SOURCE_IDS.has(value);
}
