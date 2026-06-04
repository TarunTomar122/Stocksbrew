import Link from "next/link";
import { StockLogo } from "@/components/stock-logo";

export type SignalChip = {
  kind: "buzz" | "anomaly_up" | "anomaly_down" | "regime" | "news";
  label: string;
};

const CHIP_STYLE: Record<SignalChip["kind"], { bg: string; fg: string; icon: string }> = {
  buzz: { bg: "#fff1ec", fg: "#c2410c", icon: "💬" },
  anomaly_up: { bg: "#ecfdf5", fg: "#047857", icon: "📈" },
  anomaly_down: { bg: "#fef2f2", fg: "#b91c1c", icon: "📉" },
  regime: { bg: "#eef2ff", fg: "#1d4ed8", icon: "🧭" },
  news: { bg: "#f3f4f6", fg: "#374151", icon: "📰" },
};

export function SignalChips({ chips }: { chips: SignalChip[] }) {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip, i) => {
        const s = CHIP_STYLE[chip.kind];
        return (
          <span
            key={`${chip.kind}-${i}`}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{ background: s.bg, color: s.fg }}
          >
            <span aria-hidden>{s.icon}</span>
            {chip.label}
          </span>
        );
      })}
    </div>
  );
}

/**
 * Shows raw signals chaining into a takeaway: the chips are the evidence, the
 * conclusion is the judgment. This is the "we do the thinking" proof.
 */
export function ConnectedReadCard({
  ticker,
  name,
  market,
  logoUrl,
  chips,
  conclusion,
}: {
  ticker: string;
  name: string;
  market: "US" | "IN";
  logoUrl: string | null;
  chips: SignalChip[];
  conclusion: string;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-[#e5e7eb] bg-white p-5 shadow-[0_18px_50px_rgba(17,24,39,0.06)] sm:p-6">
      <div className="flex items-center gap-3">
        <StockLogo ticker={ticker} market={market} size={40} logoUrl={logoUrl} />
        <div className="flex min-w-0 flex-col">
          <span className="text-[15px] font-semibold tracking-[-0.01em] text-[#111111]">{ticker}</span>
          <span className="truncate text-[12px] text-[#9ca3af]">{name}</span>
        </div>
      </div>

      <SignalChips chips={chips} />

      <div className="flex items-start gap-2 border-t border-[#f3f4f6] pt-4">
        <span aria-hidden className="mt-0.5 text-[#0052ff]">→</span>
        <p className="text-[15px] font-semibold leading-snug text-[#111111]">{conclusion}</p>
      </div>

      <Link
        href={`/stock/${encodeURIComponent(ticker)}`}
        className="text-[13px] font-semibold text-[#0052ff] hover:underline"
      >
        See the full read on {ticker} →
      </Link>
    </div>
  );
}
