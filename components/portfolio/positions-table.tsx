"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { CallCell, Dash, EarningsCell, FOCUS, NUM, Pct, signTone, TD, TH } from "@/components/portfolio/parts";
import { StockLogo } from "@/components/stock-logo";
import { ThesisLine } from "@/components/thesis/thesis-line";
import { WholeRows } from "@/components/wire/whole-rows";
import { needsLook, orderPositions } from "@/lib/portfolio-attention";
import { reportsWithin } from "@/lib/portfolio-filters";
import { CALL_PLAIN } from "@/lib/plain-copy";
import { callWord } from "@/lib/stock-chart";
import {
  fmtMoney,
  fmtSignedMoney,
  type PortfolioPosition,
  type PortfolioTotals,
  type SortKey,
} from "@/lib/portfolio-shared";

type Direction = "asc" | "desc";
type Column = { key: SortKey; label: string; align: "left" | "right"; first: Direction; hideBelow?: "lg" | "xl" | "2xl" };

// The owner's order (Nov 12): the stock, its price and day, the overall gain in dollars then percent, our call,
// then avg cost, value and the next report. Nothing else. The total sits under the same columns.
const HOLDING_COLUMNS: Column[] = [
  { key: "ticker", label: "Stock", align: "left", first: "asc" },
  { key: "price", label: "Price", align: "right", first: "desc" },
  { key: "dayPct", label: "Day", align: "right", first: "desc" },
  { key: "gain", label: "Gain", align: "right", first: "desc" },
  { key: "gainPct", label: "Gain %", align: "right", first: "desc" },
  { key: "stance", label: "Our call", align: "left", first: "asc" },
  // Between md and xl the sidebar leaves no room for all nine: cost and the report date wait for a wider screen.
  { key: "avgCost", label: "Avg cost", align: "right", first: "desc", hideBelow: "xl" },
  { key: "value", label: "Value", align: "right", first: "desc" },
  { key: "earnings", label: "Earnings", align: "left", first: "asc", hideBelow: "xl" },
];

const WATCH_COLUMNS: Column[] = [
  { key: "ticker", label: "Stock", align: "left", first: "asc" },
  { key: "price", label: "Price", align: "right", first: "desc" },
  { key: "dayPct", label: "Day", align: "right", first: "desc" },
  { key: "stance", label: "Our call", align: "left", first: "asc" },
  { key: "earnings", label: "Earnings", align: "left", first: "asc" },
];

const HIDE: Record<NonNullable<Column["hideBelow"]>, string> = {
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
  "2xl": "hidden 2xl:table-cell",
};

function colClass(column: Column): string {
  return `${column.hideBelow ? HIDE[column.hideBelow] : ""} ${column.align === "right" ? "text-right" : "text-left"}`;
}

/* ── the table ───────────────────────────────────────────────────────────── */

const STICKY_RULE_BELOW = "shadow-[inset_0_-1px_0_var(--oa-border)]";
const STICKY_RULE_ABOVE = "shadow-[inset_0_1px_0_var(--oa-border)]";

function SortHeader({
  column,
  active,
  direction,
  onSort,
  first,
}: {
  column: Column;
  active: boolean;
  direction: Direction;
  onSort: (column: Column) => void;
  first: boolean;
}) {
  return (
    <th
      scope="col"
      aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : "none"}
      // The header sticks to the top of the scroll box; a collapsed table border would stay behind, so the rule under it
      // is drawn on the cell.
      className={`${TH} ${STICKY_RULE_BELOW} ${colClass(column)} ${first ? "pl-3" : ""}`}
    >
      <button
          type="button"
          onClick={() => onSort(column)}
          className={`inline-flex items-center gap-1 rounded uppercase tracking-[inherit] hover:text-oa-fg ${FOCUS} ${active ? "text-oa-fg" : ""} ${
            column.align === "right" ? "flex-row-reverse" : ""
          }`}
        >
          {column.label}
          <span aria-hidden="true" className={`text-[9px] ${active ? "" : "opacity-0"}`}>
            {direction === "asc" ? "▲" : "▼"}
          </span>
        </button>
    </th>
  );
}

/** The table's stock cell: logo, ticker (the link to the stock) and the reason watcher's word when it needs a look. */
function StockCell({ position }: { position: PortfolioPosition }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <StockLogo ticker={position.ticker} market="US" size={20} circle className="shrink-0" />
      <div className="flex min-w-0 items-baseline gap-2">
        {/* Ticker only: long company names wrapped over several lines and pushed the numbers apart (owner, Nov 11).
            The name stays on hover and for screen readers. */}
        <Link
          href={`/stock/${position.ticker}`}
          onClick={(event) => event.stopPropagation()}
          title={position.name || undefined}
          aria-label={position.name ? `${position.ticker}, ${position.name}` : position.ticker}
          className={`oa-mono block text-[14px] font-medium leading-5 text-oa-fg hover:underline ${FOCUS}`}
        >
          {position.ticker}
        </Link>
        <ThesisLine instrumentId={position.instrument_id} inline />
      </div>
    </div>
  );
}

function ValueCell({ position }: { position: PortfolioPosition }) {
  if (position.value === null) return <Dash />;
  return (
    <span className={`${NUM} text-oa-fg`} title={position.valueSource === "entered" ? "The value you typed in. Add shares to price it live." : undefined}>
      {fmtMoney(position.value, position.value >= 100_000 ? 0 : 2)}
      {position.valueSource === "entered" ? <span className="text-oa-muted-fg">*</span> : null}
    </span>
  );
}

function GainCell({ position, stacked = false }: { position: PortfolioPosition; stacked?: boolean }) {
  if (position.gain === null) return <Dash />;
  if (!stacked) {
    return <span className={`${NUM} ${signTone(position.gain)}`}>{fmtSignedMoney(position.gain, Math.abs(position.gain) >= 100_000 ? 0 : 2)}</span>;
  }
  return (
    <span className={`${NUM} ${signTone(position.gain)}`}>
      {fmtSignedMoney(position.gain, Math.abs(position.gain) >= 100_000 || stacked ? 0 : 2)}
      {position.gainPct !== null ? (
        <span className={stacked ? "block text-[11.5px] leading-4" : "ml-1.5 text-[11.5px]"}>{`${position.gainPct >= 0 ? "+" : "−"}${Math.abs(position.gainPct).toFixed(1)}%`}</span>
      ) : null}
    </span>
  );
}

/* ── the phone card ──────────────────────────────────────────────────────── */

/** Cards shown before the "Show N more" toggle. */
const CARD_FOLD = 8;
/** The sort control's value for the default order: the rows that need a look first. */
const LOOK_FIRST = "look-first";

function fmtQty(shares: number): string {
  return shares.toLocaleString("en-US", { maximumFractionDigits: Math.abs(shares) >= 1 ? 2 : 4 });
}

/** Today's move with its arrow: "▼ 4.49%". */
function DayMove({ value }: { value: number | null }) {
  if (value === null) return <Dash />;
  // A flat day gets no arrow and no colour.
  if (Math.abs(value) < 0.005) return <span className={`${NUM} whitespace-nowrap text-oa-muted-fg`}>0.00%</span>;
  return (
    <span className={`${NUM} whitespace-nowrap ${signTone(value)}`}>
      <span aria-hidden="true" className="mr-0.5 text-[9px] align-[1px]">
        {value > 0 ? "▲" : "▼"}
      </span>
      <span className="sr-only">{value > 0 ? "up " : "down "}</span>
      {Math.abs(value).toFixed(2)}%
    </span>
  );
}

const CALL_TONE: Record<string, string> = {
  Add: "text-signal-bullish",
  Trim: "text-signal-bearish",
  Hold: "text-oa-fg",
};

/** Our call as one small chip with its own level: "Buy more below $267", "Sell some above $420", or "Keep". */
function CallChip({ position, stacked = false }: { position: PortfolioPosition; stacked?: boolean }) {
  const word = callWord(position.stance);
  if (!word) return null;
  const level = position.zone ? position.zone.label.charAt(0).toLowerCase() + position.zone.label.slice(1) : null;
  if (stacked) {
    // A watched stock's card has the call on the right of the name: the level goes under the chip, so the name keeps its room.
    return (
      <span className="flex flex-col items-end gap-1">
        <span
          className={`inline-flex h-6 items-center rounded border px-1.5 text-[12px] font-medium whitespace-nowrap ${
            position.needsAttention ? "border-current" : "border-oa-border"
          } ${CALL_TONE[word]}`}
          title={position.needsAttention ? "The price is inside this call's zone now" : undefined}
        >
          {CALL_PLAIN[word]}
        </span>
        {level ? <span className={`${NUM} whitespace-nowrap text-[12px] leading-4 text-oa-muted-fg`}>{level}</span> : null}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center gap-1 rounded border px-1.5 text-[12px] whitespace-nowrap ${
        position.needsAttention ? "border-current" : "border-oa-border"
      } ${CALL_TONE[word]}`}
      title={position.needsAttention ? "The price is inside this call's zone now" : undefined}
    >
      <span className="font-medium">{CALL_PLAIN[word]}</span>
      {level ? <span className={`${NUM} text-oa-muted-fg`}>{level}</span> : null}
    </span>
  );
}

/**
 * The holdings cards' money row: what went in, what it is worth, the gain and the gain in percent, on one line. The
 * labels sit once over the list (MoneyHeader), not on every card; the grid is shared so the two line up.
 */
const MONEY_GRID = "grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_4rem] gap-x-2";

function MoneyHeader() {
  return (
    <div className={`${MONEY_GRID} border-b border-oa-border bg-oa-bg px-3 py-1.5 text-[11.5px] leading-4 text-oa-muted-fg`}>
      <span>Invested</span>
      <span className="text-right">Value</span>
      <span className="text-right">Gain</span>
      <span className="text-right">Gain %</span>
    </div>
  );
}

/** Cents under $10,000, whole dollars above, so a card's money row stays on one line. */
function cardDigits(value: number): number {
  return Math.abs(value) >= 10_000 ? 0 : 2;
}

/**
 * A stock on a phone (owner, Nov 12, after a broker app): the logo, name, price and today's move; for a holding the
 * average cost and shares on the right, then one quiet money row, then our call and a report date when one is two
 * weeks out or closer. A watched stock has our call on the right instead. The card itself is the link to the
 * stock, so nothing inside it links on its own.
 */
function PositionCard({
  position,
  kind,
  today,
  money,
}: {
  position: PortfolioPosition;
  kind: "holding" | "watchlist";
  today: string;
  /** Some holding in the list has shares, so the money row shows (dashes where this one has none). */
  money: boolean;
}) {
  const holding = kind === "holding";
  const reports = reportsWithin(position, today);
  const hasCall = callWord(position.stance) !== null;
  const showName = position.name && position.name.toUpperCase() !== position.ticker.toUpperCase();
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <StockLogo ticker={position.ticker} market="US" size={36} circle className="shrink-0" />
          <div className="min-w-0">
            <div className="flex min-w-0 items-baseline gap-1.5">
              <span className="min-w-0 truncate text-[15px] font-medium leading-5 text-oa-fg">{showName ? position.name : position.ticker}</span>
              {showName ? <span className="oa-mono shrink-0 text-[11.5px] text-oa-muted-fg">{position.ticker}</span> : null}
            </div>
            <div className="mt-0.5 flex items-baseline gap-2 text-[13.5px] leading-5">
              <span className={`${NUM} text-oa-fg`}>{position.price !== null ? fmtMoney(position.price) : <Dash />}</span>
              <DayMove value={position.dayPct} />
            </div>
          </div>
        </div>
        {holding ? (
          position.avgCost !== null || position.shares !== null ? (
            <div className="shrink-0 text-right text-[12.5px] leading-5 text-oa-muted-fg">
              {position.avgCost !== null ? (
                <div>
                  Avg <span className={`${NUM} text-oa-fg`}>{fmtMoney(position.avgCost)}</span>
                </div>
              ) : null}
              {position.shares !== null ? (
                <div>
                  Qty <span className={`${NUM} text-oa-fg`}>{fmtQty(position.shares)}</span>
                </div>
              ) : null}
            </div>
          ) : null
        ) : hasCall ? (
          <div className="shrink-0">
            <CallChip position={position} stacked />
          </div>
        ) : null}
      </div>
      {holding && money ? (
        <div className={`${MONEY_GRID} ${NUM} whitespace-nowrap text-[13px] leading-5`}>
          <span className="truncate text-oa-muted-fg">{position.cost !== null ? fmtMoney(position.cost, cardDigits(position.cost)) : <Dash />}</span>
          <span className="truncate text-right text-oa-fg" title={position.valueSource === "entered" ? "The value you typed in. Add shares to price it live." : undefined}>
            {position.value !== null ? (
              <>
                {fmtMoney(position.value, cardDigits(position.value))}
                {position.valueSource === "entered" ? <span className="text-oa-muted-fg">*</span> : null}
              </>
            ) : (
              <Dash />
            )}
          </span>
          <span className={`truncate text-right ${position.gain !== null ? signTone(position.gain) : ""}`}>
            {position.gain !== null ? fmtSignedMoney(position.gain, cardDigits(position.gain)) : <Dash />}
          </span>
          <span className="truncate text-right">
            <Pct value={position.gainPct} digits={1} />
          </span>
        </div>
      ) : null}
      {/* A watched stock's card is price, day and our call with its level, nothing else (council, Nov 12). */}
      {!holding ? null : hasCall || reports ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {hasCall ? <CallChip position={position} /> : null}
          {reports ? (
            <span className="text-[12px] text-oa-muted-fg">
              Reports <EarningsCell next={position.nextEarnings} today={today} />
            </span>
          ) : null}
          <ThesisLine instrumentId={position.instrument_id} inline />
        </div>
      ) : (
        <ThesisLine instrumentId={position.instrument_id} inline />
      )}
    </div>
  );
}

export function PositionsTable({
  positions,
  kind,
  today,
  defaultSort,
  hiddenCount = 0,
  hiddenNote,
  totals,
  columnsFrom,
  empty,
}: {
  /** Holdings only: the sums printed under the table. They cover every holding, hidden ones included. */
  totals?: PortfolioTotals;
  positions: PortfolioPosition[];
  /** The rows that decide which columns show, when `positions` is a filtered subset: the columns stay put while filtering. */
  columnsFrom?: PortfolioPosition[];
  /** Shown in place of the rows when `positions` is empty (a filter left nothing); the header and sort stay. */
  empty?: React.ReactNode;
  kind: "holding" | "watchlist";
  today: string;
  defaultSort: { key: SortKey; direction: Direction };
  hiddenCount?: number;
  hiddenNote?: React.ReactNode;
}) {
  const router = useRouter();
  // A column with nothing in it for any row (no shares entered, no cost, no call yet, no earnings date) is left
  // out rather than shown as a column of dashes. It comes back as soon as one row has a value.
  const every = columnsFrom ?? positions;
  const filled = (column: Column): boolean => {
    switch (column.key) {
      case "ticker":
        return true;
      case "avgCost":
        return every.some((position) => position.avgCost !== null);
      case "price":
        return every.some((position) => position.price !== null);
      case "dayPct":
        return every.some((position) => position.dayPct !== null);
      case "value":
        return every.some((position) => position.value !== null);
      case "gain":
        return every.some((position) => position.gain !== null);
      case "gainPct":
        return every.some((position) => position.gainPct !== null);
      case "stance":
        return every.some((position) => position.stance);
      case "earnings":
        return every.some((position) => position.nextEarnings);
      default:
        return true;
    }
  };
  const columns = (kind === "holding" ? HOLDING_COLUMNS : WATCH_COLUMNS).filter(filled);
  // The phone cards follow the same rule: the invested, value and total row shows once any holding has shares.
  const anyMoney = every.some((position) => position.value !== null || position.gain !== null);
  const sortable = columns;
  // The phone cards show about eight, then one quiet toggle for the rest; a card list never scrolls inside a box.
  const [showAll, setShowAll] = useState(false);
  const [sort, setSort] = useState(defaultSort);
  // Until a header is clicked, the rows that need a look (an orange report date, a price at its call's level, the
  // zone tint) come first, each group in the default sort. A chosen sort is a plain sort on that column.
  const [picked, setPicked] = useState(false);
  // When the sort column is hidden (no row has a value in it), sort by stock instead of silently by nothing.
  const effectiveSort = sortable.some((column) => column.key === sort.key) ? sort : { key: "ticker" as SortKey, direction: "asc" as Direction };
  // The order and what the sort control says about it come from one place (lib/portfolio-attention orderPositions):
  // the highlighted rows, then the other rows that need a look, with no column arrow, while some row in the whole list
  // needs a look and no sort was picked; otherwise exactly the arrowed column. Counted on every row, so a filter does
  // not flip it.
  const anyLook = useMemo(() => every.some((position) => needsLook(position, today)), [every, today]);
  const { lookFirst, rows: sorted } = useMemo(
    () => orderPositions(positions, effectiveSort, picked, today, every),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- effectiveSort is rebuilt each render; its fields are the deps
    [positions, effectiveSort.key, effectiveSort.direction, picked, today, every],
  );
  // The cards fold after about eight, but never before the last one that needs a look (owner rule 4).
  const fold = lookFirst ? Math.max(CARD_FOLD, sorted.filter((position) => needsLook(position, today)).length) : CARD_FOLD;

  function onSort(column: Column) {
    const key = column.key;
    setPicked(true);
    // From the needs-a-look order, a column starts at its own first direction; after that a second click flips it.
    setSort((current) =>
      !lookFirst && current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: column.first },
    );
  }

  function open(position: PortfolioPosition) {
    router.push(`/stock/${position.ticker}`);
  }

  const span = columns.length;

  // A filter that leaves nothing keeps the header and sort in place, with the note where the rows were.
  const none = positions.length === 0;

  return (
    <>
      {/* md and up: the full table. About eight rows show, the rest scroll inside the box with no scrollbar; the header
          and the Total stick to its edges, and the cut lands on a whole row (owner rule 5). One box scrolls both ways so
          the sticky rows work, and the page takes the scroll back at either end (no overscroll-contain). */}
      <WholeRows rem={31} className="scrollbar-hide hidden max-h-[31rem] overflow-auto md:block">
        <table className="w-full border-collapse text-[14px]">
          <thead className="sticky top-0 z-10">
            <tr>
              {columns.map((column, index) => (
                <SortHeader
                  key={column.key}
                  column={column}
                  active={!lookFirst && effectiveSort.key === column.key}
                  direction={effectiveSort.direction}
                  onSort={onSort}
                  first={index === 0}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {none ? (
              <tr>
                <td colSpan={span} className="p-0">
                  {empty}
                </td>
              </tr>
            ) : null}
            {sorted.map((position) => (
                  <tr
                    key={position.instrument_id}
                    data-row
                    // The row opens the stock; its ticker is the same link for the keyboard. Shares, cost, moving and
                    // removing live in Add or edit stocks above.
                    onClick={() => open(position)}
                    className={`h-12 cursor-pointer border-b border-oa-border transition-colors last:border-b-0 hover:bg-oa-accent ${
                      position.needsAttention ? "bg-[color-mix(in_srgb,var(--oa-primary)_6%,transparent)]" : ""
                    }`}
                  >
                    {columns.map((column, index) => (
                      <td key={column.key} className={`${TD} ${colClass(column)} ${index === 0 ? "pl-3" : ""}`}>
                        {column.key === "ticker" ? (
                          <StockCell position={position} />
                        ) : column.key === "price" ? (
                          position.price !== null ? <span className={`${NUM} text-oa-fg`}>{fmtMoney(position.price)}</span> : <Dash />
                        ) : column.key === "avgCost" ? (
                          position.avgCost !== null ? <span className={`${NUM} text-oa-muted-fg`}>{fmtMoney(position.avgCost)}</span> : <Dash />
                        ) : column.key === "dayPct" ? (
                          <Pct value={position.dayPct} />
                        ) : column.key === "gainPct" ? (
                          <Pct value={position.gainPct} digits={1} />
                        ) : column.key === "value" ? (
                          <ValueCell position={position} />
                        ) : column.key === "gain" ? (
                          <GainCell position={position} />
                        ) : column.key === "stance" ? (
                          <CallCell position={position} />
                        ) : (
                          <EarningsCell next={position.nextEarnings} today={today} />
                        )}
                      </td>
                    ))}
                  </tr>
            ))}
          </tbody>
          {kind === "holding" && totals && totals.value !== null && !none ? (
            <tfoot data-sticky-foot className="sticky bottom-0 z-10">
              <tr className="h-10 font-medium">
                {columns.map((column, index) => (
                  <td key={column.key} className={`${TD} ${STICKY_RULE_ABOVE} bg-oa-bg ${colClass(column)} ${index === 0 ? "pl-3" : ""}`}>
                    {column.key === "ticker" ? (
                      <span className="text-oa-fg">
                        Total
                        <span className="ml-2 font-normal text-oa-muted-fg">
                          {totals.valued} holding{totals.valued === 1 ? "" : "s"}
                        </span>
                      </span>
                    ) : column.key === "dayPct" ? (
                      <Pct value={totals.dayPct} />
                    ) : column.key === "value" ? (
                      <span className={`${NUM} text-oa-fg`}>{fmtMoney(totals.value ?? 0, (totals.value ?? 0) >= 100_000 ? 0 : 2)}</span>
                    ) : column.key === "gain" && totals.gain !== null ? (
                      <span className={`${NUM} ${signTone(totals.gain)}`}>{fmtSignedMoney(totals.gain, Math.abs(totals.gain) >= 100_000 ? 0 : 2)}</span>
                    ) : column.key === "gainPct" && totals.gainPct !== null ? (
                      <Pct value={totals.gainPct} digits={1} />
                    ) : null}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </WholeRows>

      {/* below md: one card per stock, like a broker app's holdings (owner, Nov 12). About eight show, then one quiet
          toggle for the rest: a card list never scrolls inside its own box (owner rule 4). */}
      <div className="md:hidden">
        <div className="flex items-center gap-1.5 border-b border-oa-border px-3 py-1.5">
          <label className="ml-auto flex items-center gap-1.5 text-[13px] text-oa-muted-fg">
            Sort
            <select
              value={lookFirst ? LOOK_FIRST : effectiveSort.key}
              onChange={(event) => {
                if (event.target.value === LOOK_FIRST) {
                  setPicked(false);
                  setSort(defaultSort);
                  return;
                }
                const column = sortable.find((item) => item.key === event.target.value);
                if (!column) return;
                setPicked(true);
                setSort({ key: column.key, direction: column.first });
              }}
              className={`h-8 rounded border border-oa-border bg-oa-card pl-2 pr-1 text-[13px] text-oa-fg ${FOCUS}`}
            >
              {anyLook ? <option value={LOOK_FIRST}>Suggested</option> : null}
              {sortable.map((column) => (
                <option key={column.key} value={column.key}>
                  {column.label}
                </option>
              ))}
            </select>
          </label>
          {lookFirst ? null : (
            <button
              type="button"
              onClick={() => {
                setPicked(true);
                setSort({ ...effectiveSort, direction: effectiveSort.direction === "asc" ? "desc" : "asc" });
              }}
              aria-label={effectiveSort.direction === "asc" ? "Low to high. Switch to high to low" : "High to low. Switch to low to high"}
              title={effectiveSort.direction === "asc" ? "Low to high" : "High to low"}
              className={`inline-flex size-8 items-center justify-center rounded border border-oa-border bg-oa-card text-[11px] text-oa-fg ${FOCUS}`}
            >
              {effectiveSort.direction === "asc" ? "▲" : "▼"}
            </button>
          )}
        </div>
        {kind === "holding" && anyMoney ? <MoneyHeader /> : null}
        {none ? empty : null}
        <ul className="divide-y divide-oa-border">
          {(showAll ? sorted : sorted.slice(0, fold)).map((position) => {
            const tint = position.needsAttention ? "bg-[color-mix(in_srgb,var(--oa-primary)_6%,transparent)]" : "";
            return (
              <li key={position.instrument_id}>
                <Link href={`/stock/${position.ticker}`} prefetch={false} className={`block px-3 py-3 hover:bg-oa-accent ${FOCUS} ${tint}`}>
                  <PositionCard position={position} kind={kind} today={today} money={anyMoney} />
                </Link>
              </li>
            );
          })}
        </ul>
        {sorted.length > fold ? (
          <button
            type="button"
            onClick={() => setShowAll((value) => !value)}
            aria-expanded={showAll}
            className={`flex h-11 w-full items-center justify-center border-t border-oa-border text-[13.5px] font-medium text-oa-muted-fg hover:bg-oa-accent hover:text-oa-fg ${FOCUS}`}
          >
            {showAll ? "Show fewer" : `Show ${sorted.length - fold} more`}
          </button>
        ) : null}
      </div>

      {hiddenCount > 0 && hiddenNote ? (
        <div className="flex flex-col items-start gap-2 border-t border-oa-border bg-oa-bg px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          {hiddenNote}
        </div>
      ) : null}
    </>
  );
}
