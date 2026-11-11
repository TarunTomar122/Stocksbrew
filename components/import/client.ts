"use client";

import type { ImportRow } from "@/lib/import/resolve";
import type { ReadFacts } from "@/lib/import/read-shared";
import { MAX_BODY_BYTES, MAX_IMAGE_BYTES, MAX_IMAGES } from "@/lib/import/upload";

/**
 * Browser side of the import: shrinking screenshots before they are sent,
 * the calls to /api/import/*, and the list kept in this browser while a
 * signed-out visitor signs in. Nothing here is sent anywhere else.
 */

export type ParseResponse = {
  rows: ImportRow[];
  input: "image" | "text" | "csv";
  via: "rules" | "model";
  not_holdings: boolean;
  remaining: number | null;
};

export type ImportError = { code: string; message: string };

const MESSAGES: Record<string, string> = {
  too_large: "Those screenshots are too big to send together. Try two at a time.",
  image_too_large: "One screenshot is too big. Try a smaller one, or crop it to the holdings.",
  too_many_images: `Up to ${MAX_IMAGES} screenshots at a time.`,
  not_an_image: "One of the files is not a PNG, JPEG or WebP image.",
  text_too_long: "That is more text than we can read at once. Paste the holdings part only.",
  empty: "Add a screenshot or paste your holdings first.",
  limit: "You have used today's screenshot reads. Pasting text or a CSV still works, and screenshots are back tomorrow.",
  busy: "Screenshot reading is busy right now. Pasting your tickers works, or try a screenshot again in a while.",
  no_model: "Screenshot reading is not available right now. Paste your tickers or a CSV instead.",
  model_failed: "We could not read that. Try a sharper screenshot, or paste the holdings as text.",
  timeout: "Reading took too long. Try one screenshot at a time.",
  directory_unavailable: "We could not check tickers just now. Try again in a minute.",
  // /api/import/read takes up to 40 stocks (MAX_READ_STOCKS in lib/import/read.ts).
  too_many: "We read up to 40 stocks at a time. Paste the 40 you care about most and we will read those.",
  decode_failed: "We could not open that image. Try a PNG or JPEG screenshot.",
  network: "The connection dropped. Try again.",
};

export function importMessage(code: string): string {
  return MESSAGES[code] ?? "Something went wrong reading that. Try again.";
}

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // fall through to <img>, which Safari can use for HEIC
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

/**
 * A screenshot shrunk to at most 1400px wide and 3200px tall, as a JPEG. A
 * phone screenshot ends up around 300 to 700 KB, small enough for four in
 * one request, and the text stays sharp enough to read.
 */
export async function shrinkImage(file: File): Promise<Blob> {
  const image = await decode(file);
  try {
    const scale = Math.min(1, 1400 / image.width, 3200 / image.height);
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image.source, 0, 0, width, height);
    for (const quality of [0.86, 0.72, 0.6]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= MAX_IMAGE_BYTES) return blob;
    }
    throw new Error("too big");
  } finally {
    image.close();
  }
}

/** Send screenshots and/or text to be read. */
export async function parseImport(input: { files: File[]; text: string }): Promise<ParseResponse | ImportError> {
  const form = new FormData();
  let total = 0;
  for (const file of input.files.slice(0, MAX_IMAGES)) {
    let blob: Blob;
    try {
      blob = await shrinkImage(file);
    } catch {
      return { code: "decode_failed", message: importMessage("decode_failed") };
    }
    total += blob.size;
    form.append("images", blob, "screenshot.jpg");
  }
  if (total > MAX_BODY_BYTES) return { code: "too_large", message: importMessage("too_large") };
  if (input.text.trim()) form.append("text", input.text.trim());
  try {
    const res = await fetch("/api/import/parse", { method: "POST", body: form });
    const data = (await res.json().catch(() => ({}))) as Partial<ParseResponse> & { error?: string };
    if (!res.ok || !Array.isArray(data.rows)) {
      const code = data.error ?? (res.status === 413 ? "too_large" : "error");
      return { code, message: importMessage(code) };
    }
    return data as ParseResponse;
  } catch {
    return { code: "network", message: importMessage("network") };
  }
}

export type ReadResponse = ReadFacts & { unknown: string[] };

export async function fetchRead(tickers: string[]): Promise<ReadResponse | ImportError> {
  try {
    const res = await fetch("/api/import/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tickers }),
    });
    const data = (await res.json().catch(() => ({}))) as Partial<ReadResponse> & { error?: string };
    if (!res.ok || !Array.isArray(data.stocks)) return { code: data.error ?? "error", message: importMessage(data.error ?? "error") };
    return data as ReadResponse;
  } catch {
    return { code: "network", message: importMessage("network") };
  }
}

export type SaveResponse = { ok: true; added: string[]; updated: string[]; kept: string[]; covered: string[] };

/**
 * The rows that count: stocks we cover, once each. A ticker changed to one
 * already in the list keeps the first row, as shown on top; the review table
 * marks the later one as left out. The read, the counts and the save all use this.
 */
export function includedRows(rows: ImportRow[]): ImportRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (!row.instrument_id || row.status === "unknown" || seen.has(row.instrument_id)) return false;
    seen.add(row.instrument_id);
    return true;
  });
}

/** Rows ready to save: only stocks we cover, with the numbers the person reviewed. */
export function saveableRows(rows: ImportRow[]) {
  return includedRows(rows)
    .map((row) => ({
      instrument_id: row.instrument_id!,
      shares: row.shares,
      average_cost: row.average_cost,
      market_value: row.market_value,
      merge: row.merge ?? "keep",
    }));
}

const stocks = (n: number) => `${n} ${n === 1 ? "stock" : "stocks"}`;

/** What the save did, in one sentence: "Added 3 stocks and updated 1. 2 you already had stayed as they were." */
export function savedSentence(added: number, updated: number, kept: number): string {
  const did =
    added > 0
      ? `Added ${stocks(added)}${updated > 0 ? ` and updated ${updated}` : ""}.`
      : updated > 0
        ? `Updated ${stocks(updated)}.`
        : "";
  const stayed = kept > 0 ? `${did ? " " : ""}${kept === 1 ? "One you already had stayed" : `${kept} you already had stayed`} as ${kept === 1 ? "it was" : "they were"}.` : "";
  return did || stayed ? `${did}${stayed}` : "Nothing needed saving.";
}

function mutationId(): string {
  try {
    return crypto.randomUUID().replace(/-/g, "");
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }
}

/**
 * Save as holdings. A brand-new account's profile is written a moment after
 * sign-in, so "profile_not_ready" is retried a few times with the same
 * mutation id (a repeat is a no-op on the server).
 */
export async function saveImportRows(
  rows: ReturnType<typeof saveableRows>,
  source: "screenshot" | "manual",
): Promise<SaveResponse | ImportError> {
  const id = mutationId();
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const res = await fetch("/api/import/save", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-client-mutation-id": id },
        body: JSON.stringify({ rows, source }),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<SaveResponse> & { error?: string };
      if (res.ok && data.ok) return data as SaveResponse;
      if (data.error === "profile_not_ready" && attempt < 5) {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        continue;
      }
      const code = data.error ?? "error";
      return {
        code,
        message:
          code === "unauthenticated"
            ? "Your session ended. Sign in again to save."
            : code === "unknown_stocks"
              ? "One of these stocks is not one we cover. Remove it and save again."
              : "We could not save that. Try again.",
      };
    } catch {
      if (attempt < 2) continue;
      return { code: "network", message: importMessage("network") };
    }
  }
  return { code: "error", message: "We could not save that. Try again." };
}

/* ── the list kept while a signed-out visitor signs in ──────────────────── */

const PENDING_KEY = "sb_import_pending_v1";
/** A pending list older than this is dropped rather than saved by surprise. */
const PENDING_TTL_MS = 2 * 24 * 3600_000;

export type PendingImport = { rows: ImportRow[]; source: "screenshot" | "manual"; at: number };

export function writePending(rows: ImportRow[], source: "screenshot" | "manual") {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify({ rows, source, at: Date.now() } satisfies PendingImport));
  } catch {
    // storage blocked: the save still works while the page stays open
  }
}

export function readPending(): PendingImport | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as PendingImport;
    if (!Array.isArray(data.rows) || typeof data.at !== "number" || Date.now() - data.at > PENDING_TTL_MS) {
      localStorage.removeItem(PENDING_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function clearPending() {
  try {
    localStorage.removeItem(PENDING_KEY);
  } catch {
    // nothing to clear
  }
}
