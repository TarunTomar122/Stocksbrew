import { RedditBuzzPageView } from "@/components/reddit-buzz-page-view";
import { getSessionUser } from "@/lib/auth-server";
import { getCurrentMarket } from "@/lib/market";
import { getRedditCues } from "@/lib/reddit-cues";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";

export async function RedditBuzzPageStream() {
  const market = getCurrentMarket();
  const session = await getSessionUser();
  const [data, userDoc] = await Promise.all([
    getRedditCues(market).catch(() => null),
    session ? getUserDoc(session.uid).catch(() => null) : Promise.resolve(null),
  ]);
  const isSubscribed = resolveIsSubscribed(userDoc);

  return <RedditBuzzPageView data={data} isSubscribed={isSubscribed} />;
}
