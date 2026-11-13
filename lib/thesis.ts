/**
 * "Why do you own this?": one reason per stock, kept on the person's own
 * user doc as an additive map:
 *
 *   theses: { [instrument_id]: { kind, reason, created_at, updated_at, conditions? } }
 *
 * `conditions` (optional, at most two) are the reason's measurable lines, "Holds if revenue growth > 20%"
 * (lib/thesis-watch/conditions.ts).
 *
 * Pure (no server imports), so the question step, the row line, the route and
 * the tests share the words and the rules. The reason watcher that checks
 * each one lives in lib/thesis-watch (spec in docs/ideas.md).
 */

import { readConditions, validateConditions, type Condition } from "@/lib/thesis-watch/conditions";

export const THESIS_KINDS = ["growth", "dividend", "value", "product", "long_term", "trade"] as const;
export type ThesisKind = (typeof THESIS_KINDS)[number];

/** Quick-pick wording on the question step. */
export const THESIS_PICKS: Record<ThesisKind, string> = {
  growth: "The growth story",
  dividend: "The dividend",
  value: "It is cheap",
  product: "I believe in the product",
  long_term: "A long-term hold",
  trade: "A short-term trade",
};

/** How the reason reads back on the stock's row: "You own it for the growth story." */
export const THESIS_LINES: Record<ThesisKind, string> = {
  growth: "for the growth story",
  dividend: "for the dividend",
  value: "because it is cheap",
  product: "because you believe in the product",
  long_term: "as a long-term hold",
  trade: "as a short-term trade",
};

export const MAX_THESIS_REASON = 280;
export const MAX_THESIS_ITEMS = 50;
/** More than this many stored reasons and the doc is not growing from one person typing. */
export const MAX_THESES_PER_USER = 500;

export type Thesis = {
  kind: ThesisKind | null;
  reason: string | null;
  created_at: string;
  updated_at: string;
  /** Measurable lines the reason holds on; absent when there are none. */
  conditions?: Condition[];
};

/** `conditions` left out keeps the stored ones (the question step saves only the kind and the words); an empty list clears them. */
export type ThesisInput = { instrument_id: string; kind: ThesisKind | null; reason: string | null; conditions?: Condition[] };

const INSTRUMENT_ID_RE = /^(US|IN)_[A-Z0-9_]{1,12}$/;

export function isThesisKind(value: unknown): value is ThesisKind {
  return typeof value === "string" && (THESIS_KINDS as readonly string[]).includes(value);
}

/** Free text cleaned: whitespace collapsed, control characters dropped. Null when empty. */
export function cleanReason(value: unknown): string | null | "too_long" {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const text = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > MAX_THESIS_REASON ? "too_long" : text;
}

export type ThesisValidation =
  | { ok: true; items: ThesisInput[] }
  | { ok: false; error: "invalid_items" | "too_many" | "reason_too_long" | "empty_reason" | "invalid_conditions" | "too_many_conditions" };

/** The request's items, or why they were refused. A row needs a kind, a reason, or both. */
export function validateThesisItems(raw: unknown): ThesisValidation {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: "invalid_items" };
  if (raw.length > MAX_THESIS_ITEMS) return { ok: false, error: "too_many" };
  const byId = new Map<string, ThesisInput>();
  for (const item of raw) {
    if (!item || typeof item !== "object") return { ok: false, error: "invalid_items" };
    const row = item as Record<string, unknown>;
    const id = typeof row.instrument_id === "string" ? row.instrument_id.trim().toUpperCase() : "";
    if (!INSTRUMENT_ID_RE.test(id)) return { ok: false, error: "invalid_items" };
    if (row.kind !== undefined && row.kind !== null && !isThesisKind(row.kind)) return { ok: false, error: "invalid_items" };
    const reason = cleanReason(row.reason);
    if (reason === "too_long") return { ok: false, error: "reason_too_long" };
    const kind = isThesisKind(row.kind) ? row.kind : null;
    if (!kind && !reason) return { ok: false, error: "empty_reason" };
    let conditions: ThesisInput["conditions"];
    if (row.conditions !== undefined) {
      const checked = validateConditions(row.conditions);
      if (!checked.ok) return { ok: false, error: checked.error };
      conditions = checked.conditions;
    }
    byId.set(id, { instrument_id: id, kind, reason, ...(conditions ? { conditions } : {}) });
  }
  return { ok: true, items: [...byId.values()] };
}

/** The stored map, with anything malformed dropped. */
export function readTheses(value: unknown): Record<string, Thesis> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, Thesis> = {};
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!INSTRUMENT_ID_RE.test(id) || !raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    const kind = isThesisKind(entry.kind) ? entry.kind : null;
    const reason = typeof entry.reason === "string" && entry.reason.trim() ? entry.reason.trim() : null;
    if (!kind && !reason) continue;
    const created = typeof entry.created_at === "string" ? entry.created_at : "";
    const conditions = readConditions(entry.conditions);
    out[id] = { kind, reason, created_at: created, updated_at: typeof entry.updated_at === "string" ? entry.updated_at : created, ...(conditions.length > 0 ? { conditions } : {}) };
  }
  return out;
}

/**
 * The whole map after saving `items`: every other stock's reason is kept as
 * it was, a stock answered again keeps its first `created_at`.
 */
export function mergeTheses(current: unknown, items: ThesisInput[], now: Date): Record<string, Thesis> {
  const at = now.toISOString();
  const next = readTheses(current);
  for (const item of items) {
    const before = next[item.instrument_id];
    // Written as an empty list when cleared: a merge write keeps a nested key it is not given.
    const conditions = item.conditions !== undefined ? item.conditions : before?.conditions;
    next[item.instrument_id] = {
      kind: item.kind,
      reason: item.reason,
      created_at: before?.created_at || at,
      updated_at: at,
      ...(conditions !== undefined ? { conditions } : {}),
    };
  }
  return next;
}

/** The ids a removal request names, upper-cased and checked; null when the request is malformed. */
export function validateRemoveIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_THESIS_ITEMS) return null;
  const ids = new Set<string>();
  for (const value of raw) {
    const id = typeof value === "string" ? value.trim().toUpperCase() : "";
    if (!INSTRUMENT_ID_RE.test(id)) return null;
    ids.add(id);
  }
  return [...ids];
}

/** The whole map without `ids`; every other stock's reason is kept as it was. */
export function removeTheses(current: unknown, ids: readonly string[]): Record<string, Thesis> {
  const next = readTheses(current);
  for (const id of ids) delete next[id];
  return next;
}

/** "You own it for the growth story: AI data centres keep buying." */
export function thesisSentence(thesis: Pick<Thesis, "kind" | "reason">): string {
  const lead = thesis.kind ? `You own it ${THESIS_LINES[thesis.kind]}` : "Why you own it";
  if (!thesis.reason) return `${lead}.`;
  const reason = /[.!?]$/.test(thesis.reason) ? thesis.reason : `${thesis.reason}.`;
  return `${lead}: ${reason}`;
}
