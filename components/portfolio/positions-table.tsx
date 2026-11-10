"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { CallCell, Dash, EarningsCell, FOCUS, NUM, Pct, signTone, TD, TH } from "@/components/portfolio/parts";
import { StockLogo } from "@/components/stock-logo";
import { flushWatchlistRebuild } from "@/lib/radar-client-refresh";
import {
  fmtMoney,
  fmtShares,
  fmtSignedMoney,
  sortPositions,
  type PortfolioPosition,
  type PortfolioTotals,
  type SortKey,
} from "@/lib/portfolio-shared";

type Direction = "asc" | "desc";
/** "avgCost" is shown but not sortable: the sort lives in portfolio-shared and has no key for it. */
type ColumnKey = SortKey | "avgCost";
type Column = { key: ColumnKey; label: string; align: "left" | "right"; first: Direction; hideBelow?: "lg" | "xl" };

// The order a brokerage statement uses: what you hold, what it cost, what it is
// worth now, what it has made. The total sits under the same columns.
const HOLDING_COLUMNS: Column[] = [
  { key: "ticker", label: "Stock", align: "left", first: "asc" },
  { key: "shares", label: "Shares", align: "right", first: "desc", hideBelow: "lg" },
  { key: "avgCost", label: "Avg cost", align: "right", first: "desc", hideBelow: "xl" },
  { key: "price", label: "Price", align: "right", first: "desc" },
  { key: "dayPct", label: "Day", align: "right", first: "desc" },
  { key: "value", label: "Value", align: "right", first: "desc" },
  { key: "weight", label: "Weight", align: "left", first: "desc", hideBelow: "lg" },
  { key: "gain", label: "Gain", align: "right", first: "desc" },
  { key: "gainPct", label: "Gain %", align: "right", first: "desc" },
  { key: "stance", label: "Our call", align: "left", first: "asc" },
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
};

function colClass(column: Column): string {
  return `${column.hideBelow ? HIDE[column.hideBelow] : ""} ${column.align === "right" ? "text-right" : "text-left"}`;
}

/* ── editing one position: same routes the page always used ──────────────── */

type EditorProps = {
  position: PortfolioPosition;
  onClose: () => void;
};

function parseField(raw: string): number | null | "invalid" {
  const text = raw.trim().replace(/[$,\s]/g, "");
  if (text === "") return null;
  const value = Number(text);
  return Number.isFinite(value) && value >= 0 ? value : "invalid";
}

function PositionEditor({ position, onClose }: EditorProps) {
  const router = useRouter();
  const isHolding = position.kind === "holding";
  const [shares, setShares] = useState(position.shares !== null ? String(position.shares) : "");
  const [cost, setCost] = useState(position.avgCost !== null ? String(position.avgCost) : "");
  const [busy, setBusy] = useState<null | "save" | "move" | "remove">(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | "move" | "remove">(null);

  async function run(kind: "save" | "move" | "remove", request: () => Promise<Response>, failure: string) {
    setBusy(kind);
    setError(null);
    try {
      const res = await request();
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string; reason?: string };
        if (res.status === 401) throw new Error("Sign in again to change your portfolio.");
        if (data.error === "free_tier_limit_reached" || data.error === "swap_limit_reached") throw new Error(data.reason || "That change did not go through. Try again.");
        throw new Error(failure);
      }
      void flushWatchlistRebuild(router, 500);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : failure);
    } finally {
      setBusy(null);
    }
  }

  function save() {
    const quantity = parseField(shares);
    const averageCost = parseField(cost);
    if (quantity === "invalid" || averageCost === "invalid") {
      setError("Shares and cost need to be numbers.");
      return;
    }
    void run(
      "save",
      () =>
        fetch("/api/watchlist/holding", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          // With shares entered, value is shares x live price, so a typed-in value is dropped.
          // Without shares, a value the user typed in earlier is kept as it was.
          body: JSON.stringify({
            instrument_id: position.instrument_id,
            quantity,
            average_cost: averageCost,
            market_value: quantity === null && position.valueSource === "entered" ? position.value : null,
            source: "manual",
          }),
        }),
      "Could not save. Try again.",
    );
  }

  function move() {
    void run(
      "move",
      () =>
        fetch("/api/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instrument_id: position.instrument_id, position_type: isHolding ? "watchlist" : "holding" }),
        }),
      "Could not move it. Try again.",
    );
  }

  function remove() {
    void run(
      "remove",
      () =>
        fetch("/api/track", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instrument_id: position.instrument_id }),
        }),
      "Could not remove it. Try again.",
    );
  }

  const input =
    `oa-mono h-8 w-28 rounded border border-oa-border bg-oa-card px-2 text-[13px] tabular-nums text-oa-fg placeholder:text-oa-muted-fg/60 ${FOCUS}`;
  const button = `inline-flex h-8 items-center rounded border px-3 text-[12.5px] font-medium disabled:opacity-50 ${FOCUS}`;

  return (
    <div className="flex flex-col gap-2 bg-oa-bg px-3 py-3" onClick={(event) => event.stopPropagation()}>
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        {isHolding ? (
          <>
            <label className="flex flex-col gap-1">
              <span className="oa-caption">Shares</span>
              <input
                inputMode="decimal"
                value={shares}
                onChange={(event) => setShares(event.target.value)}
                placeholder="0"
                className={input}
                aria-label={`Shares of ${position.ticker}`}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="oa-caption">Average cost</span>
              <input
                inputMode="decimal"
                value={cost}
                onChange={(event) => setCost(event.target.value)}
                placeholder="per share"
                className={input}
                aria-label={`Average cost per share of ${position.ticker}`}
              />
            </label>
            <button
              type="button"
              onClick={save}
              disabled={busy !== null}
              className={`${button} border-oa-primary bg-oa-primary text-oa-primary-fg hover:brightness-110`}
            >
              {busy === "save" ? "Saving" : "Save"}
            </button>
          </>
        ) : null}
        {confirm === null ? (
          <>
            <button
              type="button"
              onClick={() => (isHolding && (position.shares !== null || position.avgCost !== null) ? setConfirm("move") : move())}
              disabled={busy !== null}
              className={`${button} border-oa-border bg-oa-card text-oa-fg hover:border-oa-fg/30`}
            >
              {busy === "move" ? "Moving" : isHolding ? "Move to Watching" : "I own this"}
            </button>
            <button
              type="button"
              onClick={() => setConfirm("remove")}
              disabled={busy !== null}
              className={`${button} border-oa-border bg-oa-card text-signal-bearish hover:border-current`}
            >
              Remove
            </button>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12.5px] text-oa-fg">
              {confirm === "move"
                ? `Move ${position.ticker} to Watching? Its saved shares and cost are cleared.`
                : `Stop tracking ${position.ticker}?${isHolding ? " Its saved shares and cost are cleared." : ""}`}
            </span>
            <button
              type="button"
              onClick={confirm === "move" ? move : remove}
              disabled={busy !== null}
              className={`${button} border-current bg-oa-card text-signal-bearish`}
            >
              {busy ? "Working" : confirm === "move" ? "Yes, move it" : "Yes, remove it"}
            </button>
            <button type="button" onClick={() => setConfirm(null)} className={`${button} border-oa-border bg-oa-card text-oa-fg`}>
              Keep it
            </button>
          </div>
        )}
        <button type="button" onClick={onClose} className={`${button} ml-auto border-transparent text-oa-muted-fg hover:text-oa-fg`}>
          Close
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-[12.5px] text-signal-bearish">
          {error}
        </p>
      ) : isHolding ? (
        <p className="text-[11.5px] leading-4 text-oa-muted-fg">
          Value is shares times the latest price. Gain needs the average cost. Leave a field empty to clear it.
        </p>
      ) : null}
    </div>
  );
}

/* ── the table ───────────────────────────────────────────────────────────── */

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
      aria-sort={column.key === "avgCost" ? undefined : active ? (direction === "asc" ? "ascending" : "descending") : "none"}
      className={`${TH} ${colClass(column)} ${first ? "pl-3" : ""}`}
    >
      {column.key === "avgCost" ? (
        column.label
      ) : (
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
      )}
    </th>
  );
}

function StockCell({ position, inline = false }: { position: PortfolioPosition; inline?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <StockLogo ticker={position.ticker} market="US" size={inline ? 20 : 24} circle className="shrink-0" />
      <div className={inline ? "flex min-w-0 items-baseline gap-2" : "min-w-0"}>
        <Link
          href={`/stock/${position.ticker}`}
          onClick={(event) => event.stopPropagation()}
          className={`oa-mono block text-[14px] font-medium leading-5 text-oa-fg hover:underline ${FOCUS}`}
        >
          {position.ticker}
        </Link>
        <span className="block max-w-[14rem] truncate text-[13px] leading-[18px] text-oa-muted-fg">{position.name}</span>
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

/** Share of the portfolio as a number and a bar, so the big positions read at a glance. */
function WeightCell({ weight }: { weight: number | null }) {
  if (weight === null) return <Dash />;
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`${NUM} w-11 text-right text-oa-fg`}>{weight.toFixed(1)}%</span>
      <span aria-hidden="true" className="h-1.5 w-14 overflow-hidden rounded-full bg-oa-bg">
        <span className="block h-full rounded-full bg-[color-mix(in_srgb,var(--oa-fg)_45%,transparent)]" style={{ width: `${Math.min(100, Math.max(2, weight))}%` }} />
      </span>
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

export function PositionsTable({
  positions,
  kind,
  today,
  editable,
  defaultSort,
  hiddenCount = 0,
  hiddenNote,
  totals,
}: {
  /** Holdings only: the sums printed under the table. They cover every holding, hidden ones included. */
  totals?: PortfolioTotals;
  positions: PortfolioPosition[];
  kind: "holding" | "watchlist";
  today: string;
  editable: boolean;
  defaultSort: { key: SortKey; direction: Direction };
  hiddenCount?: number;
  hiddenNote?: React.ReactNode;
}) {
  const router = useRouter();
  // A column with nothing in it for any row (no shares entered, no cost, no call yet, no earnings date) is left
  // out rather than shown as a column of dashes. It comes back as soon as one row has a value.
  const filled = (column: Column): boolean => {
    switch (column.key) {
      case "ticker":
        return true;
      case "shares":
        return positions.some((position) => position.shares !== null);
      case "avgCost":
        return positions.some((position) => position.avgCost !== null);
      case "price":
        return positions.some((position) => position.price !== null);
      case "dayPct":
        return positions.some((position) => position.dayPct !== null);
      case "value":
        return positions.some((position) => position.value !== null);
      case "weight":
        return positions.some((position) => position.weight !== null);
      case "gain":
        return positions.some((position) => position.gain !== null);
      case "gainPct":
        return positions.some((position) => position.gainPct !== null);
      case "stance":
        return positions.some((position) => position.stance);
      case "earnings":
        return positions.some((position) => position.nextEarnings);
      default:
        return true;
    }
  };
  const columns = (kind === "holding" ? HOLDING_COLUMNS : WATCH_COLUMNS).filter(filled);
  // The phone rows follow the same rule: say nothing about cost or shares until at least one row has them.
  const anyGain = positions.some((position) => position.gain !== null);
  const anyShares = positions.some((position) => position.shares !== null);
  // With no shares entered anywhere there is no value to lead with, so a holding row reads like a watch row: price and today's move.
  const anyValue = positions.some((position) => position.value !== null);
  const sortable = columns.filter((column): column is Column & { key: SortKey } => column.key !== "avgCost");
  const [sort, setSort] = useState(defaultSort);
  const [editing, setEditing] = useState<string | null>(null);
  // When the sort column is hidden (no row has a value in it), sort by stock instead of silently by nothing.
  const effectiveSort = sortable.some((column) => column.key === sort.key) ? sort : { key: "ticker" as SortKey, direction: "asc" as Direction };
  const sorted = useMemo(
    () => sortPositions(positions, effectiveSort.key, effectiveSort.direction),
    [positions, effectiveSort.key, effectiveSort.direction],
  );

  function onSort(column: Column) {
    const key = column.key;
    if (key === "avgCost") return;
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: column.first },
    );
  }

  function open(position: PortfolioPosition) {
    router.push(`/stock/${position.ticker}`);
  }

  const span = columns.length + (editable ? 1 : 0);

  return (
    <>
      {/* md and up: the full table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-[14px]">
          <thead>
            <tr className="border-b border-oa-border">
              {columns.map((column, index) => (
                <SortHeader
                  key={column.key}
                  column={column}
                  active={effectiveSort.key === column.key}
                  direction={effectiveSort.direction}
                  onSort={onSort}
                  first={index === 0}
                />
              ))}
              {editable ? <th scope="col" className={`${TH} pr-3 text-right`}><span className="sr-only">Edit</span></th> : null}
            </tr>
          </thead>
          <tbody>
            {sorted.map((position) => {
              const isEditing = editing === position.instrument_id;
              return (
                <PositionRows key={position.instrument_id}>
                  <tr
                    onClick={() => open(position)}
                    className={`h-12 cursor-pointer border-b border-oa-border transition-colors last:border-b-0 hover:bg-oa-accent ${
                      position.needsAttention ? "bg-[color-mix(in_srgb,var(--oa-primary)_6%,transparent)]" : ""
                    }`}
                  >
                    {columns.map((column, index) => (
                      <td key={column.key} className={`${TD} ${colClass(column)} ${index === 0 ? "pl-3" : ""}`}>
                        {column.key === "ticker" ? (
                          <StockCell position={position} inline />
                        ) : column.key === "price" ? (
                          position.price !== null ? <span className={`${NUM} text-oa-fg`}>{fmtMoney(position.price)}</span> : <Dash />
                        ) : column.key === "avgCost" ? (
                          position.avgCost !== null ? <span className={`${NUM} text-oa-muted-fg`}>{fmtMoney(position.avgCost)}</span> : <Dash />
                        ) : column.key === "dayPct" ? (
                          <Pct value={position.dayPct} />
                        ) : column.key === "gainPct" ? (
                          <Pct value={position.gainPct} digits={1} />
                        ) : column.key === "shares" ? (
                          position.shares !== null ? <span className={`${NUM} text-oa-fg`}>{fmtShares(position.shares)}</span> : <Dash />
                        ) : column.key === "value" ? (
                          <ValueCell position={position} />
                        ) : column.key === "weight" ? (
                          <WeightCell weight={position.weight} />
                        ) : column.key === "gain" ? (
                          <GainCell position={position} />
                        ) : column.key === "stance" ? (
                          <CallCell position={position} />
                        ) : (
                          <EarningsCell next={position.nextEarnings} today={today} />
                        )}
                      </td>
                    ))}
                    {editable ? (
                      <td className={`${TD} pr-3 text-right`}>
                        <button
                          type="button"
                          aria-expanded={isEditing}
                          aria-label={`Edit ${position.ticker}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setEditing(isEditing ? null : position.instrument_id);
                          }}
                          className={`rounded border border-transparent px-2 py-1 text-[12px] font-medium text-oa-muted-fg hover:border-oa-border hover:text-oa-fg ${FOCUS}`}
                        >
                          {isEditing ? "Close" : "Edit"}
                        </button>
                      </td>
                    ) : null}
                  </tr>
                  {isEditing ? (
                    <tr className="border-b border-oa-border">
                      <td colSpan={span} className="p-0">
                        <PositionEditor position={position} onClose={() => setEditing(null)} />
                      </td>
                    </tr>
                  ) : null}
                </PositionRows>
              );
            })}
          </tbody>
          {kind === "holding" && totals && totals.value !== null ? (
            <tfoot>
              <tr className="h-10 border-t border-oa-border bg-oa-bg font-medium">
                {columns.map((column, index) => (
                  <td key={column.key} className={`${TD} ${colClass(column)} ${index === 0 ? "pl-3" : ""}`}>
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
                {editable ? <td className={TD} /> : null}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      {/* below md: two-line rows, same data */}
      <div className="md:hidden">
        <div className="flex items-center justify-between gap-2 border-b border-oa-border px-3 py-1.5">
          <label className="flex items-center gap-2 text-[13px] text-oa-muted-fg">
            Sort
            <select
              value={effectiveSort.key}
              onChange={(event) => {
                const column = sortable.find((item) => item.key === event.target.value);
                if (column) setSort({ key: column.key, direction: column.first });
              }}
              className={`h-10 rounded border border-oa-border bg-oa-card px-2 text-[14px] text-oa-fg ${FOCUS}`}
            >
              {sortable.map((column) => (
                <option key={column.key} value={column.key}>
                  {column.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setSort((current) => ({ ...current, direction: current.direction === "asc" ? "desc" : "asc" }))}
            className={`h-10 rounded border border-oa-border bg-oa-card px-3 text-[14px] text-oa-fg ${FOCUS}`}
          >
            {sort.direction === "asc" ? "Low to high ▲" : "High to low ▼"}
          </button>
        </div>
        <ul className="divide-y divide-oa-border">
          {sorted.map((position) => {
            const isEditing = editing === position.instrument_id;
            return (
              <li key={position.instrument_id}>
                <div
                  role="link"
                  tabIndex={0}
                  onClick={() => open(position)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") open(position);
                  }}
                  className={`flex cursor-pointer flex-col gap-1.5 px-3 py-2.5 hover:bg-oa-accent ${FOCUS} ${
                    position.needsAttention ? "bg-[color-mix(in_srgb,var(--oa-primary)_6%,transparent)]" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <StockCell position={position} />
                    {kind === "holding" && anyValue ? (
                      <div className="shrink-0 text-right">
                        <div className="text-[15px] font-medium leading-5">
                          <ValueCell position={position} />
                        </div>
                        <div className="text-[13px] leading-[18px]">
                          {position.gain !== null ? (
                            <span className={`${NUM} ${signTone(position.gain)}`}>
                              {fmtSignedMoney(position.gain, 0)}
                              {position.gainPct !== null ? ` ${position.gainPct >= 0 ? "+" : "−"}${Math.abs(position.gainPct).toFixed(1)}%` : ""}
                            </span>
                          ) : anyGain ? (
                            <Dash />
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <div className="shrink-0 text-right">
                        <div className={`${NUM} text-[15px] font-medium leading-5 text-oa-fg`}>
                          {position.price !== null ? fmtMoney(position.price) : <Dash />}
                        </div>
                        <div className="text-[13px] leading-[18px]">
                          <Pct value={position.dayPct} />
                        </div>
                      </div>
                    )}
                  </div>
                  {kind === "holding" && anyValue ? (
                    <div className="flex items-baseline justify-between gap-3 pl-[2.125rem] text-[13px] leading-[18px] text-oa-muted-fg">
                      <span className={NUM}>
                        {[position.shares !== null ? `${fmtShares(position.shares)} sh` : anyShares ? "–" : null, position.weight !== null ? `${position.weight.toFixed(1)}%` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                      <span className={`${NUM} flex items-baseline gap-2`}>
                        {position.price !== null ? <span>{fmtMoney(position.price)}</span> : null}
                        <Pct value={position.dayPct} />
                      </span>
                    </div>
                  ) : null}
                  {position.stance || position.nextEarnings || editable ? (
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 pl-[2.125rem]">
                    {position.stance ? <CallCell position={position} /> : null}
                    <span className="ml-auto flex shrink-0 items-center gap-2">
                      {position.nextEarnings ? (
                        <span className="text-[11px] text-oa-muted-fg">
                          Reports <EarningsCell next={position.nextEarnings} today={today} />
                        </span>
                      ) : null}
                      {editable ? (
                        <button
                          type="button"
                          aria-expanded={isEditing}
                          aria-label={`Edit ${position.ticker}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setEditing(isEditing ? null : position.instrument_id);
                          }}
                          className={`inline-flex h-10 items-center rounded border border-oa-border px-3 text-[13px] font-medium text-oa-fg ${FOCUS}`}
                        >
                          {isEditing ? "Close" : "Edit"}
                        </button>
                      ) : null}
                    </span>
                  </div>
                  ) : null}
                </div>
                {isEditing ? <PositionEditor position={position} onClose={() => setEditing(null)} /> : null}
              </li>
            );
          })}
        </ul>
      </div>

      {hiddenCount > 0 && hiddenNote ? (
        <div className="flex flex-col items-start gap-2 border-t border-oa-border bg-oa-bg px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          {hiddenNote}
        </div>
      ) : null}
    </>
  );
}

/** A fragment with a key, so a row and its editor stay together. */
function PositionRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
