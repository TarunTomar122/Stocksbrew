import Link from "next/link";
import { StockLogo } from "@/components/stock-logo";
import type { EarningsIntelDoc } from "@/lib/earnings-intel";

function formatEventDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function factLines(doc: EarningsIntelDoc): string[] {
  const facts = doc.report?.facts;
  if (!facts) return [];
  const out: string[] = [];
  if (facts.reported_vs_expected?.trim()) out.push(facts.reported_vs_expected.trim());
  if (facts.guidance_signal?.trim()) out.push(facts.guidance_signal.trim());
  if (facts.price_reaction?.trim()) out.push(facts.price_reaction.trim());
  if (facts.post_earnings_narrative?.trim()) out.push(facts.post_earnings_narrative.trim());
  return out;
}

type Props = {
  docs: EarningsIntelDoc[];
};

export function RadarEarningsReadyBanner({ docs }: Props) {
  if (docs.length === 0) return null;

  const count = docs.length;
  const items = docs.slice(0, 3);
  const single = count === 1;
  const primary = items[0]!;
  const primaryFacts = factLines(primary);

  return (
    <div className="flex min-w-0 w-full flex-col rounded-xl border border-outline-variant bg-surface">
      <div className="flex items-baseline justify-between gap-2 border-b border-outline-variant/50 px-4 py-3">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-on-surface-variant">
          Earnings ready
        </p>
        <span className="shrink-0 font-mono text-[10px] tabular-nums text-on-surface-variant">This week</span>
      </div>

      {single ? (
        <Link
          href={`/earnings-intel/${encodeURIComponent(primary.ticker)}`}
          className="group flex flex-col gap-3 px-4 py-4 transition-colors hover:bg-surface-container-low"
        >
          <div className="flex items-center gap-2.5">
            <StockLogo ticker={primary.ticker} market={primary.market ?? "US"} size={28} className="shrink-0" />
            <div className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
              <span className="font-mono text-[14px] font-bold text-on-surface group-hover:text-[var(--accent-terminal)]">
                {primary.ticker}
              </span>
              <span className="shrink-0 font-mono text-[10px] tabular-nums text-on-surface-variant">
                {formatEventDate(primary.event_date)}
              </span>
            </div>
          </div>

          <p className="text-[13px] font-semibold leading-snug text-on-surface [overflow-wrap:anywhere]">
            {primary.report?.headline || "Post-earnings report ready"}
          </p>

          {primaryFacts.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {primaryFacts.map((line) => (
                <li
                  key={line}
                  className="text-[12px] leading-relaxed text-on-surface-variant [overflow-wrap:anywhere]"
                >
                  {line}
                </li>
              ))}
            </ul>
          ) : primary.report?.summary ? (
            <p className="text-[12px] leading-relaxed text-on-surface-variant [overflow-wrap:anywhere]">
              {primary.report.summary}
            </p>
          ) : null}

          <span className="font-mono text-[11px] font-semibold text-on-surface-variant group-hover:text-on-surface">
            Read report →
          </span>
        </Link>
      ) : (
        <ul className="flex flex-col divide-y divide-outline-variant/40">
          {items.map((doc) => {
            const lines = factLines(doc);
            return (
              <li key={doc.doc_id}>
                <Link
                  href={`/earnings-intel/${encodeURIComponent(doc.ticker)}`}
                  className="group flex items-start gap-2.5 px-4 py-3 transition-colors hover:bg-surface-container-low"
                >
                  <StockLogo ticker={doc.ticker} market={doc.market ?? "US"} size={24} className="shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-mono text-[12px] font-bold text-on-surface group-hover:text-[var(--accent-terminal)]">
                        {doc.ticker}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] tabular-nums text-on-surface-variant">
                        {formatEventDate(doc.event_date)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[12px] leading-snug text-on-surface [overflow-wrap:anywhere]">
                      {doc.report?.headline || "Report ready"}
                    </p>
                    {lines.length > 0 ? (
                      <ul className="mt-2 flex flex-col gap-1.5">
                        {lines.map((line) => (
                          <li
                            key={line}
                            className="text-[11px] leading-relaxed text-on-surface-variant [overflow-wrap:anywhere]"
                          >
                            {line}
                          </li>
                        ))}
                      </ul>
                    ) : doc.report?.summary ? (
                      <p className="mt-2 text-[11px] leading-relaxed text-on-surface-variant [overflow-wrap:anywhere]">
                        {doc.report.summary}
                      </p>
                    ) : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {count > 3 ? (
        <Link
          href="/earnings-intel"
          className="border-t border-outline-variant/50 px-4 py-2.5 font-mono text-[11px] font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface"
        >
          +{count - 3} more · View all
        </Link>
      ) : count > 1 ? (
        <Link
          href="/earnings-intel"
          className="border-t border-outline-variant/50 px-4 py-2.5 font-mono text-[11px] font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface"
        >
          View all reports →
        </Link>
      ) : null}
    </div>
  );
}
