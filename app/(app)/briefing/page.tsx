import type { Metadata } from "next";
import { Suspense } from "react";

import { AskPageHint } from "@/components/ask/ask-page-hint";
import { BriefingAgentsGhost, BriefingAgentsStrip } from "@/components/briefing/agents-strip";
import { BriefingView } from "@/components/briefing/briefing-view";
import { BriefingLockedMoves } from "@/components/briefing/locked-moves";
import { withoutCircularReasons } from "@/components/briefing/real-reasons";
import { EarningsDayBriefing } from "@/components/earnings-day/briefing-reports";
import { AgentLog, AgentLogGhost } from "@/components/agent-log/agent-log";
import { AppPage } from "@/components/oa/kit";
import { BeforeOpenCard } from "@/components/premarket/before-open";
import { MarketingSchema } from "@/components/seo/marketing-schema";
import { loadWatches } from "@/lib/agent-watch-server";
import { getSessionUser } from "@/lib/auth-server";
import { briefingAnchorTickers } from "@/lib/briefing-anchors";
import { briefingMoveFacts } from "@/lib/briefing-move-facts-server";
import { getViewer } from "@/lib/entitlements-server";
import { loadBriefingPage, type BriefingPageData } from "@/lib/briefing-data";
import { loadExampleBriefing, type ExampleBriefingExtras } from "@/lib/briefing-example";
import type { BriefingSession } from "@/lib/briefing-read";
import { etDay } from "@/lib/insight-format";
import { loadDeskGiants, loadDeskSectors } from "../explore/desk-data";
import { getMarketSessionState } from "@/lib/market-session";
import { noteDegradedRender } from "@/lib/next-render";
import { ogImage } from "@/lib/og/url";
import { newYorkToday } from "@/lib/portfolio-data";
import { overnightResultFacts } from "@/lib/results/server";

export const dynamic = "force-dynamic";

/** Signed out, the page is the example portfolio's briefing; the market's day has its own page (/explore). */
const TITLE = "A Daily Briefing on Your Own Stocks";
const DESCRIPTION =
  "An example of the daily read members get on their own stocks: each move, the reason when we could confirm one, our call and what is coming up.";

export function generateMetadata(): Metadata {
  const shareImage = ogImage(["page", "briefing"], "Your stocks, explained every morning", { daily: true });
  return {
    title: TITLE,
    description: DESCRIPTION,
    alternates: { canonical: "/briefing" },
    openGraph: { title: `${TITLE} · stocksbrew`, description: DESCRIPTION, url: "https://www.stocksbrew.online/briefing", images: [shareImage] },
    twitter: { card: "summary_large_image", title: `${TITLE} · stocksbrew`, description: DESCRIPTION, images: [shareImage] },
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
  // No sector list at all is a failed read (the loader hands back an empty one), so this copy is not kept for long.
  if (sectors.rows.length < 4) {
    noteDegradedRender();
    return null;
  }
  if (etDay(sectors.asOf) !== day) return null;
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
 * No Ask box on the page (owner rule 1): the shell's Ask is the page's one Ask. Signed in, it starts from the
 * person's stocks (or nothing, when they track none); signed out it is the market's day, which the panel works out
 * from the address, so the cached signed-out page (app/(app)/anon/[v]/briefing) carries no hint and reads no cookie.
 */
function askHint(data: BriefingPageData): React.ReactNode {
  if (data.viewer.kind === "signed_out") return null;
  return <AskPageHint context={data.viewer.kind === "empty" ? null : "portfolio"} />;
}

/**
 * The side rail's agents card: signed in, the person's watches with their latest outcomes, streamed in its own
 * Suspense (one small read). Not the lead of the page (owner, Nov 11), so it sits beside the briefing, not under it.
 */
function railSlot(data: BriefingPageData): React.ReactNode {
  if (data.archived) return null;
  const viewer = data.viewer;
  if (viewer.kind === "signed_out") return null;
  // Stocks with an open, visible card in a personal briefing, so a flagged stock can jump to it.
  const inBriefing = briefingAnchorTickers(data.briefing, data.state);
  return (
    <Suspense fallback={<BriefingAgentsGhost />}>
      <BriefingAgentsStrip uid={viewer.uid} today={newYorkToday()} inBriefing={inBriefing} portfolio={viewer.kind !== "empty"} />
    </Suspense>
  );
}

/**
 * Held stocks that reported overnight, for their cards' fact (lib/results): one shared cached list, then a cached
 * read for each held stock that reported. Today's personal briefing only; a failed read leaves the cards as they were.
 */
async function resultFacts(data: BriefingPageData, day: string | null): Promise<Record<string, string> | undefined> {
  if (day || data.archived || data.briefing.mode !== "personal") return undefined;
  const held = [...data.briefing.needs_you, ...data.briefing.also_today].filter((item) => item.relation === "holding").map((item) => item.ticker);
  if (held.length === 0) return undefined;
  return overnightResultFacts([...new Set(held)], newYorkToday()).catch((error) => {
    console.warn("[briefing] results read failed:", error instanceof Error ? error.message : error);
    return undefined;
  });
}

/**
 * Price facts for the cards (lib/briefing-move-facts.ts), from each moving stock's cached closes. Today's personal
 * briefing only (the example's too); a slow or failed read leaves the cards as they were.
 */
async function priceFacts(data: BriefingPageData, day: string | null): Promise<Record<string, string[]> | undefined> {
  if (day || data.archived || data.briefing.mode !== "personal") return undefined;
  return briefingMoveFacts(data.briefing).catch((error) => {
    console.warn("[briefing] price facts failed:", error instanceof Error ? error.message : error);
    return undefined;
  });
}

/** Free: the moves on stocks the agent does not cover, named with no explanation (lib/briefing.ts locked_moves). */
async function lockedSlot(data: BriefingPageData) {
  const moves = data.briefing.locked_moves ?? [];
  if (moves.length === 0 || data.viewer.kind !== "member") return null;
  const viewer = await getViewer();
  return <BriefingLockedMoves moves={moves} plan={viewer.plan} trialEligible={viewer.trialEligible} archived={data.archived} />;
}

export default async function BriefingPage({ searchParams }: { searchParams?: { day?: string | string[] } }) {
  // Signed out, the briefing is the example portfolio's (lib/briefing-example.ts): what a member's morning read looks
  // like, from real prices. The cached signed-out copy (app/(app)/anon/[v]/briefing) reads no cookie, so it lands here.
  const user = await getSessionUser().catch(() => null);
  const signedIn = Boolean(user);
  // Earlier days are a member's own saved briefings; signed out, ?day= shows today's example with everything on it.
  const day = signedIn && typeof searchParams?.day === "string" ? searchParams.day : null;
  // The agents strip's one read starts before the briefing is built (loadWatches is React-cached on uid and day),
  // so the strip picks up the read already in flight.
  if (!day && user) void loadWatches(user.uid, newYorkToday()).catch(() => null);
  const data: BriefingPageData & { example?: ExampleBriefingExtras } = signedIn
    ? await loadBriefingPage({ day, persist: true })
    : await loadExampleBriefing();
  // A briefing missing a source is not kept as the cached signed-out copy for long (lib/next-render.ts).
  if (data.degraded.length > 0) noteDegradedRender();
  // A failed session read is a degraded render too (lib/next-render.ts), so the cached signed-out copy does not keep
  // the market view without its sector list. A session left out on purpose (sectors from another day) is not.
  const session =
    !day && !data.archived && data.briefing.mode === "market"
      ? await loadSession(data.briefing.date, data.briefing.market.indices[0]?.as_of ?? data.briefing.market.as_of).catch(() => {
          noteDegradedRender();
          return null;
        })
      : null;

  // All cached reads; they run side by side.
  const [locked, facts, prices] = await Promise.all([lockedSlot(data), resultFacts(data, day), priceFacts(data, day)]);

  return (
    <AppPage>
      <MarketingSchema path="/briefing" name={TITLE} description={DESCRIPTION} breadcrumbLabel="Briefing" />
        <BriefingView
          briefing={withoutCircularReasons(data.briefing)}
          initialState={data.state}
          viewer={data.viewer.kind}
          pendingTracked={data.viewer.kind === "pending" ? data.viewer.tracked : 0}
          days={data.days.map((entry) => ({ day: entry.day }))}
          archived={data.archived}
          degraded={data.degraded}
          marketState={marketStateLabel(new Date())}
          example={data.example ?? null}
          renderedAt={Date.now()}
          session={session}
          rail={railSlot(data)}
          beforeOpen={
            day || data.archived ? null : (
              <Suspense fallback={null}>
                <BeforeOpenCard />
              </Suspense>
            )
          }
          locked={locked}
          resultFacts={facts}
          moveFacts={prices}
          agentLog={
            day || data.archived ? null : (
              <Suspense fallback={<AgentLogGhost narrow className="lg:max-h-full" />}>
                <AgentLog narrow fit />
              </Suspense>
            )
          }
          earnings={
            day || data.archived ? null : (
              <Suspense fallback={null}>
                <EarningsDayBriefing />
              </Suspense>
            )
          }
        />
        {askHint(data)}
    </AppPage>
  );
}
