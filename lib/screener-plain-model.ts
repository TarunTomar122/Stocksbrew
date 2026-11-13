import { generateText, Output } from "ai";
import { z } from "zod";

import { askModel } from "@/lib/ask-llm";
import { PLAIN_SECTORS, cleanPlainScreen, normalizePlain, type PlainScreen } from "@/lib/screener-plain";
import { CALL_WORDS, CAP_TIERS, NUMERIC_FIELDS } from "@/lib/screener-shared";

/**
 * The model reader for the words the screener's rules could not place
 * (lib/screener-plain.ts). Same model and keys as Ask (lib/ask-llm.ts). It may
 * only pick fields, sectors, sizes and calls from our lists; whatever it
 * returns goes through `modelReplyToScreen`, which drops anything unknown and
 * clamps every range. It never names a stock for the table: the table is the
 * snapshot, filtered.
 */

const FIELD_IDS = NUMERIC_FIELDS.map((field) => field.id) as [string, ...string[]];
const SECTOR_IDS = PLAIN_SECTORS.map((sector) => sector.slug) as [string, ...string[]];
const CAP_IDS = CAP_TIERS.map((tier) => tier.id) as [string, ...string[]];

const SCHEMA = z.object({
  ranges: z.array(
    z.object({
      field: z.enum(FIELD_IDS),
      min: z.number().nullable(),
      max: z.number().nullable(),
    }),
  ),
  sort: z.object({ field: z.enum(FIELD_IDS), dir: z.enum(["asc", "desc"]) }).nullable(),
  sectors: z.array(z.enum(SECTOR_IDS)),
  caps: z.array(z.enum(CAP_IDS)),
  calls: z.array(z.enum(CALL_WORDS as [string, ...string[]])),
  search: z.string().nullable().describe("One industry word or a company name to search for, only when the words ask for one."),
  cannot: z.array(z.string()).describe("Words from the request that none of the fields can express, copied exactly."),
});

type ModelReply = z.infer<typeof SCHEMA>;

const UNIT_WORDS: Record<string, string> = {
  pct: "%",
  signed_pct: "% (negative is down)",
  multiple: "times",
  price: "dollars a share",
  money: "dollars (50 billion is 50000000000)",
  number: "number",
  count_change: "change in count",
  days: "days",
  score: "0 to 100",
};

const FIELD_LIST = NUMERIC_FIELDS.map((field) => `- ${field.id}: ${field.label} (${UNIT_WORDS[field.unit] ?? field.unit})`).join("\n");

const SYSTEM = `You turn the leftover words of a stock screen request into screener filters. You never write anything for a person to read, and you never name a ticker.

Fields (min and max in the field's own unit):
${FIELD_LIST}

Sectors: ${SECTOR_IDS.join(", ")}
Sizes: mega ($200B and up), large ($10B to $200B), mid ($2B to $10B), small ($300M to $2B), micro (under $300M)
Our call: Add (we'd buy more), Hold (we'd keep), Trim (we'd sell some)

Rules:
- Use only the ids above.
- Read a word as the closest field when an ordinary investor would read it that way, for example: "boring" or "safe" is a low vol_90d; "moat" or "pricing power" is a high gross_margin and roic; "buys back shares" is buyback_yield; "cash machine" is a high fcf_margin; "beaten up" is a negative from_hi_pct; "popular with funds" is a high inst_own.
- Put words in "cannot" only when no field is a fair reading: people and management, products, news, countries, the person's own holdings ("we hold", "I own", "my stocks").
- "lowest", "least", "cheapest" sort ascending; "highest", "most", "biggest" sort descending. Set at most one sort.
- Prefer a number written in the request. With none, pick a plain, common threshold for the words (for example "high yield" is div_yield min 3).
- "search" is for an industry or company the words name and no sector covers, as one word or name found in a company or industry label.
- Read only the leftover words, in the context of the whole request. Leave fields the leftover words do not ask for empty.`;

const TIMEOUT_MS = 12_000;

/** Any reply-shaped value as a screen. Lenient on purpose: one unknown field drops that field, not the whole answer. */
export function modelReplyToScreen(raw: unknown): PlainScreen {
  const reply = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof ModelReply, unknown>>;
  const ranges: Record<string, { min?: number; max?: number }> = {};
  const fields: string[] = [];
  for (const item of Array.isArray(reply.ranges) ? reply.ranges : []) {
    if (!item || typeof item !== "object") continue;
    const { field, min, max } = item as { field?: unknown; min?: unknown; max?: unknown };
    if (typeof field !== "string") continue;
    ranges[field] = { min: typeof min === "number" ? min : undefined, max: typeof max === "number" ? max : undefined };
    fields.push(field);
  }
  const sortIn = reply.sort as { field?: unknown; dir?: unknown } | null | undefined;
  const sort = sortIn && typeof sortIn.field === "string" ? { id: sortIn.field, dir: sortIn.dir === "asc" ? "asc" : "desc" } : null;
  if (sort) fields.unshift(sort.id);
  return cleanPlainScreen({
    filters: {
      q: typeof reply.search === "string" ? reply.search : "",
      sectors: reply.sectors,
      caps: reply.caps,
      calls: reply.calls,
      zones: [],
      ranges,
    },
    sort,
    fields,
    leftover: reply.cannot,
  });
}

export type PlainModelReader = (text: string, leftover: string[]) => Promise<PlainScreen>;

/** Null when no model is configured (or only the offline planner is), so the rules' reading stands. */
export function plainModelReader(): PlainModelReader | null {
  const llm = askModel();
  if (!llm || llm.via === "offline") return null;
  return async (text, leftover) => {
    const started = Date.now();
    const result = await generateText({
      model: llm.model,
      system: SYSTEM,
      prompt: `Request: ${JSON.stringify(text)}\nLeftover words: ${JSON.stringify(leftover.join(" | "))}`,
      output: Output.object({ schema: SCHEMA }),
      maxOutputTokens: 600,
      // Ask's own options (low effort, and caching on Anthropic), so this read is set up the same way.
      providerOptions: llm.providerOptions as never,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // Tokens only, never the words: enough to price a read.
    console.info("screener_plain_model", {
      via: llm.via,
      input_tokens: result.usage?.inputTokens ?? null,
      output_tokens: result.usage?.outputTokens ?? null,
      ms: Date.now() - started,
    });
    return modelReplyToScreen(result.output);
  };
}

/* ── cache ──────────────────────────────────────────────────────────────── */

const CACHE_LIMIT = 500;
const CACHE_TTL_MS = 24 * 3600 * 1000;
const cache = new Map<string, { at: number; screen: PlainScreen }>();
const inflight = new Map<string, Promise<PlainScreen>>();

export function plainCacheKey(text: string): string {
  return normalizePlain(text);
}

export function cachedPlainRead(text: string, now = Date.now()): PlainScreen | null {
  const key = plainCacheKey(text);
  const hit = cache.get(key);
  if (!hit) return null;
  if (now - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  // Refresh its place, so the oldest unused reads leave first.
  cache.delete(key);
  cache.set(key, hit);
  return hit.screen;
}

export function rememberPlainRead(text: string, screen: PlainScreen, now = Date.now()): void {
  const key = plainCacheKey(text);
  cache.delete(key);
  cache.set(key, { at: now, screen });
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

/** A read of the same sentence already under way, to wait on instead of paying for a second one. */
export function pendingPlainRead(text: string): Promise<PlainScreen> | null {
  return inflight.get(plainCacheKey(text)) ?? null;
}

/** One model read per sentence at a time: a second identical request waits for the first instead of paying again. */
export async function readOnce(text: string, read: () => Promise<PlainScreen>): Promise<PlainScreen> {
  const key = plainCacheKey(text);
  const running = inflight.get(key);
  if (running) return running;
  const promise = read()
    .then((screen) => {
      rememberPlainRead(text, screen);
      return screen;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

/** Tests only. */
export function clearPlainCache(): void {
  cache.clear();
  inflight.clear();
}
