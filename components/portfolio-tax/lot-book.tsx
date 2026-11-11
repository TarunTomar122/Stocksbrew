"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";

import {
  day,
  money,
  shares as fmtShares,
} from "@/components/portfolio-tax/format";
import { StockLogo } from "@/components/stock-logo";
import type { TaxStock } from "@/lib/portfolio-tax-data";
import type { TaxLotEntry } from "@/lib/portfolio-tax";

export type LotBookStock = TaxStock & {
  entry: TaxLotEntry | null;
  fromHolding: boolean;
  openShares: number;
  basis: number;
  value: number | null;
  realisedCount: number;
};

type BuyRow = {
  id: string;
  date: string;
  shares: string;
  price: string;
  fee: string;
};
type SellRow = BuyRow & {
  method: "fifo" | "specific";
  picks: Record<string, string>;
};
type SplitRow = { id: string; date: string; ratio: string };
type Draft = { buys: BuyRow[]; sells: SellRow[]; splits: SplitRow[] };

const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";
const INPUT = `oa-mono h-8 rounded border border-oa-border bg-oa-card px-2 text-[13px] tabular-nums text-oa-fg placeholder:text-oa-muted-fg/60 ${FOCUS}`;
const BTN = `inline-flex h-8 shrink-0 cursor-pointer items-center rounded border px-3 text-[12.5px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`;
const BTN_PRIMARY = `${BTN} border-oa-primary bg-oa-primary text-oa-primary-fg hover:brightness-110`;
const BTN_PLAIN = `${BTN} border-oa-border bg-oa-card text-oa-fg hover:border-oa-fg/30`;
const BTN_QUIET = `inline-flex h-8 shrink-0 cursor-pointer items-center rounded px-2 text-[12.5px] text-oa-muted-fg hover:text-oa-fg ${FOCUS}`;

function newId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function str(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

function draftFrom(stock: LotBookStock): Draft {
  const entry = stock.entry;
  if (
    entry &&
    (entry.buys.length > 0 || entry.sells.length > 0 || entry.splits.length > 0)
  ) {
    return {
      buys: entry.buys.map((buy) => ({
        id: buy.id,
        date: buy.date,
        shares: str(buy.shares),
        price: str(buy.price),
        fee: str(buy.fee),
      })),
      sells: entry.sells.map((sell) => ({
        id: sell.id,
        date: sell.date,
        shares: str(sell.shares),
        price: str(sell.price),
        fee: str(sell.fee),
        method: sell.method,
        picks: Object.fromEntries(
          (sell.picks ?? []).map((pick) => [pick.lot_id, String(pick.shares)]),
        ),
      })),
      splits: entry.splits.map((split) => ({
        id: split.id,
        date: split.date,
        ratio: String(split.ratio),
      })),
    };
  }
  // A holding with shares and an average cost becomes the first lot; only the date is missing.
  const legacy = stock.legacy;
  return {
    buys: [
      {
        id: newId("b"),
        date: "",
        shares: legacy ? String(legacy.shares) : "",
        price: legacy ? String(legacy.cost) : "",
        fee: "",
      },
    ],
    sells: [],
    splits: [],
  };
}

function isBlank(row: {
  date: string;
  shares?: string;
  price?: string;
  ratio?: string;
}): boolean {
  return (
    !row.date && !row.shares?.trim() && !row.price?.trim() && !row.ratio?.trim()
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <span className="oa-caption">{label}</span>
      {children}
    </label>
  );
}

function Editor({
  stock,
  onDone,
}: {
  stock: LotBookStock;
  onDone: () => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(stock));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fromLegacy = !stock.entry && stock.legacy !== null;
  const idBase = useId();

  function update<K extends keyof Draft>(
    kind: K,
    id: string,
    patch: Partial<Draft[K][number]>,
  ) {
    setDraft((current) => ({
      ...current,
      [kind]: (current[kind] as Array<{ id: string }>).map((row) =>
        row.id === id ? { ...row, ...patch } : row,
      ),
    }));
  }

  function remove(kind: keyof Draft, id: string) {
    setDraft((current) => {
      const next = {
        ...current,
        [kind]: (current[kind] as Array<{ id: string }>).filter(
          (row) => row.id !== id,
        ),
      } as Draft;
      // A sell cannot keep pointing at a buy that is gone.
      if (kind === "buys") {
        next.sells = next.sells.map((sell) => {
          if (!(id in sell.picks)) return sell;
          const picks = { ...sell.picks };
          delete picks[id];
          return { ...sell, picks };
        });
      }
      return next;
    });
  }

  async function save() {
    setSaving(true);
    setError(null);
    const buys = draft.buys.filter((row) => !isBlank(row));
    const sells = draft.sells.filter((row) => !isBlank(row));
    const splits = draft.splits.filter((row) => !isBlank(row));
    const body = {
      instrument_id: stock.instrumentId,
      buys: buys.map((row) => ({
        id: row.id,
        date: row.date,
        shares: row.shares.trim(),
        price: row.price.trim(),
        fee: row.fee.trim(),
      })),
      sells: sells.map((row) => {
        const picks = Object.entries(row.picks)
          .filter(([, value]) => value.trim() !== "" && Number(value) > 0)
          .map(([lotId, value]) => ({ lot_id: lotId, shares: value.trim() }));
        return {
          id: row.id,
          date: row.date,
          shares: row.shares.trim(),
          price: row.price.trim(),
          fee: row.fee.trim(),
          method: row.method,
          ...(row.method === "specific" ? { picks } : {}),
        };
      }),
      splits: splits.map((row) => ({
        id: row.id,
        date: row.date,
        ratio: row.ratio.trim(),
      })),
    };
    try {
      const response = await fetch("/api/watchlist/tax-lots", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };
      if (!response.ok) {
        setError(
          result.message ??
            (response.status === 401
              ? "Sign in again to save."
              : "Could not save. Nothing was changed."),
        );
        return;
      }
      onDone();
      router.refresh();
    } catch {
      setError("Could not reach the server. Nothing was changed.");
    } finally {
      setSaving(false);
    }
  }

  const datedBuys = draft.buys.filter(
    (buy) => buy.date && Number(buy.shares) > 0,
  );

  return (
    <div className="flex flex-col gap-4 border-t border-oa-border bg-oa-bg px-4 py-3">
      {fromLegacy ? (
        <p className="text-[12.5px] leading-[18px] text-oa-muted-fg">
          Filled in from your holding ({fmtShares(stock.legacy!.shares)} shares
          at {money(stock.legacy!.cost)}). Add the date you bought, or split it
          into the real buys. Your holding in Positions stays as it is.
        </p>
      ) : null}

      <section
        aria-label={`Buys of ${stock.ticker}`}
        className="flex flex-col gap-2"
      >
        <h3 className="oa-label">Buys</h3>
        {draft.buys.length === 0 ? (
          <p className="text-[12.5px] text-oa-muted-fg">No buys.</p>
        ) : null}
        {draft.buys.map((row, index) => (
          <div
            key={row.id}
            className="grid grid-cols-2 items-end gap-2 sm:flex sm:flex-wrap"
          >
            <Field label="Date">
              <input
                type="date"
                value={row.date}
                onChange={(e) =>
                  update("buys", row.id, { date: e.target.value })
                }
                className={`${INPUT} sm:w-[9.5rem]`}
                aria-label={`Buy ${index + 1} date`}
              />
            </Field>
            <Field label="Shares">
              <input
                inputMode="decimal"
                value={row.shares}
                onChange={(e) =>
                  update("buys", row.id, { shares: e.target.value })
                }
                placeholder="0"
                className={`${INPUT} sm:w-24`}
                aria-label={`Buy ${index + 1} shares`}
              />
            </Field>
            <Field label="Price / sh">
              <input
                inputMode="decimal"
                value={row.price}
                onChange={(e) =>
                  update("buys", row.id, { price: e.target.value })
                }
                placeholder="0.00"
                className={`${INPUT} sm:w-24`}
                aria-label={`Buy ${index + 1} price per share`}
              />
            </Field>
            <Field label="Fee">
              <input
                inputMode="decimal"
                value={row.fee}
                onChange={(e) =>
                  update("buys", row.id, { fee: e.target.value })
                }
                placeholder="optional"
                className={`${INPUT} sm:w-24`}
                aria-label={`Buy ${index + 1} fee`}
              />
            </Field>
            <button
              type="button"
              onClick={() => remove("buys", row.id)}
              className={`${BTN_QUIET} col-span-2 justify-self-start sm:col-span-1`}
            >
              Remove
            </button>
          </div>
        ))}
        <div>
          <button
            type="button"
            onClick={() =>
              setDraft((d) => ({
                ...d,
                buys: [
                  ...d.buys,
                  { id: newId("b"), date: "", shares: "", price: "", fee: "" },
                ],
              }))
            }
            className={BTN_PLAIN}
          >
            Add buy
          </button>
        </div>
      </section>

      <section
        aria-label={`Sells of ${stock.ticker}`}
        className="flex flex-col gap-2"
      >
        <h3 className="oa-label">Sells</h3>
        {draft.sells.length === 0 ? (
          <p className="text-[12.5px] text-oa-muted-fg">
            No sells. Add one when you sell shares.
          </p>
        ) : null}
        {draft.sells.map((row, index) => {
          const eligible = datedBuys.filter(
            (buy) => !row.date || buy.date <= row.date,
          );
          const methodName = `${idBase}-method-${row.id}`;
          return (
            <div
              key={row.id}
              className="flex flex-col gap-2 border-l-2 border-oa-border pl-3"
            >
              <div className="grid grid-cols-2 items-end gap-2 sm:flex sm:flex-wrap">
                <Field label="Date">
                  <input
                    type="date"
                    value={row.date}
                    onChange={(e) =>
                      update("sells", row.id, { date: e.target.value })
                    }
                    className={`${INPUT} sm:w-[9.5rem]`}
                    aria-label={`Sell ${index + 1} date`}
                  />
                </Field>
                <Field label="Shares">
                  <input
                    inputMode="decimal"
                    value={row.shares}
                    onChange={(e) =>
                      update("sells", row.id, { shares: e.target.value })
                    }
                    placeholder="0"
                    className={`${INPUT} sm:w-24`}
                    aria-label={`Sell ${index + 1} shares`}
                  />
                </Field>
                <Field label="Price / sh">
                  <input
                    inputMode="decimal"
                    value={row.price}
                    onChange={(e) =>
                      update("sells", row.id, { price: e.target.value })
                    }
                    placeholder="0.00"
                    className={`${INPUT} sm:w-24`}
                    aria-label={`Sell ${index + 1} price per share`}
                  />
                </Field>
                <Field label="Fee">
                  <input
                    inputMode="decimal"
                    value={row.fee}
                    onChange={(e) =>
                      update("sells", row.id, { fee: e.target.value })
                    }
                    placeholder="optional"
                    className={`${INPUT} sm:w-24`}
                    aria-label={`Sell ${index + 1} fee`}
                  />
                </Field>
                <fieldset className="col-span-2 flex h-8 items-center gap-3 text-[12.5px] text-oa-fg sm:col-span-1">
                  <legend className="sr-only">Which shares were sold</legend>
                  <label className="inline-flex cursor-pointer items-center gap-1.5">
                    <input
                      type="radio"
                      name={methodName}
                      checked={row.method === "fifo"}
                      onChange={() =>
                        update("sells", row.id, { method: "fifo" })
                      }
                    />
                    Oldest first
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-1.5">
                    <input
                      type="radio"
                      name={methodName}
                      checked={row.method === "specific"}
                      onChange={() =>
                        update("sells", row.id, { method: "specific" })
                      }
                    />
                    Pick lots
                  </label>
                </fieldset>
                <button
                  type="button"
                  onClick={() => remove("sells", row.id)}
                  className={`${BTN_QUIET} col-span-2 justify-self-start sm:col-span-1`}
                >
                  Remove
                </button>
              </div>
              {row.method === "specific" ? (
                eligible.length === 0 ? (
                  <p className="text-[12.5px] text-oa-muted-fg">
                    Add a dated buy on or before the sell date to pick from.
                  </p>
                ) : (
                  <div className="flex flex-col gap-1">
                    <span className="oa-caption">Shares from each lot</span>
                    {eligible.map((buy) => (
                      <label
                        key={buy.id}
                        className="flex items-center gap-2 text-[12.5px] text-oa-muted-fg"
                      >
                        <input
                          inputMode="decimal"
                          value={row.picks[buy.id] ?? ""}
                          onChange={(e) =>
                            update("sells", row.id, {
                              picks: { ...row.picks, [buy.id]: e.target.value },
                            })
                          }
                          placeholder="0"
                          className={`${INPUT} w-20`}
                          aria-label={`Shares sold from the lot bought ${day(buy.date)}`}
                        />
                        <span className="oa-mono">
                          of the {buy.shares} bought {day(buy.date)} at $
                          {buy.price || "?"}
                        </span>
                      </label>
                    ))}
                  </div>
                )
              ) : null}
            </div>
          );
        })}
        <div>
          <button
            type="button"
            onClick={() =>
              setDraft((d) => ({
                ...d,
                sells: [
                  ...d.sells,
                  {
                    id: newId("s"),
                    date: "",
                    shares: "",
                    price: "",
                    fee: "",
                    method: "fifo",
                    picks: {},
                  },
                ],
              }))
            }
            className={BTN_PLAIN}
          >
            Add sell
          </button>
        </div>
      </section>

      <section
        aria-label={`Splits of ${stock.ticker}`}
        className="flex flex-col gap-2"
      >
        <h3 className="oa-label">Splits</h3>
        <p className="text-[12.5px] leading-[18px] text-oa-muted-fg">
          Only if the stock split after a buy here. Enter new shares per old
          share: 4 for a 4-for-1 split, 0.1 for a 1-for-10 reverse split.
        </p>
        {draft.splits.map((row, index) => (
          <div
            key={row.id}
            className="grid grid-cols-2 items-end gap-2 sm:flex sm:flex-wrap"
          >
            <Field label="Date">
              <input
                type="date"
                value={row.date}
                onChange={(e) =>
                  update("splits", row.id, { date: e.target.value })
                }
                className={`${INPUT} sm:w-[9.5rem]`}
                aria-label={`Split ${index + 1} date`}
              />
            </Field>
            <Field label="New per old">
              <input
                inputMode="decimal"
                value={row.ratio}
                onChange={(e) =>
                  update("splits", row.id, { ratio: e.target.value })
                }
                placeholder="4"
                className={`${INPUT} sm:w-24`}
                aria-label={`Split ${index + 1} ratio`}
              />
            </Field>
            <button
              type="button"
              onClick={() => remove("splits", row.id)}
              className={`${BTN_QUIET} col-span-2 justify-self-start sm:col-span-1`}
            >
              Remove
            </button>
          </div>
        ))}
        <div>
          <button
            type="button"
            onClick={() =>
              setDraft((d) => ({
                ...d,
                splits: [...d.splits, { id: newId("x"), date: "", ratio: "" }],
              }))
            }
            className={BTN_PLAIN}
          >
            Add split
          </button>
        </div>
      </section>

      {error ? (
        <p role="alert" className="text-[13px] leading-5 text-signal-bearish">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className={BTN_PRIMARY}
        >
          {saving ? "Saving" : "Save lots"}
        </button>
        <button
          type="button"
          onClick={onDone}
          disabled={saving}
          className={BTN_PLAIN}
        >
          Cancel
        </button>
        <span className="text-[12px] text-oa-muted-fg">
          Saving with no rows clears this stock&apos;s lots.
        </span>
      </div>
    </div>
  );
}

/** The user's lots per stock, each with an inline editor, plus a picker to start lots for another stock. */
export function LotBook({ stocks }: { stocks: LotBookStock[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [extra, setExtra] = useState<string[]>([]);
  const [choice, setChoice] = useState("");

  const listed = useMemo(
    () =>
      stocks.filter(
        (stock) =>
          stock.openShares > 0 ||
          stock.realisedCount > 0 ||
          (stock.entry &&
            (stock.entry.buys.length > 0 || stock.entry.splits.length > 0)) ||
          extra.includes(stock.instrumentId),
      ),
    [stocks, extra],
  );
  const listedIds = new Set(listed.map((stock) => stock.instrumentId));
  const addable = stocks.filter((stock) => !listedIds.has(stock.instrumentId));

  return (
    <div className="flex flex-col">
      {listed.length > 0 ? (
        <ul className="divide-y divide-oa-border">
          {listed.map((stock) => {
            const expanded = open === stock.instrumentId;
            const gain =
              stock.value !== null ? stock.value - stock.basis : null;
            const lotsCount =
              stock.entry?.buys.length ?? (stock.fromHolding ? 1 : 0);
            return (
              <li key={stock.instrumentId}>
                <div className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-1.5 sm:grid-cols-[8rem_minmax(0,1fr)_7rem_7rem_7rem_auto]">
                  <span className="flex min-w-0 flex-col leading-4">
                    <Link
                      href={`/stock/${encodeURIComponent(stock.ticker)}`}
                      className="oa-mono inline-flex items-center gap-1.5 text-[13px] font-medium text-oa-fg hover:underline"
                    >
                      <StockLogo ticker={stock.ticker} size={16} />
                      {stock.ticker}
                    </Link>
                    <span className="text-[12px] text-oa-muted-fg sm:hidden">
                      {stock.openShares > 0
                        ? `${fmtShares(stock.openShares)} sh · cost ${money(stock.basis, 0)}`
                        : "no open shares"}
                    </span>
                  </span>
                  <span className="hidden text-[12.5px] text-oa-muted-fg sm:block">
                    {stock.fromHolding
                      ? "From your holding, buy date not entered"
                      : `${lotsCount} buy${lotsCount === 1 ? "" : "s"}${stock.entry?.sells.length ? `, ${stock.entry.sells.length} sell${stock.entry.sells.length === 1 ? "" : "s"}` : ""}${stock.entry?.splits.length ? `, ${stock.entry.splits.length} split${stock.entry.splits.length === 1 ? "" : "s"}` : ""}`}
                  </span>
                  <span className="oa-mono hidden text-right text-[13px] tabular-nums text-oa-fg sm:block">
                    {stock.openShares > 0
                      ? `${fmtShares(stock.openShares)} sh`
                      : "none open"}
                  </span>
                  <span
                    className="oa-mono hidden text-right text-[13px] tabular-nums text-oa-muted-fg sm:block"
                    title="Cost of the open shares"
                  >
                    {stock.openShares > 0 ? money(stock.basis) : ""}
                  </span>
                  <span
                    className={`oa-mono hidden text-right text-[13px] tabular-nums sm:block ${gain === null || Math.abs(gain) < 0.005 ? "text-oa-fg" : gain > 0 ? "text-signal-bullish" : "text-signal-bearish"}`}
                    title="Unrealised gain at the latest price"
                  >
                    {gain === null
                      ? ""
                      : `${gain > 0 ? "+" : gain < 0 ? "−" : ""}${money(gain)}`}
                  </span>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() =>
                      setOpen(expanded ? null : stock.instrumentId)
                    }
                    className={BTN_PLAIN}
                  >
                    {expanded
                      ? "Close"
                      : stock.fromHolding
                        ? "Add buy date"
                        : "Edit lots"}
                  </button>
                </div>
                {expanded ? (
                  <Editor stock={stock} onDone={() => setOpen(null)} />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      <div
        className={`flex flex-wrap items-center gap-2 px-4 py-3 ${listed.length > 0 ? "border-t border-oa-border" : ""}`}
      >
        {addable.length > 0 ? (
          <>
            <label className="flex items-center gap-2 text-[13px] text-oa-muted-fg">
              <span>Add lots for</span>
              <select
                value={choice}
                onChange={(e) => setChoice(e.target.value)}
                className={`${INPUT} min-w-[8rem] pr-6`}
                aria-label="Stock to add lots for"
              >
                <option value="">Choose a stock</option>
                {addable.map((stock) => (
                  <option key={stock.instrumentId} value={stock.instrumentId}>
                    {stock.ticker}
                    {stock.holding ? "" : " (watching)"}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={!choice}
              onClick={() => {
                setExtra((current) => [...current, choice]);
                setOpen(choice);
                setChoice("");
              }}
              className={BTN_PRIMARY}
            >
              Add lots
            </button>
            <span className="text-[12px] text-oa-muted-fg">
              Not listed?{" "}
              <Link
                href="/watchlist"
                className="underline decoration-oa-border underline-offset-2 hover:text-oa-fg"
              >
                Add it to Portfolio
              </Link>{" "}
              first.
            </span>
          </>
        ) : (
          <span className="text-[13px] text-oa-muted-fg">
            {stocks.length === 0
              ? "Lots are kept for stocks in your Portfolio. "
              : "Every stock in your Portfolio has lots. "}
            <Link
              href="/watchlist"
              className="font-medium text-oa-fg underline decoration-oa-border underline-offset-2"
            >
              Add a US stock to Portfolio
            </Link>{" "}
            to keep lots for it.
          </span>
        )}
      </div>
    </div>
  );
}
