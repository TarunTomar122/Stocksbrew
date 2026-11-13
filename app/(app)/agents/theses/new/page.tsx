import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { SignInButton } from "@/components/briefing/sign-in-button";
import { AppPage, Empty, PageHead } from "@/components/oa/kit";
import { ThesisEditor } from "@/components/thesis-monitor/thesis-editor";
import { getSessionUser } from "@/lib/auth-server";
import { getBasket, namesFor, quotesFor } from "@/lib/basket-agent/data";
import { holdingsOf, MIN_HOLDINGS, thesisEditHref } from "@/lib/thesis-monitor/model";
import { getUserDoc } from "@/lib/watchlist";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Write a thesis",
  robots: { index: false },
};

type Props = { searchParams?: { basket?: string | string[] } };

/**
 * A new thesis: over the person's holdings (from My stocks), or lines for one of their idea baskets (`?basket=`, from
 * the basket's "Add lines"). Nothing is saved until the editor's Save.
 */
export default async function NewThesisPage({ searchParams }: Props) {
  const session = await getSessionUser().catch(() => null);
  if (!session) {
    return (
      <AppPage width="wide" className="max-w-[68rem]">
        <PageHead title="Write a thesis" />
        <Empty title="Sign in to write a thesis over your stocks.">
          <SignInButton label="Sign in" />
        </Empty>
      </AppPage>
    );
  }
  const basketId = typeof searchParams?.basket === "string" ? searchParams.basket : "";
  if (basketId) {
    const basket = await getBasket(session.uid, basketId);
    if (!basket) notFound();
    if (basket.thesis) redirect(thesisEditHref({ id: basket.id }));
    const tickers = basket.lines.map((line) => line.ticker);
    const quotes = await quotesFor(tickers);
    return (
      <AppPage width="wide" className="max-w-[68rem]">
        <PageHead title={basket.name.split(/\s+/).length <= 7 ? `Add lines to ${basket.name}` : "Add lines to your basket"} />
        <ThesisEditor
          mode="basket"
          basketId={basket.id}
          version={0}
          initial={{ name: basket.name, statement: basket.idea, lines: [] }}
          companies={basket.lines.map((line) => ({ ticker: line.ticker, company: line.company, quote: quotes[line.ticker] ?? null }))}
        />
      </AppPage>
    );
  }
  const doc = await getUserDoc(session.uid).catch(() => undefined);
  if (doc === undefined) {
    return (
      <AppPage width="wide" className="max-w-[68rem]">
        <PageHead title="Write a thesis" />
        <Empty title="We couldn't read your holdings just now.">Try again in a minute.</Empty>
      </AppPage>
    );
  }
  const held = holdingsOf(doc);
  if (held.length < MIN_HOLDINGS) {
    return (
      <AppPage width="wide" className="max-w-[68rem]">
        <PageHead title="Write a thesis" />
        <Empty title={`A thesis spans at least ${MIN_HOLDINGS} of your holdings.`}>
          <Link prefetch={false} href="/portfolio" className="font-medium text-oa-primary hover:underline">
            Mark the stocks you own in My stocks
          </Link>
        </Empty>
      </AppPage>
    );
  }
  const [names, quotes] = await Promise.all([namesFor(held), quotesFor(held)]);
  return (
    <AppPage width="wide" className="max-w-[68rem]">
      <PageHead title="Write a thesis" />
      <ThesisEditor
        mode="holdings"
        version={0}
        initial={{ name: "", statement: "", lines: [] }}
        companies={held.map((ticker) => ({ ticker, company: names[ticker] ?? null, quote: quotes[ticker] ?? null }))}
      />
    </AppPage>
  );
}
