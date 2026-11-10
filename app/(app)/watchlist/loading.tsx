import { interTight } from "@/components/oa/font";
import { PortfolioGhost } from "@/components/portfolio/portfolio-ghost";

/** Same frame as the page (it is narrower than the kit's), with the portfolio's own shape inside. */
export default function Loading() {
  return (
    <main className={`oa-landing ${interTight.variable} min-w-0 flex-grow overflow-x-clip`}>
      <div className="oa-page-frame mx-auto w-full max-w-[76rem] px-2 pb-24 pt-3 sm:px-6 sm:pt-5 lg:pb-10">
        <PortfolioGhost />
      </div>
    </main>
  );
}
