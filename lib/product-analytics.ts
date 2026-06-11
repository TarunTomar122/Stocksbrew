"use client";

import { captureEvent } from "@/lib/posthog";

export type AuthSurface =
  | "header"
  | "hero"
  | "landing_final_cta"
  | "landing_pro_preview"
  | "paywall"
  | "locked_ai_brief"
  | "subscribe_pricing"
  | "radar_track"
  | "radar_bulk"
  | "demo_radar"
  | "home_content"
  | "unknown";

export type PaywallSurface =
  | "stock_tab"
  | "stock_pro"
  | "pillar_breakdown"
  | "upcoming_earnings"
  | "market_anomalies"
  | "reddit_buzz"
  | "locked_ai_brief";

function dedupeSession(key: string): boolean {
  try {
    if (sessionStorage.getItem(key) === "1") return false;
    sessionStorage.setItem(key, "1");
    return true;
  } catch {
    return true;
  }
}

export function trackUserSignedIn(props: { surface: AuthSurface; isNewUser?: boolean }) {
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
  signedIn?: boolean;
}) {
  const key = `paywall_shown:${props.surface}:${props.ticker ?? "none"}`;
  if (!dedupeSession(key)) return;
  captureEvent("paywall_shown", props);
}

export function trackPaywallUnlockClicked(props: {
  surface: PaywallSurface;
  ticker?: string;
  signedIn: boolean;
}) {
  captureEvent("paywall_unlock_clicked", props);
}

export function trackOnboardingStarted() {
  if (!dedupeSession("onboarding_started")) return;
  captureEvent("onboarding_started");
}

export function trackOnboardingCompleted(props?: { via?: "skip" | "subscribe" | "finish" }) {
  captureEvent("onboarding_completed", props ?? {});
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
  source?: "success_modal" | "activator_sync";
}) {
  const id = props.subscription_id ?? "latest";
  const key = `subscription_converted:${id}`;
  if (!dedupeSession(key)) return;
  captureEvent("subscription_converted", props);
}
