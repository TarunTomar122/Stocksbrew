import { HomeLiveFeed } from "@/components/home-live-feed";
import { splitDisplayableMoves } from "@/components/daily-anomalies-shared";
import type { AnomalyItem } from "@/lib/daily-anomalies";
import type { RedditSnapshot } from "@/lib/reddit-cues-shared";

type Props = {
  anomalies: AnomalyItem[];
  generatedAt: string;
  reddit?: RedditSnapshot | null;
  isSubscribed?: boolean;
};

export function DailyAnomalies({ anomalies, generatedAt, reddit = null, isSubscribed = false }: Props) {
  if (!anomalies || anomalies.length === 0) return null;

  const { ups, downs } = splitDisplayableMoves(anomalies);
  if (ups.length === 0 && downs.length === 0) return null;

  return (
    <HomeLiveFeed
      ups={ups}
      downs={downs}
      generatedAt={generatedAt}
      reddit={reddit}
      isSubscribed={isSubscribed}
    />
  );
}
