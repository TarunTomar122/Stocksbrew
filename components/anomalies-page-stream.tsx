import { AnomaliesPageView } from "@/components/anomalies-page-view";
import { getSessionUser } from "@/lib/auth-server";
import { getDailyAnomalies } from "@/lib/daily-anomalies";
import { resolveFeedAccess } from "@/lib/feed-access";
import { getCurrentMarket } from "@/lib/market";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

export async function AnomaliesPageStream() {
  const market = getCurrentMarket();
  const [data, session] = await Promise.all([
    getDailyAnomalies(market).catch(() => null),
    getSessionUser(),
  ]);
  const userDoc = session ? await getUserDoc(session.uid).catch(() => null) : null;
  const isSubscribed = resolveIsSubscribed(userDoc);
  const feedAccess = resolveFeedAccess({ signedIn: Boolean(session), isSubscribed });
  const isEmpty = !data || data.anomalies.length === 0;

  if (isEmpty) {
    return (
      <div className="rounded-[20px] border border-[var(--oa-border)] bg-oa-card p-10 text-center">
        <p className="text-[12px] font-medium tracking-[0.12em] uppercase text-[var(--oa-fg)]">Quiet day</p>
        <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-[var(--oa-muted-fg)]">
          No significant price moves detected yet. Check back during market hours.
        </p>
      </div>
    );
  }

  return (
    <AnomaliesPageView
      anomalies={data.anomalies}
      generatedAt={data.enriched_at || data.generated_at}
      isSubscribed={isSubscribed}
      fullItemLimit={feedAccess.fullItemLimit}
    />
  );
}
