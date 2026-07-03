import Link from "next/link";
import { AnimatedIcon } from "@/components/animated-icon";
import type { EarningsIntelDoc, EarningsIntelScenario } from "@/lib/earnings-intel";
import { mergeIntelScenarios } from "@/lib/earnings-scenario-weights";
import { isMissingActualEarningsCopy } from "@/lib/earnings-facts";
import { cleanEarningsProse } from "@/lib/pre-earnings-intel-shared";

function formatEventDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

type CaseName = EarningsIntelScenario["case"];

const CASE_META: Record<CaseName, { label: string; color: string; soft: string; text: string }> = {
  bull: { label: "Bull", color: "#10b981", soft: "color-mix(in srgb, var(--signal-bullish) 14%, var(--surface))", text: "#10b981" },
  base: { label: "Base", color: "#0052ff", soft: "color-mix(in srgb, #2563eb 14%, var(--surface))", text: "#3b82f6" },
  bear: { label: "Bear", color: "#ef4444", soft: "color-mix(in srgb, var(--signal-bearish) 14%, var(--surface))", text: "#ef4444" },
};

function orderedScenarios(doc: EarningsIntelDoc): EarningsIntelScenario[] {
  return mergeIntelScenarios(doc);
}

function leadCase(scenarios: EarningsIntelScenario[]) {
  if (!scenarios.length) return null;
  return [...scenarios].sort((a, b) => b.probability_pct - a.probability_pct)[0];
}

type FactItem = { icon: string; label: string; value: string };

function factItems(facts: EarningsIntelDoc["report"]["facts"]): FactItem[] {
  if (!facts) return [];
  const out: FactItem[] = [];
  const price = facts.price_reaction?.trim();
  const guidance = facts.guidance_signal?.trim();
  const reported = facts.reported_vs_expected?.trim();
  if (price) out.push({ icon: "show_chart", label: "Price reaction", value: price });
  if (guidance) out.push({ icon: "flag", label: "Guidance signal", value: guidance });
  if (reported && !isMissingActualEarningsCopy(reported)) {
    out.push({ icon: "analytics", label: "Reported vs expected", value: reported });
  }
  return out.slice(0, 3);
}

type Props = {
  doc: EarningsIntelDoc;
  ticker: string;
};

export function StockEarningsTab({ doc, ticker }: Props) {
  const confidence = doc.report?.confidence?.score_0_100;
  const scenarios = orderedScenarios(doc);
  const lead = leadCase(scenarios);
  const totalPct = scenarios.reduce((sum, s) => sum + Math.max(0, s.probability_pct), 0) || 1;
  const facts = factItems(doc.report?.facts);
  const holders = doc.report?.decision_guide?.for_holders?.trim();
  const watchers = doc.report?.decision_guide?.for_watchers?.trim();

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-on-surface-variant">
          <span className="font-semibold text-on-surface">After earnings</span>
          <span>Reported {formatEventDate(doc.event_date)}</span>
          {confidence != null && Number.isFinite(confidence) ? (
            <span className="tabular-nums font-semibold text-on-surface">
              {Math.round(confidence)}% confidence
            </span>
          ) : null}
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="text-xl md:text-2xl font-semibold tracking-tight text-on-surface leading-snug">
            {cleanEarningsProse(doc.report?.headline || `${ticker} earnings update`)}
          </h3>
          <p className="text-base leading-relaxed text-on-surface">
            {cleanEarningsProse(
              doc.report?.summary || "What happened, what it means, and what to do next.",
            )}
          </p>
        </div>

        {facts.length ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {facts.map((f) => (
              <div
                key={f.label}
                className="rounded-xl bg-surface-container-low p-4 flex flex-col gap-2"
              >
                <div className="flex items-center gap-1.5 text-on-surface-variant">
                  <AnimatedIcon name={f.icon} size={16} />
                  <span className="text-[11px] font-semibold uppercase tracking-widest">
                    {f.label}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-on-surface">{cleanEarningsProse(f.value)}</p>
              </div>
            ))}
          </div>
        ) : null}

        {scenarios.length ? (
          <div className="rounded-xl bg-surface p-4 flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                Scenario odds · next 30–90d
              </span>
              {lead ? (
                <span
                  className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize"
                  style={{ background: CASE_META[lead.case].soft, color: CASE_META[lead.case].text }}
                >
                  {CASE_META[lead.case].label} case leads · {Math.round(lead.probability_pct)}%
                </span>
              ) : null}
            </div>

            <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-container">
              {scenarios.map((s) => (
                <div
                  key={s.case}
                  className="h-full"
                  style={{
                    width: `${(Math.max(0, s.probability_pct) / totalPct) * 100}%`,
                    background: lead?.case === s.case ? CASE_META[s.case].color : "#d1d5db",
                  }}
                  aria-label={`${CASE_META[s.case].label} ${Math.round(s.probability_pct)}%`}
                />
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {scenarios.map((s) => {
                const meta = CASE_META[s.case];
                const isLead = lead?.case === s.case;
                return (
                  <div
                    key={s.case}
                    className="rounded-lg p-3 flex flex-col gap-1.5"
                    style={{
                      background: isLead ? meta.soft : "var(--surface-container-low)",
                      border: `1px solid ${isLead ? meta.color : "var(--surface-container-high)"}`,
                    }}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide"
                        style={{ color: isLead ? meta.text : "var(--on-surface-variant)" }}
                      >
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ background: isLead ? meta.color : "#d1d5db" }}
                        />
                        {meta.label}
                      </span>
                      <span className="text-lg font-semibold tabular-nums text-on-surface">
                        {Math.round(s.probability_pct)}%
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed text-on-surface-variant">{s.thesis}</p>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {(holders || watchers) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {holders ? (
              <div className="rounded-xl bg-surface-container-low p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                  If you hold
                </p>
                <p className="mt-2 text-sm font-medium leading-relaxed text-on-surface">
                  {cleanEarningsProse(holders)}
                </p>
              </div>
            ) : null}
            {watchers ? (
              <div className="rounded-xl bg-surface-container-low p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-on-surface-variant">
                  If you&apos;re watching
                </p>
                <p className="mt-2 text-sm font-medium leading-relaxed text-on-surface">
                  {cleanEarningsProse(watchers)}
                </p>
              </div>
            ) : null}
          </div>
        )}

        <Link
          href={`/earnings-intel/${encodeURIComponent(ticker)}`}
          className="inline-flex h-11 w-full sm:w-auto items-center justify-center gap-1.5 rounded-full bg-on-surface px-6 text-sm font-semibold text-white transition-transform hover:-translate-y-px"
        >
          Read full earnings intel
          <AnimatedIcon name="arrow_forward" size={18} />
        </Link>
      </div>

      <p className="text-xs text-on-surface-variant">
        AI-generated post-earnings analysis · not investment advice
      </p>
    </section>
  );
}
