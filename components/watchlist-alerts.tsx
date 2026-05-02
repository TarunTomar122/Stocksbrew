import type { WatchlistRow } from "@/lib/watchlist-view";

type FlagChipProps = {
  ticker: string;
  kind: string;
  message: string;
};

function FlagChip({ ticker, kind, message }: FlagChipProps) {
  const tone =
    kind.includes("bearish") || kind.includes("overbought") || kind.includes("52w_low")
      ? "border-rose-500/30 bg-rose-500/10 text-rose-700"
      : kind.includes("bullish") || kind.includes("oversold")
        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
        : "border-amber-500/30 bg-amber-500/10 text-amber-700";
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-medium ${tone}`}>
      <span className="font-bold">{ticker}</span>
      <span className="opacity-80">{message}</span>
    </span>
  );
}

const MAX_ALERTS_SHOWN = 6;

export function WatchlistAlerts({ rows }: { rows: WatchlistRow[] }) {
  const flat: FlagChipProps[] = [];
  for (const row of rows) {
    for (const flag of row.alerts) {
      const kind =
        typeof flag?.kind === "string"
          ? flag.kind
          : typeof flag?.type === "string"
            ? flag.type
            : "info";
      const message =
        typeof flag?.message === "string"
          ? flag.message
          : typeof flag?.label === "string"
            ? flag.label
            : kind;
      flat.push({ ticker: row.ticker, kind, message });
      if (flat.length >= MAX_ALERTS_SHOWN) break;
    }
    if (flat.length >= MAX_ALERTS_SHOWN) break;
  }

  if (flat.length === 0) return null;

  return (
    <section className="flex flex-wrap gap-2">
      {flat.map((f, i) => (
        <FlagChip key={`${f.ticker}-${i}`} {...f} />
      ))}
    </section>
  );
}
