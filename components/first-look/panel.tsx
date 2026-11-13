import { Suspense } from "react";

import { Bar } from "@/components/oa/kit/skeleton";
import { ThesisStripSlot } from "@/components/thesis-monitor/thesis-strip-slot";
import { getSessionUser } from "@/lib/auth-server";
import { loadAgentOffers, loadFirstLook, lookStocks, reasonAsks, firstLookViewFor } from "@/lib/first-look/server";
import type { FirstLookRun } from "@/lib/first-look/types";
import { getUserDoc } from "@/lib/watchlist";

import { FirstLookDone, FirstLookStart } from "./actions";
import { AgentOfferRow } from "./agent-card";
import { CARD, DecisionCard, DecisionStrip, FindingCard } from "./cards";
import { GRID_HOST, ROW, ROWS, gridFor } from "./grid";
import { ReasonRow } from "./reason-tile";

/**
 * The agent's first look on /agent: what it found on the person's stocks (the decision first, then the findings),
 * then the agents it would set up and one reason to give. The page shell and the heading come first; the findings
 * and the agents stream in behind skeletons laid out like them. Shown only to a signed-in person whose first look is
 * open (lib/first-look/state.ts), or anyone signed in on `?first-look=1`, which writes nothing until they tap.
 */

const HEADING = "text-[15px] font-semibold leading-6 text-oa-fg";

function GhostCard({ logo = true }: { logo?: boolean }) {
  return (
    <div className={CARD} aria-hidden="true">
      <span className="flex items-center gap-2.5">
        {logo ? <Bar className="size-7 shrink-0 !rounded-full" /> : <Bar className="size-7 shrink-0" />}
        <span className="flex flex-1 flex-col gap-1.5">
          <Bar className="h-3.5 w-14" />
          <Bar className="h-3 w-24" />
        </span>
      </span>
      <Bar className="mt-3 h-6 w-20" />
      <Bar className="mt-2 h-3.5 w-full" />
      <Bar className="mt-1.5 h-3.5 w-2/3" />
    </div>
  );
}

function FindingsGhost() {
  return (
    <div className={gridFor(6)} role="status" aria-label="Looking at your stocks">
      {Array.from({ length: 6 }, (_, index) => (
        <GhostCard key={index} logo={index > 0} />
      ))}
    </div>
  );
}

function AgentsGhost() {
  return (
    <div className="mt-5" aria-hidden="true">
      <Bar className="mx-1 mb-3 h-4 w-48" />
      <ul className={ROWS}>
        {Array.from({ length: 4 }, (_, index) => (
          <li key={index} className={ROW}>
            <Bar className="size-7 shrink-0" />
            <Bar className="h-3.5 w-40" />
            <Bar className="h-3.5 min-w-0 flex-1" />
            <Bar className="h-6 w-11 shrink-0 !rounded-full" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The agents to offer and the reason to ask for, read once for whichever row shows them. */
async function loadSetup(uid: string, run: FirstLookRun | null) {
  const [offers, doc] = await Promise.all([loadAgentOffers(uid, run).catch(() => null), getUserDoc(uid).catch(() => null)]);
  return { offers: offers?.offers ?? [], limitNote: offers?.limitNote ?? null, asks: reasonAsks(doc, run?.quotes ?? {}, run?.names ?? {}) };
}

async function Findings({ uid }: { uid: string }) {
  const run = await loadFirstLook(uid).catch(() => null);
  if (!run) {
    return (
      <div className={CARD}>
        <p className="text-pretty text-[13.5px] leading-5 text-oa-fg">I could not finish this look just now. Reload the page to try again.</p>
      </div>
    );
  }
  // Nothing found: the decision as one compact strip across the panel, never a lone tall card over empty columns.
  if (run.findings.length === 0) return <DecisionStrip decision={run.decision} calls={run.calls} stocks={run.stocks} />;
  return (
    <div className={gridFor(run.findings.length + 1)}>
      <DecisionCard decision={run.decision} calls={run.calls} stocks={run.stocks} />
      {run.findings.map((finding) => (
        <FindingCard key={finding.id} finding={finding} quote={run.quotes[finding.ticker] ?? null} today={run.today} />
      ))}
    </div>
  );
}

async function Agents({ uid }: { uid: string }) {
  const run = await loadFirstLook(uid).catch(() => null);
  const { offers: list, limitNote, asks } = await loadSetup(uid, run);
  // A heading with no row under it says nothing: the limit note alone is not worth a section.
  if (list.length === 0 && asks.length === 0) return null;
  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-1 pb-2">
        <h3 className={HEADING}>{list.length > 0 ? "Agents I'd set up for you" : "One thing to set up"}</h3>
        {limitNote ? <p className="text-pretty text-[12.5px] leading-5 text-oa-muted-fg">{limitNote}</p> : null}
      </div>
      {/* Rows sized to their content: an agent is a name, a line and a switch, not a tall card. */}
      <ul className={ROWS}>
        {list.map((offer) => (
          <AgentOfferRow key={offer.template} offer={offer} />
        ))}
        {asks.length > 0 ? <ReasonRow asks={asks} /> : null}
      </ul>
    </div>
  );
}

export async function FirstLookSlot({ preview }: { preview: boolean }) {
  const session = await getSessionUser().catch(() => null);
  if (!session) return null;
  const view = await firstLookViewFor(session.uid, preview).catch(() => ({ show: "none" as const }));
  if (view.show !== "panel") return null;
  const stocks = lookStocks(await getUserDoc(session.uid).catch(() => null)).length;
  return (
    <section aria-labelledby="first-look-title" className={`mb-6 min-w-0 ${GRID_HOST}`}>
      <div className="flex items-center justify-between gap-3 px-1 pb-2">
        <h2 id="first-look-title" className={HEADING}>
          My first look at your {stocks} {stocks === 1 ? "stock" : "stocks"}
        </h2>
        <FirstLookDone />
      </div>
      <Suspense fallback={<FindingsGhost />}>
        <Findings uid={session.uid} />
      </Suspense>
      {/* The thesis, when the person already has a checked one or a measurable reason: its own boundary, so the look
          never waits for it (lib/thesis-monitor/strip.ts). */}
      <Suspense fallback={null}>
        <ThesisStripSlot uid={session.uid} className="mt-3" />
      </Suspense>
      <Suspense fallback={<AgentsGhost />}>
        <Agents uid={session.uid} />
      </Suspense>
    </section>
  );
}

/** The one-time "Get a first look" for someone whose stocks were in before it existed; nothing for anyone else. */
export async function FirstLookOffer({ preview }: { preview: boolean }) {
  if (preview) return null;
  const session = await getSessionUser().catch(() => null);
  if (!session) return null;
  const view = await firstLookViewFor(session.uid, false).catch(() => ({ show: "none" as const }));
  return view.show === "offer" ? <FirstLookStart /> : null;
}
