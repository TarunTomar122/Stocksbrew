import Link from "next/link";

import { FOCUS, NUM } from "@/components/oa/kit";
import { StockLogo } from "@/components/stock-logo";
import { anyOf, watchEarningsManyHref, watchMovesHref } from "@/lib/agents-plain/ask-links";
import { pct } from "@/lib/memo/format";
import type { FactKind, MemoItem, MemoVisual } from "@/lib/memo/types";

import { MiniBars } from "./mini-bars";
import { hasReason } from "./explain";

/**
 * A section of the memo as cards: one figure, a short line that reads on
 * from it, a small picture where one helps, and the memo's full sentence
 * always shown under it (owner, Nov 11: no "Why" toggle). The whole card opens
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

function Card({ item, example }: { item: MemoItem; example: boolean }) {
  const card = item.card ?? null;
  const single = item.tickers.length === 1 ? item.tickers[0]! : null;
  const figureTone = card?.sign === "up" ? "text-signal-bullish" : card?.sign === "down" ? "text-signal-bearish" : "text-oa-fg";
  // The full sentence under the figure, unless it only restates it ("AST SpaceMobile fell 8.7% on Tuesday, Nov 10.").
  const detail = card && hasReason(item) ? item.text : null;
  return (
    <li className="oa-surface relative flex min-w-0 flex-col border border-oa-border bg-oa-card p-3.5 transition-colors hover:border-[color-mix(in_srgb,var(--oa-fg)_25%,transparent)] hover:bg-oa-accent">
      <Link
        href={item.href}
        prefetch={false}
        aria-label={card ? `${card.figure} ${card.label}: ${item.linkLabel}` : item.linkLabel}
        className={`absolute inset-0 z-0 rounded-[inherit] ${FOCUS}`}
      />
      <div className="flex items-start gap-3">
        <span className="mt-1">{single ? <StockLogo ticker={single} size={24} eager /> : <Icon kind={item.kind} />}</span>
        {card ? (
          <p className="min-w-0">
            <span className={`${NUM} block text-[22px] font-semibold leading-7 tracking-[-0.01em] ${figureTone}`}>{card.figure}</span>
            <span className="block text-pretty text-[14px] leading-5 text-oa-fg">{card.label}</span>
          </p>
        ) : (
          <p className="min-w-0 text-pretty text-[14px] leading-5 text-oa-fg">{item.text}</p>
        )}
      </div>
      {card?.visual ? <Visual visual={card.visual} example={example} /> : null}
      {detail ? <p className="mt-2.5 text-pretty text-[13.5px] leading-5 text-oa-muted-fg">{detail}</p> : null}
      <p className="mt-auto pt-2.5 text-[12px] leading-4 text-oa-muted-fg">{item.source}</p>
    </li>
  );
}

export function MemoCards({
  title,
  items,
  empty,
  example,
  watchable,
}: {
  title: string;
  items: MemoItem[];
  empty: string;
  example: boolean;
  /** Which items get an agent as their action: every risk, and a report coming up. */
  watchable: (item: MemoItem) => boolean;
}) {
  const watches = watchesFor(items.filter(watchable));
  return (
    <section aria-label={title} className="min-w-0">
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
      {items.length > 0 ? (
        <ul
          // No empty half-rows: a lone or odd last card takes the whole row on tablets, and on wide screens the
          // columns are only as many as the cards (auto-fit), so one card spans the row and two share it.
          className="oa-card-grid grid grid-cols-1 gap-3 sm:grid-cols-2 sm:[&>li:last-child:nth-child(odd)]:col-span-2 lg:[grid-template-columns:repeat(auto-fit,minmax(16rem,1fr))] lg:[&>li:last-child:nth-child(odd)]:col-span-1"
        >
          {items.map((item) => (
            <Card key={item.id} item={item} example={example} />
          ))}
        </ul>
      ) : (
        <p className="oa-surface border border-oa-border bg-oa-card px-4 py-3 text-[14px] leading-5 text-oa-muted-fg">{empty}</p>
      )}
    </section>
  );
}
