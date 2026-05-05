export type SignalTileModel = {
  emoji: string;
  bg: string;
  label: string;
  headline: string;
  supporting?: string;
  tone?: "up" | "down" | "warn" | "ink";
};

export function SignalTileCard({ signal }: { signal: SignalTileModel }) {
  const headlineClass =
    signal.tone === "up"
      ? "text-[#10b981]"
      : signal.tone === "down"
        ? "text-[#ef4444]"
        : signal.tone === "warn"
          ? "text-[#b45309]"
          : "text-[#111111]";

  return (
    <div className="flex h-full min-h-[148px] w-[158px] shrink-0 flex-col gap-3 rounded-2xl border border-[#e5e7eb] bg-white p-4">
      <span
        aria-hidden
        className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-[18px]"
        style={{ background: signal.bg }}
      >
        {signal.emoji}
      </span>
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[#9ca3af]">
          {signal.label}
        </span>
        <span className={`text-[18px] font-semibold tabular-nums leading-tight ${headlineClass}`}>
          {signal.headline}
        </span>
        {signal.supporting && (
          <span className="text-[12px] text-[#6b7280] leading-snug">{signal.supporting}</span>
        )}
      </div>
    </div>
  );
}
