import Link from "next/link";
import type {
  EarningsEvent,
  EconomicCalendarDoc,
  EconomicEvent,
} from "@/lib/market-signals";

type Props = {
  calendar?: EconomicCalendarDoc | null;
  market: "US" | "IN";
};

type Row =
  | { kind: "earnings"; date: string; payload: EarningsEvent }
  | { kind: "event"; date: string; payload: EconomicEvent };

const DAY_LABELS: Record<number, string> = {
  0: "Sun",
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};

function dayLabel(dateStr: string): { day: string; date: string } {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(today.getUTCDate() + 1);
  const yyyyMmDd = (x: Date) => x.toISOString().slice(0, 10);
  if (yyyyMmDd(d) === yyyyMmDd(today)) return { day: "Today", date: "" };
  if (yyyyMmDd(d) === yyyyMmDd(tomorrow)) return { day: "Tomorrow", date: "" };
  return {
    day: DAY_LABELS[d.getUTCDay()] ?? "",
    date: `${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`,
  };
}

function importanceBadge(tier: number): string {
  if (tier >= 3) return "bg-signal-bearish/25 text-signal-bearish";
  if (tier === 2) return "bg-signal-neutral/25 text-on-surface";
  return "bg-surface-container-high text-on-surface-variant";
}

/**
 * Group the merged event stream by date so the reader sees one card per day.
 * The dashboard needs "what matters this week" at a glance — a flat list of 30+
 * rows defeats that, and a pure grid hides weekday context.
 */
function groupByDate(rows: Row[]): Map<string, Row[]> {
  const grouped = new Map<string, Row[]>();
  for (const r of rows) {
    const bucket = grouped.get(r.date) ?? [];
    bucket.push(r);
    grouped.set(r.date, bucket);
  }
  return grouped;
}

export function CalendarStrip({ calendar, market }: Props) {
  if (!calendar) return null;

  // Economic events flagged GLOBAL (EU/UK/China/Japan) matter for both US and
  // IN readers — big ECB prints and China PMIs ripple everywhere. Filter to
  // the active market's events plus GLOBAL.
  const relevantEvents = calendar.events.filter(
    (ev) => ev.market === market || ev.market === "GLOBAL",
  );
  const relevantEarnings = calendar.earnings.filter((er) => er.market === market);

  const rows: Row[] = [
    ...relevantEarnings.map<Row>((e) => ({ kind: "earnings", date: e.date, payload: e })),
    ...relevantEvents.map<Row>((e) => ({ kind: "event", date: e.date, payload: e })),
  ];

  if (rows.length === 0) return null;

  const grouped = groupByDate(rows);
  const sortedDates = Array.from(grouped.keys()).sort();

  return (
    <section className="bg-surface-container-lowest brutalist-border p-6">
      <div className="flex items-baseline justify-between mb-4 gap-3">
        <h3 className="text-[14px] font-semibold text-on-surface">
          Week ahead
        </h3>
        <p className="text-[11px] text-on-surface-variant leading-snug">
          Earnings and macro prints that can move the tape in the next 7 days.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {sortedDates.map((date) => {
          const bucket = grouped.get(date) ?? [];
          const { day, date: mmdd } = dayLabel(date);
          // Tier-3 (CPI, Fed, NFP) come first; earnings sort by ticker.
          const sorted = [...bucket].sort((a, b) => {
            const aTier = a.kind === "event" ? a.payload.importance : 0;
            const bTier = b.kind === "event" ? b.payload.importance : 0;
            if (aTier !== bTier) return bTier - aTier;
            const aKey = a.kind === "earnings" ? a.payload.ticker : a.payload.event;
            const bKey = b.kind === "earnings" ? b.payload.ticker : b.payload.event;
            return aKey.localeCompare(bKey);
          });
          return (
            <div
              key={date}
              className="border border-outline-variant p-3 flex flex-col gap-2 min-h-[120px]"
            >
              <div className="flex items-baseline justify-between">
                <span className="text-[12px] font-bold tracking-[0.08em] uppercase text-on-surface">
                  {day}
                </span>
                {mmdd && (
                  <span className="text-[10px] tabular-nums text-on-surface-variant">
                    {mmdd}
                  </span>
                )}
              </div>
              <ul className="flex flex-col gap-1.5">
                {sorted.map((r, idx) => {
                  if (r.kind === "earnings") {
                    const e = r.payload;
                    return (
                      <li
                        key={`e-${e.instrument_id}-${idx}`}
                        className="flex items-baseline justify-between gap-2"
                      >
                        <Link
                          href={`/stock/${e.ticker.toLowerCase()}`}
                          className="text-[12px] font-semibold text-on-surface hover:underline truncate"
                        >
                          {e.ticker}
                        </Link>
                        <span className="text-[9px] font-bold tracking-[0.12em] uppercase px-1.5 py-0.5 rounded-sm bg-signal-bullish/20 text-signal-bullish shrink-0">
                          Earnings
                        </span>
                      </li>
                    );
                  }
                  const ev = r.payload;
                  return (
                    <li
                      key={`m-${ev.country}-${ev.event}-${idx}`}
                      className="flex items-baseline justify-between gap-2"
                    >
                      <span className="text-[11px] text-on-surface truncate" title={ev.event}>
                        <span className="text-[9px] font-bold tracking-[0.08em] uppercase text-on-surface-variant mr-1">
                          {ev.market === "GLOBAL" ? ev.country.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 3) : ev.market}
                        </span>
                        {ev.event}
                      </span>
                      <span
                        className={`text-[9px] font-bold tracking-[0.12em] uppercase px-1.5 py-0.5 rounded-sm shrink-0 ${importanceBadge(ev.importance)}`}
                      >
                        T{ev.importance}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-end gap-3 text-[10px] text-on-surface-variant">
        <span>Source: {calendar.source}</span>
      </div>
    </section>
  );
}
