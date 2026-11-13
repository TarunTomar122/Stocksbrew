import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { AppPage, PageHead } from "@/components/oa/kit";
import { ThesisEditor } from "@/components/thesis-monitor/thesis-editor";
import { getSessionUser } from "@/lib/auth-server";
import { getBasket, namesFor, quotesFor } from "@/lib/basket-agent/data";
import { holdingsOf, thesisHref } from "@/lib/thesis-monitor/model";
import { getUserDoc } from "@/lib/watchlist";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Edit thesis", robots: { index: false } };

/**
 * Edit a thesis: the statement and the lines. Over holdings, every holding is listed (one sold since stays while it
 * has a line); on an idea basket, the basket's companies.
 */
export default async function EditThesisPage({ params }: { params: { id: string } }) {
  const session = await getSessionUser().catch(() => null);
  if (!session) redirect(thesisHref(params.id));
  const basket = await getBasket(session.uid, params.id);
  if (!basket?.thesis) notFound();
  const holdings = basket.source.kind === "holdings";
  const inThesis = basket.thesis.lines.map((line) => line.ticker);
  const tickers = holdings
    ? [...new Set([...inThesis, ...holdingsOf(await getUserDoc(session.uid).catch(() => null))])]
    : basket.lines.map((line) => line.ticker);
  const known = Object.fromEntries(basket.lines.map((line) => [line.ticker, line.company]));
  const [names, quotes] = await Promise.all([namesFor(tickers.filter((ticker) => !known[ticker])), quotesFor(tickers)]);
  return (
    <AppPage width="wide" className="max-w-[68rem]">
      <PageHead title="Edit thesis" />
      <ThesisEditor
        mode={holdings ? "holdings" : "basket"}
        basketId={basket.id}
        version={basket.thesis.version}
        initial={{ name: basket.name, statement: basket.thesis.statement, lines: basket.thesis.lines }}
        companies={tickers.map((ticker) => ({ ticker, company: known[ticker] ?? names[ticker] ?? null, quote: quotes[ticker] ?? null }))}
      />
    </AppPage>
  );
}
