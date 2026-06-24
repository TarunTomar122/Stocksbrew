import type { AnomalyItem } from "@/lib/daily-anomalies";

export function LandingTape({ anomalies }: { anomalies: AnomalyItem[] }) {
  const tape = anomalies.slice(0, 14);
  if (tape.length === 0) return null;

  const fMoney = (v: number) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pct = (v: number) => `${v >= 0 ? "▲" : "▼"}${Math.abs(v).toFixed(2)}%`;

  const tapeStrip = (
    <span className="flex gap-8 px-3">
      {tape.map((a) => {
        const u = a.day_change_pct >= 0;
        return (
          <span key={a.ticker} className="text-on-surface-variant">
            <span className="font-semibold text-on-surface">{a.ticker}</span>{" "}
            <span style={{ color: u ? "var(--signal-bullish)" : "var(--signal-bearish)" }}>
              ${fMoney(a.price)} {pct(a.day_change_pct)}
            </span>
          </span>
        );
      })}
    </span>
  );

  return (
    <div className="w-full overflow-hidden border-b border-outline-variant bg-surface py-2.5 text-[12px]">
      <div className="mx-auto flex w-full max-w-screen-2xl items-center gap-4 px-6 md:px-10 lg:px-16">
        <span className="flex shrink-0 items-center gap-1.5 border-r border-outline-variant pr-4 font-semibold text-on-surface">
          <span className="h-1.5 w-1.5 rounded-full bg-landing-mint" />
          Live
        </span>
        <div className="min-w-0 flex-1 overflow-hidden font-mono">
          <div className="sb-tape">{tapeStrip}<span aria-hidden>{tapeStrip}</span></div>
        </div>
      </div>
    </div>
  );
}
