import type { Metadata } from "next";
import Link from "next/link";
import { EarningsCalendar } from "@/components/earnings-calendar";
import { getSearchIndex } from "@/lib/search";
import { getCurrentMarket } from "@/lib/market";

export const metadata: Metadata = {
  title: "Earnings Calendar | tikrr",
  description: "Upcoming earnings reports for US stocks. See report dates, estimated EPS, and market expectations.",
  openGraph: {
    title: "Earnings Calendar | tikrr",
    description: "Upcoming earnings reports for US stocks. See report dates, estimated EPS, and market expectations.",
  },
};

export default async function EarningsPage() {
  const market = getCurrentMarket();
  const searchIndex = await getSearchIndex(market).catch(() => []);
  const universeTickers = new Set(searchIndex.map((e) => e.ticker.toUpperCase()));

  return (
    <main className="flex-grow">
      <div className="mx-auto w-full max-w-screen-xl px-6 py-12 md:px-10 lg:px-16 flex flex-col gap-8 items-center">
        <header className="flex flex-col gap-2 w-full max-w-[960px]">
          <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#6b7280]">
            Free tool
          </span>
          <h1 className="text-[36px] md:text-[44px] font-semibold tracking-[-0.03em] text-[#111111] leading-[1.1]">
            Earnings Calendar
          </h1>
          <p className="text-[16px] text-[#374151] leading-[1.55]">
            See which companies in our top 500 universe are reporting earnings this month. Covers pre-market, after-close, and during-market reports with EPS estimates at a glance.
          </p>
        </header>

        <EarningsCalendar universeTickers={universeTickers} />

        {/* Cross-link to Blog */}
        <div className="w-full max-w-[960px] rounded-2xl border border-[#e5e7eb] bg-[#f8f9fa] p-6 text-center">
          <p className="text-[14px] text-[#6b7280] mb-3">
            New to earnings tracking? Read our guide on <Link href="/blog/earnings-calendar-for-my-watchlist" className="text-[#0052ff] font-medium hover:underline">how to never miss earnings again</Link>.
          </p>
        </div>
      </div>
    </main>
  );
}
