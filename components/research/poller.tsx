"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { ResearchProgress } from "@/components/research/progress";
import type { ResearchStep } from "@/lib/research/types";

/** A report opened while it is still being written: show the steps and reload when it is done. */
export function ResearchPoller({ ticker, reportKey, steps: initial, startedAt }: { ticker: string; reportKey: string; steps: ResearchStep[]; startedAt: string }) {
  const router = useRouter();
  const [steps, setSteps] = React.useState(initial);
  React.useEffect(() => {
    let stopped = false;
    const tick = async () => {
      try {
        const response = await fetch(`/api/research/report?ticker=${encodeURIComponent(ticker)}&key=${reportKey}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { status?: string; steps?: ResearchStep[] };
        if (stopped) return;
        if (Array.isArray(data.steps)) setSteps(data.steps);
        if (data.status && data.status !== "running") {
          stopped = true;
          router.refresh();
        }
      } catch {
        // try again on the next tick
      }
    };
    const timer = setInterval(tick, 3000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [ticker, reportKey, router]);
  return (
    <section aria-label="Research in progress" className="oa-surface border border-oa-border bg-oa-card px-4 py-4 sm:px-5">
      <p className="oa-label mb-2">Researching {ticker}</p>
      <ResearchProgress steps={steps} startedAt={Date.parse(startedAt)} />
      <p className="mt-3 border-t border-oa-border pt-2.5 text-[12.5px] leading-[18px] text-oa-muted-fg">This page opens the report as soon as it is saved.</p>
    </section>
  );
}
