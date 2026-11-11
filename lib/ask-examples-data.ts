import { readUIMessageStream } from "ai";

import type { AskUIMessage } from "@/lib/ask-cards";
import { askContext } from "@/lib/ask-context";
import { storableMessages } from "@/lib/ask-data";
import {
  ASK_EXAMPLES_COLLECTION,
  type AskExampleStore,
  type AskExampleSubject,
} from "@/lib/ask-examples";
import type { AskModel } from "@/lib/ask-llm";
import { askUIStream, textOf } from "@/lib/ask-pipeline";
import { buildAskTools } from "@/lib/ask-tools";
import { earliestBacktestStart } from "@/lib/backtest/gated";
import { canSeeLevels, type Viewer } from "@/lib/entitlements-server";
import { adminFirestore } from "@/lib/firebase-admin";
import { getSeoStockPage } from "@/lib/seo/stock-pages";

/**
 * Server side of the example answers (lib/ask-examples.ts): the document store, the catalog check, and the writer,
 * which is the Ask pipeline itself (lib/ask-pipeline.ts) run for a signed-out visitor with no conversation behind it.
 *
 * Writes are additive and only touch `tm_ask_examples`.
 */

export const askExampleStore: AskExampleStore = {
  async get(docId) {
    const snap = await adminFirestore.collection(ASK_EXAMPLES_COLLECTION).doc(docId).get();
    return snap.exists ? (snap.data() as never) : null;
  },
  async set(docId, doc) {
    // The store holds JSON. Round-tripping drops undefined values, which it rejects.
    await adminFirestore.collection(ASK_EXAMPLES_COLLECTION).doc(docId).set(JSON.parse(JSON.stringify(doc)));
  },
  async transact(docIds, update) {
    const refs = docIds.map((id) => adminFirestore.collection(ASK_EXAMPLES_COLLECTION).doc(id));
    return adminFirestore.runTransaction(async (tx) => {
      const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
      const { writes, result } = update(snaps.map((snap) => (snap.exists ? (snap.data() as never) : null)));
      for (const [id, doc] of writes) tx.set(adminFirestore.collection(ASK_EXAMPLES_COLLECTION).doc(id), JSON.parse(JSON.stringify(doc)));
      return result;
    });
  },
};

/** Stocks in our catalog: the ones with a stock page. */
export function isCataloguedTicker(ticker: string): boolean {
  return getSeoStockPage(ticker) !== null;
}

/** Who an example is written for: a signed-out visitor, so it holds only what a signed-out page may show. */
const SIGNED_OUT: Viewer = { uid: null, signedIn: false, isSubscribed: false, plan: "anon", tracked: [], covered: [], coverage: null, trialEligible: false };

/** The longest an example may take to write before it is given up (the route's limit is 60 seconds). */
const WRITE_TIMEOUT_MS = 50_000;

/**
 * Write one example with the Ask pipeline, as a signed-out visitor asking the question from that page: on a stock,
 * the stock is opened first, exactly as the panel does for a question asked there. Returns the finished answer,
 * the same message the panel draws. Throws when nothing usable came back.
 */
export async function writeAskExample(subject: AskExampleSubject, question: string, now: Date, llm: AskModel): Promise<AskUIMessage> {
  const tools = buildAskTools({
    uid: null,
    isPro: false,
    now,
    levels: (ticker) => canSeeLevels(SIGNED_OUT, ticker),
    earliestBacktestStart: earliestBacktestStart(SIGNED_OUT.plan, now),
    viewer: null,
  });
  const context = subject.kind === "stock" ? askContext("stock", { ticker: subject.ticker }) : null;
  const messages: AskUIMessage[] = [{ id: "example-question", role: "user", parts: [{ type: "text", text: question }] }];
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), WRITE_TIMEOUT_MS);
  let last: AskUIMessage | null = null;
  let failed = false;
  try {
    const stream = askUIStream({ messages, context, signedIn: false, isPro: false, llm, tools, now, abortSignal: abort.signal });
    for await (const message of readUIMessageStream<AskUIMessage>({
      stream,
      onError: () => {
        failed = true;
      },
    })) {
      last = message;
    }
  } finally {
    clearTimeout(timer);
  }
  if (failed || abort.signal.aborted || !last || !textOf(last)) throw new Error("The example answer did not finish.");
  const [kept] = storableMessages([{ ...last, id: `example-${subject.kind === "stock" ? subject.ticker : "market"}` }]) as AskUIMessage[];
  if (!kept) throw new Error("The example answer had nothing to keep.");
  return kept;
}
