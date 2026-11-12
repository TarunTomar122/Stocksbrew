import Link from "next/link";

import { ToneGlyph } from "@/components/oa/kit/tone";
import { StockLogo } from "@/components/stock-logo";
import type { InboxStockRead } from "@/lib/inbox/types";

/**
 * One stock the inbox's read tells two things about (its move against a normal day, its usual move on a report
 * coming up): one card with its logo once and both figures side by side, instead of two cards wearing the same logo
 * (owner rule 1). Drawn under the read's headline, in the same card style as the read's other cards; the whole card
 * opens the stock at our call, the step the note ends on.
 */
export function InboxStockCard({ stock }: { stock: InboxStockRead }) {
  return (
    <div className="mt-3">
      <div
        data-track-links="insight_clicked"
        data-track-insight-id={`inbox-stock-${stock.ticker}`}
        data-track-insight-kind="inbox-stock"
        className="oa-surface relative min-w-0 overflow-hidden border border-oa-border bg-oa-bg px-3.5 pb-3 pt-3 transition-colors hover:border-[color-mix(in_srgb,var(--oa-fg)_25%,transparent)] hover:bg-oa-accent"
      >
        <p className="flex items-center gap-1.5 text-[13px] font-medium leading-5 text-oa-fg">
          <StockLogo ticker={stock.ticker} size={26} eager />
          <span className="oa-mono tabular-nums">{stock.ticker}</span>
        </p>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3">
          {stock.figures.map((figure) => (
            <div key={figure.value + figure.text} className="min-w-0">
              <p className="inline-flex items-center gap-1.5 text-[24px] font-semibold leading-[30px] tracking-[-0.02em] text-oa-fg">
                <span>{figure.value}</span>
                {figure.tone !== "flat" ? <ToneGlyph tone={figure.tone} className="size-2.5" decorative /> : null}
              </p>
              <p className="mt-0.5 text-pretty text-[14px] leading-5 text-oa-fg">{figure.text}</p>
            </div>
          ))}
        </div>
        {stock.note ? <p className="mt-2 text-pretty text-[13.5px] leading-[19px] text-oa-muted-fg">{stock.note}</p> : null}
        <Link
          href={stock.href}
          prefetch={false}
          data-track-target="action"
          aria-label={`Our call on ${stock.ticker}`}
          className="absolute inset-0 rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
        />
      </div>
    </div>
  );
}
