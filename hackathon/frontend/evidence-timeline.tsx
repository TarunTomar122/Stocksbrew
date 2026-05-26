import type { EvidenceItem } from "../types";

type Props = {
  evidence: EvidenceItem[];
};

const SOURCE_TONES: Record<string, string> = {
  "Earnings Call": "bg-[#374151]",
  "Industry Report": "bg-[#059669]",
  "Trade Journal": "bg-[#6b7280]",
  "Regulatory Filing": "bg-[#991b1b]",
  "Supply Chain": "bg-[#92400e]",
};

export function EvidenceTimeline({ evidence }: Props) {
  const sorted = [...evidence].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  return (
    <section aria-labelledby="evidence-timeline-heading" className="flex flex-col gap-5">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2
          id="evidence-timeline-heading"
          className="text-[11px] font-semibold tracking-[0.12em] uppercase text-[#6b7280]"
        >
          Evidence Timeline
        </h2>
        <span className="text-[11px] font-mono text-[#9ca3af] tabular-nums">
          {sorted.length} items
        </span>
      </header>

      <ol className="flex flex-col">
        {sorted.map((item, i) => (
          <li key={item.id} className="flex gap-4 md:gap-5">
            <div className="flex flex-col items-center w-3 shrink-0" aria-hidden>
              <div
                className={`mt-2 h-[8px] w-[8px] rounded-full ${
                  SOURCE_TONES[item.source] ?? "bg-[#9ca3af]"
                }`}
              />
              {i < sorted.length - 1 && (
                <div className="w-px flex-1 min-h-[12px] bg-[#e5e7eb]" />
              )}
            </div>
            <div
              className={`flex-1 min-w-0 pb-7 md:pb-8 ${
                i < sorted.length - 1 ? "border-b border-[#f9fafb]" : ""
              }`}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mb-1.5">
                <time className="text-[10px] font-mono text-[#9ca3af]">
                  {item.date}
                </time>
                <span className="text-[10px] text-[#6b7280]">
                  {item.source}
                </span>
              </div>
              <h3 className="text-[15px] font-medium text-[#111111] leading-snug mb-1">
                {item.headline}
              </h3>
              <p className="text-[13px] text-[#6b7280] leading-[1.55] max-w-prose">
                {item.summary}
              </p>
              {item.entities.length > 0 && (
                <ul className="flex flex-wrap gap-1 mt-2" aria-label="Related entities">
                  {item.entities.map((e) => (
                    <li
                      key={e}
                      className="inline-flex items-center bg-[#f9fafb] px-2 py-0.5 text-[10px] font-mono text-[#6b7280]"
                    >
                      {e}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
