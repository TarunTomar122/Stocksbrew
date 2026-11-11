import type { Metadata } from "next";
import { Suspense } from "react";

import { AppPage, PageHead } from "@/components/oa/kit";
import { AgentLogGhost, AgentLogPanel, AskBox, AskGhost, ExampleLine, FocusCard, FocusGhost } from "@/components/portfolio-home/home";
import { loadPortfolioHome } from "@/lib/portfolio-home/server";
import { JsonLd } from "@/components/docs/json-ld";
import { toolPageLd, toolPageMetadata } from "@/lib/seo/tool-pages";

export const dynamic = "force-dynamic";

export const metadata: Metadata = toolPageMetadata("/portfolio");

const LEDE = "What changed in your stocks this week, what is coming up, and what you could do about it.";

/**
 * The My stocks overview. Every portfolio tool already writes its own read;
 * this page asks them all at once (lib/portfolio-home/server.ts), leads with
 * the few changes that need the person (lib/portfolio-home/focus.ts), each as
 * a small loop of evidence, a question for Ask and the watch on it (loop.ts),
 * offers more questions for Ask drawn from the holdings (questions.ts), and
 * keeps a short dated log of the other checks and what is coming up (log.ts).
 * Each part streams in as soon as its own sources answer.
 */
export default function PortfolioHomePage() {
  const load = loadPortfolioHome();
  return (
    <AppPage>
      <JsonLd data={toolPageLd("/portfolio")} />
      {/* Not `full`: on a phone the lede moves to the page note at the bottom, so the findings start higher. */}
      <PageHead title="My stocks" lede={LEDE} />
      <Suspense fallback={null}>
        <ExampleLine load={load} />
      </Suspense>
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_21rem] xl:grid-cols-[minmax(0,1fr)_23rem]">
        <Suspense fallback={<FocusGhost />}>
          <FocusCard load={load} />
        </Suspense>
        <div className="flex min-w-0 flex-col gap-4">
          <Suspense fallback={<AskGhost />}>
            <AskBox load={load} />
          </Suspense>
          <Suspense fallback={<AgentLogGhost />}>
            <AgentLogPanel load={load} />
          </Suspense>
        </div>
      </div>
    </AppPage>
  );
}
