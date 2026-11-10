/**
 * Class strings shared by the screener's client controls. Kept apart from
 * `shared.tsx` because that file imports the page kit, which is server-only
 * (it pulls in the site header and its data loaders).
 */
export const CONTROL =
  "inline-flex h-8 items-center gap-1.5 rounded-md border border-oa-border bg-oa-card px-2.5 text-[13px] text-oa-fg outline-none transition-colors hover:bg-oa-accent focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";

export const CONTROL_ACTIVE = "border-oa-fg";

/** Colours for up to four overlaid names. They hold their contrast on the cream and on the dark page. */
export const LINE_COLORS = ["var(--oa-primary)", "#3a8f96", "#8a63b8", "var(--oa-fg)"];
