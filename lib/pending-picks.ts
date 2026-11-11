import { dispatchRadarTrackChanged } from "@/lib/radar-track-events";
import { POST_SIGNUP_ONBOARDING_PENDING, POST_SIGNUP_ONBOARDING_SEEN } from "@/lib/sign-in";

/**
 * Stocks someone chose before signing in (the landing's "Watch these for me"), kept across the Google sign-in.
 * The sign-in can move the page on before the landing has added them (lib/auth-context.tsx sends a fresh sign-in
 * on "/" to My stocks), so they wait in sessionStorage and whichever page loads next with a session adds them
 * (components/post-signup-onboarding.tsx). Browser only.
 */

const KEY = "stocksbrew:pending-picks";
/** Picks older than this are dropped: someone who left and came back later did not ask for them now. */
const MAX_AGE_MS = 30 * 60 * 1000;
/** A pick that keeps failing (a stock we no longer have) is given up after this many page loads. */
const MAX_TRIES = 3;
const INSTRUMENT_ID = /^(US|IN)_[A-Z0-9_]+$/;

export type PendingPick = { instrumentId: string; ticker: string };
type Stored = { at: number; tries: number; picks: PendingPick[] };

function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function clean(picks: ReadonlyArray<PendingPick>): PendingPick[] {
  const out: PendingPick[] = [];
  for (const pick of picks) {
    if (!pick || !INSTRUMENT_ID.test(pick.instrumentId) || out.some((other) => other.instrumentId === pick.instrumentId)) continue;
    out.push({ instrumentId: pick.instrumentId, ticker: String(pick.ticker || "").slice(0, 16) });
  }
  return out.slice(0, 10);
}

/** Keep the picks for the page that loads after sign-in. Returns false when the browser will not store them. */
export function savePendingPicks(picks: ReadonlyArray<PendingPick>, tries = 0): boolean {
  const s = store();
  const kept = clean(picks);
  if (!s || kept.length === 0) return false;
  try {
    s.setItem(KEY, JSON.stringify({ at: Date.now(), tries, picks: kept } satisfies Stored));
    return true;
  } catch {
    return false;
  }
}

export function clearPendingPicks(): void {
  try {
    store()?.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}

/** Whether picks are waiting, without taking them. */
export function hasPendingPicks(): boolean {
  return readStored() !== null;
}

function readStored(): Stored | null {
  const s = store();
  if (!s) return null;
  try {
    const raw = s.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Stored>;
    const picks = clean(Array.isArray(parsed.picks) ? parsed.picks : []);
    const at = typeof parsed.at === "number" ? parsed.at : 0;
    const tries = typeof parsed.tries === "number" ? parsed.tries : 0;
    if (picks.length === 0 || Date.now() - at > MAX_AGE_MS || tries >= MAX_TRIES) {
      s.removeItem(KEY);
      return null;
    }
    return { at, tries, picks };
  } catch {
    return null;
  }
}

/**
 * Take the waiting picks: they leave storage at once, so two callers on the same page never add them twice.
 * Null when there are none (or they are too old).
 */
export function takePendingPicks(): { picks: PendingPick[]; tries: number } | null {
  const stored = readStored();
  if (!stored) return null;
  clearPendingPicks();
  return { picks: stored.picks, tries: stored.tries };
}

class AddError extends Error {
  constructor(readonly status: number) {
    super(`track_${status}`);
  }
}

async function addOne(instrumentId: string): Promise<void> {
  const post = () =>
    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instrument_id: instrumentId, position_type: "watchlist" }),
    });
  let response = await post();
  // A brand-new account's profile can take a moment to exist (lib/onboarding-dialog does the same).
  for (let wait = 0; response.status === 409 && wait < 2; wait++) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    response = await post();
  }
  if (!response.ok) throw new AddError(response.status);
}

/**
 * Add the picks to the signed-in account's watchlist, one at a time (each add is a transaction on the same user
 * record). Returns how many were added and the ones that failed. Once at least one is in, the first-run dialog is
 * marked seen: the person already chose their stocks, so My stocks opens on them instead of asking again. When none
 * went in it is not, so the dialog can still open with the picks to try again.
 */
export async function addPicks(picks: ReadonlyArray<PendingPick>): Promise<{ added: number; failed: PendingPick[]; signedOut: boolean }> {
  let added = 0;
  let signedOut = false;
  const failed: PendingPick[] = [];
  for (const pick of clean(picks)) {
    try {
      await addOne(pick.instrumentId);
      added += 1;
    } catch (error) {
      failed.push(pick);
      if (error instanceof AddError && error.status === 401) signedOut = true;
    }
  }
  if (added > 0) {
    dispatchRadarTrackChanged({ action: "add", count: added });
    try {
      localStorage.setItem(POST_SIGNUP_ONBOARDING_SEEN, "1");
      localStorage.removeItem(POST_SIGNUP_ONBOARDING_PENDING);
    } catch {
      // blocked storage: the first-run dialog may still open once
    }
  }
  return { added, failed, signedOut };
}

/** "We couldn't add NVDA and JPM. Try again.": what the first-run dialog says when no landing pick went in. */
export function couldNotAddMessage(picks: ReadonlyArray<Pick<PendingPick, "ticker">>): string {
  const tickers = picks.map((pick) => pick.ticker).filter(Boolean);
  if (tickers.length === 0) return "We couldn't add your stocks. Try again.";
  const names = tickers.length === 1 ? tickers[0]! : `${tickers.slice(0, -1).join(", ")} and ${tickers[tickers.length - 1]}`;
  return `We couldn't add ${names}. Try again.`;
}
