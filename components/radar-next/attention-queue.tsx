import Link from "next/link";

import { StockLogo } from "@/components/stock-logo";
import { relativeTime } from "@/lib/freshness";
import { radarAttentionItems, radarEventLabel } from "@/lib/radar-attention";
import type { RadarAttentionItem } from "@/lib/watchlist-view";

export function AttentionQueue({ items }: { items: RadarAttentionItem[] }) {
  const rows = radarAttentionItems(items);
  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="rn-attention">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <h2 id="rn-attention" className="text-[16px] font-medium tracking-tight text-[var(--rn-ink)]">
          What changed and why it matters
        </h2>
        <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-[var(--rn-muted)]">
          verified changes only
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((item) => {
          const citation = item.citations[0];
          return (
            <Link
              key={item.item_id}
              href={`/stock/${encodeURIComponent(item.ticker)}`}
              className="group flex min-h-[11rem] min-w-0 flex-col rounded-xl border border-[var(--rn-line)] bg-[var(--rn-card)] p-4 no-underline transition-colors hover:bg-[var(--rn-card-2)]"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <StockLogo ticker={item.ticker} market="US" size={28} />
                <span className="min-w-0">
                  <span className="block font-mono text-[12px] font-bold text-[var(--rn-ink)] group-hover:underline">
                    {item.ticker}
                  </span>
                  <span className="mt-0.5 block font-mono text-[8.5px] font-semibold uppercase tracking-[0.06em] text-[var(--rn-accent)]">
                    {radarEventLabel(item.event_type)}
                  </span>
                </span>
              </span>

              <span className="mt-4 min-w-0">
                <span className="block text-[13px] font-semibold leading-[1.5] text-[var(--rn-ink)]">
                  {citation.title}
                </span>
              </span>

              <span className="mt-auto min-w-0 pt-4">
                <span className="mt-1.5 block font-mono text-[9px] uppercase tracking-[0.04em] text-[var(--rn-muted)]">
                  {`${citation.publisher} · ${relativeTime(citation.published_at)}`}
                  {" · "}
                  {relativeTime(item.occurred_at)}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
