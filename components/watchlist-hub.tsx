"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";

import { AnimatedIcon } from "@/components/animated-icon";
import { SquircleSurface } from "@/components/oa/squircle";
import { StockLogo } from "@/components/stock-logo";
import { RadarBatchEditModal } from "@/components/radar-batch-edit-modal";
import { WatchlistAiPromptButton } from "@/components/watchlist-ai-prompt-button";
import { captureEvent } from "@/lib/posthog";
import { startDodoCheckout } from "@/lib/dodo-checkout-client";
import { signInWithGoogle } from "@/lib/sign-in";
import { useUser } from "@/lib/auth-context";
import {
  trackCheckoutClicked,
  trackCheckoutStarted,
} from "@/lib/product-analytics";
import { US_PRO_MONTHLY } from "@/lib/pricing";
import { PRO_POINTS } from "@/lib/subscribe-benefits";
import type { IdeaCard } from "@/components/radar-next/types";
import type { HealthProps } from "@/lib/radar-next-data";
import type { EarningsCard, HubRow } from "@/lib/watchlist-hub-data";

const FRAME = "mx-auto w-full max-w-[76rem] px-4 sm:px-6";
const H2 =
  "text-balance font-medium tracking-tight text-oa-fg text-[28px] leading-tight sm:text-4xl sm:leading-tight";
const SUB = "mt-2 text-lg leading-7 text-oa-muted-fg";
const EYEBROW = "text-xs uppercase tracking-[0.12em] text-oa-muted-fg";
const FREE_BOOK_ROWS = 4;

function money(v: number) {
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toneColor(tone: "bull" | "bear" | "neutral") {
  return tone === "bull"
    ? "var(--signal-bullish)"
    : tone === "bear"
      ? "var(--signal-bearish)"
      : "var(--signal-neutral)";
}

function pctLabel(value: number) {
  const up = value >= 0;
  return (
    <span
      className="tabular-nums"
      style={{ color: up ? "var(--signal-bullish)" : "var(--signal-bearish)" }}
    >
      {up ? "+" : "−"}
      {Math.abs(value).toFixed(2)}%
    </span>
  );
}

function ProCheckoutButton({
  size = "md",
  className,
  children,
}: {
  size?: "sm" | "md";
  className?: string;
  children: React.ReactNode;
}) {
  const { user } = useUser();
  const [busy, setBusy] = useState(false);

  async function openCheckout() {
    if (busy) return;
    setBusy(true);
    trackCheckoutClicked({ period: "monthly", market: "US", signedIn: Boolean(user) });
    try {
      if (!user) await signInWithGoogle({ surface: "paywall" });
      const checkoutUrl = await startDodoCheckout();
      trackCheckoutStarted({ period: "monthly", market: "US" });
      window.location.assign(checkoutUrl);
    } catch (err) {
      console.error("direct checkout failed", err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void openCheckout()}
      className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-full bg-oa-primary font-medium text-oa-primary-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_1px_2px_rgba(0,0,0,0.12)] transition-[filter] hover:brightness-110 focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)] active:translate-y-px active:scale-[0.98] disabled:opacity-70 ${
        size === "sm" ? "h-9 px-4 text-sm" : "h-11 px-6 text-base"
      } ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

function SectionHead({
  title,
  sub,
}: {
  title: string;
  sub: string;
}) {
  return (
    <div className="mb-4 max-w-2xl">
      <h2 className={H2}>{title}</h2>
      <p className={SUB}>{sub}</p>
    </div>
  );
}

/* ── the book: every tracked stock, one line each, answer included ──────── */

function StanceChip({ stance, accent }: { stance: string; accent?: boolean }) {
  const tone =
    stance.toLowerCase() === "accumulate"
      ? "bull"
      : stance.toLowerCase() === "trim" || stance.toLowerCase() === "avoid"
        ? "bear"
        : "neutral";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize leading-4 ${accent ? "ring-1 ring-inset" : ""}`}
      style={{
        color: toneColor(tone),
        background: `color-mix(in srgb, currentColor ${accent ? 16 : 10}%, transparent)`,
        ...(accent ? { boxShadow: `inset 0 0 0 1px color-mix(in srgb, currentColor 35%, transparent)` } : {}),
      }}
    >
      {stance}
    </span>
  );
}

/** The live price is currently inside the AI call's buy-below / trim-above zone — the call is actionable now. */
function attentionAccent(direction: HubRow["attention_direction"]): string {
  if (direction === "bearish") return "var(--signal-bearish)";
  return "var(--signal-bullish)";
}

function BookRow({ row }: { row: HubRow }) {
  const accent = row.needs_attention ? attentionAccent(row.attention_direction) : null;
  return (
    <div
      className="group flex items-start gap-2.5 px-2.5 py-2.5 transition-colors hover:bg-oa-accent sm:items-center sm:gap-4 sm:px-5 sm:py-3"
      style={accent ? { background: `color-mix(in srgb, ${accent} 8%, transparent)` } : undefined}
    >
      <StockLogo ticker={row.ticker} market="US" size={32} circle className="mt-0.5 shrink-0 sm:mt-0" />
      <Link href={`/stock/${row.ticker}`} className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="truncate text-[16px] font-medium leading-5 text-oa-fg group-hover:underline sm:text-[15px]">
            {row.ticker}
          </span>
          <span className="hidden truncate text-[13px] leading-5 text-oa-muted-fg md:inline">
            {row.name}
          </span>
          {row.stance ? <StanceChip stance={row.stance} accent={row.needs_attention} /> : null}
        </div>
        {row.reason_line ? (
          <p
            className="mt-0.5 text-[14px] leading-5 sm:line-clamp-1 sm:text-[13.5px]"
            style={{ color: toneColor(row.reason_tone) }}
          >
            {row.reason_line}
          </p>
        ) : null}
      </Link>
      <div className="shrink-0 text-right">
        <p className="text-[15px] font-medium tabular-nums leading-5 text-oa-fg sm:text-[14px]">
          {row.price != null ? `$${money(row.price)}` : "—"}
        </p>
        <p className="text-[14px] font-medium leading-5 sm:text-[13px]">
          {row.day_change_pct != null ? pctLabel(row.day_change_pct) : "—"}
        </p>
      </div>
    </div>
  );
}

function GhostBookRow() {
  return (
    <div aria-hidden="true" className="flex items-center gap-3 px-3 py-3 opacity-50 sm:gap-4 sm:px-5">
      <div className="size-8 shrink-0 rounded-full bg-oa-secondary" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="h-3.5 w-16 rounded-full bg-oa-secondary" />
        <div className="h-2.5 w-48 max-w-full rounded-full bg-oa-secondary" />
      </div>
      <div className="shrink-0 space-y-1.5 text-right">
        <div className="ml-auto h-3.5 w-14 rounded-full bg-oa-secondary" />
        <div className="ml-auto h-2.5 w-12 rounded-full bg-oa-secondary" />
      </div>
    </div>
  );
}

function BookPlate({
  rows,
  isSubscribed,
}: {
  rows: HubRow[];
  isSubscribed: boolean;
}) {
  const [tab, setTab] = useState<"holding" | "watchlist">("holding");
  const scoped = rows.filter((row) => row.position_type === tab);
  const visible = isSubscribed ? scoped : scoped.slice(0, FREE_BOOK_ROWS);
  const hiddenCount = scoped.length - visible.length;

  if (rows.length === 0) {
    return (
      <SquircleSurface className="border border-oa-border p-1 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
        <div
          role="status"
          className="flex flex-col items-start gap-3 rounded-[22px] bg-oa-bg px-4 py-5 [--card-clip-radius:12px] sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:[--card-clip-radius:17px]"
        >
          <p className="text-[15px] leading-6 text-oa-muted-fg">
            <span className="font-medium text-oa-fg">Your book is empty.</span> Add the stocks you
            own or keep an eye on, and this page starts working for you.
          </p>
          <RadarBatchEditModal
            initialItems={[]}
            isSubscribed={isSubscribed}
            ctaLabel="Add stocks"
            triggerClassName="inline-flex h-9 shrink-0 cursor-pointer items-center rounded-full bg-oa-primary px-4 text-sm font-medium text-oa-primary-fg transition-[filter] hover:brightness-110 focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)] active:translate-y-px active:scale-[0.98]"
          />
        </div>
      </SquircleSurface>
    );
  }

  return (
    <SquircleSurface className="border border-oa-border p-0.5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] sm:p-1">
      <SquircleSurface className="overflow-hidden rounded-[18px] border border-oa-border bg-oa-bg shadow-[0_1px_2px_rgba(0,0,0,0.06)] [--card-clip-radius:10px] sm:rounded-[44px] sm:[--card-clip-radius:17px]">
        <div className="flex flex-wrap items-center gap-2 px-2.5 pb-1 pt-3 sm:px-5">
          {(
            [
              ["holding", "Holdings"],
              ["watchlist", "Watching"],
            ] as const
          ).map(([key, label]) => {
            const active = tab === key;
            return (
              <button
                key={key}
                type="button"
                aria-current={active ? "true" : undefined}
                onClick={() => setTab(key)}
                className={`h-8 cursor-pointer rounded-full border px-3.5 text-[13px] font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)] ${
                  active
                    ? "border-transparent text-oa-fg shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
                    : "border-oa-border text-oa-muted-fg hover:bg-oa-accent hover:text-oa-fg"
                }`}
                style={
                  active
                    ? {
                        background: "color-mix(in srgb, var(--oa-primary) 12%, var(--oa-card))",
                        borderColor: "color-mix(in srgb, var(--oa-primary) 40%, transparent)",
                      }
                    : undefined
                }
              >
                {label}
              </button>
            );
          })}
        </div>

        {scoped.length === 0 ? (
          <p className="px-3 py-6 text-center text-[14px] leading-6 text-oa-muted-fg sm:px-5">
            {tab === "holding" ? "Nothing marked as a holding yet." : "Nothing on the watch side yet."}
          </p>
        ) : (
          <AnimatePresence initial={false} mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              className="max-h-[34rem] divide-y divide-oa-border/60 overflow-y-auto pb-1 sm:max-h-[30rem]"
            >
              {visible.map((row) => (
                <BookRow key={row.instrument_id} row={row} />
              ))}
            </motion.div>
          </AnimatePresence>
        )}

        {hiddenCount > 0 ? (
          <div className="border-t border-oa-border">
            <div
              aria-hidden="true"
              className="pointer-events-none select-none overflow-hidden opacity-60 [mask-image:linear-gradient(to_bottom,black,transparent_90%)]"
            >
              <GhostBookRow />
            </div>
            <div
              role="status"
              className="flex flex-col items-center gap-3 px-3 py-5 text-center sm:flex-row sm:justify-between sm:px-5 sm:text-left"
            >
              <p className="text-[15px] leading-6 text-oa-muted-fg">
                <span className="font-medium text-oa-fg">
                  {hiddenCount} more stock{hiddenCount === 1 ? "" : "s"} in your book,
                  each with its answer line.
                </span>{" "}
                Pro removes the cap.
              </p>
              <ProCheckoutButton size="sm" className="h-10 w-full shrink-0 whitespace-nowrap px-5 text-[15px] sm:w-auto">
                Try Pro
              </ProCheckoutButton>
            </div>
          </div>
        ) : null}
      </SquircleSurface>
    </SquircleSurface>
  );
}

/* ── reporting soon: the earnings calendar, with the pre-print call ──────── */

function EarningsCardTile({ card }: { card: EarningsCard }) {
  return (
    <div className="flex min-w-[15.5rem] shrink-0 flex-col gap-3 rounded-[18px] border border-oa-border bg-oa-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.06)] sm:min-w-[17rem]">
      <div className="flex items-center gap-2.5">
        <StockLogo ticker={card.ticker} market="US" size={28} circle className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-medium leading-5 text-oa-fg">{card.ticker}</p>
          <p className="truncate text-[12px] leading-4 text-oa-muted-fg">{card.name}</p>
        </div>
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-oa-secondary px-2 py-0.5 text-[11px] font-medium tabular-nums text-oa-muted-fg">
          <AnimatedIcon name="event" size={11} aria-hidden />
          {card.date_label} · {card.days_away === 0 ? "today" : `${card.days_away}d`}
        </span>
      </div>
      {card.has_prediction && card.prediction ? (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            {card.prediction.eps ? (
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{ color: toneColor(card.prediction.eps.tone), background: "color-mix(in srgb, currentColor 10%, transparent)" }}
              >
                {card.prediction.eps.label}
              </span>
            ) : null}
            {card.prediction.move ? (
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{ color: toneColor(card.prediction.move.tone), background: "color-mix(in srgb, currentColor 10%, transparent)" }}
              >
                {card.prediction.move.label}
              </span>
            ) : null}
          </div>
          {card.prediction.headline ? (
            <p className="line-clamp-2 text-[12.5px] leading-5 text-oa-muted-fg">{card.prediction.headline}</p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function ReportingSoon({ cards }: { cards: EarningsCard[] }) {
  if (cards.length === 0) return null;
  return (
    <section aria-label="Reporting soon">
      <SectionHead
        title="Reporting soon"
        sub="Tracked names with an earnings date on the calendar, and stocksbrew's pre-print call where we have one."
      />
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {cards.map((card) => (
          <EarningsCardTile key={card.instrument_id} card={card} />
        ))}
      </div>
    </section>
  );
}

/* ── portfolio analysis: the read on the book's tilt ─────────────────────── */

function ScoreDial({ gradePct }: { gradePct: number }) {
  const bounded = Math.max(0, Math.min(100, gradePct));
  const color =
    bounded >= 66 ? "var(--signal-bullish)" : bounded >= 40 ? "var(--on-surface-variant)" : "var(--signal-bearish)";
  return (
    <div
      aria-hidden="true"
      className="grid size-20 shrink-0 place-items-center rounded-full"
      style={{ background: `conic-gradient(${color} 0 ${bounded}%, var(--oa-secondary) ${bounded}% 100%)` }}
    >
      <span className="grid size-[62px] place-items-center rounded-full bg-oa-bg text-center">
        <strong className="text-[20px] font-medium tabular-nums leading-none text-oa-fg">{Math.round(bounded)}</strong>
      </span>
    </div>
  );
}

function PortfolioAnalysis({ health }: { health: HealthProps }) {
  if (!health.headline) return null;
  return (
    <section aria-label="Portfolio analysis">
      <SectionHead
        title="Portfolio analysis"
        sub="What your holdings actually lean toward, not what you think they do."
      />
      <SquircleSurface className="border border-oa-border p-1 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
        <SquircleSurface className="rounded-[22px] border border-oa-border bg-oa-bg px-4 py-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] [--card-clip-radius:12px] sm:px-6 sm:py-6 sm:[--card-clip-radius:17px]">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-6">
            <ScoreDial gradePct={health.gradePct} />
            <div className="min-w-0">
              <p className="text-balance text-[19px] font-medium leading-snug text-oa-fg sm:text-[21px]">
                {health.headline}
              </p>
              <p className="mt-1.5 text-[14px] leading-6 text-oa-muted-fg">{health.body}</p>
            </div>
          </div>

          {health.pillars.length > 0 ? (
            <div className="mt-6 grid gap-4 border-t border-oa-border pt-5 sm:grid-cols-4">
              {health.pillars.map((pillar) => (
                <div key={pillar.label}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[12px] capitalize text-oa-muted-fg">{pillar.label}</span>
                    <span className="text-[12px] font-medium tabular-nums text-oa-fg">{Math.round(pillar.score)}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-oa-secondary">
                    <div
                      className="h-full rounded-full bg-oa-primary"
                      style={{ width: `${Math.max(0, Math.min(100, pillar.score))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {health.fixes.length > 0 ? (
            <div className="mt-6 border-t border-oa-border pt-5">
              <p className="text-[13px] font-medium text-oa-fg">Fix first</p>
              <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
                {health.fixes.slice(0, 4).map((fix, i) => (
                  <li key={`${fix}-${i}`} className="flex items-start gap-2.5 text-[13.5px] leading-5 text-oa-muted-fg">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-oa-secondary text-[10.5px] font-medium tabular-nums text-oa-muted-fg">
                      {i + 1}
                    </span>
                    {fix}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </SquircleSurface>
      </SquircleSurface>
    </section>
  );
}

/* ── suggested stocks: ideas sourced from the same signals ──────────────── */

function IdeaTile({ idea }: { idea: IdeaCard }) {
  const moveColor =
    idea.dayChangePct == null
      ? "var(--on-surface-variant)"
      : idea.dayChangePct >= 0
        ? "var(--signal-bullish)"
        : "var(--signal-bearish)";
  return (
    <Link
      href={idea.href}
      className="group flex items-center gap-3 px-3 py-3 transition-colors hover:bg-oa-accent sm:gap-4 sm:px-5"
    >
      <StockLogo ticker={idea.ticker} market={idea.market} size={32} circle className="shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="truncate text-[15px] font-medium leading-5 text-oa-fg group-hover:underline">
            {idea.ticker}
          </span>
          {idea.tag ? <span className="truncate text-[12px] leading-5 text-oa-muted-fg">{idea.tag}</span> : null}
        </div>
        {idea.reason ? (
          <p className="mt-0.5 line-clamp-1 text-[13px] leading-5 text-oa-muted-fg">{idea.reason}</p>
        ) : null}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[14px] font-medium tabular-nums leading-5 text-oa-fg">
          {idea.price != null ? `$${money(idea.price)}` : "—"}
        </p>
        <p className="text-[13px] font-medium leading-5" style={{ color: moveColor }}>
          {idea.dayChangePct != null ? pctLabel(idea.dayChangePct) : "—"}
        </p>
      </div>
    </Link>
  );
}

function SuggestedStocks({
  ideas,
}: {
  ideas: { fits: IdeaCard[]; top: IdeaCard[]; unusual: IdeaCard[] };
}) {
  const seen = new Set<string>();
  const merged = [...ideas.unusual, ...ideas.fits, ...ideas.top]
    .filter((idea) => {
      const key = `${idea.market}:${idea.ticker}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
  if (merged.length === 0) return null;

  return (
    <section aria-label="Suggested stocks">
      <SectionHead
        title="Based on what you already own"
        sub="Names that fit your book's tilt, sourced from the same signals as everything else on this page."
      />
      <SquircleSurface className="border border-oa-border p-1 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
        <SquircleSurface className="divide-y divide-oa-border/60 overflow-hidden rounded-[22px] border border-oa-border bg-oa-bg shadow-[0_1px_2px_rgba(0,0,0,0.06)] [--card-clip-radius:12px] sm:rounded-[44px] sm:[--card-clip-radius:17px]">
          {merged.map((idea) => (
            <IdeaTile key={`${idea.market}-${idea.ticker}`} idea={idea} />
          ))}
        </SquircleSurface>
      </SquircleSurface>
    </section>
  );
}

/* ── the agent plate: the application we charge for ─────────────────────── */

const AGENT_STEPS: [string, string][] = [
  ["Copy the prompt", "One click. It tells your agent what to pull."],
  ["Paste it into your AI", "Codex, Claude Code, Cursor. Any tool that speaks MCP."],
  ["Ask anything", "\"Review my book. What would you trim first, and why?\""],
  ["Get the answer", "Current prices, scores and stances from this exact page."],
];

function AgentPlate({ isSubscribed }: { isSubscribed: boolean }) {
  return (
    <SquircleSurface className="border border-oa-border p-1 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
      <SquircleSurface className="rounded-[22px] border border-oa-border bg-oa-bg px-4 py-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] [--card-clip-radius:12px] sm:px-6 sm:py-6 sm:[--card-clip-radius:17px]">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:gap-10">
          <div>
            <p className={EYEBROW}>For Pro</p>
            <h3 className="mt-2 text-balance font-medium tracking-tight text-oa-fg text-[22px] leading-tight sm:text-[28px]">
              Your AI already knows your watchlist.
            </h3>
            <p className="mt-2 text-[15px] leading-7 text-oa-muted-fg">
              Stocksbrew ships your book to your AI agent over MCP: prices, scores, stances,
              alerts. Ask it to review the book, argue a trim, or brief you before the bell.
              It answers with this page's data, not its imagination.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <WatchlistAiPromptButton className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-oa-primary px-5 text-[15px] font-medium text-oa-primary-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] transition-[filter] hover:brightness-110" />
              <Link
                href="/agents"
                onClick={() => captureEvent("watchlist_agent_link_clicked", {})}
                className="text-[15px] font-medium text-oa-fg underline decoration-oa-border underline-offset-4 hover:decoration-oa-fg"
              >
                How agent access works
              </Link>
            </div>
            {!isSubscribed ? (
              <p className="mt-3 text-[13px] text-oa-muted-fg">Included with Pro.</p>
            ) : null}
          </div>
          <ol className="flex flex-col justify-center gap-3">
            {AGENT_STEPS.map(([title, body], i) => (
              <li key={title} className="flex items-start gap-3">
                <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-oa-secondary text-[12px] font-medium tabular-nums text-oa-muted-fg">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-[14.5px] font-medium leading-5 text-oa-fg">{title}</p>
                  <p className="text-[13px] leading-5 text-oa-muted-fg">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </SquircleSurface>
    </SquircleSurface>
  );
}

/* ── the pro plate: the value stack ──────────────────────────────────────── */

function ProPlate({ isSubscribed }: { isSubscribed: boolean }) {
  if (isSubscribed) return null;
  return (
    <SquircleSurface className="border border-oa-border p-1 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
      <SquircleSurface
        className="rounded-[22px] border shadow-[0_1px_2px_rgba(0,0,0,0.06)] [--card-clip-radius:12px] sm:rounded-[44px] sm:[--card-clip-radius:17px]"
        style={{
          borderColor: "color-mix(in srgb, var(--oa-primary) 35%, transparent)",
          background: "color-mix(in srgb, var(--oa-primary) 4%, var(--oa-bg))",
        }}
      >
        <div className="px-4 py-6 sm:px-6 sm:py-8">
          <div className="mb-8 max-w-2xl">
            <p className={EYEBROW}>Stocksbrew Pro</p>
            <h3 className="mt-2 text-balance font-medium tracking-tight text-oa-fg text-[22px] leading-tight sm:text-[28px]">
              The reading is free. The doing is Pro.
            </h3>
            <p className="mt-2 text-[15px] leading-7 text-oa-muted-fg">
              You just read what your stocks did. Pro is what happens next: alerts that fire
              and an agent that works your book all session.
            </p>
            <div className="mt-5">
              <ProCheckoutButton>Start Pro</ProCheckoutButton>
            </div>
            <p className="mt-3 text-[13px] text-oa-muted-fg">
              ${US_PRO_MONTHLY}/month · cancel anytime
            </p>
          </div>
          <ul className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
            {PRO_POINTS.map((point) => (
              <li key={point.icon} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-oa-card text-oa-fg/70 shadow-[0_1px_2px_rgba(0,0,0,0.06)] [&_svg]:size-4"
                >
                  <AnimatedIcon name={point.icon} size={16} />
                </span>
                <div className="min-w-0">
                  <p className="text-[15px] font-medium leading-5 text-oa-fg">{point.title}</p>
                  <p className="mt-0.5 text-[14px] leading-5 text-oa-muted-fg">{point.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </SquircleSurface>
    </SquircleSurface>
  );
}

/* ── the hub ─────────────────────────────────────────────────────────────── */

export type WatchlistHubProps = {
  rows: HubRow[];
  earningsCards: EarningsCard[];
  health: HealthProps;
  ideas: { fits: IdeaCard[]; top: IdeaCard[]; unusual: IdeaCard[] };
  isSubscribed: boolean;
  freeLimit: number;
};

export function WatchlistHub({
  rows,
  earningsCards,
  health,
  ideas,
  isSubscribed,
  freeLimit,
}: WatchlistHubProps) {
  return (
    <div className={`mx-auto w-full max-w-[76rem] flex flex-col gap-10 px-0 pb-36 pt-8 sm:gap-12 sm:pb-36 sm:px-6 sm:pt-10`}>
      {/* title row: one h1, one cluster of controls */}
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-balance font-medium tracking-tight text-oa-fg text-[28px] leading-tight sm:text-4xl sm:leading-tight">
            Every stock you follow, already read for you.
          </h1>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <RadarBatchEditModal
            initialItems={rows.map((row) => ({
              instrument_id: row.instrument_id,
              ticker: row.ticker,
              name: row.name,
              position_type: row.position_type,
              holding:
                row.position_type === "holding"
                  ? { quantity: null, market_value: null, average_cost: null }
                  : undefined,
            }))}
            isSubscribed={isSubscribed}
            freeLimit={freeLimit}
            ctaLabel="Manage watchlist"
            triggerClassName="inline-flex h-9 cursor-pointer items-center rounded-full bg-oa-primary px-4 text-[13px] font-medium text-oa-primary-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] transition-[filter] hover:brightness-110 focus-visible:ring-[3px] focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_50%,transparent)] active:translate-y-px active:scale-[0.98]"
          />
        </div>
      </header>

      <ReportingSoon cards={earningsCards} />

      <section aria-label="Your book">
        <SectionHead
          title="The book"
          sub="Prices, reasons, earnings and buzz on one line each."
        />
        <BookPlate rows={rows} isSubscribed={isSubscribed} />
      </section>

      <PortfolioAnalysis health={health} />

      <SuggestedStocks ideas={ideas} />

      <section aria-label="Your AI agent">
        <SectionHead
          title="Put your AI agent to work on it"
          sub="Reading is free. Hand the whole book to your agent and let it argue with you."
        />
        <AgentPlate isSubscribed={isSubscribed} />
      </section>

      <ProPlate isSubscribed={isSubscribed} />

      <p className="text-center text-[13px] leading-6 text-oa-muted-fg">
        Prices and reasons refresh through the session. Informational only, not investment advice.
      </p>
    </div>
  );
}
