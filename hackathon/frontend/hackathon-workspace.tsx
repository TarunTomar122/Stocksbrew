"use client";

import { useState, useCallback } from "react";
import { seedEvidence, seedScore, seedThesis } from "../seed";
import type { ThesisDraft, ThesisScore } from "../types";
import { ThesisInput } from "./thesis-input";
import { ThesisStructure } from "./thesis-structure";
import { DailyScore } from "./daily-score";
import { EvidenceTimeline } from "./evidence-timeline";
import { PortfolioImpact } from "./portfolio-impact";

const DEFAULT_HISTORY: { date: string; score: number }[] = [
  { date: "May 11", score: 0.69 },
  { date: "May 14", score: 0.64 },
  { date: "May 17", score: 0.72 },
  { date: "May 19", score: 0.78 },
  { date: "May 21", score: 0.76 },
];

function buildPortfolioImpact(
  thesis: ThesisDraft,
  score: ThesisScore,
) {
  const hasRisks = thesis.riskTickers.length > 0;
  const overall = score.overallConfidence;
  return {
    allocation: 18.0,
    allocationChange: "1.8",
    contribution: (overall * 14).toFixed(1),
    contributionLabel: "12m idea P/L contribution",
    riskExposure: hasRisks && overall < 0.55 ? "high" : overall < 0.7 ? "moderate" : "low",
    correlatedAssets: [...thesis.beneficiaryTickers, ...thesis.riskTickers],
    notes:
      overall >= 0.7
        ? "Thesis conviction is strong. Demand and supply signals remain aligned. Monitor competition and regulation drivers for early signs of drift."
        : overall >= 0.45
          ? "Mixed signals on this thesis. Some drivers are weakening. Review disproof conditions and consider reducing position if confidence drops further."
          : "Thesis confidence is low. Multiple disproof conditions may be triggered. Review your position sizing and consider whether the thesis remains investable.",
  };
}

type Props = {
  defaultRawText?: string;
};

export function HackathonWorkspace({ defaultRawText = "" }: Props) {
  const [rawText, setRawText] = useState(defaultRawText || seedThesis.rawText);
  const [thesis, setThesis] = useState<ThesisDraft>(seedThesis);
  const [score, setScore] = useState<ThesisScore>(seedScore);
  const [history, setHistory] = useState(DEFAULT_HISTORY);
  const [isCompiling, setIsCompiling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCompile = useCallback(async (text: string) => {
    setIsCompiling(true);
    setError(null);
    try {
      const res = await fetch("/api/hackathon/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText: text }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      const data = await res.json();
      setThesis(data.thesis);
      setScore(data.score);
      setRawText(text);
      setHistory(
        DEFAULT_HISTORY.map((point, index) =>
          index === DEFAULT_HISTORY.length - 1
            ? { ...point, score: data.score.overallConfidence }
            : point,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to compile thesis.");
    } finally {
      setIsCompiling(false);
    }
  }, []);

  const portfolio = buildPortfolioImpact(thesis, score);

  return (
    <div className="flex flex-col gap-10 md:gap-12">
      <header className="max-w-3xl">
        <span className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[#6b7280]">
          Hackathon · Thesis Tracker
        </span>
        <h1 className="mt-2 text-[30px] sm:text-[36px] lg:text-[42px] font-semibold tracking-[-0.04em] text-[#111111] leading-[1.08]">
          Thesis Drift Agent
        </h1>
        <p className="mt-3 text-[15px] text-[#6b7280] leading-[1.65]">
          Enter an investment thesis below. The agent compiles it into
          structured drivers, tracks evidence over time, and scores conviction
          daily.
        </p>
      </header>

      <section
        aria-labelledby="thesis-input-heading"
        className="border-b border-[#e5e7eb] pb-8 md:pb-10"
      >
        <ThesisInput
          defaultValue={rawText}
          onCompile={handleCompile}
          isCompiling={isCompiling}
        />
        {error && (
          <p
            role="alert"
            className="mt-3 text-[13px] text-[#dc2626] leading-snug"
          >
            {error}
          </p>
        )}
      </section>

      <section
        aria-label="Thesis analysis"
        className="grid grid-cols-1 lg:grid-cols-12 lg:gap-x-10 xl:gap-x-14"
      >
        <div className="lg:col-span-8 flex flex-col min-w-0">
          <div className="pb-8 md:pb-10 lg:pb-12 border-b border-[#e5e7eb] lg:border-b-0">
            <p className="mb-5 text-[10px] font-semibold tracking-[0.16em] uppercase text-[#9ca3af]">
              Compiled output
            </p>
            <ThesisStructure thesis={thesis} />
          </div>

          <div className="pt-8 md:pt-10 lg:pt-12 lg:border-t lg:border-[#e5e7eb]">
            <EvidenceTimeline evidence={seedEvidence} />
          </div>
        </div>

        <aside
          aria-label="Conviction and portfolio"
          className="lg:col-span-4 flex flex-col min-w-0 mt-10 lg:mt-0 pt-10 lg:pt-0 border-t lg:border-t-0 lg:border-l border-[#e5e7eb] lg:pl-10 xl:pl-12"
        >
          <div className="flex flex-col gap-8 md:gap-10 lg:sticky lg:top-8 lg:self-start">
            <DailyScore
              score={score}
              drivers={thesis.drivers}
              history={history}
            />
            <div className="border-t border-[#e5e7eb] pt-8 md:pt-10">
              <PortfolioImpact {...portfolio} />
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
