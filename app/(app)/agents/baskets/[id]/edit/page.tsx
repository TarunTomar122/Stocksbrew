import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { BasketEditor } from "@/components/basket-agent/basket-editor";
import { AppPage, PageHead } from "@/components/oa/kit";
import { agentMarketDay } from "@/lib/agent-jobs-data";
import { getSessionUser } from "@/lib/auth-server";
import { candidatesFor, getBasket, quotesFor } from "@/lib/basket-agent/data";
import { shortsFor } from "@/lib/basket-agent/start";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Edit idea basket",
  robots: { index: false },
};

export default async function EditBasketPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getSessionUser().catch(() => null);
  if (!session) redirect(`/agents/baskets/${encodeURIComponent(params.id)}`);
  const basket = await getBasket(session.uid, params.id);
  if (!basket) notFound();
  // A thesis over holdings is edited as a thesis: its companies follow its lines.
  if (basket.source.kind === "holdings")
    redirect(`/agents/theses/${encodeURIComponent(basket.id)}/edit`);
  const tickers = basket.lines.map((line) => line.ticker);
  // No screens here (no slow read): the theme and theme matches are enough to suggest from. Prices for both.
  const candidates = await candidatesFor(basket, { screens: false }).catch(
    () => [],
  );
  const quotes = await quotesFor([
    ...tickers,
    ...candidates.map((candidate) => candidate.ticker),
  ]);
  const taken = new Set(tickers);
  return (
    <AppPage width="wide" className="max-w-[68rem]">
      <PageHead title="Edit basket" />
      <BasketEditor
        basketId={basket.id}
        version={basket.version}
        initial={{
          name: basket.name,
          idea: basket.idea,
          source: basket.source,
          lines: basket.lines.map(({ ticker, company, kind, reason }) => ({
            ticker,
            company,
            kind,
            reason,
          })),
        }}
        suggestions={candidates.filter(
          (candidate) => !taken.has(candidate.ticker),
        )}
        quotes={quotes}
        signedIn
        today={agentMarketDay()}
        shorts={shortsFor([
          ...tickers,
          ...candidates.map((candidate) => candidate.ticker),
        ])}
      />
    </AppPage>
  );
}
