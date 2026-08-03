type Props = {
  ticker: string;
  generatedAt?: string;
  mode?: "researching" | "no_major_news" | "price_stale";
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

function formatRelative(iso?: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.round((Date.now() - then) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function AiBriefStatus({ ticker, generatedAt, mode = "researching", brief }: Props) {
  const timestamp = formatGeneratedAt(generatedAt);
  const relative = formatRelative(generatedAt);
  const noMajorNews = mode === "no_major_news";
  const priceStale = mode === "price_stale";

  const eyebrow = priceStale ? "Price context changed" : noMajorNews ? "Fundamentals brief" : "Live research desk";
  const subtitle = priceStale
    ? "The old trigger levels are hidden while the price context is rebuilt"
    : noMajorNews
    ? "No major stock-specific news today. The underlying business read is still current."
    : "Recent sources, company numbers, and price context are being turned into one publishable call.";
  const title = priceStale
    ? `${ticker} needs a fresh set of levels`
    : noMajorNews
    ? `${ticker}, without forcing a news story`
    : `${ticker} is on the research desk`;

  const accent = priceStale
    ? "var(--signal-neutral)"
    : noMajorNews
      ? "var(--on-surface-variant)"
      : "var(--primary)";
  const stages = priceStale
    ? [
        { done: true, active: false, label: "Latest quote" },
        { done: true, active: false, label: "Old levels hidden" },
        { done: false, active: true, label: "Rebuild context" },
      ]
    : noMajorNews
      ? [
          { done: true, active: false, label: "Numbers checked" },
          { done: true, active: false, label: "News scan clear" },
          { done: false, active: false, label: "Watching for change" },
        ]
      : [
          { done: true, active: false, label: "Radar linked" },
          { done: false, active: true, label: "Evidence pass" },
          { done: false, active: false, label: "Publish the call" },
        ];

  return (
    <section
      className="relative overflow-hidden border-y border-outline-variant bg-surface"
      aria-live={mode === "researching" ? "polite" : undefined}
    >
      {mode === "researching" ? <div className="brief-research-scan" aria-hidden /> : null}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-1 top-3 select-none font-mono text-[84px] font-bold leading-none tracking-[-0.08em] text-on-surface opacity-[0.03] sm:text-[116px]"
      >
        {ticker}
      </span>

      <div className="relative z-10 px-5 py-7 sm:px-7 sm:py-8 lg:px-9">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 max-w-[690px]">
            <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.15em]" style={{ color: accent }}>
              {mode === "researching" ? (
                <span className="brief-research-pulse" aria-hidden />
              ) : (
                <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: accent }} aria-hidden />
              )}
              <span>
                {eyebrow}
              </span>
            </div>

            <h3 className="mt-3 text-[24px] font-semibold leading-tight tracking-[-0.035em] text-on-surface sm:text-[28px]">
              {title}
            </h3>
            <p className="mt-3 max-w-[620px] text-[13px] leading-6 text-on-surface-variant">
              {subtitle}
            </p>

            {noMajorNews && brief ? (
              <p className="mt-5 border-l-2 border-outline pl-4 text-[15px] leading-[1.65] text-on-surface">
                {brief}
              </p>
            ) : null}

            {priceStale ? (
              <p className="mt-4 text-[13px] leading-6 text-on-surface-variant">
                The previous call is still stored, but we will not show stale entry or target
                levels against a materially different quote.
              </p>
            ) : null}
          </div>

          <div className="shrink-0 border-l-2 pl-3 font-mono text-[10px] uppercase leading-5 tracking-[0.06em] text-on-surface-variant" style={{ borderColor: accent }}>
            {mode === "researching" ? (
              <>
                <p className="font-semibold text-on-surface">Publishes automatically</p>
                <p>Usually 10–15 minutes</p>
              </>
            ) : (relative || timestamp) ? (
              <p>{relative ? `Updated ${relative}` : timestamp ? `Updated ${timestamp}` : null}</p>
            ) : (
              <p>Monitoring continues</p>
            )}
          </div>
        </div>

        <div className="mt-7 grid border-y border-outline-variant sm:grid-cols-3">
          {stages.map((stage, index) => (
            <StatusInline
              key={stage.label}
              done={stage.done}
              active={stage.active}
              index={index}
              label={stage.label}
              accent={accent}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function StatusInline({
  done,
  active,
  index,
  label,
  accent,
}: {
  done: boolean;
  active: boolean;
  index: number;
  label: string;
  accent: string;
}) {
  return (
    <div className="flex min-h-[76px] items-center gap-3 border-outline-variant px-1 py-4 sm:border-r sm:px-4 sm:last:border-r-0">
      <span className="font-mono text-[10px] font-semibold tabular-nums text-on-surface-variant" aria-hidden>
        0{index + 1}
      </span>
      <div>
        <p className="text-[12px] font-semibold text-on-surface">{label}</p>
        <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.08em]" style={{ color: done || active ? accent : "var(--on-surface-variant)" }}>
          {done ? "complete" : active ? "working now" : "up next"}
        </p>
      </div>
    </div>
  );
}
