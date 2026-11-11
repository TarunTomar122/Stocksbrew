import type { Metadata } from "next";

import { BasketForm, CannotList, ExampleChips } from "@/components/baskets-plain/parts";
import { AppPage, Delta, NUM, PageHead, Panel, fmtDay } from "@/components/oa/kit";
import { readFollowedBaskets, sinceFollow } from "@/lib/baskets-plain/follow";
import { BASKET_BENCHMARK } from "@/lib/baskets-plain/server";
import { parseBasketRequest, settleLeftover, type BasketCannot } from "@/lib/baskets-plain/parse";
import { isEmptySpec, specSentence } from "@/lib/baskets-plain/spec";
import { getViewer } from "@/lib/entitlements-server";
import { getScreenerRows } from "@/lib/screener";
import { getUserDoc } from "@/lib/watchlist";
import { JsonLd } from "@/components/docs/json-ld";
import { toolPageLd, toolPageMetadata } from "@/lib/seo/tool-pages";
import Link from "next/link";

export const dynamic = "force-dynamic";

type Props = { searchParams: Record<string, string | string[] | undefined> };

export function generateMetadata({ searchParams }: Props): Metadata {
  const asked = typeof searchParams.q === "string" && searchParams.q.trim().length > 0;
  // A typed request is somebody's search, not a page of its own.
  return { ...toolPageMetadata("/baskets/new"), ...(asked ? { robots: { index: false, follow: false } } : {}) };
}

async function YourBaskets({ uid }: { uid: string }) {
  const doc = await getUserDoc(uid).catch(() => null);
  const followed = readFollowedBaskets(doc).slice().reverse();
  if (followed.length === 0) return null;
  const symbols = [...new Set([BASKET_BENCHMARK, ...followed.flatMap((entry) => entry.members.map((member) => member.symbol))])];
  const rows = await getScreenerRows(symbols).catch(() => new Map());
  const bench = rows.get(BASKET_BENCHMARK) ?? null;
  return (
    <Panel flush label="Baskets you follow" right={<span>Price change since you followed, dividends not counted</span>} className="mt-5">
      <ul>
        {followed.map((entry) => {
          const since = sinceFollow(entry, rows, bench);
          const gap = since.pct !== null && since.benchmarkPct !== null ? since.pct - since.benchmarkPct : null;
          return (
            <li key={entry.slug} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-oa-border px-4 py-3 last:border-0">
              <div className="min-w-0">
                <Link prefetch={false} href={`/baskets/${entry.slug}`} className="text-[14.5px] font-medium text-oa-fg hover:underline">
                  {entry.title}
                </Link>
                <p className="text-[12.5px] leading-[18px] text-oa-muted-fg">
                  Followed {fmtDay(entry.followed_at, true)} with {entry.members.length} {entry.members.length === 1 ? "stock" : "stocks"}
                  {since.priced < since.total ? `; ${since.total - since.priced} no longer ${since.total - since.priced === 1 ? "has a price" : "have prices"}, so the change counts ${since.priced}` : ""}
                </p>
              </div>
              <p className={`${NUM} text-[13.5px] text-oa-muted-fg`}>
                <Delta value={since.pct} digits={1} className="text-[15px]" />
                {gap !== null ? ` · ${gap >= 0 ? "+" : "−"}${Math.abs(gap).toFixed(1)} pts vs S&P 500` : ""}
              </p>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

const WHY: Record<string, string> = {
  empty: "I couldn't turn that into a rule we can screen on.",
  limit: "That is a lot of baskets for one day. The count resets at midnight UTC, and every basket you already built still opens.",
  unavailable: "I read the request but could not save the basket just now. Try again in a minute.",
};

export default async function NewBasketPage({ searchParams }: Props) {
  const viewer = await getViewer();
  const raw = typeof searchParams.q === "string" ? searchParams.q.trim().slice(0, 200) : "";

  const why = typeof searchParams.why === "string" ? searchParams.why : "";

  // /api/baskets/build sends people back here when it could not build a basket. The rules reading is shown
  // again (it is pure and costs nothing), so the person sees what was understood and what was not.
  let problem: { message: string; lines: BasketCannot[]; read: string | null } | null = null;
  if (raw && why) {
    const parse = settleLeftover(parseBasketRequest(raw));
    problem = {
      message: WHY[why] ?? WHY.empty!,
      lines: parse.cannot,
      read: why !== "empty" && !isEmptySpec(parse.spec) ? specSentence(parse.spec) : null,
    };
  }

  return (
    <AppPage>
      <JsonLd data={toolPageLd("/baskets/new")} />
      <PageHead
        title="Build a basket in plain English"
        lede="Describe the stocks you want the way you would say it. We turn it into a rule over the stocks we cover, list every company that fits with the reason it is in, and test the basket against the S&P 500."
      />
      <Panel>
        <BasketForm value={raw} autoFocus={!raw} />
        {problem ? (
          <div role="alert" className="mt-3 border-t border-oa-border pt-3">
            <p className="text-[14.5px] font-medium leading-5 text-oa-fg">{problem.message}</p>
            {problem.read ? <p className="mt-1 text-[13.5px] leading-5 text-oa-muted-fg">What I understood: {problem.read}</p> : null}
            <CannotList items={problem.lines} className="mt-2" />
            <p className="mt-2 text-[13.5px] leading-5 text-oa-muted-fg">
              Name an industry or a theme (banks, chips, power, defense), a size (under $50B), or a number we hold (a dividend, sales growth, a P/E). Or start from one of these.
            </p>
          </div>
        ) : null}
        <p className="oa-label mt-4">Try one</p>
        <ExampleChips className="mt-2" />
      </Panel>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <Panel label="What it understands" fill>
          <p className="text-[13.5px] leading-5 text-oa-fg">
            Industries and themes from our research (AI, power, chips, banks, defense and 50 more), company size, P/E and “cheap”, sales and earnings growth, dividends and how long they have grown, momentum and distance from the high, debt, margins, analyst ratings and S&P 500 membership.
          </p>
        </Panel>
        <Panel label="What you get" fill>
          <p className="text-[13.5px] leading-5 text-oa-fg">
            The rule read back in one sentence, every company that fits with the numbers that put it there, and a backtest over the longest stretch our prices cover, with the biases that flatter it written out.
          </p>
        </Panel>
        <Panel label="What it will not do" fill>
          <p className="text-[13.5px] leading-5 text-oa-fg">
            It never adds a company because it sounds right. If part of your request is something we do not hold, it says so instead of guessing.
          </p>
        </Panel>
      </div>

      {viewer.uid ? <YourBaskets uid={viewer.uid} /> : null}

      <p className="mt-5 px-2 text-[13.5px] leading-5 text-oa-muted-fg sm:px-0">
        Prefer a basket our research wrote by hand?{" "}
        <Link prefetch={false} href="/themes" className="text-oa-fg underline decoration-oa-border underline-offset-4 hover:decoration-oa-primary">
          See the idea baskets
        </Link>
        .
      </p>
    </AppPage>
  );
}
