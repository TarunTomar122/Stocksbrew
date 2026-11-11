import type { Metadata } from "next";
import { Suspense } from "react";

import { BriefingAgentsGhost, BriefingAgentsStrip, BriefingAskStrip } from "@/components/briefing/agents-strip";
import { BriefingView } from "@/components/briefing/briefing-view";
import { BriefingLockedMoves } from "@/components/briefing/locked-moves";
import { EarningsDayBriefing } from "@/components/earnings-day/briefing-reports";
import { AppPage } from "@/components/oa/kit";
import { MarketingSchema } from "@/components/seo/marketing-schema";
import { loadWatches } from "@/lib/agent-watch-server";
import { getSessionUser } from "@/lib/auth-server";
import { briefingAnchorTickers } from "@/lib/briefing-anchors";
import { getViewer } from "@/lib/entitlements-server";
import { loadBriefingPage, type BriefingPageData } from "@/lib/briefing-data";
import type { BriefingSession } from "@/lib/briefing-read";
import { etDay } from "@/lib/insight-format";
import { loadDeskGiants, loadDeskSectors } from "../explore/desk-data";
import { getMarketSessionState } from "@/lib/market-session";
import { noteDegradedRender } from "@/lib/next-render";
import { ogImage } from "@/lib/og/url";
import { newYorkToday } from "@/lib/portfolio-data";

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

/**
 * How the whole session went (each sector, and the biggest companies together), for the market
 * view's headline. Live data, so only when it is from the briefing's own day; null otherwise.
 */
async function loadSession(day: string, indexAsOf: string | null): Promise<BriefingSession | null> {
  const today = etDay(new Date().toISOString()) ?? day;
  const [sectors, giants] = await Promise.all([loadDeskSectors(today), loadDeskGiants(today)]);
  if (sectors.rows.length < 4 || etDay(sectors.asOf) !== day) return null;
  // The headline puts the sectors next to the index's figure: within 45 minutes of each other, or both after the close.
  const gap = indexAsOf && sectors.asOf ? Math.abs(Date.parse(sectors.asOf) - Date.parse(indexAsOf)) : NaN;
  const afterClose = (iso: string | null) => (iso ? Number(new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" })) >= 16 : false);
  if (!(gap <= 45 * 60_000) && !(afterClose(indexAsOf) && afterClose(sectors.asOf))) return null;
  const sameDay = giants.day === day && giants.rows.length >= 5;
  const cap = giants.rows.reduce((sum, row) => sum + row.cap, 0);
  return {
    sectors: sectors.rows.map((row) => ({ name: row.name, day: row.day, slug: row.slug || undefined })),
    // A size-weighted average is exactly the change in their combined value.
    giants:
      sameDay && cap > 0
        ? {
            count: giants.rows.length,
            pct: giants.rows.reduce((sum, row) => sum + row.cap * row.day, 0) / cap,
            // The company whose move shifted the group's value the most.
            leader: (([top]) => (top ? { name: top.name, pct: top.day } : null))([...giants.rows].sort((a, b) => Math.abs(b.cap * b.day) - Math.abs(a.cap * a.day))),
          }
        : null,
  };
}

/**
 * Under the read: signed in, the person's agents with their latest outcomes and Ask on their portfolio, streamed in
 * its own Suspense (one small read); signed out, Ask on the market only, with nothing read about anyone. The
 * signed-out page is the cached one (app/(app)/anon/[v]/briefing). Not on an earlier day's briefing.
 */
function agentsSlot(data: BriefingPageData): React.ReactNode {
  if (data.archived) return null;
  const viewer = data.viewer;
  if (viewer.kind === "signed_out") return <BriefingAskStrip />;
  // Stocks with an open, visible card in a personal briefing, so a flagged stock can jump to it.
  const inBriefing = briefingAnchorTickers(data.briefing, data.state);
  return (
    <Suspense fallback={<BriefingAgentsGhost />}>
      <BriefingAgentsStrip uid={viewer.uid} today={newYorkToday()} inBriefing={inBriefing} portfolio={viewer.kind !== "empty"} />
    </Suspense>
  );
}

/** Free: the moves on stocks the agent does not cover, named with no explanation (lib/briefing.ts locked_moves). */
async function lockedSlot(data: BriefingPageData) {
  const moves = data.briefing.locked_moves ?? [];
  if (moves.length === 0 || data.viewer.kind !== "member") return null;
  const viewer = await getViewer();
  return <BriefingLockedMoves moves={moves} plan={viewer.plan} trialEligible={viewer.trialEligible} archived={data.archived} />;
}

export default async function BriefingPage({ searchParams }: { searchParams?: { day?: string | string[] } }) {
  const day = typeof searchParams?.day === "string" ? searchParams.day : null;
  // The agents strip's one read starts with the page rather than after the briefing is built: same per-request
  // call (loadWatches is React-cached on uid and day), so the strip picks up the read already in flight.
  if (!day) {
    void getSessionUser()
      .then((user) => (user ? loadWatches(user.uid, newYorkToday()) : null))
      .catch(() => null);
  }
  const data = await loadBriefingPage({ day, persist: true });
  // A briefing missing a source is not kept as the cached signed-out copy for long (lib/next-render.ts).
  if (data.degraded.length > 0) noteDegradedRender();
  const session = !day && !data.archived && data.briefing.mode === "market" ? await loadSession(data.briefing.date, data.briefing.market.as_of).catch(() => null) : null;

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
          session={session}
          agents={agentsSlot(data)}
          locked={await lockedSlot(data)}
          earnings={
            day || data.archived ? null : (
              <Suspense fallback={null}>
                <EarningsDayBriefing />
              </Suspense>
            )
          }
        />
    </AppPage>
  );
}
