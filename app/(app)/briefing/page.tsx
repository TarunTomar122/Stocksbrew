import type { Metadata } from "next";

import { BriefingView } from "@/components/briefing/briefing-view";
import { AppPage } from "@/components/oa/kit";
import { MarketingSchema } from "@/components/seo/marketing-schema";
import { loadBriefingPage } from "@/lib/briefing-data";
import { getMarketSessionState } from "@/lib/market-session";
import { ogImage } from "@/lib/og/url";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  const shareImage = ogImage(["page", "briefing"], "Today's market briefing: what moved and why", { daily: true });
  return {
    title: "Stock Market Today: What Moved and Why",
    description:
      "A daily read of the US stock market: how the index closed, the biggest movers with the reason when we could confirm one, and what to check next. Sign in to get the same read for your own stocks.",
    alternates: { canonical: "/briefing" },
    openGraph: { title: "Stock Market Today: What Moved and Why · stocksbrew", description: "A daily read of the US stock market: how the index closed, the biggest movers with the reason when we could confirm one, and what to check next. Sign in to get the same read for your own stocks.", url: "https://www.stocksbrew.online/briefing", images: [shareImage] },
    twitter: { card: "summary_large_image", title: "Stock Market Today: What Moved and Why · stocksbrew", description: "A daily read of the US stock market: how the index closed, the biggest movers with the reason when we could confirm one, and what to check next. Sign in to get the same read for your own stocks.", images: [shareImage] },
  };
}

function marketStateLabel(now: Date): string {
  const session = getMarketSessionState(now);
  if (session.kind === "open") return "Market is open";
  if (session.kind === "premarket") return "Before the open";
  if (session.kind === "afterhours") return "After the close";
  if (session.kind === "weekend") return "Closed for the weekend";
  if (session.kind === "holiday") return session.holidayName ? `Closed for ${session.holidayName}` : "Market holiday";
  return "Market is closed";
}

export default async function BriefingPage({ searchParams }: { searchParams?: { day?: string | string[] } }) {
  const day = typeof searchParams?.day === "string" ? searchParams.day : null;
  const data = await loadBriefingPage({ day, persist: true });

  return (
    <AppPage>
      <MarketingSchema path="/briefing" name="Stock Market Today: What Moved and Why" description="A daily read of the US stock market: how the index closed, the biggest movers with the reason when we could confirm one, and what to check next." breadcrumbLabel="Briefing" />
        <BriefingView
          briefing={data.briefing}
          initialState={data.state}
          viewer={data.viewer.kind}
          pendingTracked={data.viewer.kind === "pending" ? data.viewer.tracked : 0}
          days={data.days.map((entry) => ({ day: entry.day }))}
          archived={data.archived}
          degraded={data.degraded}
          marketState={marketStateLabel(new Date())}
        />
    </AppPage>
  );
}
