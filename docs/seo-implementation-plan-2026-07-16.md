# stocksbrew SEO implementation plan

Date: 2026-07-16  
Primary host: `https://www.stocksbrew.online`

## Outcome

Concentrate the site's authority on one domain and on pages that demonstrate stocksbrew's real product expertise: monitoring a watchlist, interpreting stock news, preparing for earnings, using alerts, and choosing a research workflow. Stop sending Google conflicting host, freshness, and quality signals.

## Audit findings

### P0 — the old domain is still a live duplicate

- `tikrr.online` and `www.tikrr.online` return `200` for the same pages as `www.stocksbrew.online`.
- The pages declare stocksbrew canonicals, but the old URLs do not redirect.
- Public search results still surface `tikrr.online` articles while the intended domain has very limited visibility.
- Google describes a permanent server-side redirect as a stronger canonical signal than a sitemap and recommends one-to-one permanent redirects for domain moves.

### P0 — the sitemap overstates freshness and includes bad destinations

- The sitemap currently emits today's date as `lastmod` for nearly every URL on every regeneration, even when content did not change.
- It includes `/anomalies` and `/reddit-buzz`, both permanent redirects to `/pulse`.
- It includes sector URLs that render a streamed soft-404 shell for the default market.
- Google only uses `lastmod` when it is consistently accurate; `priority` and `changefreq` are ignored.

### P1 — the editorial footprint is much larger than the trust footprint

- The site exposes 36 blog posts and 50 generic investing lessons.
- Many lessons target broad YMYL terms where stocksbrew has no distinctive first-party advantage.
- Articles do not show a visible author bio, review policy, change history, or source methodology.
- Several articles say tools were “tested” without publishing a test method or evidence.
- Several pages claim “50+ sources,” while the checked-in source registry currently contains 43 sources across markets. Other comparison claims and prices are time-sensitive.
- Google explicitly gives extra weight to trust for financial YMYL content and recommends clear authorship, sourcing, first-hand evidence, and an explanation of how content was produced.

### P1 — structured data is present but incomplete

- Blog `Article` markup lacks a stable author URL and representative image.
- `dateModified` is always copied from `datePublished`, even when pages were later edited.
- Learn articles have no article schema.
- FAQ schema is emitted widely even though Google only regularly shows FAQ rich results for authoritative government and health sites.

### P2 — the strongest organic wedge is product-adjacent

Search results and current competitor positioning show recurring demand around:

- stock watchlist alerts without notification fatigue;
- portfolio-specific news and “what changed” monitoring;
- earnings workflows for a watchlist;
- free stock research stacks;
- Finviz vs TradingView vs portfolio-monitoring tools;
- what AI stock analysis can and cannot reliably do.

These topics map directly to working stocksbrew features and create natural internal links to Radar, Market Pulse, Earnings Intel, Should I Buy, and Compare Stocks.

## Implementation

### 1. Consolidate crawl and authority signals

- Add an edge-level `308` redirect from both old `tikrr.online` hosts to the same path and query on `www.stocksbrew.online`.
- Keep preview, localhost, API, and asset behavior unchanged.
- Preserve self-referencing canonicals on the primary host.

### 2. Make the sitemap truthful

- Remove redirecting URLs.
- Emit `lastmod` only when a real content date is known.
- Use each article's actual publish or modified date.
- Include only deterministic US sector routes backed by the checked-in tracked universe.
- Remove generic Learn articles from the XML sitemap and mark them `noindex, follow` until each article receives a real editorial review and sources. Keep them accessible to users and available for future upgrading.
- Add an RSS feed for editorial discovery.

### 3. Add trust infrastructure

- Publish a named author profile for Tarun Tomar without inventing financial credentials.
- Publish an editorial and comparison methodology covering sourcing, AI assistance, conflicts, corrections, and the informational-only boundary.
- Add visible bylines, published/updated dates, and review disclosures to articles and comparisons.
- Link trust pages from the footer and About page.

### 4. Repair structured data and metadata

- Use `BlogPosting` with author URL, publisher identity, image, accurate dates, and canonical main entity.
- Add profile-page and editorial-page schema where applicable.
- Add article OG images and RSS discovery metadata.
- Stop generating FAQ schema where it creates no eligible search feature; keep visible FAQs for users.

### 5. Upgrade content where stocksbrew can add original value

- Publish an evidence-first stock research workflow with a reusable decision log and explicit primary sources.
- Publish a workflow-based Finviz vs TradingView vs stocksbrew comparison using official feature/pricing pages, clear test criteria, limitations, and “best for” decisions rather than a fake universal ranking.
- Rewrite or qualify unsupported “tested,” “best,” predictive, and source-count claims across the existing editorial corpus.
- Add contextual internal links among relevant articles, comparison pages, trust pages, and working product features.

### 6. Validate and ship

- Run unit tests, typecheck, lint, and a production build.
- Crawl the generated sitemap and assert: `200`, one canonical, one title, one H1, no `noindex`, and no redirects.
- Verify old-host path-preserving redirects and primary-host canonicals in production.
- Submit updated URLs through the existing IndexNow integration.
- Push `main`, deploy the linked Vercel project to production, and verify live endpoints.

## Success measures

Measure over the next 4–8 weeks in Search Console and analytics:

- all old-domain indexed URLs replaced by stocksbrew URLs;
- zero redirect, soft-404, or `noindex` URLs in the sitemap;
- growth in valid indexed pages for `/blog`, `/compare`, `/guides`, and product landing pages;
- non-brand impressions for watchlist alerts, portfolio news, earnings workflow, and tool-comparison queries;
- organic visits that continue into Radar, Should I Buy, Earnings Intel, or Compare Stocks;
- no manual actions or structured-data errors.

## Search Console action that requires the owner

After deployment, use Change of Address from the old `tikrr.online` property to `stocksbrew.online` if both properties are verified, submit `https://www.stocksbrew.online/sitemap.xml`, and inspect the old/new home URLs. Code and Vercel can implement the redirects, but only the verified Search Console owner can complete that account-level migration step.
