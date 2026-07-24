import Link from "next/link";

import { StockLogo } from "@/components/stock-logo";
import { relativeTime } from "@/lib/freshness";
import { radarAttentionItems, radarEventLabel } from "@/lib/radar-attention";
import type { RadarAttentionItem } from "@/lib/watchlist-view";

export function AttentionQueue({ items }: { items: RadarAttentionItem[] }) {
  const rows = radarAttentionItems(items);

  return (
    <section aria-labelledby="rn-attention">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="rn-attention" className="rn-kick">
          // needs attention
        </h2>
        <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-[var(--rn-muted)]">
          material changes only
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="rn-card px-4 py-4">
          <p className="text-[13px] text-[var(--rn-muted)]">
            No material changes in your book today.
          </p>
        </div>
      ) : (
        <div className="rn-card divide-y divide-[var(--rn-line)] overflow-hidden">
          {rows.map((item) => {
            const citation = item.citations[0];
            return (
              <Link
                key={item.item_id}
                href={`/stock/${encodeURIComponent(item.ticker)}`}
                className="group grid min-w-0 gap-2 px-3 py-3 transition-colors hover:bg-[var(--rn-card-2)] sm:grid-cols-[150px_minmax(0,1.2fr)_minmax(220px,0.9fr)] sm:items-center sm:gap-4 sm:px-4"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <StockLogo ticker={item.ticker} market="US" size={28} />
                  <div className="min-w-0">
                    <p className="font-mono text-[12px] font-bold text-[var(--rn-ink)] group-hover:underline">
                      {item.ticker}
                    </p>
                    <span className="mt-0.5 inline-flex rounded px-1.5 py-0.5 font-mono text-[8.5px] font-semibold uppercase tracking-[0.06em] text-[var(--rn-accent)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--rn-accent)_24%,transparent)]">
                      {radarEventLabel(item.event_type)}
                    </span>
                  </div>
                </div>
                <p className="line-clamp-2 text-[12.5px] font-semibold leading-[1.45] text-[var(--rn-ink)]">
                  {item.why_it_matters || item.headline}
                </p>
                <div className="min-w-0">
                  <p className="line-clamp-1 text-[11px] text-[var(--rn-muted)]">
                    {item.what_changed}
                  </p>
                  <p className="mt-1 truncate font-mono text-[9px] uppercase tracking-[0.04em] text-[var(--rn-muted)]">
                    {citation
                      ? `${citation.publisher} · verified source · ${relativeTime(citation.published_at)}`
                      : `StocksBrew technical state · ${relativeTime(item.occurred_at)}`}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
