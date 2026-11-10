"use client";

import { captureEvent } from "@/lib/posthog";

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

function dedupeSession(key: string): boolean {
  try {
    if (sessionStorage.getItem(key) === "1") return false;
    sessionStorage.setItem(key, "1");
    return true;
  } catch {
    return true;
  }
}

export function trackUserSignedIn(props: {
  surface: AuthSurface;
  isNewUser?: boolean;
}) {
  const event = props.isNewUser ? "user_signed_up" : "user_signed_in";
  captureEvent(event, {
    surface: props.surface,
    method: "google",
  });
}

export function trackLandingCtaClicked(props: {
  surface: AuthSurface;
  signedIn: boolean;
  destination?: string;
}) {
  captureEvent("landing_cta_clicked", props);
}

export function trackPaywallShown(props: {
  surface: PaywallSurface;
  ticker?: string;
  feature?: string;
  signedIn?: boolean;
}) {
  const key = `paywall_shown:${props.surface}:${props.feature ?? ""}:${props.ticker ?? "none"}`;
  if (!dedupeSession(key)) return;
  captureEvent("paywall_shown", props);
}

export function trackPaywallUnlockClicked(props: {
  surface: PaywallSurface;
  ticker?: string;
  feature?: string;
  signedIn: boolean;
}) {
  captureEvent("paywall_unlock_clicked", props);
}

export function trackAttributionSubmitted(props: {
  source?: string;
  other?: string;
  skipped?: boolean;
}) {
  captureEvent("attribution_submitted", props);
}

export function trackCheckoutClicked(props: {
  period: "monthly" | "yearly";
  market: "US" | "IN";
  signedIn: boolean;
}) {
  captureEvent("checkout_clicked", props);
  captureEvent("subscription_plan_clicked", props);
}

export function trackCheckoutStarted(props: {
  period: "monthly" | "yearly";
  market: "US" | "IN";
}) {
  captureEvent("checkout_started", props);
}

export function trackSubscribeSigninStarted(props: {
  period: "monthly" | "yearly";
  market: "US" | "IN";
}) {
  captureEvent("subscribe_signin_started", props);
}

export function trackSubscribeSigninSucceeded(props: {
  period: "monthly" | "yearly";
  market: "US" | "IN";
}) {
  captureEvent("subscribe_signin_succeeded", props);
}

export function trackSubscriptionConverted(props: {
  subscription_id?: string | null;
  source?: "success_modal" | "activator_sync" | "dev_activate";
}) {
  const id = props.subscription_id ?? "latest";
  const key = `subscription_converted:${id}`;
  if (!dedupeSession(key)) return;
  captureEvent("subscription_converted", props);
}

export function trackRadarAddIntent(props: {
  ticker: string;
  instrument_id: string;
  signed_in: boolean;
  surface?: string;
}) {
  captureEvent("radar_add_intent", props);
}

export function trackRadarPickerOpened(props: {
  ticker: string;
  instrument_id: string;
  resumed_after_signin: boolean;
}) {
  captureEvent("radar_add_picker_opened", props);
}

export function trackRadarStockAdded(props: {
  ticker: string;
  instrument_id: string;
  position_type: "watchlist" | "holding";
  first_stock: boolean;
}) {
  captureEvent("radar_stock_added", props);
  if (props.first_stock) captureEvent("radar_first_stock_added", props);
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

export function trackAskAiClicked(props: {
  surface: "watchlist" | "stock" | "radar_row";
  ticker?: string;
}) {
  captureEvent("ask_ai_clicked", props);
}
