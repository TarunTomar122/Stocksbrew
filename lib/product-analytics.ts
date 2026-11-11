"use client";

import { captureEvent, registerSuperProperties } from "@/lib/posthog";
import { PAYWALL_VARIANT } from "@/lib/paywall-flag";

/**
 * Typed product events. docs/analytics.md is the tracking plan: every event
 * here is listed there with the question it answers. Names are object_action.
 *
 * Rules: tickers, feature ids, surfaces and counts are fine; never emails,
 * names, free-text questions, portfolio values or share counts. Every helper
 * is fire-and-forget and never throws (lib/posthog.ts).
 */

export type AuthSurface =
  | "header"
  | "hero"
  | "landing_final_cta"
  | "landing_pro_preview"
  | "footer"
  | "pricing_free"
  | "paywall"
  | "locked_ai_brief"
  | "locked_verdict_call"
  | "locked_room_to_target"
  | "subscribe_pricing"
  | "radar_track"
  | "radar_page"
  | "radar_bulk"
  | "stock_alert"
  | "stock_smart_alert"
  | "demo_radar"
  | "home_content"
  | "agent_oauth"
  | "import_try"
  | "agents_save"
  | "unknown";

export type PaywallSurface =
  | "stock_tab"
  | "stock_pro"
  | "pillar_breakdown"
  | "upcoming_earnings"
  | "market_anomalies"
  | "reddit_buzz"
  | "theme_page"
  | "interesting_stocks"
  | "locked_ai_brief"
  | "locked_verdict_call"
  | "locked_room_to_target"
  /** The shared gate (components/oa/gate.tsx); the feature id goes in `feature`. */
  | "entitlement";

export type PlanName = "anon" | "free" | "pro";

function dedupeSession(key: string): boolean {
  try {
    if (sessionStorage.getItem(key) === "1") return false;
    sessionStorage.setItem(key, "1");
    return true;
  } catch {
    return true;
  }
}

/** The app area a path belongs to: "/stock/NVDA" -> "stock", "/" -> "landing". */
export function pageArea(pathname: string | null | undefined): string {
  const first = (pathname ?? "").split("?")[0]!.split("/").filter(Boolean)[0];
  return first ? first.toLowerCase().slice(0, 32) : "landing";
}

function currentArea(): string {
  try {
    return pageArea(window.location.pathname);
  } catch {
    return "unknown";
  }
}

/** Uppercase, trimmed, capped: what someone typed into a stock search. */
export function cleanSearchQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").slice(0, 40).toUpperCase();
}

/** Text length as a coarse bucket, so free-text questions are never sent. */
export function lengthBucket(text: string): "short" | "medium" | "long" {
  const n = text.trim().length;
  if (n < 40) return "short";
  if (n < 140) return "medium";
  return "long";
}

/* ── identity and super properties ─────────────────────────────────────── */

/**
 * Sent with every later event: who is looking, by plan, and which Free/Pro
 * line they are on (`paywall`: "v1" today, "v2" with PAYWALL_V2=1), so every
 * step of the funnel can be split by line.
 */
export function setAnalyticsPlan(plan: PlanName) {
  registerSuperProperties({ plan, signed_in: plan !== "anon", paywall: PAYWALL_VARIANT });
}

/* ── acquisition and activation ────────────────────────────────────────── */

export function trackSigninStarted(props: { surface: AuthSurface }) {
  captureEvent("signin_started", { surface: props.surface, page: currentArea() });
}

export function trackSigninFailed(props: { surface: AuthSurface; reason: string }) {
  captureEvent("signin_failed", { surface: props.surface, reason: props.reason.slice(0, 60), page: currentArea() });
}

export function trackUserSignedIn(props: {
  surface: AuthSurface;
  isNewUser?: boolean;
}) {
  const event = props.isNewUser ? "user_signed_up" : "user_signed_in";
  captureEvent(event, {
    surface: props.surface,
    method: "google",
    page: currentArea(),
  });
}

export function trackUserReturned(props: { days_since_first: number; days_since_last: number }) {
  captureEvent("user_returned", props);
}

export function trackLandingCtaClicked(props: {
  surface: AuthSurface;
  signedIn: boolean;
  destination?: string;
}) {
  captureEvent("landing_cta_clicked", props);
}

/**
 * The "How did you hear about us?" answer. The source id also goes on the
 * person (`heard_about_us`) so every funnel can be split by it. The typed
 * "somewhere else" text stays on the user doc only: no free text goes to analytics.
 */
export function trackAttributionSubmitted(props: { source?: string; skipped?: boolean }) {
  const heard = props.skipped ? "skipped" : props.source;
  captureEvent("attribution_submitted", { ...props, ...(heard ? { $set: { heard_about_us: heard } } : {}) });
}

/** The follow/track button was pressed (signed in or not). The add itself is `stock_tracked`, sent by the server. */
export function trackStockTrackClicked(props: {
  ticker: string;
  signed_in: boolean;
  surface?: string;
}) {
  captureEvent("stock_track_clicked", { ...props, page: currentArea() });
}

/* ── conversion ────────────────────────────────────────────────────────── */

export function trackPaywallShown(props: {
  surface: PaywallSurface;
  ticker?: string;
  feature?: string;
  signedIn?: boolean;
  step?: "sign_in" | "upgrade";
}) {
  const key = `paywall_shown:${props.surface}:${props.feature ?? ""}:${props.ticker ?? "none"}`;
  if (!dedupeSession(key)) return;
  captureEvent("paywall_shown", { ...props, page: currentArea() });
}

export function trackPaywallUnlockClicked(props: {
  surface: PaywallSurface;
  ticker?: string;
  feature?: string;
  signedIn: boolean;
  step?: "sign_in" | "upgrade";
}) {
  captureEvent("paywall_unlock_clicked", { ...props, page: currentArea() });
}

/**
 * A plan limit stopped something the person tried to do (a meter, a count, a
 * Pro-only kind). `feature` is the lib/entitlements.ts id.
 */
export function trackLimitHit(props: {
  feature: string;
  plan?: string;
  limit?: number | null;
  code?: string;
}) {
  // Same words as the `plan` super property ("anon", not Ask's "anonymous"), since this one overrides it.
  captureEvent("limit_hit", { ...props, plan: props.plan === "anonymous" ? "anon" : props.plan, page: currentArea() });
}

export type CheckoutSource = { surface?: string; feature?: string };

let lastCheckoutSource: CheckoutSource = {};

/** Where the last checkout click came from, sent to /api/subscription/create-checkout. */
export function checkoutSource(): CheckoutSource {
  return lastCheckoutSource;
}

export function trackCheckoutClicked(props: {
  period: "monthly" | "yearly";
  market: "US" | "IN";
  signedIn: boolean;
  surface?: string;
  feature?: string;
}) {
  const surface = props.surface ?? currentArea();
  lastCheckoutSource = { surface, feature: props.feature };
  captureEvent("checkout_clicked", {
    period: props.period,
    market: props.market,
    signed_in: props.signedIn,
    surface,
    feature: props.feature,
    page: currentArea(),
  });
}

export function trackCheckoutFailed(props: { reason: string; surface?: string }) {
  captureEvent("checkout_failed", { reason: props.reason.slice(0, 80), surface: props.surface ?? currentArea() });
}

/**
 * Back from Dodo on the success URL. The paid conversion itself is
 * `subscription_activated`, sent by the webhook; this is the browser's view.
 */
export function trackCheckoutReturned(props: {
  subscription_id?: string | null;
  source?: "success_modal" | "activator_sync" | "dev_activate";
}) {
  const id = props.subscription_id ?? "latest";
  const key = `checkout_returned:${id}`;
  setAnalyticsPlan("pro");
  // components/posthog-pageview.tsx caches the plan per tab session; a stale "free"
  // there would undo this on the next full page load.
  try {
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const cacheKey = sessionStorage.key(index);
      if (cacheKey?.startsWith("sb_plan:")) sessionStorage.setItem(cacheKey, "pro");
    }
  } catch {
    // storage can be blocked
  }
  if (!dedupeSession(key)) return;
  captureEvent("checkout_returned", { source: props.source });
}

/* ── engagement: what people do on each surface ────────────────────────── */

/** The plan rides on the `plan` super property; only the shape of the question is sent, never its text. */
export function trackAskQuestionAsked(props: {
  origin: "typed" | "link" | "suggestion";
  turn: number;
  question: string;
}) {
  captureEvent("ask_question_asked", {
    origin: props.origin,
    turn: props.turn,
    length: lengthBucket(props.question),
  });
}

export function trackAskAnswerReceived(props: { latency_ms: number | null; turn: number }) {
  captureEvent("ask_answer_received", props);
}

export function trackAskAnswerFailed(props: { reason: "limit" | "error" | "aborted"; status?: number | null; message?: string }) {
  captureEvent("ask_answer_failed", { reason: props.reason, status: props.status ?? null, message: props.message?.slice(0, 80) });
}

export function trackAskAiClicked(props: {
  surface: "watchlist" | "stock" | "radar_row";
  ticker?: string;
}) {
  captureEvent("ask_ai_clicked", props);
}

export function trackSearchPerformed(props: {
  surface: string;
  query: string;
  results_count: number;
  found: boolean;
  ticker?: string | null;
}) {
  const query = cleanSearchQuery(props.query);
  if (!query) return;
  captureEvent("search_performed", { ...props, query, page: currentArea() });
}

const noResultTimers = new Map<string, ReturnType<typeof setTimeout>>();
const lastNoResult = new Map<string, string>();

/**
 * A query that matched nothing, once the person stops typing for a moment.
 * Tells us which stocks people look for and we do not have.
 */
export function trackSearchNoResults(surface: string, query: string, delayMs = 1200) {
  if (typeof window === "undefined") return;
  const existing = noResultTimers.get(surface);
  if (existing) clearTimeout(existing);
  const clean = cleanSearchQuery(query);
  if (!clean || clean.length < 2) return;
  noResultTimers.set(
    surface,
    setTimeout(() => {
      noResultTimers.delete(surface);
      if (lastNoResult.get(surface) === clean) return;
      lastNoResult.set(surface, clean);
      trackSearchPerformed({ surface, query: clean, results_count: 0, found: false });
    }, delayMs),
  );
}

/** Cancel a pending no-results event (the person picked something or kept typing). */
export function cancelSearchNoResults(surface: string) {
  const existing = noResultTimers.get(surface);
  if (existing) clearTimeout(existing);
  noResultTimers.delete(surface);
}

export function trackBriefingItemOpened(props: {
  kind: string;
  ticker?: string | null;
  relation?: string | null;
  decision: boolean;
}) {
  captureEvent("briefing_item_opened", props);
}

export function trackScreenerFilterApplied(props: { fields: string[]; active_count: number; preset?: string | null }) {
  captureEvent("screener_filter_applied", {
    fields: props.fields.slice(0, 12).join(","),
    active_count: props.active_count,
    preset: props.preset ?? null,
  });
}

export function trackScreenSaved(props: { ok: boolean; reason?: string }) {
  captureEvent("screen_saved", props);
}

export function trackFollowClicked(props: { slug: string; followed: boolean; signed_in: boolean; outcome: "ok" | "limit" | "error" }) {
  captureEvent("follow_clicked", { ...props, page: currentArea() });
}

export function trackAgentPreviewed(props: { template: string; ok: boolean }) {
  captureEvent("agent_previewed", props);
}

export function trackAgentSwitchedOn(props: { template: string; via: "create" | "quick_start" | "toggle"; enabled: boolean }) {
  captureEvent(props.enabled ? "agent_switched_on" : "agent_paused", { template: props.template, via: props.via });
}

export function trackAgentReportOpened(props: { template: string; has_report: boolean }) {
  captureEvent("agent_report_opened", props);
}

export function trackBacktestRun(props: {
  ok: boolean;
  holdings: number;
  tickers: string[];
  rebalance?: string | null;
  benchmark?: string | null;
  error_code?: string | null;
  origin: "form" | "preset";
}) {
  captureEvent("backtest_run", {
    ok: props.ok,
    holdings: props.holdings,
    tickers: props.tickers.slice(0, 10).join(","),
    rebalance: props.rebalance ?? null,
    benchmark: props.benchmark ?? null,
    error_code: props.error_code ?? null,
    origin: props.origin,
  });
}

export function trackCompareRun(props: { tickers: string[] }) {
  captureEvent("compare_run", { tickers: props.tickers.slice(0, 6).join(","), count: props.tickers.length });
}

export function trackAlertCreated(props: { ticker: string; kind: string }) {
  captureEvent("alert_created", props);
}

export function trackAgentAccessAction(props: {
  action:
    | "server_url_copied"
    | "token_created"
    | "token_revoked"
    | "config_copied";
}) {
  captureEvent("agent_access_action", props);
}

/* ── holdings import and reasons (components/import, components/thesis) ── */

export type ImportSurface = "watchlist" | "try";
export type ImportInputKind = "image" | "text" | "csv";

/** Someone sent screenshots or text to be read. Counts only, never the content. */
export function trackImportStarted(props: { surface: ImportSurface; input: ImportInputKind; images: number }) {
  captureEvent("import_started", { ...props, page: currentArea() });
}

/** The read came back (or failed). `matched` are rows we cover; `unknown` are tickers we do not. */
export function trackImportParsed(props: {
  surface: ImportSurface;
  input: ImportInputKind;
  ok: boolean;
  via?: "rules" | "model" | null;
  rows?: number;
  matched?: number;
  unknown?: number;
  error_code?: string | null;
}) {
  captureEvent("import_parsed", { ...props, error_code: props.error_code?.slice(0, 40) ?? null, page: currentArea() });
}

/** Reviewed rows were saved as holdings. Counts only: no share counts or costs. */
export function trackImportSaved(props: { surface: ImportSurface; added: number; updated: number; with_shares: number; pending: boolean }) {
  captureEvent("import_saved", { ...props, page: currentArea() });
}

/** Reasons were saved on the "Why do you own this?" step. Kinds only, never the typed text. */
export function trackThesisSaved(props: { count: number; kinds: string[]; with_text: number; asked: number }) {
  captureEvent("thesis_saved", { count: props.count, kinds: props.kinds.slice(0, 12).join(","), with_text: props.with_text, asked: props.asked });
}

/* ── full research (components/research) ────────────────────────────────── */

export type ResearchSurface = "research_page";

/** Someone pressed "Get the full research". The ticker is a stock lookup, never personal. */
export function trackResearchStarted(props: { ticker: string; surface: ResearchSurface; again: boolean }) {
  captureEvent("research_started", { ...props, page: currentArea() });
}

/** The report was saved. `seconds` is wall time; `removed` is how many sentences the numbers check took out. */
export function trackResearchCompleted(props: { ticker: string; seconds: number; removed: number }) {
  captureEvent("research_completed", { ...props, page: currentArea() });
}

/** The run stopped or was refused. `code` is the API's (limit, running, write_failed, no_evidence, network...). */
export function trackResearchFailed(props: { ticker: string; code: string; step?: string | null }) {
  captureEvent("research_failed", { ticker: props.ticker, code: props.code.slice(0, 40), step: props.step ?? null, page: currentArea() });
}
