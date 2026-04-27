import Link from "next/link";

import { resolveSectorId, type SectorSlugMap } from "@/lib/sector";
import type { SectorFlow } from "@/lib/types";

type Props = {
  flows: SectorFlow[];
  mocked?: boolean;
  sectorSlugMap?: SectorSlugMap;
};

function toneFor(direction: SectorFlow["direction"], flowPct: number) {
  if (direction === "up" || flowPct > 0) {
    return {
      color: "var(--signal-bullish)",
      arrow: "▲",
      textClass: "text-signal-bullish",
    };
  }
  if (direction === "down" || flowPct < 0) {
    return {
      color: "var(--signal-bearish)",
      arrow: "▼",
      textClass: "text-signal-bearish",
    };
  }
  return {
    color: "var(--signal-neutral)",
    arrow: "▬",
    textClass: "text-on-surface-variant",
  };
}

function SectorRow({ flow, sectorSlugMap }: { flow: SectorFlow; sectorSlugMap?: SectorSlugMap }) {
  const { arrow, textClass } = toneFor(flow.direction, flow.flow_pct);
  const id = sectorSlugMap ? resolveSectorId(flow.sector, sectorSlugMap) : null;
  const content = (
    <>
      <span className="text-[13px] font-semibold text-on-surface truncate pr-2 group-hover:text-primary transition-colors">
        {flow.sector}
      </span>
      <span className={`text-[12px] font-bold tabular-nums ${textClass}`}>
        {arrow} {Math.abs(flow.flow_pct).toFixed(2)}%
      </span>
    </>
  );
  const className =
    "group flex items-center justify-between py-3 border-b border-outline-variant/30 last:border-b-0";
  return id ? (
    <Link href={`/sector/${encodeURIComponent(id)}`} className={className}>
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

export function SectorFlows({ flows, mocked, sectorSlugMap }: Props) {
  return (
    <section className="bg-surface-container-lowest brutalist-border p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[14px] font-semibold text-on-surface">Sectors</h2>
        {mocked && (
          <span
            title="Mocked — sector_flows not populated."
            className="px-1.5 py-0.5 text-[9px] font-bold tracking-[0.15em] uppercase bg-signal-neutral/25 text-on-surface rounded-sm"
          >
            Mock
          </span>
        )}
      </div>
      {flows.length === 0 ? (
        <div className="text-[13px] text-on-surface-variant py-6 text-center">
          No sector flow data yet.
        </div>
      ) : (
        <div className="flex-1">
          {flows.map((flow) => (
            <SectorRow key={flow.sector} flow={flow} sectorSlugMap={sectorSlugMap} />
          ))}
        </div>
      )}
    </section>
  );
}
