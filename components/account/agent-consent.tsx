"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { OaButton } from "@/components/oa/button";
import { signInWithGoogle } from "@/lib/sign-in";
import { useProCheckout } from "@/lib/use-pro-checkout";

/**
 * The buttons on the OAuth consent screen. Approve and cancel both post to
 * the existing authorize route, which answers with where to send the browser.
 */
export function AgentConsentActions({
  authorizationParams,
  signedIn,
  subscribed,
}: {
  authorizationParams: Record<string, string>;
  signedIn: boolean;
  subscribed: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<"signin" | "approve" | "deny" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const { openCheckout, busy: checkoutBusy } = useProCheckout("paywall");

  async function signIn() {
    setBusy("signin");
    setError(null);
    try {
      await signInWithGoogle({ surface: "agent_oauth" });
      router.refresh();
    } catch {
      setError("Sign-in did not complete. Allow pop-ups for this site and try again.");
    } finally {
      setBusy(null);
    }
  }

  async function decide(decision: "approve" | "deny") {
    setBusy(decision);
    setError(null);
    try {
      const response = await fetch("/api/mcp/oauth/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...authorizationParams, decision }),
      });
      const data = (await response.json().catch(() => ({}))) as { redirect_to?: string; error_description?: string };
      if (!response.ok) throw new Error(data.error_description || "Authorization failed.");
      if (!data.redirect_to) throw new Error("The client did not give a valid address to return to.");
      window.location.assign(data.redirect_to);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authorization failed.");
      setBusy(null);
    }
  }

  return (
    <div>
      {error ? (
        <p role="alert" className="mb-3 text-[13.5px] leading-5 text-signal-bearish">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {!signedIn ? (
          <OaButton loading={busy === "signin"} disabled={busy != null} onClick={() => void signIn()}>
            Sign in with Google to continue
          </OaButton>
        ) : !subscribed ? (
          <OaButton loading={checkoutBusy} disabled={busy != null} onClick={() => void openCheckout()}>
            Get Pro to connect
          </OaButton>
        ) : (
          <OaButton loading={busy === "approve"} disabled={busy != null} onClick={() => void decide("approve")}>
            Approve
          </OaButton>
        )}
        <OaButton variant="secondary" loading={busy === "deny"} disabled={busy != null} onClick={() => void decide("deny")}>
          Cancel
        </OaButton>
      </div>
    </div>
  );
}
