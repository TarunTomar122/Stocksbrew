import Link from "next/link";

import { pricesWords } from "@/lib/portfolio-prices";
import type { ExampleReason, HomeLoad } from "@/lib/portfolio-home/server";

/**
 * The line at the top of My stocks when the page is about the example portfolio: why, and the one way to make it
 * the person's own. The stocks themselves are in ./stocks.tsx.
 */

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";
const LINK = `font-medium text-oa-primary hover:underline ${FOCUS} rounded`;

/* ── the example line ──────────────────────────────────────────────────── */

const MARK = (
  <Link href="/import" className={LINK}>
    Bring your holdings in
  </Link>
);

/**
 * Why the page shows the example, within the owner's budget of one line of at most 15 words (rule 8), and how many
 * words it takes, so the prices' date is added only when the whole line still fits.
 */
function reasonWords(reason: ExampleReason): { node: React.ReactNode; words: number } {
  switch (reason) {
    case "read-failed":
      return { node: <>We could not load your holdings, so this is the example. Try again soon.</>, words: 14 };
    case "no-us-holdings":
      return { node: <>None of your holdings is a US stock yet, so this is the example.</>, words: 14 };
    case "watching-only":
      return { node: <>You only watch stocks, so this is the example. {MARK}.</>, words: 13 };
    case "no-holdings":
      return { node: <>No holdings marked yet, so this is the example. {MARK}.</>, words: 13 };
    case "signed-out":
      return { node: <>An example portfolio of real stocks with made-up share counts.</>, words: 10 };
  }
}

const LINE_WORDS = 15;

/**
 * Says plainly when the page is about the example, with the one way to make it yours, and dates its prices once
 * ("Prices from the Nov 11 close."): the same snapshot the briefing, the inbox and the home page show. No button
 * signed out: the shell's Start free is the view's one (judges, ship 42).
 */
export async function ExampleLine({ load }: { load: HomeLoad }) {
  const { mode, reason } = await load.context;
  if (mode === "mine" || !reason) return null;
  const book = await load.book;
  const prices = book.state === "ready" ? pricesWords(book.value.pricesDay) : null;
  const why = reasonWords(reason);
  // "Prices from the Nov 11 close." only when the line stays within its 15 words.
  const dated = prices ? `Prices from ${prices}.` : null;
  const fits = dated !== null && why.words + dated.split(/\s+/).length <= LINE_WORDS;
  return (
    <div className="mb-3 px-2 sm:px-0">
      <p className="text-pretty text-[14px] leading-5 text-oa-muted-fg">
        <span className="mr-2 inline-flex h-[22px] items-center rounded border border-[color-mix(in_srgb,var(--oa-primary)_45%,transparent)] bg-[color-mix(in_srgb,var(--oa-primary)_7%,transparent)] px-2 align-[1px] text-[13px] font-medium text-oa-primary">
          Example
        </span>
        {why.node}
        {fits ? ` ${dated}` : null}
      </p>
    </div>
  );
}
