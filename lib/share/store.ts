import { randomBytes } from "node:crypto";

import { adminFirestore } from "@/lib/firebase-admin";

import { MAX_SHARES_PER_USER, SHARE_COLLECTION, isShareId, isShareKind, type ShareBars, type ShareCard, type ShareLine, type ShareOptions, type ShareTone } from "./types";

/**
 * Share snapshots: `tm_portfolio_shares/{shareId}`. Only the web app writes
 * here, one new document per share, and only the owner can delete one. The
 * owner's uid is stored to check that delete and is never sent to a browser:
 * the public reader below returns the card and its date, nothing else.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** 12 characters from the 62 above, without modulo bias. */
export function newShareId(): string {
  let out = "";
  while (out.length < 12) {
    for (const byte of randomBytes(24)) {
      if (byte >= 248) continue; // 248 = 62 * 4: keep the draw uniform
      out += ALPHABET[byte % 62];
      if (out.length === 12) break;
    }
  }
  return out;
}

export type StoredShare = {
  id: string;
  card: ShareCard;
  options: ShareOptions;
  createdAt: string;
};

const str = (value: unknown): string => (typeof value === "string" ? value : "");
const tone = (value: unknown): ShareTone => (value === "up" || value === "down" ? value : "flat");

function readLines(value: unknown): ShareLine[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((raw) => (raw && typeof raw === "object" ? { text: str((raw as Record<string, unknown>).text), tone: tone((raw as Record<string, unknown>).tone) } : null))
    .filter((line): line is ShareLine => Boolean(line && line.text))
    .slice(0, 2);
}

function readBars(value: unknown): ShareBars | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const style = raw.style === "share" || raw.style === "versus" || raw.style === "months" ? raw.style : null;
  if (!style || !Array.isArray(raw.rows)) return null;
  const rows = raw.rows
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      const v = typeof r.value === "number" && Number.isFinite(r.value) ? r.value : null;
      if (v === null) return null;
      return { label: str(r.label), value: v, display: typeof r.display === "string" ? r.display : null, tone: tone(r.tone), highlight: r.highlight === true };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .slice(0, 12);
  return rows.length > 0 ? { title: str(raw.title), style, rows } : null;
}

/** A stored card, or null when the document is missing a required part. */
export function readCard(value: unknown): ShareCard | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.v !== 1 || !isShareKind(raw.kind) || !str(raw.headline)) return null;
  return {
    v: 1,
    kind: raw.kind,
    cardId: str(raw.cardId),
    topic: str(raw.topic),
    headline: str(raw.headline),
    lines: readLines(raw.lines),
    bars: readBars(raw.bars),
    footnote: str(raw.footnote),
    asOf: str(raw.asOf),
  };
}

/** The public view of a share: the card and when it was made. Never the owner. */
export async function readShare(id: string): Promise<StoredShare | null> {
  if (!isShareId(id)) return null;
  const snap = await adminFirestore.collection(SHARE_COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  const data = (snap.data() ?? {}) as Record<string, unknown>;
  const card = readCard(data.card);
  if (!card) return null;
  return {
    id,
    card,
    options: { hideNames: data.hide_names === true, showAmounts: data.show_amounts === true },
    createdAt: str(data.created_at),
  };
}

/** Whether `uid` made this share. Server-only; the answer is a yes or no, never the uid. */
export async function isShareOwner(id: string, uid: string | null | undefined): Promise<boolean> {
  if (!uid || !isShareId(id)) return false;
  const snap = await adminFirestore.collection(SHARE_COLLECTION).doc(id).get();
  return snap.exists && (snap.data() as Record<string, unknown> | undefined)?.owner_uid === uid;
}

export type ShareListRow = { id: string; kind: string; headline: string; createdAt: string };

export async function listShares(uid: string): Promise<ShareListRow[]> {
  const snap = await adminFirestore.collection(SHARE_COLLECTION).where("owner_uid", "==", uid).get();
  const rows: ShareListRow[] = [];
  for (const doc of snap.docs) {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    const card = readCard(data.card);
    if (!card) continue;
    rows.push({ id: doc.id, kind: card.kind, headline: card.headline, createdAt: str(data.created_at) });
  }
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export type CreateResult = { ok: true; id: string } | { ok: false; error: "too_many" | "write_failed" };

/**
 * Saves a new snapshot under a fresh id. `create` refuses an id that exists,
 * so nothing is ever overwritten. A store call that times out may still have
 * landed, so a failed write is read back before trying again, and the retry
 * reuses the same id: one press never leaves two copies behind.
 */
export async function createShare(uid: string, card: ShareCard, options: ShareOptions, now = new Date()): Promise<CreateResult> {
  const mine = await listShares(uid);
  if (mine.length >= MAX_SHARES_PER_USER) return { ok: false, error: "too_many" };
  let id = newShareId();
  const createdAt = now.toISOString();
  const doc = () => ({
    id,
    owner_uid: uid,
    kind: card.kind,
    card_id: card.cardId,
    card,
    hide_names: options.hideNames,
    show_amounts: options.showAmounts,
    created_at: createdAt,
    version: 1,
  });
  // Two tries at most: each store call can take up to its own timeout, and the route has a time limit.
  for (let attempt = 0; attempt < 2; attempt++) {
    const ref = adminFirestore.collection(SHARE_COLLECTION).doc(id);
    try {
      await ref.create(doc());
      return { ok: true, id };
    } catch (error) {
      console.warn("[share] create failed:", error instanceof Error ? error.message : error);
      const landed = await ref.get().catch(() => null);
      if (!landed) continue; // cannot tell yet; try the same id again
      if (!landed.exists) continue;
      const data = (landed.data() ?? {}) as Record<string, unknown>;
      if (data.owner_uid === uid && data.created_at === createdAt) return { ok: true, id };
      id = newShareId(); // someone else's document under this id: draw another
    }
  }
  return { ok: false, error: "write_failed" };
}

export type DeleteResult = "deleted" | "not_found" | "not_owner";

/** Deletes a share when `uid` made it. Nothing else is touched. */
export async function deleteShare(id: string, uid: string): Promise<DeleteResult> {
  if (!isShareId(id)) return "not_found";
  const ref = adminFirestore.collection(SHARE_COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return "not_found";
  if ((snap.data() as Record<string, unknown> | undefined)?.owner_uid !== uid) return "not_owner";
  await ref.delete();
  return "deleted";
}
