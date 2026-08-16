"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { TickerSearchField } from "@/components/ticker-search-field";
import { useUser } from "@/lib/auth-context";
import { captureEvent } from "@/lib/posthog";
import { trackRadarStockAdded } from "@/lib/product-analytics";
import type { SearchEntry } from "@/lib/search";
import { POST_SIGNUP_ONBOARDING_PENDING } from "@/lib/sign-in";

const SEEN_KEY = "stocksbrew:onboarding:seen";

type OnboardingPath = "research" | "watchlist" | "holdings";

const PATHS: Array<{ id: OnboardingPath; title: string; detail: string }> = [
  { id: "research", title: "Research a stock", detail: "Get a clear read before you buy or watch it." },
  { id: "watchlist", title: "Build a watchlist", detail: "Keep the stocks you care about in one place." },
  { id: "holdings", title: "Follow stocks I own", detail: "See what needs attention in your portfolio." },
];

export function PostSignupOnboarding() {
  const { user, initialAuthed } = useUser();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [path, setPath] = useState<OnboardingPath | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!(user || initialAuthed)) return;
    if (localStorage.getItem(POST_SIGNUP_ONBOARDING_PENDING) !== "1") return;
    if (localStorage.getItem(SEEN_KEY) === "1") return;
    setOpen(true);
    captureEvent("onboarding_viewed");
  }, [user, initialAuthed]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      localStorage.setItem(SEEN_KEY, "1");
      localStorage.removeItem(POST_SIGNUP_ONBOARDING_PENDING);
      setOpen(false);
      captureEvent("onboarding_dismissed", { path });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, path]);

  function close(reason: "dismissed" | "completed", properties: Record<string, unknown> = {}) {
    localStorage.setItem(SEEN_KEY, "1");
    localStorage.removeItem(POST_SIGNUP_ONBOARDING_PENDING);
    setOpen(false);
    captureEvent(`onboarding_${reason}`, properties);
  }

  function choosePath(nextPath: OnboardingPath) {
    setPath(nextPath);
    setError("");
    captureEvent("onboarding_path_selected", { path: nextPath });
  }

  function researchStock(entry: SearchEntry) {
    captureEvent("onboarding_stock_researched", { ticker: entry.ticker, instrument_id: entry.instrument_id });
    close("completed", { path: "research", action: "stock_researched" });
    router.push(`/stock/${encodeURIComponent(entry.ticker)}`);
  }

  function researchTicker(ticker: string) {
    captureEvent("onboarding_stock_researched", { ticker, instrument_id: null });
    close("completed", { path: "research", action: "stock_researched" });
    router.push(`/stock/${encodeURIComponent(ticker)}`);
  }

  async function addToWatchlist(entry: SearchEntry) {
    if (!path || path === "research" || busy) return;
    setBusy(true);
    setError("");
    const positionType = path === "holdings" ? "holding" : "watchlist";
    try {
      const response = await fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instrument_id: entry.instrument_id, position_type: positionType }),
      });
      const result = await response.json() as { first_stock?: boolean; error?: string };
      if (!response.ok) throw new Error(result.error || "Could not add this stock");
      trackRadarStockAdded({
        ticker: entry.ticker,
        instrument_id: entry.instrument_id,
        position_type: positionType,
        first_stock: Boolean(result.first_stock),
      });
      captureEvent("onboarding_stock_added", {
        path,
        ticker: entry.ticker,
        instrument_id: entry.instrument_id,
        position_type: positionType,
        first_stock: Boolean(result.first_stock),
      });
      close("completed", { path, action: "stock_added", position_type: positionType });
      router.push("/watchlist");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Something went wrong";
      setError(message);
      captureEvent("onboarding_action_failed", { path, action: "stock_added", error: message });
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const isResearch = path === "research";
  const action = path === "holdings" ? "Add a holding" : "Add to watchlist";

  return (
    <div className="fixed inset-0 z-[150] grid place-items-center overflow-y-auto bg-black/50 px-4 py-8">
      <section role="dialog" aria-modal="true" aria-labelledby="onboarding-title" className="relative w-full max-w-xl rounded-2xl bg-white px-6 py-7 shadow-2xl sm:px-9 sm:py-8">
        <button type="button" aria-label="Close onboarding" onClick={() => close("dismissed", { path })} className="absolute right-5 top-5 grid h-9 w-9 place-items-center rounded-full text-xl text-on-surface-variant hover:bg-surface-container">×</button>

        {!path ? (
          <>
            <p className="font-mono text-[12px] font-semibold uppercase tracking-[0.16em] text-primary">A quick start</p>
            <h2 id="onboarding-title" className="mt-2 pr-10 text-[28px] font-bold tracking-[-0.03em] text-on-surface sm:text-[34px]">What do you want to do first?</h2>
            <div className="mt-7 divide-y divide-outline-variant border-y border-outline-variant">
              {PATHS.map((item) => (
                <button key={item.id} type="button" onClick={() => choosePath(item.id)} className="flex w-full items-center justify-between gap-4 py-4 text-left transition-colors hover:text-primary">
                  <span><span className="block text-[17px] font-semibold text-on-surface">{item.title}</span><span className="mt-1 block text-[14px] leading-5 text-on-surface-variant">{item.detail}</span></span>
                  <span aria-hidden className="text-xl text-on-surface-variant">→</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <button type="button" onClick={() => setPath(null)} className="text-[14px] font-semibold text-on-surface-variant underline underline-offset-4">Back</button>
            <p className="mt-6 font-mono text-[12px] font-semibold uppercase tracking-[0.16em] text-primary">{isResearch ? "Start with a stock" : "Start your watchlist"}</p>
            <h2 id="onboarding-title" className="mt-2 pr-10 text-[28px] font-bold tracking-[-0.03em] text-on-surface sm:text-[34px]">{isResearch ? "What stock are you looking at?" : path === "holdings" ? "What stock do you own?" : "What stock do you want to follow?"}</h2>
            <p className="mt-3 text-[16px] leading-6 text-on-surface-variant">{isResearch ? "Start with the business, then decide what is worth watching." : `${action}, then StocksBrew will keep the important changes together.`}</p>
            <div className={`mt-7 ${busy ? "pointer-events-none opacity-60" : ""}`}>
              <TickerSearchField
                variant="hero"
                market="US"
                analyticsSource={`onboarding_${path}`}
                onStockSelected={isResearch ? researchStock : addToWatchlist}
                onTickerSubmitted={isResearch ? researchTicker : () => setError("Choose a stock from the search results.")}
              />
            </div>
            {!isResearch && <p className="mt-3 text-[13px] text-on-surface-variant">Choose a result to {action.toLowerCase()}.</p>}
          </>
        )}

        {error && <p role="alert" className="mt-4 text-[14px] font-medium text-[#c62828]">{error}</p>}
      </section>
    </div>
  );
}
