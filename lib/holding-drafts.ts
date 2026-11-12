/**
 * What "Add or edit stocks" saves (components/radar-batch-edit-modal.tsx), the one place a person edits their stocks.
 * Pure, so the rules can be tested:
 * - a Shares or Avg cost box left alone keeps the saved number;
 * - a box emptied clears it (saved as null), as the old row editor did ("Leave a field empty to clear it");
 * - a box with something that is not a usable number (text, a negative, an absurd size) is an error on that box and
 *   nothing is saved until it is fixed;
 * - every stock can be removed, but a save that would leave the list empty asks first.
 */

export type PositionType = "holding" | "watchlist";

export type DraftHolding = {
  quantity?: number | null;
  market_value?: number | null;
  average_cost?: number | null;
};

export type DraftItem = {
  instrument_id: string;
  position_type: PositionType;
  holding?: DraftHolding;
};

/** The most shares or cost per share a box takes; the save route refuses more. */
export const MAX_HOLDING_NUMBER = 1_000_000_000;

export type DraftValue = { kind: "keep" } | { kind: "clear" } | { kind: "set"; value: number } | { kind: "invalid"; message: string };

/** One box's text: undefined when it was never touched. Commas, spaces and a currency sign are allowed. */
export function readDraft(raw: string | undefined): DraftValue {
  if (raw === undefined) return { kind: "keep" };
  const text = raw.replace(/[$₹,\s]/g, "");
  if (text === "") return { kind: "clear" };
  const value = Number(text);
  if (!Number.isFinite(value)) return { kind: "invalid", message: "Enter a number" };
  if (value < 0) return { kind: "invalid", message: "Can't be negative" };
  if (value > MAX_HOLDING_NUMBER) return { kind: "invalid", message: "That's too large" };
  return { kind: "set", value };
}

export type DraftErrors = Record<string, { shares?: string; cost?: string }>;

export type BatchPayloadItem = {
  instrument_id: string;
  position_type: PositionType;
  holding?: DraftHolding & { source: "manual" };
};

/**
 * The rows to save and any box errors. A holding's numbers are the ones its row holds now, which are what its boxes
 * show (a holding switched to Watch and back has none, so it saves none), then each touched box replaces its number: a
 * value sets it, an empty box clears it to null. A watched stock saves no holding numbers. With any error the caller
 * must not save.
 */
export function buildBatch(
  items: DraftItem[],
  shareDrafts: Record<string, string>,
  costDrafts: Record<string, string>,
): { items: BatchPayloadItem[]; errors: DraftErrors } {
  const errors: DraftErrors = {};
  const payload = items.map((item): BatchPayloadItem => {
    if (item.position_type !== "holding") return { instrument_id: item.instrument_id, position_type: item.position_type };
    const saved: DraftHolding = { ...(item.holding ?? {}) };
    const shares = readDraft(shareDrafts[item.instrument_id]);
    const cost = readDraft(costDrafts[item.instrument_id]);
    if (shares.kind === "invalid") (errors[item.instrument_id] ??= {}).shares = shares.message;
    if (cost.kind === "invalid") (errors[item.instrument_id] ??= {}).cost = cost.message;
    const holding: DraftHolding = { ...saved };
    if (shares.kind === "set") holding.quantity = shares.value;
    if (shares.kind === "clear") holding.quantity = null;
    if (cost.kind === "set") holding.average_cost = cost.value;
    if (cost.kind === "clear") holding.average_cost = null;
    const touched = shares.kind !== "keep" || cost.kind !== "keep";
    const hasAny = Object.keys(holding).length > 0;
    return {
      instrument_id: item.instrument_id,
      position_type: item.position_type,
      ...(touched || hasAny ? { holding: { ...holding, source: "manual" as const } } : {}),
    };
  });
  return { items: payload, errors };
}

/** A save that would leave no stocks at all, from a list that had some: the sheet asks before it goes through. */
export function needsEmptyConfirm(itemsCount: number, initialCount: number): boolean {
  return itemsCount === 0 && initialCount > 0;
}

/**
 * For the save route: an empty list is a real save only when the client sent an empty list on purpose (every stock
 * removed). A list whose rows were all unreadable is still refused.
 */
export function emptySaveAllowed(rawItems: unknown, normalizedCount: number): boolean {
  return normalizedCount > 0 || (Array.isArray(rawItems) && rawItems.length === 0);
}
