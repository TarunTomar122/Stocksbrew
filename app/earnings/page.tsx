import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { EarningsCalendarStream } from "@/components/earnings-calendar-stream";

export const metadata: Metadata = {
  title: "Earnings Calendar | stocksbrew",
  description:
    "Upcoming earnings reports for US stocks. See report dates, estimated EPS, and market expectations.",
  alternates: { canonical: "/earnings" },
  openGraph: {
    title: "Earnings Calendar | stocksbrew",
    description:
      "Upcoming earnings reports for US stocks. See report dates, estimated EPS, and market expectations.",
    url: "https://www.stocksbrew.online/earnings",
  },
};

function EarningsCalendarSkeletonInline() {
  return <div className="h-[420px] w-full max-w-[960px] animate-pulse rounded-2xl bg-surface-container-low" />;
}

export default function EarningsPage() {
  return (
    <main className="flex-grow">
      <div className="mx-auto flex w-full max-w-screen-xl flex-col items-center gap-8 px-6 py-12 md:px-10 lg:px-16">
        <header className="flex w-full max-w-[960px] flex-col gap-2">
          <span className="text-[12px] font-semibold tracking-[0.14em] uppercase text-[#6b7280]">
            Free tool
          </span>
          <h1 className="text-[36px] font-semibold leading-[1.1] tracking-[-0.03em] text-[#111111] md:text-[44px]">
            Earnings Calendar
          </h1>
          <p className="text-[16px] leading-[1.55] text-[#374151]">
            See which companies are reporting earnings this month. Covers pre-market, after-close, and
            during-market reports with EPS estimates at a glance.
          </p>
        </header>

        <div className="w-full max-w-[960px]">
          <Suspense fallback={<EarningsCalendarSkeletonInline />}>
            <div className="landing-stream-in">
              <EarningsCalendarStream />
            </div>
          </Suspense>
        </div>

        <div className="w-full max-w-[960px] rounded-2xl border border-[#e5e7eb] bg-[#f8f9fa] p-6 text-center">
          <p className="mb-3 text-[14px] text-[#6b7280]">
            New to earnings tracking? Read our guide on{" "}
            <Link href="/blog/earnings-season-playbook" className="font-semibold text-[#111111] underline">
              navigating earnings season
            </Link>
            .
          </p>
        </div>
      </div>
    </main>
  );
}
