import Link from "next/link";

import { FOCUS, NUM } from "@/components/oa/kit";
import { StockLogo } from "@/components/stock-logo";
import { anyOf, watchEarningsManyHref, watchMovesHref } from "@/lib/agents-plain/ask-links";
import { pct } from "@/lib/memo/format";
import type { FactKind, MemoItem, MemoVisual } from "@/lib/memo/types";

import { cardWords, type NextUp } from "./card-words";
import { MiniBars } from "./mini-bars";

/**
 * A section of the memo as cards: one figure, a short label that reads on
 * from it, and a small picture or the other stocks it covers where they help
 * (owner, Nov 12: a figure, a label and one line at most). The whole card opens
 * its evidence page, so no link words repeat on every card; the watches the
 * cards suggest are one or two links on the section's heading, not one per
 * card (owner, Nov 11). Memos written before the cards existed show their
 * sentence instead.
 */

type LinkTo = { label: string; href: string };

/**
 * The next steps for a section's cards, said once on its heading: a reminder before the report for the earnings
 * risks, a big-move alert for the other risks on one stock, each one agent on all the stocks it names. Risks about
 * the whole portfolio get none.
 */
export function watchesFor(items: Array<Pick<MemoItem, "kind" | "tickers">>): LinkTo[] {
  const earnings: string[] = [];
  const moves: string[] = [];
  for (const item of items) {
    const ticker = item.tickers.length === 1 ? item.tickers[0]! : null;
    if (!ticker) continue;
    (item.kind === "upcoming_risk" || item.kind === "upcoming" ? earnings : moves).push(ticker);
  }
  const out: LinkTo[] = [];
  // Names the stocks (up to three), since only some cards in a section have one: "NVDA or AAPL", else "any of these".
  const who = (list: string[]) => (new Set(list).size <= 3 ? anyOf(list) : null) ?? "any of these";
  const moveHref = moves.length ? watchMovesHref(moves, 5) : null;
  if (moveHref) out.push({ label: `Tell me when ${who(moves)} moves 5% in a day`, href: moveHref });
  const earnHref = earnings.length ? watchEarningsManyHref(earnings, 3) : null;
  if (earnHref) out.push({ label: `Tell me 3 days before ${who(earnings)} reports`, href: earnHref });
  return out;
}

function Icon({ kind }: { kind: FactKind }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  let body: React.ReactNode;
  switch (kind) {
    case "sector":
    case "concentration":
      body = (
        <>
          <path d="M10 3a7 7 0 1 0 7 7h-7z" {...common} />
          <path d="M12.5 1.8A7 7 0 0 1 18.2 7.5H12.5z" {...common} />
        </>
      );
      break;
    case "upcoming":
    case "upcoming_risk":
    case "report":
      body = (
        <>
          <rect x="3" y="4.5" width="14" height="12.5" rx="2" {...common} />
          <path d="M3 8.5h14M7 2.5v4M13 2.5v4" {...common} />
        </>
      );
      break;
    case "dividend":
    case "dividend_risk":
      body = (
        <>
          <circle cx="10" cy="10" r="7" {...common} />
          <path d="M12.3 7.6c-.4-.8-1.3-1.2-2.3-1.2-1.3 0-2.3.7-2.3 1.7 0 2.3 4.8 1.2 4.8 3.7 0 1-1.1 1.8-2.5 1.8-1.1 0-2-.5-2.4-1.3M10 5v1.4M10 13.6V15" {...common} />
        </>
      );
      break;
    case "stress":
      body = <path d="M2.5 6.5l4 4 3-3 4.5 6 3.5-3" {...common} />;
      break;
    case "congress":
    case "fund":
    case "insider":
      body = (
        <>
          <path d="M3 8h14L10 3.5zM4.5 8v7M8 8v7M12 8v7M15.5 8v7M3 16.5h14" {...common} />
        </>
      );
      break;
    default:
      body = <circle cx="10" cy="10" r="3" {...common} />;
  }
  return (
    <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-md bg-oa-bg text-oa-muted-fg">
      <svg viewBox="0 0 20 20" className="size-4">
        {body}
      </svg>
    </span>
  );
}

function Visual({ visual, example }: { visual: MemoVisual; example: boolean }) {
  if (visual.kind === "share") {
    const own = visual.benchmarkPct !== null ? (example ? "Example" : "Yours") : visual.label || (example ? "Example" : "Yours");
    return (
      <MiniBars
        className="mt-3"
        domain={[0, 100]}
        bars={[
          { label: own, value: visual.pct, text: pct(visual.pct), series: "a" },
          ...(visual.benchmarkPct !== null ? [{ label: "S&P 500", value: visual.benchmarkPct, text: pct(visual.benchmarkPct), series: "b" as const }] : []),
        ]}
      />
    );
  }
  const sign = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${pct(value)}`;
  return (
    <MiniBars
      className="mt-3"
      bars={[
        { label: "Today's mix", value: visual.portfolio, text: sign(visual.portfolio), series: "a" },
        { label: "S&P 500", value: visual.market, text: sign(visual.market), series: "b" },
      ]}
    />
  );
}

/** "Then [logo] AVGO Thursday": the other stocks a card covers, named once each instead of "then one more". */
function NextLine({ next, moreCount }: { next: NextUp[]; moreCount: number }) {
  return (
    <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] leading-5 text-oa-muted-fg">
      <span>Then</span>
      {next.map((up) => (
        <span key={up.ticker} className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <StockLogo ticker={up.ticker} size={16} eager />
          <span className={`${NUM} font-medium text-oa-fg`}>{up.ticker}</span>
          {up.when ? <span>{up.when}</span> : null}
        </span>
      ))}
      {moreCount > 0 ? <span className="whitespace-nowrap">and {moreCount} more</span> : null}
    </p>
  );
}

function Card({ item, example, monday, today, across }: { item: MemoItem; example: boolean; monday: string; today: string; across: boolean }) {
  const card = item.card ?? null;
  const words = cardWords(item, monday, today);
  // The card leads with the stock its figure is about: the only one, or the first of a report or dividend list.
  const lead = item.tickers.length === 1 || (words && words.next.length > 0) ? item.tickers[0]! : null;
  const figureTone = card?.sign === "up" ? "text-signal-bullish" : card?.sign === "down" ? "text-signal-bearish" : "text-oa-fg";
  const visual = card?.visual ? <Visual visual={card.visual} example={example} /> : null;
  return (
    <li className="oa-surface relative flex h-full min-w-0 flex-col border border-oa-border bg-oa-card p-3.5 transition-colors hover:border-[color-mix(in_srgb,var(--oa-fg)_25%,transparent)] hover:bg-oa-accent">
      {/* Where the facts come from sits in the hover title, not as a line on the card (owner rule 4). */}
      <Link
        href={item.href}
        prefetch={false}
        title={item.source || undefined}
        aria-label={words ? `${words.figure} ${words.label}: ${item.linkLabel}` : item.linkLabel}
        className={`absolute inset-0 z-0 rounded-[inherit] ${FOCUS}`}
      />
      <div className={`flex flex-col ${across ? "lg:flex-row lg:items-center lg:gap-8" : ""}`}>
        <div className={`flex min-w-0 items-start gap-3 ${across ? "lg:flex-1" : ""}`}>
          <span className="mt-1">{lead ? <StockLogo ticker={lead} size={24} eager /> : <Icon kind={item.kind} />}</span>
          {words ? (
            <div className="min-w-0">
              <p>
                <span className={`${NUM} block text-[22px] font-semibold leading-7 tracking-[-0.01em] ${figureTone}`}>{words.figure}</span>
                <span className="block text-pretty text-[14px] leading-5 text-oa-fg">{words.label}</span>
              </p>
              {words.next.length > 0 ? <NextLine next={words.next} moreCount={words.moreCount} /> : null}
            </div>
          ) : (
            <p className="min-w-0 text-pretty text-[14px] leading-5 text-oa-fg">{item.text}</p>
          )}
        </div>
        {visual ? <div className={across ? "lg:flex-1 lg:[&>*]:mt-0" : ""}>{visual}</div> : null}
      </div>
    </li>
  );
}

export function MemoCards({
  title,
  items,
  example,
  watchable,
  monday,
  today,
  className = "min-w-0",
  gridClassName = "grid grid-cols-1 gap-3 sm:grid-cols-2",
  across = false,
}: {
  title: string;
  items: MemoItem[];
  example: boolean;
  /** Which items get an agent as their action: every risk, and a report coming up. */
  watchable: (item: MemoItem) => boolean;
  /** The memo's Monday, to read the cards' stored dates ("Nov 19") with their year. */
  monday: string;
  /** Today in New York, for "Today" and "Thursday" in place of dates. */
  today: string;
  /** The section's place in its row (rows.ts packedSection). */
  className?: string;
  /** Its card list's columns (rows.ts packedGrid). */
  gridClassName?: string;
  /** A lone card on a wide row: its picture sits beside the figure, not under it. */
  across?: boolean;
}) {
  // Nothing to show: no section, not a card saying so (owner rule 4).
  if (items.length === 0) return null;
  const watches = watchesFor(items.filter(watchable));
  return (
    <section aria-label={title} className={className}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-1 pb-2">
        <h2 className="oa-label">{title}</h2>
        {watches.length > 0 ? (
          <p className="flex flex-wrap gap-x-4 gap-y-0.5">
            {watches.map((watch) => (
              <Link
                key={watch.href}
                href={watch.href}
                prefetch={false}
                className={`rounded text-[13px] font-medium leading-5 text-oa-primary underline-offset-2 hover:underline ${FOCUS}`}
              >
                {watch.label}
              </Link>
            ))}
          </p>
        ) : null}
      </div>
      <ul className={`oa-card-grid ${gridClassName}`}>
        {items.map((item) => (
          <Card key={item.id} item={item} example={example} monday={monday} today={today} across={across} />
        ))}
      </ul>
    </section>
  );
}
