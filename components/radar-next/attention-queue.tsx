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
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="rn-attention" className="rn-kick">
          // needs attention
        </h2>
        <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-[var(--rn-muted)]">
          material changes only
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((item) => {
            const citation = item.citations[0];
            const isRsi =
              item.event_type === "rsi_oversold_cross" ||
              item.event_type === "rsi_overbought_cross";
            const supportingCopy = isRsi
              ? item.next_trigger
              : item.why_it_matters || item.next_trigger;
            return (
              <Link
                key={item.item_id}
                href={`/stock/${encodeURIComponent(item.ticker)}`}
                className="group flex min-w-0 flex-col rounded-xl border border-[var(--rn-line)] bg-[var(--rn-card)] p-4 transition-all hover:border-[var(--rn-muted)] hover:bg-[var(--rn-card-2)] hover:shadow-sm"
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
                  <span className="ml-auto font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--rn-muted)]">
                    {relativeTime(item.occurred_at)}
                  </span>
                </div>
                <p className="mt-4 text-[13px] font-semibold leading-[1.5] text-[var(--rn-ink)]">
                  {item.what_changed || item.headline}
                </p>
                {supportingCopy ? (
                  <p className="mt-2 line-clamp-3 text-[11.5px] leading-[1.5] text-[var(--rn-muted)]">
                    {supportingCopy}
                  </p>
                ) : null}
                <div className="mt-auto pt-4">
                  <p className="truncate border-t border-[var(--rn-line)] pt-3 font-mono text-[9px] uppercase tracking-[0.04em] text-[var(--rn-muted)]">
                    {citation
                      ? `${citation.publisher} · verified source · ${relativeTime(citation.published_at)}`
                      : "Price and technical data"}
                  </p>
                </div>
              </Link>
            );
          })}
      </div>
    </section>
  );
}
