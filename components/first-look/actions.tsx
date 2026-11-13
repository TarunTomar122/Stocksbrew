"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { OaButton } from "@/components/oa/button";
import { captureEvent } from "@/lib/posthog";

async function post(action: "start" | "dismiss", source: string): Promise<boolean> {
  const response = await fetch("/api/first-look", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, source }),
  }).catch(() => null);
  return Boolean(response?.ok);
}

/** Closes the first look for good (its own field on the person's doc), then shows /agent without it. */
export function FirstLookDone() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  return (
    <span className="flex items-center gap-2">
      {failed ? (
        <span role="alert" className="text-[12.5px] text-signal-bearish">
          Could not close it. Try again.
        </span>
      ) : null}
      <OaButton
        variant="ghost"
        size="xs"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setFailed(false);
          captureEvent("first_look_dismissed");
          const saved = await post("dismiss", "agent");
          setBusy(false);
          if (!saved) {
            setFailed(true);
            return;
          }
          // The preview's address would bring it back on a reload: land on /agent itself.
          router.replace("/agent");
          router.refresh();
        }}
      >
        Done
      </OaButton>
    </span>
  );
}

/**
 * The one-time offer for someone who had their stocks before the first look existed: the tap starts it (stored, so
 * it stays until they close it or their first agent run lands) and the page shows it. If the save fails, the preview
 * shows it this once instead.
 */
export function FirstLookStart() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  return (
    <OaButton
      variant="secondary"
      size="sm"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        captureEvent("first_look_started", { source: "agent" });
        const saved = await post("start", "agent");
        if (saved) router.refresh();
        else router.push("/agent?first-look=1");
        setBusy(false);
      }}
    >
      Get a first look
    </OaButton>
  );
}
