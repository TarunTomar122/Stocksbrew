import { contextQuestion } from "@/lib/ask-context";
import type { AskUIMessage } from "@/lib/ask-cards";

/**
 * Example answers for signed-out visitors: one real Ask answer a day per stock (and one for the market), to the
 * first question the panel suggests there, so a visitor sees what Ask does before being asked to sign in.
 *
 * An answer is written by the actual Ask pipeline (same tools, numbers check and sources) the first time someone
 * opens the panel on that stock that day, then kept in `tm_ask_examples` and shown to everyone else. A daily cap
 * bounds what that can cost. Nothing here runs on page load: the panel asks for an example after it opens
 * (components/ask/ask-workspace.tsx), and the cached signed-out pages never import this.
 *
 * Pure: the store and the writer are passed in, so the same code runs against the document store and a Map in tests.
 * No server imports, so the panel reads the subject rules from here too.
 */

export const ASK_EXAMPLES_COLLECTION = "tm_ask_examples";
/** New example answers written per New York day, across every stock. Each one is a model call; a cached one is not. */
export const ASK_EXAMPLES_DAILY_CAP = 300;
/**
 * New examples one visitor (a hash of their address) can set off in a day. Reading kept ones is never limited. Without
 * it, one script could spend the whole day's cap and leave everyone else without examples.
 */
export const ASK_EXAMPLES_PER_CLIENT = 10;
/** An answer still being written after this long is treated as abandoned (the route gives up at 60 seconds). */
export const ASK_EXAMPLE_STALE_MS = 90_000;
/** After a failed write, wait this long before trying the same example again. */
export const ASK_EXAMPLE_RETRY_MS = 15 * 60_000;

export const MARKET_EXAMPLE_QUESTION = "What is moving the market today, and why?";

export type AskExampleSubject = { kind: "stock"; ticker: string } | { kind: "market" };

const TICKER = /^[A-Z][A-Z0-9.-]{0,9}$/;

/** "stock:NVDA" or "market". Null for anything else. */
export function parseExampleSubject(raw: unknown): AskExampleSubject | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (text === "market") return { kind: "market" };
  const match = /^stock:([A-Za-z0-9.-]{1,10})$/.exec(text);
  const ticker = match?.[1]?.toUpperCase();
  return ticker && TICKER.test(ticker) ? { kind: "stock", ticker } : null;
}

export function formatExampleSubject(subject: AskExampleSubject): string {
  return subject.kind === "market" ? "market" : `stock:${subject.ticker}`;
}

/**
 * The example a page offers. Stock pages (and a stock's research and earnings pages) give that stock; Today and the
 * market pages give the market. Same rules as the panel's starting item (lib/ask-page-context.ts), from its result.
 */
export function pageExampleSubject(input: { pathname: string; pageContext: string | null }): AskExampleSubject | null {
  const stock = /^(?:stock|research):([A-Z][A-Z0-9.-]{0,9})(?::|$)/.exec(input.pageContext ?? "");
  if (stock) return { kind: "stock", ticker: stock[1]! };
  const first = input.pathname.split("/").filter(Boolean)[0];
  if (first === "briefing" || first === "markets") return { kind: "market" };
  return null;
}

/** The question an example answers: the panel's first suggestion for that page. */
export function exampleQuestion(subject: AskExampleSubject): string {
  return subject.kind === "market" ? MARKET_EXAMPLE_QUESTION : contextQuestion({ kind: "stock", ticker: subject.ticker, id: null, day: null, example: false });
}

/** The New York day, YYYY-MM-DD: an example is "today's" on the market's calendar. */
export function exampleDay(now: Date): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

/** A short, stable hash of the question, so a reworded question gets its own example. FNV-1a, 32 bits. */
export function questionHash(question: string): string {
  let hash = 0x811c9dc5;
  for (const char of question.trim().toLowerCase()) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/** One doc per subject, day and question: `stock_NVDA__2026-11-11__1x2y3z`. */
export function exampleDocId(subject: AskExampleSubject, day: string, question: string): string {
  const who = subject.kind === "market" ? "market" : `stock_${subject.ticker.replace(/[^A-Z0-9]/g, "_")}`;
  return `${who}__${day}__${questionHash(question)}`;
}

/** The day's counter of answers written, in the same collection. */
export function capDocId(day: string): string {
  return `cap__${day}`;
}

/** One visitor's counter for the day. The key is already a hash; the address itself is never stored. */
export function clientDocId(key: string, day: string): string {
  return `client__${key.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80)}__${day}`;
}

export type AskExampleDoc = {
  kind: "example";
  subject: string;
  ticker: string | null;
  day: string;
  question: string;
  status: "generating" | "ready" | "failed";
  started_at: string;
  /** Ready only: when the answer was finished. */
  generated_at?: string | null;
  /** Ready only: the answer, the same message the panel draws for a question someone asked. */
  message?: AskUIMessage | null;
  failed_at?: string | null;
};

export type AskExampleCapDoc = { kind: "cap"; day: string; count: number; updated_at: string };

type AnyDoc = Partial<AskExampleDoc> | Partial<AskExampleCapDoc>;

/** What the store needs to do: read one doc, and read several then write some without another writer in between. */
export interface AskExampleStore {
  get(docId: string): Promise<AnyDoc | null>;
  set(docId: string, doc: AskExampleDoc): Promise<void>;
  transact<T>(docIds: string[], update: (current: Array<AnyDoc | null>) => { writes: Array<[string, AnyDoc]>; result: T }): Promise<T>;
}

/** A finished example, as the panel gets it. */
export type AskExample = {
  subject: string;
  day: string;
  question: string;
  generated_at: string;
  message: AskUIMessage;
};

export type AskExampleResult =
  | { status: "ready"; example: AskExample }
  /** Someone else's request is writing it right now: ask again in a few seconds. */
  | { status: "pending" }
  /** Not for this page (not in our catalog), over the day's cap, failed a moment ago, or no model on this server. */
  | { status: "unavailable"; reason: "not_covered" | "cap" | "client_cap" | "failed" | "no_model" | "store" };

/** The answer itself, written by the Ask pipeline. Throws when it could not be written. */
export type ExampleWriter = (subject: AskExampleSubject, question: string, now: Date) => Promise<AskUIMessage>;

function readyExample(doc: Partial<AskExampleDoc>): AskExample | null {
  if (doc.status !== "ready" || !doc.message || !Array.isArray(doc.message.parts) || typeof doc.generated_at !== "string") return null;
  return { subject: String(doc.subject ?? ""), day: String(doc.day ?? ""), question: String(doc.question ?? ""), generated_at: doc.generated_at, message: doc.message };
}

function age(stamp: unknown, now: Date): number {
  const at = typeof stamp === "string" ? Date.parse(stamp) : NaN;
  return Number.isFinite(at) ? now.getTime() - at : Number.POSITIVE_INFINITY;
}

/** What a stored doc means right now: an answer, one being written, a recent failure, or nothing (free to write). */
function stateOf(doc: Partial<AskExampleDoc> | null, now: Date): AskExampleResult | null {
  if (!doc) return null;
  const ready = readyExample(doc);
  if (ready) return { status: "ready", example: ready };
  if (doc.status === "generating" && age(doc.started_at, now) < ASK_EXAMPLE_STALE_MS) return { status: "pending" };
  if (doc.status === "failed" && age(doc.failed_at, now) < ASK_EXAMPLE_RETRY_MS) return { status: "unavailable", reason: "failed" };
  return null;
}

/**
 * Today's example for a subject. A stored one comes back as is. With none, the first caller claims it (counting one
 * against the day's cap, in the same transaction that marks it as being written), writes it with the Ask pipeline and
 * keeps it; anyone arriving meanwhile is told to ask again shortly. A subject outside the catalog never reaches the
 * writer, and neither does anything past the cap.
 */
export async function getAskExample(
  subject: AskExampleSubject,
  deps: {
    store: AskExampleStore;
    write: ExampleWriter;
    /** Whether a stock is one we cover (our catalog). */
    isCatalogued: (ticker: string) => boolean;
    /** Who is asking (a hash), for the per-visitor limit on new examples. */
    client?: string | null;
    now?: Date;
    cap?: number;
    perClient?: number;
  },
): Promise<AskExampleResult> {
  const now = deps.now ?? new Date();
  const cap = deps.cap ?? ASK_EXAMPLES_DAILY_CAP;
  const perClient = deps.perClient ?? ASK_EXAMPLES_PER_CLIENT;
  if (subject.kind === "stock" && !deps.isCatalogued(subject.ticker)) return { status: "unavailable", reason: "not_covered" };
  const day = exampleDay(now);
  const question = exampleQuestion(subject);
  const docId = exampleDocId(subject, day, question);

  const existing = stateOf((await deps.store.get(docId)) as Partial<AskExampleDoc> | null, now);
  if (existing) return existing;

  const clientId = deps.client ? clientDocId(deps.client, day) : null;
  const ids = clientId ? [docId, capDocId(day), clientId] : [docId, capDocId(day)];
  const countOf = (counter: AnyDoc | null) =>
    counter && (counter as Partial<AskExampleCapDoc>).day === day ? Number((counter as Partial<AskExampleCapDoc>).count) || 0 : 0;
  const claimed = await deps.store.transact<AskExampleResult | "claimed">(ids, ([doc, counter, visitor]) => {
    const state = stateOf(doc as Partial<AskExampleDoc> | null, now);
    if (state) return { writes: [], result: state };
    const used = countOf(counter ?? null);
    if (used >= cap) return { writes: [], result: { status: "unavailable", reason: "cap" } };
    const theirs = clientId ? countOf(visitor ?? null) : 0;
    if (clientId && theirs >= perClient) return { writes: [], result: { status: "unavailable", reason: "client_cap" } };
    const stamp = now.toISOString();
    const marker: AskExampleDoc = {
      kind: "example",
      subject: formatExampleSubject(subject),
      ticker: subject.kind === "stock" ? subject.ticker : null,
      day,
      question,
      status: "generating",
      started_at: stamp,
      generated_at: null,
      message: null,
      failed_at: null,
    };
    const count: AskExampleCapDoc = { kind: "cap", day, count: used + 1, updated_at: stamp };
    const writes: Array<[string, AnyDoc]> = [[docId, marker], [capDocId(day), count]];
    if (clientId) writes.push([clientId, { kind: "cap", day, count: theirs + 1, updated_at: stamp }]);
    return { writes, result: "claimed" };
  });
  if (claimed !== "claimed") return claimed;

  const base: AskExampleDoc = {
    kind: "example",
    subject: formatExampleSubject(subject),
    ticker: subject.kind === "stock" ? subject.ticker : null,
    day,
    question,
    status: "generating",
    started_at: now.toISOString(),
  };
  let message: AskUIMessage;
  try {
    message = await deps.write(subject, question, now);
  } catch (error) {
    console.error("ask_example_failed", error);
    // Marked failed, so the next visitors do not each pay for another try straight away.
    await deps.store.set(docId, { ...base, status: "failed", failed_at: now.toISOString() }).catch(() => undefined);
    return { status: "unavailable", reason: "failed" };
  }
  const generated_at = new Date().toISOString();
  // A failed save still shows this visitor the answer they waited for; the claim goes stale and the next one rewrites it.
  await deps.store.set(docId, { ...base, status: "ready", generated_at, message, failed_at: null }).catch((error) => console.error("ask_example_save_failed", error));
  return { status: "ready", example: { subject: base.subject, day, question, generated_at, message } };
}

/** An in-memory store for tests. */
export function memoryAskExampleStore(seed: Record<string, AnyDoc> = {}): AskExampleStore & { docs: Map<string, AnyDoc> } {
  const docs = new Map<string, AnyDoc>(Object.entries(seed));
  return {
    docs,
    async get(docId) {
      return docs.get(docId) ?? null;
    },
    async set(docId, doc) {
      docs.set(docId, structuredClone(doc));
    },
    async transact(docIds, update) {
      const { writes, result } = update(docIds.map((id) => docs.get(id) ?? null));
      for (const [id, doc] of writes) docs.set(id, structuredClone(doc));
      return result;
    },
  };
}
