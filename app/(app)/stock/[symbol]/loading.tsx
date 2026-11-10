import { interTight } from "@/components/oa/font";
import { StockReportSkeleton } from "@/components/stock-report/skeleton";

/** Route-level fallback. Same frame as the page so the skeleton sits on paper, not on a transparent background. */
export default function StockLoading() {
  return (
    <main className={`oa-landing ${interTight.variable} min-w-0 flex-grow overflow-x-clip`}>
      <StockReportSkeleton />
    </main>
  );
}
