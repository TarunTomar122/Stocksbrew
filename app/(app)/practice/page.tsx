import type { Metadata } from "next";
import Link from "next/link";

import { interTight } from "@/components/oa/font";
import { PageHead, PageNote } from "@/components/oa/kit";
import { OaSiteHeader } from "@/components/oa/oa-site-header";
import { PracticeDesk } from "@/components/practice/practice-desk";
import { PAGE_FRAME } from "@/components/strategies/shared";
import { getSessionUser } from "@/lib/auth-server";
import { getPracticeExample, getPracticePayload } from "@/lib/practice-store";
import { ogImage } from "@/lib/og/url";

const SHARE_IMAGE = ogImage(["page", "practice"], "Practice account with paper money");

export const metadata: Metadata = {
  title: "Practice account",
  description:
    "A $100,000 paper account for trying ideas without real money. Buy and sell US stocks and funds at the latest close and compare the result with the S&P 500.",
  alternates: { canonical: "/practice" },
  openGraph: { images: [SHARE_IMAGE] },
  twitter: { card: "summary_large_image", images: [SHARE_IMAGE] },
};

export const dynamic = "force-dynamic";

export default async function PracticePage() {
  const session = await getSessionUser();
  const payload = session ? await getPracticePayload(session.uid).catch(() => null) : await getPracticeExample().catch(() => null);

  const lede = (
    <>
      Trade US stocks with paper money. For past prices, use the{" "}
      <Link href="/backtest" className="text-oa-fg underline decoration-oa-border underline-offset-4 hover:decoration-oa-primary">
        backtester
      </Link>
      .
    </>
  );

  return (
    <main className={`oa-landing ${interTight.variable} min-w-0 flex-grow overflow-x-clip`}>
      <OaSiteHeader />
      <div className={PAGE_FRAME}>
        <PageHead note={false} title="Practice account" lede={lede} />
        {payload ? (
          <PracticeDesk initial={payload} mode={session ? "account" : "example"} />
        ) : (
          <div className="oa-surface border border-oa-border bg-oa-card px-4 py-8 text-center text-[15px] text-oa-muted-fg">
            Prices are unavailable right now. Try again in a few minutes.
          </div>
        )}
        <PageNote lede={lede} ledeInHead />
      </div>
    </main>
  );
}
