import { getCurrentMarket } from "@/lib/market";
import { getHeatList, type HeatList } from "@/lib/heat";
import { getDivergenceList, type DivergenceList } from "@/lib/divergence";
import { HeatListView } from "@/components/heat-list";
import { DivergenceListView } from "@/components/divergence-list";
import { getSessionUser } from "@/lib/auth-server";
import { getUserDoc, resolveIsSubscribed } from "@/lib/watchlist";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Heat List",
  description:
    "Today's heat read — overheated, breakout, news-spike, and catalyst-watch setups across the watch universe. Find stocks showing unusual volume, RSI extremes, and breakout signals.",
  alternates: { canonical: "/heat" },
  openGraph: {
    title: "Heat List — Hot Stocks & Breakouts · Tikrr",
    description: "Today's heat read — overheated, breakout, news-spike, and catalyst-watch setups across the watch universe.",
    url: "https://tikrr.com/heat",
  },
  twitter: {
    title: "Heat List — Hot Stocks & Breakouts · Tikrr",
    description: "Today's heat read — overheated, breakout, news-spike, and catalyst-watch setups across the watch universe.",
  },
};

function formatGeneratedAt(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function HeatPage() {
  const market = getCurrentMarket();
  const session = await getSessionUser();
  const userDoc = session ? await getUserDoc(session.uid).catch(() => null) : null;
  const isSubscribed = resolveIsSubscribed(userDoc);
  const trackedIds: string[] = Array.isArray(userDoc?.tracked_stocks)
    ? userDoc.tracked_stocks.filter((id): id is string => typeof id === "string")
    : [];

  let data: HeatList | null = null;
  let divergence: DivergenceList | null = null;
  try {
    [data, divergence] = await Promise.all([
      getHeatList(market),
      getDivergenceList(market),
    ]);
  } catch (err) {
    console.error("[heat] load failed:", err);
  }

  const generatedAt = formatGeneratedAt(data?.generated_at);
  const divergenceGeneratedAt = formatGeneratedAt(divergence?.generated_at);

  return (
    <main className="flex-grow bg-[#fafafa]">
      <div className="mx-auto w-full max-w-screen-2xl px-6 md:px-10 lg:px-16 py-10 flex flex-col gap-10">
        <header className="flex items-end justify-between gap-6 flex-wrap">
          <div className="flex flex-col gap-3 max-w-2xl">
            <h1 className="text-[28px] md:text-[34px] font-semibold tracking-[-0.025em] text-[#111111]">
              Heat
            </h1>
            <p className="text-[15px] md:text-[16px] leading-relaxed text-[#374151]">
              Today’s loudest qualifying stock setups, sorted into{" "}
              <span className="font-semibold text-[#c2410c]">overheated</span>,{" "}
              <span className="font-semibold text-[#047857]">breakouts</span>,{" "}
              <span className="font-semibold text-[#7c3aed]">news spikes</span>, and{" "}
              <span className="font-semibold text-[#92400e]">catalyst windows</span>.
            </p>
          </div>
          {generatedAt && (
            <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[#9ca3af]">
              Updated {generatedAt} · {market}
            </span>
          )}
        </header>

        <HeatListView data={data} trackedIds={trackedIds} isSubscribed={isSubscribed} />

        {/* Divergences only render when the backend has rows worth showing. */}
        {divergence && Array.isArray(divergence.rows) && divergence.rows.length > 0 && (
          <section className="flex flex-col gap-4">
            <div className="flex items-end justify-between gap-3 flex-wrap">
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#0052ff]">
                  Divergences
                </span>
                <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-[#111111]">
                  Where price and signal disagree
                </h2>
                <p className="text-[13px] text-[#6b7280] max-w-2xl">
                  Stocks where news velocity, sentiment, or technicals are pulling
                  in a different direction than the tape.
                </p>
              </div>
              {divergenceGeneratedAt && (
                <span className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[#9ca3af]">
                  Updated {divergenceGeneratedAt}
                </span>
              )}
            </div>
            <DivergenceListView data={divergence} />
          </section>
        )}

        <footer className="text-[11px] text-[#9ca3af]">
          Heat score 0-100 · not investment advice.
        </footer>
      </div>
    </main>
  );
}
