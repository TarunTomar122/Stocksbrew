import Link from "next/link";

/** The primary button's look, on a link (a button inside a link is not valid HTML). */
const PRIMARY =
  "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-[color-mix(in_srgb,var(--oa-primary)_80%,#3a3480)] bg-[color-mix(in_srgb,var(--oa-primary)_90%,#3a3480)] px-3 text-sm font-medium text-oa-primary-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.22),inset_0_-1px_0_rgba(58,52,128,0.30)] outline-none transition-all hover:bg-oa-primary focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]";

/**
 * "Watch this idea": opens the basket editor with this theme's companies and reasons, to replay and switch on as an
 * agent (lib/basket-agent). One per page.
 */
export function WatchIdeaLink({
  theme,
  className = "",
}: {
  theme: string;
  className?: string;
}) {
  return (
    <Link
      prefetch={false}
      href={`/agents/baskets/new?theme=${encodeURIComponent(theme)}`}
      className={`${PRIMARY} ${className}`}
    >
      Watch this idea
    </Link>
  );
}
