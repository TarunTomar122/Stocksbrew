"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Local copy: the kit index pulls the server site header into a client bundle.
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";


/** The owner's way to take a shared card down, shown only to the person who made it. */
export function DeleteShare({ id }: { id: string }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "confirm" | "busy" | "error">("idle");

  async function remove() {
    setState("busy");
    try {
      const res = await fetch(`/api/share/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) {
        setState("error");
        return;
      }
      router.refresh();
    } catch {
      setState("error");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-oa-border bg-oa-card px-3 py-2 text-[13.5px] leading-5">
      <span className="text-oa-muted-fg">You made this card.</span>
      {state === "confirm" || state === "busy" || state === "error" ? (
        <>
          <span className="text-oa-fg">Delete it for everyone?</span>
          <button type="button" disabled={state === "busy"} onClick={() => void remove()} className={`font-medium text-signal-bearish underline underline-offset-2 disabled:opacity-50 ${FOCUS}`}>
            {state === "busy" ? "Deleting…" : "Yes, delete it"}
          </button>
          <button type="button" disabled={state === "busy"} onClick={() => setState("idle")} className={`text-oa-muted-fg hover:text-oa-fg ${FOCUS}`}>
            Keep it
          </button>
          {state === "error" ? <span className="text-signal-bearish">It could not be deleted just now. Try again in a minute.</span> : null}
        </>
      ) : (
        <button type="button" onClick={() => setState("confirm")} className={`font-medium text-signal-bearish underline underline-offset-2 ${FOCUS}`}>
          Delete this card
        </button>
      )}
    </div>
  );
}
