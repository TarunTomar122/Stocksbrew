import Link from "next/link";

import { AGENT_LIST, AgentFoot, AgentRow } from "@/components/agent-watch/agent-rows";
import { WATCH_LINK } from "@/components/agent-watch/watch-list";
import { Bar } from "@/components/oa/kit/skeleton";
import { describeWatch, nextCheckWords } from "@/lib/agent-watch";
import { loadWatches } from "@/lib/agent-watch-server";
import { agentLines } from "@/lib/portfolio-home/agent-lines";
import type { AgentsSource } from "@/lib/portfolio-home/log";
import type { Loaded } from "@/lib/portfolio-home/pick";

/**
 * The briefing rail's agents card: the signed-in person's active agents as compact rows (components/agent-watch/
 * agent-rows.tsx): kind, short name, what the last run came to, and the stocks it flagged as chips. Signed out the
 * rail has a line about agents instead (components/briefing/briefing-view.tsx): the signed-out briefing is one cached
 * page for everyone (app/(app)/anon/[v]/briefing), so it never reads a cookie or anyone's data. Server components;
 * the watches are one small read with its own time limit (lib/agent-watch-server.ts), streamed in their own Suspense,
 * and nothing here calls a model.
 */

const CARD = "oa-surface min-w-0 overflow-hidden border border-oa-border bg-oa-card";

function Head({ children, manage = false }: { children: React.ReactNode; manage?: boolean }) {
  return (
    <header className="flex min-h-10 items-center justify-between gap-3 px-4 pb-0.5 pt-2.5">
      <h2 id="briefing-agents-label" className="oa-label">
        {children}
      </h2>
      {manage ? (
        <Link href="/agents" prefetch={false} className={`text-[13px] ${WATCH_LINK}`}>
          Manage
        </Link>
      ) : null}
    </header>
  );
}

type StripProps = {
  /** New York day, YYYY-MM-DD. */
  today: string;
  /** Tickers with their own card in today's briefing. The rows open the agent, so these are not linked from here. */
  inBriefing: string[];
  /** The person tracks stocks, so Ask can start from their portfolio. */
  portfolio: boolean;
};

/** Signed in: the person's active agents and their latest outcomes, for the side rail. */
export async function BriefingAgentsStrip({ uid, ...props }: StripProps & { uid: string }) {
  const loaded = await loadWatches(uid, props.today);
  return <BriefingAgentsCard loaded={loaded} {...props} />;
}

/** The strip itself, from the watches once they are read. */
export function BriefingAgentsCard({ loaded, today }: StripProps & { loaded: Loaded<AgentsSource> }) {
  if (loaded.state !== "ready") {
    return (
      <section aria-labelledby="briefing-agents-label" className={CARD}>
        <Head>Your agents</Head>
        <p className="px-4 pb-2.5 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">We could not read your agents just now. Reload in a minute.</p>
      </section>
    );
  }

  const none = loaded.value.jobs.length === 0;
  if (none) {
    return (
      <section aria-labelledby="briefing-agents-label" className={CARD}>
        <Head>Your agents</Head>
        <p className="px-4 pb-2.5 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">
          You have no agents yet. An agent checks your stocks after every market close and reports here when one needs you.{" "}
          <Link href="/agents" prefetch={false} className={WATCH_LINK}>
            Set one up
          </Link>
        </p>
      </section>
    );
  }

  const { lines, paused, sharedDay, next } = agentLines(loaded.value, today, { describe: describeWatch });
  return (
    <section aria-labelledby="briefing-agents-label" className={CARD}>
      <Head manage>Your agents</Head>
      {lines.length === 0 ? (
        <p className="px-4 pb-2.5 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">
          {paused === 1 ? "Your one agent is paused, so nothing is being checked." : `All ${paused} of your agents are paused, so nothing is being checked.`}
        </p>
      ) : (
        <>
          <ul className={`${AGENT_LIST} border-t border-oa-border`}>
            {lines.map((line) => (
              <AgentRow key={line.id} line={line} showDay={!sharedDay} />
            ))}
          </ul>
          <AgentFoot sharedDay={sharedDay} nextWords={next ? nextCheckWords(next, today) : null} paused={paused} />
        </>
      )}
    </section>
  );
}

export function BriefingAgentsGhost() {
  return (
    <div aria-hidden="true" className={`${CARD} px-4 py-3`}>
      <Bar className="h-3 w-24" />
      {[0, 1].map((row) => (
        <div key={row} className="mt-3.5 flex items-center gap-2.5">
          <Bar className="size-4" />
          <Bar className="h-3.5 flex-1" />
          <Bar className="h-3.5 w-16" />
        </div>
      ))}
    </div>
  );
}
