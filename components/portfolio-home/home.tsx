import Link from "next/link";

import { HomeSignIn } from "@/components/portfolio-home/sign-in";
import type { ExampleReason, HomeLoad } from "@/lib/portfolio-home/server";

/**
 * The line at the top of My stocks when the page is about the example portfolio: why, and the one way to make it
 * the person's own. The stocks themselves are in ./stocks.tsx.
 */

const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";
const LINK = `font-medium text-oa-primary hover:underline ${FOCUS} rounded`;

/* ── the example line ──────────────────────────────────────────────────── */

const MARK = (
  <Link href="/portfolio?tab=holdings" className={LINK}>
    Mark the stocks you own in Portfolio
  </Link>
);

function reasonWords(reason: ExampleReason): React.ReactNode {
  switch (reason) {
    case "read-failed":
      return <>We could not load your holdings just now, so this is the example portfolio. Try again in a minute.</>;
    case "no-us-holdings":
      return <>These tools cover US stocks and funds, and none of your holdings is one yet, so this is the example portfolio.</>;
    case "watching-only":
      return <>You watch stocks but have not marked any as owned, so this is the example portfolio. {MARK} and this page is about yours.</>;
    case "no-holdings":
      return <>You have no holdings marked yet, so this is the example portfolio. {MARK} and this page is about yours.</>;
    case "signed-out":
      return <>This is an example portfolio of real stocks and funds with made-up share counts.</>;
  }
}

/** Says plainly when the page is about the example, with the one way to make it yours. */
export async function ExampleLine({ load }: { load: HomeLoad }) {
  const { mode, reason } = await load.context;
  if (mode === "mine" || !reason) return null;
  return (
    <div className="mb-3 flex flex-col items-start gap-1 px-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-0">
      <p className="text-pretty text-[14px] leading-5 text-oa-muted-fg">
        <span className="mr-2 inline-flex h-[22px] items-center rounded border border-[color-mix(in_srgb,var(--oa-primary)_45%,transparent)] bg-[color-mix(in_srgb,var(--oa-primary)_7%,transparent)] px-2 align-[1px] text-[13px] font-medium text-oa-primary">
          Example
        </span>
        {reasonWords(reason)}
      </p>
      {reason === "signed-out" ? <HomeSignIn /> : null}
    </div>
  );
}
