import type { DashboardRow } from "@/lib/types";

type Props = {
  gainers: DashboardRow[];
  losers: DashboardRow[];
  mocked?: boolean;
};

function formatPrice(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function MoverRow({ row, positive }: { row: DashboardRow; positive: boolean }) {
  const color = positive ? "text-signal-bullish" : "text-signal-bearish";
  const arrow = positive ? "▲" : "▼";

  return (
    <a
      href={`/stock/${encodeURIComponent(row.ticker)}`}
      className="group flex items-center justify-between gap-3 py-3 border-b border-outline-variant/30 last:border-b-0 -mx-2 px-2 hover:bg-surface-container-low transition-colors cursor-pointer"
    >
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-bold text-on-surface truncate group-hover:text-primary transition-colors">
          {row.ticker}
        </div>
        <div className="text-[11px] font-semibold text-on-surface-variant truncate">
          {row.name}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-[14px] font-semibold text-on-surface tabular-nums">
          {formatPrice(row.price)}
        </div>
        <div className={`text-[12px] font-bold tabular-nums ${color}`}>
          {arrow} {Math.abs(row.day_change_pct).toFixed(2)}%
        </div>
      </div>
    </a>
  );
}

function Column({
  title,
  rows,
  positive,
}: {
  title: string;
  rows: DashboardRow[];
  positive: boolean;
}) {
  return (
    <div className="flex-1">
      <div className="flex items-center gap-2 mb-3">
        <span
          className="w-2 h-2 rounded-full"
          style={{
            backgroundColor: positive
              ? "var(--signal-bullish)"
              : "var(--signal-bearish)",
          }}
        />
        <h3 className="text-[12px] font-bold tracking-[0.15em] uppercase text-outline">
          {title}
        </h3>
      </div>
      {rows.length === 0 ? (
        <div className="text-[13px] text-on-surface-variant py-6 text-center">
          No {positive ? "gainers" : "losers"} yet.
        </div>
      ) : (
        <div>
          {rows.slice(0, 5).map((row) => (
            <MoverRow
              key={row.instrument_id}
              row={row}
              positive={positive}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function MoversTable({ gainers, losers, mocked }: Props) {
  return (
    <section className="bg-surface-container-lowest rounded-xl p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[14px] font-semibold text-on-surface">
          Top movers
        </h2>
        {mocked && (
          <span
            title="Mocked — tm_views_dashboard not available."
            className="px-1.5 py-0.5 text-[9px] font-bold tracking-[0.15em] uppercase bg-signal-neutral/25 text-on-surface rounded-sm"
          >
            Mock
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-0 sm:divide-x sm:divide-outline-variant/30">
        <div className="sm:pr-6">
          <Column title="Gainers" rows={gainers} positive={true} />
        </div>
        <div className="sm:pl-6">
          <Column title="Losers" rows={losers} positive={false} />
        </div>
      </div>
    </section>
  );
}
