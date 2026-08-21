import Link from "next/link";

import { DemoRadar } from "@/components/demo-radar";
import { WatchlistMixPlanner } from "@/components/watchlist-mix-planner";
import { getSessionUser } from "@/lib/auth-server";
import { buildPortfolioBook } from "@/lib/portfolio-book";
import { loadRadarRowsForUser } from "@/lib/radar-rows";

export async function PortfolioRebalanceStream() {
  const session = await getSessionUser();
  if (!session) {
    return <DemoRadar />;
  }

  const payload = await loadRadarRowsForUser(session.uid);
  const rows = payload?.rows ?? [];
  const book = buildPortfolioBook(rows);
  const holdings = book.filter((row) => row.position_type === "holding");

  if (rows.length === 0) {
    return (
      <main className="flex-grow">
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-8 px-6 py-12 md:px-10 md:py-16 lg:px-12">
          <div className="rounded-[20px] border border-[#e5e7eb] bg-white p-10 text-center">
            <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#111111]">
              No stocks in Watchlist yet
            </p>
            <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-[#6b7280]">
              Add stocks to your Watchlist first, then browse them by sector here.
            </p>
            <Link
              href="/watchlist"
              className="mt-5 inline-flex items-center rounded-full bg-[#111111] px-4 py-2 text-[12px] font-semibold text-white hover:bg-black"
            >
              Back to Watchlist
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-grow">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-8 px-6 py-10 md:px-10 md:py-12 lg:px-12">
        {holdings.length > 0 ? <WatchlistMixPlanner rows={holdings} /> : (
          <section className="border-y border-[#e5e7eb] py-10">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6d3be8]">Portfolio distribution</p>
            <h2 className="mt-2 text-[24px] font-semibold tracking-[-0.025em] text-[#111111]">Add a holding to see your $1,000 distribution.</h2>
          </section>
        )}
      </div>
    </main>
  );
}
