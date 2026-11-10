# StocksBrew positioning research: a personal decision-plan experience

**Checked:** 5 October 2026  
**Purpose:** Decide whether a hard paywall and a new thesis-monitoring experience have a plausible paid job to do. This is a desk-research memo, not proof of demand.

## Recommendation

The research did not uncover a clean market gap. StocksBrew already promises to keep checking followed stocks and surfaces calls, price zones and triggers; competitors sell plain-English watchlist explanations, and direct thesis-monitoring products already exist. Do not position this as a new category or expect a hard paywall or a 7-day trial by itself to create users.

The demo tests a more specific packaging hypothesis: put the investor's own reason and revisit condition beside source-linked evidence, keep conflicting and missing evidence visible, and let the investor decide whether their plan still holds. It is a candidate improvement to StocksBrew's decision-review experience, not a substantiated differentiator or reason to redo the whole app. Test it with people who already follow individual US companies before changing the main product or its paywall.

This is an experience and execution hypothesis, not a proven market gap. Competitor pages and StocksBrew's own current site already use overlapping language and promises. The prototype at `/dev/thesis-monitor` is deliberately only a local, simulated test of one way to package the flow.

## What competitors already sell

| Product | Public offer seen during this review | What that means for StocksBrew |
| --- | --- | --- |
| **StocksBrew today** | Says it checks followed stocks for new filings, earnings and news; Pro adds detailed calls, price zones, targets and unlimited tracking. [About StocksBrew](https://www.stocksbrew.online/about) | Much of the proposed monitoring and decision context is already part of the live offer. The redesign needs to make that value clearer or work materially better, rather than rename existing capabilities. |
| **Market Desk** | Watchlist moves explained in plain English; free for 3 symbols, $19/month Core, $39/month Premium; event alerts and more history are paid features. [Market Desk](https://www.market-desk.com/) | “Your watchlist, explained” and event monitoring are already a direct paid offer. |
| **Howl** | Promotes plain-English SEC filing and stock-move explanations and is free on iPhone. [Howl](https://howlapp.co/) | Plain-English monitoring can be free. |
| **Sentex** | Offers plain-English explanations for why stocks move, AI summaries and custom alerts; its site lists 6 free tickers and paid plans from $6.99/month. It also markets AI-generated bull and bear theses. [Sentex](https://www.sentex.app/) | Both the free explanatory layer and thesis language are already in-market. Site claims do not prove adoption or monitoring quality. |
| **Stockplus** | Free tier lists 10 tickers, live prices, three alerts, financial feeds, portfolio P&L and one AI SWOT report a day; Pro is listed at $3.99/month for broader alerts and unlimited analysis. [Stockplus pricing](https://getstockplus.app/pricing) | Breadth, basic alerts and AI summaries are not defensible paid hooks on their own. |
| **TIKR** | Free US stock analysis, unlimited watchlists, one saved screen, and no card required; paid plans sell deeper history, global coverage, estimates and ownership data. [TIKR plans](https://www.tikr.com/pricing) | “1000+ US stocks” is table stakes beside free research with broad coverage. |
| **Simply Wall St** | Advertises 120,000+ stocks and 90+ markets; free tier lists five company reports per month, one portfolio with 10 holdings, 50 stocks per watchlist, notes and alerts. It offers a 7-day Premium trial without a card. [Plans](https://simplywall.st/portal/plans) | Scale, a free tier, notes and alerts already coexist in a mature product. |
| **Seeking Alpha** | Premium packages ratings, screeners, AI research tools, earnings-call insights and analysis across 4,000+ stocks and ETFs. [Premium overview](https://help.seekingalpha.com/what-is-seeking-alpha-premium) | People do pay for deeper research libraries and decision tools, but a large stock count alone does not say why they should choose us. |
| **Rumi** | Says it monitors filings, earnings calls and news across 5,000+ US companies against a user's thesis; its site says the beta is free and paid plans are forthcoming. [Rumi](https://www.getrumi.app/) | A close thesis-monitoring proposition is already being tested, with broad stated coverage. |
| **InsightDock** | Promises to compare news with a user's reasons/themes; its page lists up to 3 stocks free and Pro at $15/month, free during beta. It says it uses 18+ sources and gives deeper coverage to a focus group of 25 names. [InsightDock](https://insightdock.io/) | Thesis matching, materiality filtering and alerts are already explicit features and marketing claims. Website claims are not independent product-quality or adoption evidence. |
| **mythesis.ai** | One holding free for 30 days, then lists $4.99 per holding per month; shows source-linked SEC and news examples. [Thesis](https://www.mythesis.ai/) | Both per-holding and multi-stock pricing are already being tried. Its polished example also raises the bar for source quality and clear uncertainty. |
| **Thesis.so** | A broader portfolio-aware investing copilot, with market data, portfolio context, options and alerts; its homepage advertises plans from $30/month. [Thesis](https://www.thesis.so/) | Some buyers may pay more for a broad, connected workflow, but that scope would be a much larger product and trust commitment. |
| **InvestJournal** | Positions around recording the original thesis, tracking outcomes and reviewing decisions to reduce hindsight bias; its public page does not show a paid price. [InvestJournal](https://www.investjournal.co/) | Capturing an investor's original reasoning is a known product idea, not proof that customers will pay for it. |

These pages are a snapshot of public product and pricing claims on the date above. They do not establish active users, retention, revenue, quality of monitoring, or that customers actually pay the listed price.

## What may make someone pay

1. **A recurring job with a cost today.** Paid tools tend to sell time saved, deeper historical/forward data, cleaner monitoring or less manual cross-checking. StocksBrew should show the source and why it bears on the user's own question, not merely add another summary to the feed.
2. **A trustworthy answer when evidence conflicts.** An update should say “supports,” “challenges,” “mixed,” or “we do not know,” show its source and date, and avoid turning a headline into a buy/sell instruction. The StocksBrew Watchlist data model already has source citations, `what_changed`, `why_it_matters` and `next_trigger`; it currently does not have a user-owned thesis joined to those events.
3. **A good moment to return.** Investor research is often event-led. An NBER study reports a median of about six minutes of research per trade on traded tickers, with research concentrated shortly before trades; the mean was about half an hour. That points toward a useful decision-time review, not an obligation to check a noisy app every day. [NBER, “The Research Behavior of Individual Investors”](https://www.nber.org/papers/w33625)
4. **An ongoing difference after the first answer.** Longer history, alerts tied to the user's criteria, more tracked companies and source-specific follow-up are plausible recurring benefits. They need repeated use to prove they justify a subscription.
5. **Privacy and control.** A saved investment reason can reveal financial intent. Before asking people to write one, the real product needs understandable privacy, export and delete controls. Do not require brokerage access for the first test.

## Hard paywall and seven-day trial

RevenueCat's 2026 benchmark covers more than 115,000 apps and $16B in revenue, across many categories. Its median D35 download-to-paid figures are 10.7% for hard-paywall apps and 2.1% for freemium; freemium shows a larger late-conversion share at week six (22.9% vs. 15.3%). These are observational cross-app comparisons, not a controlled test for stock-research products. The report itself says access model shifts timing and that one median can mislead without category, price and audience context. [RevenueCat 2026 report](https://www.revenuecat.com/state-of-subscription-apps?from=google)

RevenueCat also reports higher median trial conversion for 5–9-day trials (37.4%) than trials of four days or less (25.5%). Its separate analysis says the observed trial-length groups do not establish which duration performs best; users and products differ. A seven-day experiment is defensible to test, but it is not a proven answer. [Trial-length analysis](https://www.revenuecat.com/blog/growth/free-trial-length)

With no new users arriving, a paywall is downstream of the current problem. A hard gate could improve early paid conversion per visitor and still reduce the number of people who reach the product. First learn whether the promise earns a qualified click and whether people complete the first tracker. Then compare free-first against trial-first with the same source of visitors. Track activation, trial starts, paid conversion, refunds and retention by cohort; do not celebrate trial starts alone.

The prototype therefore has two entry paths:

- **Free-first:** let someone write a reason, see one useful-looking update, then present a proposed Pro plan for ongoing alerts/history and more tracked companies.
- **Trial-first hard gate:** show the trial offer before setup and require starting the demo trial to continue. The welcome screen still lets a researcher choose either experiment; within this path, the free plan has no continue button.

The proposed price is **$9/month after a 7-day trial** because StocksBrew currently lists Pro at $9/month and its live plan offers a 3-day trial. The 7-day term and the feature limits in this demo are an experiment only. No billing behavior or live pricing has changed.

## Product slice to test

1. Pick a stock, or start with an existing StocksBrew stock page.
2. Add a short, optional reason and “what would make me revisit this?” condition.
3. On the existing Watchlist, show a source-linked update with a plain-language relation to each saved reason. Keep “mixed,” “unclear,” and “no change” as valid outcomes.
4. Let the investor mark the update useful or request a review, edit their note, and see the event history.
5. Offer a quiet weekly summary free. Test paid gates around ongoing alerts, longer history and tracking more than three names; show the value before the gate.

The demo uses a made-up issuer and fabricated reports throughout. It does not call backend APIs, use live prices, persist notes, send alerts, or start checkout. This keeps it useful for evaluating the proposed journey without presenting invented market evidence as real.

## How to validate the bet

- Put the prototype in front of 5–8 self-directed investors who already follow individual US stocks. Ask each person to bring two real names and show their current way of tracking why they care and what updates they miss.
- Observe whether they can finish the setup in under two minutes, tell which piece of evidence supports or challenges their reason, and explain what the product did not prove. Do not coach them through it.
- Ask what they would stop using or doing if StocksBrew delivered this reliably. Compare that answer with their actual paid stack and current spend.
- Test free-first versus the trial-first hard gate with the same audience and acquisition source. Compare first-tracker completion and first-update engagement before paid conversion; check renewal/refund behavior before keeping a conversion “win.”
- Treat enthusiastic interview answers and demo button clicks as weak evidence. Real willingness to pay needs an offer tied to a working service, followed by retained paid use.
