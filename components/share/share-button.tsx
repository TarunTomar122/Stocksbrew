"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { MAX_SHARES_PER_USER, pickVariant, type ShareCandidate, type ShareKind } from "@/lib/share/types";

import { ShareCardView } from "./share-card";

// Local copy: the kit index pulls the server site header into a client bundle.
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--oa-ring)_60%,transparent)]";

/**
 * "Share" on a signed-in page: pick one read, see exactly the card that would
 * be shared, choose whether company names show, then make a link. Nothing is
 * saved until "Make the link" is pressed, and the server only saves the card
 * the person was shown (it checks the preview's hash).
 */

type Stage =
  | { name: "loading" }
  | { name: "empty"; message: string }
  | { name: "pick" }
  | { name: "made"; id: string; path: string };

type Mine = { id: string; kind: string; headline: string; createdAt: string };

const ERRORS: Record<string, string> = {
  unauthenticated: "Sign in to share a card.",
  no_holdings: "There is nothing of yours to share on this page yet. It needs your own holdings, with share counts, to make a card.",
  locked: "Cards from inside your funds and past crashes come with Pro.",
  read_failed: "We could not read your holdings just now. Try again in a minute.",
  too_many: `You have ${MAX_SHARES_PER_USER} shared cards already. Delete one below to make room.`,
  write_failed: "The link could not be saved just now. Try again in a minute.",
};

function errorText(code: string | null | undefined): string {
  return (code && ERRORS[code]) || "Something went wrong. Try again in a minute.";
}

function dayWords(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function ShareIcon() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" fill="none" className="size-4">
      <path d="M10 3v9M6.5 6.5 10 3l3.5 3.5M4.5 10.5v5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const BTN =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-oa-border bg-oa-card px-3 text-[13.5px] font-medium text-oa-fg transition-colors hover:border-oa-muted-fg disabled:opacity-50";

export function ShareButton({ kind, week = null, className }: { kind: ShareKind; week?: string | null; className?: string }) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>({ name: "loading" });
  const [candidates, setCandidates] = useState<ShareCandidate[]>([]);
  const [cardId, setCardId] = useState<string | null>(null);
  const [hideNames, setHideNames] = useState(false);
  const [showAmounts, setShowAmounts] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [mine, setMine] = useState<Mine[] | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const busyRef = useRef(false);
  busyRef.current = busy;

  // Opening moves focus into the sheet and locks the page behind it; closing gives focus back to "Share".
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    const button = trigger.current;
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
      button?.focus();
    };
  }, [open]);

  function applyCandidates(list: ShareCandidate[], keep: string | null) {
    setCandidates(list);
    setCardId(keep && list.some((item) => item.cardId === keep) ? keep : list[0]?.cardId ?? null);
  }

  async function loadMine() {
    try {
      const res = await fetch("/api/share", { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { shares?: Mine[] };
      setMine(body.shares ?? []);
    } catch {
      // The list is a convenience; the card still works without it.
    }
  }

  async function start() {
    setOpen(true);
    setStage({ name: "loading" });
    setError(null);
    setNote(null);
    setCopied(false);
    setHideNames(false);
    setShowAmounts(false);
    void loadMine();
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "draft", kind, week }),
      });
      const body = (await res.json().catch(() => ({}))) as { candidates?: ShareCandidate[]; error?: string };
      if (!res.ok || !body.candidates) {
        setStage({ name: "empty", message: errorText(body.error) });
        return;
      }
      if (body.candidates.length === 0) {
        setStage({ name: "empty", message: "Your holdings do not give this page a read worth sharing yet. Try another page, or add share counts to your holdings." });
        return;
      }
      applyCandidates(body.candidates, null);
      setStage({ name: "pick" });
    } catch {
      setStage({ name: "empty", message: errorText("network") });
    }
  }

  const candidate = candidates.find((item) => item.cardId === cardId) ?? null;
  const chosen = candidate ? pickVariant(candidate, { hideNames, showAmounts }) : null;

  async function make() {
    if (!candidate || !chosen) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create", kind, week, cardId: candidate.cardId, hideNames: chosen.options.hideNames, showAmounts: chosen.options.showAmounts, hash: chosen.hash }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: string; path?: string; error?: string; candidates?: ShareCandidate[] };
      if (res.status === 409 && body.candidates) {
        if (body.candidates.length === 0) {
          setStage({ name: "empty", message: "Your holdings changed since this opened, and this page has no card to share right now." });
          return;
        }
        applyCandidates(body.candidates, candidate.cardId);
        setNote("The numbers moved since this opened, so the card has been updated. Check it again before you share.");
        return;
      }
      if (!res.ok || !body.id || !body.path) {
        setError(errorText(body.error));
        return;
      }
      setStage({ name: "made", id: body.id, path: body.path });
      void loadMine();
    } catch {
      setError(errorText("network"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/share/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) {
        setError("That card could not be deleted just now. Try again in a minute.");
        return;
      }
      setMine((list) => (list ?? []).filter((row) => row.id !== id));
      if (stage.name === "made" && stage.id === id) setStage({ name: "pick" });
    } catch {
      setError("That card could not be deleted just now. Try again in a minute.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "https://www.stocksbrew.online";
  const shown = chosen?.options;
  const whatShows = shown
    ? `This card shows ${shown.showAmounts ? (shown.hideNames ? "dollar amounts and percentages" : "dollar amounts, percentages") : "percentages"}${shown.hideNames ? "" : " and company names"} only. ${
        shown.showAmounts ? "It never shows share counts or what your portfolio is worth." : "It never shows dollar amounts, share counts or what your portfolio is worth."
      }`
    : "";

  return (
    <>
      <button ref={trigger} type="button" onClick={() => void start()} className={className ?? `${BTN} ${FOCUS}`}>
        <ShareIcon />
        Share
      </button>
      {open ? (
        <div className="fixed inset-0 z-[100] flex items-end justify-center md:items-center md:px-4" role="dialog" aria-modal="true" aria-label="Share a card">
          <button type="button" aria-label="Close" tabIndex={-1} className="absolute inset-0 cursor-default bg-black/40" onClick={() => (!busy ? setOpen(false) : undefined)} />
          <div
            ref={panel}
            tabIndex={-1}
            className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-xl border border-oa-border bg-oa-page shadow-xl outline-none md:max-w-[52rem] md:rounded-xl"
          >
            <div className="flex min-h-12 items-center justify-between gap-3 border-b border-oa-border bg-oa-card px-4 py-2">
              <h2 className="text-[15px] font-semibold leading-5 text-oa-fg">{stage.name === "made" ? "Your link is ready" : "Share a card"}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                aria-label="Close"
                className={`inline-flex size-9 shrink-0 items-center justify-center rounded text-[18px] leading-none text-oa-muted-fg hover:text-oa-fg disabled:opacity-40 ${FOCUS}`}
              >
                ×
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
              {stage.name === "loading" ? (
                <div className="flex flex-col gap-3" aria-busy="true">
                  <p className="text-[14px] text-oa-muted-fg">Reading your holdings…</p>
                  <div className="h-52 animate-pulse rounded-xl border border-oa-border bg-oa-card" />
                </div>
              ) : null}

              {stage.name === "empty" ? <p className="text-pretty text-[14px] leading-5 text-oa-fg">{stage.message}</p> : null}

              {stage.name === "pick" && candidate && chosen ? (
                <div className="flex flex-col gap-4">
                  {candidates.length > 1 ? (
                    <fieldset className="flex flex-col gap-2">
                      <legend className="oa-caption mb-1">Which read</legend>
                      <div className="flex flex-wrap gap-2">
                        {candidates.map((item) => {
                          const active = item.cardId === candidate.cardId;
                          return (
                            <label
                              key={item.cardId}
                              className={`inline-flex cursor-pointer items-center rounded-lg border px-3 py-1.5 text-[13.5px] leading-5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-oa-primary ${
                                active ? "border-oa-primary bg-oa-card font-medium text-oa-fg" : "border-oa-border bg-oa-page text-oa-muted-fg hover:text-oa-fg"
                              }`}
                            >
                              <input type="radio" name="share-card" value={item.cardId} checked={active} onChange={() => setCardId(item.cardId)} className="sr-only" />
                              {item.label}
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>
                  ) : null}

                  <div className="flex flex-col gap-1.5">
                    <p className="oa-caption">This is exactly what people will see</p>
                    <ShareCardView card={chosen.card} />
                  </div>

                  <div className="flex flex-col gap-2">
                    {candidate.namesLocked ? (
                      <label className="flex items-start gap-2 text-[14px] leading-5 text-oa-muted-fg">
                        <input type="checkbox" checked={false} disabled className="mt-[3px] size-4" />
                        <span>Names cannot be hidden on this card, because the read is about them. Pick another read to share without names.</span>
                      </label>
                    ) : null}
                    {candidate.hasNames ? (
                      <label className="flex cursor-pointer items-start gap-2 text-[14px] leading-5 text-oa-fg">
                        <input type="checkbox" checked={hideNames} onChange={(event) => setHideNames(event.target.checked)} className="mt-[3px] size-4 accent-[var(--oa-primary)]" />
                        <span>Hide company and fund names</span>
                      </label>
                    ) : null}
                    {candidate.hasAmounts ? (
                      <label className="flex cursor-pointer items-start gap-2 text-[14px] leading-5 text-oa-fg">
                        <input type="checkbox" checked={showAmounts} onChange={(event) => setShowAmounts(event.target.checked)} className="mt-[3px] size-4 accent-[var(--oa-primary)]" />
                        <span>Show dollar amounts</span>
                      </label>
                    ) : null}
                    <p className="text-pretty text-[13px] leading-[18px] text-oa-muted-fg">
                      {whatShows} Anyone with the link can see it. It is a snapshot from today and does not update, and you can delete it any time.
                    </p>
                    {note ? <p className="text-pretty text-[13px] leading-[18px] text-oa-primary">{note}</p> : null}
                    {error ? <p className="text-pretty text-[13px] leading-[18px] text-signal-bearish">{error}</p> : null}
                  </div>
                </div>
              ) : null}

              {stage.name === "made" ? (
                <div className="flex flex-col gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/og/share/${stage.id}`}
                    alt="The shared card"
                    width={1200}
                    height={630}
                    className="h-auto w-full rounded-xl border border-oa-border bg-oa-card"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      readOnly
                      value={`${origin}${stage.path}`}
                      aria-label="Link to your card"
                      onFocus={(event) => event.currentTarget.select()}
                      className="oa-mono h-8 min-w-0 flex-1 rounded-lg border border-oa-border bg-oa-card px-2 text-[13px] text-oa-fg"
                    />
                    <button type="button" onClick={() => void copy(`${origin}${stage.path}`)} className={`${BTN} ${FOCUS}`}>
                      {copied ? "Copied" : "Copy link"}
                    </button>
                    <Link href={stage.path} target="_blank" rel="noopener" className={`${BTN} ${FOCUS}`}>
                      Open
                    </Link>
                  </div>
                  <p className="text-pretty text-[13px] leading-[18px] text-oa-muted-fg">
                    When you post the link, it shows this picture. Changed your mind?{" "}
                    <button type="button" disabled={busy} onClick={() => void remove(stage.id)} className="font-medium text-signal-bearish underline underline-offset-2 disabled:opacity-50">
                      Delete this card
                    </button>
                    .
                  </p>
                  {error ? <p className="text-pretty text-[13px] leading-[18px] text-signal-bearish">{error}</p> : null}
                </div>
              ) : null}

              {mine && mine.length > 0 && stage.name !== "loading" ? (
                <details className="mt-5 border-t border-oa-border pt-3">
                  <summary className="cursor-pointer text-[13.5px] font-medium text-oa-fg">Cards you have shared ({mine.length})</summary>
                  <ul className="mt-2 divide-y divide-oa-border">
                    {mine.map((row) => (
                      <li key={row.id} className="flex items-start justify-between gap-3 py-2">
                        <div className="min-w-0">
                          <p className="text-pretty text-[13.5px] leading-[18px] text-oa-fg">{row.headline}</p>
                          <p className="oa-mono mt-0.5 text-[11.5px] text-oa-muted-fg">
                            {dayWords(row.createdAt)} ·{" "}
                            <Link href={`/s/${row.id}`} target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-oa-fg">
                              open
                            </Link>
                          </p>
                        </div>
                        <button type="button" disabled={busy} onClick={() => void remove(row.id)} className="shrink-0 text-[13px] font-medium text-signal-bearish hover:underline disabled:opacity-50">
                          Delete
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>

            {stage.name === "pick" ? (
              <div className="flex items-center justify-end gap-2 border-t border-oa-border bg-oa-card px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <button type="button" onClick={() => setOpen(false)} disabled={busy} className={`${BTN} ${FOCUS}`}>
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void make()}
                  disabled={busy || !chosen}
                  className={`inline-flex h-8 items-center justify-center rounded-lg bg-oa-primary px-3 text-[13.5px] font-medium text-oa-primary-fg hover:opacity-90 disabled:opacity-50 ${FOCUS}`}
                >
                  {busy ? "Making the link…" : "Make the link"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
