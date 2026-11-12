"use client";

import { useSyncExternalStore } from "react";

import { RADAR_TRACK_CHANGED_EVENT } from "@/lib/radar-track-events";
import type { Thesis } from "@/lib/thesis";
import type { CheckView } from "@/lib/thesis-watch/server";

/**
 * The signed-in person's reasons and the reason watcher's checks on them,
 * fetched once per page and shared by every row, the reasons sheet and the
 * stock page. Nothing is fetched until something on the page calls
 * `loadTheses()` (the live portfolio and a signed-in stock page do), so
 * visitors and the example portfolio never ask.
 */

export type CheckState = { check: CheckView | null; locked: boolean; pending: boolean };

let theses: Record<string, Thesis> = {};
let held: string[] = [];
let thesesReady = false;
let started = false;
// Whether every reason has been checked this page load, and whether a page asked for that before the reasons arrived.
let checkedAll = false;
let wantAll = false;
const checks = new Map<string, CheckState>();
const listeners = new Set<() => void>();
let version = 0;

const PENDING: CheckState = { check: null, locked: false, pending: true };
const NONE: CheckState = { check: null, locked: false, pending: false };

function emit() {
  version += 1;
  for (const listener of listeners) listener();
}

/** The newest request per stock: an older answer (say, computed on the reason before an edit) never overwrites a newer one. */
const latestAsk = new Map<string, number>();
let askCounter = 0;
/** The route checks at most this many stocks per request. */
const CHECK_BATCH = 50;

/** Asks the watcher about `ids` (every reason when left out) and keeps what comes back. */
export function loadChecks(ids?: readonly string[]) {
  const asked = [...(ids ?? Object.keys(theses))];
  if (asked.length === 0) return;
  for (const id of asked) if (!checks.get(id)?.check) checks.set(id, PENDING);
  emit();
  for (let start = 0; start < asked.length; start += CHECK_BATCH) askBatch(asked.slice(start, start + CHECK_BATCH));
}

function askBatch(batch: string[]) {
  const ask = ++askCounter;
  for (const id of batch) latestAsk.set(id, ask);
  const current = (id: string) => latestAsk.get(id) === ask;
  // A failed request leaves what is on screen; only a stock still waiting goes back to nothing.
  const giveUp = () => {
    for (const id of batch) if (current(id) && checks.get(id)?.pending) checks.set(id, NONE);
    emit();
  };
  fetch(`/api/thesis/checks?ids=${encodeURIComponent(batch.join(","))}`, { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : null))
    .then((data: { checks?: Record<string, CheckView>; locked?: string[] } | null) => {
      if (!data) return giveUp();
      const got = data.checks ?? {};
      const locked = new Set(data.locked ?? []);
      for (const id of batch) {
        if (!current(id)) continue;
        if (got[id]) checks.set(id, { check: got[id]!, locked: false, pending: false });
        else if (locked.has(id)) checks.set(id, { check: null, locked: true, pending: false });
        else checks.set(id, NONE);
      }
      emit();
    })
    .catch(giveUp);
}

/** Reads the reasons once per page; `checkAll: false` leaves the checks to the caller (the stock page asks for one). */
export function loadTheses(options: { checkAll?: boolean } = {}) {
  // A page that checks only one stock (the stock page) may have loaded the reasons already; a later
  // page that needs every check (Portfolio) still asks for them instead of returning early.
  if (started) {
    if (options.checkAll !== false && !checkedAll) {
      checkedAll = true;
      if (thesesReady) loadChecks();
      else wantAll = true;
    }
    return;
  }
  started = true;
  if (options.checkAll !== false) checkedAll = true;
  fetch("/api/thesis", { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : null))
    .then((data: { theses?: Record<string, Thesis>; held?: string[] } | null) => {
      if (!data?.theses) {
        started = false;
        checkedAll = false;
        return;
      }
      theses = { ...data.theses, ...theses };
      held = Array.isArray(data.held) ? data.held : [];
      thesesReady = true;
      emit();
      if (options.checkAll !== false || wantAll) loadChecks();
      wantAll = false;
    })
    .catch(() => {
      started = false;
      checkedAll = false;
    });
}

/** Saves and removals made on this page, in order, so a reload that started earlier doesn't undo them. */
let editSeq = 0;
let reloadSeq = 0;
const edits = new Map<string, { seq: number; thesis: Thesis | null }>();

/**
 * The person's list changed somewhere on the page (lib/radar-track-events.ts): which stocks are held, and which reasons
 * still count, may have changed with it. Reload the reasons in place of the ones held here, so a removed stock's
 * reason card goes and a new holding gets its "why do you own it" prompt without a full reload. Nothing happens on a
 * page that never loaded them.
 */
export function reloadTheses() {
  // Nothing on the page shows reasons (no subscriber), or they never loaded: nothing to bring up to date.
  if (!started || !thesesReady || listeners.size === 0) return;
  const all = checkedAll;
  const reload = ++reloadSeq;
  const from = editSeq;
  fetch("/api/thesis", { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : null))
    .then((data: { theses?: Record<string, Thesis>; held?: string[] } | null) => {
      // A later reload is on its way, or this one failed: keep what is on screen.
      if (!data?.theses || reload !== reloadSeq) return;
      const next = { ...data.theses };
      // A save or removal made here after this read started is newer than the server's answer.
      for (const [id, edit] of edits) {
        if (edit.seq <= from) continue;
        if (edit.thesis) next[id] = edit.thesis;
        else delete next[id];
      }
      for (const id of Object.keys(theses)) if (!next[id]) checks.delete(id);
      theses = next;
      held = Array.isArray(data.held) ? data.held : [];
      emit();
      if (all) loadChecks();
    })
    .catch(() => undefined);
}

let listening = false;
function listenForBookChanges() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener(RADAR_TRACK_CHANGED_EVENT, () => reloadTheses());
}
listenForBookChanges();

/** After a save: show the new reasons straight away, then check them again. */
export function putTheses(next: Record<string, Thesis>) {
  for (const [id, thesis] of Object.entries(next)) edits.set(id, { seq: ++editSeq, thesis });
  theses = { ...theses, ...next };
  emit();
  loadChecks(Object.keys(next));
}

/** After a removal: the reasons and their checks go from the page. */
export function dropTheses(ids: readonly string[]) {
  for (const id of ids) edits.set(id, { seq: ++editSeq, thesis: null });
  const next = { ...theses };
  for (const id of ids) {
    delete next[id];
    checks.delete(id);
  }
  theses = next;
  emit();
}

/** Subscribes to every change in the store (what the hooks below use); returns the unsubscribe. */
export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useThesis(instrumentId: string): Thesis | null {
  return useSyncExternalStore(
    subscribe,
    () => theses[instrumentId] ?? null,
    () => null,
  );
}

export function useCheck(instrumentId: string): CheckState {
  return useSyncExternalStore(
    subscribe,
    () => checks.get(instrumentId) ?? NONE,
    () => NONE,
  );
}

/** Every reason, once they have loaded (null before that). */
export function useAllTheses(): Record<string, Thesis> | null {
  return useSyncExternalStore(
    subscribe,
    () => (thesesReady ? theses : null),
    () => null,
  );
}

/** Instrument ids the person marks as owned, from the same read. */
export function useHeld(): string[] {
  return useSyncExternalStore(
    subscribe,
    () => held,
    () => held,
  );
}

/** Saves reasons on the person's own account. Throws with a plain message when it does not go through. */
export async function saveReasons(items: Array<{ instrument_id: string; kind: Thesis["kind"]; reason: string | null }>): Promise<Record<string, Thesis>> {
  const res = await fetch("/api/thesis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  const data = (await res.json().catch(() => ({}))) as { theses?: Record<string, Thesis>; error?: string };
  if (!res.ok || !data.theses) throw new Error(res.status === 401 ? "Sign in again to save your reason." : "We could not save your reason. Try again.");
  putTheses(data.theses);
  return data.theses;
}

export async function removeReasons(ids: string[]): Promise<void> {
  const res = await fetch("/api/thesis", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instrument_ids: ids }),
  });
  if (!res.ok) throw new Error(res.status === 401 ? "Sign in again to change your reasons." : "We could not remove it. Try again.");
  dropTheses(ids);
}

/** One stock's reason, without subscribing (like getCheck). */
export function getThesis(instrumentId: string): Thesis | null {
  return theses[instrumentId] ?? null;
}

/** The latest check on one stock, without subscribing; pair with `useStoreVersion()` to re-render. */
export function getCheck(instrumentId: string): CheckState {
  return checks.get(instrumentId) ?? NONE;
}

/** Changes whenever a reason or a check changes, for lists that read several at once. */
export function useStoreVersion(): number {
  return useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );
}

/**
 * Fills the store without asking the server, for the local preview page
 * (app/dev/thesis-watch) that shows these parts with real checks and made-up
 * reasons. Nothing calls it on a real page.
 */
export function primeThesisStore(input: { theses: Record<string, Thesis>; held: string[]; checks: Record<string, CheckView>; locked?: string[] }) {
  started = true;
  thesesReady = true;
  theses = { ...input.theses };
  held = [...input.held];
  checks.clear();
  for (const [id, check] of Object.entries(input.checks)) checks.set(id, { check, locked: false, pending: false });
  for (const id of input.locked ?? []) checks.set(id, { check: null, locked: true, pending: false });
  emit();
}
