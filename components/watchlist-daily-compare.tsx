import type { WatchlistRow } from "@/lib/watchlist-view";

type Props = {
  holdings: WatchlistRow[];
  watching: WatchlistRow[];
};

function avg(rows: WatchlistRow[]): number | null {
  const valid = rows.filter((r) => typeof r.day_change_pct === "number");
  if (valid.length === 0) return null;
  return valid.reduce((s, r) => s + (r.day_change_pct ?? 0), 0) / valid.length;
}

function fmtPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function MiniBar({ pct, max }: { pct: number; max: number }) {
  const width = max === 0 ? 0 : Math.round((Math.abs(pct) / max) * 100);
  const positive = pct >= 0;
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="w-[72px] h-[6px] rounded-full bg-[#f3f4f6] overflow-hidden flex items-center shrink-0">
        <div
          className="h-full rounded-full"
          style={{
            width: `${width}%`,
            background: positive ? "#10b981" : "#ef4444",
          }}
        />
      </div>
      <span
        className="text-[12px] font-semibold tabular-nums shrink-0"
        style={{ color: positive ? "#047857" : "#b91c1c" }}
      >
        {fmtPct(pct)}
      </span>
    </div>
  );
}

function GroupColumn({
  label,
  rows,
  avgPct,
  color,
}: {
  label: string;
  rows: WatchlistRow[];
  avgPct: number | null;
  color: string;
}) {
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.day_change_pct ?? 0)), 0.01);
  const sorted = [...rows]
    .filter((r) => typeof r.day_change_pct === "number")
    .sort((a, b) => Math.abs(b.day_change_pct ?? 0) - Math.abs(a.day_change_pct ?? 0));

  return (
    <div className="flex flex-col gap-3 flex-1 min-w-0">
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#9ca3af]">
          {label}
        </span>
        {avgPct !== null && (
          <span
            className="text-[20px] font-semibold tabular-nums tracking-tight"
            style={{ color }}
          >
            {fmtPct(avgPct)}
          </span>
        )}
        {avgPct === null && (
          <span className="text-[14px] text-[#d1d5db]">no data</span>
        )}
      </div>

      {sorted.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {sorted.slice(0, 6).map((row) => (
            <li key={row.ticker} className="flex items-center gap-2.5 min-w-0">
              <a
                href={`/stock/${encodeURIComponent(row.ticker)}`}
                className="text-[12px] font-semibold text-[#111111] w-[44px] shrink-0 hover:text-[#0052ff] transition-colors"
              >
                {row.ticker}
              </a>
              <MiniBar pct={row.day_change_pct ?? 0} max={maxAbs} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] text-[#9ca3af]">Nothing here yet.</p>
      )}
    </div>
  );
}

export function WatchlistDailyCompare({ holdings, watching }: Props) {
  const holdingsAvg = avg(holdings);
  const watchingAvg = avg(watching);

  if (holdings.length === 0 && watching.length === 0) return null;

  const holdingColor =
    holdingsAvg === null ? "#9ca3af" : holdingsAvg >= 0 ? "#047857" : "#b91c1c";
  const watchingColor =
    watchingAvg === null ? "#9ca3af" : watchingAvg >= 0 ? "#047857" : "#b91c1c";

  const diff =
    holdingsAvg !== null && watchingAvg !== null
      ? holdingsAvg - watchingAvg
      : null;

  return (
    <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5 flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-[15px] font-semibold text-[#111111] tracking-[-0.01em]">
            Today&apos;s performance
          </h3>
          <p className="text-[12px] text-[#9ca3af]">Holdings vs watching, daily % change</p>
        </div>
        {diff !== null && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{
              background: diff >= 0 ? "#ecfdf5" : "#fef2f2",
              color: diff >= 0 ? "#047857" : "#b91c1c",
            }}
          >
            Holdings {diff >= 0 ? "outperforming" : "underperforming"} by {Math.abs(diff).toFixed(2)}%
          </span>
        )}
      </div>

      <div className="flex gap-8 flex-wrap">
        <GroupColumn
          label="Holdings"
          rows={holdings}
          avgPct={holdingsAvg}
          color={holdingColor}
        />
        {watching.length > 0 && (
          <>
            <div className="w-px bg-[#f3f4f6] self-stretch hidden sm:block" />
            <GroupColumn
              label="Watching"
              rows={watching}
              avgPct={watchingAvg}
              color={watchingColor}
            />
          </>
        )}
      </div>
    </div>
  );
}
