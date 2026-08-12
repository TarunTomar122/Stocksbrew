"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { StockLogo } from "@/components/stock-logo";
import { useUser } from "@/lib/auth-context";
import { captureEvent } from "@/lib/posthog";
import { trackRadarStockAdded } from "@/lib/product-analytics";
import { POST_SIGNUP_ONBOARDING_PENDING } from "@/lib/sign-in";

const SEEN_KEY = "stocksbrew:onboarding:seen";
const STOCKS = [
  { ticker: "NVDA", name: "NVIDIA", instrumentId: "US_NVDA" },
  { ticker: "MSFT", name: "Microsoft", instrumentId: "US_MSFT" },
  { ticker: "AMZN", name: "Amazon", instrumentId: "US_AMZN" },
  { ticker: "AAPL", name: "Apple", instrumentId: "US_AAPL" },
  { ticker: "GOOGL", name: "Alphabet", instrumentId: "US_GOOGL" },
] as const;

type StockBrief = {
  instrument: { ticker: string; name: string };
  market_data: { price: number | null };
  stocksbrew_intelligence: {
    call: {
      stance?: string;
      action?: { label?: string; summary?: string };
      zones?: {
        accumulate_below?: number;
        breakout_above?: number;
        trim_above?: number;
      };
    } | null;
    target_price: number | null;
    drivers: Array<{ label: string; detail?: string }>;
    risks: Array<{ label?: string; risk?: string; detail?: string }>;
  };
};

function money(value: number | null | undefined) {
  return typeof value === "number" ? `$${Math.round(value)}` : null;
}

function Toggle({ checked, label, detail, onChange }: {
  checked: boolean;
  label: string;
  detail: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-5 border-b border-outline-variant py-4 text-left last:border-0"
    >
      <span>
        <span className="block text-[16px] font-semibold text-on-surface">{label}</span>
        <span className="mt-1 block text-[14px] leading-5 text-on-surface-variant">{detail}</span>
      </span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? "bg-primary" : "bg-surface-container-highest"}`}>
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
      </span>
    </button>
  );
}

export function PostSignupOnboarding() {
  const { user, initialAuthed } = useUser();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [brief, setBrief] = useState<StockBrief | null>(null);
  const [digest, setDigest] = useState(true);
  const [alerts, setAlerts] = useState(true);
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
      captureEvent("onboarding_dismissed", { step });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, step]);

  function close(reason: "dismissed" | "completed") {
    localStorage.setItem(SEEN_KEY, "1");
    localStorage.removeItem(POST_SIGNUP_ONBOARDING_PENDING);
    setOpen(false);
    captureEvent(`onboarding_${reason}`, { step });
  }

  function toggleStock(instrumentId: string) {
    setSelected((current) => current.includes(instrumentId)
      ? current.filter((id) => id !== instrumentId)
      : current.length < 3 ? [...current, instrumentId] : current);
  }

  async function addStocks() {
    if (!selected.length) return;
    setBusy(true);
    setError("");
    try {
      for (const instrumentId of selected) {
        const response = await fetch("/api/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ instrument_id: instrumentId, position_type: "watchlist" }),
        });
        const result = await response.json() as { first_stock?: boolean; error?: string };
        if (!response.ok) throw new Error(result.error || "Could not add this stock");
        const stock = STOCKS.find((item) => item.instrumentId === instrumentId)!;
        trackRadarStockAdded({
          ticker: stock.ticker,
          instrument_id: instrumentId,
          position_type: "watchlist",
          first_stock: Boolean(result.first_stock),
        });
      }
      const ticker = STOCKS.find((stock) => stock.instrumentId === selected[0])!.ticker;
      const response = await fetch(`/api/onboarding/stock/${ticker}`);
      if (!response.ok) throw new Error("Could not load the stock research");
      setBrief(await response.json() as StockBrief);
      captureEvent("onboarding_stocks_added", { count: selected.length, tickers: selected.join(",") });
      setStep(2);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function savePreferences(destination?: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/user/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email_alerts_enabled: alerts, email_digest_enabled: digest }),
      });
      if (!response.ok) throw new Error("Could not save your email preferences");
      captureEvent("onboarding_email_preferences_saved", { alerts, digest });
      if (destination) {
        captureEvent("onboarding_trial_clicked", { alerts, digest, stocks: selected.length });
        close("completed");
        router.push(destination);
      } else {
        close("completed");
        router.push("/watchlist");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const call = brief?.stocksbrew_intelligence.call;
  const driver = brief?.stocksbrew_intelligence.drivers[0];
  const risk = brief?.stocksbrew_intelligence.risks[0];
  const levels = [
    call?.zones?.accumulate_below && ["Add below", money(call.zones.accumulate_below)],
    call?.zones?.breakout_above && ["Add above", money(call.zones.breakout_above)],
    call?.zones?.trim_above && ["Trim above", money(call.zones.trim_above)],
    brief?.stocksbrew_intelligence.target_price && ["Target", money(brief.stocksbrew_intelligence.target_price)],
  ].filter(Boolean).slice(0, 3) as string[][];

  return (
    <div className="fixed inset-0 z-[150] grid place-items-center overflow-y-auto bg-black/50 px-4 py-8">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        className="relative w-full max-w-2xl rounded-2xl bg-white px-6 py-7 shadow-2xl sm:px-9 sm:py-8"
      >
        <button
          type="button"
          aria-label="Close onboarding"
          onClick={() => close("dismissed")}
          className="absolute right-5 top-5 grid h-9 w-9 place-items-center rounded-full text-xl text-on-surface-variant hover:bg-surface-container"
        >
          ×
        </button>
        <p className="font-mono text-[12px] font-semibold uppercase tracking-[0.16em] text-primary">Step {step} of 3</p>
        <h2 id="onboarding-title" className="mt-2 pr-10 text-[28px] font-bold tracking-[-0.03em] text-on-surface sm:text-[34px]">
          Let’s set up your Radar
        </h2>

        {step === 1 && (
          <div className="mt-7">
            <p className="text-[16px] leading-6 text-on-surface-variant">Choose up to three stocks you want StocksBrew to keep an eye on.</p>
            <div className="mt-5 divide-y divide-outline-variant border-y border-outline-variant">
              {STOCKS.map((stock) => {
                const checked = selected.includes(stock.instrumentId);
                return (
                  <button
                    key={stock.instrumentId}
                    type="button"
                    aria-pressed={checked}
                    onClick={() => toggleStock(stock.instrumentId)}
                    className="flex w-full items-center gap-4 px-1 py-3.5 text-left hover:bg-surface-container-low"
                  >
                    <StockLogo ticker={stock.ticker} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[16px] font-semibold text-on-surface">{stock.ticker}</span>
                      <span className="block text-[14px] text-on-surface-variant">{stock.name}</span>
                    </span>
                    <span className={`grid h-6 w-6 place-items-center rounded-full border text-[13px] font-bold ${checked ? "border-primary bg-primary text-white" : "border-outline-variant"}`}>
                      {checked ? "✓" : ""}
                    </span>
                  </button>
                );
              })}
            </div>
            <button type="button" disabled={!selected.length || busy} onClick={addStocks} className="mt-6 h-12 w-full rounded-xl bg-primary px-5 text-[15px] font-semibold text-white disabled:opacity-40">
              {busy ? "Adding to Radar…" : `Add ${selected.length || ""} ${selected.length === 1 ? "stock" : "stocks"} to Radar`}
            </button>
          </div>
        )}

        {step === 2 && brief && (
          <div className="mt-7">
            <div className="flex items-center gap-3 border-b border-outline-variant pb-5">
              <StockLogo ticker={brief.instrument.ticker} size={42} />
              <div>
                <p className="text-[18px] font-bold text-on-surface">{brief.instrument.ticker}</p>
                <p className="text-[14px] text-on-surface-variant">{brief.instrument.name}</p>
              </div>
              {brief.market_data.price !== null && <p className="ml-auto text-[18px] font-semibold">{money(brief.market_data.price)}</p>}
            </div>
            <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.16em] text-on-surface-variant">Current call</p>
            <p className="mt-1 text-[28px] font-bold capitalize tracking-[-0.02em] text-primary">{call?.action?.label || call?.stance || "Watching"}</p>
            {call?.action?.summary && <p className="mt-1 text-[15px] leading-6 text-on-surface-variant">{call.action.summary}</p>}
            {levels.length > 0 && (
              <div className="mt-5 grid grid-cols-2 gap-x-8 gap-y-4 border-y border-outline-variant py-5 sm:grid-cols-3">
                {levels.map(([label, value]) => <div key={label}><p className="text-[12px] text-on-surface-variant">{label}</p><p className="mt-1 text-[18px] font-semibold">{value}</p></div>)}
              </div>
            )}
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              {driver && <div><p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#00815f]">One driver</p><p className="mt-1 text-[15px] leading-6">{driver.detail || driver.label}</p></div>}
              {risk && <div><p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[#c62828]">One risk</p><p className="mt-1 text-[15px] leading-6">{risk.detail || risk.risk || risk.label}</p></div>}
            </div>
            <button type="button" onClick={() => setStep(3)} className="mt-7 h-12 w-full rounded-xl bg-primary px-5 text-[15px] font-semibold text-white">Choose what brings me back</button>
          </div>
        )}

        {step === 3 && (
          <div className="mt-7">
            <p className="text-[16px] leading-6 text-on-surface-variant">We’ll email you when there is a reason to look again. You can change this anytime.</p>
            <div className="mt-4">
              <Toggle checked={digest} onChange={setDigest} label="Daily pre-market email" detail="A quick read on the market before the open." />
              <Toggle checked={alerts} onChange={setAlerts} label="Earnings and price-level alerts" detail="Know when a tracked stock reports or reaches an important level." />
            </div>
            <button type="button" disabled={busy} onClick={() => savePreferences("/subscribe")} className="mt-6 h-12 w-full rounded-xl bg-primary px-5 text-[15px] font-semibold text-white disabled:opacity-50">
              {busy ? "Saving…" : "Start your 3-day Pro trial"}
            </button>
            <p className="mt-2 text-center text-[13px] text-on-surface-variant">Detailed research, unlimited Radar, and automatic alerts.</p>
            <button type="button" disabled={busy} onClick={() => savePreferences()} className="mt-4 w-full text-[14px] font-semibold text-on-surface-variant underline underline-offset-4">Continue with the free plan</button>
          </div>
        )}

        {error && <p role="alert" className="mt-4 text-[14px] font-medium text-[#c62828]">{error}</p>}
      </section>
    </div>
  );
}
