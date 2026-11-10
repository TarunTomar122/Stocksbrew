/**
 * A person's own saved screens. Stored on their user doc as
 * `saved_screens: [{ id, name, query, created_at }]`, where `query` is the
 * canonical screener query string, so a saved screen is exactly a link.
 *
 * Pure: the API route and the page both use these to read and validate.
 */

import { countActiveFilters, hasCallFilters, parseView, viewToQuery } from "@/lib/screener-shared";

export type SavedScreen = { id: string; name: string; query: string; created_at: string };

/** Hard ceiling for any plan, so a user doc cannot grow without bound. */
export const SAVED_SCREENS_MAX = 40;
export const SAVED_SCREEN_NAME_MAX = 60;

export function readSavedScreens(raw: unknown): SavedScreen[] {
  if (!Array.isArray(raw)) return [];
  const out: SavedScreen[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    if (typeof entry.id !== "string" || typeof entry.name !== "string" || typeof entry.query !== "string") continue;
    if (!entry.id || !entry.name.trim()) continue;
    out.push({
      id: entry.id,
      name: entry.name.trim().slice(0, SAVED_SCREEN_NAME_MAX),
      query: entry.query,
      created_at: typeof entry.created_at === "string" ? entry.created_at : "",
    });
    if (out.length >= SAVED_SCREENS_MAX) break;
  }
  return out;
}

export type SavedScreenInput =
  | { ok: true; name: string; query: string; usesCall: boolean }
  | { ok: false; error: "invalid_name" | "empty_screen" };

/**
 * Validate what the browser sent. The query is re-parsed and re-written, so
 * only parameters the screener understands are ever stored.
 */
export function cleanSavedScreenInput(nameRaw: unknown, queryRaw: unknown): SavedScreenInput {
  const name = typeof nameRaw === "string" ? nameRaw.replace(/\s+/g, " ").trim() : "";
  if (!name || name.length > SAVED_SCREEN_NAME_MAX) return { ok: false, error: "invalid_name" };
  const text = typeof queryRaw === "string" ? queryRaw.replace(/^\?/, "").slice(0, 2000) : "";
  const view = parseView(new URLSearchParams(text));
  if (view.preset === null && countActiveFilters(view.filters) === 0) return { ok: false, error: "empty_screen" };
  // A saved screen is always the table, never the sector map.
  const query = viewToQuery({ ...view, tab: "screen" });
  return { ok: true, name, query, usesCall: hasCallFilters(view.filters) };
}

export function savedScreenHref(screen: Pick<SavedScreen, "query">): string {
  return screen.query ? `/screener?${screen.query}` : "/screener";
}
