"use client";

import { AnimatedIcon } from "@/components/animated-icon";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { StockLogo } from "@/components/stock-logo";
import { RadarAsyncModal } from "@/components/radar-async-modal";
import { RadarFreeLimitModal } from "@/components/radar-free-limit-modal";
import { FREE_COVERED_STOCKS } from "@/lib/entitlements";
import { buildBatch, needsEmptyConfirm, readDraft } from "@/lib/holding-drafts";
import { flushWatchlistRebuild } from "@/lib/radar-client-refresh";
import { dispatchRadarTrackChanged } from "@/lib/radar-track-events";
import {
  fetchSearchTypeahead,
  getClientSearchIndex,
  prefetchSearchIndex,
} from "@/lib/search-index-client";
import { filterSearchEntries, type SearchEntry } from "@/lib/search-shared";

/** Phones: logo, name, switch, remove (boxes on a second line). Wider: logo, name, shares, cost, switch, remove. */
const ROW_GRID =
  "grid grid-cols-[30px_minmax(0,1fr)_auto_auto] gap-x-3 gap-y-2 sm:grid-cols-[30px_minmax(0,1fr)_88px_104px_auto_auto]";

type PositionType = "holding" | "watchlist";

type StagedHolding = {
  quantity?: number | null;
  market_value?: number | null;
  average_cost?: number | null;
};

type StagedItem = {
  instrument_id: string;
  ticker: string;
  name: string;
  position_type: PositionType;
  holding?: StagedHolding;
};

type Props = {
  initialSearchIndex?: SearchEntry[];
  initialItems: StagedItem[];
  isSubscribed: boolean;
  freeLimit?: number;
  ctaLabel?: string;
  triggerClassName?: string;
  /**
   * The list version (users/{uid}.watchlist_version) the page was read at. Sent with Save, so a list changed in another
   * tab since then is not overwritten: the route answers 409 and the sheet keeps the draft. Left out, no check is made.
   */
  baseVersion?: number | null;
};

function PositionSwitch({
  value,
  onChange,
}: {
  value?: PositionType;
  onChange: (positionType: PositionType) => void;
}) {
  return (
    <div className="shrink-0 flex items-center rounded-full border border-outline-variant bg-surface-container-low p-0.5">
      {(["holding", "watchlist"] as const).map((positionType) => (
        <button
          key={positionType}
          type="button"
          aria-pressed={value === positionType}
          onClick={() => onChange(positionType)}
          className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors ${value === positionType ? "bg-primary text-on-primary shadow-sm" : "text-on-surface-variant hover:text-on-surface"}`}
        >
          {positionType === "holding" ? "Hold" : "Watch"}
        </button>
      ))}
    </div>
  );
}

export function RadarBatchEditModal({
  initialSearchIndex = [],
  initialItems,
  isSubscribed,
  freeLimit = 3,
  ctaLabel = "Add a stock",
  triggerClassName,
  baseVersion = null,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchIndex, setSearchIndex] = useState<SearchEntry[]>(() =>
    initialSearchIndex.length > 0 ? initialSearchIndex : getClientSearchIndex(),
  );
  const [typeaheadResults, setTypeaheadResults] = useState<SearchEntry[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [items, setItems] = useState<StagedItem[]>(() => [...initialItems]);
  // What is typed in each row's shares box, kept as text so "3." or an empty box can be typed freely.
  const [shareDrafts, setShareDrafts] = useState<Record<string, string>>({});
  // The same for the cost per share, so the whole holding can be edited here (the rows have no Edit button).
  const [costDrafts, setCostDrafts] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalStatus, setModalStatus] = useState<"loading" | "success" | "error">("loading");
  const [limitModalOpen, setLimitModalOpen] = useState(false);
  // The version this sheet's own last save produced, so a second save before the page refreshes is not called stale.
  const savedVersion = useRef<number | null>(null);
  // Set after Save on a list with every stock removed: the next Save goes through (council, Nov 12).
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  // Track which IDs existed when modal opened — anything else is "newly added this session"
  const originalIds = useRef<Set<string>>(new Set());

  const wasOpen = useRef(false);
  useEffect(() => {
    const opening = open && !wasOpen.current;
    wasOpen.current = open;
    if (!opening) return;
    setItems([...initialItems]);
    setShareDrafts({});
    setCostDrafts({});
    originalIds.current = new Set(initialItems.map((i) => i.instrument_id));
    setQuery("");
    setError(null);
    setConfirmEmpty(false);
    setSearchError(null);
    setTypeaheadResults([]);
  }, [open, initialItems]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    prefetchSearchIndex("US")
      .then((entries) => {
        if (cancelled) return;
        if (entries.length > 0) {
          setSearchIndex(entries);
          setSearchError(null);
        }
      })
      .catch(() => {
        // Full index failed — typeahead fallback handles search per query.
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setTypeaheadResults([]);
      return;
    }
    if (searchIndex.length > 0) {
      setTypeaheadResults([]);
      setSearchError(null);
      return;
    }

    let cancelled = false;
    setSearchLoading(true);
    setSearchError(null);
    const timer = window.setTimeout(() => {
      fetchSearchTypeahead(q, "US", 20)
        .then((entries) => {
          if (cancelled) return;
          setTypeaheadResults(entries);
          setSearchError(null);
        })
        .catch(() => {
          if (!cancelled) {
            setTypeaheadResults([]);
            setSearchError("Search is temporarily unavailable. Try again in a moment.");
          }
        })
        .finally(() => {
          if (!cancelled) setSearchLoading(false);
        });
    }, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, searchIndex.length]);

  // New items float to the top, existing ones stay in original order
  const sortedItems = useMemo(() => {
    const newOnes = items.filter((i) => !originalIds.current.has(i.instrument_id));
    const oldOnes = items.filter((i) => originalIds.current.has(i.instrument_id));
    return [...newOnes, ...oldOnes];
  }, [items]);

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return [] as SearchEntry[];
    if (searchIndex.length > 0) return filterSearchEntries(searchIndex, q, 20);
    return typeaheadResults;
  }, [query, searchIndex, typeaheadResults]);

  function upsert(entry: SearchEntry, positionType: PositionType) {
    // A stock added back undoes an earlier "remove all" answer: emptying the list again asks again.
    setConfirmEmpty(false);
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.instrument_id === entry.instrument_id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          position_type: positionType,
        };
        return next;
      }
      return [
        ...prev,
        {
          instrument_id: entry.instrument_id,
          ticker: entry.ticker,
          name: entry.name,
          position_type: positionType,
        },
      ];
    });
  }

  function setShares(instrumentId: string, raw: string) {
    setError(null);
    setShareDrafts((prev) => ({ ...prev, [instrumentId]: raw }));
  }

  function setCost(instrumentId: string, raw: string) {
    setError(null);
    setCostDrafts((prev) => ({ ...prev, [instrumentId]: raw }));
  }

  function clearDraft(instrumentId: string) {
    const drop = (prev: Record<string, string>) => {
      if (!(instrumentId in prev)) return prev;
      const next = { ...prev };
      delete next[instrumentId];
      return next;
    };
    setShareDrafts(drop);
    setCostDrafts(drop);
  }

  // What Save would send and any box errors, worked out on every render so each bad box says so as it is typed.
  const draft = buildBatch(items, shareDrafts, costDrafts);

  function remove(instrumentId: string) {
    clearDraft(instrumentId);
    setItems((prev) => prev.filter((i) => i.instrument_id !== instrumentId));
  }

  function setPosition(instrumentId: string, positionType: PositionType) {
    if (positionType === "watchlist") clearDraft(instrumentId);
    setItems((prev) =>
      prev.map((i) =>
        i.instrument_id === instrumentId
          ? { ...i, position_type: positionType, holding: positionType === "watchlist" ? undefined : i.holding }
          : i,
      ),
    );
  }

  async function onSubmit() {
    setError(null);
    if (!isSubscribed && Number.isFinite(freeLimit) && items.length > freeLimit) {
      setLimitModalOpen(true);
      return;
    }
    if (Object.keys(draft.errors).length > 0) {
      setError("Fix the numbers in red first.");
      return;
    }
    // Every stock can go, but a list left empty is asked about once before it is saved.
    if (needsEmptyConfirm(items.length, initialItems.length) && !confirmEmpty) {
      setConfirmEmpty(true);
      return;
    }

    setSubmitting(true);
    setModalStatus("loading");
    setModalOpen(true);

    try {
      const res = await fetch("/api/watchlist/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: draft.items,
          ...(baseVersion !== null ? { base_version: Math.max(baseVersion, savedVersion.current ?? baseVersion) } : {}),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 409 && data?.error === "stale_list") {
          // Nothing was saved. The sheet stays open with the draft, and the person reloads to see the other change.
          setModalOpen(false);
          setError("Your stocks changed in another tab. Reload to see them.");
          return;
        }
        if (res.status === 409 && data?.error === "free_tier_limit_reached") {
          setModalOpen(false);
          setOpen(false);
          setLimitModalOpen(true);
          return;
        }
        throw new Error((data?.error === "swap_limit_reached" && data?.reason) || data?.error || "batch_update_failed");
      }

      const saved = (await res.json().catch(() => ({}))) as { source_version?: unknown };
      if (typeof saved.source_version === "number") savedVersion.current = saved.source_version;
      const initialIds = new Set(initialItems.map((i) => i.instrument_id));
      const addedCount = items.filter((i) => !initialIds.has(i.instrument_id)).length;
      if (addedCount > 0) {
        dispatchRadarTrackChanged({ action: "add", count: addedCount });
      }
      // The saved positions are already durable. Let the expensive view rebuild
      // continue in the background so the user is not blocked by the spinner.
      setModalStatus("success");
      void flushWatchlistRebuild(router, 500);
      await new Promise((resolve) => setTimeout(resolve, 350));
      setModalOpen(false);
      setOpen(false);
    } catch (e) {
      setModalStatus("error");
      setError("Could not save your stocks in one go. Try again.");
      console.error(e);
      setTimeout(() => setModalOpen(false), 1200);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          triggerClassName ??
          "inline-flex w-fit items-center gap-1.5 rounded-full border border-outline-variant bg-surface px-3.5 py-1.5 text-[12px] font-semibold text-on-surface hover:border-on-surface transition-colors"
        }
      >
        {!triggerClassName && <span aria-hidden>＋</span>}
        {ctaLabel}
      </button>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center px-0 md:px-4" role="dialog" aria-modal="true" aria-label="Add or edit stocks">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-on-surface/55 backdrop-blur-sm"
          />

          <div className="relative flex flex-col h-[100dvh] md:h-[min(90dvh,680px)] w-full max-w-[580px] rounded-none md:rounded-3xl bg-surface shadow-[0_24px_80px_rgba(0,0,0,0.28)] overflow-hidden border-0 md:border border-outline-variant">

            {/* ── Header ── */}
            <div className="flex items-center justify-between gap-4 border-b border-outline-variant px-5 py-4 shrink-0">
              <div className="flex items-center gap-3">
                <h3 className="text-[18px] font-semibold text-on-surface tracking-[-0.01em]">Add or edit stocks</h3>
                <span className="rounded-full bg-surface-container px-2.5 py-0.5 text-[11px] font-semibold text-on-surface-variant tabular-nums">
                  {items.length}{!isSubscribed && Number.isFinite(freeLimit) ? `/${freeLimit}` : ""}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full p-1 text-on-surface-variant hover:text-on-surface"
                aria-label="Close"
              >
                <AnimatedIcon name="close" size={20} />
              </button>
            </div>

            {/* ── Search toolbar ── */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-outline-variant shrink-0">
              {/* Search */}
              <div className="flex flex-1 items-center gap-2 rounded-xl border border-outline-variant px-3 py-2 focus-within:border-on-surface transition-colors">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0 text-on-surface-variant">
                  <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
                  <path d="M10 10l2.5 2.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search ticker or company…"
                  className="w-full bg-transparent text-[13px] text-on-surface placeholder:text-on-surface-variant outline-none focus:outline-none focus:ring-0"
                />
                {query && (
                  <button type="button" onClick={() => setQuery("")} className="shrink-0 text-on-surface-variant hover:text-on-surface">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3L3 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                  </button>
                )}
              </div>

            </div>

            {/* ── Content: search results OR stock list ── */}
            <div className="relative flex-1 overflow-hidden">

              {/* Stock list — always rendered, dimmed while searching */}
              <div className={`flex flex-col h-full transition-opacity duration-150 ${query.trim() ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
                {/* One grid for the header and every row, so the boxes line up down the list.
                    Phones: name, switch and remove on the first line, the two boxes on the second.
                    Wider: logo, name, shares, cost, switch, remove in fixed columns. */}
                {sortedItems.some((i) => i.position_type === "holding") ? (
                  <div aria-hidden="true" className={`${ROW_GRID} hidden border-b border-outline-variant px-4 py-2 text-[11px] font-medium text-on-surface-variant sm:grid`}>
                    <span className="col-span-2">Stock</span>
                    <span className="text-right">Shares</span>
                    <span className="text-right">Avg cost</span>
                    <span className="col-span-2" />
                  </div>
                ) : null}
                <ul className="no-scrollbar flex-1 h-full overflow-y-auto divide-y divide-outline-variant">
                  {sortedItems.map((item) => {
                    const isNew = !originalIds.current.has(item.instrument_id);
                    const holding = item.position_type === "holding";
                    const rowErrors = holding ? draft.errors[item.instrument_id] : undefined;
                    return (
                      <li key={item.instrument_id} className={`${ROW_GRID} items-center px-4 py-3 transition-colors ${isNew ? "tint-bull" : ""}`}>
                        <StockLogo ticker={item.ticker} market={item.instrument_id.startsWith("IN_") ? "IN" : "US"} size={30} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-[14px] font-semibold text-on-surface">{item.ticker}</p>
                            {isNew && (
                              <span className="shrink-0 rounded-full bg-[#dcfce7] px-1.5 py-0.5 text-[9px] font-semibold tracking-wide uppercase text-[#16a34a]">New</span>
                            )}
                          </div>
                          {/* The full name, wrapping if it must: never cut off. */}
                          <p className="text-pretty break-words text-[12px] leading-4 text-on-surface-variant">{item.name}</p>
                        </div>
                        {holding ? (
                          <div className="col-span-3 col-start-2 row-start-2 grid grid-cols-2 gap-2 sm:contents">
                            <label className="flex items-center gap-2 sm:col-start-3 sm:row-start-1 sm:block">
                              <span className="shrink-0 text-[12px] text-on-surface-variant sm:sr-only">Shares</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                autoComplete="off"
                                placeholder="0"
                                aria-label={`Shares of ${item.ticker}`}
                                value={shareDrafts[item.instrument_id] ?? (item.holding?.quantity != null ? String(item.holding.quantity) : "")}
                                onChange={(event) => setShares(item.instrument_id, event.target.value)}
                                aria-invalid={Boolean(rowErrors?.shares)}
                                aria-describedby={rowErrors ? `${item.instrument_id}-errors` : undefined}
                                title="Leave it empty to clear it"
                                className="h-9 w-full rounded-lg border border-outline-variant bg-surface px-2.5 text-right text-[14px] tabular-nums text-on-surface outline-none focus:border-on-surface aria-[invalid=true]:border-[#ef4444]"
                              />
                            </label>
                            <label className="flex items-center gap-2 sm:col-start-4 sm:row-start-1 sm:block">
                              <span className="shrink-0 text-[12px] text-on-surface-variant sm:sr-only">Avg cost</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                autoComplete="off"
                                placeholder={item.instrument_id.startsWith("IN_") ? "₹0" : "$0"}
                                aria-label={`Average cost per share of ${item.ticker}`}
                                value={costDrafts[item.instrument_id] ?? (item.holding?.average_cost != null ? String(Math.round(item.holding.average_cost * 100) / 100) : "")}
                                onChange={(event) => setCost(item.instrument_id, event.target.value)}
                                aria-invalid={Boolean(rowErrors?.cost)}
                                aria-describedby={rowErrors ? `${item.instrument_id}-errors` : undefined}
                                title="What you paid for each share, on average. Leave it empty to clear it."
                                className="h-9 w-full rounded-lg border border-outline-variant bg-surface px-2.5 text-right text-[14px] tabular-nums text-on-surface outline-none focus:border-on-surface aria-[invalid=true]:border-[#ef4444]"
                              />
                            </label>
                          </div>
                        ) : (
                          // Keeps the columns in place on wider screens when a row is only watched.
                          <span className="hidden sm:col-span-2 sm:col-start-3 sm:row-start-1 sm:block" />
                        )}
                        {rowErrors ? (
                          <p
                            id={`${item.instrument_id}-errors`}
                            role="alert"
                            className="col-span-3 col-start-2 text-[11px] font-medium text-[#ef4444] sm:col-span-2 sm:col-start-3 sm:text-right"
                          >
                            {[rowErrors.shares ? `Shares: ${rowErrors.shares}` : null, rowErrors.cost ? `Avg cost: ${rowErrors.cost}` : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        ) : null}
                        <div className="col-start-3 row-start-1 justify-self-end sm:col-start-5">
                          <PositionSwitch
                            value={item.position_type}
                            onChange={(positionType) => setPosition(item.instrument_id, positionType)}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => remove(item.instrument_id)}
                          className="col-start-4 row-start-1 shrink-0 justify-self-end rounded-full p-1.5 text-on-surface-variant hover:text-[#ef4444] hover:tint-bear transition-colors sm:col-start-6"
                          aria-label={`Remove ${item.ticker}`}
                        >
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                        </button>
                      </li>
                    );
                  })}
                  {items.length === 0 && (
                    <li className="flex flex-col items-center gap-1 px-4 py-16 text-center">
                      <p className="text-[13px] font-medium text-on-surface">No stocks yet</p>
                      <p className="text-[11px] text-on-surface-variant">Search above to add a stock.</p>
                    </li>
                  )}
                </ul>
              </div>

              {/* Search results — overlays the list while typing */}
              {query.trim().length > 0 && (
                <div className="absolute inset-0 bg-surface overflow-y-auto no-scrollbar">
                  <ul className="divide-y divide-outline-variant">
                    {searchLoading && results.length === 0 ? (
                      <li className="px-4 py-8 text-[13px] text-on-surface-variant text-center">
                        Searching…
                      </li>
                    ) : searchError && results.length === 0 ? (
                      <li className="px-4 py-8 text-[13px] text-[#ef4444] text-center">
                        {searchError}
                      </li>
                    ) : results.length === 0 ? (
                      <li className="px-4 py-8 text-[13px] text-on-surface-variant text-center">
                        No matches for <span className="font-semibold text-on-surface">{query.trim().toUpperCase()}</span>
                      </li>
                    ) : results.map((entry) => {
                      const addedItem = items.find((item) => item.instrument_id === entry.instrument_id);
                      return (
                        <li key={entry.instrument_id} className="flex items-center gap-3 px-4 py-3">
                          <StockLogo ticker={entry.ticker} market={entry.instrument_id.startsWith("IN_") ? "IN" : "US"} size={30} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-semibold text-on-surface">{entry.ticker}</p>
                            <p className="truncate text-[11px] text-on-surface-variant">{entry.name}</p>
                          </div>
                          <PositionSwitch
                            value={addedItem?.position_type}
                            onChange={(positionType) => {
                              if (addedItem) {
                                setPosition(entry.instrument_id, positionType);
                              } else {
                                upsert(entry, positionType);
                                setQuery("");
                              }
                            }}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>

            {/* ── Footer ── */}
            <div className="shrink-0 flex items-center justify-between gap-2 border-t border-outline-variant px-4 py-3 bg-surface">
              {error ? (
                <p className="text-[12px] text-[#ef4444] font-medium">{error}</p>
              ) : confirmEmpty && items.length === 0 ? (
                <p className="text-[12px] font-medium text-on-surface">This removes all your stocks.</p>
              ) : !isSubscribed ? (
                <p className="text-[11px] text-on-surface-variant">
                  {Number.isFinite(freeLimit) ? `Free plan · ${freeLimit} stocks max` : `Track as many as you like. Free covers ${FREE_COVERED_STOCKS} in full.`}
                </p>
              ) : <span />}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-full border border-outline-variant px-4 py-2 text-[12px] font-semibold text-on-surface hover:border-outline-variant transition-colors"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void onSubmit()}
                  disabled={submitting}
                  className="whitespace-nowrap rounded-full bg-on-surface px-4 py-2 text-[12px] font-semibold text-surface disabled:opacity-60 hover:bg-on-surface transition-colors"
                >
                  {submitting ? "Saving…" : confirmEmpty && items.length === 0 ? "Remove all" : "Save & rebuild"}
                </button>
              </div>
            </div>
          </div>
          <style jsx global>{`
            .no-scrollbar {
              -ms-overflow-style: none;
              scrollbar-width: none;
            }
            .no-scrollbar::-webkit-scrollbar {
              display: none;
            }
          `}</style>
        </div>
      )}

      <RadarAsyncModal
        open={modalOpen}
        title="Saving your stocks"
        subtitle="Saved. We’re refreshing the research now."
        status={modalStatus}
      />
      <RadarFreeLimitModal open={limitModalOpen} onClose={() => setLimitModalOpen(false)} limit={freeLimit} />
    </>
  );
}
