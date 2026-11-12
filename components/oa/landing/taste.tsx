"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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

export function LandingTaste({
  lead,
  demo,
  proof,
  footnote,
}: {
  /** The hero's headline and line under it (server-rendered by the landing), above the search. */
  lead: React.ReactNode;
  /** The live demo card (components/oa/landing/hero-demo.tsx) in the right column until someone picks a stock. */
  demo: React.ReactNode;
  proof: string | null;
  footnote: string | null;
}) {
  const { user, initialAuthed } = useUser();
  const signedIn = Boolean(user || initialAuthed);
  const [index, setIndex] = useState<SearchEntry[]>(() => getClientSearchIndex("US"));
  const router = useRouter();
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
  const cardsRef = useRef<HTMLUListElement>(null);
  const actionRef = useRef<HTMLDivElement>(null);
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

  /** One stock picked from the search opens its page (owner, Nov 12: "this search should lead to the actual stock page"). */
  function choose(ticker: string) {
    const symbol = ticker.trim().toUpperCase();
    if (!symbol) return;
    captureEvent("landing_search_opened_stock", { ticker: symbol });
    setOpen(false);
    router.push(`/stock/${encodeURIComponent(symbol)}`);
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

  /** `placement`: the button under the cards, or the phone's bar above the tab bar (StickyWatch). */
  async function watch(placement: "inline" | "sticky" = "inline") {
    if (busy || ready.length === 0) return;
    const chosen: PendingPick[] = ready.map((card) => ({ instrumentId: card.instrumentId, ticker: card.ticker }));
    setBusy(true);
    setError("");
    captureEvent("landing_taste_watch_clicked", { count: chosen.length, signed_in: signedIn, tickers: chosen.map((pick) => pick.ticker), placement });
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

  const watchLabel = ready.length === 1 ? `Watch ${ready[0]!.ticker} for me` : "Watch these for me";

  return (
    // Two columns from lg: the headline and the search on the left, and on the right the live demo card, which the
    // visitor's own picks replace as soon as there is one (so the call they asked for shows where the demo was). On a
    // phone the right column stacks under the search. The cards come first and the action under them; three cards can
    // push it below the fold on a phone, so a slim copy sits just above the bottom tab bar while the cards are on
    // screen and the real one is not (StickyWatch). With no demo and no picks the right column is empty and hides,
    // and the left one takes the row. Top-aligned with a fixed inset rather than centred, so the headline and the
    // field do not jump when picks make the right column taller.
    <div className="flex w-full flex-col gap-8 lg:flex-row lg:items-start lg:gap-12 xl:gap-16">
      <div className="min-w-0 lg:flex-1 lg:pt-12">
        {lead}
        <div ref={boxRef} className="relative mt-6 w-full max-w-xl sm:mt-8">
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
          <p className="mt-3 text-[15px] leading-6 text-oa-muted-fg">
            Or try{" "}
            {SUGGESTED.map((ticker, i) => (
              <span key={ticker}>
                {i === 0 ? "" : i === SUGGESTED.length - 1 ? " or " : ", "}
                <Link prefetch={false} href={`/stock/${ticker}`} className="font-medium text-oa-fg underline decoration-oa-border underline-offset-4 hover:decoration-oa-fg">
                  {ticker}
                </Link>
              </span>
            ))}
          </p>
        ) : null}
        {limited ? (
          <p role="status" className="mt-3 text-[14px] leading-5 text-oa-muted-fg">
            {TASTE_RATE_LIMITED}
          </p>
        ) : null}
        {missing.length ? (
          <p className="mt-3 text-[14px] leading-5 text-oa-muted-fg">
            We don&apos;t cover {listWords(missing)} yet.
          </p>
        ) : null}

        {/* Not on a phone: the demo card under the search makes the same point, and is worth the room. */}
        {proof ? <p className="mt-5 hidden text-[14px] leading-5 text-oa-muted-fg sm:block">{proof}</p> : null}
      </div>

      <div className="min-w-0 empty:hidden lg:w-[440px] lg:shrink-0">
        {picks.length ? (
          <>
            <ul
              ref={cardsRef}
              aria-live="polite"
              className={`grid w-full grid-cols-1 gap-3 text-left lg:grid-cols-1 ${
                picks.length === 2 ? "md:grid-cols-2" : picks.length === 3 ? "md:grid-cols-3" : "md:max-w-md"
              }`}
            >
              {picks.map((ticker) => (
                <TasteSlot key={ticker} ticker={ticker} slot={slots[ticker]} line={lineFor.get(ticker) ?? null} onRetry={() => fetchCard(ticker)} />
              ))}
            </ul>

            {pricedAt ? <p className="mt-2 text-[13px] leading-5 text-oa-muted-fg">Moves as of {pricedAt}</p> : null}

            {ready.length ? (
              <div ref={actionRef} className="mt-4 flex flex-col items-start gap-2">
                <OaButton size="md" loading={busy} onClick={() => void watch()} className="h-11 px-6 text-[15px]">
                  {watchLabel}
                </OaButton>
                {!signedIn && footnote ? <p className="text-[14px] leading-5 text-oa-muted-fg">{footnote}</p> : null}
                {error ? (
                  <p role="alert" className="text-[14px] leading-5 text-signal-bearish">
                    {error}
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        ) : (
          demo
        )}
      </div>
      {ready.length ? <StickyWatch cardsRef={cardsRef} actionRef={actionRef} label={watchLabel} busy={busy} error={error} onWatch={() => void watch("sticky")} /> : null}
    </div>
  );
}

/**
 * Phones only: "Watch these for me" as a slim bar just above the bottom tab bar, shown while the cards are on screen
 * and the button under them is not, so the action never sits below the fold. From md up the cards sit side by side,
 * short enough that the button under them is in view with them, so the bar is hidden there (md:hidden).
 */
function StickyWatch({
  cardsRef,
  actionRef,
  label,
  busy,
  error,
  onWatch,
}: {
  cardsRef: React.RefObject<HTMLElement>;
  actionRef: React.RefObject<HTMLElement>;
  label: string;
  busy: boolean;
  /** Said in the bar too: the one under the cards is off screen while the bar shows. */
  error: string;
  onWatch: () => void;
}) {
  const [cardsSeen, setCardsSeen] = useState(false);
  const [actionSeen, setActionSeen] = useState(false);
  const [navHeight, setNavHeight] = useState(0);
  useEffect(() => {
    const cards = cardsRef.current;
    const action = actionRef.current;
    if (!cards || !action || typeof IntersectionObserver === "undefined") return;
    let watchCards: IntersectionObserver | null = null;
    let watchAction: IntersectionObserver | null = null;
    let height = -1;
    // Measured again when the screen turns or resizes: the tab bar's height (and whether it shows) can change. iOS
    // fires resize while scrolling (the address bar), so the observers are rebuilt only when the height changed.
    const measure = () => {
      const nav = document.querySelector<HTMLElement>(".oa-mobile-nav");
      const bottom = nav && getComputedStyle(nav).display !== "none" ? Math.round(nav.getBoundingClientRect().height) : 0;
      if (bottom === height) return;
      height = bottom;
      setNavHeight(bottom);
      // The tab bar covers the bottom of the screen, so "on screen" ends where it starts.
      const margin = `0px 0px -${bottom}px 0px`;
      watchCards?.disconnect();
      watchAction?.disconnect();
      watchCards = new IntersectionObserver(([entry]) => setCardsSeen(Boolean(entry?.isIntersecting)), { rootMargin: margin });
      // Any part of the real button on screen hides the bar: two buttons are never in view at once.
      watchAction = new IntersectionObserver(([entry]) => setActionSeen(Boolean(entry?.isIntersecting)), { rootMargin: margin, threshold: 0 });
      watchCards.observe(cards);
      watchAction.observe(action);
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      watchCards?.disconnect();
      watchAction?.disconnect();
    };
  }, [cardsRef, actionRef]);
  if (!cardsSeen || actionSeen) return null;
  return (
    <div
      className="fixed inset-x-0 z-40 border-t border-oa-border bg-oa-card px-4 py-2 shadow-[0_-6px_16px_-10px_rgba(0,0,0,0.25)] md:hidden"
      style={{ bottom: navHeight }}
    >
      {error ? (
        // Not announced again: the line under the cards is the alert; this is its copy for the eye.
        <p aria-hidden="true" className="mb-1.5 text-center text-[13px] leading-[18px] text-signal-bearish">
          {error}
        </p>
      ) : null}
      <OaButton size="md" loading={busy} onClick={onWatch} className="h-10 w-full text-[15px]">
        {label}
      </OaButton>
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
