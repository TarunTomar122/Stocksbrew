"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { StockCard } from "@/components/briefing/stock-card";
import { OaButton } from "@/components/oa/button";
import { Bar } from "@/components/oa/kit/skeleton";
import { StockLogo } from "@/components/stock-logo";
import { useUser } from "@/lib/auth-context";
import { TASTE_MAX, TASTE_RATE_LIMITED, moveStamp, parseTasteTickers, pickLines, type TasteCard, type TasteLine } from "@/lib/landing-taste-shared";
import { addPicks, clearPendingPicks, savePendingPicks, type PendingPick } from "@/lib/pending-picks";
import { CALL_PLAIN } from "@/lib/plain-copy";
import { captureEvent } from "@/lib/posthog";
import type { SearchEntry } from "@/lib/search";
import { getClientSearchIndex, prefetchSearchIndex } from "@/lib/search-index-client";
import { signInWithGoogle } from "@/lib/sign-in";
import { scoreSearchEntry } from "@/lib/ticker-search-utils";

/**
 * The landing's one action: type two or three tickers, see what we think of each right here (the call, the move
 * with its time, the call's first reason with its source), then "Watch these for me". No sign-in to look; signing
 * in adds them to My stocks (lib/pending-picks.ts carries them across the Google sign-in).
 *
 * `?try=NVDA,JPM,KO` on the landing fills it in, so a link can open with the cards already showing.
 */

type Slot = { state: "loading" } | { state: "ready"; card: TasteCard } | { state: "missing" } | { state: "error" };

const SUGGESTED = ["NVDA", "JPM", "KO"];

const CALL_TONE: Record<string, string> = { Add: "var(--signal-bullish)", Hold: "var(--oa-fg)", Trim: "var(--signal-bearish)" };

function signedPct(value: number): string {
  const shown = Number(value.toFixed(1));
  return `${shown > 0 ? "+" : shown < 0 ? "−" : ""}${Math.abs(shown).toFixed(1)}%`;
}

/** "NVDA", "NVDA and JPM", "NVDA, JPM and KO". */
function listWords(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function LandingTaste({ proof, footnote }: { proof: string | null; footnote: string | null }) {
  const { user, initialAuthed } = useUser();
  const signedIn = Boolean(user || initialAuthed);
  const [index, setIndex] = useState<SearchEntry[]>(() => getClientSearchIndex("US"));
  const [picks, setPicks] = useState<string[]>([]);
  const [slots, setSlots] = useState<Record<string, Slot>>({});
  const [missing, setMissing] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /** Said once, above the cards, when /api/taste turned lookups away (429); each card keeps its own Try again. */
  const [limited, setLimited] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadIndex = useCallback(() => {
    if (index.length > 0) return;
    prefetchSearchIndex("US")
      .then((entries) => {
        if (entries.length > 0) setIndex(entries);
      })
      .catch(() => undefined); // typed tickers still work without suggestions
  }, [index.length]);

  // Mirrors of the state, so several adds in one tick ("Or try NVDA, JPM and KO", a ?try= link) see each other.
  const picksRef = useRef<string[]>([]);
  const requested = useRef<Set<string>>(new Set());
  const gone = useRef<Set<string>>(new Set());
  const setPicksNow = useCallback((next: string[]) => {
    picksRef.current = next;
    setPicks(next);
  }, []);

  const fetchCard = useCallback(
    (ticker: string) => {
      requested.current.add(ticker);
      setSlots((current) => ({ ...current, [ticker]: { state: "loading" } }));
      fetch(`/api/taste?t=${encodeURIComponent(ticker)}`)
        .then(async (response) => {
          if (response.status === 429) setLimited(true);
          if (!response.ok) throw new Error(String(response.status));
          setLimited(false);
          const body = (await response.json()) as { cards?: TasteCard[]; missing?: string[] };
          const card = body.cards?.[0];
          if (card) {
            setSlots((current) => ({ ...current, [ticker]: { state: "ready", card } }));
            return;
          }
          // A ticker we do not have: say so once under the field and take it out of the row.
          gone.current.add(ticker);
          setSlots((current) => ({ ...current, [ticker]: { state: "missing" } }));
          setPicksNow(picksRef.current.filter((item) => item !== ticker));
          setMissing((current) => (current.includes(ticker) ? current : [...current, ticker]));
        })
        .catch(() => {
          requested.current.delete(ticker);
          setSlots((current) => ({ ...current, [ticker]: { state: "error" } }));
        });
    },
    [setPicksNow],
  );

  const add = useCallback(
    (raw: string) => {
      const [ticker] = parseTasteTickers(raw);
      if (!ticker) return;
      setError("");
      // One we already know we lack: just say so again.
      if (gone.current.has(ticker)) {
        setMissing((current) => (current.includes(ticker) ? current : [...current, ticker]));
        return;
      }
      setMissing((current) => current.filter((item) => item !== ticker));
      const current = picksRef.current;
      if (current.includes(ticker) || current.length >= TASTE_MAX) return;
      setPicksNow([...current, ticker]);
      // A card already read (removed, then added back) shows again without a second request.
      if (!requested.current.has(ticker)) fetchCard(ticker);
    },
    [fetchCard, setPicksNow],
  );

  const remove = (ticker: string) => {
    setPicksNow(picksRef.current.filter((item) => item !== ticker));
    setError("");
    inputRef.current?.focus();
  };

  // A link with ?try=NVDA,JPM,KO opens with those cards.
  useEffect(() => {
    let wanted: string[] = [];
    try {
      wanted = parseTasteTickers(new URLSearchParams(window.location.search).get("try"));
    } catch {
      wanted = [];
    }
    for (const ticker of wanted) add(ticker);
  }, [add]);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return index
      .filter((entry) => !picks.includes(entry.ticker.toUpperCase()))
      .map((entry) => ({ entry, score: scoreSearchEntry(entry, q) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((item) => item.entry);
  }, [index, picks, query]);

  useEffect(() => setActive(0), [query]);

  function choose(ticker: string) {
    add(ticker);
    setQuery("");
    setOpen(false);
    inputRef.current?.focus();
  }

  function submit() {
    const typed = query.trim();
    if (!typed) return;
    // Several at once ("nvda, jpm, ko" or "nvda jpm ko"): only with a comma, or when every word is a ticker we know,
    // so a company name with a space ("coca cola") still picks its suggestion.
    const words = typed.split(/[\s,]+/).filter(Boolean);
    const known = new Set(index.map((entry) => entry.ticker.toUpperCase()));
    const several = words.length > 1 && (typed.includes(",") || words.every((word) => known.has(word.toUpperCase())));
    if (several) {
      for (const ticker of parseTasteTickers(typed)) add(ticker);
      setQuery("");
      setOpen(false);
      return;
    }
    const top = results[active];
    if (top) choose(top.ticker);
    else if (words.length === 1) choose(typed);
  }

  const ready = picks
    .map((ticker) => slots[ticker])
    .filter((slot): slot is Extract<Slot, { state: "ready" }> => slot?.state === "ready")
    .map((slot) => slot.card);
  const full = picks.length >= TASTE_MAX;
  const chosenLines = pickLines(ready);
  // Keyed by the ticker as typed, which is how the row is keyed (a card can name a stock its own way).
  const readyTickers = picks.filter((ticker) => slots[ticker]?.state === "ready");
  const lineFor = new Map(readyTickers.map((ticker, i) => [ticker, chosenLines[i] ?? null]));
  // One time for the row, not on every card: the oldest of the prices shown.
  const oldest = ready.map((card) => card.priceAt).filter((at): at is string => Boolean(at) && Number.isFinite(Date.parse(at!))).sort((a, b) => Date.parse(a) - Date.parse(b))[0];
  const pricedAt = oldest ? moveStamp(oldest) : "";
  const showList = open && query.trim().length > 0 && !full;

  async function watch() {
    if (busy || ready.length === 0) return;
    const chosen: PendingPick[] = ready.map((card) => ({ instrumentId: card.instrumentId, ticker: card.ticker }));
    setBusy(true);
    setError("");
    captureEvent("landing_taste_watch_clicked", { count: chosen.length, signed_in: signedIn, tickers: chosen.map((pick) => pick.ticker) });
    if (signedIn) {
      const result = await addPicks(chosen);
      if (result.added > 0) {
        window.location.assign("/portfolio");
        return;
      }
      setBusy(false);
      setError(result.signedOut ? "Your sign-in has run out. Sign in again and try once more." : "We could not add them just now. Check your connection and try again.");
      return;
    }
    // Kept for the page that loads after sign-in, which adds them (components/post-signup-onboarding.tsx).
    const kept = savePendingPicks(chosen);
    try {
      await signInWithGoogle({ surface: "hero" });
    } catch (caught) {
      // Nothing is added later behind their back. Closing the Google window needs no message; anything else does.
      clearPendingPicks();
      setBusy(false);
      const code = (caught as { code?: unknown } | null)?.code;
      if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") {
        setError(code === "auth/popup-blocked" ? "Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again." : "We could not sign you in just now. Try again in a moment.");
      }
      return;
    }
    // Storage blocked: add them here before moving on.
    if (!kept) await addPicks(chosen).catch(() => undefined);
    window.location.assign("/portfolio");
  }

  return (
    // On a phone the action sits right under the field, so three cards never push it below the fold and behind the
    // bottom nav; from md up it stays under the cards. `order` moves it without a second button.
    <div className="mx-auto flex w-full max-w-[60rem] flex-col">
      <div ref={boxRef} className="relative mx-auto w-full max-w-xl">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          onClick={() => inputRef.current?.focus()}
          className="flex min-h-14 flex-wrap items-center gap-1.5 rounded-[28px] border border-oa-border bg-oa-card py-2 pl-4 pr-2 text-left shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-colors focus-within:border-[color-mix(in_srgb,var(--ink)_28%,transparent)]"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="mr-1 size-5 shrink-0 text-oa-muted-fg">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          {picks.map((ticker) => (
            <span key={ticker} className="inline-flex h-9 items-center gap-1.5 rounded-full border border-oa-border bg-oa-bg pl-1.5 pr-1">
              <StockLogo ticker={ticker} size={22} circle eager />
              <span className="oa-mono text-[14px] font-semibold text-oa-fg">{ticker}</span>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  remove(ticker);
                }}
                aria-label={`Remove ${ticker}`}
                className="flex size-6 items-center justify-center rounded-full text-oa-muted-fg outline-none hover:bg-oa-accent hover:text-oa-fg focus-visible:bg-oa-accent"
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" className="size-3">
                  <path d="m4 4 8 8M12 4l-8 8" />
                </svg>
              </button>
            </span>
          ))}
          {full ? null : (
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded={showList}
              aria-controls={showList ? "taste-options" : undefined}
              aria-activedescendant={showList && results[active] ? `taste-option-${active}` : undefined}
              aria-autocomplete="list"
              aria-label="Type a ticker you own or follow"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setOpen(true);
              }}
              onFocus={() => {
                setOpen(true);
                loadIndex();
              }}
              onPointerEnter={loadIndex}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" && results.length) {
                  event.preventDefault();
                  setActive((i) => (i + 1) % results.length);
                } else if (event.key === "ArrowUp" && results.length) {
                  event.preventDefault();
                  setActive((i) => (i - 1 + results.length) % results.length);
                } else if (event.key === "Escape") {
                  setOpen(false);
                } else if (event.key === "Backspace" && !query && picks.length) {
                  remove(picks[picks.length - 1]!);
                }
              }}
              placeholder={picks.length === 0 ? "Type a stock you own, like NVDA" : "Add another"}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              className="h-9 min-w-[8rem] flex-1 bg-transparent text-base text-oa-fg outline-none placeholder:text-oa-muted-fg"
            />
          )}
        </form>

        {showList ? (
          <ul id="taste-options" role="listbox" className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-oa-border bg-oa-card py-1.5 text-left shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
            {results.length === 0 ? (
              <li className="px-5 py-3 text-[15px] text-oa-muted-fg">
                Press Enter to look up <span className="oa-mono font-medium text-oa-fg">{query.trim().toUpperCase()}</span>.
              </li>
            ) : (
              results.map((entry, i) => (
                <li key={entry.instrument_id} id={`taste-option-${i}`} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      choose(entry.ticker);
                    }}
                    onMouseEnter={() => setActive(i)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${i === active ? "bg-oa-accent" : ""}`}
                  >
                    <StockLogo ticker={entry.ticker} size={24} circle />
                    <span className="oa-mono w-16 shrink-0 font-semibold text-oa-fg">{entry.ticker}</span>
                    <span className="min-w-0 flex-1 truncate text-oa-muted-fg">{entry.name}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>

      {picks.length === 0 ? (
        <p className="mt-3 text-center text-[15px] leading-6 text-oa-muted-fg">
          Or try{" "}
          <button
            type="button"
            onClick={() => SUGGESTED.forEach((ticker) => add(ticker))}
            className="font-medium text-oa-fg underline decoration-oa-border underline-offset-4 hover:decoration-oa-fg"
          >
            {listWords(SUGGESTED)}
          </button>
        </p>
      ) : null}
      {limited ? (
        <p role="status" className="order-2 mt-3 text-center text-[14px] leading-5 text-oa-muted-fg md:order-none">
          {TASTE_RATE_LIMITED}
        </p>
      ) : null}
      {missing.length ? (
        <p className="order-2 mt-3 text-center text-[14px] leading-5 text-oa-muted-fg md:order-none">
          We don&apos;t cover {listWords(missing)} yet.
        </p>
      ) : null}

      {picks.length ? (
        <ul
          aria-live="polite"
          className={`order-2 mx-auto mt-6 grid w-full grid-cols-1 gap-3 text-left md:order-none ${
            picks.length === 1 ? "max-w-md" : picks.length === 2 ? "max-w-3xl md:grid-cols-2" : "md:grid-cols-3"
          }`}
        >
          {picks.map((ticker) => (
            <TasteSlot key={ticker} ticker={ticker} slot={slots[ticker]} line={lineFor.get(ticker) ?? null} onRetry={() => fetchCard(ticker)} />
          ))}
        </ul>
      ) : null}

      {pricedAt ? <p className="order-2 mt-2 text-center md:order-none text-[13px] leading-5 text-oa-muted-fg">Moves as of {pricedAt}</p> : null}

      {ready.length ? (
        <div className="order-1 mt-5 flex flex-col items-center gap-2 md:order-none">
          <OaButton size="md" loading={busy} onClick={() => void watch()} className="h-11 px-6 text-[15px]">
            {ready.length === 1 ? `Watch ${ready[0]!.ticker} for me` : "Watch these for me"}
          </OaButton>
          {!signedIn && footnote ? <p className="text-center text-[14px] leading-5 text-oa-muted-fg">{footnote}</p> : null}
          {error ? (
            <p role="alert" className="text-center text-[14px] leading-5 text-signal-bearish">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}

      {proof ? <p className="order-2 mt-5 text-center md:order-none text-[14px] leading-5 text-oa-muted-fg">{proof}</p> : null}
    </div>
  );
}

function TasteSlot({ ticker, slot, line, onRetry }: { ticker: string; slot: Slot | undefined; line: TasteLine | null; onRetry: () => void }) {
  if (!slot || slot.state === "loading" || slot.state === "missing") {
    return (
      <li aria-hidden="true" className="oa-surface flex min-h-[9.5rem] flex-col border border-oa-border bg-oa-card px-3.5 pb-3 pt-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <StockLogo ticker={ticker} size={28} />
            <span className="oa-mono text-[14px] font-semibold text-oa-fg">{ticker}</span>
          </div>
          <Bar className="h-6 w-16" />
        </div>
        <Bar className="mt-3 h-6 w-24" />
        <Bar className="mt-2 h-4 w-full" />
        <Bar className="mt-1.5 h-4 w-2/3" />
      </li>
    );
  }
  if (slot.state === "error") {
    return (
      <li className="oa-surface flex min-h-[9.5rem] flex-col items-start justify-center gap-2 border border-oa-border bg-oa-card px-3.5 py-3">
        <span className="oa-mono text-[14px] font-semibold text-oa-fg">{ticker}</span>
        <p className="text-[14px] leading-5 text-oa-muted-fg">We could not load it just now.</p>
        <button type="button" onClick={onRetry} className="relative z-10 text-[14px] font-medium text-oa-primary hover:underline">
          Try again
        </button>
      </li>
    );
  }
  const { card } = slot;
  const callWord = card.call ? CALL_PLAIN[card.call] : null;
  const tone = card.call ? CALL_TONE[card.call] ?? "var(--oa-fg)" : "var(--oa-fg)";
  return (
    <StockCard
      ticker={card.ticker}
      name={card.name}
      figure={card.dayPct != null ? signedPct(card.dayPct) : null}
      tone={card.dayPct == null ? "flat" : card.dayPct > 0 ? "up" : card.dayPct < 0 ? "down" : "flat"}
      className="min-h-[9.5rem]"
      sentence={
        <>
          {callWord ? (
            <span
              className="inline-flex h-7 items-center whitespace-nowrap rounded-md px-2.5 text-[15px] font-semibold"
              style={{ color: tone, background: `color-mix(in srgb, ${tone} 12%, transparent)` }}
            >
              {callWord}
            </span>
          ) : (
            <span className="text-oa-muted-fg">No current call on {card.ticker}.</span>
          )}
          {line ? (
            <span className="mt-2 block">
              {line.text} <span className="text-[12.5px] leading-[18px] text-oa-muted-fg">{line.source}.</span>
            </span>
          ) : null}
        </>
      }
      cover={
        <Link
          prefetch={false}
          href={`/stock/${encodeURIComponent(card.ticker)}`}
          aria-label={`${card.ticker}: our full view`}
          className="absolute inset-0 z-0 rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
        />
      }
    />
  );
}
