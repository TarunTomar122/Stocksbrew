type Props = {
  ticker: string;
  generatedAt?: string;
};

function formatGeneratedAt(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function AiBriefStatus({ ticker, generatedAt }: Props) {
  const timestamp = formatGeneratedAt(generatedAt);

  return (
    <section className="overflow-hidden rounded-3xl border border-[#fed7aa] bg-[#fff7ed] p-5 md:p-6">
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="flex max-w-[680px] flex-col gap-2">
          <span className="inline-flex w-fit items-center rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#c2410c]">
            Research started
          </span>
          <h3 className="text-[20px] font-semibold tracking-[-0.02em] text-[#111111]">
            We&apos;re researching {ticker} now.
          </h3>
          <p className="text-[13px] leading-relaxed text-[#7c2d12]">
            Tikrr has kicked off a fresh research run: recent news, fundamentals,
            technicals, and scorecard data go into MiMo, then this tab becomes the
            full AI brief with stance, catalysts, risks, and sentiment.
          </p>
        </div>

        {timestamp && (
          <div className="rounded-2xl bg-white px-4 py-3 text-left md:text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9ca3af]">
              Started
            </p>
            <p className="mt-1 text-[13px] font-semibold text-[#111111]">{timestamp}</p>
          </div>
        )}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-2 md:grid-cols-3">
        <StatusStep done label="Added to Radar" />
        <StatusStep done label="Research queued" />
        <StatusStep done={false} label="AI brief ready" />
      </div>
    </section>
  );
}

function StatusStep({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-white px-3 py-2.5">
      <span
        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
          done ? "bg-[#10b981] text-white" : "bg-[#f3f4f6] text-[#9ca3af]"
        }`}
        aria-hidden
      >
        {done ? "✓" : "•"}
      </span>
      <span className="text-[12px] font-semibold text-[#374151]">{label}</span>
    </div>
  );
}
