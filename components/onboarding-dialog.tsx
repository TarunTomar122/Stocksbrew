"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";
import { usePathname, useRouter } from "next/navigation";

import { OaButton } from "@/components/oa/button";
import { uiFont } from "@/components/oa/font";
import { StockLogo } from "@/components/stock-logo";
import { captureEvent } from "@/lib/posthog";
import { dispatchRadarTrackChanged } from "@/lib/radar-track-events";
import type { SearchEntry } from "@/lib/search";
import { getClientSearchIndex, prefetchSearchIndex } from "@/lib/search-index-client";
import { POST_SIGNUP_ONBOARDING_PENDING, POST_SIGNUP_ONBOARDING_SEEN } from "@/lib/sign-in";
import { scoreSearchEntry } from "@/lib/ticker-search-utils";

/**
 * The first-run dialog: three ways to get a few stocks in (search the ones you own, tap popular names, or import a
 * screenshot on /import), then My stocks with our call on each. Loaded only when it opens
 * (components/post-signup-onboarding.tsx), so its code stays off every other page load.
 */

/** Where the person lands once their stocks are in: My stocks, with a call on each. */
const FINISH_HREF = "/portfolio";

type OnboardingStep = "choose" | "own" | "popular";
type Kind = "holding" | "watchlist";

// Bringing the real holdings in comes first: with share counts, every page can show what they are worth and what you made.
const CHOICES: Array<{ id: "own" | "popular" | "import"; title: string; detail: string }> = [
  { id: "import", title: "Bring your holdings in", detail: "Upload the CSV your broker exports, or paste your list with share counts. You check every row first." },
  { id: "own", title: "Add the stocks you own", detail: "Search by name or ticker and pick as many as you like." },
  { id: "popular", title: "Pick from popular stocks", detail: "Tap the big names you own or want to follow." },
];

/** The most widely held US stocks, as a quick start. Resolved against the search index, so a missing one just drops out. */
const POPULAR = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "AVGO", "JPM", "COST", "NFLX", "AMD"] as const;

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

function onboardingStorage(action: (store: Storage) => void) {
  try {
    action(localStorage);
  } catch {
    // private mode or blocked storage: the dialog still works, it just may show again
  }
}

const isWide = () => typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches;

/**
 * `retry`: stocks picked on the landing that could not be added after sign-in. The dialog opens on them, as stocks
 * to watch, with the failure said once above the button, so one tap tries again.
 */
export function OnboardingDialog({
  onClosed,
  retry,
}: {
  onClosed: () => void;
  retry?: { picks: ReadonlyArray<{ instrumentId: string; ticker: string }>; message: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [step, setStep] = useState<OnboardingStep>(retry?.picks.length ? "popular" : "choose");
  const [kind, setKind] = useState<Kind>(retry?.picks.length ? "watchlist" : "holding");
  const [picked, setPicked] = useState<SearchEntry[]>(() =>
    (retry?.picks ?? []).map((pick) => ({ instrument_id: pick.instrumentId, ticker: pick.ticker, name: pick.ticker })),
  );
  const [index, setIndex] = useState<SearchEntry[]>(() => getClientSearchIndex("US"));
  const [indexFailed, setIndexFailed] = useState(false);
  const [indexTry, setIndexTry] = useState(0);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState(() => (retry?.picks.length ? retry.message : ""));
  /** On the landing picks that could not be added, until the person goes Back to the other ways in. */
  const [retrying, setRetrying] = useState(() => Boolean(retry?.picks.length));
  /** Stocks already saved by an add that partly failed: closing now still lands on My stocks. */
  const [saved, setSaved] = useState(0);
  const dialogRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const close = useCallback(
    (reason: "dismissed" | "completed", properties: Record<string, unknown> = {}) => {
      onboardingStorage((store) => {
        store.setItem(POST_SIGNUP_ONBOARDING_SEEN, "1");
        store.removeItem(POST_SIGNUP_ONBOARDING_PENDING);
      });
      captureEvent(`onboarding_${reason}`, properties);
      onClosed();
    },
    [onClosed],
  );

  const goToMyStocks = useCallback(() => {
    if (pathname === FINISH_HREF) router.refresh();
    else router.push(FINISH_HREF);
  }, [pathname, router]);

  /** Closing (X, Escape, Skip). After a partial save it is not a dismissal: the saved stocks are waiting on My stocks. */
  const leave = useCallback(() => {
    if (saved > 0) {
      close("completed", { path: step, action: "stocks_added", count: saved, partial: true });
      goToMyStocks();
      return;
    }
    close("dismissed", { step });
  }, [close, goToMyStocks, saved, step]);

  // The search index serves both the search and the popular tiles (their names and instrument ids).
  useEffect(() => {
    if (index.length > 0) return;
    let cancelled = false;
    prefetchSearchIndex("US")
      .then((entries) => {
        if (cancelled) return;
        if (entries.length > 0) setIndex(entries);
        else setIndexFailed(true);
      })
      .catch(() => {
        if (!cancelled) setIndexFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [index.length, indexTry]);

  const retryIndex = () => {
    setIndexFailed(false);
    setIndexTry((count) => count + 1);
  };

  // Escape closes it (unless stocks are being added); Tab stays inside the dialog.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        leave();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialogRef.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialogRef.current.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, leave]);

  // The page behind does not scroll while the dialog is open, and focus goes back where it was when it closes.
  useEffect(() => {
    const previous = document.body.style.overflow;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  // Each step announces itself: focus goes to its heading, or straight into the search on a wide screen
  // (on a phone the keyboard would cover half the sheet before the person has read it).
  useEffect(() => {
    if (step === "own" && isWide()) searchRef.current?.focus();
    else headingRef.current?.focus();
  }, [step]);

  const pickedIds = useMemo(() => new Set(picked.map((entry) => entry.instrument_id)), [picked]);

  function toggle(entry: SearchEntry) {
    if (busy) return;
    setError("");
    setPicked((current) =>
      current.some((row) => row.instrument_id === entry.instrument_id)
        ? current.filter((row) => row.instrument_id !== entry.instrument_id)
        : [...current, entry],
    );
  }

  function add(entry: SearchEntry) {
    if (busy) return;
    setError("");
    setPicked((current) => (current.some((row) => row.instrument_id === entry.instrument_id) ? current : [...current, entry]));
  }

  function choose(id: (typeof CHOICES)[number]["id"]) {
    captureEvent("onboarding_path_selected", { path: id });
    if (id === "import") {
      close("completed", { path: "import", action: "import_opened" });
      router.push("/import");
      return;
    }
    // Each path starts with nothing picked, so a pick from one never goes in with the other's kind.
    setPicked([]);
    setError("");
    setStep(id);
  }

  function back() {
    setRetrying(false);
    setPicked([]);
    setError("");
    setStep("choose");
  }

  // "Which stocks do you own?" adds holdings; the popular names ask whether you own them.
  const positionType: Kind = step === "own" ? "holding" : kind;

  async function addOne(entry: SearchEntry): Promise<void> {
    const post = () =>
      fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instrument_id: entry.instrument_id, position_type: positionType }),
      });
    let response = await post();
    // A brand-new account's profile can take a moment to exist; one retry covers it.
    if (response.status === 409) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      response = await post();
    }
    if (!response.ok) throw new AddError(response.status);
  }

  async function finish() {
    if (busy || picked.length === 0) return;
    setError("");
    const queue = [...picked];
    const failed: SearchEntry[] = [];
    let added = 0;
    let signedOut = false;
    setBusy({ done: 0, total: queue.length });
    // One at a time: each add is a transaction on the same user record.
    for (const entry of queue) {
      try {
        await addOne(entry);
        added += 1;
        captureEvent("onboarding_stock_added", { path: step, ticker: entry.ticker, instrument_id: entry.instrument_id, position_type: positionType });
      } catch (caught) {
        failed.push(entry);
        if (caught instanceof AddError && caught.status === 401) signedOut = true;
        captureEvent("onboarding_action_failed", { path: step, action: "stock_added", ticker: entry.ticker, error: caught instanceof Error ? caught.message : "unknown" });
      }
      setBusy({ done: added + failed.length, total: queue.length });
    }
    setBusy(null);
    if (added > 0) dispatchRadarTrackChanged({ action: "add", count: added });
    const total = saved + added;
    if (failed.length > 0) {
      setSaved(total);
      setPicked(failed);
      const names = failed.map((entry) => entry.ticker).join(", ");
      setError(
        signedOut
          ? "Your sign-in has run out. Sign in again and add them from here or from any stock's page."
          : total > 0
            ? `We added ${total === 1 ? "1 stock" : `${total} stocks`} but could not add ${names}. Try again, or carry on without ${failed.length === 1 ? "it" : "them"}.`
            : `We could not add ${names} just now. Check your connection and try again.`,
      );
      return;
    }
    close("completed", { path: step, action: "stocks_added", count: total, position_type: positionType });
    goToMyStocks();
  }

  const popular = useMemo(() => {
    const byTicker = new Map(index.map((entry) => [entry.ticker, entry]));
    return POPULAR.map((ticker) => byTicker.get(ticker)).filter((entry): entry is SearchEntry => Boolean(entry));
  }, [index]);

  const title = retrying ? "Watch the stocks you picked" : step === "choose" ? "Add your stocks" : step === "own" ? "Which stocks do you own?" : "Pick a few big names";
  const lede = retrying
    ? "They are still here. Add them again, and tap any big name below you want to follow too."
    : step === "choose"
      ? "Add the stocks you own or follow and you will see our call on each one, its news and how it did today. Start whichever way is easiest."
      : step === "own"
        ? "Search by company or ticker. Add a few now and the rest any time."
        : "Tap the ones you own or want to follow. You can add any other stock from its page later.";
  const addLabel = busy
    ? `Adding ${Math.min(busy.done + 1, busy.total)} of ${busy.total}…`
    : picked.length === 0
      ? "Pick a stock to continue"
      : `Add ${picked.length === 1 ? "1 stock" : `${picked.length} stocks`} and see our calls`;

  return (
    <div className={`oa-app ${uiFont.variable} fixed inset-0 z-[150] flex items-end justify-center bg-black/55 sm:items-center sm:px-4 sm:py-8`}>
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-oa-border bg-oa-card text-oa-fg shadow-[0_24px_64px_rgba(0,0,0,0.28)] sm:max-h-[min(44rem,90dvh)] sm:max-w-[34rem] sm:rounded-2xl"
      >
        <header className="flex items-start gap-3 px-5 pb-3 pt-5 sm:px-7 sm:pt-6">
          <div className="min-w-0 flex-1">
            {step !== "choose" ? (
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={back}
                className="mb-2 text-[13px] font-medium text-oa-muted-fg underline decoration-oa-border underline-offset-4 hover:text-oa-fg disabled:opacity-50"
              >
                Back
              </button>
            ) : null}
            <h2 id="onboarding-title" ref={headingRef} tabIndex={-1} className="text-[22px] font-semibold leading-7 tracking-[-0.01em] outline-none sm:text-[24px]">
              {title}
            </h2>
            <p className="mt-1.5 text-[14.5px] leading-[1.45] text-oa-muted-fg">{lede}</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            disabled={Boolean(busy)}
            onClick={leave}
            className="-mr-1.5 -mt-1 grid size-9 shrink-0 place-items-center rounded-full text-oa-muted-fg transition-colors hover:bg-oa-accent hover:text-oa-fg disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="size-[18px]">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-7">
          {step === "choose" ? (
            <ul className="flex flex-col gap-2.5">
              {CHOICES.map((choice) => (
                <li key={choice.id}>
                  <button
                    type="button"
                    onClick={() => choose(choice.id)}
                    className="w-full rounded-xl border border-oa-border bg-oa-bg px-4 py-3.5 text-left transition-colors hover:border-[color-mix(in_srgb,var(--ink)_24%,transparent)] hover:bg-oa-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_45%,transparent)]"
                  >
                    <span className="block text-[16px] font-semibold leading-6">{choice.title}</span>
                    <span className="mt-0.5 block text-[14px] leading-5 text-oa-muted-fg">{choice.detail}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : step === "own" ? (
            <StockSearch
              inputRef={searchRef}
              index={index}
              indexFailed={indexFailed}
              onRetry={retryIndex}
              pickedIds={pickedIds}
              busy={Boolean(busy)}
              onToggle={toggle}
              onAdd={add}
            />
          ) : (
            <PopularGrid
              popular={popular}
              loading={index.length === 0 && !indexFailed}
              failed={indexFailed}
              onRetry={retryIndex}
              pickedIds={pickedIds}
              busy={Boolean(busy)}
              onToggle={toggle}
            />
          )}

          {step !== "choose" && picked.length > 0 ? (
            <div className="mt-4">
              <p className="text-[13px] font-medium text-oa-muted-fg">{picked.length === 1 ? "1 stock picked" : `${picked.length} stocks picked`}</p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {picked.map((entry) => (
                  <li key={entry.instrument_id}>
                    <button
                      type="button"
                      disabled={Boolean(busy)}
                      onClick={() => toggle(entry)}
                      aria-label={`Remove ${entry.ticker}`}
                      className="inline-flex h-8 items-center gap-1.5 rounded-full border border-oa-border bg-oa-bg pl-1 pr-2.5 text-[13px] transition-colors hover:bg-oa-accent disabled:opacity-60"
                    >
                      <StockLogo ticker={entry.ticker} size={22} circle eager />
                      <span className="oa-mono font-medium">{entry.ticker}</span>
                      <span aria-hidden className="text-oa-muted-fg">×</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <footer className="border-t border-oa-border bg-oa-card px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-7 sm:pb-4">
          {/* The error sits here, above the button, so a long list never scrolls it out of sight. */}
          {error ? (
            <div role="alert" className="mb-3 text-[14px] leading-5">
              <p className="text-signal-bearish">{error}</p>
              {saved > 0 ? (
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={leave}
                  className="mt-2 font-medium text-oa-fg underline decoration-oa-border underline-offset-4 disabled:opacity-50"
                >
                  Continue without {picked.length === 1 ? "it" : "them"}
                </button>
              ) : null}
            </div>
          ) : null}
          {step === "choose" ? (
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={leave}
                className="shrink-0 text-[14px] font-medium text-oa-muted-fg underline decoration-oa-border underline-offset-4 hover:text-oa-fg"
              >
                Skip for now
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {step === "popular" ? <KindSwitch kind={kind} onChange={setKind} disabled={Boolean(busy)} /> : <span className="hidden sm:block" />}
              <OaButton size="md" className="h-11 w-full px-4 text-[15px] sm:h-10 sm:w-auto" loading={Boolean(busy)} disabled={picked.length === 0} onClick={() => void finish()}>
                {addLabel}
              </OaButton>
            </div>
          )}
        </footer>
      </section>
    </div>
  );
}

class AddError extends Error {
  constructor(readonly status: number) {
    super(`status ${status}`);
  }
}

/** Own them or just watching: holdings show on My stocks with their gain; watched stocks get the same call and news. */
function KindSwitch({ kind, onChange, disabled }: { kind: Kind; onChange: (kind: Kind) => void; disabled: boolean }) {
  const options: Array<{ id: Kind; label: string }> = [
    { id: "holding", label: "I own them" },
    { id: "watchlist", label: "Just watching" },
  ];
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const at = options.findIndex((option) => option.id === kind);
    const next = (at + (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1) + options.length) % options.length;
    onChange(options[next]!.id);
    refs.current[next]?.focus();
  }
  return (
    <div role="radiogroup" aria-label="Do you own these stocks?" onKeyDown={onKeyDown} className="inline-flex h-9 shrink-0 rounded-lg border border-oa-border bg-oa-bg p-0.5">
      {options.map((option, position) => (
        <button
          key={option.id}
          ref={(node) => {
            refs.current[position] = node;
          }}
          type="button"
          role="radio"
          aria-checked={kind === option.id}
          tabIndex={kind === option.id ? 0 : -1}
          disabled={disabled}
          onClick={() => onChange(option.id)}
          className={`flex-1 whitespace-nowrap rounded-md px-3 text-[13.5px] font-medium transition-colors disabled:opacity-60 ${
            kind === option.id ? "bg-oa-card text-oa-fg shadow-[var(--oa-shadow)]" : "text-oa-muted-fg hover:text-oa-fg"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function RetryLine({ onRetry }: { onRetry: () => void }) {
  return (
    <p className="mt-3 text-[14px] text-oa-muted-fg">
      We could not load the list of stocks.{" "}
      <button type="button" onClick={onRetry} className="font-medium text-oa-fg underline decoration-oa-border underline-offset-4">
        Try again
      </button>
    </p>
  );
}

function StockSearch({
  inputRef,
  index,
  indexFailed,
  onRetry,
  pickedIds,
  busy,
  onToggle,
  onAdd,
}: {
  inputRef: RefObject<HTMLInputElement>;
  index: SearchEntry[];
  indexFailed: boolean;
  onRetry: () => void;
  pickedIds: Set<string>;
  busy: boolean;
  onToggle: (entry: SearchEntry) => void;
  /** Enter adds the top result; it never takes one away. */
  onAdd: (entry: SearchEntry) => void;
}) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return index
      .map((entry) => ({ entry, score: scoreSearchEntry(entry, q) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((row) => row.entry);
  }, [index, query]);

  const q = query.trim();
  return (
    <div>
      <label className="flex h-11 items-center gap-2.5 rounded-xl border border-oa-border bg-oa-bg px-3.5 transition-colors focus-within:border-[color-mix(in_srgb,var(--ink)_28%,transparent)]">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="size-[18px] shrink-0 text-oa-muted-fg">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && results[0] && !busy) {
              event.preventDefault();
              onAdd(results[0]);
              setQuery("");
            }
          }}
          placeholder="Apple, NVDA, Costco…"
          autoComplete="off"
          spellCheck={false}
          aria-label="Search for a stock you own"
          className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-oa-fg outline-none placeholder:text-oa-muted-fg"
        />
      </label>

      {indexFailed && index.length === 0 ? (
        <RetryLine onRetry={onRetry} />
      ) : q ? (
        results.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-1">
            {results.map((entry) => {
              const on = pickedIds.has(entry.instrument_id);
              return (
                <li key={entry.instrument_id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    disabled={busy}
                    onClick={() => onToggle(entry)}
                    className={`flex h-11 w-full items-center gap-3 rounded-lg px-2.5 text-left transition-colors disabled:opacity-60 ${
                      on ? "bg-[color-mix(in_srgb,var(--oa-primary)_12%,transparent)]" : "hover:bg-oa-accent"
                    }`}
                  >
                    <StockLogo ticker={entry.ticker} size={26} eager />
                    <span className="oa-mono w-16 shrink-0 text-[14px] font-medium">{entry.ticker}</span>
                    <span className="min-w-0 flex-1 truncate text-[14px] text-oa-muted-fg">{entry.name}</span>
                    {on ? <span className="shrink-0 text-[13px] font-medium text-oa-primary">Added</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 text-[14px] text-oa-muted-fg">
            {index.length === 0 ? "Loading the stock list…" : `We do not cover “${q}” yet. Try its full company name or another ticker.`}
          </p>
        )
      ) : null}
    </div>
  );
}

function PopularGrid({
  popular,
  loading,
  failed,
  onRetry,
  pickedIds,
  busy,
  onToggle,
}: {
  popular: SearchEntry[];
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  pickedIds: Set<string>;
  busy: boolean;
  onToggle: (entry: SearchEntry) => void;
}) {
  if (failed && popular.length === 0) return <RetryLine onRetry={onRetry} />;
  if (loading) {
    return (
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-busy="true" aria-label="Loading popular stocks">
        {POPULAR.map((ticker) => (
          <li key={ticker} className="h-[58px] animate-pulse rounded-xl border border-oa-border bg-oa-bg" />
        ))}
      </ul>
    );
  }
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {popular.map((entry) => {
        const on = pickedIds.has(entry.instrument_id);
        return (
          <li key={entry.instrument_id}>
            <button
              type="button"
              aria-pressed={on}
              disabled={busy}
              onClick={() => onToggle(entry)}
              className={`flex h-[58px] w-full items-center gap-2.5 rounded-xl border px-3 text-left transition-colors disabled:opacity-60 ${
                on
                  ? "border-[color-mix(in_srgb,var(--oa-primary)_60%,transparent)] bg-[color-mix(in_srgb,var(--oa-primary)_12%,transparent)]"
                  : "border-oa-border bg-oa-bg hover:bg-oa-accent"
              }`}
            >
              <StockLogo ticker={entry.ticker} size={28} eager />
              <span className="min-w-0">
                <span className="oa-mono block text-[14px] font-medium leading-5">{entry.ticker}</span>
                <span className="block truncate text-[12.5px] leading-4 text-oa-muted-fg">{entry.name}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
