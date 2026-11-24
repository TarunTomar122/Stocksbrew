import { adminFirestore } from "@/lib/firebase-admin";
import { sendTransactionalEmail } from "@/lib/brevo";
import {
  SUBSCRIBERS,
  addPurpose,
  mergeTickers,
  planCapture,
  seedTickers,
  subscriberId,
  subscriberToken,
  type CaptureSource,
  type SubscriberDoc,
} from "@/lib/email-subscribers";
import { buildSubscriberConfirmEmail, confirmUrl } from "@/lib/emails/subscriber-confirm";

/**
 * Reads and writes for the no-account morning email (rules in lib/email-subscribers.ts). Every change to a record
 * goes through a transaction, so two signups at once never lose a ticker or send two confirmations.
 */

export type CaptureResult =
  /** Stored; `confirmSent` says whether this signup sent a confirmation, `addSent` an "add this stock?" email. */
  | { status: "stored"; confirmSent: boolean; addSent: boolean; id: string }
  /** The address is an account's (or a linked record): nothing stored or sent. */
  | { status: "account" }
  /** A confirmation or an add email was due but the per-instance send cap is spent: stored, nothing sent. */
  | { status: "busy"; id: string };

type Deps = {
  db?: typeof adminFirestore;
  send?: (to: string, subject: string, html: string, text: string) => Promise<boolean>;
  /** Whether one more confirmation may go out now (the route's global cap). */
  mayConfirm?: () => boolean;
  now?: number;
};

const ref = (db: typeof adminFirestore, id: string) => db.collection(SUBSCRIBERS).doc(id);

/** An account already uses this address (users.email_lower). */
export async function emailHasAccount(email: string, db: typeof adminFirestore = adminFirestore): Promise<boolean> {
  const snap = await db.collection("users").where("email_lower", "==", email).limit(1).get();
  return !snap.empty;
}

export async function captureSubscriber(
  input: { email: string; ticker: string | null; source: CaptureSource },
  deps: Deps = {},
): Promise<CaptureResult> {
  const db = deps.db ?? adminFirestore;
  const now = deps.now ?? Date.now();
  if (await emailHasAccount(input.email, db)) return { status: "account" };
  const id = subscriberId(input.email);
  const docRef = ref(db, id);

  // Claim the email inside the transaction (confirm_sent_at or add_sent_at = now), so a second signup a moment later
  // sees it. At most one email per signup: a waiting record gets the confirmation, a confirmed one the add email.
  // Set inside the transaction callback: typed with `as`, so TS does not narrow them to their first value.
  let previousSentAt = null as string | null;
  let kind = null as "confirm" | "add" | null;
  let addTicker = null as string | null;
  let busy = false;
  let doc = null as SubscriberDoc | null;
  // Asked once: a retried transaction must not spend a second email from the cap.
  let allowed: boolean | null = null;
  const mayConfirm = () => (allowed ??= deps.mayConfirm ? deps.mayConfirm() : true);
  const outcome = await db.runTransaction(async (tx) => {
    const snap = await tx.get(docRef);
    const existing = snap.exists ? ((snap.data() ?? {}) as Partial<SubscriberDoc>) : null;
    const plan = planCapture(existing, input, now);
    if (plan.kind === "linked") return "linked" as const;
    const due = plan.sendConfirm ? "confirm" : plan.sendAdd ? "add" : null;
    const field = due === "add" ? "add_sent_at" : "confirm_sent_at";
    previousSentAt = plan.doc[field] ?? null;
    kind = due && mayConfirm() ? due : null;
    addTicker = kind === "add" ? plan.sendAdd : null;
    busy = due !== null && kind === null;
    doc = kind ? { ...plan.doc, [field]: new Date(now).toISOString() } : plan.doc;
    tx.set(docRef, doc as unknown as Record<string, unknown>);
    return "write" as const;
  });
  if (outcome === "linked") return { status: "account" };
  if (busy) return { status: "busy", id };
  if (!kind || !doc) return { status: "stored", confirmSent: false, addSent: false, id };

  const sending = kind;
  const ticker = addTicker;
  const token = subscriberToken(id, sending === "add" && ticker ? addPurpose(ticker) : "confirm");
  const email = token
    ? buildSubscriberConfirmEmail({
        tickers: doc.tickers,
        confirmUrl: confirmUrl(id, token, ticker ?? undefined),
        add: ticker ?? undefined,
      })
    : null;
  const sent = email ? await (deps.send ?? sendTransactionalEmail)(input.email, email.subject, email.html, email.text) : false;
  if (!sent) {
    // Not sent: give the claim back, so the next try within 24 hours can send it.
    const field = sending === "add" ? "add_sent_at" : "confirm_sent_at";
    await docRef.set({ [field]: previousSentAt }, { merge: true }).catch(() => undefined);
    console.warn(`[email-capture] ${sending} email not sent for ${id.slice(0, 8)}${token ? "" : " (no EMAIL_UNSUBSCRIBE_SECRET)"}`);
  }
  return { status: "stored", confirmSent: sending === "confirm" && sent, addSent: sending === "add" && sent, id };
}

export type AddState = "added" | "already" | "linked" | "missing";

/**
 * The signed "add NVDA?" link was opened: the stock joins the list (up to MAX_SUBSCRIBER_TICKERS). The click proves
 * the inbox wants the email, so a record stopped since the link went out starts again, as a confirmation does.
 */
export async function addSubscriberTicker(id: string, ticker: string, deps: Pick<Deps, "db" | "now"> = {}): Promise<{ state: AddState; tickers: string[] }> {
  const db = deps.db ?? adminFirestore;
  const stamp = new Date(deps.now ?? Date.now()).toISOString();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref(db, id));
    if (!snap.exists) return { state: "missing" as const, tickers: [] };
    const doc = (snap.data() ?? {}) as Partial<SubscriberDoc>;
    const current = mergeTickers(doc.tickers, null);
    if (doc.linked_uid) return { state: "linked" as const, tickers: current };
    const tickers = mergeTickers(current, ticker);
    const changed = tickers.length !== current.length || !doc.confirmed_at || Boolean(doc.unsubscribed_at);
    if (!changed) return { state: "already" as const, tickers };
    tx.set(ref(db, id), { tickers, confirmed_at: doc.confirmed_at ?? stamp, unsubscribed_at: null, updated_at: stamp }, { merge: true });
    return { state: "added" as const, tickers };
  });
}

export type ConfirmState = "confirmed" | "already" | "linked" | "missing";

/** The signed link was opened: the record now gets the morning email (a stopped one starts again). */
export async function confirmSubscriber(id: string, deps: Pick<Deps, "db" | "now"> = {}): Promise<{ state: ConfirmState; tickers: string[] }> {
  const db = deps.db ?? adminFirestore;
  const stamp = new Date(deps.now ?? Date.now()).toISOString();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref(db, id));
    if (!snap.exists) return { state: "missing" as const, tickers: [] };
    const doc = (snap.data() ?? {}) as Partial<SubscriberDoc>;
    const tickers = Array.isArray(doc.tickers) ? doc.tickers : [];
    if (doc.linked_uid) return { state: "linked" as const, tickers };
    if (doc.confirmed_at && !doc.unsubscribed_at) return { state: "already" as const, tickers };
    tx.set(ref(db, id), { confirmed_at: doc.confirmed_at ?? stamp, unsubscribed_at: null, updated_at: stamp }, { merge: true });
    return { state: "confirmed" as const, tickers };
  });
}

/** Stop (or, with `resume`, start again) the morning email for a record. False when there is no such record. */
export async function setSubscriberStopped(id: string, stopped: boolean, deps: Pick<Deps, "db" | "now"> = {}): Promise<boolean> {
  const db = deps.db ?? adminFirestore;
  const stamp = new Date(deps.now ?? Date.now()).toISOString();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref(db, id));
    if (!snap.exists) return false;
    const doc = (snap.data() ?? {}) as Partial<SubscriberDoc>;
    if (stopped && doc.unsubscribed_at) return true;
    if (!stopped && !doc.unsubscribed_at) return true;
    tx.set(ref(db, id), { unsubscribed_at: stopped ? stamp : null, updated_at: stamp }, { merge: true });
    return true;
  });
}

/**
 * A new account with this address: the record is linked to it (the subscriber mail stops; the account's own mail
 * takes over), and a confirmed, active record hands over its tickers, the first `limit` of them, to seed the
 * account's stocks. Returns those tickers (empty when there is nothing to seed).
 */
export async function linkSubscriberToAccount(
  input: { uid: string; email: string; limit: number },
  deps: Pick<Deps, "db" | "now"> = {},
): Promise<string[]> {
  const db = deps.db ?? adminFirestore;
  const stamp = new Date(deps.now ?? Date.now()).toISOString();
  const id = subscriberId(input.email);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref(db, id));
    if (!snap.exists) return [];
    const doc = (snap.data() ?? {}) as Partial<SubscriberDoc>;
    if (doc.linked_uid) return [];
    const seed = seedTickers(doc, input.limit);
    tx.set(ref(db, id), { linked_uid: input.uid, linked_at: stamp, updated_at: stamp }, { merge: true });
    return seed;
  });
}

/** Counts for the Signups tab of /admin/analytics. Reads only the dates, never an address. */
export type SubscriberCounts = { total: number; confirmed: number; waiting: number; linked: number; stopped: number; week: number };

export function countSubscribers(rows: ReadonlyArray<Partial<SubscriberDoc>>, now: number): SubscriberCounts {
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const out: SubscriberCounts = { total: 0, confirmed: 0, waiting: 0, linked: 0, stopped: 0, week: 0 };
  for (const row of rows) {
    out.total += 1;
    const created = row.created_at ? Date.parse(row.created_at) : NaN;
    if (Number.isFinite(created) && created >= weekAgo) out.week += 1;
    if (row.linked_uid) out.linked += 1;
    else if (row.unsubscribed_at) out.stopped += 1;
    else if (row.confirmed_at) out.confirmed += 1;
    else out.waiting += 1;
  }
  return out;
}

export async function loadSubscriberCounts(now = Date.now(), db: typeof adminFirestore = adminFirestore): Promise<SubscriberCounts> {
  const snap = await db.collection(SUBSCRIBERS).select("created_at", "confirmed_at", "unsubscribed_at", "linked_uid").get();
  return countSubscribers(snap.docs.map((d) => (d.data() ?? {}) as Partial<SubscriberDoc>), now);
}
