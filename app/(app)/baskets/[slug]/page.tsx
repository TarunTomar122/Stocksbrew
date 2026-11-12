import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FollowBasketButton } from "@/components/baskets-plain/follow-button";
import { BacktestBlock, BasketForm, MemberList, RuleCard } from "@/components/baskets-plain/parts";
import { AppPage, Empty, PageHead, Panel, SourceLine, fmtStampET } from "@/components/oa/kit";
import { BasketActions } from "@/components/screener/basket-actions";
import { readFollowedBaskets } from "@/lib/baskets-plain/follow";
import { loadBasket, readStoredBasket } from "@/lib/baskets-plain/server";
import { parseBasketRequest, settleLeftover } from "@/lib/baskets-plain/parse";
import { isEmptySpec, rankWords, specSlug, specTitle, themeSlugFor } from "@/lib/baskets-plain/spec";
import { LockCard } from "@/components/oa/gate";
import { limitFor } from "@/lib/entitlements";
import { getViewer } from "@/lib/entitlements-server";
import { getUserDoc } from "@/lib/watchlist";
import { pageMetadata } from "@/lib/seo/page-meta";

// Reads the viewer and today's snapshot, so it is rendered per request.
export const dynamic = "force-dynamic";

type Props = { params: { slug: string }; searchParams: Record<string, string | string[] | undefined> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const stored = await readStoredBasket(params.slug).catch(() => null);
  if (!stored) return { title: "Basket not found", robots: { index: false, follow: false } };
  const theme = themeSlugFor(stored.spec);
  const full = `${stored.sentence} The companies that fit today, why each one is in, and a backtest against the S&P 500.`;
  // A basket someone typed is theirs to share, not a page for search. One that is a whole research theme points at it.
  return pageMetadata({
    title: `${stored.title}: a stock basket`,
    description: full.length <= 155 ? full : stored.sentence,
    path: `/baskets/${stored.slug}`,
    canonical: theme ? `/themes/${theme}` : undefined,
    noindex: !theme,
    card: ["basket", stored.slug],
    // The companies and the backtest are picked again from each day's numbers.
    daily: true,
    alt: `${stored.title}: the companies that fit today and a backtest`,
  });
}

export default async function BasketPage({ params, searchParams }: Props) {
  const [stored, viewer] = await Promise.all([readStoredBasket(params.slug).catch(() => null), getViewer()]);
  if (!stored) notFound();
  // The viewer's own words come with them in the address (the build route adds them). Their "can't filter" lines are
  // read again from those words with the rules, so nobody sees another person's request.
  const asked = typeof searchParams.q === "string" ? searchParams.q.trim().slice(0, 200) : "";
  const askedParse = asked ? settleLeftover(parseBasketRequest(asked)) : null;
  // Only the fixed "can't filter" reasons show here, never the "I didn't use ..." line that quotes the words back:
  // anyone can put words in a link, and this page must not repeat a stranger's text.
  const cannot = askedParse ? askedParse.cannot.filter((item) => item.code !== "unclear") : [];
  const [loaded, userDoc] = await Promise.all([
    loadBasket(stored, viewer.plan, { cannot }),
    viewer.uid ? getUserDoc(viewer.uid).catch(() => null) : Promise.resolve(null),
  ]);
  const followed = readFollowedBaskets(userDoc).some((entry) => entry.slug === stored.slug);
  // Below Pro a basket built only on our call has nothing left to screen: show the lock, never the whole market.
  const locked = Boolean(loaded?.callDropped && isEmptySpec(loaded.spec));
  const symbols = loaded && !locked ? loaded.shown.map((member) => member.row.symbol) : [];
  const title = loaded && !locked ? specTitle(loaded.spec) : stored.title;

  // Someone who already follows it can always stop, even when it is locked or matches nothing today.
  const follow = followed || (loaded && !locked && loaded.shown.length > 0) ? <FollowBasketButton slug={stored.slug} initialFollowed={followed} /> : null;

  return (
    <AppPage>
      <PageHead
        title={title}
        lede="Picked again from today's numbers every time you open it."
        meta={loaded?.asOf ? <SourceLine asOf={fmtStampET(loaded.asOf)} /> : undefined}
        actions={follow ? <div className="max-sm:hidden">{follow}</div> : undefined}
      />

      <div className="mb-4 px-2 sm:px-0">
        <BasketForm value={asked} compact />
      </div>

      {!loaded ? (
        <Panel>
          <Empty title="We could not read today's screen just now.">The rule is saved. Reload in a minute to see the companies that fit.</Empty>
        </Panel>
      ) : locked ? (
        <>
          <RuleCard sentence={stored.sentence} rank={rankWords(stored.spec.rank)} cannot={[]} count={null} covered={loaded.coveredCount} />
          <LockCard feature="screener_call_filters" plan={viewer.plan} trialEligible={viewer.trialEligible} className="mt-4" />
        </>
      ) : (
        <>
          <RuleCard sentence={loaded.sentence} rank={rankWords(loaded.spec.rank)} cannot={loaded.cannot} count={loaded.match.members.length} covered={loaded.coveredCount} />

          {follow ? <div className="mt-4 sm:hidden">{follow}</div> : null}

          <Panel
            flush
            className="mt-5"
            label={loaded.shown.length > 0 ? `The ${loaded.shown.length === 1 ? "company" : `${loaded.shown.length} companies`} and why each is in` : "The companies"}
          >
            {loaded.shown.length > 0 ? (
              <MemberList members={loaded.shown} total={loaded.match.members.length} />
            ) : (
              <Empty title="Nothing fits every condition today.">Loosen one of the conditions, or try one of the examples on the baskets page.</Empty>
            )}
          </Panel>

          {symbols.length > 0 ? (
            <div className="mt-3 px-2 sm:px-0">
              <BasketActions symbols={symbols} compareLimit={limitFor("compare", viewer.plan)} watchLabel={`Add ${symbols.length === 1 ? "it" : `all ${symbols.length}`} to your watchlist`} />
            </div>
          ) : null}

          <section className="mt-6">
            <h2 className="oa-label mb-2 px-2 sm:px-0">The backtest</h2>
            {loaded.backtest ? (
              <BacktestBlock test={loaded.backtest} />
            ) : (
              <Panel>
                <p className="text-[14px] leading-5 text-oa-muted-fg">
                  {symbols.length < 2
                    ? "A backtest needs at least two companies, so there is none for this basket."
                    : "We do not hold enough shared price history for these companies to test them together."}
                </p>
              </Panel>
            )}
          </section>
        </>
      )}
    </AppPage>
  );
}

