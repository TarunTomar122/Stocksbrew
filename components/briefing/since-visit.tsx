import Link from "next/link";

import { StockLogo } from "@/components/stock-logo";
import { gridColumns } from "@/lib/briefing-face";
import { shortCompanyName } from "@/lib/plain-copy";
import type { SinceCard, SinceView } from "@/lib/since-visit";

import { sharePrice, signedPct } from "./format";

/**
 * "Since you looked yesterday": under the header of a member's briefing (BriefingFace's `top`), what changed on their
 * own stocks since their previous visit (lib/since-visit.ts), one card per stock with its logo, price, today's move
 * and one fact, and a tile with when they last looked and their next report wherever the last row has room. One quiet
 * line when nothing changed. The page renders it only when `sinceShows` says so and records the visit with its own
 * beacon. Server-rendered, no client code.
 */

const CARD = "oa-surface border border-oa-border bg-oa-card";
const HOVER = "transition-colors hover:border-[color-mix(in_srgb,var(--oa-fg)_25%,transparent)] hover:bg-oa-accent";
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]";
const LG_COLS: Record<number, string> = { 3: "lg:grid-cols-3", 4: "lg:grid-cols-4" };
const XXL_COLS: Record<number, string> = { 3: "2xl:grid-cols-3", 4: "2xl:grid-cols-4", 5: "2xl:grid-cols-5" };

const toneText = (pct: number | null) =>
  pct == null || Math.abs(pct) < 0.005 ? "text-oa-fg" : pct > 0 ? "text-signal-bullish" : "text-signal-bearish";

function CallChip({ call }: { call: SinceCard["call"] }) {
  if (!call) return null;
  const tone =
    call === "Buy more"
      ? "text-signal-bullish border-[color-mix(in_srgb,var(--signal-bullish)_35%,transparent)]"
      : call === "Sell some"
        ? "text-signal-bearish border-[color-mix(in_srgb,var(--signal-bearish)_35%,transparent)]"
        : "text-oa-muted-fg border-oa-border";
  return <span className={`inline-flex h-5 shrink-0 items-center rounded border px-1.5 text-[11.5px] font-medium leading-none ${tone}`}>{call}</span>;
}

function SinceTile({ card }: { card: SinceCard }) {
  const short = shortCompanyName(card.name);
  const named = short && short.toUpperCase() !== card.ticker ? short : null;
  const price = sharePrice(card.price);
  // A call change already names the new call in its line: the badge would say it twice.
  const call = card.kind === "call" ? null : card.call;
  return (
    <li className="min-w-0">
      <Link href={card.href} prefetch={false} className={`${CARD} ${HOVER} ${FOCUS} flex h-full flex-col gap-2 px-3.5 py-3`}>
        <span className="flex min-w-0 items-start justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2.5">
            <StockLogo ticker={card.ticker} size={28} eager />
            <span className="min-w-0 leading-5">
              <span className="oa-mono block text-[14px] font-semibold text-oa-fg">{card.ticker}</span>
              {named ? <span className="block truncate text-[12.5px] leading-4 text-oa-muted-fg">{named}</span> : null}
            </span>
          </span>
          <span className="flex shrink-0 flex-col items-end leading-5">
            {card.pct != null ? <span className={`oa-mono text-[18px] font-semibold tabular-nums tracking-[-0.01em] ${toneText(card.pct)}`}>{signedPct(card.pct, 1)}</span> : null}
            {price ? <span className="oa-mono text-[12px] tabular-nums text-oa-muted-fg">{price}</span> : null}
          </span>
        </span>
        <span className="flex min-w-0 flex-1 justify-between gap-2">
          <span className="min-w-0 self-start text-pretty text-[13.5px] font-medium leading-5 text-oa-fg">{card.line}</span>
          <span className="shrink-0 self-end">
            <CallChip call={call} />
          </span>
        </span>
      </Link>
    </li>
  );
}

/**
 * The tile that ends a short last row (owner rule 4: no empty band beside the cards): when they last looked, and
 * their next report. Only at the sizes where the row has room; never on a phone.
 */
function SummaryTile({ view, span }: { view: SinceView; span: string }) {
  return (
    <li className={`hidden min-w-0 ${span}`}>
      <div className={`${CARD} flex w-full flex-col justify-center gap-3 px-3.5 py-3`}>
        <div className="min-w-0 leading-5">
          <span className="block text-[12.5px] text-oa-muted-fg">You last looked</span>
          <span className="block text-[13.5px] font-medium text-oa-fg">{view.lookedAt}</span>
        </div>
        {view.next ? (
          <Link href={`/stock/${encodeURIComponent(view.next.ticker)}`} prefetch={false} className={`${FOCUS} -mx-1 flex min-w-0 items-center gap-2 rounded px-1 leading-5 hover:bg-oa-accent`}>
            <StockLogo ticker={view.next.ticker} size={20} eager />
            <span className="min-w-0">
              <span className="block text-[12.5px] text-oa-muted-fg">Next up</span>
              <span className="block text-pretty text-[13.5px] font-medium text-oa-fg">{view.next.line}</span>
            </span>
          </Link>
        ) : null}
      </div>
    </li>
  );
}

/** Classes for the summary tile at each size: the columns left in the last row, or hidden when the row is full. */
const SM_FILL: Record<number, string> = { 0: "sm:hidden", 1: "sm:flex sm:col-span-1" };
const LG_FILL: Record<number, string> = { 0: "lg:hidden", 1: "lg:flex lg:col-span-1", 2: "lg:flex lg:col-span-2", 3: "lg:flex lg:col-span-3" };
const XXL_FILL: Record<number, string> = { 0: "2xl:hidden", 1: "2xl:flex 2xl:col-span-1", 2: "2xl:flex 2xl:col-span-2", 3: "2xl:flex 2xl:col-span-3", 4: "2xl:flex 2xl:col-span-4" };
const left = (count: number, columns: number) => (columns - (count % columns)) % columns;

export function SinceVisit({ view }: { view: SinceView }) {
  const { cards } = view;
  if (cards.length === 0) {
    // "Nothing changed" only when every read answered and no change went to another module on the page.
    return view.quiet_ok ? <p className="px-2 text-[13.5px] leading-5 text-oa-muted-fg sm:px-0">{view.quiet}.</p> : null;
  }
  const columns = { sm: 2, lg: gridColumns(cards.length, [3, 4]), xxl: gridColumns(cards.length, [3, 4, 5]) };
  const grid = `grid grid-cols-1 gap-3 sm:grid-cols-2 ${LG_COLS[columns.lg]} ${XXL_COLS[columns.xxl]}`;
  const fill = `${SM_FILL[left(cards.length, columns.sm)]} ${LG_FILL[left(cards.length, columns.lg)]} ${XXL_FILL[left(cards.length, columns.xxl)]}`;
  return (
    <section aria-labelledby="since-visit-title" className="min-w-0">
      <h2 id="since-visit-title" className="flex items-center gap-2 px-2 pb-2 text-[14px] font-semibold leading-6 text-oa-fg sm:px-0">
        {view.title}
        <span className="oa-mono inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-oa-accent px-1.5 text-[11.5px] font-medium tabular-nums text-oa-fg">
          {cards.length}
        </span>
      </h2>
      {/* At most six cards, and the tile fills whatever the last row leaves, so every row ends full. */}
      <ul aria-label="What changed on your stocks" className={grid}>
        {cards.map((card) => (
          <SinceTile key={card.ticker} card={card} />
        ))}
        <SummaryTile view={view} span={fill} />
      </ul>
    </section>
  );
}
