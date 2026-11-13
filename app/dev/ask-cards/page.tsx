import { notFound } from "next/navigation";

import { interTight } from "@/components/oa/font";
import type { AskCard } from "@/lib/ask-cards";
import { basketCard, basketsCard, filingChangesCard, watchIdeaCard } from "@/lib/ask-tools-ideas";
import { getSessionUser } from "@/lib/auth-server";
import { getViewer } from "@/lib/entitlements-server";

import { CardsPreview } from "./view";

export const dynamic = "force-dynamic";

/**
 * Local preview of Ask's filing-change and idea-basket cards on real data, drawn by the same components as /ask.
 * ?tickers=AMD,LLY picks the filing cards; signed in, ?basket=<id> adds that basket and the list. Not built in
 * production (app/dev/layout.tsx).
 */
export default async function AskCardsPreviewPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const now = new Date();
  const tickers = (searchParams.tickers ?? "AMD").split(",").map((ticker) => ticker.trim()).filter(Boolean).slice(0, 4);
  const session = await getSessionUser().catch(() => null);
  const viewer = session ? await getViewer().catch(() => null) : null;
  const context = { uid: session?.uid ?? null, viewer, now };
  const cards: AskCard[] = [];
  for (const ticker of tickers) cards.push(await filingChangesCard(ticker, now));
  if (searchParams.watch !== "0") cards.push(await watchIdeaCard(context, { idea: "AI data centre spending keeps growing", tickers: ["NVDA", "AVGO", "VRT", "ANET", "CEG"] }));
  if (session) {
    cards.push(await basketsCard(context));
    if (searchParams.basket) cards.push(await basketCard(context, { basket_id: searchParams.basket }));
  }
  return (
    <main className={`oa-landing ${interTight.variable} min-h-screen min-w-0 bg-oa-page`}>
      <div className="mx-auto w-full max-w-[46rem] px-4 py-6 sm:px-6">
        <CardsPreview cards={cards} signedIn={Boolean(session)} />
      </div>
    </main>
  );
}
