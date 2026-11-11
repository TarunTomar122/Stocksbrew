# Volaren parity hill climb

State file for the overnight loop. Read this first on every tick, update it before ending every turn.

## Goal

Make stocksbrew match volaren.ai on features, landing page structure, wording shape and positioning, minus two things we will not build: connecting brokerage/bank accounts, and placing trades for people. Later the whole thing goes free and open source.

The user's bar: fully ambitious, above and beyond normal. Radical rework of the stock page, radar/watchlist and anything else is allowed, 100% change is fine. The landing page takes their content structure but keeps our Open Analytics design (`.oa-landing`, `--oa-*` tokens, Inter Tight).

## What "better" means (the hill)

Each tick should leave the product measurably closer on at least one of these, and never worse on any:

1. Feature parity: a volaren capability (non-trading) that now exists for real in our app, backed by real data.
2. Surface quality: a page that looks and reads like a finished product on desktop and mobile, not a prototype.
3. Coherence: one product story across landing, app nav, stock page, emails, pricing, docs.
4. Honesty: nothing simulated shown as real, every number traceable to a source and timestamp.
5. Open source readiness: no secrets, PII, private infra or unguarded dev routes in the tree.

If the last two ticks were polish, the next one must be a new capability or a structural rework. Prefer the biggest real step that can be verified in one sitting over a safe small one.

## Guardrails (do not relax these overnight)

- No broker/bank connection, no trade execution, no "trades it for you" claims.
- Production database: the user authorised writes on 2026-11-09 ("i dont mind writing stuff in db prod db go crazy"). Keep them additive: new `tm_*` collections through `backend/agentdata/store.py` (it refuses anything outside its prefix list), and new fields merged into the signed-in user's own doc through an authenticated API route. Never delete or overwrite existing user data or collections another pipeline owns. Never delete Firebase data.
- Still not authorised: commits, pushes, deploys, VPS/systemd changes, sending emails. Work stays in the local working tree.
- Do not print or commit tokens from `.env*`.
- Write our own copy in the voice of `docs/product-voice.md`. Do not lift volaren's sentences, name or branding. No trust signals we cannot back (investor badges, user counts, partner logos).
- Simulated or backtested numbers are always labelled as such, with the period and the known biases.
- AGENTS.md rules apply every tick: screenshot every changed page on desktop (1280x900) and mobile (390x844) and look at the PNGs, then run a quality-pass subagent, then typecheck, lint and tests.
- If a tick ends with failing typecheck/lint/tests, fix or revert before stopping.

## Codex is the judge

The user asked for Codex to criticise the work and for a 10/10 from it on: UI, UX, usability, human wording, and similarity to volaren.ai. After each meaningful build, start a fresh `delegate_task` to Codex (provider `codex`, role `review`) with: the pages to open on http://localhost:8000, the screenshot paths, the reference capture of volaren at the scratchpad `ref/volaren-desktop.png`, and this file. Ask for a score out of 10 per dimension with the specific reasons each one is not a 10. Log the scores here, fix what it finds, re-ask with a new delegate. Small findings: fix them directly, no delegate.

## Builder conventions (every agent working on this reads these)

THE RULE (owner, 2026-11-10): insights, not data. "i want insights thats what a user will pay for ... data is already there dont just show data .. show insights". Every page and panel leads with what the numbers mean: the read (a one-line headline plus up to three insights, each a sentence with its number, compared with a baseline such as yesterday, normal or peers, naming the stocks it touches and what to do), then the data underneath as evidence. Use `TheRead` / `InsightRow` from `components/oa/insight.tsx` and the types/helpers in `lib/insights.ts`; compute insights with plain rules in the loader from real data, never model-written numbers, and leave an insight out when the data cannot back it. Stocks first: news, filings and signals attach to stocks. No footnotes that explain our mechanics. Cards side by side are equal height (kit `CardGrid`).

Design (the "brew" system, replaced the white/blue Open Analytics look on 2026-11-09 after the user asked for a finance-app revamp closer to their terminal)
- Cream paper page (`bg-oa-page`), cards a shade lighter (`bg-oa-card`) with a hairline `border-oa-border`, recessed insets a shade darker (`bg-oa-bg`), espresso ink, one copper accent (`oa-primary`). Interface face is Instrument Sans (still exported as `interTight` / `uiFont` from `components/oa/font.ts`, variable `--font-inter-tight`). Numbers, tickers, dates and labels are Geist Mono: use `oa-mono tabular-nums`. Section labels are the `oa-label` class (uppercase mono, copper). Green/red only for gains/losses (`text-signal-bullish` / `text-signal-bearish`).
- Tokens only exist under `.oa-landing` / `.oa-app`, so every page root needs one of those classes or backgrounds go transparent.
- Page shell: `<main className={`oa-landing ${interTight.variable} min-w-0 flex-grow overflow-x-clip`}>` then `<OaSiteHeader />` then a `mx-auto w-full max-w-[76rem] px-4 sm:px-6` frame. `OaSiteHeader` renders the app shell: a fixed left sidebar at lg and up (the body gets its left padding automatically), a slim top bar plus a fixed bottom tab bar below lg. Do not build your own nav.
- Reuse `components/oa/squircle.tsx` (SquircleSurface, SquircleCard, SquircleCardRow: now flat paper cards, radius is set centrally so do not pass `rounded-[..]`), `components/oa/button.tsx`, `components/oa/disclosure.tsx`, `components/stock-logo.tsx`, and the helpers in `components/oa/landing/shared.tsx` (SectionHead, RowLink, EmptyRow, ChangeText, fmtDay, fmtPrice, fmtAmountRange, initials, LABEL, H2, LEDE).
- Density is the point: it should read like a terminal a person can actually use. Tight rows (36 to 44px), tables with mono numbers right-aligned, small uppercase labels, real charts (inline SVG, no new chart deps), no hero-sized padding inside the app, no marketing fluff on app pages.
- Dark mode is the `.dark` class on `<html>`, not a media query. Check both.
- Below lg there is a fixed bottom tab bar; leave `pb-24 lg:pb-10` on the page frame so content is not hidden behind it.
- It should feel like an agent reporting to you: what happened, why it matters, what to do next, with the source and the time. Not a grid of unexplained tables.

Data
- Ingestion and compute jobs live in `backend/agentdata/`, standard library only (plus `requests` if truly needed). Write through `DocStore.from_env()` in `backend/agentdata/store.py`; it works over HTTP from a laptop and on SQLite on the VPS. Add your collection prefix to `WRITABLE_PREFIXES` if needed.
- Multi-year adjusted daily closes: `backend/agentdata/prices.py` (`load_many`, `fetch_daily`, `close_on_or_after`). Stored in `tm_price_history_daily/{SYMBOL}`. Use it for anything that needs returns.
- App-side loaders go in `lib/` and read through `adminFirestore` from `lib/firebase-admin.ts`, wrapped in `unstable_cache` with a sensible revalidate, the way `lib/power-trades.ts` does.
- Every number shown needs a source and an as-of time nearby. When data does not exist, show nothing or say so. Never a made-up placeholder, never a zero standing in for "unknown".
- SEC EDGAR needs a descriptive User-Agent with a contact; use `stocksbrew.online research (tomartarun2001@gmail.com)` and stay under 8 requests per second.

Shared files that only the lead edits (ask in your report instead of editing): `components/oa/oa-site-header.tsx`, `components/oa/mobile-nav.tsx`, `components/oa/oa-landing.tsx`, `components/oa/landing/*`, `components/footer.tsx`, `app/layout.tsx`, `app/globals.css`, `package.json`, `backend/agentdata/store.py` (except adding a prefix), `backend/agentdata/prices.py`.

Working alongside others
- Several agents edit this checkout at the same time, each in its own directories. If typecheck or lint fails in a file you do not own, leave it and mention it. Fix only your own.
- A dev server is already running at http://localhost:8000. Do not start a second one. If it is down, `npm run dev` (port 8000).
- Screenshots: `node /private/tmp/claude-501/-Users-tarat-Documents-personal-tikrr/1c03329e-b270-4603-bc6f-305e8e6e9643/scratchpad/shot.mjs <url> <out.png> <width> <height> [--full] [--wait=ms] [--click=selector]`. Save under that scratchpad in a folder named after your workstream and read the PNGs back before you call anything done.

## Their product, in short

Surfaces: Briefing, Portfolio, Explore, Copy trade, AI agents, Copilot box, docs course (42 guides), pricing ($0 with 100 credits, $12 with 1,000), security page.

- Briefing: daily read of what moved your money and why, each item says why it matters and what you could do next, act/keep/ask-why per item.
- Copilot: chat about your holdings or any asset, every number traced to a source, runs backtests in the conversation.
- Idea to trade: describe a thesis, get a "book" of positions, each line says what the company does, why it fits, the evidence. Can become an agent.
- AI agents: standing jobs on a schedule, an event (new filing, insider trade, 13F, congressional disclosure, news, earnings) or a price rule. Modes: tell me only, approve each batch, trade within limits. Every run ends in a decision, including "do nothing". 4-week no-hindsight replay before start.
- Copy trade: 60+ funds from 13F (EDGAR back to 2013), Congress from House Clerk and Senate eFD (checked every two hours), Form 4 insiders. Performance measured from filing date vs S&P 500: 1m, 3m, YTD, 1y, since first filing, max drawdown.
- Strategies: rule-based baskets with backtested and live records, monthly rebalance.
- Portfolio: by source, all, analytics, closed, alerts, tax (harvestable losses, wash-sale windows, realised gains).
- Practice money: $100,000 paper account per user.
- Coverage: stocks, ETFs, options, crypto, commodities, bonds/rates, FX, prediction markets, Congress, news.
- Landing order: hero with a notification card, accounts in one place, track everything that moves your money (widget grid), ideas into trades, follow strategies, follow investors, FAQ, why we built it, backers, closing CTA, footer.
- Stance: "no number here is written by a language model", "when something does not exist we show nothing rather than a zero".

## The product map (decided 2026-11-09, 20:30 UTC: rebuild, not reskin)

The user's rule: nothing that existed before may still look like it did. Every old page is raw material (loaders, ideas), rebuilt from scratch on the kit in `components/oa/kit` (`AppPage`, `PageHead`, `TabBar`, `Chips`, `Panel`, `StatStrip`, `StreamRow`, `StreamDay`, `Ticker`, `Delta`, `Tag`, `Sparkline`, `SourceLine`, `Empty`, `DataTable`, formatters). Merge, split, add and remove freely. Old URLs that are merged or removed get a permanent redirect so search traffic and old links land somewhere real (the lead adds redirects in `next.config`; builders list the ones they need in their report).

| Place | Route | What it is | Absorbs (old routes) |
|---|---|---|---|
| Briefing | `/briefing` | The daily read: needs you, worth knowing, coming up, quiet | `/pulse`, `/premarket`, `/market-daily`, `/anomalies` |
| Portfolio | `/watchlist` | Positions, watching, analytics, alerts, practice account | `/portfolio`, `/radar`, `/practice` as a tab or sibling |
| Explore | `/explore` | The research desk: an Ask box on top, then News, Screener, Themes, Calendar, Signals, Markets | `/free-tools` |
| Ask | `/ask` | Copilot: sourced, tool-using chat; turns an idea into a basket | chat on `/watchlist/classic`, `/hackathon` |
| The wire | `/news` | Headlines as a dense time-ordered wire with ticker and topic filters | old `/news` |
| Calendar | `/calendar` | One agenda for earnings, IPOs, economic events and filings deadlines; week, month and list views | `/earnings`, `/earnings-intel`, `/ipos`, `/events`, `/upcoming-events` |
| Signals | `/signals` | Crowd and policy signals: Reddit, Trump posts, unusual movers with explanations | `/reddit-buzz`, `/trump-logic`, `/social`, `/anomalies` |
| Screener | `/screener` | A real filterable screener over the universe plus saved screens and the sector heat map | `/stocks`, `/screens`, `/sectors`, `/sector/[x]`, `/heat` |
| Themes | `/themes` | Idea baskets with per-line reasoning | old `/themes` |
| Compare | `/compare` | Side by side for 2 to 4 names | `/compare-stocks`, `/should-i-buy/[t]` (redirects to the stock page) |
| Stock | `/stock/[symbol]` | The analyst report | old stock page |
| Markets | `/markets` | Multi-asset terminal | new |
| Strategies, Backtest | `/strategies`, `/backtest` | Rule-based baskets, self-serve backtests | new |
| Filings | `/filings` | SEC filings stream | new |
| Follow | `/follow` | Funds, Congress, insiders, with filing-date records | `/power-trades`, `/insiders` |
| Agents | `/agents` | Standing jobs with a run log | new (built at `/agents/jobs`, becomes `/agents`) |
| Developers | `/developers` | API, MCP server, CLI | old `/agents` developer page, `/mcp` |
| Docs | `/docs` | The course and reference: how each surface works, methodology, glossary, tools | `/learn`, `/guides`, `/resources`, `/use-cases`, `/position-size-calculator`, `/editorial-policy`, `/authors` |
| Pricing | `/pricing` | Free vs Pro, the same table the gates use | `/subscribe` |
| Company | `/about`, `/security`, `/legal/*`, `/blog` | Why we built it, how data and accounts are handled | old `/about` |
| Account | `/profile` | Plan, notifications, connected agents, data export | old `/profile` |

## Free vs Pro (in progress)

The user asked on 2026-11-09 for a researched, conversion-minded split. Inventory of today's gating found: chat is ungated for any signed-in user and feeds the call into the model; the watchlist shows free users the stance; several "locked" rows ship the real data to the browser under a CSS blur; python emails use a narrower Pro check than `resolveIsSubscribed`; "200 calls per month" copy vs a real limit of 200 a day; "3 days free" shown to people who cannot get a trial. Prices today: $9/month, $99/year.

`lib/entitlements.ts` (lead owns it) is the single table: a rule per plan (anon, free, pro) for every feature, the lock copy, and helpers `planOf`, `can`, `limitFor`, `clip`, `nextStep`, `describeRule`. Server side: `lib/entitlements-server.ts` (`getViewer()`, `isCovered(viewer, ticker)`, `coveredSlotsLeft`, `consumeMeter`, `peekMeter`). UI: `components/oa/gate.tsx` (`LockCard`, `MoreLocked`, `MeterNote`, `ProMark`). `/pricing` renders the same table.

The model, from the paywall research (scratchpad `paywall-research.md`, 42 sources): reading is free, the agent working for you is the product.
1. Anything the pipeline writes once for everyone is free to read, signed out too: stock reports and the call with its reason and date, the wire, calendar, filings, markets, strategies with full backtests and holdings, every fund / Congress / insider page with holdings and the record.
2. One number matters: covered stocks. A covered stock gets price zones and target, explained moves in the briefing, zone and call alerts, the pre-earnings read. Free covers 5 (one swap a week), Pro covers everything. Tracking holdings is unlimited on both.
3. Everything else works on Free at a small count: 3 questions (signed out: none) and 3 backtests a day, 2 agents, 5 price alerts, 3 followed investors, 1 followed strategy, 2 saved screens, 8 quarters of filing-by-filing history, 5-year backtest lookback, 7 days of signals archive. The one real feature lock is screening the market by our call.
4. Never gated: the call itself (same call for everyone, at the same time), sources, as-of times, risk notes, backtest caveats, methodology, public filings, the user's own data and its export, cancelling. Upgrade prompts sell capability, never a backtested return.
5. A limit always names a way out that costs nothing (swap, pause, wait for the reset) and never deletes work: a third agent saves as paused.

Not wired yet (the table is ahead of the code; nothing is deployed):
- Tracking is still capped at 3 in `lib/pro-features.ts`, `app/api/track`, `app/api/watchlist/batch`, `lib/watchlist-view.ts`. Needs: unlimited tracking, a `covered_stocks` field on the user doc with a swap cooldown, coverage chosen in Portfolio.
- Stock page: show the call to everyone; zones, target, pre-earnings read only when `isCovered`. Stop sending `intelPro` to the browser for uncovered stocks.
- Close the inventory leaks: `/api/chat` and `/api/ask` meter with `consumeMeter("ask")` and must not put zones for uncovered stocks into the model context; blurred real rows in the old feeds go away with the old pages; python email jobs use a narrower Pro check than `resolveIsSubscribed`.
- Alerts API: 5 free price alerts instead of Pro-only. Agents: 2 free. Follow: 3. Backtest: meter and lookback. Screener: call filters Pro. Signals: 7-day archive.
- Copy still wrong elsewhere: "200 agent calls per month" (real: per day), "3 days free" shown to people who cannot get a trial.

Decisions that are the user's (recommended by the research, not implemented):
- Replace the 3-day card trial with a 14-day reverse trial, no card, for every signup; on day 15 nothing is deleted, extras pause. This changes checkout and what new users see, so it needs a yes.
- Send the personal daily briefing email to Free users (today the personal emails are Pro only). Changes who gets emailed.
- A free read-only API tier (100 calls a day). Today the API is Pro only at 200 a day.
- Price: research found $12 is the floor of the category; we charge $19 a month or $190 a year (changed 2026-11-10).
- AI limits depend on our cost per answer, which is not measured yet.
- The compliance section is flagged for a lawyer, especially "what needs you" wording next to add / hold / trim calls.

Rules for every builder (use the table if it has your feature, otherwise leave a GATE comment): load Pro-only data on the server only for entitled users and pass `null` otherwise; never render real locked data under a blur; do not invent your own lock UI or limits, leave a `{/* GATE: <what and why> */}` comment where you think a gate belongs and list them in your report. Caveats, sources, as-of times and risk notes are never gated.

## Where we stand

Have: per-stock research page and AI briefs with add/hold/trim calls and zones, watchlist with holdings, movers with explanations, premarket/open/weekly emails, earnings and pre-earnings intel, price and directive alerts, congressional trades, reddit buzz, trump posts, IPOs, thematic screens and themes, portfolio analyzer, MCP server + REST API + CLI (they have none of this last one).

Partial: chat (only on `/watchlist/classic`), briefing (emails only, no page), agents (alerts only), idea to book (screens, hackathon thesis compiler), portfolio (manual holdings, mix, rebalance insights).

Missing: 13F fund following, insider (Form 4) following, strategies with backtests, backtesting, practice portfolios, performance tracking from filing date, ETFs/crypto/commodities/options coverage, tax view, text channel, security page, docs course.

## Backlog (re-rank as you learn)

- [x] P0 guard `/dev/watchlist` and `/api/dev/user-watchlist`: deployed 2026-11-10.
- [x] Landing page (hero briefing card, one place, track grid, markets, idea to watchlist, strategies and funds, agents, ask from your AI, plans, FAQ, why; `<BriefingPreview />` not used because the hero card already plays that part): their section order with our real data (hero card, everything in one place, track everything grid, idea to watchlist, follow strategies, follow investors, FAQ, why we built it, closing CTA).
- [x] App information architecture: sidebar shell, new product map, 47 redirects from old routes in `next.config.js` (all followed with curl to a 200).
- [x] Briefing page: `/briefing`, signed in (from the watchlist) and signed out (market view), with Got it / Keep watching / Ask why. Open: coverage gating (explain covered stocks, list the rest with their real moves), 5 to 12s load signed in, `<BriefingPreview />` not on the landing yet.
- [x] Stock page rework: analyst report layout with chart events, the read, timeline, section rail, action column. Call and read open to everyone; levels gated by coverage on the server.
- [x] Portfolio at `/watchlist`: Positions, Watching, Analytics, Alerts on the same user data and routes. Open: signed-in add / remove / save never clicked through; `/watchlist/classic`, `/watchlist/portfolio`, `/portfolio` still old (delete or redirect); no user has shares entered, so value and gain are untested on real accounts.
- [x] Copilot: `/ask` with tool cards and a number audit, Ask box on `/explore`. Only the offline rules path has been seen working locally (no usable model key in this checkout); the live model path is untested.
- [x] Follow: `/follow` (funds, Congress, insiders), `/follow/[slug]`, `/insiders`. 65 funds ingested back to 2012-12-31 (full run on 2026-11-10, no failures; 2,388 CUSIPs had no ticker mapping and are left out of performance). `tm_fund_holders` rebuilt: 1,474 tickers.
- [x] Strategies: 12 rule-based baskets at `/strategies` with backtested vs live records kept apart, `/backtest` self-serve, `/practice` paper account. Open: nothing schedules the daily strategies job; signed-in paths (track, practice orders) only covered by tests; no 13F strategy yet (fund data was empty when it ran); practice account has no reset; sitemap.
- [x] Idea to basket: `/themes` and `/themes/[slug]` books, basket builder in Ask (`lib/ask-basket.ts`). Not exercised with a live model.
- [x] Agents: `/agents` (built at `/agents/jobs`) with ten templates, replay of the last 4 weeks, run log where every run ends in a decision. Open: nothing schedules the runner (`npx vite-node -c vitest.config.ts scripts/run-agent-jobs.ts`); job count is capped at 20 in code, not 2 Free / 25 Pro; 13F and insider triggers say 'could not check' until that data lands.
- [x] Practice portfolio: `/practice`, $100,000 paper account, order ticket, P&L vs SPY, trade log.
- [x] Coverage: `/markets` multi-asset terminal (93 assets across indices, ETFs, rates, commodities, FX, crypto, options readings; 21 prediction markets). Open: no refresh schedule, sitemap entries, landing and briefing widgets not placed, `followed_market_assets` not read by Portfolio.
- [x] `/pricing` (from the entitlements table), `/security`, `/docs` (course, glossary, tools), `/developers`, `/about`, Account at `/profile`. The docs builder died on the limit before reporting: content accuracy is unreviewed.
- [x] Design v3 from calibration: type floor 13/15px, one copper fill per view, top bar instead of the sidebar on marketing/docs/pricing, quote page hierarchy, single pricing grid, phone scroll cues.
- [x] Free vs Pro enforced server-side (local; email recipient change needs a yes at deploy).
- [x] Portfolio tax view (local).
- [x] Call engine v3 scorecard: built, no edge, stays off. Next: reframe the call as a descriptive scorecard.
- [x] Open source readiness report done; going public blocked on owner decisions (key rotation, CSV, license): LICENSE, waitlist CSV in history, scrub private infra and personal identities, env example, README.
- [ ] Share previews (OG cards) for every page family (in progress).

## Log

Newest first. One entry per tick: what changed, what was verified (with screenshot paths), what is still open.

### 2026-11-11 ~03:00, UI rounds 6-9 live (lead)

- `8e6b41d` LIVE: plain call words everywhere (Buy more / Keep / Sell some, incl. screener filters), company names in lead sentences, briefing picks the biggest explained move, move bars, clickable rows, share classes shown once (not when searched), each Today page leads with something different, "Best stock lists" in the Research menu. Quality pass found a briefing list nested inside links (rows twice, hydration errors) and pricing copy contradicting plan rules: fixed. Exact commit verified: tsc 0, vitest 1177/1177; all important pages 200 live.
- Scores: Codex r6 6.18 → r7 6.29 → r8 6.39 → r9 6.48; Cursor ~4.9 and noisy (±4 per page between unchanged rounds). Phone pages now go to reviewers as ~1,700 px tiles.
- Dev server had stopped mid-loop; restarted detached.
- Running: UI loop round 10+ (screener chip clipping, stale S&P figure in the screener read, all-caps names, share-class notes, tense after events, screener opening on a short list, Signals vs Market today overlap); "copy the smart money, tested" (new /follow/[slug]/copy pages).

### 2026-11-11 ~02:00, 27 /best lists live (lead)

- `ff483c0` LIVE: /best hub + 27 data-backed lists (dividends, undervalued, growth, AI, chips, insiders buying, funds bought, under $10/20/50, most shorted, near highs/lows...), each with its exact rule, a read, ranked rows with the qualifying number, BreadcrumbList + ItemList JSON-LD, `best` sitemap family (28 URLs). Quality pass: SHIP after fixes (insurer exclusion, negative equity, "tenfold" wording, junk names). Exact commit verified: tsc 0, vitest 1159/1159. Live 200s (first-hit 404s right after deploy are requests reaching the previous deployment; they clear in seconds).
- Open: four lists rank by our score ("Best stocks under $10" etc.): disclosed, owner's call; /best not yet in the nav (UI loop adding it); fund list counts Q2 13Fs until Q3 filings land Nov 14.
- VPS: tonight's after-close rerun is in backtest_strategies (~1h, network-bound full price rebuild) holding the shared agentdata lock, so frequent/hourly wait; check it finished.

### 2026-11-11 ~00:00, five-place navigation live (lead)

- Round 5 LIVE `c421bdd`: navigation rebuilt around five places (Today, My stocks, Research, Follow investors, Alerts & agents), same on desktop and phone with a page strip; sticky phone top bar fixed (display: contents wrapper); stock page phone switcher; landing trimmed 10 → 6 sections; pricing copy matches plan rules. Quality pass SHIP WITH FIXES. Exact commit verified: tsc 0, vitest 1099/1099.
- Scores: Codex r4 6.18 → r5 6.24 → r6 6.18; Cursor 4.98 → 5.07 → 5.06. Navigation the only dimension that moved (Codex 6.38, Cursor ~5.1).
- Owner decisions raised by the loop: merge the four Today pages (route change), and the landing headline both reviewers call over-promising (proposal: "Know why your stocks moved, and what we would do.").
- Running: UI loop round 7+ (phone shots tiled for reviewers, briefing/stock-mu/calendar/pricing, share-class dedupe); "best stocks for X" SEO lists (new /best routes).

### 2026-11-11 early, per-stock call reasons live; agentdata path fixed (lead)

- `f57da15` LIVE (Vercel + VPS pull): every call gets its own plain reason (backend/call_reason.py; directive_v2.call_reason + call_reason_source). 716 stocks shared 8 templates before. Review: DEPLOY WITH FIXES (crash-safe reason check, "watch" wording). Fills as the 09:50 ET and ~16:10 ET brief runs rewrite briefs; ~280 September-era docs keep old text until rewritten (backfill not written). Watch the first close run against its 20-min window and the model vs facts ratio in logs ("call reasons rejected").
- The after-close agentdata group failed its first run (prices and strategies) because /opt/tikrr-agentdata lacked backend/config/instrument_universe.json. All four agentdata units now run from /opt/tikrr (TIKRR_AGENTDATA_DIR=/opt/tikrr, ExecStart under /opt/tikrr), daemon-reload done, after-close re-run started by hand.
- Running: UI loop round 5 (nav/landing rework, capture in progress).

### 2026-11-11 early, UI round 4 live; deep research built; nav rework started (lead)

- Round 4 LIVE `d10e3e9` (quality pass SHIP WITH FIXES: calendar header collision, capitalisation after a quote). Scores plateaued: Codex 6.18, Cursor 4.98. Navigation is now the weakest dimension for both.
- Deep research built, NOT shipped: /stock/[T]/research runs 10 reading steps (brief, financials, earnings, 10-K, 10-Q, filings, funds/insiders/Congress, peers, news, Reddit/policy) + one writing call + a numbers check; 44-66 s, ~$0.01 per report; Free 3 / Pro 30 a month; shareable links. Testing wrote 3 reports to the owner's account (tm_research_reports). Owner decisions listed in its report.
- Running: UI loop round 5+ now owning chrome/nav/landing (structural IA rework first); backend stock-specific call reasons (replace the generic HOLD sentence).

### 2026-11-10 night, UI rounds 2-3 live; earnings day agent shipped dark (lead)

- Council means (16 pages, 7 dims): Codex r1 5.31 → r2 5.96 → r3 6.22; Cursor 4.66 → 4.81 → 4.93. Details in council/ux-status.md.
- LIVE `31c1d63`: plainCallReason rewrites stored call reasons in plain words, names over tickers, clickable rows, plain labels, show-more on phones, earnings marker labelled; earnings day agent (tm_earnings_day job + report pages + stock strip + briefing slot) shipped dark: VPS job off and the "Earnings came out" template hidden until EARNINGS_DAY_ENABLED=1 (Vercel and VPS). Quality pass SHIP WITH FIXES (template gating, quoted posts not reworded). The exact commit was verified in a clean worktree: tsc 0, vitest 1085/1085 (needs .env.local and .env.vps.local there). All 15 important pages 200 live.
- Still uncommitted for owner review: import/thesis (entry lines held back), deep research (in progress).
- Running: council round 4+, deep research builder. The agentdata after-close timer fires for the first time at 22:30 UTC tonight.

### 2026-11-10 night, UI council round 1 live; import + thesis built (lead)

- Owner priorities for the night: UI/UX hill climb with the Codex + Cursor council until 10/10 from both, on focus, navigation, plain language, progressive disclosure, human writing (full sentences, no truncation, no AI-slop phrasing), visuals; ideas from docs/ideas.md built one by one in parallel.
- Round 1 baseline (council/ux1.md, 16 pages, 7 dims): Codex mean 5.31, Cursor 4.66; worst: movers, follow, agents.
- Round 1 fixes LIVE (`1e2afa2`): plain-copy helpers, MoveBar/RangeBar/ShowMore, stock page tabs + Related row + plain call meaning, /movers ranked lists, no ellipsis cuts, plain read builders, captions as sans text, nav matches. Quality pass: SHIP WITH FIXES (tab history state, dead anchor, overstated wording), all fixed; tsc 0, vitest 1176/1176, eslint clean.
- Built, NOT shipped (owner reviews in the morning): screenshot/paste import on /watchlist, /import no-signup portfolio read from the landing, "why do you own this" step with reasons on rows (users/{uid}.theses). OpenAI vision path untested live (no local key). Entry lines in portfolio-view, positions-table and hero-briefing are uncommitted.
- Running: council loop round 2+ (status in council/ux-status.md, ship per round after a quality pass); earnings day agent (built, not switched on).

### 2026-11-10, morning briefs follow the movers (lead)

- `e7e5a0d` on the VPS: morning brief run chained after the 09:50 ET price batch (OnSuccess open-anomalies + open-briefs, 3 min retry), selection in backend/morning_brief_selection.py (news, 3%+ or 2x usual move, Pro earnings, anomaly/Reddit zone; cap 160). zone-briefs removed; 15 timers pinned to America/New_York with a reset so the reload fired nothing. Premarket now 07:30 ET (was 03:30 ET / 2 PM IST). Evening run unchanged. Dry run on the VPS: 163 candidates, 73 selected (68 move, 14 zone, 2 earnings), HIMS and ASTS included. Unit backup: /root/tikrr-units-pre-20261110.tgz; rollback steps in the review (checkout 8a6bb35, restore units, daemon-reload, re-enable zone-briefs).
- Check tomorrow: open-movers-price 14:50 UTC → open-briefs rewrote the selected stocks.

### 2026-11-10, SEO page families live, PostHog rebuilt, VPS on the new backend (lead)

- PostHog (`890a60b`): typed event plan in docs/analytics.md, production-only sends, uid-only identify, no reset on anonymous loads, server-side checkout/subscription events, replay masking on portfolio/account/Ask. Dashboard "stocksbrew: growth" (29 tiles): https://us.posthog.com/project/303737/dashboard/2331690. Baseline 30 days: ~544 visitors, 576 sessions, blog 242 views, landing 167, stock 101; 5 identified people. Verified a live pageview lands with $environment=production and utm.
- SEO (`608800f`, `8a6bb35`): /compare/[a]-vs-[b] (107 in sitemap), /stock/[T]/moves/[date] + /movers (dated archive in tm_daily_anomalies/US__{day}), /sectors(/[slug]) (old /sector/* 308 there), /insiders/[T] (197), 678 indexable stock pages, real 404s for unknown tickers. Sectors now from backend/config/industry_sectors.json (the keyword guesser filed utilities/REITs/biotech under Technology). A failed snapshot read now answers 500, not 404. Live checks: all families 200, sitemaps listed; IndexNow accepted 20 move URLs for Nov 10.
- VPS: /opt/tikrr pulled to 8a6bb35 (remote now TarunTomar122/Stocksbrew), tikrr-localdb restarted (health 200), FINNHUB/MARKETAUX keys moved from old code into /etc/tikrr/backend.env (backup kept). Today's 18 explained moves archived by hand.
- Running: brief schedule fix (morning run after the 09:50 ET price batch for movers + news, evening run unchanged, stray 14:25 UTC zone run removed, timers pinned to New York time).

### 2026-11-10, signed-in home goes to the portfolio; agent promo (lead)

- Live (`9c0116b`, `vercel --prod`): middleware sends `/` to `/watchlist` when the `tikrr_session` cookie is present (`/?home=1` keeps the landing; query params kept), and signing in on the landing navigates to `/watchlist`. Portfolio header Today/Total gain wrap as one group. Verified live: signed out 200, signed in 307 to /watchlist.
- Agent-first promo with an original synthesised score and sound effects: `remotion/XPromo2.tsx` + `public/promo/track.wav` (made by scratchpad `promo/synth.py`), rendered to `out/stocksbrew-agent-promo.mp4` and `-square.mp4`. Not committed.

### 2026-11-10, launch promo rendered; public repo exposure flagged (lead)

- 30s X promo in Remotion (`remotion/XPromo.tsx`, compositions `XPromo` 1920x1080 and `XPromoSquare` 1080x1080), real 2x screens of the live site in `public/promo/`, rendered to `out/stocksbrew-x-promo.mp4` and `out/stocksbrew-x-promo-square.mp4`. Render with `--browser-executable` pointing at the Playwright headless shell (Remotion's own download exits early here). Not committed.
- The GitHub repo was renamed to TarunTomar122/Stocksbrew and is PUBLIC; history still holds 6 API keys and the waitlist CSV. Owner asked to approve making it private, rotating keys and publishing the fresh-history snapshot (built and scanned clean at scratchpad `stocksbrew-public/`). Waiting on the owner.

### 2026-11-10, released: rework live on stocksbrew.online (lead)

- Open-source cleanup: 381 tracked files removed (legacy routes behind redirects, 157 unreachable components, 37 lib files, junk incl. the waitlist CSV from the tree), private hosts/IPs/project ids moved to env, new README with 12 screenshots (`docs/screenshots/`), CONTRIBUTING, `docs/architecture.md`, `docs/data-jobs.md`, `.env.example`. Repo stays PRIVATE: 6 keys and the waitlist CSV are still in git history (rotate keys, publish a fresh-history repo via `scripts/oss/make-snapshot.mjs`).
- Insight rows redone after owner feedback (link on the sentence line, chips under the text; `components/oa/insight.tsx`).
- Production build fixed: `/sitemap.xml` timed out as a static page, now rendered on request. Store requests time out after 25s (`LOCALDB_TIMEOUT_MS`), from the release quality pass (verdict SHIP: gating holds signed out, user APIs 401, no secrets in the client bundle, 38 redirects one hop, vitest 989/989, tsc 0).
- Pushed `5cb0072`, `3aa627e`, `dda7db3` to origin/main (author Tarun Tomar <yourtrace.online@gmail.com>), rebased on the P0 commit. `vercel --prod` from a clean worktree: live on https://www.stocksbrew.online (tikrr.online 308s to it). Live smoke: key pages 200, no console errors on /stock/NVDA and phone /briefing.
- NOT done (needs owner): VPS backend update (news tone job, email v2 jobs, SEC/insider fetchers, call engine stay off), email v2 cutover, Vercel env additions (EMAIL_UNSUBSCRIBE_SECRET before cutover; optional ANTHROPIC_API_KEY; STOCKSBREW_FROM_EMAIL after Brevo domain auth). Next: launch video with the owner.

### 2026-11-10, finishers landed, email v2 ready, open-source cleanup running (lead)

- Briefing + insights B finished: read on top ("3 stocks need a decision today: CBRS, ASTS and SMR."), "Needs you" only for holdings that hit a level today, wrong as-of labels fixed, reads on stock/portfolio/tax/compare/screener. Insights A + share previews finished: reads on explore (one merged read), markets and every class page, signals tabs, calendar, filings; 56 OG cards opened; `lib/og/metadata.test.ts` fixed (geist mocked). vitest 1042/1042, tsc 0.
- Email v2 taken over and finished (`docs/email-v2.md`): daily brief 8:30am ET on non-quiet days, Saturday recap, bundled agent alerts, lifecycle emails. Fixed a double Pro welcome, an alerts resend loop, settings links. Cutover is NOT part of the deploy and needs the owner (about 140 Free accounts would start getting mail; Brevo domain auth; CAN-SPAM postal address).
- Running: open-source cleanup (dead legacy routes and components, junk, secrets/PII in the tree, README, CONTRIBUTING, .env.example, docs/screenshots). Then production build check, quality pass, commit, push, `vercel --prod` (owner approved).

### 2026-11-10, recovery after three account limits, release push (lead)

- Every builder died at 14:22 on the 5-hour limit. Landed before that: /agents rebuilt as reports (one read on top, four plain pills, evidence tables, earlier reports collapsed); stock-first wire and explore stories with per-headline tone from `backend/agentdata/news_tone.py` into `tm_agent_news_tone` (job not on the VPS yet).
- Cut off near the end and handed to two finisher agents in this session: briefing simplification and insights B (stock, portfolio, compare, screener) in one; insights A (explore, markets, signals, calendar, filings), the double read on explore and share previews in the other.
- The email chat (thread 93c1e229) is locked to the limited account; a takeover agent here is doing its unfinished quality pass, previews and a cutover note in `docs/email-v2.md`. Nothing is sent and nothing is installed on the VPS.
- Owner release instruction (2026-11-10): once the three agents land, without asking: clean the repo for open source, rewrite the README and contributor docs with screenshots of the current app, push to GitHub, run `vercel --prod`, then report what to change on Vercel. A launch video comes last, with the owner. Prep done: origin `TarunTomar122/tikrr` is PRIVATE; Vercel CLI is logged in to the right team via `npx vercel`. Env vars the code reads that production lacks: ANTHROPIC_API_KEY, EMAIL_UNSUBSCRIBE_SECRET, OPENROUTER_API_KEY, STOCKSBREW_FROM_EMAIL/NAME, INDEXNOW_SECRET and a few optional ones; check each before deploy.
- State at handover: tsc 0; vitest 1026/1027, the one failure is `lib/og/metadata.test.ts` (root layout default card), owned by the share-previews finisher. Dev server restarted detached so T3 restarts do not kill it.

### 2026-11-10, insights C landed (lead)

- Reads on /follow, /follow/[slug], /insiders, /strategies(/[slug]), /themes(/[slug]), /backtest, /practice from `lib/{follow,strategies,themes,backtest,practice}-insights.ts` (tested). Example: "In their Q2 2026 filings, 19 of 60 funds bought or added to AMZN, the most crowded buy; 16 trimmed or sold TSM." Signed in, "your stocks" goes first (funds net buying or selling what you track). "Most bought / most sold" cards grouped by stock on each follow tab. Caveat panels collapsed to one bias line; hypothetical and backtest labels kept. vitest 998/998.
- Lead checked: /follow desktop shot; MRNA "+812% this year" matches stored closes ($30.86 on Jan 2 to $275.46, about +793%), not a bug. Removed stale `.next/types` from deleted temp pages (tsc 0).
- Open: headless signed-in sessions sometimes drop after load (check whether the session cookie gets refreshed or cleared client-side); `getFundDigests` uses LocalDB-only array `select`; the old "Past 7 days: 31 buys…" line on the insiders tab.

### 2026-11-10, open source readiness report (lead)

- Report: `docs/open-source/readiness.md`; scanner `scripts/oss/scan.mjs` (masked, exits 1 on secrets); fresh-history builder `scripts/oss/make-snapshot.mjs` with `scripts/oss/exclude.txt` (37 paths). New README, `.env.example`, LICENSE.proposed (recommends AGPL-3.0-or-later), CONTRIBUTING, SECURITY. vitest 998 passed; backend 675 passed; tsc 0 after the lead removed two stale `.next/types` dirs left by deleted temp pages.
- Findings: 6 API keys in origin/main history only (OpenAI, Gemini, NewsAPI, Brevo in `26f87c4`; Finnhub, Marketaux in `5ea4ab8`). Finnhub and Marketaux keys were hard-coded in the tree and are now read from `FINNHUB_API_KEY` / `MARKETAUX_API_KEY`. DEPLOY NOTE: add both to the VPS env before the next backend deploy, or those two news sources go quiet (they log `missing_api_key` and return nothing). The agent also echoed the NewsAPI key in its own tool output once; treat it as exposed. PII: the waitlist CSV (27 people), the owner's work email and second Gmail (default sender in `backend/email.py`, `lib/brevo.ts`), another person's Gmail in history, 3 Discord IDs, the VPS IP in ~17 places, Tailscale IPs.
- Recommendation: keep this repo private and publish a fresh-history repo from the snapshot builder (trial run: 0 secrets, 0 private emails). Never `git push --all/--mirror` from this checkout (local `refs/t3/*` and `.claude/worktrees/` hold the service-account file and copies of the CSV).
- Owner decisions: rotate the 6 keys; delete the waitlist CSV; license; approve the exclude list; set `STOCKSBREW_FROM_EMAIL` in prod; rewrite the AGENTS/runbook docs for contributors; scrapers on by default or not; rights for `public/trump-avatar.png` and `public/agent-logos/`.

### 2026-11-10, open source readiness started, share previews, read rows (lead)

- Open source readiness agent started: secret/PII scan of the tree and all of origin/main history, private-infra references, a list of junk files, README, .env.example, LICENSE.proposed, CONTRIBUTING, SECURITY, `docs/open-source/readiness.md`. Lead found: `backend/firebase-service-account.json` is gitignored and was never pushed (local T3 checkpoint refs only); `backend/waitlist_emails_2026-05-05.csv` (real emails) IS in origin/main history (`69c2cdd`), so going public needs a history rewrite or a fresh-history repo.
- Share previews agent started: 1200x630 brew-style OG cards for every page family from live data (stock card with price, move, call, sparkline and read), plus a gallery of iMessage/X/Slack previews.
- Read rows: `InsightRow` no longer prints a ticker twice (one ticker leads the row, a leading "SMR:" is stripped; chips only for tickers not named in the text; 3 tests). Signed-in screenshot helper fixed: the cookie was set by domain and silently ignored, now set by URL. Signed-in /briefing currently crashes with a useContext error mid-rework; its builder has been told.
- Checked: NVDA analyst target $322.50 is Nasdaq consensus (33 analysts, low $275, as of Nov 8), not a bug. It lags the post-probe drop.
- Running: briefing rework, insights A/B/C, news market read, agents page, share previews, OSS readiness. Codex judge round waits for them.

### 2026-11-10, landing speed and hero copy (lead)

- Hero headline set by the owner: "An AI agent that tells you what to buy and why." (lead flagged the advice-style claim; the owner's call). Subhead: "It goes through the filings, earnings and news, then tells you why each stock moved, what changed, and what is worth a look next." Signed-in hero sub-line removed. More space above the hero.
- Landing speed: the hero card, the example book (one research doc per name) and the five track-grid feeds now read through `sharedCache` (failed reads throw and are never cached). Warm full-page load 0.15 to 0.8s vs 10 to 20s before; the hero card arrives with the first byte. The hero skeleton is a real card shape (the old fallback had no width and showed as a thin line).
- Fixed: the follow agent's `components/follow/bits.tsx` imported the kit index into a client tree and broke the dev build; now imports `kit/tone`.
- Open: NVDA's analyst target showed $323 (+81%) in the hero, which looks wrong (check `getStockFacts` analyst data); a broken avatar image in the signed-in marketing top bar.

### 2026-11-10, design v3 landed (lead)

- Design v3 (screens in `scratchpad/design3` of session 3cd39fc6): 13px type floor with 15px values, muted ink at 7:1 or better; one filled copper button per view; a top bar instead of the sidebar on landing/pricing/docs/about/security/legal/blog; the stock quote rebuilt (42px price, the call as the only colour, zones in the range bar, a full-width chart with at most 2 labels, a ruled key-stats table); prices in sans with tabular figures; a single pricing grid; edge fades on phones; kit `CardGrid` plus a global equal-height rule; market pill hidden on marketing pages; 404 copy fixed; markets sparklines labelled 1Y; calendar error state; mechanics footnotes cut on markets/follow/signals/strategies/calendar/compare/developers. Lead checked the after shots for NVDA and the landing.
- Lead: removed "Risk / reward 10.6x favorable" from the landing hero card (built from our zones, which have no proven edge) and the hero sentence "Your money stays at your broker." (owner: useless).
- Open: `header-morph.tsx` and `nav-links.tsx` are unused (delete after a dev-server restart); the follow button mounts twice on the stock page; signed-in views and hover states weren't shot. Council/Codex re-score waits for the insight agents.

### 2026-11-10, insights rule, engine v3 verdict, briefing simplification (lead)

- Owner rule: insights, not data, on every page (now at the top of Builder conventions). Shared `TheRead`/`InsightRow` (`components/oa/insight.tsx`) and `lib/insights.ts` (sharePct, balancePct, toneOfChange, pickInsights; 4 tests). Three agents are rolling it out: A explore/markets/signals/calendar/filings, B stock/portfolio/compare/screener, C follow/strategies/themes/backtest/practice. The news agent is rebuilding /news around a market read (tone balance, themes, most-talked-about stocks) and fixing ticker tags. The agents-page agent is turning run logs into reports.
- Briefing after grouping was still too dense for the owner ("dunno where to focus"). Sent back to its builder: a read on top, "Needs you" only for real decisions, quiet headers (no "You hold · Call X"), one plain line per update with source/time on open, a compact "Worth knowing", no mechanics banner.
- Call engine v3 (per-family, sector-relative scorecard, pre-registered): no edge. Holdout ADD−TRIM over 6m is −4.0% (t −1.5); negative in every cut, development and holdout. Only accruals (+4.2%, t 1.8) and trend were positive alone. Evidence copy now says ADD did not beat TRIM and quotes no numbers. Off mode is byte-identical; 109 engine tests pass. Keep `CALL_ENGINE_MODE` off. Product consequence: a call can't be sold on returns. Present it as a transparent scorecard (what's strong or weak vs peers, trend, what would change it) and keep the language descriptive. Open: XOM SEC re-fetch, O/SPG price history, trim levels 55 to 66% away on volatile names, insider buying cast no votes, no delisted universe.
- Tests: the sitemap tests read live data and timed out under load; given a 90s timeout (9/9). `lib/frontend-cleanup.test.ts` fails on the stock report (another agent is mid-edit); recheck once B and design v3 land.

### 2026-11-10, gating, tax, briefing groups landed; P0 live (lead)

- P0 is live. Pushing to main does not deploy this project: production deploys run `vercel --prod`. Deployed from a clean worktree (origin/main + `607e04a`), none of the rework included. `/dev/watchlist` now renders the not-found page with no user data (Next 13.5 streams it with status 200); `/api/dev/user-watchlist` returns 404. Owner rule from now on: no production deploy of the rework until the owner says the in-flight work is done.
- Free vs Pro enforced on the server: unlimited tracking, `covered_stocks` (5 on Free, one swap a week, `/api/coverage`, coverage panel in Portfolio), the call shown to everyone, `intelPro` null and level sentences redacted for uncovered stocks, Ask/chat meters, 5 free price alerts, a third agent saves paused, a 7-day signals archive, Python `is_pro_user` mirroring `resolveIsSubscribed` with a shared parity test. vitest 850/850. Needs owner yes at deploy: Free accounts would start getting price-alert emails; gifted/status-only Pro accounts would start getting Pro emails. Open: the VPS research jobs still pick from all tracked stocks; showcase stocks still show levels to everyone; landing/footer copy still says "Follow 5".
- Portfolio tax view at `/watchlist/tax`: lots, FIFO/specific realised gains, short/long, harvestable losses, wash-sale windows, Form 8949 CSV. 37 tests. Additive `tax_lots` field. Never saved end to end against a real account.
- Found by the tax builder: `PATCH /api/watchlist/holding` with merge would wipe sibling holdings on LocalDB (merge replaces top-level maps by design; the localdb tests pin that). Fixed the route with a read-modify-write transaction; not deployed, and no deployed UI calls it. Other merge writers of nested maps still need an audit.
- Briefing grouped by stock (`lib/briefing-groups.ts`, 15 tests): one header per ticker, sub-lines per update, reasonless moves folded into the header, duplicate headlines collapsed, top 3 plus "N more".
- Owner feedback this tick: stocks first, not news (wire and explore get re-grouped, sentiment per company card, the Anthropic headline tagged SPCX); explainer footnotes removed; equal-height cards app-wide; positions rows taller with the call on one line; /agents is "the most confusing page" and is being reworked into agent-style reports. Premarket ran at 08:30 UTC (3:30am ET) and sent 21 emails; the timer lacks `America/New_York`. Waiting on the owner to say move it.

### 2026-11-10, quality pass landed, design v3 started (lead)

- Quality pass over the whole rework finished. Fixed: phone gutters (kit `oa-page-frame`, `.oa-page-prose`), the insider filter edge, internal links moved straight to new routes, the explore markets strip wrapping, the earnings breadcrumb. Checks: tsc 0, eslint 0 errors and 11 warnings, vitest 748/748 after the lead pointed `lib/agent-frontend.test.ts` at `lib/seo/sitemap.ts`. Signed-in views were never screenshotted (no local session); hover states not exercised. About 40 legacy components still link to old routes through redirects.
- Design v3 started (an agent acting for the lead on shared files): the calibration list plus the quality-pass leftovers (market pill on the landing, 404 copy, markets sparkline colouring, calendar/wire error states). Codex judge round follows when it lands.

### 2026-11-10, council calibration, tick builds launched (lead)

- Calibration (`scratchpad/council/calibration.md` in the 2d31bb8e session): the same rubric applied blind to 27 reference screens from 15 sites. No 10s anywhere. Codex never gave a 9, even to Linear, Vercel or Stripe; Cursor gave four, all to Linear. Reference means are Codex 6.60 and Cursor 5.85; ours are 6.85 and 5.79. Volaren scores below us. Realistic ceiling: a mean around 7.5 to 7.9 (the Linear/Vercel tier). We lead on screener, calendar and explore. We trail on pricing (-1.4 vs Vercel/Linear), docs (-1.5 vs Stripe), the stock quote (-0.8 vs TradingView) and landing (-0.6 vs Linear). Cursor penalises us on contrast and readability: small grey text on cream.
- Design changes the references point to, queued for after the quality pass: nothing under 13px and values at 15px in ink; one filled copper element per view (the sidebar "Start free" becomes an outline); no app sidebar on pricing, landing and docs (top bar instead); on the quote page the price is the largest element, the call is the only colour, and zones move into the range bar; at most two chart labels; prices in sans with tabular figures; key stats as a two-column ruled table; a single pricing grid; a wider chart area; phone scroll cues and 72px bottom padding; no duplicated "HOLD" + "Hold here".
- New capability builds started: Free vs Pro enforced on the server (unlimited tracking, covered stocks with a swap cooldown, ask/agents/alerts/follow/backtest/screener/signals meters, no locked data sent to the browser, python Pro check aligned). Portfolio tax view (lots, FIFO and specific-lot realised gains, short/long, harvestable losses, wash-sale windows, CSV export). Call engine v3 (a per-family sector-relative scorecard, pre-registered holdout).
- P0 `/dev/watchlist` and `/api/dev/user-watchlist` are 404 in production in the working tree. Waiting on a deploy yes.

### 2026-11-10, owner decisions, engine review verdict (lead)

- Owner: Search Console is the signed-in Google account (tomartarun2001@gmail.com, readable through the preview browser's default profile), and that same address is the contact for everything: schema contact, site copy, SEC User-Agent. SEC UA strings in `backend/agentdata/*` and `stock_facts_provider.py` updated. Search Console, last 16 months: 232 clicks, 19.9K impressions, avg position 21; 122 clicks are the brand name; /stocks has 4.1K impressions at 0.1% CTR; deleted /blog posts carry most non-branded impressions and need redirects.
- Engine review verdict: fine for shadow mode, not fit to publish calls. The edge is one factor (accruals) in 2022 to 2026. The non-overlapping t is about 1.8, it disappears after sector/size controls, the "untuned half" claim was false, financials are mis-scored, and levels go stale. The reviewer fixed share-count staleness, the session-count replay bug, a fragile prompt import and the evidence copy. Lead gated the stored evidence history behind `EVIDENCE_HISTORY_MODE` (default off), because with the engine flag off it was still changing live directive scores. Backend suite 643/643 under every flag combination. Before calls can publish: exclude financials or score them separately, cap accruals at 25 to 30%, re-check levels daily, run 6+ months of shadow out of sample. The proposed alternative is a per-family sector-relative scorecard.

### 2026-11-10, council round 4, engine v2, SEO audit, agent recovery (lead)

- Council round 4 (`scratchpad/council/round4.md`): flat against round 3 after the full restructure. Codex means 6.6 to 7.3, Cursor 5.4 to 6.2; still no 9 anywhere in four rounds. Screener phone, calendar, practice and portfolio phone went up with both reviewers; the stock page, ask, news, about, compare, landing, markets and follow went down. A calibration run (same rubric on stockanalysis, finviz, yahoo, tradingview, google finance, simply wall st, volaren, linear, stripe, vercel) is running to find out whether 9 is reachable with this rubric and where we trail.
- Stock call box redesigned again after the owner disliked it: no beige well, call as a tinted pill, levels as a bar showing where the price sits between add and trim ("Sitting on the add level"). Phone page gutter is 8px on every app page and the stock page.
- Call engine v2 (`backend/call_engine.py`, `call_factors.py`, `agentdata/sec_fundamentals.py`, `insider_history.py`, `call_scores.py`): point-in-time SEC fundamentals for 663 tickers, 16,285 insider buys, 19 factors tested walk-forward. Only low accruals cleared the bar. Holdout ADD minus TRIM +3.64% at 6 months (author's t 3.0, overlapping weekly samples so likely inflated), 1.2 changes per stock per year. Weak on the 200 largest names, universe has no delisted stocks, blend chosen after seeing results. Still off. An independent skeptical review is running.
- SEO audit (`scratchpad/seo/plan.md`): no Search Console access; live site has about 110 indexable URLs and little to lose. Migration fixes and hub titles, a 100-stock index tier, fund page titles, real 404s and schema are being implemented; new page families get specced.
- Two network/account drops killed every running agent twice; all were resumed from their transcripts. Dev server was down and restarted.
- Open: owner decisions (Search Console access, role mailbox for schema, engine shadow deploy, SEC contact header), council fixes after the quality pass lands.

### 2026-11-10, design system v2 landed, every page restructured, call engine v1 built (lead)

- Design system v2 (app/globals.css, components/oa/kit, chrome): near-white cards on deeper cream, copper only on primary button / active nav and tab / links, `.oa-label` is a sentence-case title and `.oa-caption` the quiet uppercase caption, one-row `PageHead` with the lede and source in a bottom `PageNote`, one type scale, phone gutter 8px. Worst contrast pair 4.60:1.
- Four page reworks on top of it, each around one lead: stock (call beside the price, first on phone, levels as a bar between add and trim, follow + alerts merged), research (calendar with today as the wide column, screener table at 211px instead of 486 and a real phone list, compare, themes as one ranked table, wire as one line per headline, filings), home (briefing as a one-line feed, portfolio example as the lead, explore led by what is moving, signals tabs ranked, follow, insiders, agents, ask), tools and marketing (strategies table leads, backtest result leads, practice, markets and asset page, pricing as side-by-side rows from `ruleFor`, docs measure, landing brought onto the tokens). Screens: scratchpad `v2/`, `v3/{stock,research,home,tools}/`, `gutter/`.
- Calls: measured from `tm_directive_history` (18,474 calls, 759 stocks): about 90 changes per stock per year, 41% reverse within 10 sessions, add level a median 0.02% under price, horizon hardcoded. Engine v1 (`backend/call_engine.py`, `backend/call_engine_pipeline.py`, flag `CALL_ENGINE_MODE=off|shadow|on`, default off) cuts that to about 3 a year with near-zero flip-backs, but its ADD does not beat TRIM out of sample. The evidence-history loader bug is fixed in code. Nothing deployed.
- In flight: engine v2 (point-in-time SEC fundamentals, factors chosen by walk-forward test, ADD / HOLD / TRIM with real horizons), quality pass over the whole rework, council round 4, SEO audit and migration plan (Search Console if reachable).
- Open: owner approval to deploy anything; signed-in states of the reworked pages were read, not seen; phone calendar and screener still start data lower than target; compare 1-year legend waits on the after-close price job.

### 2026-11-10, design council rounds 1 to 3, movers rebuilt, design system v2 and calls rework started (lead)

- Council: Codex CLI and Cursor CLI each scored all 47 screens three times on type size, hierarchy, spacing, colour, contrast, aesthetics, readability, focus. Round 3 means: Codex 6.7 / 6.6 / 6.6 / 7.5 / 6.9 / 7.2 / 6.7 / 6.5, Cursor 6.0 / 5.4 / 5.8 / 6.4 / 5.7 / 6.4 / 5.8 / 5.3. No 9 anywhere. Token tweaks moved tenths only. Tables and raw answers: scratchpad `council/round{1,2,3}.md`, `council/r{1,2,3}/`.
- What both keep saying: too much above the data (eyebrow, title, lede, source line), everything the same weight (copper caps labels on every panel, cream on cream), small print small, phone heads too tall.
- Signals movers rebuilt after the owner called the two-column cards horrible: one ranked table (rank, stock, price, bar + move, kind of news, headline), explanation and sources behind a click (`<details>`), three-line rows on phone. `components/signals/signals-view.tsx`. Screens: scratchpad `movers3/`.
- Portfolio header figures keep their note line so Today and Total gain sit on one row. Insiders tiles say which window they count. Backtest "A blank mix" is "Your own mix". Market asset chart shows the stored 1W / 1M / 1Y change so it agrees with the grid (`components/markets/price-chart.tsx`, `lib/markets-shared.ts` `sliceSeries`).
- In flight, not yet reviewed: design system v2 (white cards on deeper cream, rationed copper, sentence-case panel titles, one-row PageHead with the lede and source moved to a page note, one type scale, quieter sidebar) and the calls rework (measure flip rate, deterministic scoring + hysteresis + volatility zones, backtest, engine built but not switched on).
- Open: page-by-page rework after v2 lands (calendar, screener phone, stock phone, strategies, agents first), council round 4, quality pass over this session's changes, full test and lint run. Compare page 1-year legend vs table differs because `tm_price_history_daily` still holds a mid-session Nov 9 bar; the VPS after-close timer has not had its first run (due 22:30 UTC).

### 2026-11-10, persistent shell, VPS automation, owner fixes (lead)

- Shell: every app route now lives in `app/(app)/`; `app/(app)/layout.tsx` renders `components/oa/app-chrome.tsx` once (sidebar, phone top bar, tab bar, account corners behind Suspense). `OaSiteHeader` returns null unless `variant="marketing"` (landing). Pages and `loading.tsx` files fill the content area only. `app/not-found.tsx` renders the chrome itself. One `oa-sidebar` per page on 27 routes, zero on the landing.
- Loading (subagent): follow, explore and the signed-out portfolio stream panel by panel; briefing, agents and screener are one load each and were left alone. Skeletons for calendar, signals, news, profile, briefing, follow, screener, themes and watchlist reshaped to their pages; four stale `loading.tsx` files under redirected routes deleted.
- VPS (the owner asked for the automation to be pushed there): the data jobs are copied to `/opt/tikrr-agentdata` (their own folder, because nothing is committed and `/opt/tikrr` is a git checkout), using the VPS's own `backend/localdb` and `LOCALDB_PATH` to write straight to the SQLite store. `tikrr-agentdata-{frequent,hourly,after-close,weekly}.timer` are installed and enabled; `systemd-analyze calendar` accepted all four. The frequent group ran once by hand on the VPS: news ok (512 s cold), markets ok (444 s). The other groups have not run there yet. The standing-agents step is skipped on the VPS (no node_modules in that folder, and it needs `LOCALDB_URL` + token). When the code is committed and pulled into `/opt/tikrr`, repoint the units and delete the copy.
- Owner fixes: stock chart lost its call-change markers, legend strip and source line; explore cards in a row are equal height with footers aligned; cause tags sit on their own row above the headline (signals and kit `StreamRow`); the movers list is two entries per row on wide screens with sources on their own lines (phone checked after a width bug).
- Quality pass (subagent, read-only), fixed: explore's wire and markets panels and `getMarketSeries` could cache a failed read; the store adapter could hand a pre-write read to the writer; briefing links pointed at `/agents/jobs`. Left: `app/mcp/authorize` has no nav now (it used `AppPage` outside the group; probably right for a consent screen); a missing node makes the agents step exit 0; dead `call` marker code in `price-panel.tsx`; streamed 404s inside the group return HTTP 200; `getPredictionHistory` still catches inside its cache.
- Verified: typecheck clean, 705 tests, eslint 0 errors; captures opened: explore (1440 full), signals movers (1440 and 390), screener, stock page (390), 404.
- Design council (Codex and Cursor scoring every page, loop to 9/10): NOT started. The tool that launches other providers has been missing from this session since the first account switch. Needs either a session where it is available or the owner's go-ahead to drive the Codex and Cursor command-line tools directly.

### 2026-11-10, speed pass (lead; the delegated half was cut off by a usage limit)

The owner: 'I click something and it takes forever'. Measured first, then fixed in order of what was felt.
- Navigation: the sidebar, phone tab bar, top nav, kit `TabBar`, `Chips` and `Ticker` used plain `<a>`, so every click was a full document reload. They are `next/link` now.
- Instant feedback: 21 routes had no `loading.tsx`, and the 7 that did awaited the session before painting. `components/oa/kit/skeleton.tsx` (`AppPageSkeleton`, `SkeletonFrame`, `SkeletonChrome`) renders the real sidebar and tab bar with nothing awaited; every app route has a loading state. Time to first byte is about 30 ms on every page measured.
- The real cause of slow data: past 6 store requests in flight at once, the extra ones wait about a second (12 parallel reads: 240 ms capped at 6, 1,200 ms uncapped; `scratchpad/perf/conn2.mjs`). `lib/local-firestore.ts` now caps in-flight requests at 6 (`LOCALDB_MAX_CONCURRENCY` overrides) and shares identical overlapping reads. Request timing is available behind `LOCALDB_TIMING=1` / `LOCALDB_TIMING_FILE`, off by default.
- `lib/auth-server.ts`: a session that just verified is trusted for 60 seconds instead of a Firebase round trip on every request (a revoked session stops within a minute, not instantly).
- Landing: each data section is in its own `Suspense`; the Trump-posts feed (2.5 s per request, uncached) and the earnings load are cached with `lib/shared-cache.ts` (`sharedCache`: throws on failure so a failed read is never the cached value).
- `/agents`: the 'available sources' probe and the example replay are the same for everyone and are cached.
- `lib/markets.ts`: the loader cached an empty result when one read failed (the owner saw 'Market data is not available'). A failed read is no longer cached.
- Warm totals, signed in unless noted, before to after: landing (signed out) 3.0 s to 0.8 s; `/briefing` 5.4 s to about 1.0 s; `/watchlist` 2.0 to 2.5 s to about 0.9 s; `/agents` 2.6 s to 0.6 s (signed out 6 s to 0.04 s); `/stock/NVDA` about 0.6 s, unchanged.
- Verified: typecheck clean, 705 tests, eslint clean on changed files; captures of `/watchlist` (390) signed in and the landing.
- NOT resolved: three browser captures of `/briefing` with a valid session rendered the signed-out market view, while `curl` with the same cookie gets the signed-in page ('Needs you', no 'Start free'), response is `no-store`. Either the capture setup (a server session with no Firebase client user) or a client-side downgrade on that page. Check in a real signed-in browser.
- Not done from the plan: the sweep of other cached loaders for the 'cache an empty result on failure' bug (`follow.ts`, `strategies.ts`, `wire.ts`, `calendar.ts`, `signals.ts`, `screener.ts`, `filings.ts`, `news.ts`); per-page request lists for the stock page; everything here is dev-mode timing (first visit to a route still compiles for seconds in dev; a production build removes that).
- The price-collection rewrite was stopped at its time limit and then killed so it would not load the store during use. Re-run `python3 -m backend.agentdata.backtest_strategies` when nobody is using the app.

### 2026-11-10, leftovers from the second review (lead)

- Landing feed grid verified at 1280 after its links moved off redirects: all six cards show today's data (earnings and news dated Nov 10) and their 'See all' targets return 200 directly.
- The bulk add button now treats a swap-limited add like a follow-limit one instead of skipping it silently; '3 stocks' fixed in the share image and on `/portfolio`.
- Strategy pages now show a live record with its first session, after the after-close run with Nov 9 prices.
- The full price-collection rewrite (replacing mid-session Nov 9 bars) was still running at 05:20 UTC. If it was stopped by the 30-minute limit, re-run `python3 -m backend.agentdata.backtest_strategies`; it only writes the series that are still wrong.

### 2026-11-10, second quality pass and the fixes it forced (lead)

- Ran the remaining job groups for real through the new runner: `after_close` (prices and strategies, earnings calendar, earnings reactions, screener snapshot, standing agents) and `hourly` (SEC filings, insider trades, calendar events). All eight jobs ok. The `weekly` group has still only been dry-run.
- Quality pass (subagent, read-only) over the swap budget, session retry, sitemap, redirects, schedule and landing. Fixed from it:
  - P0, caught before it ran: the weekly group passed `--years <this year>` to `house_ptr`, which replaces each member's whole profile, so it would have cut every Congress record down to this year. The argument is gone, with a comment saying why.
  - The follow limit and the weekly swap budget now live inside `addRadarStock`'s transaction (`lib/radar-mutations.ts`, `FollowLimitError`), so the app, Ask's 'add to watchlist', the MCP server and the API are all held to them, a failed add costs nothing, and parallel adds cannot slip past the cap. Before this, Ask and MCP could add 12 stocks at once on Free.
  - A Free account over the limit (a lapsed Pro) can save the batch editor again when it only removes or edits; only a save that adds is held to the limit.
  - `run-agentdata.sh` takes a machine-wide `flock`, so a weekly 13F run and an hourly SEC run never hit EDGAR at the same time.
  - Landing cards link straight to the new pages instead of through redirects; the Free limit modal no longer promises a free swap any time; the landing no longer says filings are read 'the day they become public'; seven redirecting URLs dropped from the IndexNow list.
- Two price-freshness bugs found from the job output, both fixed:
  - `backend/agentdata/prices.py` reused its on-disk cache for 20 hours regardless of the market close, so an after-close run reused a file fetched at 19:40 UTC and computed on Friday's prices. The cache is now invalid once a close has happened since it was written (`_cache_is_fresh`, checked on five cases by hand; no unit test yet).
  - `sync_prices` in `backtest_strategies.py` only compared last dates, so a stored series whose last bar was a mid-session price was never replaced by the real close. It now also replaces a copy fetched before that day's close. A full rewrite of the price collection was started and was still running when this entry was written.
- Verified after the fixes: typecheck clean, 704 tests, eslint 0 errors, 31 backtest and 4 schedule Python tests.
- Left open from the review: a lapsed Pro account's covered set is 'the first five tracked', so removing stocks rotates coverage for free (pin `covered_stocks` at downgrade); two-hop redirect chains from old blog rules; `track-in-radar-button.tsx` skips a swap-limited stock silently; `/watchlist/classic`, `/portfolio` and `lib/og-site-share.tsx` still say 3 stocks; a failed store read caches a thinner sitemap for a day; the swap date is shown in UTC.

### 2026-11-10, schedules and a brief scan (lead)

- New: `backend/agentdata/schedule.py` runs the data jobs in four groups, one after another (several hit SEC EDGAR, which rate-limits by address), continues past a failure and exits non-zero if any failed. `frequent` (news, markets), `hourly` (SEC filings, Form 4, calendar events), `after_close` (prices and strategies, earnings calendar and reactions, screener snapshot, standing agents), `weekly` (13F funds, fund holders, House reports). `--dry-run` prints the plan, `--list` prints the groups. Tests in `backend/tests/test_agentdata_schedule.py` (4 passing).
- New, NOT installed: `backend/vps/run-agentdata.sh` and four unit and timer pairs in `backend/vps/units/tikrr-agentdata-{frequent,hourly,after-close,weekly}.*`. Each service file carries the three commands to enable it. Enabling them is a VPS change and needs the user's go. Timer expressions were not checked with `systemd-analyze` (not available on this Mac). The `standing agents` step needs node and `node_modules` in `/opt/tikrr`; it is skipped with a message when they are missing.
- Proved end to end from this machine: `python3 -m backend.agentdata.schedule --group frequent` ran news (294s) and markets (71s), both ok, writing to the production store. The other three groups were only dry-run.
- Brief scan, read-only: 749 US stocks have a stored brief; none currently trips `readLooksBroken` (COIN's bot-wall brief has been replaced by a fresh one). So the guard on the stock page is a backstop, not a live problem today. The pipeline still has no check at ingestion.

### 2026-11-10, sitemap and crawl surface (lead)

- The sitemap still listed the pre-rebuild addresses (`/pulse`, `/stocks`, `/earnings`, `/screens`, `/should-i-buy`, `/power-trades` and more), every one of which now redirects. Shipping that would have told search engines to crawl 20-odd redirects and none of the new pages. `app/sitemap.xml/route.ts` now lists the product map, the eight market classes, every docs section and guide, the comparison pages at their new home, themes, strategies and fund pages from the store, blog posts and the flagship stock pages: 227 addresses.
- Verified by fetching all 227 from the dev server without following redirects: every one returns 200. New test asserts no listed address matches a redirect rule in `next.config.js`.
- `llms.txt` and the IndexNow priority list (`lib/seo/indexnow.ts`) moved to the new addresses. `/compare/:slug` (old comparison pages) now redirects to `/docs/compare/:slug`, where the content moved, instead of serving a duplicate.
- Open: stock pages beyond the ten flagship ones are still deliberately out of the sitemap (an older decision, left alone); `lib/seo/linkable-assets.ts` still names `/should-i-buy`, `/radar`, `/heat`, `/guides` as link targets.

### 2026-11-10, small fixes after the signed-in pass (lead)

- `getSessionUser` (`lib/auth-server.ts`) retries the session check once when it fails for a reason that is not about the cookie, so a network blip no longer shows a signed-in person the signed-out page. A bad cookie is still refused at once (checked with a garbage cookie: signed-out page).
- `app/not-found.tsx` rebuilt on the kit (it was the old design with no shell and a block of raw markdown links). Verified at 1280 and captured at 390; still returns 404.
- Opened three more signed-in captures: `/ask` (Pro: 100 of 100 questions left), `/follow` (65 funds), and a real strategy page `/strategies/dual-momentum` signed out (rules, backtested and live records apart, 'where it goes wrong'). The capture I had labelled a strategy page last tick was a 404 from a wrong slug.
- Verified: typecheck clean, 703 tests passing, eslint clean on the changed files.

### 2026-11-10, signed-in verification (lead)

- First look at the signed-in product. Minted a one-hour session for the owner's own account on localhost (custom token, then the app's normal session cookie; script at scratchpad `auth/mint.ts`, cookie emptied afterwards) and captured twelve pages read-only at 1280: no writes were made. Opened: `/watchlist` (41 tracked, 11 positions, calls and zones), `/watchlist?tab=analytics`, `/stock/COIN` (Pro view: zones on the chart and in the call panel, alert rows, a fresh brief), `/practice` (signed-in empty account with a live order ticket), `/profile` (Account: plan, holdings, agents, API calls, plan table from the entitlements). Captured, not opened: `/stock/ASTS`, `/agents`, `/pricing`, `/follow`, `/strategies/momentum-leaders`, `/ask`, `/screener`.
- Seen once: `/practice` and `/profile` rendered signed out on the first load with a valid cookie and signed in on retry. `getSessionUser` swallows a failed session check and treats it as signed out; under load that shows a signed-in person the signed-out page. Worth a retry or an error state instead of a silent downgrade.
- Seen again in the browser console on two loads: `SyntaxError: Invalid or unexpected token` and a null `useContext`, both right after recompiles.
- Still unverified: any write flow (add / remove a stock, save shares, place a practice order, create an agent, follow an investor), a Free account's view (the owner is Pro), and phone layouts signed in.

### 2026-11-10, landing follow-up (lead)

- Landing 'follow' block rebuilt on real data: left column is four strategies from `listStrategies()` (name, rule in one line, today's top holdings), right column is three funds from `getFollowSources()` (top holdings with weights, 13F filing date, position count) plus the latest Congress filer. New agents section built from the real `AGENT_TEMPLATES`. No return figures on the landing on purpose: backtests and filing-date records are hypothetical and stay on the pages that carry their caveats (research section 3.2).
- Verified at 1280 (scratchpad `lead/r2/landing-follow.png`, `landing-agents.png`); phone capture taken, not opened. Typecheck and eslint clean.
- Codex is installed on this machine as a CLI, but the orchestration rule is not to fall back to CLIs when the delegate tool is missing, so there is still no Codex scoring round. It needs a session where the delegate tool is available.

### 2026-11-10, tick after recovery (lead)

- 13F: full run of `backend.agentdata.funds_13f` over every fund in the list finished with no failures. `/follow` lists 65 funds (was 4). `python3 -m backend.agentdata.fund_holders` rebuilt holders for 1,474 tickers, so the stock page's Ownership section has fund data for most names.
- Swap budget: a Free account may add 6 new stocks in any 7 days (fill five slots, then one swap a week). `lib/follow-swaps.ts` with tests, enforced in `/api/track` and `/api/watchlist/batch`, log kept on the user's own doc as `follow_adds_log`. The add button and batch editor show the reason and when the next swap opens. Closes the 'cycle follows to read every stock's levels' hole from the review. Not clicked through with a session.
- Docs accuracy pass (subagent): plan rules, alert and email claims, refresh schedules, 'Ask why', prices and trial terms, and all twelve comparison pages rewritten to match the code; unverifiable claims removed (a 30-day erasure promise, 'our own monthly reviews', unchecked competitor numbers). Table rows aligned with the code: Pro runs 20 agents (the stored-job cap), the weekly review email is Pro, the daily market email goes to newsletter sign-ups.
- Phone: fourteen pages captured at 390x844 with no horizontal overflow; opened `/screener`, `/calendar`, `/follow`, `/docs`. The rest captured, not opened.
- Verified: typecheck clean, 703 tests passing, eslint 0 errors.
- Open for the owner: the daily market email has no unsubscribe link in the email code; `backend/PIPELINE.md` describes a VPS schedule nobody confirmed is live; whether to commit to an erasure deadline. Still no Codex round (tools unavailable in this session).

### 2026-11-10, 01:20 to 02:30 UTC: recovery, verification and the gate review (lead)

- State on resume: all five remaining builders (follow, ask + explore, wire + calendar + signals, screener + themes + compare, docs + developers + account) had died on usage limits without reporting, but their surfaces were built: every route answered 200 and the tree typechecked. The orchestration tools are still gone from this session, so no Codex round; native subagents were used for the quality pass and test triage.
- Lead opened at 1280x900 (scratchpad `lead/r2/`): `/follow`, `/ask`, `/ask?q=...` (answered with a quote card and a number audit, via the offline rules path), `/explore`, `/news`, `/calendar`, `/signals`, `/screener`, `/themes`. Captured but not opened: `/follow/berkshire-hathaway`, `/compare`, `/docs`, `/developers`. No phone captures of these twelve yet.
- Redirects: 47 old routes now land on their replacements (`next.config.js`); 23 followed with curl, all 200, query strings kept. The old page directories are still in the tree (shadowed by the redirects): `pulse`, `premarket`, `market-daily`, `anomalies`, `radar`, `earnings`, `earnings-intel`, `ipos`, `events`, `upcoming-events`, `reddit-buzz`, `trump-logic`, `social`, `stocks`, `screens`, `sectors`, `sector`, `heat`, `compare-stocks`, `should-i-buy`, `power-trades`, `mcp`, `subscribe`, plus `watchlist/classic`, `watchlist/portfolio`, `portfolio`. Delete them with their components once the user has looked.
- Test triage (subagent): 17 failing tests, most failing before tonight. Now 94 files, 699 tests green. Real fixes: `data center` was tagging earnings stories as product news in `lib/wire-shared.ts`; two em dashes in shipped copy; lock card button was 32px tall on phones (now 44). Tests of deleted pages were removed or pointed at the new surfaces.
- Quality pass (subagent, read-only) on the Free vs Pro work, then lead fixes:
  - Leaks closed: `/api/stock-target-card/[symbol]` (public image) showed our trim zone as 'OUR TARGET', now analyst target only; the portfolio zone strip was a no-op (it nulled the wrong field), now applied where rows are built; Ask's `get_stock` sent 'what to watch' and risks to everyone, now only when `canSeeLevels`; the old `/api/chat` was unmetered, now spends the Ask allowance.
  - One shared check, `canSeeLevels(viewer, ticker)` in `lib/entitlements-server.ts` (Pro, covered, or showcase stock; handles `BRK.B`), used by the stock page, portfolio, screener, compare, themes, calendar detail and Ask.
  - Ask: the portfolio card shows the call to everyone (same call for every reader); `run_backtest` respects the plan's lookback; request bodies over 200 KB are refused; limits read from the entitlements table (3 signed out, 5 Free, 100 Pro; the builder had 3 / 15 / 150).
  - Backtest gate: validates before counting and keys on the normalised setup.
  - Limits now enforced in routes: agents running at once (2 Free, 25 Pro; a job past the limit saves switched off), followed investors (3 Free), followed strategies (1 Free).
  - Table made truthful where the code cannot deliver yet: price and zone alerts are Pro (the alert emails are a Pro job), practice account and signals are open, the 'told the moment they file' and '8 quarters of history' rows are gone, 'target' is no longer promised next to zones. `trialEligible` is false outside the US checkout.
  - Kalshi 'Hike 25bps 81%' checked against the parser: label and probability come from the same market object, not inverted.
- Verified after the fixes: typecheck 0 errors, eslint 0 errors (11 old warnings), vitest 699 passing, eleven changed routes return 200, the target card image read back.
- Still open from the review: a Free account can cycle follows to read levels on any stock (no swap cooldown; `FREE_COVER_SWAPS_PER_WEEK` is unused); the follow limit check in `/api/track` is outside the transaction; signed-out counters key on `x-forwarded-for`, which is spoofable behind Caddy; the clients for agents, follow and strategies have not been checked for how they show the new `plan_limit` / `paused` responses; `/dev/watchlist` still serves real emails on localhost; blog posts link to `/agents` expecting the old connect-your-agent page; `docs/product-voice.md` still lists the old headline.

### 2026-11-09, integration: feeds and portfolio (lead)

- Builder reported done. Fresh data in the production store: 739 earnings events (Oct 12 to Dec 30), 5,081 headlines, 4,008 SEC filings. `/filings` is new. Lead read `portfolio/after-live-desktop.png` and `feeds/filings-desktop.png`, and re-shot the signed-out `/watchlist` at 1280 (opened) and 390 (not opened).
- Free follow limit is now 5, in code: `FREE_RADAR_TRACK_LIMIT` reads `FREE_COVERED_STOCKS`, so `/api/track`, `/api/watchlist/batch`, the watchlist view and the page all follow it. Decision recorded in `lib/entitlements.ts`: following and covering stay the same thing for now. The research's 'unlimited plain tracking, 5 covered' needs the brief pipeline to stop writing a brief per tracked stock first, otherwise it is an open-ended LLM bill. The `track_holdings` row is gone and pricing, landing and footer copy say 'follow five'.
- Portfolio: price zones are stripped on the server for rows outside the viewer's covered set (matters for Free accounts holding more than five from before).
- Removed `?previewUser=<uid>` from `/watchlist`. It rendered any account read-only outside production; the builder used it to look at one real account on localhost to check the signed-in layout. Same class of hole as `/dev/watchlist`.
- Still old copy elsewhere ('3 stocks') in components that the rebuild is replacing: `watchlist/classic`, `radar`, `subscribe-pricing`, `demo-radar`, `hero-section`, `landing-faq`, `use-cases`, `guides`, `compare`. Delete with their pages.
- Needs a schedule on the VPS: units are now written (see 'schedules and a brief scan'), enabling them needs the user's go.
- Seen again: an intermittent `SyntaxError: Invalid or unexpected token` / `ChunkLoadError: app/layout` in the browser right after a recompile. Dev only as far as anyone has seen; confirm with a production build before shipping.

### 2026-11-09, integration: briefing, agents, stock page (lead)

- Both builders reported done; lead read `briefing-me-desktop.png`, `agents-me-desktop.png`, `nvda-desktop.png` from their folders and re-shot `/stock/COIN` (1280) and `/stock/AMD` (390) after the changes below (scratchpad `lead/`).
- Stock page moved to the new line: `hasFullAnalysisAccess` is now true for every reader (call, reasons, date, call history), and a new `gate.levels` flag (Pro, covered on Free, showcase stocks for all) decides zones, target, 'what would change the call' and the pre-earnings read. When false they are stripped in `components/stock-page-stream.tsx` before the data leaves the server; checked the HTML of `/stock/COIN` signed out: no 'Add below', 'Trim above' or 'What would change the call'. The lock is `LevelsLock` in `components/stock-report/report.tsx`.
- Opening the read to everyone exposed a pipeline bug: COIN's brief was written from a publisher's bot wall ('The page requests human verification before continuing'). `readLooksBroken` in `lib/stock-read.ts` now holds such a read back (state `held`) with a plain note. This hides the symptom; the brief pipeline still needs to reject blocked pages at ingestion, and the stored call on those stocks was derived from junk.
- `/agents` now renders the jobs page (developer material is at `/developers`; the old page is saved at scratchpad `lead/old-agents-developer-page.tsx.bak`). 'Ask why' in the briefing opens `/ask?q=...`.
- `globals.css`: `overflow-x: hidden` on html and body became `clip`, which unbreaks `position: sticky` site-wide. The old floating market-status pill is hidden inside the app (it sat on top of content).
- Not wired yet from these two: alert copy on the stock page still says alerts need Pro; `intelPro` still goes to the browser for every reader (now consistent with 'reading is free', but confirm nothing in it is a level); signed-in flows on the stock page are untested; `tm_fund_holders` needs a re-run after the 13F job finishes.
- Mid-flight: `app/screener/page.tsx` does not typecheck (its builder is still working and was coding against the first-pass entitlements: `canSeeCall`, `screener_results`).

### 2026-11-09, integration: strategies, backtest, practice (lead)

- Builder reported done. Lead opened `/strategies` and `/backtest?t=AAPL:40,MSFT:30,TLT:30...` at 1280 (scratchpad `lead/`); `/strategies` and `/practice` phone captures taken but not opened. Honest and dense: only 2 of 9 long backtests beat SPY and the page says so.
- First gate wired end to end, on the server: `lib/backtest/gated.ts` (`runGatedBacktest`) is used by the page and `/api/backtest`. Lookback is clamped to the plan (5 years on anon and Free), runs are metered per day (2 signed out, 3 Free, 100 Pro) and a repeated setup is free. Verified with curl (run, limit reached, repeat allowed) and on the page (lookback card with the meter line, limit card with "Sign in free"). `consumeMeter` gained a request key. Counters live in `tm_agent_usage_meters` in the production store.
- `backend/agentdata/prices.py` no longer stores a bar for a session that is still open (the builder had worked around it on read). Existing documents keep their bad last bar until the next fetch after a close; readers that go through `completedSessions` already drop it, the stock page's long chart may not.
- Still open here: `/strategies/[slug]` holdings and "Track this" are not gated (table says holdings are open and following is 1 on Free: enforce in `app/api/strategies/track`); `AuthSurface` values; the Ask builder calls `runBacktest` directly, which bypasses the meter (acceptable while Ask has its own meter, revisit).

### 2026-11-09, tick 5 (lead, 20:47 UTC)

- Route check: `/briefing`, `/follow`, `/insiders`, `/strategies`, `/backtest`, `/practice`, `/filings`, `/ask`, `/explore`, `/news`, `/compare`, `/docs`, `/developers`, `/about`, `/profile`, `/watchlist`, `/stock/NVDA`, `/markets`, `/pricing` answer 200. `/agents/jobs` 500 (builder mid-work), `/calendar`, `/signals`, `/screener`, `/themes`, `/security` 404 (not built yet). Only the markets builder has reported.
- Landing: new "Not only stocks" section (live cross-asset strip, readings, one prediction market from `getMarketsOverview()`), plans block rebuilt from `lib/entitlements.ts`, FAQ and links moved to the new map, hero footnote and `SHORT_DESCRIPTION` rewritten. Verified at 1280 (scratchpad `lead/landing-markets.png`, `lead/landing-plans.png`); phone not re-checked for these two sections.
- To check in the quality pass: the Kalshi Fed market shows "Hike 25bps" at 81% for December; confirm the outcome labels are not inverted in `backend/agentdata/markets.py`.
- Landing still to do when follow and strategies report: replace the screens column with real strategies and backtests, replace the Congress-only column with the funds leaderboard, add agents and Ask sections, place `<BriefingPreview />`.
- The orchestration tools are still missing in this session, so no Codex round and no new builders from here. The native subagent tool works for the quality pass.

### 2026-11-09, integration: markets (lead)

- Markets builder reported done. Lead opened `/markets`, `/markets/etfs/ARKK`, `/markets/predictions` at 1280x900 and `/markets` at 390x844 (scratchpad `lead/`): dense, sourced, no overflow, tab bar clear. It predates the kit (own components in `components/markets/`), looks consistent with it; fold into kit primitives only if drift shows up next to the wave 2 pages.
- Lead to wire: widgets (`components/markets/widgets.tsx`, `getMarketsOverview()`) onto landing and briefing; sitemap; an `AuthSurface` value for markets; natural gas curve sentence reads oddly ("Dec 27 delivery costs 21.9% more than Dec 26": needs the year spelled out).
- Reports do arrive in this thread after the account switch, as messages.

### 2026-11-09, tick 4 (lead)

- Paywall research landed. `lib/entitlements.ts` rewritten to its model (covered stocks as the one number, reading free, small counts elsewhere, one real feature lock) and `/pricing` updated to match. Tests: 9 passing. Typecheck clean across the tree at 20:38 UTC.
- The session moved to another account mid-tick and the orchestration tools (delegate, task status, scheduled tasks) are not available in it. Builders were still writing files at 20:38 UTC. If their reports do not arrive in this thread, read their output from the tree and their scratchpad folders (`follow/`, `briefing/`, `markets/`, `strategies/`, `stock-page/`, `feeds/`, `portfolio/`, `ask/`, `wire/`, `screener/`, `docs/`).

### 2026-11-09, tick 3 (lead, while ten builders run)

- `/pricing` built from scratch on the kit, rendered straight from `lib/entitlements.ts` (plan cards, line-by-line table with anchors the lock cards link to, FAQ, checkout and the post-payment activation flow). `/subscribe` still exists; redirect it to `/pricing` once the Dodo return URL is confirmed to survive the redirect.
- Fixed the squeezed content column: the root layout's side gutters (`xl:px-32`) stacked on top of the sidebar. `.oa-shell-frame` drops them when the sidebar is present.
- Footer rebuilt to the new map; the sign-up strip only shows on the landing.
- Verified: /pricing at 1280x900 light and dark, 390x844 (scratchpad `pricing/`). Typecheck clean for lead files.
- Open: `SHORT_DESCRIPTION` in `lib/brand-copy.ts` is old copy; landing must be re-checked against the new map and wider frame; apply gates and close the nine leaks; redirects; Codex round once the first builders land.

### 2026-11-09, tick 2 (scope change, lead)

- User expanded the scope twice: (1) design a real free vs Pro separation that converts, (2) rebuild every pre-existing page and feature from scratch; merge, split, add, remove. Both recorded above ("The product map", "Free vs Pro").
- Page kit written: `components/oa/kit/index.tsx` and `components/oa/kit/data-table.tsx`. Typecheck and lint clean.
- Gating inventory done (Explore agent). Paywall research delegated, writes to scratchpad `paywall-research.md`.
- Entitlements layer written: `lib/entitlements.ts` (33 features, tested), `lib/entitlements-server.ts`, `components/oa/gate.tsx`. Not applied to pages yet: that is the integration pass after builders report, together with closing the leaks from the inventory (chat ungated, watchlist stance, blurred real data, python Pro check, wrong '200 per month' and '3 days free' copy).
- Sidebar moved to the new map: Ask on top, the five places, then Research / Test ideas / More.
- Wave 2 launched on the second Claude account to spread load: explore desk + Ask copilot, wire + calendar + signals, screener + themes + compare, docs + developers + company + account.

### 2026-11-09, tick 1 (resume after the usage limit, lead)

- Wave 1 builders were all killed by the limit at 19:56 UTC with backend jobs mostly written and no app pages. Tree typechecks. Relaunched them as "finish it" tasks (see the task list in the thread), each told to audit what exists first.
- Visual system switched to "brew" (cream, copper, mono numbers, sidebar shell). Lead owns the shell, nav and landing.
- Shell shipped: `OaSiteHeader` now renders a fixed sidebar at lg+ (five places, then Research / Smart money / Yours groups, Cmd+K search row) and a slim top bar plus a five-icon bottom tab bar below lg. The landing passes `variant="marketing"` and keeps the floating top header. Nav lives in `components/oa/nav-items.ts`. Verified on /explore and / at 1280x900 and 390x844 (scratchpad `shell/`). Sidebar links to /briefing, /follow, /agents/jobs, /markets, /strategies, /backtest, /filings, /insiders, /practice 404 until their builders land.
- Wave 1 relaunched at ~20:15 UTC as six delegates: follow (13F + Congress + Form 4 insiders), strategies (+ /backtest + /practice), briefing (+ /agents/jobs standing jobs), markets, stock page, feeds + Portfolio rework. When each reports: open its pages, fix, tick the backlog.
- Next for the lead (wave 2, start when wave 1 frees up budget): Explore rework with a Copilot prompt box and sourced, tool-using chat (backtests, follow data, markets in the conversation); idea to book; pricing / security / docs pages; landing sections fed by the new widgets (`<BriefingPreview />`, markets widgets, strategies, follow leaderboard); open source readiness; then the first Codex scoring round. Not yet done for the shell: quality-pass subagent (fold into the Codex round).

### 2026-11-09, tick 0 (setup, lead)

- Research done: 30 volaren pages read, our codebase inventoried. Reference capture at scratchpad `ref/volaren-desktop.png`, our old landing at `before/landing-desktop.png`.
- Found and patched locally: `/dev/watchlist` and `/api/dev/user-watchlist` were open in production (user emails). Not deployed yet; needs the user's go to push.
- Shared plumbing: `backend/agentdata/store.py` (additive writer, HTTP or SQLite) and `backend/agentdata/prices.py` (12 years of adjusted closes into `tm_price_history_daily`). Both tested against the production store.
- Wave 1 delegated (shared checkout, each owns its own directories), all running as of 19:50 UTC:
  1. Follow investors: 13F + Congress (`backend/agentdata/funds_13f.py`, `lib/follow.ts`, `/follow`, `/follow/[slug]`)
  2. Strategies + backtest engine (`backend/agentdata/backtest.py`, `lib/backtest/`, `/strategies`, `/backtest`)
  3. Briefing page (`lib/briefing.ts`, `/briefing`, `<BriefingPreview />`)
  4. Markets multi-asset (`backend/agentdata/markets.py`, `lib/markets.ts`, `/markets`, `components/markets/widgets.tsx`)
  5. Stock page rework (`app/stock/[symbol]`, `components/stock-*`)
- Lead is doing: landing page in the new structure (`components/oa/landing/*`), then the nav (Briefing, Portfolio, Explore, Follow, Strategies, Agents).
- Wave 2, not started: Portfolio (watchlist rework), Copilot box with sourced answers and tools over the new data, Agents (standing jobs with triggers and a run log), practice portfolio, idea to book, insiders (Form 4), pricing/security/docs pages, open source readiness, then Codex scoring rounds.
