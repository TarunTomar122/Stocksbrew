"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AnimatedIcon } from "@/components/animated-icon";
import { SquircleSurface } from "@/components/oa/squircle";
import { StockLogo } from "@/components/stock-logo";
import { StartFreeButton } from "@/components/oa/start-free-button";
import { RadarBatchEditModal } from "@/components/radar-batch-edit-modal";
import { signInWithGoogle } from "@/lib/sign-in";

const EYEBROW = "text-xs uppercase tracking-[0.12em] text-oa-muted-fg";

function pctLabel(value: number) {
  const up = value >= 0;
  return (
    <span className="tabular-nums" style={{ color: up ? "var(--signal-bullish)" : "var(--signal-bearish)" }}>
      {up ? "+" : "−"}
      {Math.abs(value).toFixed(2)}%
    </span>
  );
}

const SAMPLE_BOOK: {
  ticker: string;
  name: string;
  price: number;
  changePct: number;
  reason: string;
  tone: "bull" | "bear" | "neutral";
}[] = [
  { ticker: "NVDA", name: "Nvidia Corp", price: 178.32, changePct: 2.14, reason: "Data center demand still outrunning supply, third quarter in a row.", tone: "bull" },
  { ticker: "AAPL", name: "Apple Inc", price: 231.05, changePct: -0.42, reason: "iPhone 17 orders trimmed at two Asian suppliers ahead of the print.", tone: "bear" },
  { ticker: "TSLA", name: "Tesla Inc", price: 412.88, changePct: 5.61, reason: "Robotaxi expansion cleared in two more states this week.", tone: "bull" },
];

const SAMPLE_EARNINGS = [
  { ticker: "AMZN", days: 4, date: "Oct 24", eps: "Beat likely", move: "Rally odds elevated" },
  { ticker: "PLTR", days: 9, date: "Oct 29", eps: "In line", move: "Muted move expected" },
];

const SAMPLE_PILLARS = [
  { label: "valuation", score: 38 },
  { label: "growth", score: 82 },
  { label: "quality", score: 61 },
  { label: "momentum", score: 76 },
];

const SAMPLE_IDEAS = [
  { ticker: "AVGO", reason: "Same AI infrastructure trade, cheaper multiple than your book's average.", price: 184.2, changePct: 1.05 },
  { ticker: "LLY", reason: "Adds a defensive lean your book is currently missing.", price: 912.4, changePct: 0.3 },
];

function ScoreDialDemo() {
  return (
    <div
      aria-hidden="true"
      className="grid size-20 shrink-0 place-items-center rounded-full"
      style={{ background: "conic-gradient(var(--signal-bullish) 0 74%, var(--oa-secondary) 74% 100%)" }}
    >
      <span className="grid size-[62px] place-items-center rounded-full bg-oa-bg text-center">
        <strong className="text-[20px] font-medium tabular-nums leading-none text-oa-fg">74</strong>
      </span>
    </div>
  );
}

function SampleTag() {
  return (
    <span className="rounded-full bg-oa-secondary px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-[0.06em] text-oa-muted-fg">
      Example
    </span>
  );
}

function SignInCta({ label }: { label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    try {
      await signInWithGoogle({ surface: "radar_page" });
      router.refresh();
    } catch {
      /* cancelled */
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={handleClick}
      className="inline-flex h-12 shrink-0 cursor-pointer items-center justify-center rounded-full bg-oa-primary px-7 text-[16px] font-medium text-oa-primary-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.12)] transition-[filter] hover:brightness-110 focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)] active:translate-y-px active:scale-[0.98] disabled:opacity-70"
    >
      {busy ? "Signing in…" : label}
    </button>
  );
}

/**
 * Shown when there's nothing real to render yet: signed-out visitors, or a
 * signed-in account with an empty book. Renders the exact same sections the
 * real page would (book, reporting soon, portfolio analysis, ideas) filled
 * with clearly-marked example data, so the value is obvious before anyone
 * types a ticker.
 */
export function WatchlistShowcase({ mode }: { mode: "signed_out" | "empty" }) {
  return (
    <div className="mx-auto flex w-full max-w-[76rem] flex-col gap-10 px-0 pb-36 pt-8 sm:gap-12 sm:px-6 sm:pt-10">
      <div className="max-w-2xl">
        <p className={EYEBROW}>Your watchlist</p>
        <h1 className="mt-2 text-balance font-medium tracking-tight text-oa-fg text-[28px] leading-tight sm:text-4xl sm:leading-tight">
          {mode === "signed_out"
            ? "This is what your book looks like, read for you."
            : "Add your stocks. This is what happens next."}
        </h1>
        <p className="mt-2 text-lg leading-7 text-oa-muted-fg">
          One line per stock, an earnings calendar with our pre-print call, and a read on what
          your whole book actually leans toward. Free to start with three stocks.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {mode === "signed_out" ? (
            <SignInCta label="Track 3 stocks free" />
          ) : (
            <RadarBatchEditModal
              initialItems={[]}
              isSubscribed={false}
              ctaLabel="Add your first stocks"
              triggerClassName="inline-flex h-12 shrink-0 cursor-pointer items-center rounded-full bg-oa-primary px-7 text-[16px] font-medium text-oa-primary-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.12)] transition-[filter] hover:brightness-110 focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)] active:translate-y-px active:scale-[0.98]"
            />
          )}
          <a
            href="/explore"
            className="inline-flex h-12 items-center rounded-full border border-oa-border px-6 text-[16px] font-medium text-oa-fg transition-colors hover:bg-oa-accent focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)]"
          >
            See what's moving first
          </a>
        </div>
      </div>

      {/* reporting soon, sample */}
      <section aria-label="Reporting soon example">
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-balance font-medium tracking-tight text-oa-fg text-[22px] leading-tight sm:text-[26px]">
            Reporting soon
          </h2>
          <SampleTag />
        </div>
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SAMPLE_EARNINGS.map((card) => (
            <div
              key={card.ticker}
              className="flex min-w-[15.5rem] shrink-0 flex-col gap-3 rounded-[18px] border border-oa-border bg-oa-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)] sm:min-w-[17rem]"
            >
              <div className="flex items-center gap-2.5">
                <StockLogo ticker={card.ticker} market="US" size={28} circle className="shrink-0" />
                <p className="text-[14.5px] font-medium leading-5 text-oa-fg">{card.ticker}</p>
                <span className="ml-auto flex shrink-0 items-center gap-1 rounded-full bg-oa-secondary px-2 py-0.5 text-[11px] font-medium tabular-nums text-oa-muted-fg">
                  <AnimatedIcon name="event" size={11} aria-hidden />
                  {card.date} · {card.days}d
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ color: "var(--signal-bullish)", background: "color-mix(in srgb, var(--signal-bullish) 12%, transparent)" }}>
                  {card.eps}
                </span>
                <span className="rounded-full bg-oa-secondary px-2 py-0.5 text-[11px] font-medium text-oa-muted-fg">
                  {card.move}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* the book, sample */}
      <section aria-label="The book example">
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-balance font-medium tracking-tight text-oa-fg text-[22px] leading-tight sm:text-[26px]">
            The book
          </h2>
          <SampleTag />
        </div>
        <SquircleSurface className="border border-oa-border p-1 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
          <SquircleSurface className="divide-y divide-oa-border/60 overflow-hidden rounded-[22px] border border-oa-border bg-oa-bg shadow-[0_1px_2px_rgba(0,0,0,0.06)] [--card-clip-radius:12px] sm:rounded-[44px] sm:[--card-clip-radius:17px]">
            {SAMPLE_BOOK.map((row) => (
              <div key={row.ticker} className="flex items-center gap-3 px-3 py-3 sm:gap-4 sm:px-5">
                <StockLogo ticker={row.ticker} market="US" size={32} circle className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="truncate text-[15px] font-medium leading-5 text-oa-fg">{row.ticker}</span>
                    <span className="hidden truncate text-[13px] leading-5 text-oa-muted-fg md:inline">{row.name}</span>
                  </div>
                  <p
                    className="mt-0.5 text-[13px] leading-5 sm:text-[13.5px]"
                    style={{ color: row.tone === "bull" ? "var(--signal-bullish)" : row.tone === "bear" ? "var(--signal-bearish)" : "var(--signal-neutral)" }}
                  >
                    {row.reason}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[14px] font-medium tabular-nums leading-5 text-oa-fg">${row.price.toFixed(2)}</p>
                  <p className="text-[13px] font-medium leading-5">{pctLabel(row.changePct)}</p>
                </div>
              </div>
            ))}
          </SquircleSurface>
        </SquircleSurface>
      </section>

      {/* portfolio analysis, sample */}
      <section aria-label="Portfolio analysis example">
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-balance font-medium tracking-tight text-oa-fg text-[22px] leading-tight sm:text-[26px]">
            Portfolio analysis
          </h2>
          <SampleTag />
        </div>
        <SquircleSurface className="border border-oa-border p-1 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
          <SquircleSurface className="rounded-[22px] border border-oa-border bg-oa-bg px-4 py-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] [--card-clip-radius:12px] sm:px-6 sm:py-6 sm:[--card-clip-radius:17px]">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
              <ScoreDialDemo />
              <div className="min-w-0">
                <p className="text-balance text-[19px] font-medium leading-snug text-oa-fg sm:text-[21px]">
                  This book would lean growth and momentum, thin on defensives.
                </p>
                <p className="mt-1.5 text-[14px] leading-6 text-oa-muted-fg">
                  Not a guess — a read on the same signals every stock on this page carries.
                </p>
              </div>
            </div>
            <div className="mt-6 grid gap-4 border-t border-oa-border pt-5 sm:grid-cols-4">
              {SAMPLE_PILLARS.map((pillar) => (
                <div key={pillar.label}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[12px] capitalize text-oa-muted-fg">{pillar.label}</span>
                    <span className="text-[12px] font-medium tabular-nums text-oa-fg">{pillar.score}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-oa-secondary">
                    <div className="h-full rounded-full bg-oa-primary" style={{ width: `${pillar.score}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </SquircleSurface>
        </SquircleSurface>
      </section>

      {/* suggested stocks, sample */}
      <section aria-label="Suggested stocks example">
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-balance font-medium tracking-tight text-oa-fg text-[22px] leading-tight sm:text-[26px]">
            Based on what you already own
          </h2>
          <SampleTag />
        </div>
        <SquircleSurface className="border border-oa-border p-1 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
          <SquircleSurface className="divide-y divide-oa-border/60 overflow-hidden rounded-[22px] border border-oa-border bg-oa-bg shadow-[0_1px_2px_rgba(0,0,0,0.06)] [--card-clip-radius:12px] sm:rounded-[44px] sm:[--card-clip-radius:17px]">
            {SAMPLE_IDEAS.map((idea) => (
              <div key={idea.ticker} className="flex items-center gap-3 px-3 py-3 sm:gap-4 sm:px-5">
                <StockLogo ticker={idea.ticker} market="US" size={32} circle className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <span className="text-[15px] font-medium leading-5 text-oa-fg">{idea.ticker}</span>
                  <p className="mt-0.5 text-[13px] leading-5 text-oa-muted-fg">{idea.reason}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[14px] font-medium tabular-nums leading-5 text-oa-fg">${idea.price.toFixed(2)}</p>
                  <p className="text-[13px] font-medium leading-5">{pctLabel(idea.changePct)}</p>
                </div>
              </div>
            ))}
          </SquircleSurface>
        </SquircleSurface>
      </section>

      <div className="flex flex-col items-center gap-4 rounded-[28px] bg-oa-card px-6 py-10 text-center">
        <p className="text-balance text-[22px] font-medium leading-snug text-oa-fg sm:text-[26px]">
          Put your own stocks in here.
        </p>
        <p className="max-w-md text-[15px] leading-6 text-oa-muted-fg">
          Three stocks free, no card required. This whole page rebuilds itself around your book
          the moment you add one.
        </p>
        {mode === "signed_out" ? (
          <SignInCta label="Track 3 stocks free" />
        ) : (
          <RadarBatchEditModal
            initialItems={[]}
            isSubscribed={false}
            ctaLabel="Add your first stocks"
            triggerClassName="inline-flex h-12 shrink-0 cursor-pointer items-center rounded-full bg-oa-primary px-7 text-[16px] font-medium text-oa-primary-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.12)] transition-[filter] hover:brightness-110 focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)] active:translate-y-px active:scale-[0.98]"
          />
        )}
      </div>
    </div>
  );
}
