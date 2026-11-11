import type * as React from "react";

/**
 * The kit's Panel and StatStrip, for the goal planner's browser side. The
 * kit's index pulls in the server-only site chrome (AppPage), so a client
 * component cannot import it; these keep the same classes so the planner
 * looks like every other page. Change them together with the kit.
 */

export const NUM = "oa-mono tabular-nums";

export function Card({
  label,
  children,
  flush = false,
  className = "",
}: {
  label?: React.ReactNode;
  children: React.ReactNode;
  flush?: boolean;
  className?: string;
}) {
  return (
    <section className={`oa-surface min-w-0 overflow-hidden border border-oa-border bg-oa-card ${className}`}>
      {label ? (
        <div className="flex min-h-11 items-center justify-between gap-3 border-b border-oa-border px-4 py-2">
          <h2 className="oa-label min-w-0 truncate">{label}</h2>
        </div>
      ) : null}
      <div className={flush ? "" : "p-4"}>{children}</div>
    </section>
  );
}

export function Stats({ stats }: { stats: Array<{ label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode }> }) {
  return (
    <dl className="oa-surface grid grid-cols-2 overflow-hidden border border-oa-border bg-oa-card sm:grid-cols-4">
      {stats.map((stat, index) => (
        <div key={index} className="-mb-px -mr-px border-b border-r border-oa-border px-4 py-3">
          <dt className="oa-caption">{stat.label}</dt>
          <dd className={`${NUM} mt-1 text-[17px] font-medium leading-6 text-oa-fg`}>{stat.value}</dd>
          {stat.sub ? <dd className="mt-1 text-[12.5px] leading-[18px] text-oa-muted-fg">{stat.sub}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

/** "2026-11-05" -> "Nov 5, 2026", parsed by hand so no timezone can shift the day. */
export function dayWords(iso: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!match) return "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[Number(match[2]) - 1];
  return month ? `${month} ${Number(match[3])}, ${match[1]}` : "";
}
