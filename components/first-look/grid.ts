/**
 * The first look's card rows. The column count follows how many cards there are, so every row ends full at every
 * width (owner rule 4: no empty space, cards one fixed width): two cards side by side, three across, four as two by
 * two then four across, six as two by three then three across. Columns follow the panel's own width (a container
 * query), not the window's, so the sidebar never decides it. Literal strings, so Tailwind sees every class.
 */
const GRID: Record<number, string> = {
  1: "grid grid-cols-1 gap-3",
  2: "grid grid-cols-1 gap-3 [@container(min-width:34rem)]:grid-cols-2",
  3: "grid grid-cols-1 gap-3 [@container(min-width:40rem)]:grid-cols-3",
  4: "grid grid-cols-1 gap-3 [@container(min-width:34rem)]:grid-cols-2 [@container(min-width:56rem)]:grid-cols-4",
  6: "grid grid-cols-1 gap-3 [@container(min-width:34rem)]:grid-cols-2 [@container(min-width:48rem)]:grid-cols-3",
};

export function gridFor(cards: number): string {
  return GRID[cards] ?? GRID[cards >= 6 ? 6 : cards >= 4 ? 4 : 3]!;
}

/** The wrapper that makes the panel's width the one the grid reads. */
export const GRID_HOST = "[container-type:inline-size]";

export const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";

/**
 * One setup row (an agent, or the reason to give), sized to its content (owner rule 4: no card with an empty lower
 * half). Wide: icon, name, what it does, what it would have caught, then the control, on one line. Narrow: icon, name
 * and control on top, the line and the evidence under them. The `W:` steps read the panel's width.
 */
export const ROW = "flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5";
export const ROW_ICON = "order-1 shrink-0";
export const ROW_NAME = "order-2 min-w-0 flex-1 text-[14px] font-semibold leading-5 text-oa-fg [@container(min-width:48rem)]:w-52 [@container(min-width:48rem)]:flex-none";
export const ROW_LINE =
  "order-4 basis-full pl-10 text-pretty text-[13.5px] leading-5 text-oa-fg [@container(min-width:48rem)]:order-3 [@container(min-width:48rem)]:basis-0 [@container(min-width:48rem)]:flex-1 [@container(min-width:48rem)]:pl-0";
export const ROW_EVIDENCE =
  "order-5 flex min-w-0 basis-full items-center gap-2 pl-10 [@container(min-width:48rem)]:order-4 [@container(min-width:48rem)]:w-56 [@container(min-width:48rem)]:basis-auto [@container(min-width:48rem)]:pl-0";
export const ROW_CONTROL = "order-3 shrink-0 [@container(min-width:48rem)]:order-5";
export const ROW_NOTE = "order-6 basis-full pl-10 text-pretty text-[12.5px] leading-[18px]";
export const ROWS = "oa-surface min-w-0 divide-y divide-oa-border overflow-hidden border border-oa-border bg-oa-card";
