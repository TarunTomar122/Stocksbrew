import type { Metadata } from "next";

import { BasketEditor } from "@/components/basket-agent/basket-editor";
import { AppPage, PageHead } from "@/components/oa/kit";
import { agentMarketDay } from "@/lib/agent-jobs-data";
import { getSessionUser } from "@/lib/auth-server";
import { quotesFor } from "@/lib/basket-agent/data";
import {
  fromIdea,
  fromTheme,
  shortsFor,
  type StartingBasket,
} from "@/lib/basket-agent/start";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Watch an idea",
  description:
    "Turn an investment idea into a basket an agent checks every market day, with a four-week replay before it starts.",
  alternates: { canonical: "/agents/baskets/new" },
  robots: { index: false },
};

type Props = {
  searchParams?: {
    theme?: string | string[];
    idea?: string | string[];
    tickers?: string | string[];
  };
};

const one = (value: string | string[] | undefined): string =>
  typeof value === "string" ? value : "";

/** The basket to start from: a theme book, an Ask answer (the idea and its tickers), or one theme to begin with. */
async function starting(
  searchParams: Props["searchParams"],
): Promise<StartingBasket> {
  const theme = fromTheme(one(searchParams?.theme).toLowerCase());
  if (theme) return theme;
  const idea = one(searchParams?.idea).trim();
  if (idea) return fromIdea(idea, one(searchParams?.tickers).split(","));
  return fromTheme("ai-capex")!;
}

export default async function NewBasketPage({ searchParams }: Props) {
  const [session, start] = await Promise.all([
    getSessionUser().catch(() => null),
    starting(searchParams),
  ]);
  // Prices for the companies and the suggestions too: an added company shows its price at once.
  const tickers = [
    ...start.draft.lines.map((line) => line.ticker),
    ...start.suggestions.map((entry) => entry.ticker),
  ];
  const quotes = await quotesFor(tickers);
  return (
    <AppPage width="wide" className="max-w-[68rem]">
      <PageHead title="Watch an idea" />
      <BasketEditor
        initial={start.draft}
        suggestions={start.suggestions}
        quotes={quotes}
        signedIn={Boolean(session)}
        today={agentMarketDay()}
        shorts={shortsFor(tickers)}
      />
    </AppPage>
  );
}
