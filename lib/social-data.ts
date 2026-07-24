import type { RedditSnapshot } from "@/lib/reddit-cues-shared";

export type SocialDataState = "fresh" | "partial" | "stale" | "empty";

export function socialDataState(
  snapshot: RedditSnapshot | null,
  now = Date.now(),
): SocialDataState {
  if (!snapshot || snapshot.tickers.length === 0) return "empty";
  const generated = Date.parse(snapshot.generated_at);
  const maxAgeMs = Math.max(6, snapshot.window_hours || 120) * 60 * 60 * 1000;
  if (!Number.isFinite(generated) || now - generated > maxAgeMs) return "stale";
  if (snapshot.coverage_status !== "complete" || snapshot.fetch_failures.length > 0) {
    return "partial";
  }
  return "fresh";
}
