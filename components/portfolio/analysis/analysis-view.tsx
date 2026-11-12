import { LockCard } from "@/components/oa/gate";
import type { Plan } from "@/lib/entitlements";
import type { PortfolioAnalysis } from "@/lib/portfolio-analysis/types";
import { joinList } from "@/lib/xray";

import { Concentration } from "./concentration";
import { Crashes } from "./crashes";
import { AgainstTheMarket, MadeTheMoney } from "./money";
import { Overlap } from "./overlap";
import { SectionNav, type SectionLink } from "./section-nav";
import { Ahead } from "./soon";
import { Swings } from "./swings";
import { Together } from "./together";

/**
 * Analysis (/portfolio/xray): the analysis of a mix, one module after another, each hidden when it has
 * nothing to show. It opens on how the money sits. On Free the deeper modules are never sent; one card says what
 * they would show, right under the free figures.
 */
export function AnalysisView({ analysis, plan, trialEligible }: { analysis: PortfolioAnalysis; plan: Plan; trialEligible: boolean }) {
  const example = analysis.mode === "example";
  const note = analysis.partial
    ? "Part of this could not load just now. Refresh in a minute."
    : analysis.basis === "count"
      ? "No share counts yet, so every holding counts the same."
      : analysis.unvalued.length > 0
        ? `${joinList(analysis.unvalued.slice(0, 4))}${analysis.unvalued.length > 4 ? ` and ${analysis.unvalued.length - 4} more` : ""} ${analysis.unvalued.length === 1 ? "has" : "have"} no shares entered and ${analysis.unvalued.length === 1 ? "is" : "are"} left out.`
        : null;
  const locked = analysis.locked;
  const together = analysis.correlation && (analysis.correlation.groups.length > 0 || analysis.correlation.order.length >= 3) ? analysis.correlation : null;
  // The heatmap keeps its heaviest names when it has to fold.
  const weights = analysis.risk ? Object.fromEntries(analysis.risk.shares.map((share) => [share.ticker, share.weight])) : undefined;
  const ahead = Boolean(analysis.earnings || analysis.calls || analysis.income);
  const links: SectionLink[] = [
    analysis.concentration ? { id: "concentration", label: "Spread" } : null,
    analysis.risk ? { id: "swings", label: "Swings" } : null,
    together ? { id: "together", label: "Together" } : null,
    analysis.overlap ? { id: "overlap", label: "Funds" } : null,
    analysis.crashes ? { id: "crashes", label: "Shocks" } : null,
    analysis.attribution ? { id: "made", label: "Returns" } : null,
    analysis.lean ? { id: "against", label: "Mix" } : null,
    ahead ? { id: "ahead", label: "Ahead" } : null,
  ].filter((link): link is SectionLink => link !== null);
  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      {/* Only worth a row of links when there is more than a screen to move through. */}
      {links.length >= 4 ? <SectionNav links={links} /> : null}
      {note ? <p className="-mb-3 px-2 text-[13px] leading-[18px] text-oa-muted-fg sm:px-0 lg:-mb-5">{note}</p> : null}
      {analysis.concentration ? <Concentration module={analysis.concentration} example={example} /> : null}
      {locked && !example ? (
        <LockCard
          feature="portfolio_analysis_deep"
          plan={plan}
          trialEligible={trialEligible}
          title={
            locked.funds.length > 0
              ? `Open ${locked.funds.length <= 2 ? joinList(locked.funds) : "your funds"} and see what drives your money`
              : undefined
          }
          // Free has no crash module, so links to #crashes (the old stress test's address) land here.
          id="crashes"
          className="scroll-mt-28 lg:scroll-mt-16"
        />
      ) : null}
      {analysis.risk ? <Swings module={analysis.risk} /> : null}
      {together ? <Together module={together} weights={weights} example={example} /> : null}
      {analysis.overlap ? <Overlap module={analysis.overlap} example={example} /> : null}
      {analysis.crashes ? <Crashes module={analysis.crashes} /> : null}
      {analysis.attribution ? <MadeTheMoney module={analysis.attribution} /> : null}
      {analysis.lean ? <AgainstTheMarket module={analysis.lean} example={example} /> : null}
      <Ahead earnings={analysis.earnings} calls={analysis.calls} income={analysis.income} example={example} showUpsell={!example && plan !== "pro"} />
    </div>
  );
}
