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

const RELATION_ORDER = ["peer", "sector", "supply_chain", "co_mentioned"];

const RELATION_META: Record<string, { label: string; accent: string }> = {
  peer: { label: "Direct Peers", accent: "var(--primary)" },
  sector: { label: "Sector Peers", accent: "var(--primary)" },
  supply_chain: { label: "Supply Chain", accent: "var(--signal-bullish)" },
  co_mentioned: { label: "Co-Mentioned", accent: "var(--signal-neutral)" },
};

function formatPrice(value: number) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function mergePeers(
  peers: RelatedTicker[],
  related: RelatedInstrument[],
): MergedPeer[] {
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
  const arrow = positive ? "▲" : "▼";
  const color = positive ? "text-signal-bullish" : "text-signal-bearish";
  return (
    <a
      key={peer.instrument_id}
      href={`/stock/${encodeURIComponent(peer.ticker)}`}
      className="group bg-surface-container-low p-4 brutalist-border hover:-translate-y-0.5 transition-transform"
    >
      <div className="text-[14px] font-bold text-on-surface group-hover:text-primary transition-colors">
        {peer.ticker}
      </div>
      <div className="text-[11px] font-semibold text-on-surface-variant truncate">
        {peer.name}
      </div>
      {typeof peer.price === "number" && (
        <div className="mt-3 flex items-baseline justify-between gap-2">
          <span className="text-[14px] font-semibold text-on-surface tabular-nums">
            {formatPrice(peer.price)}
          </span>
          {hasPct && (
            <span className={`text-[12px] font-bold tabular-nums ${color}`}>
              {arrow} {Math.abs(pct!).toFixed(2)}%
            </span>
          )}
        </div>
      )}
    </a>
  );
}

export function PeersRow({ peers, related }: Props) {
  const merged = mergePeers(peers ?? [], related ?? []);
  if (merged.length === 0) return null;

  const hasRelationData = merged.some((p) => !!p.relation);

  if (!hasRelationData) {
    return (
      <section className="bg-surface-container-lowest brutalist-border p-6">
        <h2 className="text-[14px] font-semibold text-on-surface mb-4">
          Peers
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
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

  const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
    const ai = RELATION_ORDER.indexOf(a);
    const bi = RELATION_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  return (
    <section className="bg-surface-container-lowest brutalist-border p-6">
      <h2 className="text-[14px] font-semibold text-on-surface mb-4">Peers</h2>
      <div className="flex flex-col gap-6">
        {sortedKeys.map((key) => {
          const meta =
            RELATION_META[key] ?? {
              label: key.replace(/_/g, " "),
              accent: "var(--outline)",
            };
          const items = groups.get(key)!;
          return (
            <div key={key}>
              <div className="flex items-center gap-2 mb-3">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: meta.accent }}
                />
                <h3 className="text-[11px] font-bold tracking-[0.15em] uppercase text-outline">
                  {meta.label}
                </h3>
                <span className="text-[11px] text-on-surface-variant">
                  {items.length}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {items.map((peer) => (
                  <PeerCard key={peer.instrument_id} peer={peer} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
