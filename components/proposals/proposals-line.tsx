import Link from "next/link";

import { NavIcon } from "@/components/oa/nav-icon";
import { StockLogo } from "@/components/stock-logo";
import type { ProposalsBrief } from "@/lib/proposals-brief";

/**
 * The briefing's one line when the agent has proposals waiting: the agent's mark, how many, the stocks' logos, and
 * the whole line opens them on /agent. Nothing waiting, nothing shown.
 */
export function ProposalsLine({ brief }: { brief: ProposalsBrief | null }) {
  if (!brief || brief.count === 0) return null;
  const words = brief.count === 1 ? "A proposal from your agent" : `${brief.count} proposals from your agent`;
  return (
    <Link
      href="/agent#agent-proposals"
      prefetch={false}
      className="oa-surface flex min-w-0 items-center gap-3 border border-oa-border bg-oa-card px-3.5 py-2.5 transition-colors hover:border-[color-mix(in_srgb,var(--oa-fg)_25%,transparent)] hover:bg-oa-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]"
    >
      <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--oa-primary)_10%,transparent)] text-oa-primary">
        <NavIcon name="agents" className="size-[16px]" />
      </span>
      <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-oa-fg">{words}</span>
      {brief.tickers.length > 0 ? (
        <span aria-hidden="true" className="flex shrink-0 items-center gap-1">
          {brief.tickers.slice(0, 3).map((ticker) => (
            <StockLogo key={ticker} ticker={ticker} size={20} eager />
          ))}
          {brief.tickers.length > 3 ? <span className="oa-mono pl-0.5 text-[12px] tabular-nums text-oa-muted-fg">+{brief.tickers.length - 3}</span> : null}
        </span>
      ) : null}
    </Link>
  );
}
