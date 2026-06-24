"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { StockLogo } from "@/components/stock-logo";
import { RadarAsyncModal } from "@/components/radar-async-modal";
import { flushWatchlistRebuild } from "@/lib/radar-client-refresh";
import { dispatchRadarTrackChanged } from "@/lib/radar-track-events";
import {
  fetchSearchTypeahead,
  getClientSearchIndex,
  prefetchSearchIndex,
} from "@/lib/search-index-client";
import { filterSearchEntries, type SearchEntry } from "@/lib/search-shared";

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
  enableImageUpload?: boolean;
  triggerClassName?: string;
};

export function RadarBatchEditModal({
  initialSearchIndex = [],
  initialItems,
  isSubscribed,
  freeLimit = 3,
  ctaLabel = "Add a stock",
  enableImageUpload = true,
  triggerClassName,
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalStatus, setModalStatus] = useState<"loading" | "success" | "error">("loading");
  const [extracting, setExtracting] = useState(false);
  const [extractInfo, setExtractInfo] = useState<string | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Track which IDs existed when modal opened — anything else is "newly added this session"
  const originalIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setItems([...initialItems]);
    originalIds.current = new Set(initialItems.map((i) => i.instrument_id));
    setQuery("");
    setError(null);
    setSearchError(null);
    setTypeaheadResults([]);
    setExtractInfo(null);
    setExtractError(null);
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

  const existingIds = useMemo(() => new Set(items.map((i) => i.instrument_id)), [items]);

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

  function remove(instrumentId: string) {
    setItems((prev) => prev.filter((i) => i.instrument_id !== instrumentId));
  }

  function setPosition(instrumentId: string, positionType: PositionType) {
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
    if (!isSubscribed && items.length > freeLimit) {
      setError(`Free plan supports up to ${freeLimit} stocks.`);
      return;
    }
    if (items.length === 0) {
      setError("Add at least one stock.");
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
          items: items.map((i) => {
            const initial = initialItems.find((x) => x.instrument_id === i.instrument_id);
            const holding =
              i.position_type === "holding" ? i.holding ?? initial?.holding : undefined;
            return {
              instrument_id: i.instrument_id,
              position_type: i.position_type,
              ...(holding ? { holding: { ...holding, source: "manual" as const } } : {}),
            };
          }),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 409 && data?.error === "free_tier_limit_reached") {
          setModalStatus("error");
          setError("Free plan limit reached. Upgrade to track more.");
          setTimeout(() => setModalOpen(false), 1000);
          router.push("/subscribe");
          return;
        }
        throw new Error(data?.error || "batch_update_failed");
      }

      setModalStatus("success");
      const initialIds = new Set(initialItems.map((i) => i.instrument_id));
      const addedCount = items.filter((i) => !initialIds.has(i.instrument_id)).length;
      if (addedCount > 0) {
        dispatchRadarTrackChanged({ action: "add", count: addedCount });
      }
      setTimeout(() => {
        setModalOpen(false);
        setOpen(false);
        flushWatchlistRebuild(router, 0);
      }, 700);
    } catch (e) {
      setModalStatus("error");
      setError("Could not update Radar in one go. Try again.");
      console.error(e);
      setTimeout(() => setModalOpen(false), 1200);
    } finally {
      setSubmitting(false);
    }
  }

  async function extractFromImage(file: File) {
    setExtractError(null);
    setExtractInfo(null);
    setExtracting(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const res = await fetch("/api/watchlist/extract-from-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image_data_url: dataUrl, market: "US" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "extract_failed");
      const matches = Array.isArray(data?.matches) ? data.matches : [];
      const positions = Array.isArray(data?.positions) ? data.positions : [];
      if (matches.length === 0) {
        setExtractError("No valid US tickers found in screenshot.");
        return;
      }
      const withAmounts = matches.filter((m: Record<string, unknown>) => {
        const h = (m?.holding as Record<string, unknown> | undefined) || undefined;
        return Boolean(h && (h.quantity != null || h.market_value != null));
      }).length;
      setItems((prev) => {
        const byId = new Map(prev.map((i) => [i.instrument_id, i]));
        for (const m of matches) {
          const instrumentId = String(m?.instrument_id || "");
          if (!instrumentId) continue;
          const h = m?.holding as Record<string, unknown> | undefined;
          const holding: StagedHolding | undefined = h
            ? {
                quantity: typeof h.quantity === "number" ? h.quantity : null,
                market_value: typeof h.market_value === "number" ? h.market_value : null,
                average_cost: typeof h.average_cost === "number" ? h.average_cost : null,
              }
            : undefined;
          const hasHoldingValues = holding && (holding.quantity != null || holding.market_value != null);
          if (!byId.has(instrumentId)) {
            byId.set(instrumentId, {
              instrument_id: instrumentId,
              ticker: String(m?.ticker || instrumentId.replace(/^US_/, "")),
              name: String(m?.name || ""),
              position_type: hasHoldingValues ? "holding" : "watchlist",
              holding: hasHoldingValues ? holding : undefined,
            });
          } else {
            const existing = byId.get(instrumentId)!;
            if (hasHoldingValues && existing.position_type !== "holding") {
              byId.set(instrumentId, { ...existing, position_type: "holding", holding });
            }
          }
        }
        return [...byId.values()];
      });
      const tickerCount = matches.length;
      setExtractInfo(
        withAmounts > 0
          ? `Found ${tickerCount} ticker${tickerCount > 1 ? "s" : ""}, ${withAmounts} with amounts.`
          : `Added ${tickerCount} ticker${tickerCount > 1 ? "s" : ""} from screenshot.`,
      );
    } catch (e) {
      console.error(e);
      setExtractError("Couldn’t read screenshot. Use search below.");
    } finally {
      setExtracting(false);
      if (fileRef.current) fileRef.current.value = "";
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
        <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center px-0 md:px-4" role="dialog" aria-modal="true" aria-label="Edit Radar stocks">
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
                <h3 className="text-[18px] font-semibold text-on-surface tracking-[-0.01em]">Edit your Radar</h3>
                <span className="rounded-full bg-surface-container px-2.5 py-0.5 text-[11px] font-semibold text-on-surface-variant tabular-nums">
                  {items.length}{!isSubscribed ? `/${freeLimit}` : ""}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full p-1 text-on-surface-variant hover:text-on-surface"
                aria-label="Close"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
              </button>
            </div>

            {/* ── Toolbar: search + upload ── */}
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
                  placeholder="Search ticker or company to add…"
                  className="w-full bg-transparent text-[13px] text-on-surface placeholder:text-on-surface-variant outline-none focus:outline-none focus:ring-0"
                />
                {query && (
                  <button type="button" onClick={() => setQuery("")} className="shrink-0 text-on-surface-variant hover:text-on-surface">
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3L3 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
                  </button>
                )}
              </div>

              {/* Upload */}
              {enableImageUpload && (
                <label className={`shrink-0 inline-flex cursor-pointer items-center gap-1.5 rounded-xl border px-3 py-2 text-[12px] font-semibold transition-colors ${
                  extracting
                    ? "border-outline-variant text-on-surface-variant cursor-wait"
                    : extractInfo
                      ? "border-[#10b981] text-[#10b981] tint-bull"
                      : "border-outline-variant text-on-surface bg-surface hover:border-on-surface"
                }`}>
                  {extracting ? (
                    <><span className="h-3 w-3 rounded-full border-2 border-[#9ca3af] border-t-transparent animate-spin" />Reading…</>
                  ) : extractInfo ? (
                    <>✓ Done</>
                  ) : (
                    <>
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="text-on-surface-variant">
                        <path d="M6.5 1v8M3 4.5l3.5-3.5L10 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M1 10.5h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                      </svg>
                      Screenshot
                    </>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={extracting}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void extractFromImage(file);
                    }}
                  />
                </label>
              )}
            </div>

            {/* ── Content: search results OR stock list ── */}
            <div className="relative flex-1 overflow-hidden">

              {/* Stock list — always rendered, dimmed while searching */}
              <div className={`flex flex-col h-full transition-opacity duration-150 ${query.trim() ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
                <ul className="no-scrollbar flex-1 h-full overflow-y-auto divide-y divide-[#f3f4f6]">
                  {sortedItems.map((item) => {
                    const isNew = !originalIds.current.has(item.instrument_id);
                    return (
                      <li key={item.instrument_id} className={`flex items-center gap-2.5 px-4 py-3 transition-colors ${isNew ? "tint-bull" : ""}`}>
                        <StockLogo ticker={item.ticker} market={item.instrument_id.startsWith("IN_") ? "IN" : "US"} size={30} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate text-[13px] font-semibold text-on-surface">{item.ticker}</p>
                            {isNew && (
                              <span className="shrink-0 rounded-full bg-[#dcfce7] px-1.5 py-0.5 text-[9px] font-semibold tracking-wide uppercase text-[#16a34a]">New</span>
                            )}
                          </div>
                          <p className="truncate text-[11px] text-on-surface-variant">{item.name}</p>
                        </div>
                        <div className="shrink-0 flex items-center rounded-full border border-outline-variant bg-surface-container-low p-0.5">
                          <button
                            type="button"
                            onClick={() => setPosition(item.instrument_id, "holding")}
                            className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors ${item.position_type === "holding" ? "bg-surface text-on-surface shadow-sm" : "text-on-surface-variant hover:text-on-surface-variant"}`}
                          >Hold</button>
                          <button
                            type="button"
                            onClick={() => setPosition(item.instrument_id, "watchlist")}
                            className={`rounded-full px-2.5 py-1 text-[10px] font-semibold transition-colors ${item.position_type === "watchlist" ? "bg-surface text-on-surface shadow-sm" : "text-on-surface-variant hover:text-on-surface-variant"}`}
                          >Watch</button>
                        </div>
                        <button
                          type="button"
                          onClick={() => remove(item.instrument_id)}
                          className="shrink-0 rounded-full p-1.5 text-on-surface-variant hover:text-[#ef4444] hover:tint-bear transition-colors"
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
                      <p className="text-[11px] text-on-surface-variant">Search above or upload a screenshot to get started.</p>
                    </li>
                  )}
                </ul>
              </div>

              {/* Search results — overlays the list while typing */}
              {query.trim().length > 0 && (
                <div className="absolute inset-0 bg-surface overflow-y-auto no-scrollbar">
                  <ul className="divide-y divide-[#f3f4f6]">
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
                      const isAdded = existingIds.has(entry.instrument_id);
                      return (
                        <li key={entry.instrument_id} className="flex items-center gap-3 px-4 py-3">
                          <StockLogo ticker={entry.ticker} market={entry.instrument_id.startsWith("IN_") ? "IN" : "US"} size={30} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-semibold text-on-surface">{entry.ticker}</p>
                            <p className="truncate text-[11px] text-on-surface-variant">{entry.name}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {isAdded ? (
                              <span className="rounded-full bg-surface-container px-2.5 py-1 text-[10px] font-semibold text-on-surface-variant">Added ✓</span>
                            ) : (
                              <>
                                <button type="button" onClick={() => { upsert(entry, "holding"); setQuery(""); }}
                                  className="rounded-full border border-outline-variant px-2.5 py-1 text-[10px] font-semibold text-on-surface hover:border-on-surface hover:bg-surface-container-low transition-colors">
                                  Hold
                                </button>
                                <button type="button" onClick={() => { upsert(entry, "watchlist"); setQuery(""); }}
                                  className="rounded-full border border-outline-variant px-2.5 py-1 text-[10px] font-semibold text-on-surface hover:border-on-surface hover:bg-surface-container-low transition-colors">
                                  Watch
                                </button>
                              </>
                            )}
                          </div>
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
              ) : !isSubscribed ? (
                <p className="text-[11px] text-[#f59e0b]">Free plan · {freeLimit} stocks max</p>
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
                  className="rounded-full bg-on-surface px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-60 hover:bg-on-surface transition-colors"
                >
                  {submitting ? "Saving…" : "Save & rebuild"}
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
        title="Updating Radar"
        subtitle="Saved. Radar analysis is refreshing in the background..."
        status={modalStatus}
      />
    </>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const out = typeof reader.result === "string" ? reader.result : "";
      if (!out) reject(new Error("empty_result"));
      else resolve(out);
    };
    reader.onerror = () => reject(reader.error || new Error("read_failed"));
    reader.readAsDataURL(file);
  });
}
