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

  const eyebrow = priceStale ? "Brief refresh needed" : noMajorNews ? "Fundamentals brief" : "Research in progress";
  const subtitle = priceStale
    ? "The latest quote changed enough that old price levels are no longer reliable"
    : noMajorNews
    ? "No major news today · switches to full coverage when fresh articles land"
    : "News, fundamentals, and scorecard feed into your AI brief";
  const title = priceStale
    ? `${ticker} · waiting for refreshed price levels`
    : noMajorNews
    ? `${ticker} · fundamentals-based read`
    : `Researching ${ticker}`;

  const dotColor = priceStale ? "#f59e0b" : noMajorNews ? "#9ca3af" : "#f59e0b";

  return (
    <section className="relative overflow-hidden rounded-[20px] border border-[#e5e7eb] bg-white px-6 py-6 md:px-7 md:py-7">
      <span
        aria-hidden
        className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 select-none font-semibold tracking-[-0.04em] text-[#111111] text-[100px] md:text-[120px] leading-none opacity-[0.04]"
      >
        {ticker}
      </span>

      <div className="relative z-10 flex flex-col gap-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 max-w-[640px] flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ background: dotColor }}
                aria-hidden
              />
              <h3 className="text-[18px] font-semibold tracking-[-0.01em] text-[#111111]">
                {eyebrow}
              </h3>
            </div>

            <div className="flex flex-col gap-1">
              <p className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#9ca3af]">
                {title}
              </p>
              <p className="text-[13px] leading-relaxed text-[#6b7280]">{subtitle}</p>
            </div>

            {noMajorNews && brief ? (
              <p className="border-t border-[#f3f4f6] pt-4 text-[15px] leading-[1.65] text-[#111111]">
                {brief}
              </p>
            ) : null}

            {priceStale ? (
              <p className="text-[14px] leading-relaxed text-[#6b7280]">
                We hid the previous AI brief because its trigger price no longer matches the
                current quote. The next intelligence run will rebuild this with fresh levels.
              </p>
            ) : !noMajorNews && (
              <p className="text-[14px] leading-relaxed text-[#6b7280]">
                stocksbrew is pulling recent news, fundamentals, technicals, and scorecard
                data into our model. This tab will show stance, catalysts, risks, and sentiment
                when the run finishes.
              </p>
            )}
          </div>

          {(relative || timestamp) && (
            <p className="shrink-0 text-[11px] font-semibold tracking-[0.08em] uppercase text-[#9ca3af] sm:text-right">
              {relative ? `Updated ${relative}` : timestamp ? `Updated ${timestamp}` : null}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-[#f3f4f6] pt-4 text-[12px]">
          {priceStale ? (
            <>
              <StatusInline done label="Latest quote updated" />
              <StatusInline done label="Old price trigger hidden" />
              <StatusInline done={false} label="AI refresh pending" />
            </>
          ) : noMajorNews ? (
            <>
              <StatusInline done label="Fundamentals updated" />
              <StatusInline done label="No major news detected" />
              <StatusInline done={false} label="News-backed refresh pending" />
            </>
          ) : (
            <>
              <StatusInline done label="Added to Radar" />
              <StatusInline done label="Research queued" />
              <StatusInline done={false} label="AI brief ready" />
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function StatusInline({ done, label }: { done: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`text-[11px] font-semibold ${done ? "text-[#10b981]" : "text-[#9ca3af]"}`}
        aria-hidden
      >
        {done ? "✓" : "○"}
      </span>
      <span className={`font-medium ${done ? "text-[#111111]" : "text-[#6b7280]"}`}>{label}</span>
    </span>
  );
}
