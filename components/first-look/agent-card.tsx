"use client";

import * as React from "react";

import { KindIcon } from "@/components/oa/nav-icon";
import { StockLogo } from "@/components/stock-logo";
import { TEMPLATE_ICON } from "@/components/agents-jobs/template-icons";
import type { AgentOffer } from "@/lib/first-look/types";
import { captureEvent } from "@/lib/posthog";

import { FOCUS, ROW, ROW_CONTROL, ROW_EVIDENCE, ROW_ICON, ROW_LINE, ROW_NAME, ROW_NOTE } from "./grid";

type Job = NonNullable<AgentOffer["job"]>;

async function readError(response: Response, fallback: string): Promise<string> {
  const data = (await response.json().catch(() => null)) as { error?: unknown } | null;
  return typeof data?.error === "string" && data.error ? data.error : fallback;
}

/**
 * One agent the first look would set up, as a row with its switch. Nothing is on until the person taps it: the tap
 * makes the agent from its template (POST /api/agent-jobs, watching their own stocks), and another tap pauses it
 * (PATCH, the same call the Agents page makes). Past the plan's limit the server saves it paused and says so here.
 */
export function AgentOfferRow({ offer }: { offer: AgentOffer }) {
  const [job, setJob] = React.useState<Job | null>(offer.job);
  const [busy, setBusy] = React.useState(false);
  const [note, setNote] = React.useState<{ text: string; error: boolean } | null>(null);
  const on = job?.enabled ?? false;

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      if (!job) {
        const response = await fetch("/api/agent-jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(offer.draft),
        });
        if (!response.ok) throw new Error(await readError(response, "I could not set this agent up. Try again."));
        const data = (await response.json()) as { job?: { id?: unknown; enabled?: unknown }; paused?: { message?: unknown } | null };
        if (typeof data.job?.id !== "string") throw new Error("I could not set this agent up. Try again.");
        const made = { id: data.job.id, enabled: data.job.enabled === true };
        setJob(made);
        if (!made.enabled && typeof data.paused?.message === "string") setNote({ text: data.paused.message, error: false });
        captureEvent("first_look_agent_on", { template: offer.template, enabled: made.enabled });
      } else {
        const next = !job.enabled;
        const response = await fetch(`/api/agent-jobs/${encodeURIComponent(job.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: next }),
        });
        if (!response.ok) throw new Error(await readError(response, "I could not change this agent. Try again."));
        setJob({ id: job.id, enabled: next });
        captureEvent(next ? "first_look_agent_on" : "first_look_agent_off", { template: offer.template });
      }
    } catch (error) {
      setNote({ text: error instanceof Error ? error.message : "Something went wrong. Try again.", error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={ROW}>
      <span aria-hidden="true" className={`${ROW_ICON} flex size-7 items-center justify-center rounded-md border border-oa-border bg-oa-bg text-oa-muted-fg`}>
        <KindIcon name={TEMPLATE_ICON[offer.template] ?? "agents"} className="size-[15px]" />
      </span>
      <span className={ROW_NAME}>{offer.title}</span>
      <span className={ROW_LINE}>{offer.does}</span>
      {/* What it would have caught on their stocks lately; an empty slot keeps the rows' columns in line. */}
      <span className={`${ROW_EVIDENCE} ${offer.tickers.length > 0 ? "" : "hidden [@container(min-width:48rem)]:flex"}`} title={offer.tickers.length > 0 ? offer.tickers.join(", ") : undefined}>
        {offer.tickers.length > 0 ? (
          <>
            <span className="flex shrink-0 -space-x-1.5">
              {offer.tickers.map((ticker) => (
                <StockLogo key={ticker} ticker={ticker} size={20} circle atOnce className="ring-2 ring-oa-card" />
              ))}
            </span>
            <span className="min-w-0 truncate text-[12.5px] text-oa-muted-fg">{offer.hint}</span>
          </>
        ) : null}
      </span>
      <span className={ROW_CONTROL}>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={`${offer.title}: ${on ? "on" : "off"}`}
          aria-busy={busy}
          disabled={busy}
          onClick={() => void toggle()}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors disabled:cursor-wait disabled:opacity-70 ${
            on ? "border-[color-mix(in_srgb,var(--oa-primary)_80%,#3a3480)] bg-oa-primary" : "border-oa-border bg-oa-bg hover:border-oa-fg/30"
          } ${FOCUS}`}
        >
          <span
            aria-hidden="true"
            className={`absolute size-[18px] rounded-full shadow-sm transition-transform ${on ? "translate-x-[21px] bg-oa-primary-fg" : "translate-x-[2px] bg-oa-card ring-1 ring-oa-border"} ${busy ? "animate-pulse" : ""}`}
          />
        </button>
      </span>
      {note ? (
        <span role={note.error ? "alert" : "status"} className={`${ROW_NOTE} ${note.error ? "text-signal-bearish" : "text-oa-muted-fg"}`}>
          {note.text}
        </span>
      ) : null}
    </li>
  );
}
