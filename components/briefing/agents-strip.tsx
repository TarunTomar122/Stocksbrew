import Link from "next/link";

import { WATCH_FOCUS, WATCH_LINK, WATCH_LIST, WatchRow, soonestNext } from "@/components/agent-watch/watch-list";
import { Bar } from "@/components/oa/kit/skeleton";
import { activeWatches, nextCheckWords } from "@/lib/agent-watch";
import { loadWatches } from "@/lib/agent-watch-server";
import { ASK_MAX_QUESTION_CHARS } from "@/lib/ask-config";
import type { AgentsSource } from "@/lib/portfolio-home/log";
import type { Loaded } from "@/lib/portfolio-home/pick";
import { countWord } from "@/lib/read-format";

/**
 * The briefing's strip of ongoing work: the signed-in person's active watches
 * with their latest outcomes, and an Ask box that opens Ask on their portfolio
 * (ctx "portfolio", lib/ask-context.ts). Signed out it is only an Ask box on
 * the market and a line about agents: the signed-out briefing is one cached
 * page for everyone (app/(app)/anon/[v]/briefing), so it never reads a cookie
 * or anyone's data. Server components; the watches are one small read with
 * its own time limit (lib/agent-watch-server.ts), streamed in their own
 * Suspense, and nothing here calls a model.
 */

const CARD = "oa-surface min-w-0 overflow-hidden border border-oa-border bg-oa-card";

function AskForm({ portfolio, placeholder }: { portfolio: boolean; placeholder: string }) {
  return (
    <form action="/ask" method="get" role="search" className="flex gap-2">
      <label htmlFor="briefing-ask" className="sr-only">
        Your question
      </label>
      <input
        id="briefing-ask"
        name="q"
        type="text"
        required
        maxLength={ASK_MAX_QUESTION_CHARS}
        autoComplete="off"
        placeholder={placeholder}
        className={`h-10 min-w-0 flex-1 rounded border border-oa-border bg-oa-bg px-3 text-[14px] text-oa-fg placeholder:text-oa-muted-fg ${WATCH_FOCUS}`}
      />
      {portfolio ? <input type="hidden" name="ctx" value="portfolio" /> : null}
      <button
        type="submit"
        className={`inline-flex h-10 shrink-0 cursor-pointer items-center rounded border border-oa-primary bg-oa-primary px-4 text-[14px] font-medium text-oa-primary-fg transition-[filter] hover:brightness-110 ${WATCH_FOCUS}`}
      >
        Ask
      </button>
    </form>
  );
}

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

/** The flagged stocks that have their own line in today's briefing, each a jump to it. */
function BriefingAnchors({ tickers, inBriefing }: { tickers: string[]; inBriefing: ReadonlySet<string> }) {
  const here = tickers.filter((ticker) => inBriefing.has(ticker)).slice(0, 4);
  if (here.length === 0) return null;
  return (
    <p className="mt-0.5 text-[12.5px] leading-[17px] text-oa-muted-fg">
      In today&apos;s briefing:{" "}
      {here.map((ticker, index) => (
        <span key={ticker}>
          {index > 0 ? ", " : null}
          <a href={`#brief-${ticker}`} className={`oa-mono ${WATCH_LINK}`}>
            {ticker}
          </a>
        </span>
      ))}
    </p>
  );
}

type StripProps = {
  /** New York day, YYYY-MM-DD. */
  today: string;
  /** Tickers with their own card in today's briefing (each card's id is `brief-<ticker>`). */
  inBriefing: string[];
  /** The person tracks stocks, so Ask can start from their portfolio. */
  portfolio: boolean;
};

/** Signed in: the person's active watches and their latest outcomes, then Ask on their portfolio. */
export async function BriefingAgentsStrip({ uid, ...props }: StripProps & { uid: string }) {
  const loaded = await loadWatches(uid, props.today);
  return <BriefingAgentsCard loaded={loaded} {...props} />;
}

/** The strip itself, from the watches once they are read. */
export function BriefingAgentsCard({ loaded, today, inBriefing, portfolio }: StripProps & { loaded: Loaded<AgentsSource> }) {
  const anchors = new Set(inBriefing);
  const ask = <AskForm portfolio={portfolio} placeholder={portfolio ? "Ask about your stocks" : "Ask about any US stock"} />;

  if (loaded.state !== "ready") {
    return (
      <section aria-labelledby="briefing-agents-label" className={CARD}>
        <Head>Your agents</Head>
        <p className="px-4 pb-2 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">
          We could not read your agents just now. Reload in a minute.
        </p>
        <div className="border-t border-oa-border px-4 py-3">{ask}</div>
      </section>
    );
  }

  const { rows, paused } = activeWatches(loaded.value, today);
  const next = soonestNext(rows);
  const none = loaded.value.jobs.length === 0;
  return (
    <section aria-labelledby="briefing-agents-label" className={CARD}>
      <Head manage={!none}>Your agents</Head>
      {none ? (
        <p className="px-4 pb-2.5 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">
          You have no agents yet. An agent checks your stocks after every market close and reports here when something needs you.{" "}
          <Link href="/agents" prefetch={false} className={WATCH_LINK}>
            Set one up
          </Link>
          .
        </p>
      ) : rows.length === 0 ? (
        <p className="px-4 pb-2.5 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">
          {paused === 1 ? "Your one agent is paused, so nothing is being checked." : `All ${countWord(paused).toLowerCase()} of your agents are paused, so nothing is being checked.`}
        </p>
      ) : (
        <>
          <ul className={WATCH_LIST}>
            {rows.map((row) => (
              <WatchRow
                key={row.id}
                row={row}
                today={today}
                showNext={false}
                extra={row.last && row.last.tickers.length > 0 ? <BriefingAnchors tickers={row.last.tickers} inBriefing={anchors} /> : null}
              />
            ))}
          </ul>
          {next || paused > 0 ? (
            <p className="border-t border-oa-border px-4 py-2 text-pretty text-[12.5px] leading-[18px] text-oa-muted-fg">
              {next ? `The next check is ${nextCheckWords(next, today)}.` : null}
              {next && paused > 0 ? " " : null}
              {paused > 0 ? (paused === 1 ? "One more is paused." : `${countWord(paused)} more are paused.`) : null}
            </p>
          ) : null}
        </>
      )}
      <div className="border-t border-oa-border px-4 py-3">{ask}</div>
    </section>
  );
}

export function BriefingAgentsGhost() {
  return (
    <div aria-hidden="true" className={`${CARD} px-4 py-3`}>
      <Bar className="h-3 w-24" />
      <Bar className="mt-3 h-3.5 w-full" />
      <Bar className="mt-1.5 h-3 w-2/3" />
      <Bar className="mt-4 h-10 w-full" />
    </div>
  );
}

/** Signed out: Ask on the market, and the one line about agents. Static, the same for every visitor. */
export function BriefingAskStrip() {
  return (
    <section aria-label="Ask about the market" className={`${CARD} px-4 py-3`}>
      <AskForm portfolio={false} placeholder="Ask about the market or any US stock" />
      <p className="mt-2 text-pretty text-[13px] leading-5 text-oa-muted-fg">
        Want a heads-up when a stock you follow moves, files a report or nears earnings?{" "}
        <Link href="/agents" prefetch={false} className={WATCH_LINK}>
          Set up an agent
        </Link>{" "}
        and it reports here after every market close.
      </p>
    </section>
  );
}
