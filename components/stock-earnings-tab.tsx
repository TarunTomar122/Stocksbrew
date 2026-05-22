import Link from "next/link";
import type { EarningsIntelDoc, EarningsIntelScenario } from "@/lib/earnings-intel";

function formatEventDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function topScenario(scenarios: EarningsIntelScenario[] | undefined) {
  if (!scenarios?.length) return null;
  return [...scenarios].sort((a, b) => b.probability_pct - a.probability_pct)[0];
}

function scenarioChip(caseName: EarningsIntelScenario["case"]) {
  switch (caseName) {
    case "bull":
      return "bg-[#ecfdf5] text-[#10b981]";
    case "bear":
      return "bg-[#fef2f2] text-[#ef4444]";
    default:
      return "bg-[#eff6ff] text-[#0052ff]";
  }
}

type Props = {
  doc: EarningsIntelDoc;
  ticker: string;
};

export function StockEarningsTab({ doc, ticker }: Props) {
  const confidence = doc.report?.confidence?.score_0_100;
  const lead = topScenario(doc.report?.scenarios_30_90d);
  const holders = doc.report?.decision_guide?.for_holders?.trim();
  const watchers = doc.report?.decision_guide?.for_watchers?.trim();

  return (
    <section className="flex flex-col gap-6">
      <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5 md:p-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 text-sm text-[#6b7280]">
          <span className="font-semibold text-[#111111]">Post-earnings brief</span>
          <span className="text-[#d1d5db]">·</span>
          <span>Earnings {formatEventDate(doc.event_date)}</span>
          {confidence != null && Number.isFinite(confidence) ? (
            <>
              <span className="text-[#d1d5db]">·</span>
              <span className="tabular-nums font-semibold text-[#111111]">
                {Math.round(confidence)} confidence
              </span>
            </>
          ) : null}
        </div>

        <h3 className="text-xl md:text-2xl font-semibold tracking-tight text-[#111111] leading-snug">
          {doc.report?.headline || `${ticker} earnings update`}
        </h3>
        <p className="text-base leading-relaxed text-[#374151]">
          {doc.report?.summary || "Open the full report for facts, scenarios, and what to do next."}
        </p>

        {lead ? (
          <div className="rounded-xl border border-[#e5e7eb] bg-[#fafafa] p-4 flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-[#9ca3af]">
                Lead scenario · 30–90d
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${scenarioChip(lead.case)}`}
              >
                {lead.case} {Math.round(lead.probability_pct)}%
              </span>
            </div>
            <p className="text-sm leading-relaxed text-[#4b5563]">{lead.thesis}</p>
          </div>
        ) : null}

        {(holders || watchers) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {holders ? (
              <div className="rounded-xl border border-[#e5e7eb] bg-[#fafafa] p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-[#9ca3af]">
                  If you hold
                </p>
                <p className="mt-2 text-sm leading-relaxed text-[#374151]">{holders}</p>
              </div>
            ) : null}
            {watchers ? (
              <div className="rounded-xl border border-[#e5e7eb] bg-[#fafafa] p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-[#9ca3af]">
                  If you&apos;re watching
                </p>
                <p className="mt-2 text-sm leading-relaxed text-[#374151]">{watchers}</p>
              </div>
            ) : null}
          </div>
        )}

        <Link
          href={`/earnings-intel/${encodeURIComponent(ticker)}`}
          className="inline-flex h-11 w-full sm:w-auto items-center justify-center gap-1.5 rounded-full bg-[#111111] px-6 text-sm font-semibold text-white transition-transform hover:-translate-y-px"
        >
          Read full earnings intel
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
            arrow_forward
          </span>
        </Link>
      </div>

      <p className="text-xs text-[#9ca3af]">
        AI-generated post-earnings analysis · not investment advice
      </p>
    </section>
  );
}
