import Link from "next/link";

import type { HomeLoad } from "@/lib/portfolio-home/server";

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";

/** How many of the person's holdings have no share count. Pure, for the test. */
export function missingShares(positions: ReadonlyArray<{ shares: number | null }>): { missing: number; total: number } {
  return { missing: positions.filter((position) => position.shares === null || !(position.shares > 0)).length, total: positions.length };
}

/** "None of your 6 holdings has a share count yet" or "3 of your 9 holdings have no share count". */
export function sharesPromptWords(missing: number, total: number): string | null {
  if (total === 0 || missing === 0) return null;
  if (missing === total) {
    return total === 1
      ? "Your holding has no share count yet, so we cannot show what it is worth or what you made on it."
      : `None of your ${total} holdings has a share count yet, so we cannot show what they are worth or what you made.`;
  }
  return `${missing} of your ${total} holdings ${missing === 1 ? "has" : "have"} no share count, so your value and gain leave ${missing === 1 ? "it" : "them"} out.`;
}

/**
 * My stocks, on the person's own holdings when some have no share count: one
 * line saying what that costs them and the one way to fix it, bringing the
 * holdings in from a broker CSV (/import). Nothing at all when every holding
 * has shares, or on the example portfolio (its own line says how to make the
 * page yours).
 */
export async function SharesPrompt({ load }: { load: HomeLoad }) {
  const { mode } = await load.context;
  if (mode !== "mine") return null;
  const book = await load.book;
  if (book.state !== "ready" || book.value.mode !== "mine") return null;
  const { missing, total } = missingShares(book.value.portfolio.positions);
  const words = sharesPromptWords(missing, total);
  if (!words) return null;
  return (
    <div className="oa-surface mb-3 flex flex-col gap-2.5 border border-oa-border bg-oa-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <p className="min-w-0 text-pretty text-[14px] leading-5 text-oa-fg">{words}</p>
      <Link
        href="/import"
        prefetch={false}
        data-track-links="insight_clicked"
        data-track-insight-kind="home-bring-holdings"
        className={`inline-flex h-10 shrink-0 items-center justify-center rounded border border-oa-primary bg-oa-primary px-4 text-[14px] font-medium text-oa-primary-fg hover:brightness-110 ${FOCUS}`}
      >
        Bring your holdings in
      </Link>
    </div>
  );
}
