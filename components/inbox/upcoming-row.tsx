import Link from "next/link";

import { StockLogo } from "@/components/stock-logo";
import type { UpcomingLine } from "@/lib/inbox/types";

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";

/**
 * A report coming up on one of the person's stocks: earnings prep in one sentence, the row opening the stock. The
 * words come finished from the server (lib/inbox/read.ts rowsAfterRead), so the browser never loads the wording.
 */
export function UpcomingRow({ report }: { report: UpcomingLine }) {
  return (
    <li className="relative flex items-start gap-3 py-3 pl-6 pr-4 transition-colors hover:bg-oa-accent">
      <span className="mt-0.5 flex shrink-0 items-center">
        <StockLogo ticker={report.ticker} size={28} />
      </span>
      <div className="min-w-0 flex-1">
        <p>
          <Link
            href={`/stock/${encodeURIComponent(report.ticker)}`}
            prefetch={false}
            className={`rounded text-pretty text-[14.5px] leading-[21px] text-oa-fg after:absolute after:inset-0 after:content-[''] ${FOCUS}`}
          >
            {report.text}
          </Link>
        </p>
        {report.note ? <p className="mt-0.5 text-pretty text-[13.5px] leading-[19px] text-oa-muted-fg">{report.note}</p> : null}
      </div>
    </li>
  );
}
