import type { Metadata } from "next";
import Link from "next/link";

import { JsonLd } from "@/components/docs/json-ld";
import { AppPage, PageHead, SourceLine } from "@/components/oa/kit";
import { AnalysisView } from "@/components/portfolio/analysis/analysis-view";
import { ShareButton } from "@/components/share/share-button";
import { XraySignIn } from "@/components/xray/xray-sign-in";
import { loadAnalysisPage } from "@/lib/portfolio-analysis/load";
import { pricesWords } from "@/lib/portfolio-prices";
import { toolPageLd, toolPageMetadata } from "@/lib/seo/tool-pages";

export const dynamic = "force-dynamic";

export const metadata: Metadata = toolPageMetadata("/portfolio/xray");

/**
 * Analysis: the analysis of the holdings (lib/portfolio-analysis), the person's own when they have any and the
 * example otherwise. It took in the old x-ray (sectors and companies inside funds) and the stress test
 * (next.config.js sends /portfolio/stress to #crashes here).
 */
export default async function AnalysisPage() {
  const page = await loadAnalysisPage().catch((error) => {
    console.warn("[portfolio/xray] analysis failed:", error instanceof Error ? error.message : error);
    return null;
  });
  const analysis = page?.analysis ?? null;
  const example = analysis?.mode === "example";
  const prices = pricesWords(analysis?.pricesDay ?? null);
  const action = !analysis ? undefined : example ? (
    page?.reason === "signed-out" ? (
      <span className="text-[13px]">
        <XraySignIn>See your own</XraySignIn>
      </span>
    ) : (
      <Link href="/portfolio" className="text-[13px] font-medium text-oa-primary underline-offset-2 hover:underline">
        Add your holdings
      </Link>
    )
  ) : analysis.overlap ? (
    <ShareButton kind="xray" />
  ) : undefined;
  return (
    <AppPage width="dash">
      <JsonLd data={toolPageLd("/portfolio/xray")} />
      <PageHead
        title="Analysis"
        meta={analysis ? <SourceLine source={example ? "Example portfolio, made-up shares" : undefined} note={prices ? `prices from ${prices}` : undefined} /> : undefined}
        actions={action}
      />
      {analysis && page ? (
        <AnalysisView analysis={analysis} plan={page.plan} trialEligible={page.trialEligible} />
      ) : (
        <p className="px-2 text-[14px] text-oa-muted-fg sm:px-0">This is not available right now. Try again in a minute.</p>
      )}
    </AppPage>
  );
}
