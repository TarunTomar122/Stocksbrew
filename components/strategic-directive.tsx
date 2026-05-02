import type { Directive } from "@/lib/stock";

type Props = {
  ticker: string;
  directive?: Directive | null;
};

const STANCE_META: Record<string, { label: string; bg: string; fg: string; chipBg: string; chipFg: string }> = {
  accumulate: { label: "Accumulate", bg: "#ecfdf5", fg: "#065f46", chipBg: "#10b981", chipFg: "#ffffff" },
  trim:       { label: "Trim",       bg: "#fef3c7", fg: "#92400e", chipBg: "#f59e0b", chipFg: "#ffffff" },
  watch:      { label: "Watch",      bg: "#eff6ff", fg: "#1e3a8a", chipBg: "#0052ff", chipFg: "#ffffff" },
  avoid:      { label: "Avoid",      bg: "#fef2f2", fg: "#991b1b", chipBg: "#ef4444", chipFg: "#ffffff" },
  hold:       { label: "Hold",       bg: "#f3f4f6", fg: "#374151", chipBg: "#374151", chipFg: "#ffffff" },
};

export function StrategicDirective({ ticker, directive }: Props) {
  if (!directive?.text) return null;
  const stance = (directive.stance ?? "watch").toLowerCase();
  const meta = STANCE_META[stance] ?? STANCE_META.watch;

  return (
    <section
      className="relative overflow-hidden rounded-[20px] border border-[#e5e7eb] px-7 py-7"
      style={{ background: meta.bg, color: meta.fg }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 select-none font-semibold tracking-[-0.04em] text-[120px] leading-none opacity-[0.06]"
      >
        {ticker}
      </span>

      <div className="relative z-10 flex flex-col gap-3 max-w-[640px]">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center rounded-md px-2 py-1 text-[10px] font-semibold tracking-[0.12em] uppercase"
            style={{ background: meta.chipBg, color: meta.chipFg }}
          >
            {meta.label}
          </span>
          <span className="text-[10px] font-semibold tracking-[0.12em] uppercase opacity-75">
            Strategic directive
          </span>
          {directive.confidence && (
            <span className="text-[10px] font-semibold tracking-[0.12em] uppercase opacity-60">
              · {directive.confidence}
            </span>
          )}
        </div>
        <h2 className="text-[24px] md:text-[28px] font-semibold tracking-[-0.02em] leading-[1.2]">
          {directive.text}
        </h2>
        {directive.rationale && (
          <p className="text-[14px] leading-[1.55] opacity-85">
            {directive.rationale}
          </p>
        )}
      </div>
    </section>
  );
}
