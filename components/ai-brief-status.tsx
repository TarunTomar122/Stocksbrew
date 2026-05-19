type Props = {
  ticker: string;
  generatedAt?: string;
  mode?: "researching" | "no_major_news";
  brief?: string;
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

export function AiBriefStatus({ ticker, generatedAt, mode = "researching", brief }: Props) {
  const timestamp = formatGeneratedAt(generatedAt);
  const noMajorNews = mode === "no_major_news";

  const badge = noMajorNews ? "No major news today" : "Research started";
  const title = noMajorNews
    ? `${ticker} brief is based on fundamentals today.`
    : `We're researching ${ticker} now.`;
  const body = noMajorNews
    ? "We did not detect a major market-moving company update today, so this brief uses fundamentals, price action, and technical context. It automatically switches to full news-backed AI coverage when fresh coverage appears."
    : "tikrr has kicked off a fresh research run: recent news, fundamentals, technicals, and scorecard data go into our AI model, then this tab becomes the full AI brief with stance, catalysts, risks, and sentiment.";

  return (
    <section
      className={`overflow-hidden rounded-3xl p-5 md:p-6 ${
        noMajorNews
          ? "border border-[#bfdbfe] bg-[#eff6ff]"
          : "border border-[#fed7aa] bg-[#fff7ed]"
      }`}
    >
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="flex max-w-[680px] flex-col gap-2">
          <span
            className={`inline-flex w-fit items-center rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${
              noMajorNews ? "text-[#1d4ed8]" : "text-[#c2410c]"
            }`}
          >
            {badge}
          </span>
          <h3 className="text-[20px] font-semibold tracking-[-0.02em] text-[#111111]">{title}</h3>
          <p className={`text-[13px] leading-relaxed ${noMajorNews ? "text-[#1e3a8a]" : "text-[#7c2d12]"}`}>
            {body}
          </p>
          {noMajorNews && brief ? (
            <p className="rounded-2xl bg-white px-3 py-2 text-[13px] leading-relaxed text-[#1e3a8a]">
              {brief}
            </p>
          ) : null}
        </div>

        {timestamp && (
          <div className="rounded-2xl bg-white px-4 py-3 text-left md:text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9ca3af]">
              {noMajorNews ? "Updated" : "Started"}
            </p>
            <p className="mt-1 text-[13px] font-semibold text-[#111111]">{timestamp}</p>
          </div>
        )}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-2 md:grid-cols-3">
        {noMajorNews ? (
          <>
            <StatusStep done label="Fundamentals updated" />
            <StatusStep done label="No major news detected" />
            <StatusStep done={false} label="News-backed refresh pending" />
          </>
        ) : (
          <>
            <StatusStep done label="Added to Radar" />
            <StatusStep done label="Research queued" />
            <StatusStep done={false} label="AI brief ready" />
          </>
        )}
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
