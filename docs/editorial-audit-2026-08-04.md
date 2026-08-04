# Editorial audit · 2026-08-04

## Why this changed

Search Console showed 4.28K impressions, 125 clicks, a 2.9% CTR, and an average position of 47.4 over the prior three months. That is a small, volatile sample, but it shows that Google can find the site while most pages are not yet competitive.

The old library also indexed new metadata by default. That made it too easy for a broad, lightly sourced article to enter the sitemap and compete with a stronger page.

## Search intent researched

Google autocomplete was checked on August 4, 2026 for product-led searches. The recurring language was:

- stock analysis app, free stock analysis app, AI stock analysis app
- track stocks, stock tracking app, track stocks live
- stock watchlist app, free stock watchlist app, best stock watchlist app
- stock news alerts, stock news alert app, real-time stock news alerts
- how to track stock news and how to follow stock news
- AI stock research tool, app, and assistant
- best stock research websites and best free stock research websites

This supports one focused cluster around analysing a stock, choosing a research tool, following a watchlist, and tracking material news. It does not justify dozens of generic articles about “market intelligence.”

## Editorial gate

`REVIEWED_BLOG_SLUGS` in `lib/blog-data.ts` is now the positive indexing list. A new post is noindex and absent from the sitemap, RSS feed, and blog hub until a human editor adds it to that set.

A reviewed page needs:

1. one clear search question;
2. an answer that is better than a generic summary;
3. primary or authoritative sources for financial claims;
4. useful internal links and an honest product fit;
5. current metadata, limitations, and a human read-through.

There is deliberately no automatic prose score and no second-model review chain.

## Kept

Twenty-seven pages remain indexable. They cover:

- stock research website, watchlist app, news app, and analysis app comparisons;
- P/E, free cash flow, margins, fundamentals, analyst targets, earnings, and news catalysts;
- US market-analysis workflows and evidence-first research checklists;
- AI-agent integrations with complete technical instructions;
- three practical watchlist, earnings, and stock-news workflows.

The full allow-list lives beside the metadata so the sitemap, feed, page robots, and blog hub use the same decision.

## Rewritten

Three pages match strong product intent but needed new reporting and a more human voice:

- `/blog/watchlist-vs-portfolio-tracker`
- `/blog/earnings-season-watchlist-playbook`
- `/blog/track-stock-news-for-your-portfolio`

They were rewritten around SEC, Investor.gov, and FINRA material, with visible source notes, concrete workflows, clearer product boundaries, and fewer unsupported claims.

## Consolidated

Thirty-one thin, repetitive, stale, or off-focus posts now permanently redirect to a reviewed guide or a live product page. Examples:

- generic market-intelligence posts → the daily US market-analysis workflow;
- old alert posts → the current watchlist-app guide;
- generic heatmap and sector posts → the live Heat and Sectors pages;
- overlapping earnings-calendar post → the rewritten earnings-watchlist guide;
- broad beginner portfolio posts → the Portfolio or Learn pages;
- old stocksbrew-versus-Finviz blog → the maintained comparison route.

Redirects preserve old links while preventing weak pages from competing with the pages we actually maintain.

## Research sources

- [SEC EDGAR APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)
- [SEC structured-disclosure RSS feeds](https://www.sec.gov/data-research/structured-data/structured-disclosure-rss-feeds)
- [Investor.gov: How to read an 8-K](https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins/how-read-8)
- [Investor.gov: How to read 10-K and 10-Q reports](https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins/how-read)
- [Investor.gov: Asset allocation and diversification](https://www.investor.gov/introduction-investing/getting-started/asset-allocation)
- [FINRA: Evaluating investment performance](https://www.finra.org/investors/investing/investing-basics/evaluating-performance)
- [FINRA: Asset allocation and diversification](https://www.finra.org/investors/investing/investing-basics/asset-allocation-diversification)

## Ongoing publishing rule

Research first. Write one useful page for one real question. Link the original evidence. Review it as a person. Only then add the slug to the reviewed set.
