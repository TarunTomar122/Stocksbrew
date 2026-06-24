import Link from "next/link";

import { StockLogo } from "@/components/stock-logo";
import type { RelatedInstrument, RelatedTicker } from "@/lib/stock";

type Props = {
  peers: RelatedTicker[] | null | undefined;
  related?: RelatedInstrument[] | null | undefined;
};

type MergedPeer = {
  instrument_id: string;
  ticker: string;
  name: string;
  price?: number;
  day_change_pct?: number;
  relation?: string;
};

const RELATION_LABEL: Record<string, string> = {
  peer: "Direct peers",
  sector: "Sector peers",
  supply_chain: "Supply chain",
  co_mentioned: "Co-mentioned",
};

function formatPrice(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function mergePeers(peers: RelatedTicker[], related: RelatedInstrument[]): MergedPeer[] {
  const byId = new Map<string, MergedPeer>();
  for (const p of peers) {
    byId.set(p.instrument_id, {
      instrument_id: p.instrument_id,
      ticker: p.ticker,
      name: p.name,
      price: p.price,
      day_change_pct: p.day_change_pct,
    });
  }
  for (const r of related) {
    const existing = byId.get(r.instrument_id);
    if (existing) {
      existing.relation = r.relation;
    } else {
      byId.set(r.instrument_id, {
        instrument_id: r.instrument_id,
        ticker: r.ticker,
        name: r.name,
        relation: r.relation,
      });
    }
  }
  return Array.from(byId.values());
}

function PeerCard({ peer }: { peer: MergedPeer }) {
  const pct = peer.day_change_pct;
  const hasPct = typeof pct === "number";
  const positive = hasPct && pct! >= 0;
  const tone = positive
    ? "tint-bull text-[#10b981]"
    : "tint-bear text-[#ef4444]";
  return (
    <Link
      href={`/stock/${encodeURIComponent(peer.ticker)}`}
      className="group flex flex-col gap-3 rounded-2xl bg-surface p-4 min-w-[220px] hover:border-on-surface transition-colors"
    >
      <div className="flex items-center gap-3">
        <StockLogo ticker={peer.ticker} size={32} />
        <div className="flex flex-col min-w-0">
          <span className="text-[13px] font-semibold text-on-surface truncate">
            {peer.ticker}
          </span>
          <span className="text-[11px] text-on-surface-variant truncate">{peer.name}</span>
        </div>
      </div>
      {typeof peer.price === "number" && (
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[14px] font-semibold text-on-surface tabular-nums">
            {formatPrice(peer.price)}
          </span>
          {hasPct && (
            <span
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold tabular-nums ${tone}`}
            >
              {positive ? "▲" : "▼"} {Math.abs(pct!).toFixed(2)}%
            </span>
          )}
        </div>
      )}
    </Link>
  );
}

export function PeersRow({ peers, related }: Props) {
  const merged = mergePeers(peers ?? [], related ?? []);
  if (merged.length === 0) return null;

  const hasRelationData = merged.some((p) => !!p.relation);

  if (!hasRelationData) {
    return (
      <section className="flex flex-col gap-4 pt-6 border-t border-outline-variant">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-[18px] font-semibold text-on-surface tracking-[-0.01em]">
            Peers
          </h3>
          <span className="text-[12px] text-on-surface-variant">{merged.length} stocks</span>
        </div>
        <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1">
          {merged.map((peer) => (
            <PeerCard key={peer.instrument_id} peer={peer} />
          ))}
        </div>
      </section>
    );
  }

  const groups = new Map<string, MergedPeer[]>();
  for (const peer of merged) {
    const key = peer.relation ?? "peer";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(peer);
  }
  const sortedKeys = Array.from(groups.keys());

  return (
    <section className="flex flex-col gap-6 pt-6 border-t border-outline-variant">
      <h3 className="text-[18px] font-semibold text-on-surface tracking-[-0.01em]">
        Peers
      </h3>
      {sortedKeys.map((key) => {
        const items = groups.get(key)!;
        const label = RELATION_LABEL[key] ?? key.replace(/_/g, " ");
        return (
          <div key={key} className="flex flex-col gap-3">
            <div className="flex items-baseline gap-2">
              <span className="text-[11px] font-semibold tracking-[0.1em] uppercase text-on-surface-variant">
                {label}
              </span>
              <span className="text-[11px] text-on-surface-variant">{items.length}</span>
            </div>
            <div className="flex gap-3 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-1">
              {items.map((peer) => (
                <PeerCard key={peer.instrument_id} peer={peer} />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
