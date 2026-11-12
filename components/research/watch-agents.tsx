"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { TEMPLATE_ICON } from "@/components/agents-jobs/template-icons";
import { KindIcon } from "@/components/oa/nav-icon";
import type { AgentJobDraft } from "@/lib/agent-jobs";
import { useUser } from "@/lib/auth-context";
import type { Plan } from "@/lib/entitlements";
import { trackAgentSwitchedOn } from "@/lib/product-analytics";
import { signInWithGoogle } from "@/lib/sign-in";

/**
 * "Have an agent watch these": the agents a report's "What to watch next" maps to (lib/research/watch-agents.ts),
 * as one row of chips under the report. One tap saves the agent for this stock through POST /api/agents/save, the
 * same path as the plain-English box, and the chip turns to "Watching" in place. Signed out, the tap signs in first
 * and then saves. Past the plan's limit the agent is saved paused, and the line under the chips says how to run it.
 */

export type WatchAgentChip = {
  id: string;
  template: string;
  label: string;
  draft: AgentJobDraft;
  status: "new" | "watching" | "paused";
  /** The plan cannot run this kind of agent (filings and news on the tighter Free line): it saves paused. */
  pro: boolean;
};

type Note = { tone: "ok" | "limit" | "error"; text: string; pro?: boolean } | null;

type SaveResponse = {
  ok?: boolean;
  error?: string;
  jobs?: Array<{ name: string; enabled: boolean; template: string }>;
  already?: string[];
  paused?: { count: number; limit: number; pro_only?: number } | null;
};

function agentsAtOnce(limit: number): string {
  return limit === 1 ? "one agent" : limit === 2 ? "two agents" : `${limit} agents`;
}

function Check() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-3.5 shrink-0">
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

export function WatchAgents({ chips: initial, plan }: { chips: WatchAgentChip[]; plan: Plan }) {
  const router = useRouter();
  const { user } = useUser();
  const [chips, setChips] = React.useState(initial);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<Note>(null);
  // A second tap while one is saving does nothing.
  const saving = React.useRef(false);

  React.useEffect(() => setChips(initial), [initial]);

  if (chips.length === 0) return null;

  async function add(chip: WatchAgentChip) {
    if (saving.current || chip.status !== "new") return;
    saving.current = true;
    setBusy(chip.id);
    setNote(null);
    try {
      if (!user && plan === "anon") {
        try {
          await signInWithGoogle({ surface: "agents_save" });
        } catch {
          // The sign-in sheet says what went wrong; nothing is saved.
          return;
        }
      }
      const response = await fetch("/api/agents/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ drafts: [chip.draft] }),
      });
      const data = (await response.json().catch(() => ({}))) as SaveResponse;
      if (!response.ok || !data.ok) {
        setNote({ tone: "error", text: data.error ?? "That didn't save. Try again in a moment." });
        return;
      }
      const saved = data.jobs?.[0] ?? null;
      const on = saved ? saved.enabled : true;
      if (saved) trackAgentSwitchedOn({ template: chip.template, via: "create", enabled: saved.enabled });
      setChips((list) => list.map((item) => (item.id === chip.id ? { ...item, status: on ? "watching" : "paused" } : item)));
      if (!saved) setNote({ tone: "ok", text: "You already have this agent." });
      else if (on) setNote({ tone: "ok", text: "Done. It reports after the next check." });
      else if (data.paused?.pro_only) setNote({ tone: "limit", text: "Saved and paused: watching filings and news is part of Pro.", pro: true });
      else setNote({ tone: "limit", text: `Saved and paused: your plan runs ${agentsAtOnce(data.paused?.limit ?? 2)} at a time.`, pro: plan !== "pro" });
      // Signed out when the page was drawn, or an agent we did not know about: draw it again with this person's agents.
      if (plan === "anon" || !saved) router.refresh();
    } catch {
      setNote({ tone: "error", text: "The connection dropped. Try again." });
    } finally {
      saving.current = false;
      setBusy(null);
    }
  }

  return (
    <section aria-label="Have an agent watch these" className="oa-surface border border-oa-border bg-oa-card px-4 py-3.5 sm:px-5">
      <h2 className="text-[16px] font-semibold leading-6 text-oa-fg">Have an agent watch these</h2>
      <ul className="mt-2.5 flex flex-wrap gap-2">
        {chips.map((chip) => {
          const icon = <KindIcon name={TEMPLATE_ICON[chip.template] ?? "agents"} className="size-4" />;
          if (chip.status !== "new") {
            return (
              <li key={chip.id}>
                <Link
                  href="/agents"
                  className="inline-flex min-h-9 items-center gap-2 rounded-full border border-oa-border bg-oa-bg px-3 text-[13.5px] leading-5 text-oa-muted-fg hover:text-oa-fg"
                  title={chip.status === "watching" ? "An agent of yours already watches this" : "Saved and paused. Switch it on in your agents"}
                >
                  {chip.status === "watching" ? <Check /> : icon}
                  <span className="text-oa-fg">{chip.label}</span>
                  <span>{chip.status === "watching" ? "Watching" : "Paused"}</span>
                </Link>
              </li>
            );
          }
          return (
            <li key={chip.id}>
              <button
                type="button"
                onClick={() => add(chip)}
                disabled={busy !== null}
                aria-busy={busy === chip.id}
                data-track="research_watch_agent"
                data-track-template={chip.template}
                className="inline-flex min-h-9 items-center gap-2 rounded-full border border-oa-border bg-oa-card px-3 text-[13.5px] font-medium leading-5 text-oa-fg outline-none transition-colors hover:border-oa-primary hover:bg-oa-accent focus-visible:bg-oa-accent disabled:cursor-default disabled:opacity-60"
              >
                <span className="text-oa-primary">{icon}</span>
                {busy === chip.id ? "Setting it up…" : chip.label}
                {chip.pro ? <span className="rounded bg-oa-accent px-1.5 text-[11px] font-semibold uppercase tracking-wide text-oa-muted-fg">Pro</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
      {note ? (
        <p role="status" className={`mt-2.5 text-pretty text-[13.5px] leading-5 ${note.tone === "error" ? "text-signal-bearish" : "text-oa-muted-fg"}`}>
          {note.text}{" "}
          {note.tone !== "error" ? (
            <>
              <Link href="/agents" className="font-medium text-oa-primary hover:underline">
                See your agents
              </Link>
            </>
          ) : null}
          {note.pro ? (
            <>
              {" · "}
              <Link href="/pricing#agents" className="font-medium text-oa-primary hover:underline">
                See Pro
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
    </section>
  );
}
