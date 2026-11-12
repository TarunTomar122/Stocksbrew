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

Every judge (Codex and Cursor) and every builder gets `docs/owner-design-rules.md`: the owner's own feedback as a rubric. Judges list every break of it (page → element → rule) before suggesting anything, and never suggest what it forbids (per-card Ask icons, accordions, coloured edges).

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
- [ ] Results night (PARKED, owner decides): built in lib/results/*, components/results/* and wired into the stock page, inbox, briefing card facts and earnings season, but every loader returns empty unless RESULTS_NIGHT=1. Example reads: CRWV "lost $1.27 a share, less than the $1.55 expected, up 25% today, bigger than its usual 17% move after a report"; CEG "beat by 30%, rose 10%, 5.2× its usual"; QLYS "beat by 14%, fell 14% the next day". 9 open QA bugs before switching on: inbox headline ignores results; rows dated by store time ("the next day" undated); "overnight" includes the previous morning's reports; rounding mismatches; repeated call line in inbox rows (rule 1) + old call shown for uncovered stocks; failed per-stock read cached as complete; "call reviewed" from updated_at; empty 4th figure slot; beat/miss judged after rounding. Revenue + guidance need EARNINGS_DAY_ENABLED=1 and the earnings-day timer on the VPS; then drop either the new block or EarningsDayStockEntry.
- [ ] Speed: stock page and briefing fast and snappy (owner's main focus after the Nov 11 UI round). Structural rework in progress (ship 24): stock page 580KB → <200KB, markets 460KB, portfolio loaders.
- [ ] Short interest (FINRA): blocked on terms. FINRA's equity data terms (Dec 2022, 2.2/2.3) allow non-commercial use only; the Reg SHO daily files say "free for non-commercial use". Owner decision: ask FINRA for written consent, or revisit after the free/open-source switch. Notes and PDFs in scratchpad/finra/. Build is ~1 day once cleared.
- [ ] Inbox: built (bell + /inbox), ships with 24.
- [ ] Premarket back in Today + briefing stock cards (in progress).
- [ ] No-repetition sweep across every page (in progress).
- [ ] Evidence-backed calls: built (lib/call-evidence.ts; stock page, backend what_would_change, Ask agree), ships with 24. Open: no quarterly revenue stored (sec_fundamentals --write), call_reason.py still says "if sales slow sharply" on briefing/compare/landing.
- [ ] Emails rework: research competitors, council-scored rebuild, examples gallery (in progress).
- [x] Steady calls in prod: working. Briefs are written by tikrr-open-briefs (after open-movers-price, ~14:57 UTC) and tikrr-close-briefs (~21:30 UTC); the first stabilised writes landed 15:08 UTC Nov 11 (16 state docs moved, history rows for AAOI/DELL/SOXL under tm_call_stability_history/{id}/calls/{day}). Gap: only ~150 of 719 briefs rebuild per day (--incremental, --brief-cap 160), so quiet stocks keep older briefs without the `stability` field until rebuilt; a cheap no-LLM pass could add it (product call).
- [ ] Site chrome payload trim (~40KB per page) (in progress).
- [x] Ship 23 + 23.1 live (Nov 11).
- [ ] Since-your-last-visit briefing: changed calls, material holding moves and agent findings since the last open (judge's top ask; needs a last-visit field on the user doc).
- [ ] Thesis agents on top of lib/thesis-watch: a checkable reason per holding, monitored nightly, surfaced in the briefing only when it breaks.
- [ ] Judge visuals list: logos on backtest SPY/TLT inputs and AMD "What changed"; comparison bars on compare, themes vs SPY, X-ray mix vs S&P, inbox report moves; prices on inbox report cards and signals rows.
- [ ] Word budget: the backtest, sectors, AMD overview and insiders intros, the inbox AAPL alert (28 words), the landing FAQ answers.
- [ ] Delete the dead overview code once ship 72 has been live a day (components/portfolio-home/*.tsx, portfolio-ask-hint, shares-prompt, lib/portfolio-home/{loop,questions,focus}).

## Log

Newest first. One entry per tick: what changed, what was verified (with screenshot paths), what is still open.

### 2026-11-12 ~22:20: PRODUCTION DOWN: Vercel blocked the team (fair-use limits), every page returns 402

- **What happened:** ship 84's deploy failed with "Your Team exceeded our fair use limits and has been blocked", and since then stocksbrew.online returns HTTP 402 on every page. It's most likely tonight's volume: about 15 production deploys, plus judge and perf test traffic against production.
- **Owner action needed:** Vercel dashboard → team billing / usage for yourtraceonline-5491s-projects. I can't resolve this from here.
- **Now:** no more deploys or pushes; builders and judges make no production requests (local :8000 only).
- **Ready-to-ship queue, local branch `ship-queue`:**
  - ship 84: /portfolio/ideas visual, approved after 11 council rounds
  - queued next once approved: the quote snapshot plus the speed pass, the word-budget sweep, agent proposals
- **Once Vercel is unblocked:** deploy the queue in ONE batch, not one deploy per feature.

### 2026-11-12 ~21:50: ship 83 live (web + backend, VPS 601a707)

- **83:** data-freshness audit, rounds 2–3, after 3 council rounds.
  - Ask and MCP read live rows (value = shares × live price; "current" only when the view's source_version matches).
  - Buy dates are kept when shares and cost are unchanged.
  - Reasons and alerts refresh on the shared "list changed" signal, with an extra refresh after rebuilds.
  - An emptied list gets an empty view (old brief and events kept only while the set is unchanged).
  - Account deletion switches off alerts and agents without deleting docs.
  - A crossed alert with emails off is marked fired.
- **Ideas visual:** round 10 (rows level, with real content in the shorter cards).

### 2026-11-12 ~22:00: ship 82 live; judge (cursor stand-in) 6.5; next wave started

- **82 (f4e0892):** the judge sweep.
  - logos and comparison bars on backtest, compare, themes, analysis and inbox
  - prices on inbox and backtest cards
  - intros cut and a one-line FAQ
  - VOO whole rows
  - the 320px top bar and bottom nav fixed
- **Judge** (scratchpad/judge81/cursor.md; Codex locked until 22:25):

  | Score | /10 |
  |---|---|
  | UI | 6.5 |
  | UX | 6.5 |
  | usability | 6 |
  | wording | 6 |
  | agent feel | 5.5 |
  | volaren similarity | 5.5 |
  | sell | 6 |
  | overall | 6.5 |

  Flat vs 71: the visuals improved, but data disagrees across pages and the word-budget breaks are everywhere.
  - Its top 5: one quote snapshot per request; a word-budget CI guard; a shared VsBar plus kind icons; Holdings as the agent's desk; bold: agent proposals (the agent drafts an action, you accept or dismiss).
- **Started:**
  - agent proposals (tm_agent_proposals, accept/dismiss safe in-app actions)
  - the one-quote snapshot (compare vs stock page, sectors "Today", inbox day words, VOO after-hours timer, stale options reads)
  - the word-budget and visuals sweep (VsBar, kind icons, a guard test)
- **Audit round 2 fixed:** buy dates kept on save, Ask/MCP from live rows, reasons reload, empty-list views, refresh after basket/Ask/import, alerts-tab freshness, account deletion switch-off.
- **Owner decisions needed:**
  - bug 10: agents on removed stocks
  - bug 12: Taxes listing removed stocks' lots
  - re-added stocks bringing back old reasons and lots
  - earnings-reminder emails (built, flag off)

### 2026-11-12 late night: ships 78–81 live

- **78 (2f204f2):** stock page.
  - Positive/Negative on every news headline (the same tone source as /news; neutral rows stay bare).
  - Technicals as charts: averages on a price line, an RSI gauge, signed return bars with log scale past 250%, support and resistance on the 52-week bar.
  - A one-line refresh note replaces the modal (shown only when the price is really from before today's open, and both lookups read).
  - What changed is de-duplicated.
- **79 (4885440):** compare "our pick" card.
  - 9 measures with noise bands; our call weighs most; reasons only where the pick beats EVERY stock.
  - A "too close" group within 5 points; shared wins are no one's lead; 30 tests plus seeded fuzzing.
- **80 (b80f7fb):** /news.
  - Good vs mixed-or-bad columns, rows paired to equal height, "No read yet" its own group.
  - Live prices from the stock page's quote; one tone per company; 15-word sentence-case headlines.
  - Lead call after 13 rounds: quoted phrases keep the source's casing.
- **81 (5f77ef7, web + backend via deploy-code.sh):** the data-freshness audit fixes.
  - Adding a held stock no longer wipes its shares.
  - Every edit rebuilds the per-user view (a coalescing queue); the guarded Python save never overwrites a newer view.
  - Removed stocks pause their alerts (additive paused_reason); paused alerts don't count against Free limits.
  - The edit sheet saves what it shows, with a version check (409 on another tab's change).
  - Earnings-reminder sender built but OFF (EARNINGS_REMINDER_ACTIVE unset): owner decision.
  - Holdings: no Edit button; tinted needs-a-look rows lead; alerts newest first.
- **Councils:** Codex hit its usage limit; cursor-agent --model auto stood in. The backend suite passes 1411 (3 pre-existing failures are unrelated).
- **Open:**
  - the /portfolio/ideas visual (round 8)
  - the judge sweep (320px chrome fix, then ship)
  - data-freshness-audit bugs 7 and 9–17
  - the owner decides on earnings-reminder emails

### 2026-11-12 night: ships 74–77 live; overnight run (owner asleep: "be ambitious, quality bar must not drop")

- **74 (8cc7b56):** research reports.
  - One-tap agent chips under "What to watch next" (rule-mapped to runnable templates, validated by parseJobDraft).
  - A shared report cache, tm_research_shared/{TICKER}: reused for anyone when ≤14 days old, written after the latest earnings, with no newer 10-Q/10-K/8-K and no call change. Unreadable dates count as stale; New York days are compared strictly.
  - Charging is atomic and keyed TICKER:key for both run and hand-over; locks fail closed.
  - 10 council rounds. Accepted residual risk: a rare race between a run and a hand-over can give one free report.
- **75 (796690f):** heatmaps v2.
  - Every item is a tile with its name and price; sqrt sizing with a 38% cap; centred labels; no chip rows; nothing dropped.
  - Planned at 304px phones; size order holds across the screener sectors.
- **76 (69c4c11):**
  - share cards: /portfolio shows the holdings; news has the real move and whole one-line headlines; compare has bars and today's prices
  - headings a step above body text (.oa-label 17px, small h2/h3 at 17/16)
  - no gap in "What would change it" (lone caps only when a sibling shares the line)
- **73 (afe5f73)** earlier: small text ×1.1.
- **77 (2a4d11b):** "Since you looked …" heads /briefing. It shows real changes on your own stocks since your previous visit:
  - call changes
  - moves measured from the first close after the visit
  - agent findings
  - broken reasons
  - results
  - insider buys and filings
  
  Visits are stored additively as briefing_visits on the user doc; a failed read never uses up a visit. 5 council rounds.
- **Codex council** hit its usage limit (back 10:25 PM); councils run through cursor-agent --model auto meanwhile.
- **docs/data-freshness-audit.md** (new) maps how edits to your stocks reach every page. 17 bugs, including data loss: "Add to watchlist" on a held stock wiped its shares and cost. A builder is fixing the web side plus backend code (backend deploy pending).
- **In flight:**
  - holdings sheet hardening (council approved; ships with the audit fixes, since they share a file)
  - compare "our pick" card (round 2)
  - stock page news tone and visual technicals
  - /portfolio/ideas visual (round 6)
  - /news tone columns (round 11)

### 2026-11-12 evening tick: "since you last looked" briefing (new capability) + council rounds

- **New capability, building:** a "Since you last looked" module heading /briefing for signed-in users. It shows real changes on your stocks since your previous visit:
  - call changes
  - big moves with a confirmed reason
  - agent findings
  - reason checks that broke or recovered
  - earnings out
  - insider buys and filings
  
  Visits are stored additively as `briefing_visits` on the user's own doc. This was the judge's #1 for agent feel. lib/thesis-watch already covers "thesis agents" (reasons per holding, nightly checks), so the new module surfaces its breaks.
- **Council blocks, being fixed:**
  - heatmaps v2: briefing tiles losing price on phone, a height cap that could drop holdings, size order not holding across screener sectors
  - news tone columns: unknown tone kept distinct, both columns balanced, no note without evidence, sentence-case headlines
- **Also building:**
  - research agents and shared cache
  - the visual /portfolio/ideas
  - the judge sweep (logos, bars, word budget, VOO and backtest layout)
  - share cards: the /portfolio card still drew the removed overview; /news showed NVDA +2.9% on a −5% day; compare prices were from Nov 11

### 2026-11-12 late: ships 70–73 live; Codex judge 6.5; owner round on heatmaps, overview, news, research, ideas

- **70 (8c3af50):** live and smoke-tested.
  - true treemaps, with a logo on every stock tile
  - Signals as one page
  - What moved only with a reason
  - the My stocks grid with no stock twice
  - QA follow-ups: /signals#reddit redirects, a zero move draws no bar, "This week, so far"
- **71 (8027704):** the briefing rebuild after 6 council rounds. Its QA fixed two problems:
  - weekend and overnight "today" labels
  - premarket top news keeping the move its headline was matched to
- **72 (ea2190f):** the My stocks overview is REMOVED (owner: "holdings directly is what i want, we dont need overview since briefing is there").
  - /portfolio opens on Holdings; signed-in "/" goes there.
  - Every ?tab=holdings link is now /portfolio, and the filter params are live (not CDN) keys.
  - Holdings mobile cards plus filters: sector, call, size, kind, near level, reports soon, moving. 4 council rounds.
  - One Edit for the list; outside Edit a row opens the stock.
  - Dead code left in place: components/portfolio-home/*.tsx (the old overview), portfolio-ask-hint, shares-prompt, lib/portfolio-home/{loop,questions,focus}.
- **73 (afe5f73):** small text ×1.1 inside page content (13→14.3, 13.5→14.85, 14→15.4).
  - The owner picked this after side-by-sides; all text at 1.1x broke the phone.
  - Navigation, fixed-height chips, leading-3 labels and heatmap tiles ([data-tile], [data-need], .oa-type-fixed) keep their size.
- **Codex judge (live, ship 71), overall 6.5:**

  | Score | /10 |
  |---|---|
  | UI | 6.5 |
  | UX | 6.5 |
  | usability | 6 |
  | wording | 6.5 |
  | agent feel | 5.5 |
  | volaren similarity | 5.5 |
  | sell | 6 |

  - Top asks: a "since your last visit" briefing; layout and clipping on backtest and VOO; missing logos and comparison bars on backtest, compare, themes and inbox; word-budget cuts on the backtest, sectors, AMD and insiders intros and the FAQ.
  - Bold idea: persistent thesis agents. lib/thesis-watch already exists; build on it.
  - Full text: scratchpad/judge71/codex.md.
- **In flight (builders):**
  - heatmaps v2: every item a tile, no chip row, compressed sizing, centred labels. The QA found the planner dropping sectors and holdings; being fixed.
  - news: positive vs mixed/negative columns; the stock-page refresh notice rebuilt small and inline
  - research report: suggested agents per "What to watch next" item, plus a shared report cache (≤14 days, invalidated by newer earnings, filings or a call change)
  - /portfolio/ideas rebuilt visual-first: concentration bars, figure cards, loss bars, essays folded

### 2026-11-12 night: ship 69 (emails) live; councils clear the treemaps, visuals sweep and My stocks

- **69 (dbcf0c3):** all 16 emails rebuilt as stock cards (logo, name, price, labelled moves).
  - Hand-set price alerts email again: a fresh-quote gate, plus the day move against the previous NYSE session.
  - backend/mail/nyse.py is a rule-based holiday calendar.
  - The VPS is on dbcf0c3; mail tests 135/135.
- **Council approvals, about to ship:**
  - heatmaps: round 7 (clip detection, re-measure on data change, logo on every stock tile)
  - visuals sweep: round 5 (sector names wrap, compact one-sector card, day words)
  - My stocks overview: round 8
- **My stocks, rounds 6-8:** the council caught a stock drawn twice, as a holding card and again as a week mover.
  - WeekCells now works out each view's on-screen holdings (4 widths × folded/open).
  - A mover hides wherever its card shows.
  - New test: components/portfolio-home/week.test.tsx.
- **Still in council:**
  - briefing: round 5, the Keep badge repeated on past-day cards and the pre-open heading
  - holdings mobile cards and filters: round 2, card links to the stock, filter subset rule, a truthful sort label, an opaque sticky bar

### 2026-11-12 evening: ships 66-68 live (stock page council-approved)

- **66 (a2eb814):** stock-page fact cards with signed bars; figure-led "What would change it"; prose fallbacks removed; good/watch signals on every tab from lib/stock-signals.ts (the "lean against the call" chip was dropped on council advice); the Market open pill is plain text; What changed is capped at 15.
- **67 (7321e08):** the company name is the heading, with the call as a chip.
- **e701fd9 (backend):** coin logos from the CC0 cryptocurrency-icons set; the job ran on the VPS and wrote 10 tm_stock_logos docs.
- **Council rounds so far:**
  - stock page: 4 rounds plus 3 for phase 2, now approved
  - My stocks: 5 rounds (UI 8)
  - briefing: 3 rounds
  - heatmaps: 6 rounds (rebuilt as HTML tiles with container queries)
  - emails: 5 rounds (14 of 16 approved)
  - visuals sweep: 3 rounds
- **New builder:** mobile holdings cards (as in the owner's reference app) and watchlist/holdings filters (sector, call, near level, reports soon, moving, size, funds).

### 2026-11-12 afternoon: ships 63-65 live, plus a council gate on every visible change

- **Live:**
  - **63 (c4fec5f):** signed-in visitors land on holdings, the heat fill, equal-height cards, the premarket pill.
  - **64 (1e38426):** Analysis insights (one bet in disguise, sector ideas, panels ending level); the memo packs its sections into rows; Ask answers when to buy or sell and sets the watch; inbox dedupe.
  - **65 (46c3016):** any US fund covered on demand, mutual funds included; results night with revenue vs the estimate and guidance.
- **VPS:** the earnings-day timer and the fund-requests timer are enabled. EARNINGS_DAY_ENABLED=1. Earnings day wrote 8 reports on its first run.
- **New owner rule: council before ship.** Every visible change gets a codex APPROVE/BLOCK on screenshots before it ships. Template: scratchpad council-review65/prompt.txt.
- **In council loops now:**
  - stock page fact cards and figure-led checks (round 4 passed after the min-bar-width fix; ships with phase 2, the good/bad signals)
  - My stocks without the rail (blocked: sparse rows, repeated copy, bars, the fold button)
  - briefing visual band, top news, buy cards and treemap (blocked: order, one-line news, varied facts, tile completeness, paired heights)
  - signals one page (approved), What moved (approved), explore heatmap (approved), screener and markets treemaps (blocked round 3)
  - emails (12 of 16 approved; the price alert, rebalance, win-back and daily headline case are being fixed)
- **Built, not yet reviewed:** the visuals sweep across 23 pages.
- **Dev data:** this Mac can't reach the LocalDB over TLS (SSL_ERROR_SYSCALL), so the dev server runs with LOCALDB_URL=http://127.0.0.1:8501 through `ssh -fN -L 8501:127.0.0.1:8500 vps`.

### 2026-11-12 09:16 ET: brief repair requeue run (VPS)

- The dry run still showed 224 briefs that open on the coverage. `--requeue --limit 80` queued 80 for the next brief run; 112 are left for later windows, and 32 have no freshness doc (they need another path).
- **Next:** run the same command again tomorrow between 09:00 and 09:45 ET.
- **Builders started:** results night (9 QA bugs, revenue and guidance, one results surface); funds on demand (any ETF, plus a mutual fund decision); emails brought up to the owner rules, with a gallery. Still running: the visuals sweep and Ask setting watches. The postal address waits on the owner.

### 2026-11-12 ~13:30 ET: ship 62 live (b7224c8): Analysis redesign, wide briefing, funds, sell watches

- **Funds are first-class.**
  - /stock/VOO and 49 more funds have fund pages: cost on $10k, size, yield, past year vs the S&P, top 10 with logos, sectors vs the S&P with icons, and overlap with your stocks.
  - New tm_fund_facts and tm_fund_meta collections; 41 funds registered (additive).
  - Holdings were refreshed for 33 funds. The weekly agentdata timer keeps them fresh.
  - Funds show "No call on funds" (SCHD used to show "Buy more").
- **Analysis** (renamed from What you own): a 12-column canvas capped at 90rem, built from the council (codex plus cursor). It has paired panels, a single-strip swing figure, a logo scatter, strongest pairs, a full-width heatmap with show-more, and sticky section links. The mix cache key now uses 0.1% weights, which fixes the "largest = MSFT" tie.
- **Briefing:**
  - 90rem layout: Do today beside the heat, levels across, why it moved beside the week.
  - Prices on every card.
  - The heat is sized and ordered by the move.
  - Verdict colours come from day moves.
  - Show-more replaces inner scroll boxes.
- **Agents:** "tell me when to sell X" builds a sell_zone watch (our sell-some price, or the call turns to Sell some). There is a new call_change watch, and the refusal for real orders now offers a chip.
- **Integration fixes:**
  - share API paywall
  - the Free memo and share card gated
  - /portfolio/stress is a 308 to /portfolio/xray#crashes
  - stretched last cards removed sitewide
  - sharp binary traced for OG logos
  - dead code removed
  - Ask listed once in the nav
  - Tools card removed
- **Codex findings fixed:** stock-page facts one per line, insider clusters compact, calendar duplicates removed, landing agent cards, backtest copy, compare items-start, news one headline.
- **Also:** themes with logos and a narrower idea column; explore moves only with a reason, plus price; the alerts explainer line removed; shared sector icons (components/oa/sector-icon.tsx).
- **Verified:** tsc clean; vitest 3126/3126 both modes (llms flake rerun alone passes); eslint 0 errors. Live smoke test all 200 (stress 308). Live /stock/VOO screenshot read with real data. VPS b7224c8, with 42 backend tests passing.
- **Open:**
  - Sector icons and logos sweep on the remaining text lists (VISUALS CHECK added to the rules and judge prompt).
  - The inbox may double a call change. Ask can't create sell watches yet.
  - The /explore ticker strip still colours the 10-yr by sign.
  - Results block source line.

### 2026-11-12 ~11:30 ET: ships 58-61 live (5a86f97 landing, 7b1f3d7 stock page, 3f1b85f premarket job, 00455f9 morning batch)

- **Ship 58 (5a86f97): the landing page.** The split hero is back, with a live "What stood out" demo card (logo tabs; price; call with its own level; ≤15-word why; 3-month sparkline with the level) and the market check as four figure tiles. The /pricing h1 is cut to one line.
- **Ship 59 (7b1f3d7): the stock page.** No read block, no source lines under the facts and checks (they move to hover titles), no "Our call since…" line, and the What would change it bullets drop the bare threshold figure and use plain wording. The landing search opens the stock page. A TDZ crash (`bullet`) was caught on the local screenshot before the deploy.
- **Backend (3f1b85f, deployed with deploy-code.sh):** the premarket job now quotes SPY and QQQ, the example portfolio and users' holdings and watchlists, capped at 600, so the memo's dotted leg can show.
- **Ship 60 (00455f9): the morning batch, 294 files.**
  - Read blocks are gone everywhere (TheRead deleted).
  - The briefing is rebuilt as one column: you/S&P/gap/10-yr/VIX strip with verdict colours, Do today, a money heat grid, close to your levels, why it moved with confirmed reasons only, reports this week, and since you last opened (`last_briefing_at` / `since_at`, additive).
  - **What you own** at /portfolio/xray: concentration vs the S&P with fund look-through, overlap, swing drivers (own 252-day regression), a weight-vs-swing scatter, correlation clusters and heatmap, past shocks, what made the money, mix vs the S&P, earnings and calls, and dividends. Free/Pro split by `portfolio_analysis_deep`. /portfolio/stress redirects to it.
  - Visual share cards and OG images with logos, a chart and one big number, and no top borders.
  - Compare scoreboard (who wins each row).
  - Every table capped. The positions columns are reordered. Attention rows come first. Alerts are grouped by stock, and the "already below" fix is in.
  - Explore gets gainers/losers tables, a sector heatmap, and More markets verdict chips (lib/market-verdict.ts).
  - My stocks: price + day cards, a need-a-look fold with at least 4 cards showing, a Tools card, and a one-button menu.
  - Recent days are written in words (lib/day-words.ts).
  - The memo has a dotted premarket leg. Premarket hides unless today's data is in.
- **Verified:** on the frozen tree, tsc clean, vitest 3074/3074 both plain and PAYWALL_V2, eslint 0 errors. Builders' screenshots at 1280 and 390, light and dark. Live smoke test: every page 200, stress and premarket 307. Signed-in live captures of /briefing and /portfolio/xray read back (scratchpad live58/).
- **Judges on ship 60:** Codex rated UI 7, UX 6.5, usability 6.5, wording 6, agent feel 6, Volaren similarity 7, easy to sell 6.5, **overall 6.5**. Cursor failed on a network error. Codex's top fixes: stock-page and insider prose down to one fact each; movers as cards (not done, the owner wants tables); the fold (overruled, the owner wants at least 4 cards); duplicated calendar highlights; readable X-ray correlation. A judge-fix builder is on all of them except the two owner overrides.
- **Ship 61 (c3f2532):** plain numbers. A near-zero margin now reads "about breaks even", not "loses 0 cents"; a loss larger than the sale reads in dollars.
- **In flight:** the integration-fix builder (paywall leaks in the share API, Tools card and memo; stress links; stretched cards; briefing strip colours; share logos; dead code); the **funds builder** (funds as first-class: ETF coverage, tm_fund_facts, fund pages, import coverage); the judge-fix builder.
- **Open:**
  - The integration QA subagent is running.
  - The briefing strip colours a rising VIX/10-yr green on live; check the verdict wiring.
  - "Reports this week" shows "Mon 16" instead of the day word.
  - The share-card logos fell back to letters in the builder's shots.
  - The nav still lists Stress test (it redirects).
  - Dead code to delete: xray-view, components/stress, BookLead, EarningsDayBriefing, BeforeOpenCard.
  - The analysis builder printed the LocalDB token into its own transcript; the owner may want to rotate it.

### 2026-11-12 ~10:00 ET: tick in flight, three big rebuilds plus the owner's fix batch (nothing shipped yet this tick)

- **Owner feedback this morning, now in owner-design-rules.md and memory:**
  - grid cards keep a fixed width, with no stretched last card
  - stock cards show the price and today's % only
  - show the N that "need a look" and fold the rest
  - one primary button with a menu
  - the positions table column order
  - attention rows go first
  - alerts are grouped by stock
  - premarket shows only when today's data is in
  - More markets cards each give a good/bad-for-stocks verdict
  - plans mix familiar features with our own
- **Done in the tree (coordinator):**
  - the My stocks cards show the price plus day % only
  - the wide odd card is removed (My stocks and the landing one-place)
  - the /pricing h1 is cut to one line
- **Builders running:**
  - (1) owner fixes: read removal on the main pages, table max-heights, positions columns, attention-first sort, alerts grouping, empty cards, word budget, /explore gainers/losers + sector heatmap + More markets verdicts
  - (2) visual share cards and OG images without top borders
  - (3) the memo chart's dotted premarket leg, and premarket hidden unless today's data is in
  - (4) My stocks: the need-a-look fold, the Tools card, one-button menu
  - (5) the landing page: the split hero with a live demo card, back by owner request
  - (6) a ground-up **briefing rebuild** (plan: scratchpad council-briefing/plan.md, from the codex and cursor plans and a web research brief)
  - (7) a **deep portfolio analysis tab** (lib/portfolio-analysis: concentration vs S&P with ETF look-through, overlap, risk contribution, correlation clusters, past-year swings, crash tests, earnings exposure, calls rolled up, income)
- **Open:** integrate, verify, ship each batch with boxed before/after shots, then the judges.

### 2026-11-12 ~09:30 UTC (owner's morning), ship 57 live (348ce54); owner reverses "a read on every page" (lead)

- **Ship 57.** One currency on the plan cards. Visitors from India saw "$0" Free next to "₹99" Pro (a user reported it to the owner). Free now follows the market (₹0 or $0) on /pricing and on the landing's plans. The landing's Pro price and trial line now match /pricing (rupees for IN, no trial promise outside US checkout). Added `pricingMarket()` and `IN_PRO_MONTHLY_LABEL` in lib/pricing.ts. Live check passed.
- **Owner feedback (screenshots of reads on briefing, My stocks, agents, inbox and Market today).** "a main card with some highlighter... super useless to me... I would rather just go into the details myself... You might have to remove it from all the places." Rule 7 ("every page opens with a read") is reversed: the read block comes off every page.
- **Also from the owner:**
  - The positions/watchlist table had no max height. All tables get one (~8 rows, sticky header, hands the scroll back).
  - The memo's "Calls that changed" showed empty cards (NVDA Keep with nothing else). Cards with no information are dropped.
- **Signed-in checking.** The owner authorised using their account. A session cookie was minted server-side for their uid via the service account, kept at chmod 600 in scratchpad/signedin/cookie and never printed. scratchpad/signedin/shot.sh takes signed-in screenshots, and EXTRA_COUNTRY=IN fakes the country header.
- **Running.** One builder on all three owner items (scratchpad/ownerfix).

### 2026-11-12 ~09:30 UTC, ships 55 (020ee17) and 56 (af5df1b) live: your agent as a thread, results night on, bring your holdings in (lead)

- **Ship 55, "Your agent" (/agent, build A).** One dated conversation from the agent, oldest day at the top, scrolling to today on open.
  - The morning note is the briefing's read (holdings against the S&P, past days as chips, up to 3 points).
  - Every note is one real record: an agent finding, call change, result, alert, insider/investor trade, memo or coming report. It shows logo chips, the figure, the reason only when confirmed, "Our call: Buy more below $X" where the plan shows levels, and one step. Quiet runs are one line.
  - The reply box asks Ask with your stocks as context (saved to Ask history). "watch…" / "tell me when…" goes through /api/agents/parse with a confirm button before anything is saved.
  - The nav place "Alerts & agents" became "Your agent" (Notes, Agents, Inbox). Signed-in / goes to /agent.
  - 35 new tests. tsc and eslint clean. QA fixed a level leak, redaction on tickerless notes and intent routing.
- **Ship 56, results night (build B).** All 9 open bugs are fixed, each with a test. The gate is tested both ways.
  - Close-time quotes from 15:55 on count as the close.
  - **RESULTS_NIGHT=1 set in Vercel Production** (owner authorised shipping this build). Live check: CRWV, CEG and QLYS stock pages show the read, e.g. "CoreWeave lost $1.28 a share, less than the $1.45 expected, and the stock rose 25% yesterday, bigger than its usual 17% move after a report. Our call is still Buy more after the results."
  - Revenue/guidance needs EARNINGS_DAY_ENABLED=1 and the earnings-day timer on the VPS (steps in build B's report); then drop EarningsDayStockEntry (app/(app)/stock/[symbol]/page.tsx:156). Not done.
- **Ship 56, bring your holdings in (build C).**
  - Sources: a CSV from Fidelity, Schwab, Vanguard, E*TRADE/Morgan Stanley, IBKR or M1; Robinhood and Webull trades netted and flagged; generic files with a 2-pick column mapper; paste ("NVDA 25 @ 120"); screenshots.
  - The review shows value today. Cash, options, totals and money market are left out, each with its reason. GOOG and GOOGL are summed. Decimal-comma files are read correctly.
  - Saving is additive and merge-only; stocks not in the file are never touched (tested).
  - Entry points: /import, onboarding first, and a My stocks card when share counts are missing.
  - QA found a dead page-wide drop and 5 parser bugs; all fixed.
- **Checks:** 3041 tests in both modes. VPS pulled.
- **Open:**
  - Popular funds VOO, VTI and SCHD aren't in tm_search_index/tm_instruments, so an import reads "we do not cover VOO yet" (the example book shows VOO from static data). This coverage gap is worth closing.
  - /agent uses the briefing with persist:false, so if people stop visiting /briefing its day snapshot isn't written.
  - Signed-in save, ask and watch weren't run live end to end.

### 2026-11-12 ~08:30 UTC, owner: "such small fixes lol can we get back on doing ambitious things?" → three big builds in parallel (lead)

- The no-new-features rule from the overnight brief is lifted by the owner. They chose all three:
  - **A. Agent thread home** (/agent): one dated conversation from your agent (morning note, flags with figure, reason and call, next steps as links, quiet runs as one line). The reply box goes to Ask, and plain instructions create real watch agents. Signed-in / lands there; the example thread is shown signed out.
  - **B. Results night switched on:** fix its 9 open bugs, keep the RESULTS_NIGHT gate safe to flip, and report the VPS steps for revenue/guidance.
  - **C. Bring your holdings in:** CSV import for the big US brokers (Fidelity, Schwab, Vanguard, Robinhood, E*TRADE, IBKR, Webull, M1), paste parsing, column mapping, a merge-only review, and obvious entry points on My stocks and in onboarding.
- Each builder owns separate directories. They report y/x ranges so the before/after images can be boxed.

### 2026-11-12 ~08:20 UTC, ship 54 live (46985a2): an agent rail that says what it found, a JPM call that can't be misread (lead)

- **Round 23A.**
  - The agent rail on the briefing and My stocks opens with "Flagged NVDA, down 5.5% to $168.89 on Nov 10. Earnings and filings were quiet."
  - Rows show full names with their own times.
  - Normal-day multiples appear only from about 2× up, as "About twice its normal 1.0% day", and the 1.3× stamps are gone.
  - The memo bars are removed.
  - The NVDA flag is identical on the three pages and links to /stock/NVDA#call.
- **Round 23B.**
  - **JPM:** signed out, the call line reads "Buy more on a dip to our buy price, which is under today's $343." A test checks that only today's price appears as a dollar figure.
  - **Calendar:** "Each figure is how the stock moved after its last report." is said once. Phone days show their reports in a bounded list with Beat/Missed chips. IPO tickers have logos.
  - **News:** every ranked row has a tone (verified, Mixed, No clear lean, Too few stories to say). The feed continues with new companies.
  - **Market today:** US10Y reads "up 0.10 points", and the Options card uses plain bets-on-a-rise/fall wording.
  - **Backtest:** the headline is "The 60/40 mix gained 19.6% since Nov 2021.", and the stats are written as two plain sentences.
- **Checks:** 2945 tests in both modes, tsc and eslint clean, QA passes fixed. VPS pulled.
- **Judges on live 54** (scratchpad/judge54):
  - Codex: UI 7, UX 7.5, usability 7, wording 7.5, agent feel 7, similarity 7, sell 7, overall 7.
  - Cursor: UI 7, UX 7, usability 7, wording 8, agent feel 7, similarity 6, sell 7, overall 7.
  - Both still read it as "a collection of reports, not a personal assistant". This is the case for build A (the agent thread).
  - Small asks to fold into the next polish pass:
    - The "about twice its normal day" sentence repeats across 4 cards.
    - The "Example" line sits above headlines.
    - The calendar cards repeat the heading.
    - Scraped casing on FPT/Gartner/"$3 Billion".
    - The briefing cards are padded to equal height.
- Before/after pairs, boxed: scratchpad/ba54/*.png (shown to the owner).

### 2026-11-12 ~07:45 UTC, ship 53 live (4c3ab0a): the agent log back in the rail, shared comparisons said once (lead, overnight loop)

- **Ship 53 (round 22A).**
  - **Briefing:** the agent log is back in the right rail (owner rule 10). The read runs full width; Worth knowing and "Your other stocks" (3 across) sit beside a rail of "Your agents" plus the log, and the columns end within ~13px.
  - **Shared comparison said once:** "Compared with each stock's normal day:" sits above the grid, and each card shows only its multiple; a highlight line only when it's the card's own (a report soon, a big outlier month). The S&P month is said once on My stocks. No more "for it".
  - **Inbox (example):** NVDA appears once, in the read. The other stocks show their last report (date, move, "Beat by 39%" / "Reports Dec 10"), with "Seven beat profit forecasts; JPM missed." said once.
  - **My stocks:** Nov 17 is only on the NVDA card. Memo movers are cards with a contribution bar.
  - **Flags end with the price:** "drop to $168.89 on Nov 10".
  - **Checks:** 2940 tests in both modes. VPS pulled.
- **Alert email first run with the new code:** 07:15 UTC, `{'checked': 165, 'nothing': 165}`, clean.
- **Judges on live 53** (scratchpad/judge53):
  - Codex: UI 7, UX 7.5, usability 7, wording 7.5, agent feel 7, similarity 7, sell 7, overall 7.
  - Cursor: UI 7, UX 7, usability 7, wording 8, agent feel 6, similarity 6, sell 7, overall 7.
  - Both flag the JPM line "Buy more on a dip below today's $343" next to the locked level (reads as the threshold).
  - Other asks:
    - Memo bars repeat the numbers.
    - Calendar: "after its last report" per card, collapsed phone days, IPO logos.
    - News: missing tones; the feed restarts the same tickers.
    - Plain words: "+10 bps", "puts per call", "Return per unit of swing".
    - Backtest headline should have one number.
    - Agent rail: needs a lead sentence; row names are cut.
    - The "1.3×" multiple on ordinary moves.
  - Routed to rounds 23A and 23B.
- **Owner asks (Nov 12 morning).** Show before/after screenshots of each update in chat, with the changed spot highlighted. Done for ships 50→53 (scratchpad/ba/*.png, make.py with --boxA/--boxB); saved to memory.

### 2026-11-12 ~07:25 UTC, ship 52 live (ccd2c88): plain words for market jargon, figures that say when (lead, overnight loop)

- **Ship 52 (round 22B).**
  - **Market today:** "chance the Fed raises rates by 0.25 percentage points"; "Later gold contracts cost more…" with no "contango"; CSCO −8.4% labelled "after its last report".
  - **Backtest:** "Return per unit of swing", "Typical swing in a year", "Mix traded a year"; cost in % a trade; no bars in the year table.
  - **Compare:** "NVDA keeps 65¢ of each sales dollar as operating profit." with AMD underneath; "Where they differ" is a big figure, logo and a few words per row.
  - **News:** lede "191 stories on NVDA today."; the feed drops stories already in Most talked about.
  - **Calendar:** phones show ~12 a day with an inner scroll that hands off; report cards carry the analyst estimate.
  - **Insiders:** long buyer names cut.
  - **Stock page:** no extra Follow on phones when signed out.
  - **Checks:** 2935 tests in both modes. VPS pulled. 8 pages return 200.
- **Open.** lib/backtest/caveats.json is shared with the Python engine, so strategy caveats still say "basis points" and "Sharpe".
- **Running.** Round 22A (briefing log back in the rail, shared chips said once, inbox distinct, My stocks memo cards, findings end with the price).

### 2026-11-12 ~07:15 UTC, ship 51 (f3d1a43, backend only): every email rebuilt and switched on (owner: "fix all emails"; postal address later) (lead)

- **Owner's go.** "fix all emails no????" and "u dont need [the postal address] rn just make it work for now". backend/mail is committed after being held since Nov 11.
  - The alert email has the round 20 rows: logo, ticker and name, close, % move, the buy-more level, one date per section, stale findings dropped.
  - The daily is buy-more level first, then reports and moves more than usual, with no "rest of your stocks".
  - The weekly is best and worst weeks, day-by-day bars, next week's reports.
  - The footer shows the address only if STOCKSBREW_POSTAL_ADDRESS is set (unset for now).
- **Verified.**
  - Backend pytest: 1297 passed, 3 known failures; strategy_rebalance_notes now passes.
  - Rendered every email from the saved snapshot (scratchpad/email51) and read back daily, weekly and alert at 680 and 390.
  - VPS pulled, mail imports OK.
  - Timers: alerts every 15 min (next 07:15 UTC), daily 13:30 UTC, weekly Sat 14:00 UTC.
- **Open.**
  - Set STOCKSBREW_POSTAL_ADDRESS in /etc/tikrr/backend.env when the owner has one.
  - SOXL's logo renders blank in one email tile.

### 2026-11-12 ~06:45 UTC, ship 50 live (5b2cef7): conditions you can check with their source, a briefing that uses the whole width (lead, overnight loop)

- **Ship 50 (round 21B).**
  - **Example briefing.** The agent log runs full width under the stock grid as one row of tiles (kind, time, figure, flagged chips). There's no rail beside short content, so nothing ends early. Members keep the log in their rail.
  - **My stocks.** The rail stretches to the holdings, and the memo fills it with the week's movers (whole-row inner scroll, hands the scroll back).
  - **Landing.** The log is "Yesterday's check of the whole market". The agents section names its three agents as watching only the example's stocks.
  - **/stock/JPM.** Each change condition is its own block with a big threshold (7%, 4%, 10%) and its source ("From the 10-Q for the quarter to Sep 30, reported Oct 13" plus a results-release filing link). A source shared by two conditions is said once.
  - **Checks.** 2930 tests in both modes; tsc and eslint clean; QA found 6 issues, all fixed. VPS pulled.
- **Report.** The morning report artifact link broke after the account move; republished at https://claude.ai/artifact/PimEQ2tSUHUWmpAPXvrNMM.
- **Judges on live 50** (scratchpad/judge50):
  - Codex: UI 7, UX 7, usability 7, wording 7, agent feel 6.5, similarity 7, sell 7, overall 7.
  - Cursor: 7 on everything except similarity, which is 6.
- **Asks:**
  - Codex flags the full-width agent log as a rule 10 break: the owner's rule puts secondary material in the rail. The owner's rule wins, so the log goes back to the rail and the grid is rebalanced.
  - Repeated chip shapes should be said once (rule 1).
  - The inbox shouldn't restate the briefing.
  - My stocks: Nov 17 is said twice; the memo should be cards with charts.
  - Finding cards should end with the price.
  - Jargon: contango, Hike 25bps, Sharpe, bps.
  - "After its last report" labels.
  - Compare: one number in the headline.
  - News: one-figure lede; the feed repeats stories.
  - Calendar: the phone list is too long.
  - Insiders: names.
  - Stock page: an extra Follow on phone.
- **Routed:** rounds 22A and 22B.

### 2026-11-12 ~06:20 UTC, ships 48 (2b47556) and 49 (4e3f73c) live; agent email waits on the owner (lead, overnight loop)

- **Judges on live 47** (scratchpad/judge47):
  - Codex: UI 7, UX 7.5, usability 7, wording 7.5, agent feel 7, similarity 7, sell 7, overall 7.
  - Cursor: UI 7, UX 7, usability 7, wording 6, agent feel 7, similarity 6, sell 6, overall 7.
  - "NVIDA" was a judge misread; the page says NVIDIA.
- **Ship 48 (round 20, web part).** /agents run view and findings, from the owner's screenshots of the alert email.
  - One row per stock: logo, ticker and name, close, % move coloured, one short line.
  - Zone rows say "Below its $142.07 buy-more level". "Add zone" is renamed "buy-more level".
  - The date is said once per section; stale findings (NBIS Nov 9) are dropped.
  - Order: buy-more entries, then the biggest moves, then reports.
  - 2917 tests.
- **Email part not shipped.** backend/mail/alerts.py and tests are in the main tree, but the alert email rides on the held email redesign (kit/theme), which waits on the owner's yes and a postal address. Preview: scratchpad/round20/email-preview.html. Once approved, the VPS cron `backend.mail.jobs alerts` picks it up after a pull.
- **Ship 49 (round 21A).**
  - News: 8 rows in Most talked about and 8 company cards (two headlines each). Stories that name a past year as their news are dropped from ranking and leads; comparisons and fresh annual results are kept. Casing fixed ("re-entry", "turmoil") with names kept (RE/MAX, Apple Pay).
  - Calendar: day columns show 10–13 rows, then scroll inside; short headers.
  - Market today: equal-height cards; the report card adds the analyst estimate.
  - 2924 tests in both modes.
- **Running:** round 21B (briefing/My stocks reflow, landing agent story, stock page change conditions, identical NVDA next step).

### 2026-11-12 ~05:45 UTC, ship 47 live (95dee86): owner fixes (scroll, premarket, chart) + rounds 19A/19B (lead, overnight loop)

- **Owner feedback, live, this hour:**
  - **Inner lists trapped the scroll.** They carried `overscroll-contain`, so reaching the end of a list never scrolled the page, on phones or desktop. Removed from every page list; kept on popovers, sheets and dialogs. Proved with a CDP touch and wheel gesture past the end of a list (scratchpad/scrollchain*.mjs). Live before: the page moved 0px. Live after: 376–402px on /insiders, /news and /signals, phone and desktop.
  - **Premarket only before the open.** The nav adds it only from 4:00 to 9:30 ET on a trading day (components/oa/use-premarket-open.ts, after mount, so cached HTML never disagrees). The middleware sends /premarket to /explore at any other time (307, checked live).
  - **Stock chart month labels.** The marker lane only takes room when there are markers; the labels hang right under the plot, and the chart keeps a gap before the stats.
  - **Market today card.** "SOXX today" became "SOXX on the day".
- **Round 19A:**
  - One month figure (`monthChange`, SPY's 21 sessions) on My stocks, the briefing, the inbox and the landing; VOO reads −2.4% everywhere.
  - Inbox other stocks are fact cards with varied fact shapes.
  - Fragments are full sentences.
  - My stocks: one read instead of the money tiles, each agent row with its own time.
  - Landing: the three agents that ran, instead of a 9-card grid.
- **Round 19B:**
  - Stock page: the call and the name on one line; key facts as one-line rows under What changed; no legal line under the call; sourced change conditions ("half its 14% growth…", "about four times the 1.1% it usually moves apart from the index").
  - News: no motive inference, no bare "Mixed", 8-row lists, clickbait dropped or replaced by the publisher's own plain sentence.
  - Phone lists show 8 rows.
  - Compare: figures labelled; chart and table returns agree.
  - Market today: cards sized to their content.
  - Backtest: the date fields are filled.
- **Checks:** 2912 tests in both modes, tsc and eslint clean.
- **Rules doc updated:** scroll hand-off, premarket hours, chart axis, alert email rows.
- **Running:** round 20, the agent alert email. Zone rows say the move that reached the zone; rows show logo, ticker, name, price and %; the date is said once (owner screenshots).

### 2026-11-12 ~04:50 UTC, ship 46 live (6fb1a48): the call as the stock page heading, one NVDA flag from briefing to inbox to the call (lead, overnight loop)

- **Round 18A:**
  - **Briefing:** "Your other stocks today" is 9 cards with one fact each, full width under both columns; the rail and main column end together. Worth knowing leaves out the hero's stock. The example's own agents row shows "1 of 3 flagged" with an NVDA chip. The hedged Reddit mood line is gone (no per-post sentiment to measure).
  - **Continuity:** the briefing and inbox say the same flag ("Your agent flagged NVDA's 5.5% drop on Nov 10. … Check our call on NVDA before the report.") and both open /stock/NVDA#call.
  - **Inbox and My stocks:** inbox other stocks get a measured fact; the UNH card spans its row.
  - **Landing:** funds carry no call.
- **Round 18B:**
  - **Stock page:** "Buy more" is the heading, with one instruction ("Buy more on a dip below today's $343.") and the price beneath. The lock beside it names what the plan holds back. What changed rows are the link, with sources named once. The mechanics line is gone.
  - **News:** tone shows where 3+ stories are labelled; no dashes.
  - **Calendar:** PPI and IPO cards carry real context; weekdays size to their events.
  - **Compare:** labelled "Percent return".
  - **Explore:** cards end with our call.
- **Verified:** 2897 tests in both modes, tsc and eslint clean, both builders' QA passes fixed. VPS pulled. 10 pages return 200.
- **Open:** VOO's month reads −1.7% on the briefing/inbox but −2.4% on My stocks (two calculations). NVDA's own news (the Bernstein downgrade) left the briefing with the Worth knowing dedupe.
- **Judges on live 46** (scratchpad/judge46):
  - Codex: UI 7, UX 7, usability 7, wording 7, agent feel 7, similarity 7, sell 6, overall 7. Its best yet: agent feel and similarity both reached 7.
  - Cursor: UI 7, UX 7, usability 7, wording 6, agent feel 7, similarity 6, sell 6, overall 7.
  - Asks:
    - Facts must agree across pages (COST, VOO month; compare chart vs table).
    - Inbox other stocks as cards, with varied fact shapes.
    - Full sentences instead of fragments.
    - My stocks: NVDA's call, one read instead of money tiles, a time on each agent row (owner rule 10).
    - Landing: three watches that ran.
    - JPM: one line over the call, KPI labels, legal line, sourced change conditions, casing.
    - News: no motive inference, no bare "Mixed", ~8-row lists, clickbait titles.
    - Mobile lists ~8.
    - Compare labels.
    - Market today padding.
    - Backtest "To" date.
  - All routed to rounds 19A and 19B.

### 2026-11-12 ~04:40 UTC, ship 45 (7ceffa3, backend only): stock briefs open on what happened, not on the coverage (lead, overnight loop)

- **Round 17 cause.** 282 of 721 stored briefs open on the coverage. 137 of those were our own fallback ("Recent company-specific coverage is thin for X…"): the wrong-ticker check in `build_no_news_intelligence_doc` read "RSI" as another ticker and threw the model's body away. The no-news prompt also asked for "State that no company-specific development was verified".
- **Fix.**
  - backend/brief_lead.py holds the banned openers, the prompt rules and a deterministic check. A coverage-only opener with no number is dropped when the rest stands; anything else is kept verbatim and flagged.
  - Both prompts now require a first sentence about the company with a number, date or named event, and name the banned phrases.
  - The wrong-ticker check allows common acronyms.
  - Cache versions bumped.
  - 22 new tests. pytest: the 4 known failures only.
- **VPS.** Pulled and imports OK. The next brief runs (open-briefs ~14:57 UTC) use the new prompt.
- **Repair script** (backend/scripts/repair_brief_coverage_leads.py). Dry run on the VPS: 282 rows, 58 strippable, 224 to rewrite; nothing written.
  - Not run: `--strip`. Some "drops" still carry real news, e.g. AAP "restructuring under new management", so a rewrite is safer.
  - Not run: `--requeue --limit 80`. It must run 09:00–09:45 ET (after the pre-open news run resets the flag), then daily until the 224 are rewritten.
  - Owner/next tick: `cd /opt/tikrr && LOCALDB_PATH=/srv/tikrr-data/localdb/documents.sqlite3 .venv/bin/python -m backend.scripts.repair_brief_coverage_leads --requeue --limit 80`.

### 2026-11-12 ~03:50 UTC, ships 43 (858a40b) and 44 (f1a8435) live (lead, overnight loop)

- **Ship 43 (round 16A + lead)**
  - /news: stock-first. The duplicate ungrouped panel is gone; Most talked about runs full width, then the company feed. Every list is a fixed-height inner scroll with a fade where more lies below. Phone page 17,598px → ~2,900px. Lede: "NVDA has 177 stories today, up from 23."
  - /explore: every move card carries a confirmed reason or a measured price fact. Phones get the full set in the scroll. Prediction-market bars removed. Heading "Biggest stock moves" (lead).
  - /calendar: day columns share a height and scroll inside.
- **Ship 44 (rounds 16B + 16C)**
  - Example portfolio: one snapshot read by the briefing, inbox, My stocks and landing. Watched names are labelled. Landing weekly matches My stocks (−2.5%).
  - Agent feel: "Your agent flagged its 5.5% drop yesterday … Check our call on it before the report." on the briefing, My stocks and landing.
  - Briefing:
    - Other stocks each get one fact.
    - The agent log shows flagged logo chips with their move.
    - Stories our own numbers contradict are dropped.
  - Inbox: one line per stock and a one-line banner.
  - My stocks: the hollow last card is fixed.
  - Landing: one pricing heading; the Free button says "Pick your five stocks".
  - Stock page:
    - The call word, one level line and tight reasons.
    - One lock beside the level it hides.
    - What changed opens with the development ("JPMorgan partnered with OpenAI on Nov 11.").
    - Stored "fresh news centers on…" briefs are cleaned on read.
    - Doubled words are collapsed.
  - Compare: one-figure leads.
  - Backtest: three cards; the replay caveat is gone.
  - Insiders: the scroll fade, with all 162 rows reachable.
  - 2883 tests in both modes. VPS pulled. 9 pages return 200.
- **Open**
  - About 270 of 722 stored briefs open with "recent coverage highlights…" (fix belongs in the brief prompt, pipeline side).
  - The agent log chips show the move as of the run.
  - /portfolio/memo uses its own week numbers.
  - Backtest no longer states costs/short-record caveats (owner's call).
- **Judges on live 44** (scratchpad/judge44):
  - Codex: UI 7, UX 7, usability 7, wording 7, agent feel 6.5, similarity 6.5, sell 6.5, overall 7.
  - Cursor: UI 7, UX 7, usability 7, wording 8, agent feel 7, similarity 6, sell 7, overall 7 (up from 6). Cursor called the flagged NVDA plus next step "the first real agent beat".
  - Asks → round 18A:
    - The NVDA flag should carry from briefing to inbox to stock page in one tap.
    - Briefing other stocks as cards; NVDA once; the agents row's chips should be the flagged holding; a measured Reddit figure.
    - Inbox lines with facts.
    - The UNH span.
    - Funds without "Keep" on the landing.
    - Two Start free buttons on desktop.
  - Asks → round 18B:
    - JPM: call as heading, one instruction, rows as links, the development once, delete the mechanics line, a tangible Pro lock.
    - News: tone dash and casing.
    - Calendar: blank cards and the hollow Friday.
    - Compare: caption.
    - Market today: a next step.
- Capture gotcha: a zsh `for spec … set -- $spec` loop doesn't word-split, so captures silently skipped; use a bash script with `perl -e 'alarm 150; exec …'` around shotq.
- Running: 17 (brief prompt opener, backend), 18A, 18B.

### 2026-11-12 ~03:15 UTC, ship 42 live (2d9a92d): calls with their own level, What changed says what changed, sign-ins that say what they do (lead, overnight loop)

- Ship 42 (round 15B + lead):
  - Stock page:
    - The call heading is the call word. The next line gives the level against today's price. Signed out, the server sends only which side of the level today's price is on, never the number (tested): "We'd wait for a dip from today's $343 before buying more." plus one quiet link to the gate.
    - Chart dots removed (E boxes stay).
    - What changed opens with a deterministic subject line ("Three of the 14 stories on JPM in the past week are about AI.").
    - Ledger rows use the call words.
  - Compare: a one-number headline ("NVDA keeps 65¢ of each sales dollar as operating profit, against 18¢ for AMD."), no "rows won", the table ends on whole rows, call cards show their own level where the plan allows.
  - Backtest: a cost sentence instead of mechanics, and a new drawdown card.
  - Insiders: cluster rows are ticker only. The read ends with "Start with LBRT …" plus two links.
  - Lead: in-page sign-ins name their action.
  - 2863 tests in both modes. VPS pulled. 9 pages return 200.
- **Judges on live 42** (scratchpad/judge42):
  - **Codex:** UI 7, UX 7, usability 7, wording 7, agent feel 6, similarity 6, sell 6, overall 7.
  - **Cursor:** UI 6, UX 7, usability 7, wording 6, agent feel 6, similarity 5, sell 7, overall 6.
  - **Codex's top issue:** one example portfolio everywhere. LLY shows on the briefing but not in My stocks, and weekly figures differ.
  - **Other asks:**
    - News should be stock-grouped and bounded.
    - Mobile movers set; facts on the extra movers; prediction-market bars.
    - Calendar column heights.
    - Inbox holdings as plain lines.
    - Briefing chips need facts; the agent log needs flagged logo chips.
    - My stocks: hollow last card and the rail.
    - Landing: kicker and two Start frees.
    - JPM: wall of text, two locks, What changed should lead with the development.
    - Compare: one number.
    - Backtest: three tiles and the replay caveat.
    - Insiders: scroll discoverability.
- **Running:** rounds 16A (news, explore, calendar), 16B (briefing, inbox, My stocks, landing, one example book), 16C (stock page, compare, backtest, insiders).

### 2026-11-12 ~03:05 UTC, ship 41 live (944afae): an agent log that reads in two seconds everywhere, a full example inbox, one Start free per page (lead, overnight loop)

- Ship 41 (round 15A + lead):
  - Agent log: phone uses the same status rows as desktop; labels are whole words.
  - Opening read: the earnings card carries NVDA's usual 3.2% report move, 1.5× a normal day, as the next step.
  - Rail: "Your other stocks today".
  - Example inbox: lists every other holding in one table (weight, since added, day) and drops the "found nothing" row.
  - Start free: shown once per view (shell only); locks name their own action ("Read the full report").
  - Lead: "Cramer's stance/says/take" counts as filler.
  - Checks: 2857 tests in both modes. VPS pulled.
- In the main tree for the next ship: in-page sign-ins say what they do: "Keep asking", "See your own stocks", "See your own taxes", "See your own mix", "See ideas for your own stocks", "Show only your stocks".
- Running: round 15B (stock page, compare, backtest, insiders).

### 2026-11-12 ~02:55 UTC, ship 40 live (bcdb5ac): Today pages that read like a person wrote them (lead, overnight loop)

- Ship 40 (round 14 + lead): an audit of /explore, /premarket, /news and /calendar against the rubric, and fixes.
  - /news: headlines learn their casing from the day's own wire (lib/wire-casing.ts). The two read panels and the company cards end on whole rows (components/wire/whole-rows.tsx). Tone sits in the card header. The "About this page" note is gone. 16 cards.
  - /explore: one-idea headline ("The S&P 500 gained 1.31% today, with sectors split."), one clock, and stale moves dropped instead of footnoted.
  - /premarket: no lede or footnote, and no "Show N more" (all gappers scroll inside).
  - /calendar: leads with the week ("Cisco Systems and Applied Materials report tomorrow, the biggest of 24 companies still to report this week."), with cards for the biggest coming reports (last-report move against a normal day). Nothing folded, and no coloured edge.
  - Lead: plain-copy keeps a surname after a common first name ("Steve Jobs"). Shared-casing words added.
  - Live sizes: news 327KB, calendar 334KB, explore 255KB, premarket 149KB.
  - 2852 tests in both modes; tsc and eslint clean. VPS pulled.
- Open (round 14):
  - Tech sector −1.15% on /explore while chips led (sector feed may be stale; pipeline unchecked).
  - /news?ticker=X is about 418KB.
  - The calendar list view still has "+N more".
  - Three whole-rows helpers to merge.
  - Strays like "Delivered Fantastic".
- Running: round 15A (briefing, inbox, one Start free per view) and round 15B (stock page, compare, backtest, insiders).

### 2026-11-12 ~02:35 UTC, ships 38 (46ed8ba) and 39 (13145d8) live (lead, overnight loop)

- **Ship 38 (round 13A):**
  - **Worth knowing:** every stock is a card with a real price fact from its own closes ("Its biggest gain since Sep 2", "About twice a normal 3.8% day", "Still down 7.2% over the past month"). It is never an unconfirmed reason, and a fact two cards would share is dropped. No count labels.
  - **Desktop rail log:** one status row per run (kind, figure, time).
  - **Inbox:** the headline is one idea with the report date underneath. The same stock's cards merge into one with two figures. Rows the read already told are hidden but still marked read.
  - **My stocks:** all 9 holdings show, and the scroll ends on whole cards.
  - **Lead:** "Wall St futures…" columns count as roundups.
  - **Checks:** 2834 tests.
- **Ship 39 (round 13B + lead):**
  - **Compare:** the two calls, each with its number, sit under the headline. "Where they differ" is 7 one-figure rows. "What our research says" and the "All the numbers" label are gone.
  - **Backtest:** the columns end level, the cards lead with one number, and the copy says "Behind the S&P 500 in all four full years".
  - **Stock page:** What changed goes through headlineCase. Signed-out pages have one action.
  - **Insiders:** the lists are ticker only and the table ends on whole rows.
  - **One signed-out label sitewide:** "Start free".
  - **Lead:** plain-copy learns major/strategy/live/stream/vote/tonight/capture/wealth.
  - **Checks:** 2838 tests in both modes; the VPS is pulled.
- **Judges on live 39** (scratchpad/judge39):
  - Codex: UI 7, UX 7, usability 6.5, wording 7, agent feel 6.5, similarity 7, sell 6.5, overall 7.
  - Cursor: UI 6, UX 7, usability 7, wording 6, agent feel 7, similarity 6, sell 6, overall 6.
  - Asks:
    - Briefing: phone agent log as status rows, opening read with an insight plus a next step.
    - Card headline casing.
    - Inbox example: the page is empty after the read.
    - Three "Start free" buttons per view.
    - JPM: call wording, chart dots and What changed.
    - Compare: the "rows won" line and an unquantified headline.
    - Backtest: rebalance mechanics.
    - Insiders: the cluster name and the next step.
  - All routed to rounds 15A and 15B.
- **Running:** round 14 (Today pages), round 15A (briefing, inbox, shell CTA), round 15B (stock page, compare, backtest, insiders).

### 2026-11-12 ~02:00 UTC, ship 37 live (fb443bf); judges on 37; round 13 building (lead, overnight loop)

- **Ship 37 live:** rounds 11 + 12 plus a shorter backtest headline. Nine pages return 200; the VPS is pulled. Cold-load blips on the local server: the backtest example and compare briefs read empty once, then fine on retry.
- **Judges on live 37** (scratchpad/judge37):
  - Codex: UI 7, UX 7, usability 6.5, wording 7, agent feel 6.5, similarity 6.5, sell 6.5, overall 7.
  - Cursor: UI 6, UX 7, usability 6, wording 7, agent feel 6, similarity 6, sell 6, overall 6.
  - Asks:
    - Briefing: QQQ/AMD as bare chips (they want cards with a real fact); the desktop log shows 2 runs plus a paragraph.
    - Inbox: the hero repeats the Today row; two NVDA cards; a two-idea headline.
    - My stocks: shows 8 of "9 holdings".
    - Stock page (JPM): What changed still in title case; two signed-out actions.
    - Compare: calls and numbers under the headline; drop the label; short rows.
    - Backtest: columns end unevenly; paragraph cards; "0 of 4 full years ahead".
    - Insiders: lists show long names; scroll boxes end mid-row.
    - Sitewide: five different signed-out CTA labels.
- **Round 13A** (briefing, agent log, inbox, My stocks) and **round 13B** (stock page, compare, backtest, insiders, one CTA label) are building.

### 2026-11-12 ~01:45 UTC, ships 35 (e671df3) and 36 (991501c) live; ship 37 frozen (fb443bf) (lead, overnight loop)

- A usage limit moved the session to another account mid-round. Every builder was resumed from its transcript; no work was lost.
- **Ship 35 (round 10): the inbox.**
  - It reads your stocks first. Example: "4 of your stocks moved at least twice as much as usual today, and 4 of your stocks report earnings in the next week", with cards for the biggest move against its normal day, the report to watch (its usual move on a report, only when measured), and insiders or calls.
  - Each stock gets one plain sentence per day. A reason shows only when it's confirmed for the same day and direction. Coming up comes from the calendar.
  - Rows the read already told show the bare fact (rule 1).
  - Stale quotes are dropped from Today.
  - The bell counts rows, not items, and auto-reads only when `clearable` (QA found that the split-by-stock runs never cleared and showed "9+").
  - 2 QA passes. 2822 tests in both modes.
- **Ship 36 (round 9): speed.**
  - Live sizes: /filings 747→286KB, /screener 734→325KB, /portfolio/xray 578→241KB, /follow 738→446KB (the 40 directory rows kept), /agents reads in parallel.
  - Repeated 300-character utility strings became short classes in globals.css (each one states its floored font size). Big lists are sent as data and drawn in the browser.
  - QA regressions fixed: Follow button size, tabular-nums, PAGE 40, hover title.
- **Ship 37 frozen (rounds 11 + 12 + lead):**
  - The judges' ship 34 findings: insiders rows paint (no content-visibility), unit in the head, one-idea headline, no About note; briefing with no "N other updates", the Reddit mood said once per section, no hedgy Reddit summaries as card text, a one-idea headline with movers underneath, whole-row rail log; example counts agree (9 held + 3 watched); My stocks columns end level and funds say "no calls" once; the stock page has one call heading, What changed in the first phone tab, and one next step signed out; Signals is plain about bearish share, has no stubs, and shows only President posts that lean; shorter FAQ answers.
  - /compare opens on NVDA vs AMD with its read. /backtest opens on a cached 60/40 example with the read ("The 60/40 mix would have turned $10,000 into $11,960 since Nov 2021"; the index and worst drop are in the card). Mechanics copy removed.
  - 2824 tests in both modes, tsc and eslint clean.

### 2026-11-12 ~01:05 UTC, ship 34 live (29a5047): landing cards that lead with a number, briefing cards that show everything, a tighter stock page (lead, overnight loop)

- **Ship 34 (round 8, from the judges on 31):**
  - **Landing:** the example portfolio is now stock cards. All 9 "watches" cards lead with a big number (lib/lead-percent.ts; a range dash is not a minus), with no "Show all". The FAQ is printed with no folds.
  - **Briefing:**
    - "1 more" is gone: the next update shows on the card face, with "N other updates" only when more are hidden. Reddit talk is a chip, and a chip never repeats the face.
    - Quiet stocks are an always-visible chip grid in the rail. The rail log has a 21rem minimum and scrolls inside.
    - Futures columns and headlines listing three or more tickers count as roundups.
  - **Stock page:**
    - No small labels.
    - "What changed" is one-line rows in an ~8-row inner scroll, with 8 in the HTML.
    - One lock. The long-report link shows only where no lock box does.
    - earlier-timeline and research/stock-entry are deleted.
  - **Insiders:** an 8-row inner scroll. The server sends 24 slim rows and the rest after load.
  - **Signals:** index rows show only when their posts lean bullish or bearish (not mixed).
  - **My stocks:** agent times are said once when they're equal.
- **Verified:**
  - tsc 0, vitest 2796 in both modes, eslint clean
  - QA qp34: 3 bugs + 1 likely + the rail clip, all fixed
  - screenshots in scratchpad/round8, qp34
  - live 6 pages 200; VPS pulled
- **Judges on live 34** (scratchpad/judge34):
  - Codex: UI 7, UX 7, usability 6.5, wording 7, agent feel 7, similarity 7, sell 7, overall 7.
  - Cursor: 6/6/6/6/6, similarity 5, sell 6, overall 6 (down 1).
  - Both: the insiders table looks blank on first paint (content-visibility), and "1 other update" is still on the briefing.
  - Also: the Reddit chip on every card, hedgy Reddit summaries as card text, NVDA earnings said twice, example counts differing between the briefing and My stocks, the My stocks rail ending early, funds with no call, JPM phone What changed behind a tab, two headings over the call, Signals wording and Mixed President rows, and wordy FAQ answers. All routed to round 11.
- **Running:**
  - round 9 (speed on filings/follow/screener/xray/agents), fixing its QA
  - round 10 (inbox)

### 2026-11-12 ~00:35 UTC, ship 33 live (e05a6d0): a briefing that picks real news per stock and says each move once (lead, overnight loop)

- **Ship 33 (round 6 + QA fixes):**
  - lib/briefing-news.ts picks one story per stock, preferring the reason for the move. It drops roundups, opinion, rumours, explainers, clickbait and headlines that contradict the move. After-hours and later stories are kept.
  - headlineCase is used on the briefing and on /news. Brands are kept as whole phrases, and a brand word used as an ordinary word is lowered ("price target", "will block", "gap up").
  - Each move is said once, the strip clock ignores stale thin quotes and earlier days, and the headline counts only the cards shown (the first 8).
  - Aliases added: Super Micro, J&J, P&G, and two-letter tickers that open a headline.
  - Verified: tsc 0, vitest 2782 in both modes, eslint clean, QA qp33 (2 bugs + 5 gaps fixed), screenshots in scratchpad/s33 and qp33. Live; VPS pulled.
- **Open (→ round 8):** two briefing cards repeat the Reddit sentence (rule 1); AMD's +7.3% card has no reason line. Mixed headlines like "Lisa Su just Delivered Fantastic news" stay as written (the casing is conservative next to unknown capitals).
- **Running:** round 8 (judge findings on landing, briefing, JPM, insiders, signals, My stocks); round 9 (speed: /filings, /follow, /screener, /portfolio/xray, /agents).

### 2026-11-12 ~00:20 UTC, ship 32 live (d0f06f3); ship 33 frozen (9a3b624); judges on 31 (lead, overnight loop)

- **Ship 32 (round 7): midday movers rebuild.**
  - New units: tikrr-midday-movers-price.timer at 12:30 and 14:30 ET on weekdays (price_core_intraday lane, mid_check), with OnSuccess tikrr-midday-anomalies.service. They run at :30 to stay clear of reddit-buzz at 14:20. Installed on the VPS; first run Nov 12 17:30 UTC.
  - The mid_check barrier waits on price only. Dispatch records the price stage.
  - build_daily_anomalies `--carry-session-reasons` keeps a verified, sourced reason only if all of these hold: same NY day, same direction, the move hasn't grown well past the one researched, and the quoted % still holds. Simulation: 10 of 31 carried. `--dry-run` writes nothing.
  - midday_rebuild_allowed() skips outside 09:30–15:30 ET, so a late catch-up never overwrites the close feed. No email on mid_check (tested).
  - Also: the My stocks phone footnote ("About this page") is gone (rule 8).
  - Accident fixed: ship 31 had committed a `node_modules` symlink, via `git add -A` in the scratch worktree, where .gitignore's `node_modules/` doesn't match a symlink. Ship 32 removes it. On the VPS, `git rm --cached node_modules` let the pull through, and the real node_modules is intact.
- **Ship 33 frozen (round 6): briefing news quality.**
  - A shared per-stock news pick (lib/briefing-news.ts). It prefers reason lines and drops roundups, opinion, rumours, explainers, clickbait and headlines that contradict the move.
  - Mixed-case headline fix that keeps brands.
  - Each move is said once. Coming up drops what the read already names.
  - The strip clock ignores stale thin quotes (AIRJW pinned 12:33 PM).
  - tsc 0, vitest 2778 in both modes, eslint clean. QA running.
- **Judges on live 31** (scratchpad/judge31):
  - Codex: 7 on every score.
  - Cursor: UI 7, UX 7, usability 8, wording 7, agent feel 7, similarity 7, sell 7, overall 7 (up from 6).
  - Remaining asks (→ round 8): "1 more" on every briefing card and the Quiet Show toggle; landing example book as rows, a watches grid with a hole and "Show all", folded FAQ; JPM's small labels, the long "What changed" list, two locks and the phone "Show more"; the insiders table at 60 rows plus Show more; Signals Reddit showing 8 of 16 and SPY mood "—"; My stocks agents sharing one last-run line and the desktop rail ending early.

### 2026-11-12 ~00:06 UTC, ship 31 live (a106d69): stock page in one column, one nav on phones, real insider clusters, an example briefing (lead, overnight loop)

- Ship 31 (rounds 4 + 5 + lead fixes):
  - **Stock page:** one column, with no Follow rail, "Why:" label, bars, coloured edges or per-row NEWS label. Sentence-case "What changed". The "call stands until" line and the market-wide S&P conditions are gone (backend/call_stability.py; older stored text is cleaned on read by lib/rule-copy.ts, with one "or" at the end). The sales line reads "faster than its 6.4% growth in fiscal 2025".
  - **Phones:** My stocks tabs are pills in the place strip, so there is one nav.
  - **/insiders:** cluster buys are counted from stored buys (LKQ 3, LBRT 3). The money list shows dollars and doesn't repeat the buyers list. The cards lead with numbers. backend/agentdata/insiders_form4.py now counts 30 days of stored buys (`cluster_pool`; checked read-only on the VPS: 69 buys, LKQ and LBRT found).
  - **Landing (phones):** cards first, with a sticky "Watch these for me" bar.
  - **Agent log:** no per-row logos.
  - **/strategies:** full descriptions, and the headline gap is computed from the shown figures.
  - **/signals:** no "0" on empty tabs, and no "while Nvidia declined" on an up day.
  - **My stocks:** quiet cards show their share of the money and the month vs the S&P; "Last 5 days"; tools as one line of links.
  - **Briefing (signed out):** an example briefing of a made-up portfolio of real stocks (round 5). It shows no empty "Needs you", and falls back to the market view with a "Try it on your stocks" link if the example fails.
- **Verified:** tsc 0, vitest 2752 in both modes, eslint clean, pytest with the 4 known failures. QA qp31: 4 bugs fixed (money list with no money, signed-out fallback, empty Needs you, cluster read not limited to buys). Screenshots in scratchpad/qp31, qp31b, judge31. VPS pulled.
- **Open, with round 6:** headline casing on the example ("Holders Feel it even If they Never trade"), NVDA repeated on the briefing, and mixed decimals.
- **Open, with round 7 (building):** a midday movers rebuild at 12:20 and 14:20 ET, so the afternoon briefing stops leading with 9:58 AM figures.

### 2026-11-11 ~22:35 UTC, ship 30 live (8900e63): one read of the market day, one home for your stocks (lead, overnight loop)

- Ship 30 (round 3): /explore is the single list of the day's moves (#moves; reason rule shared via lib/move-line.ts so a stock reads the same everywhere; one "As of" time, stale thin names named once; earlier days link to /movers/[date] archive). /movers hub, /anomalies, /signals?tab=movers → 308 /explore#moves; Signals keeps Reddit + President only; home and briefing use the same loader; nav loses "Why stocks moved". /portfolio is the one My stocks home with tabs (Overview, Holdings, Watching, Alerts, Taxes); /watchlist → 308 /portfolio (query kept), /watchlist/tax → /portfolio/taxes; holdings rows open the editor by click or keyboard; ~40 files repointed. tsc 0, vitest 2713 both modes, eslint clean; builder QA findings fixed; redirects curl-checked; screenshots scratchpad/round3, s30. Live, VPS pulled.
- Open: on phones the place strip and the My stocks tabs both say "Overview" (double nav); backend/mail lifecycle still links /watchlist (redirects).
- Agents PROVEN in production: after-close 22:30-22:51 UTC succeeded; standing agents ran on the VPS for the first time: 7 jobs, 4 member runs recorded (2 notify, 2 nothing), 0 failed (example agents already ran this morning from the laptop; tomorrow they run on the VPS). Reason checks: 0 of 185 accounts have reasons yet.
- Cursor judge on live 30 (scratchpad/judge30/cursor.md): UI 7, UX 6, usability 6, wording 7, agent feel 7, similarity 6, easy to sell 7, overall 6. The try-three-tickers landing is "the first real oh moment"; still wants one market read (briefing signed out repeats /explore + the agent log), complete My stocks cards (funds without a call), one as-of clock, stock page reasons without the "Why:" label and generic market-tape conditions. Folded into round 4. Codex judge on live 30 (judge30/codex.md): UI 7, UX 7 (+1), usability 7, wording 7 (+1), agent feel 7 (+1), similarity 7 (+1), easy to sell 7, overall 7 (+1 from 6). Asks: align every headline with its own timestamp (briefing "closed" at 12:33 PM), insider cluster count shows 0 despite LKQ/LBRT clusters, thin fund/allocation facts on My stocks cards, JPM boilerplate, opening reads with baseline + affected stocks + next step. Routed to rounds 4 and 5. (The first Codex run hung on stdin; fix: `< /dev/null`.)

### 2026-11-11 ~22:00 UTC, ship 28 live (2a8a19a); ship 29 in QA; round 3 building (lead, overnight loop)

- Ship 28 (round 1): numbers you can trust (banks get ROE + payout; analyst-firm stories off the bank's pages, incl. "X says Strategy…" without the flag and keeping "Jamie Dimon says JPMorgan will…"; TSMC ESPP rows out of insiders, folded clusters; one example book on home and /portfolio; every figure carries its price time; /movers headline says its own time after the close; posts-led /signals read dated by the posts; failed insider reads not cached for 10 min) + a first visit that starts with your stocks (Start free → onboarding → /portfolio, never /pricing; onboarding dialog rebuilt; signed-in / → /portfolio; legacy /watchlist/classic|next|portfolio, /portfolio/analyze, /profile/subscribe 308-redirected and deleted; /dev 404 in prod). tsc 0, vitest 2693 both modes, pytest 4 known failures. QA qp28 (4 bugs + robustness) fixed. Live, VPS pulled. Insider/news cleanups dry-running on the VPS.
- Ship 29 (round 2) frozen b0148e6, in QA: landing as a taste ("Your stocks, explained every day, with sources." + one field for 3 tickers → call, move, one sourced line, no signup → "Watch these for me" → sign-in → added → /portfolio; /api/taste cached, no model), proof line from the real count ("About 730 US stocks with a dated call"), plan copy fixed (An agent; trial asks for a card; docs match pricing), one signed-out gating rule (call, why, what would change it open on every stock; levels/full brief/scorecard by plan; showcase stocks tagged Example), /?try links work signed in, "after flat sales" wording.
- Ship 29 LIVE (6422daa) after QA fixes: signed-in /?try links work; flat-year wording ordered right; a new account whose picks all fail gets the onboarding dialog in retry mode instead of an empty page; /api/taste rate-limited 30/min/IP (lib/ip-rate-limit.ts); signed-out readers no longer see how a call changed (plan keeps it); a line arguing against the call is never shown as its reason (leansAgainst in buildCallEvidence; JPM drops "EPS missed"); phone landing puts "Watch these for me" under the field; mechanics line "One day isn't enough…" removed. 2709 tests both modes. VPS cleanups run: 63 TSMC ESPP insider rows removed + 7 off-price, 7,071 headlines retagged (160 tags removed, 45 added).
- Round 3 building: one Today read (/explore; /movers and Signals' movers tab fold in; nav loses "Why stocks moved") + one My stocks home (/watchlist folds into /portfolio).

### 2026-11-11 ~21:30 UTC, ship 27 live (d97a75e); research round 1 in; round 1 building (lead)

- Ship 27 (from Codex's ship-26 findings + QA): calls never paired with a fact that argues against them (UNH); circular move reasons treated as no reason everywhere (lib/reason-quality.ts, incl. isConfirmedMove for /movers, the agent log count, and the stored briefing via moveReason), cause list widened (beats on/estimates, lock-up, dilution, Nasdaq-100, cyber, invests, crash, pact, stimulus, tariffs, cash burn…); no model names in UI source lines; inbox alerts with context ("about four times a normal day, and reports on Nov 17"); "–" in empty mood/tone cells; "Watch next" on /news and /signals reads; results night shipped dark (RESULTS_NIGHT unset → every loader empty). Verified: tsc 0, vitest 2625 both modes, eslint clean, QA qp27 (results night invisible; 2 bugs fixed). Live 8 pages 200; VPS pulled.
- Research in: competitor teardown (research27/competitors-notes.md: pricing bands, where we differ/lag, onboarding and paywall patterns, market gaps); council UX audit of 33 pages (research27/ux-notes.md; Codex ~6/5/5/5.7/5.3/6, easy-to-sell 5; Cursor 6/5/6/7/6/5/4; top 15 improvements). Still running: inventory/usage audit, demand research.
- Inventory/usage audit in (research27/inventory-notes.md): ~11 accounts active in 30 days, signups 48 (Jul) → 2 (Nov); 10 paying monthly; email 1.3% click; standing agents NEVER ran in prod. Lead fixed the agent runner on the VPS (LOCALDB_URL + FIREBASE_SERVICE_ACCOUNT_PATH added to /etc/tikrr/agentdata-localdb.env, backup .bak-20261111; dry run 7 jobs, 0 failed; code now also accepts GOOGLE_APPLICATION_CREDENTIALS) and stopped the agent log counting the example's laptop runs as members'.
- Research done (4 tracks + quotes; scratchpad/research27/*-notes.md). Plan v1 → council critique (plan-critique-codex.md, plan-critique-cursor.md) → plan v2 (research27/plan-v2.md): tonight = trust bugs + first-run path (round 1), the landing as a taste with one ticker field + pricing copy + one gating rule (round 2), one Today read + one My stocks home (round 3), prove a real agent run end to end (round 4); nav rewrite and new holdings insights cut for tonight.
- Round 1 trust fixes DONE (working tree): banks get ROE + payout instead of FCF/net cash (lib/financial-company.ts); analyst-firm stories no longer attach to the bank (backend/agentdata/analyst_firms.py + lib/analyst-firms.ts, identical on 285k pairs); TSM $70 rows were TSMC's ESPP in Taiwan shares → plan purchases not counted, out-of-range prices dropped, near-identical rows fold; home uses the same 9-holding example book as /portfolio; every figure carries its price time (lib/quote-time.ts); one count for strategies and insider balance (lib/insider-balance.ts). VPS after pull (dry-run first): `python3 -m backend.agentdata.insiders_form4 --days 45` and `python3 -m backend.agentdata.news_feed --retag --days 14`.
- Round 1b building: first-run path (Start free → add stocks → My stocks, not /pricing; onboarding modal rebuilt; signed-in / → /portfolio), legacy page redirects, stale intraday movers labelled honestly + a midday refresh proposal.
- Round 1 building: trust-breaking data (JPM bank metrics + off-topic news, analyst-firm stories on the wrong ticker, TSM insider price mapping, example portfolio consistency home vs My stocks, same-timestamp mismatches, strategies/insider counts).

### 2026-11-11 ~20:30 UTC, OVERNIGHT MODE (owner, Nov 11 evening): research → plan → improve → judge, all night (lead)

Owner, going to bed for 12-15 hours: no new features tonight. Instead, a loop:
1. Research the existing features (inventory, health, usage), the market (competitor teardown with prices), demand (what retail investors want and pay for), and a full UX audit by Codex and Cursor against docs/owner-design-rules.md.
2. Synthesise one ranked plan: UI/UX fixes, improvements to existing features (demand, usability, how easily it sells), positioning/landing/pricing/paywall. Have Codex and Cursor critique the plan; revise it.
3. Build the improvements (to existing features only), verify per AGENTS.md (screenshots both sizes, QA subagent, tsc/lint/tests), ship (deploys authorised earlier in this thread), then ask Codex + Cursor for feedback, improve, repeat until morning.
4. Morning deliverable: one readable report (research evidence, competitor table with prices, the plan and why, what was shipped each round, council scores per round).
Parked: results night (a new feature; built partway in lib/results/*, components/results/*; kept out of every deploy until the owner decides). Emails still wait on the owner's yes + postal address.
Research running (4): feature inventory audit; competitor teardown; demand + selling; council UX audit.

### 2026-11-11 ~19:40 UTC, ship 26 live (24e354d): My stocks about your stocks, agent day log, tone on the news, self-clearing inbox (lead)

- Ship 26: /portfolio rebuilt stock-first (lead line + today/week/total figures, one card per holding: move in % and $, gain since bought, call with its own level, one fact: reports soon / call changed / big move with reason / tax-loss on Sell some only / insider buys ≥$25k non-10b5-1 / near its level; tools become a rail list with figures, empty tools dropped); compact agent rows (kind, short name, flagged count, logo chips with move, stale chips dated); "What the agent did today" log on /briefing and the home page (premarket scan, moves explained, briefs/calls, SEC filings, members' agents; one cached read, failures never cached); /signals Reddit back to a table (what people say, mood, posts, today %); /news Most talked about with tone + highlight; headline word-list tone fallback (legal-win and two-ticker guards); inbox marks read on view (forward-only, per uid); inbox dot gutter; phone place strip scrolls sideways; no cards without data.
- VPS: news tone labeller had stopped Nov 10 (no anthropic package, no key). With the owner's yes: anthropic 2.8.0 installed, ANTHROPIC_API_KEY copied into /etc/tikrr/backend.env (600, backup backend.env.bak-20261111b, never printed), anthropic added to requirements.txt; first run labelled 3,102 headlines, 0 failed; runs every 30 min.
- Verified: tsc 0, vitest 2579 both modes, eslint clean, pytest news_tone 6; QA qp26 (3 bugs: tone misreads, empty tools in the rail, memo linked twice; + rubric breaks) fixed in fix26; screenshots scratchpad/mystocks26, tables26, agentlog25, fix26, s26. Live 7 pages 200; VPS pulled.
- Rubric judges on live 26 (scratchpad/judge26/): Codex UI 7 (+1), UX 6, usability 7 (+1), wording 6, agent feel 6, similarity 6, overall 6. Cursor failed (connection). Codex's top asks: reconcile calls with their own evidence (UNH shows Buy more beside "no longer cheap, the reason you bought it has played out"); every opening read decision-useful (comparison + a supported thing to watch); alerts with context; circular move reasons ("Semiconductor rally drives SOXL higher") treated as no reason; no model-name mechanics in source lines; the stock page's change conditions easier to scan.
- In flight: results night (earnings actuals vs expectations, the move vs the usual report move, call held/changed → stock page block, inbox item, briefing card fact, earnings season).
- Waiting on the owner: emails go-live (VPS + Vercel) and a CAN-SPAM postal address.

### 2026-11-11 ~18:15 UTC (owner clock ~6:10 PM local), ship 25 live (ae53302); owner feedback round 3 (lead)

- Ship 25 live (one Ask, My stocks/memo as cards, news/signals open with a read, logos always, stock page own level only). Rubric re-judge was cut off by a slow screenshot run; re-run after ship 26.
- Owner feedback (Nov 11 evening): no cards when there is no data (fixed: place cards need a figure or a leaning finding); inbox unread dot overlapped icons (fixed: own gutter); Reddit list "better off earlier without cards" → table again; news "Most talked about" needs tone and a highlight per stock (tone labels cover ~1% of stories → raise coverage + fallback scorer); inbox clearing: auto-mark read on open, click clears; "Your agents" too much text → one row per agent with logo chips; My stocks "a lot of useless insights" → stock-first rework (each holding: move, gain, call, the one thing that matters; tools become links). Phone place strip now scrolls sideways (no gap before More). All in docs/owner-design-rules.md.
- Builders running (3): agent day log on Today; tables with tone + inbox clearing; My stocks stock-first rework + compact agents.
- Emails: still waiting on the owner's yes + postal address.

### 2026-11-11 ~17:10 UTC, ship 25 frozen (231a197) and in fixes; emails rebuilt; agent day log started (lead)

- Judge fix round (3 builders) done → ship 25 frozen: one Ask (shell panel reads page hints; in-page boxes gone on briefing/portfolio/inbox), labelled sector list, rail only when it has content, premarket no-reason gappers as chips, logo monogram fallback + SOXL fix, Keep shows no level (lib/call-level.ts), /news read from story counts + moves, tone only when it leans, source prefixes stripped, /signals Reddit cards + one card per stock, /explore short Cisco card + "Watch next" from the calendar, stock page "Keep what you own…" without arrows/breadcrumb, My stocks findings/memo/places as figure cards and balanced columns, memo movers/calls as cards with flips shown without "was". tsc 0, vitest 2512 both modes, eslint clean. QA qp25: 5 bugs (stale giants card, President posts told as Reddit, degraded briefing cached, dead AskBox, wrong "steady coverage") + rubric breaks → fixer running.
- Emails rebuilt (backend/mail, working tree only, not shipped): researched Exec Sum, Snacks, Daily Upside, Morning Brew, Seeking Alpha, TipRanks, Simply Wall St, Koyfin, Public, broker alerts; council Codex 5.3 → 6.2, Cursor 4.6 → 5.8 (mean over 12 emails); gallery scratchpad/email-examples/index.html. Owner: removed "the rest of your stocks" chips (daily + weekly); tile grids now fill every row. Waiting on the owner's yes to go live (VPS + Vercel) and a CAN-SPAM postal address. Main fails test_strategy_rebalance_notes until backend/mail ships.
- Started: agent day log ("What the agent did today": filings read, calls kept/changed, moves explained, insider buys, gappers scanned, from stored pipeline output) at the top of Today, for agent feel (judges 6/10).

### 2026-11-11 ~16:20 UTC, ship 24 live (d50dc9c): briefing cards, premarket, inbox, evidence-backed calls, nothing repeated (lead)

- Ship 24 (137 files): signed-in briefing as stock cards (one highlighted fact each, shared events said once, plain call words, sentence-case headlines); /premarket rebuilt (futures/abroad figure cards, gappers as stock cards, reasons only when they match the gap) + Premarket in Today + "Before the open" briefing rail card; Inbox (bell + /inbox; agent runs, call changes since steady calls, insider buys, fired alerts, memo; transactional forward-only `inbox_seen_at`); chrome payload trim; app-wide no-repetition sweep (~20 pages); evidence-backed calls (lib/call-evidence.ts: sourced numbers + checkable raise/lower conditions tied to the stability rule; backend what_would_change and call_reason.py match; Ask uses them); steady-call fallback from tm_call_stability on stock pages (≈669 more stocks); read fold removed sitewide; /explore movers as cards, sector bars gone; /news stock-first, full sentence-case headlines, one figure per item; home moves cards; always-open rows (signals, insiders, portfolio findings + agent checks, memo rows/calls, earnings rows); new Premarket/Inbox icons; strategies say live tracking began Nov 10 instead of a shared −0.10%.
- Verified on the frozen tree: tsc 0, vitest 2480/2480 with and without PAYWALL_V2, eslint clean, pytest 98 (call_stability, call_reason, company_reason); combined QA qp24 (5 bugs fixed: half-title-case headlines, premarket reason contradicting its gap, inbox read repeating itself, bell count returning after mark-all-read, seen-mark race); screenshots scratchpad/qp24, fix24, s24, open24, rubric24, evidence24, steady24, today23, inbox23, norepeat23, chrome24. Live: 11 pages 200; VPS pulled (backend reason/stability wording applies from the next brief run).
- Steady calls confirmed working in prod (first stabilised writes 15:08 UTC with the open briefs run).
- Judges with the rubric on live 24 (scratchpad/judge24/): Codex UI 6, UX 6, usability 6, wording 6, agent feel 6, similarity 6, overall 6 (=). Cursor UI 6 (+1), UX 6, usability 6, wording 7, agent feel 6, similarity 5, overall 6 (+1). Both want one Ask entry point (sidebar + page boxes + phone header), "More ▾" chevron gone, briefing sector bars labelled, the rail not ending early, logos everywhere (SOXL, index strip), news/signals opening with three numbered insights, Reddit names and memo movers as cards, portfolio overview rows as cards, Keep instead of "Hold on", no reversal shown without its reason, home NVDA Keep card showing a buy-more level (bug), inbox blank space.
- Open: emails rework (running); NVDA reason bar 83% vs page box 65% (screener doesn't pass last year's growth); lib/memo still says "prices stop at Monday's close"; inbox read card repeats the first row; /insiders 820KB HTML (pre-existing); /briefing and /portfolio right rails end early.

### 2026-11-11 ~15:30 UTC, ship 23.2 live (e1caa22); first judging against the owner rubric (lead)

- Owner asked to compile all their feedback for the judges: docs/owner-design-rules.md (13 sections, quotes; a rule break caps UI at 7; judges list breaks before suggestions). Builders get it too; memory judge-with-owner-rubric.
- Ship 23.2 live: speed rework (live HTML /stock/NVDA 580 → 315KB, /explore 512 → 257KB, /markets 460 → 283KB, /portfolio signed out from the CDN copy), "More markets" as figure cards (owner hated the chevron rows), memo names the week's biggest driver, duplicate "Chat about it" removed, news themes show more headlines. QA qp232 fix: /markets as-of words pinned to the server's build time (overnight-cache hydration mismatch).
- Judges on live 23.2 with the rubric (scratchpad/judge232/): Codex UI 6, UX 6, usability 6, wording 6, agent feel 6, similarity 6, overall 6. Cursor UI 5, UX 6, usability 6, wording 7, agent feel 6, similarity 5, overall 5. Lower than the 7.5 before because the rubric caps UI on any break; most breaks they list (chevrons, per-row links, briefing rows, premarket missing, hidden reasons) are fixed in the working tree for ship 24 or in flight.
- Landed for ship 24: briefing stock cards + premarket page + "Before the open" rail card; app-wide no-repetition sweep (15 pages); inbox; chrome payload trim (17-29KB per page).
- In flight: evidence-backed calls (+ stock page rubric breaks); rule 2 always-open rows (signals, insiders, portfolio findings, memo rows, earnings rows, memo call chips); rubric round 2 (read fold, explore movers as cards, news stock-first, home empty strip, briefing rail arrows).

### 2026-11-11 ~14:45 UTC, Codex after ship 23.1; evidence-backed calls started (lead)

- Codex judge on live 23.1 (CLI, 16 live screenshots; scratchpad/judge231/verdict.md): overall 7.5 (=), UI 8 (=), UX 7.5 (=), usability 7 (=), wording 7.5 (=), agent feel 7.5 (+0.5), similarity 7.5 (=). Top asks: specific sourced call rationale with measurable change conditions (NVDA: "if sales keep growing this fast" is unverifiable); prefilled portfolio-aware question + alert from each finding; phone agents page: sticky Save only once scrolled into the draft; memo leads with the biggest driver and keeps the data limitation visible; mobile first screens too long; rule breaks left: portfolio overview rows (chevrons, eye icons), movers/market/earnings lists as rows. Its "home says five reports" finding was false (live HTML says three everywhere).
- Done: memo names the week's biggest driver under the headline (working tree, ship 24).
- Started: evidence-backed calls (lib/call-evidence.ts: 2-3 sourced numbers per call and measurable conditions tied to the stability rule and next report; stock page, backend what_would_change and Ask agree). Agents phone sticky Save handed to the sweep builder.

### 2026-11-11 ~14:20 UTC, ships 23 (57fdd10) and 23.1 (868c031) live; inbox and speed rework landed (lead)

- Ship 23 live: Ask answers lead with the point + "Keep watching" card; Ask in context; My stocks agent checks open (checked / found / decided / next run); memo rows and chart days open their explanation (nothing written without a confirmed reason; the day panel shows the day's own move); signed-in briefing orders holdings first; LocalDB undici keep-alive (preview deploy first: no ECONNRESET/module errors). VPS pulled, undici 7.30.2 installed.
- Owner feedback round (live review, Nov 11 ~13:50-14:00) → ship 23.1 live: no coloured top edges on cards; no Ask/chat icon on cards or briefing rows; read cards are whole-card links (no repeated link text); "Your agents" moved to the briefing's right rail; Signals tables 8 rows; memo cards always show their sentence (no "Why" toggle), no row chevrons, week list beside the chart only (scrolls inside its card), sections paired so no empty right column, lone cards fill their row; earnings season shows the last 4 post-report moves as numbers (dot strip removed), no row chevrons, and the "biggest move after a report" card only uses reports from the last 200 days (it led with a Sep 2025 Oracle move). QA qp231 fixes: rail clipping, lone-panel span, earnings screen-reader label.
- Memory updated: compact-tables-and-rows now says NOTHING repeated per row/card, no top edges, cards over rows, agents in the rail, 8-10 row tables.
- Short interest (FINRA) stopped before building: non-commercial terms. Owner decision.
- Landed, not yet shipped (ship 24): Inbox (bell + /inbox; agent runs, call changes, insider buys, fired alerts, memo; read state in `inbox_seen_at` on the user's doc; call news starts at steady-calls switch-on, Nov 11); speed rework (stock page 571KB → 310KB, call in the first chunk ~0.6s cold vs ~1.1s; /markets 447 → 274KB; /explore 491 → 255KB; /portfolio signed out from the CDN copy) and "More markets" as six figure cards. Trade-off logged: non-Overview stock tabs and lower /markets sections now render client-side, so non-JS AI crawlers don't see that text.
- In flight: briefing stock cards + premarket page in Today (owner: "where is premarket?"); app-wide no-repetition sweep; site chrome payload trim (~40KB per page).
- Dev servers sharing the main tree's .next caused random 404s/chunk errors; verify ships from their own worktree server.
- Steady calls: 757 state docs, 0 changes and 0 history rows so far.

### 2026-11-11 ~13:20 UTC (real clock), ship 23 waiting on Ask-in-context; speed rework and short interest started (lead)

- Ask answer shape landed (short lead, evidence fold, "Keep watching" rule card; next check now says "after today's close"). Keep-alive re-test: Caddy host 0 errors, ~110ms vs ~300ms per round → ship 23 after one Vercel preview deploy.
- QA on Ask-in-context relayed to its builder: week-chart role, quoted() abbreviation cuts, card Ask as a corner icon and off on simulation/import pages, no personal amounts in URLs, one "Set one up", plain wording for your own checks, chart footnote removed.
- Live today, logged out: /stock/NVDA 580KB HTML (TTFB 0.1-0.2s), /markets 460KB, /portfolio example TTFB 0.4-0.6s / total 0.8-1.7s, /briefing 164KB.
- Builders started (2): structural speed rework (stock page, markets, portfolio/briefing loaders: streamed sections, compact props, lazy charts, request-deduped reads; targets <200KB HTML, warm portfolio <0.3s TTFB); short interest from FINRA (stopped before building: non-commercial terms, owner decision). Replaced by an Inbox builder (bell + /inbox).
- Ship 23 frozen at 2ca6350 (52 files): tsc 0, vitest 2375 with and without PAYWALL_V2, eslint clean. Memo panels no longer say "no confirmed reason" (owner rule). Vercel preview (tikrr-99kmkfiup): all pages 200, logs show no ECONNRESET/undici/module errors; a cold concurrent /portfolio hit timed out its sections at 6s (warm 2.7s, then normal) — handed to the speed rework. Combined QA running.
- Steady calls: first stabilised brief runs at 13:35 UTC — check tm_call_stability changes/history after.

### 2026-11-11 ~13:50 UTC, Codex after ship 22; the loop builders started (lead)

- Codex judge after ship 22 (CLI, live screenshots; scratchpad/judge22/verdict.md): overall 7.5 (was 7.2); UI 8 (7.5), UX 7.5 (7.5), usability 7 (7), human wording 7.5 (7.5), agent feel 7 (7), similarity 7.5 (7). Asks: Ask leads with a concise answer, sources/timestamps, then a prefilled watch with its exact rule and confirmation; My stocks agent checks expandable (examined, result, next run); briefing prioritises holdings and every card is askable in context; mobile Ask shorter first screen; memo chart points and changed calls open their explanation.
- Steady calls: 757 state docs seeded, 0 changes since switch-on and no history rows yet — the tracked brief runs that rewrite calls are later today (radar official open 13:35 UTC, 08:45/15:40 ET jobs); premarket ran successfully at 12:30 (16 failed downloads, pre-existing kind).
- Builders started (3): Ask answer shape (short lead, evidence folded, watch rule card with one-tap confirm for signed-in); Ask in context from every card + expandable agent checks + memo drill-down + briefing holdings-first; LocalDB keep-alive re-test against the production Caddy host from Node 22/24 (ship / change / drop).

### 2026-11-11 ~13:30 UTC, ships 21 (b912aa0) and 22 (d1e972c) live; SEO playbook applied (lead)

- Ship 21: Ask example answers for signed-out visitors (lib/ask-pipeline.ts extracted from the ask route, lib/ask-examples*.ts, tm_ask_examples, 300/day + 10/visitor caps, generated only after the panel opens) and answer → prefilled watch; real example agents (system uid example-portfolio, Pro via systemPlanOf, scripts/setup-example-agents.ts — now refuses to record a run before 4:30 PM ET without --force; the 6:19 AM ET laptop run means tonight's runner skips them, next real run Nov 12); strategy rebalance notes (tm_strategy_rebalances, "Latest rebalance" panel, Pro email behind STRATEGY_REBALANCE_NOTES=1, off); phone agent preview (sticky Save, "calendar days"), phone finding reasons, stock call line; quiet Ask focus; no Ask explainer. The LocalDB undici keep-alive was pulled from ships 21 and 22: the qp21 probe saw ECONNRESET under concurrent idle-gap loads with undici 7 and the dev server can't exercise it (Next aliases undici); re-test on a production build before shipping.
- Ship 22: reads as cards site-wide (components/oa/insight.tsx, components/oa/read-fold.tsx, lib/insights.ts figure + deriveFigure; labelled figures set by hand where the auto pick misled: Market today leader "GDX today", news "of stories negative"/"stories"/"MSFT today", screener "of them rose"); weekly memo as charts and cards (components/memo/*, lib/memo view stored per week); SEO: llms.txt facts generated from the plan table with "checked on" (lib/llms.ts + test), AggregateOffer Free $0 / Pro $19 / $190, compare pages lead with who/price/our drawback, competitor prices rechecked from vendor pages (Seeking Alpha, Morningstar, Danelfin "not checked"), FAQPage markup removed everywhere (compare, blog, marketing schema), "not advice" links to methodology, IndexNow for the stocks family, sitemap families retried not dropped, "heard about us" property, seo/context.md and seo/ai-prompts.md.
- Vercel: stocksbrew.online and tikrr.online now 308 to www (were 307). Training crawlers stay allowed (owner informed; revisit if an engine quotes a stale call).
- Owner feedback handled this round: nav group labels quieter; My stocks columns balanced; no sale next to Keep/Buy more (incl. tax-loss); stock header split; memo "all text" → visual; reads → cards; Ask focus line.
- Verified: ship 21 tsc 0, vitest 2293 (keep-alive tests removed), pytest + 3 pre-existing; ship 22 tsc 0, vitest 2337 with and without PAYWALL_V2, eslint clean; combined quality passes qp21 and qp22 with fixes; screenshots scratchpad/s21, s22, qp21, qp22, readcards, memo, seo-shots. Live: all checked pages 200; /portfolio/memo 8.6s on the first load after deploy (once-a-day example rebuild), then 0.3-0.5s; llms.txt shows the dated facts; AggregateOffer live.
- Open: undici keep-alive re-test; VOO prices stopping at Monday (memo footnote) — check after tonight's price run; memo "What could hurt"/"Worth a look" labels sit above cards (owner may object); after-close run 22:30 UTC is the first real test of the price fix; owner: Bing Webmaster Tools.

### 2026-11-11 ~11:15 UTC (real clock), ship 20 live (6b03f0b); tighter free plan and steady calls switched on (lead)

- Ship 20 quality pass (scratchpad/qp20/): no security leaks (per-user caches uid-keyed, session cache honours expiry, V2 locks hold, meters fail closed). Fixed before shipping: pricing swap banner said "Five"; filing/news agent drafts now show the Pro mark and "On Free this one saves paused" before Save; "Our call since" no longer falls back to the brief's day when the ledger is empty or failed; backend what_would_change rewritten in plain words (no day counts, sigmas or percentages; "We'd move to Keep if the case for buying fades for a few days, or sooner after its Dec 9 results or a sharp drop or a market sell-off"); web held line "The latest data leans toward Sell some. One day isn't enough to change the call."; tax-loss ideas skip Keep and Buy more calls too (owner rule: no sale next to Keep/Buy more); Pro card adds the filing/news agents line on V2; arrows never wrap alone; mail preview uses FREE_COVERED_STOCKS.
- Verified on the exact tree: tsc 0, vitest 2223/2223 with and without PAYWALL_V2, eslint clean, pytest 1172 + the 3 pre-existing failures; screenshots scratchpad/s20/ (pricing V2, ADBE phone, agents).
- Deployed 6b03f0b with PAYWALL_V2=1 set on Vercel production first (build-time); main pushed. Live: pricing shows "full report on three stocks you pick" and "Agents that read every new filing and news turn on your stocks"; 10 pages 200.
- VPS: pulled to 6b03f0b; /etc/tikrr/backend.env backed up to backend.env.bak-20261111; on-demand news timer paused; call stability seeded from the current calls (742 stocks, 757 state docs); PAYWALL_V2=1 and CALL_STABILITY_MODE=on added; timer restarted; first run clean (no queued jobs). First real stabilised briefs: the 08:45 ET tracked run (13:45 UTC) — check its journal for "call stability" errors.
- Ready for ship 21 (working tree): LocalDB keep-alive (undici 7 Agent, 60s keep-alive, 20 connections; idle 5-30s round trips 360-1043ms → 107-182ms; next.config serverComponentsExternalPackages ["undici"]; VPS needs npm install via deploy-code.sh) and Pro strategy rebalance notes (tm_strategy_rebalances, "Latest rebalance" panel, My stocks card for Pro followers, alerts email behind STRATEGY_REBALANCE_NOTES=1; 8 real Nov 2 records written; free sees counts and the rule, names stay Pro per strategy_holdings).
- Codex judge after ship 20 (CLI, live screenshots; scratchpad/judge20/verdict.md): overall 7.2 (was 7); UI 7.5 (7.5), UX 7.5 (7.5), usability 7 (7), human wording 7.5 (7.5), agent feel 7 (6.5), similarity 7 (7.5). Top asks: Ask shows a sourced example answer before sign-in and its conclusion opens a prefilled watch; My stocks surfaces one real dated agent check with evidence and next check above the findings; compact mobile agent preview with the calendar/trading-days rule stated; stock call and evidence easier to scan above the chart; a concise reason under each mobile finding.
- Builders started (3): Ask example answers (real pipeline, cached per stock per day in tm_ask_examples, daily cap, generated on panel open only) + answer → prefilled watch; real example agents for the example portfolio (system uid, run by the after-close runner, latest real run shown on My stocks and the landing; never faked); mobile agent preview / finding reason / stock call hierarchy polish.

### 2026-11-11 ~16:00 UTC, owner decisions; ship 20 frozen (1b527c2) and in its quality pass (lead)

- Owner decided (AskUserQuestion): stable calls go live with ship 20 (fast path: seed from current calls, then on); paywall V2 on (Free: 3 covered stocks, 1 agent, filing/news agents Pro; Ask, research and own-portfolio maths unchanged); keep the 3-day card trial; build the strategy rebalance note for Pro.
- Call stability report: today ~92 changes per stock per year, 68%/81%/90% reversed within 5/10/20 sessions, median call life 1-2 sessions, Add↔Trim within 5 sessions 471 (30d) / 2,226 (90d); with the rule (4 agreeing sessions, 12-session hold, one step without a hard reason; hard reasons: results, outlook, own move >4× normal in the same direction, S&P −4% in 5 sessions): 8.1 changes a year, 2.2%/4.1%/32% reversed, median life 17, Add↔Trim within 5 sessions 17 (30d, all with a named reason) / 25 (90d); after a report the call followed the turn within 5 sessions in 33 of 34 cases; no return edge either way. Two quality passes; publish-before-state race fixed (state saved first; a failed save keeps the previous brief).
- Paywall report: leaks fixed with no flag (briefing ignored coverage — explained moves and add levels on every holding; agents named levels for uncovered stocks; Ask/chat/research ran uncounted when the meter store failed — now fail closed); V2 rules live inside lib/entitlements.ts selected by PAYWALL_V2 (Vercel build + VPS mail mirror); downgrade: agents paused, never deleted; filing/news agents marked Pro; covered_held lets a Free account pick back lost slots once; funnel events carry `paywall`. Open: Pro rebalance note (being built), showcase stocks kept as the demo, "Why"/"What would change it" stay free.
- Ask side panel: sidebar "Ask a question" and phone "Ask" pill; in-page /ask links open the panel with their ctx; page context mapping (stock, research, portfolio/ex.portfolio, memo, briefing, agent); full-screen handoff via sessionStorage; First Load JS +2 kB. Signed-in speed: session check off the critical path (background re-check, ≤10 min, never past expiry; cleared on account deletion), snapshot write after the response, uid-keyed 60s per-user cache, shared market build in the briefing; briefing 0.53-0.66s → 0.32-0.50s (reopened 0.13-0.15s), stock TTFB 128-222ms → 13-60ms (laptop).
- Lead: stock header rework (owner: "left having empty space and right too much text") — level line and next steps moved under the price, small print one line, reasons' date once; "Both still hold" for two reasons.
- Ship 20 candidate 1b527c2 (147 files): tsc 0, vitest 2224/2224 with and without PAYWALL_V2, eslint clean, pytest 1172 + the 3 pre-existing failures. Combined quality pass running on :8001 with PAYWALL_V2=1.
- Next after the pass: deploy with PAYWALL_V2=1 on Vercel and in /etc/tikrr/backend.env; call stability seed (--seed-current --write, timer paused) then CALL_STABILITY_MODE=on; Codex judge. Building in parallel: strategy rebalance notes (Pro), LocalDB keep-alive (undici dispatcher; idle reconnects cost ~300ms per read round).

### 2026-11-11 ~15:15 UTC, after-close fix live on the VPS; Ask side panel started (lead)

- Root cause of the after-close timeouts (builder, VPS journal + read-only timing): each price history (~3,000 dates and closes) rewrote ~6,000 array-index rows in a 4.3 GB LocalDB on a VPS with swap nearly full: 15-20 s per series; Nov 10 wrote ~358 of 554 series before the 90-minute cut and the strategies never wrote. Fix: backend/localdb/store.py diffs index rows, Yahoo last-digit jitter ignored, batched writes (≤30 docs / 1,500 changed values), prices and strategies split into steps with per-step limits (STEP_TIMEOUT_SECONDS), fetches 3 at a time with per-symbol failure isolation, retries only on locked/busy, lock waits logged. Laptop: 265 ms → 23-27 ms per doc; VPS estimated 0.1-0.2 s per doc (first real run tonight is the test).
- Shipped backend-only as eea5da6 (with deploy-code.sh npm install, senate_ptr.py off until SENATE_PTR_ENABLED=1, lib/agent-schedule.ts comment), tested on a clean copy: pytest 1129 passed, the same 3 pre-existing failures as live. VPS pulled to eea5da6; after_close dry run with the service env lists every step with its limit, including both node steps. tikrr-localdb.service not restarted (the server still runs the previous store code; jobs import the new one). Check tonight: `journalctl -u tikrr-agentdata-after-close` for "prices: wrote N in Xs".
- Real-user feedback on /stock/ADBE ("this is crazy actually, so much detail"; "what if asking was overlapped on the page you are, so you don't lose context ... option of going full screen"): Ask side panel builder started (drawer on desktop, sheet on phone, context from the page, in-page Ask links open it, full-screen handoff to /ask, lazy-loaded JS).
- Call stability builder waiting on its second quality pass.

### 2026-11-11 ~14:00 UTC, owner fixes; Codex + Cursor review the plans; paywall and signed-in speed started (lead)

- Owner fixes (working tree): nav group labels are small capitals, quieter than links (sidebar + phone menu); My stocks puts "What the agent checked" under the findings on desktop (columns balance) with a wider time column; rebalancing ideas never sell a Keep or Buy more stock (lib/portfolio-ideas heldByCall; Keep names listed as "our call is Keep, so we would not sell"; tests 2159/2159); ideas panel no longer repeats the quiet line.
- Owner (14:00): "we are giving too much free value ... we need locks in enough places so that they have to click the subscribe button." Paywall audit + plan builder started.
- Owner asked for Codex and Cursor to review the plans (scratchpad/review/: plans.md, codex.md, cursor.md). Agreement: (calls) the stability layer exists in backend/call_stability.py — fix the publish-before-state-save race (storage.py:1612-1669), relax defaults (min hold 20 / confirm 5 is a month), add guidance-change events and make live facts match the replay, don't use Add-vs-Trim returns as the go-live bar, seed tm_call_stability before "on"; (paywall) don't fork a second table, fix fail-open meters (entitlements-server.ts:164-166) and leaks first, build around one Pro promise (continuous whole-portfolio monitoring) with covered stocks as the main lever, define downgrade behaviour, measure the funnel; (next) data reliability, trustworthy calls, signed-in speed (briefing 5-12s signed in), one excellent agent loop, the paid journey end to end. Stop: new surfaces, more free portfolio tools, event-type tuning, Senate (until legal + feed), call engine v4. Both reviews relayed to the call and paywall builders.
- Started: signed-in speed (briefing, My stocks, stock page; per-phase timing; non-awaited snapshot writes; uid-keyed short caches; market parts from the shared cache).

### 2026-11-11 ~13:00 UTC, ship 20 assembling (lead)

- Integrated in the working tree, not shipped yet: visible watches (My stocks "Your agents" panel, finding watch lines, briefing agents strip + Ask box; next check only with per-job proof; lib/agent-watch*.ts); watch preview before sign-in (/agents?q= opens one editable agent with schedule, delivery and 4-week replay; sign-in only at save, draft survives via ?draft=; lib/agent-jobs-link.ts) and Ask's pinned context card (components/ask/context-pin.tsx); phone sub-nav "More" menu, citation bottom sheet, precise "played out" wording (lib/thesis-watch whatChanged, wired into lib/portfolio-home/pick.ts by the lead), CALL_COVERAGE "more than 700 US stocks" (726 of 796 have a call); new agent events sec_filing (form, 8-K item and "something big" filters, sec.gov link) and news (heavier than usual vs own 10 days and/or ≥65% one tone, fires on the turn), measured on the top 20 Oct 14–Nov 10: any filing 1.85 per stock per 4 weeks, "something big" 0.20, news tone ~1.75 a month (two sessions of tone data so far; "heavier" can't be measured until ~Nov 17 because sources changed Nov 9).
- Lead fixes: example agents panel follows the findings on phones (findings stay on the first screen); /agents "What it watches" shows the filled trigger ("New 8-K") instead of the template name; removed the news tone explainer from the agent preview.
- The filings/news builder's own quality pass didn't run (tool error); it is covered by ship 20's combined pass.
- Still running: call stability (owner, Nov 11: "it goes from accumulate to trim in the span of two days, which is crazy"; no Add↔Trim within days without a hard reason; one step at a time; minimum hold; reasons stored; shadow mode first).

### 2026-11-11 ~11:00 UTC, ship 19 live (67881e0, then 41481dc); agents run after the close; Senate blocked (lead)

- Deployed 67881e0 (vercel@65.14.0, Ready), main pushed; 41481dc follows (node job scripts await main at the top level: vite-node on the VPS's node 22 closed its module server before the reason check's imports loaded).
- Combined quality pass (scratchpad/qp19/) fixes before shipping: the stock read named both levels whatever the call ("TSLA is right at our buy-more price" on a Sell some call) — lib/stock-insights.ts now names only the matching level, nothing on Keep; Market today teaser notes rewritten ("In single-stock options, more puts than usual traded against calls, 0.77 against a 20-day average of 0.62."; "Traders put 85% on Hike 25bps, then 11% on Hike >25bps."); the reason finding's Ask question now matches its ctx ("Is the reason for owning UNH still holding up?"); briefing "with a confirmed reason" → "with news behind it"; stale comments.
- Verified on the exact tree: tsc 0, vitest 2073/2073, eslint clean; backend pytest 1080 passed with the same 3 failures as live (test_price_core_job low coverage, two test_stock_requests_terminal alias tests: pre-existing, open).
- Live: cached pages answer x-stocksbrew-view: cached, then x-vercel-cache: HIT; warm TTFB /stock/NVDA 0.10-0.15s, /stock/AAPL 0.11s, /briefing 0.18s, / 0.10-0.12s, /explore 0.11-0.14s, /movers 0.17-0.20s (first MISS per page 0.6-2.5s); /stock/ZZZQX 404; /anon/1/briefing 308; a session cookie gets the live page.
- VPS: pulled to 41481dc; root-only /etc/tikrr/agentdata-localdb.env (600) with only LOCALDB_API_TOKEN; drop-in token.conf on tikrr-agentdata-after-close.service; new timer installed (17:30 America/New_York, next 22:30 UTC today); `@ai-sdk/anthropic@3.0.135` installed with --no-save (VPS node_modules last installed 2026-07-31; deploy-code.sh never runs npm ci — open). Dry runs on the VPS through the service env: standing agents 4 jobs decided (2 notify, 2 nothing), nothing written; reason checks 0 of 183 accounts with reasons, nothing written.
- Senate trades: eFD (and www.senate.gov) answer Akamai 403 to non-browser clients from the laptop and the VPS, so nothing was ingested; the builder stopped rather than impersonate a browser. senate_ptr.py is built and tested on saved real pages, off until SENATE_PTR_ENABLED=1, in the working tree (not shipped). Legal note: 5 U.S.C. app. §105(c) bars commercial use other than news media dissemination; eFD makes visitors agree; a lawyer should look before Senate (or House) data is used in a paid product. Owner decides on a licensed feed or contacting the Senate Office of Public Records.
- Codex judge after ship 19 (CLI, live screenshots; scratchpad/judge19/verdict.md): overall 7 (was 6.5); UI 7.5 (7.5), UX 7.5 (7), usability 7 (6.5), human wording 7.5 (7), agent feel 6.5 (5.5), similarity 7.5 (7). Top asks: watch status and latest outcome beside each finding; editable watch (trigger, scope, schedule) before sign-in; Ask keeps the originating item visible; no clipped mobile sub-nav (accessible menu); citation bottom sheet on phones; precise reason wording ("played out" → what changed) and "our call on every stock" made true.
- Builders started (3): visible watches on My stocks + briefing (Your agents panel, Ask box on the briefing, finding → watch → result links); watch preview before sign-in + Ask context pinned card; mobile sub-nav menu + citation sheet + wording.
- Lead: backend/vps/deploy-code.sh now runs `npm install --no-save` when package-lock.json is newer than node_modules (ship 20).
- ~11:30 UTC: fourth builder: new agent events "sec_filing" (form and 8-K item filters, link to SEC) and "news" (heavier than usual and/or clearly negative/positive by stored tone), in the parser, describeJob, the no-hindsight replay and the run log, tuned to fire about once or twice a month per stock; logic in new lib/agent-events-*.ts modules. Volaren's agents fire on filings and news; ours did not.

### 2026-11-11 ~10:00 UTC, ship 19 nearly ready; Senate trades started (lead)

- Done and integrated in the working tree (not shipped yet): My stocks finding loop (finding → evidence → Ask → watch → last/next check; all lead findings fit one phone screen; MSFT card now about Microsoft), portfolio-aware Copilot (uid-scoped tools for holdings, reasons, week, agents, research, briefing items; typed `ctx` links; "Watch this" fills /agents, never saves), stock call shows its dated basis, what would change it and "we can't show that calls like this beat the market"; research citations open source + date at the claim; Market today hierarchy (read → cross-asset strip → biggest moves + sectors → six collapsible sections; page half as tall); phone landing shows the briefing card in the first screen; scheduler: standing agents never ran on a schedule in production (step crashed on missing env, React `cache`/`unstable_cache` outside Next, old timer time) — fixed with scripts/jobs.config.ts and env handling; new nightly no-model reason checks (scripts/run-reason-checks.ts) that never write after a failed read; lib/agent-schedule.ts drives "Your agents check again after the close, from 5:30 PM ET".
- Lead fixes: chart shows only the call's own level (no "Buy more below" on a Sell some call); "1 of 7 biggest moves was a gain"; My stocks questions carry `ctx` (reason/memo/stock/portfolio, `ex.` for the example); next agent check uses the real schedule and NYSE holidays.
- Waiting: cached logged-out pages (QA found LocalDB reads entering the Data Cache under force-static; builder fixing, plus screener remount, junk stock URLs, degraded renders).
- VPS steps for ship 19 (beyond pull): root-only /etc/tikrr/agentdata-localdb.env with only the LocalDB token, a drop-in for tikrr-agentdata-after-close.service loading it, the updated timer from backend/vps/units, daemon-reload and timer restart.
- New builder: US Senate trades from eFD (senate_ptr.py, weekly after house_ptr, senators wherever House members show, copy tests). Legal note requested for the owner (Ethics in Government Act commercial-use restriction).

### 2026-11-11 ~08:40 UTC, ship 18 live (cc4b14c): research, import, reason watcher, logos, workspace, speed (lead)

- Deployed cc4b14c (vercel@65.14.0, Ready), main pushed (plus 2111442: Pillow in backend/requirements.txt). VPS: /opt/tikrr pulled to 2111442, Pillow 11.3 installed in the venv, tikrr-localdb.service restarted; `/health` sends `X-LocalDB-Backlog: 128` locally and through the proxy, so the web adapter now raises its concurrency to 16. `IMPORT_HASH_SECRET` added to Vercel production (random, sensitive; the import no longer falls back to the LocalDB token). Weekly schedule gained the stock logos job.
- In it: long research reports (/stock/[symbol]/research, free 3/month, Pro 30, shareable), screenshot import (/import, adds-only save), the reason watcher (why you own each stock, checked on page open; rows only speak when a reason is weaker, broken or played out), real logos for 851 of 859 symbols from tm_stock_logos via /api/logo, My stocks agent workspace (2-3 lead findings, Ask box, "What the agent checked", "Coming up"), share cards and SEO for 15 pages, client speed (First Load JS / 418→151kB, /briefing 442→178kB, /portfolio 415→148kB, /stock 448→~257kB; ~260 links without full reloads; fonts 168→30-99KB) and server speed (stock page 39→30 cache reads, 3.5MB→0.44MB read per request, parallel reads).
- Live after deploy, warm: /stock/NVDA, /stock/KO, /stock/AAPL total 0.41-0.75s (before 0.9-2.1s with tails to 10s); /briefing 0.40-0.45s; / 0.26-0.42s. /api/logo/- 400, /dev/thesis-watch 404.
- Combined quality pass (scratchpad/qp18/): no blockers; fixed before shipping: reasons loaded by the stock page first left Portfolio rows unchecked (store `checkedAll`), up to 50 wording calls at once (capped at 4), /explore sharing /briefing's title, "trim" wording in new copy, "full research" clashing with the free plan's "full report" (renamed "long research report"), two research entries on the stock page (Related chip removed), the small label above the reason note, import hash keyed on another service's token.
- Verified on the exact tree: tsc 0, vitest 1979/1979, eslint clean on changed code; screenshots scratchpad/s18/ and judge18/.
- Open: the MSFT lead finding opens with "led by Apple at 17%"; a check only runs when someone opens a page (no nightly job or email yet); OpenAI path of research and import untested live; reasons sheet has no focus trap; signed-in surfaces still only covered by tests and preview pages.
- Codex judge after ship 18 (CLI, live screenshots; scratchpad/judge18/verdict.md): overall 6.5 (was 6); UI 7.5 (7), UX 7 (6), usability 6.5 (6), human wording 7 (7), agent feel 5.5 (4), similarity 7 (7). Core ask: connect finding → evidence → conversation → editable watcher. Top 5: findings get "Ask about this" + evidence + watch rule + last/next check in one card; portfolio-aware Copilot reachable with context from briefing, holdings and research; stock page call shows its basis and uncertainty; compact mobile overview; inspectable research citations.
- ~08:55 UTC: two more builders (6 running): scheduled agents and nightly reason checks (standing agents are on the after_close schedule but production's newest run is Nov 9; diagnose, fix, add a no-model nightly tm_thesis_checks job, export the real next-run time so "checks again" copy is true), and Market today hierarchy + phone landing showing the product in the first screen (Codex ship-17 asks 4-5).
- Builders started (4): finding lifecycle + compact mobile on My stocks (also fixes the MSFT/Apple mislabel); portfolio-aware Copilot with typed context links and Watch-this into /agents; stock call basis/uncertainty + research citation popovers; speed: cached logged-out pages via middleware rewrite (target ~50ms TTFB).

### 2026-11-11 ~07:45 UTC, ship 18 in build: speed, import, research, logos, workspace (lead)

- Speed plan from the profiler (scratchpad/perf/): stock page does ~22 LocalDB reads in ~7 sequential rounds plus ~3MB of unstable_cache reads per request (whole 1.5MB screener snapshot for one row, 547KB follow sources for slugs), metadata reads in sequence, LocalDB server backlog 5 / HTTP 1.0 causing ~1s stalls; client ships ~785KB JS per page (recharts via app-chrome, motion via `import * as Icons`, eager posthog, render-blocking font CSS), plain <a> stock links reload the page, ~15 nav prefetches and a double search-index fetch per page. Two speed builders running: stock page server (owns app/(app)/stock/[symbol], stock-page-stream, lib/screener, lib/local-firestore, backend/localdb/server.py) and client (layout, app-chrome, fonts, posthog idle-load, search index once, <a>→<Link> codemod over 109 files, hover-only nav prefetch). Client baseline (production build, laptop): First Load JS / 418kB, /briefing 442kB, /portfolio 415kB, /stock 448kB; /stock/NVDA 390px LCP 2.9-3.6s, TBT 127-252ms; ~168KB fonts per page, only Instrument Sans renders.
- Screenshot import finished (vision tested on Haiku with mock screens; production would use OpenAI gpt-5.6-luna, untested; adds-only save route; caps verified). It must ship with the thesis work (shared thesis step).
- Logo sweep added logos next to tickers in ~28 more files; logo route bugs (bad-key batch 503, `%` 500) relayed to the logo builder.
- Deep research and share-card quality passes: no blockers; findings relayed to their builders (subagent reports were reaching the lead instead of the builders, so three builders sat idle until relayed).
- Running (8): thesis/reason watcher, My stocks workspace (Codex asks 1-3), speed server, speed client, deep research fixes, logo fixes, share-card fixes, one builder subagent.
- Open: ship 18 integration once they report; VPS restart for the LocalDB server change; Codex re-judge after ship 18.

### 2026-11-11 ~07:10 UTC, ship 17 live (084a5c5) (lead)

- Deployed 084a5c5 (vercel@65.14.0, Ready), main moved and pushed. Live check: 11 pages 200; "No confirmed reason" no longer shown (it remains only in the briefing's serialized data, which the speed work will trim).
- Quality pass findings fixed before shipping: a lone reasonless move on a personal briefing card now shows its next step (so the card keeps Got it / Keep watching) instead of an empty row; the remaining wording ("Without a reason" filter, signals read "came with no news yet", landing empty state, plainFinance drops the missing-catalyst clause, run-log detail, briefing summary, landing FAQ and lede, docs, compare pages); /portfolio's example memo now uses rules only (`loadExampleMemo(..., { worded: false })`, own cache key) so the overview never starts a model call; landing move rows lost their size bars; blog CTA points at /portfolio/analyze; dead `max` removed in signals.
- Verified on the exact tree: tsc clean, vitest 1675/1675, eslint clean on the changed files; screenshots scratchpad/s17/ (signals movers 1280/390, portfolio 390) and scratchpad/qp_shots/.
- Codex judge (CLI, live screenshots; scratchpad/judge17/verdict.md): overall 6; UI 7, UX 6, usability 6, human wording 7, agent feel 4, similarity 7. Top asks: a portfolio-aware Ask entry with suggested questions; visible agent activity (what was checked, what changed, next check); My stocks reduced to 2-3 prioritised findings with one action each; mobile clearance and product higher on the landing; Market today hierarchy. Asks 1-3 handed to a My stocks agent-workspace builder (owns lib/portfolio-home, components/portfolio-home, the page).
- Open: speed plan (profiling agent), the five builders and the workspace builder into ship 18, Codex asks 4-5.

### 2026-11-11 ~06:55 UTC, ship 17 frozen and fixed; builders resumed after the session move; speed is next (lead)

- Ship 17 candidate (a5e8fe3 plus fixes in scratchpad/wt19): My stocks overview, richer landing, Market today with the Markets sections, ideas fix, dividend ideas, shorter headlines, agent moments, owner tweaks. On the frozen tree: tsc clean, vitest 1675/1675, eslint clean.
- Owner fixes added to the candidate (and to main): screener phone names on one line; size bars removed on /movers and the briefing movers panel; "No confirmed reason yet" removed from every UI surface (briefing panel, briefing stock cards via `lineText` returning "" and `LineRow` skipping empty rows, signals rows, briefing and signals reads, landing hero, share cards). The briefing's reasonless line now reads "Also moved: GDXU −16.28% and ELMT −12.46%." Screenshots in scratchpad/s17/ (movers 1280/390, ideas, news, screener 390, dividends 390, briefing 1280, signals).
- The session moved accounts on a usage limit; the five builders (deep research, screenshot import, logos, reason watcher, share cards/SEO) and the first quality pass stopped. All five builders resumed from their transcripts; the quality pass was restarted on the updated candidate.
- Owner (06:50): the stock page and the briefing load slow; after this UI round the main focus is speed. Live, logged out: /stock/NVDA TTFB 0.5-0.8s, total 0.9-2.1s, HTML ~650KB (others 145-210KB); /briefing TTFB ~0.3s. A profiling agent is measuring server reads, payload, client JS and throttled mobile loads, and will hand back a ranked fix list.
- Open: ship 17 waits on the quality pass; Codex re-judge after it ships; speed plan; the five builders integrate into ship 18. Owner to-dos: postal address, Brevo domain authentication, delete the stray Vercel project "wt11".

### 2026-11-11 ~06:40 UTC, laptop ran out of memory; capture helper fixed; headlines shortened (lead)
- The owner's laptop died. Causes:
  - about six builders each running headless Chrome and vitest at once, plus extra dev servers;
  - about 4,100 leftover Chrome profiles (19GB) in the temp folder, from shot.mjs, which never deletes its profile.
- Fixes:
  - `scratchpad/shotq.sh`: at most 3 Chromes across all builders (it waits for a slot), with a private profile per capture deleted afterwards (tested).
  - Rule from the owner: coding in parallel is fine (at least 3 builders); browsers capped at 3 and servers at 3-4 (memory light-on-ram).
- Live today too:
  - `8ceb5e6`: one shared watchlist edit with Shares and Cost per share; "Below $296" beside the call.
  - `d7d18ba`: "How our calls did" removed from the weekly email (owner: no scoreboard in emails). VPS pulled.
- Headline sweep done: about 20 reads shortened to one idea of 12-20 words; moved facts and caveats sit in the first lines. Headline font 17/19px (was 19/21). tsc clean, vitest 1816/1816. Screenshots in scratchpad/hl.
- Built and waiting to ship:
  - My stocks overview;
  - the richer landing ("Everything it watches for you", 9 live cards, no model calls);
  - Market today with the Markets sections;
  - ideas-page fixes (no sell on Buy-more names, small trims dropped, one weight base);
  - dividend income ideas;
  - the headline sweep.
- Running: agent moments (next steps on stock, briefing, watchlist and explore findings) and leftover fixes (phone bar check, truncated subtitles, markets card copy, copy-page wording). Ship 17 follows them.

### 2026-11-11 ~06:10 UTC (real clock; the entries below ran ahead), new emails switched on (lead)
- Owner: "i still get old designed emails". The email v2 cutover was never done. The owner said yes for everyone, the gmail sender for now, old alerts off, and gave their contact email for the footer.
- Done:
  - Vercel production env `EMAIL_UNSUBSCRIBE_SECRET` and `MAIL_V2_ACTIVE=1`, then a redeploy (`a0b28b9`); the secret was generated into a 600 file and never printed.
  - VPS pulled; `/etc/tikrr/backend.env` backed up and appended with the secret and `MAIL_V2_ACTIVE=1` (EMAILS_ENABLED was already 1). The old premarket, open and weekly senders now skip.
  - The old power-trade and automatic Radar alerts are gated off (`a0b28b9`, LEGACY_ALERTS=1 brings them back). Every email footer shows the contact email.
  - Plain call words in emails (`d8b2066`): Buy more / Keep / Sell some, "fell to our buy-more price".
  - Dry runs over 164 accounts: daily 36, weekly 58, winback 10, alerts 0.
  - One real daily and one weekly sent to the owner.
  - `install-mail-timers.sh`: alerts every 15 min, lifecycle hourly, daily 8:30am ET (13:30 UTC), weekly Sat 9am ET.
- Open, for the owner:
  - CAN-SPAM needs a physical postal address in the footer (an email is not enough).
  - The gmail sender fails DMARC; authenticate stocksbrew.online in Brevo.
  - "We miss you" goes to 10 people on the first lifecycle run.
- Watchlist (owner): no per-row Edit on phones; the shared Edit dialog now has Shares and Cost per share boxes; levels read "Below $296" beside the call chip. Built, quick review running, ships next.

### 2026-11-11 ~08:30 UTC, owner feedback hotfix live; landing, Market today, headlines, ideas, dividends in flight (lead)
- The owner is awake and reviewing the live site.
- `4250c02` LIVE (hotfix built on the live commit with only these files):
  - holdings table shows the ticker only;
  - the call column says Buy more / Keep / Sell some, with only the level that matches the call (none for Keep, none more than 50% away);
  - Edit your Watchlist has a Shares box per holding (the quality pass found three draft bugs: cancel persisting, empty box saving the last typed value, stale draft after Hold → Watch → Hold; all fixed by reading drafts once at save);
  - one icon per place, beside each page title (`PageIcon` / `iconFor`) and in Market today's list, with new movers and sectors icons;
  - Why stocks moved: the reason is the link (no per-row "Why it moved"), and lists scroll inside about 8 rows;
  - DataTable scrolls inside about 8 rows by default (`maxRows`);
  - Signals movers open on "With a reason", without bars;
  - news tone reads "75% negative";
  - "on tomorrow" is fixed;
  - the x-ray shows a signed-in person's own holdings even with no funds.
- Verified: tsc 0, vitest 1604/1604, eslint clean. Screenshots read: explore directory with icons, movers desktop. Live: 7 pages 200.
- Owner rules saved to memory (compact-tables-and-rows): 8-row scroll lists with no scrollbar, no repeated row links, ticker-only tables, a call shows only its own level, one-figure tone, short headlines (12-18 words), one icon per place.
- Codex judge round 3 (codex CLI, screenshot-only, stricter, so not comparable to round 2's 7.7): app UI 7, UX 6, usability 6, wording 7, agent feel 5, overall 6. Main ask: next steps tied to each insight (interactive agent moments). It also flagged the bottom bar covering content on phones, likely a full-page capture artifact (to verify on a real scroll), and two truncated page subtitles.
- My stocks overview built (`/portfolio`: "What your agent noticed this week", five items with actions and watch links, a tool grid, the nav grouped Your stocks / Plan ahead / Act; the old analyzer moved to /portfolio/analyze). Not shipped yet.
- Running:
  - ideas-page fixer (no sell on Buy-more names, tiny trims dropped, one weight base: Technology read 73% vs 56%);
  - Market today rebuilt with the Markets page's substance;
  - headline-shortening sweep;
  - dividend income ideas;
  - a richer landing ("Everything it watches for you", live cards per capability; owner: "too thin").

### 2026-11-11 ~07:50 UTC, goal planner and rebalancing/tax ideas live; My stocks home started (lead)
- `b2e475a` LIVE: /portfolio/goal and /portfolio/ideas (nav "Goal planner" and "Rebalancing ideas", sitemap, a link from /watchlist/tax).
- Ship 16 quality pass: the goal math is sound (block wraparound, percentiles, the lever, inflation, a symmetric discount). Fixed before shipping:
  - Mixed short and long lots were taxed lot by lot; now US netting (`nettedTax`, tests). A +$1,000 long and −$1,000 short sale was "$90 less tax"; it is now $0.
  - The read named one rate for a mixed sale (now both).
  - On phones the "not advice" line sat below a 6,000px page; a one-line version now sits under the read.
  - Same-index funds (QQQ/QQQM, IWM/VTWO, VTI/ITOT/SCHB, SPLG, VGT/XLK) are never offered as wash-sale look-alikes for each other.
  - The goal headline now carries "counting only half of each holding's past lead over the S&P 500", and the page says "not advice".
- Verified: tsc 0, vitest 1604/1604, eslint clean. Screenshots read: goal phone, ideas desktop and phone. Live: 6 pages 200.
- Started:
  - My stocks home ("What your agent noticed this week", 3-5 findings across memo, x-ray, earnings, dividends, goal and ideas, each with a next step and a watch link), plus the ten-item My stocks menu regrouped.
  - Codex judge round 3 through the codex CLI, on the live site, 18 pages.

### 2026-11-11 ~07:20 UTC, baskets and Market today live; goal planner and ideas in QA (lead)
- `e8f11ce` LIVE:
  - Build a basket (/baskets/new, /baskets/<slug>).
  - UI loop batches 18-20: Market today has three ranked developments, sector bars and one directory; pricing says plainly what is free and what agents vs alerts are; briefing reasons name their publisher; the landing agent card fits a phone's first screen.
- Ship 15 quality pass: no privacy or Pro-gate issues. Fixed before shipping:
  - a Taxes-page link to the unshipped /portfolio/ideas;
  - followers stuck when a basket is locked or empty (Follow now always shows for followers);
  - the landing card's "Why:" contradicting "no confirmed reason yet" (now "Why we'd keep it:", from the call word);
  - a basket page repeating a stranger's words from ?q= (the "I didn't use" line is never shown on slug pages);
  - a missing comma; the pricing alerts line now names buy-or-sell-price alerts.
- Verified: tsc 0, vitest 1542/1542, eslint clean. Screenshots read: landing (desktop and phone), explore, basket builder (phone).
- Live: 10 pages 200, unknown basket 404, and /api/baskets/build?q=cheap banks returns 303 to its basket. The Vercel CLI printed "Not authorized" on the log stream, but the deployment built Ready and aliased (checked with `vercel inspect`).
- UI loop round 21: Codex 6.46, Cursor 5.21; down, mostly on untouched stock pages (reviewer variance). The loop finished its rounds and is not running now.
- Goal planner landed (`/portfolio/goal`):
  - 4,000 replays of 12-month blocks of real monthly returns since Dec 2014, seeded.
  - A hindsight discount by default (each holding counts half of its lead or lag over the S&P 500), with the full replay behind a "flattering version" checkbox.
  - 3% flat inflation toggle, levers, presets.
  - Example read: "In almost every replay this portfolio reaches $1 million by 55, against about 7 in 10 with only the S&P 500; even the weakest one in ten gets to $1.48 million." (The example starts at $128k with 20 years to go.)
- Rebalancing and tax-loss ideas landed (`/portfolio/ideas`):
  - sized trims for concentration over 10% (funds counted), drift and sector tilt, with estimated tax on each (rates changeable);
  - adds to Buy-more names;
  - losses with wash-sale dates and look-alikes;
  - a "tell me if X falls another 5%" agent link.
  - Example: "3 companies are each above 10% of this portfolio once the funds are counted, led by Apple at 17%."
- Ship 16 candidate `3563ea3` (goal, ideas, nav, sitemap, the Taxes link): tsc 0, vitest 1603/1603, eslint clean. Quality pass running.

### 2026-11-11 ~06:45 UTC, goal planner and rebalancing/tax ideas started; council round 20 best (lead)
- Council round 20 (batch 19): Codex 6.75, its best yet; Cursor 5.41, flat. Round 19 was 6.56 / 5.41. The UI loop is still active, editing the landing, briefing, pricing and plain-copy.
- New builders (Agent tool; the T3 delegate tools are gone after the account move):
  - Goal planner (`/portfolio/goal`): a block bootstrap from the real monthly returns of the holdings since 2014, with the 10th/50th/90th outcomes, the chance of reaching the target, one lever, and the limits stated.
  - Rebalancing and tax-loss ideas: sized trims and adds with estimated tax, losses with the wash-sale rule, similar stocks, and agent offers. Research, never advice, no execution.
- Next ship (15): baskets in plain English and the history-builder leftovers, once the loop's landing work settles or is left out.

### 2026-11-11 ~06:30 UTC, memo, earnings season, share cards live; baskets and history landed (lead)
- `b5b590a` LIVE and VPS pulled:
  - weekly memo (/portfolio/memo);
  - earnings season (/portfolio/earnings, up to 8 past reports per stock);
  - share cards (share button on the five portfolio pages, /s/{id} with an OG card);
  - the Codex round-2 fixes (KO/NVDA consistency, relative dates, phone place-nav, memo wording, earnings labels, the agents preview, "Watch this for me" links);
  - UI loop batches 16-17;
  - the EDGAR earnings history job (after_close, before reactions) and one-day reaction windows.
  - The UI loop's landing rework stays out; it is unfinished.
- Earnings history (builder): `tm_earnings_history` has 3 years of 8-K 2.02 releases. Non-release 2.02 filings are rejected (638, e.g. LCID deliveries). Median reports went from 1 to 8 (656 stocks with 8). 109 missing price docs were written. Two-session reactions went from 699 to 193. 40 moves hand-checked to the cent.
- Ship 14 quality pass: share privacy and auth held. Fixed before shipping:
  - the history backend was missing from the commit;
  - a temp vitest config (`scripts/.tmp-vite.config.ts`, with another session's path) had been swept in;
  - the KO past-year range could sit below today's high (today's high and low are folded in now);
  - screener extras kept stale earnings gaps;
  - the memo said "took off the most" (now "cost the most");
  - the Costco swing line now says it is the biggest move on record;
  - "Nothing reports" became "No reports".
  - Kept: three small landing copy changes that leaked in ("Our call on every stock is free, and so is the full report on five you pick"), because they are more accurate than "Free to read every stock".
- Verified on the exact tree: tsc 0, vitest 1492/1492, eslint clean, pytest 17 + schedule OK. The frozen tree ran on :8001. Screenshots read: memo phone, earnings desktop. Live: 10 key pages 200, and an unknown share id gives 404.
- Baskets in plain English landed (builder): /baskets/new and /baskets/<slug>, with about 55 subjects, honest "can't filter" lines, a labelled backtest and a follow action. Its quality pass found 12 issues, all fixed. Lead: "Build a basket" nav entry under Research, sitemap line, and the "By its name, it is one of the banks" wording. It ships next.
- Open for the owner:
  - entitlements rows for followed baskets and basket backtests (they borrow the saved-screens limit and run free over the full history);
  - a `portfolio_memo` feature id;
  - share analytics events.
- Open: signed-out "Watch this for me" arrivals spend one of 40 daily parses per IP (fine for real visitors). The share button shows on example views and answers "nothing of yours to share".

### 2026-11-11 ~05:55 UTC, share cards landed (lead)
- Shareable portfolio cards built: a Share button on the signed-in portfolio, x-ray, dividends, stress test and memo pages. It opens a dialog with "This is exactly what people will see", choices of which read to share, and "Hide company and fund names". The public page `/s/{id}` (noindex) has an OG image so the link unfurls as the card.
- Example cards: "Once my funds are counted, Apple is 17% of my portfolio, not the 15% I bought directly." and "In the Covid crash, my portfolio would have fallen 32%, about the same as the S&P 500." (the image carries "History, not a forecast").
- Privacy: percentages and names only by default; dollars are opt-in, and only on dividend cards. The server rebuilds the card from the loaders and saves only if it matches the hash of the previewed card. Every version is checked for money, share counts and hidden names. The owner uid stays server-side, delete is owner-only (404 otherwise), ids are 12 random characters, and each person can keep 50 live shares.
- Its quality pass found a real leak (memo cards kept names when "hide names" was on), fixed. vitest 31/31, tsc and eslint clean. Real test snapshots were stored, rendered and then deleted (only the builder's own test docs). Screenshots read: stress OG image, x-ray share dialog.
- Open:
  - analytics events (`share_page_viewed`, `share_cta_clicked`...) wait for product-analytics.ts, which is held back;
  - no focus trap in the dialog;
  - LocalDB writes sometimes took over 25s during testing.

### 2026-11-11 ~05:45 UTC, builders mid-flight (lead)
- Working tree at 04:14 UTC (local clock) shows all four running builders active within the last minute:
  - baskets: app/(app)/baskets, lib/baskets-plain, app/api/baskets;
  - share cards: components/share, lib/share, app/api/share;
  - the Codex fixer: lib/stock-header-facts.ts, lib/stock-read.ts, lib/memo, components/memo, lib/agents-plain/ask-links.ts, the stress view;
  - earnings history: lib/earnings-season*.
- No new builder this tick, to avoid edit collisions; integration and ship 14 come first when they report.

### 2026-11-11 ~05:35 UTC, council round 18 (lead)
- UI loop rounds 16-18: Codex 6.72 / 6.66 / 6.66, Cursor 5.30 / 5.39 / 5.56 (Cursor's best).
- Batch 17:
  - The stock brief headline opens with the brief's own first sentence.
  - Every level more than 50% from the price is hidden across the stock page (NVDA's $310.62 is gone).
  - The call-change line uses the readers' words ("from Buy more to Keep").
  - The watchlist severity dot is visible in both themes.
  - The screener says "fell 0.3% ..., while the S&P 500 fell 0.4%".
  - Checks: vitest 1584, eslint clean.
- NVDA lost 4 points in round 18: the longer company reason fills the phone's first screen, and the brief headline tells a different story from the call. The fix proposed for next: keep the call as the lead, put the brief under "What we're watching", and fold the Why to one sentence on phones.
- The landing is still stuck (owner's headline; too many actions). Two S&P figures remain (−0.37% briefing, −0.38% Market today).
- Note: this session moved accounts and lost the T3 delegate tools, so the lead can no longer message running builders. Builders still running report when done: Codex round 2 fixer, baskets, share cards, earnings history. The queued message to the UI loop (explore, pricing alerts, briefing sources, phone hero) may not have been delivered.

### 2026-11-11 ~05:20 UTC, Codex judge round 2: 7.7 overall (lead)
- Codex (gpt-6-astra, high) reviewed 15 dev pages signed out at both widths. Columns are UI / UX / usability / wording / volaren similarity, then overall:
  - briefing 8.5/8.5/8.5/8.5/8, 8.4
  - x-ray 8.3
  - agents 8/8/8.5/8/9, 8.2
  - home 8.1
  - copy 8.1
  - stress 8.0
  - dividends 7.9
  - earnings 7.9
  - NVDA 7.8
  - pricing 7.8
  - watchlist 7.6
  - explore 7.4
  - screener 7.4
  - memo 7.1
  - KO 6.2
  - App: 8.2 / 7.9 / 7.7 / 7.6 / 7.9, **7.7** (was 7.0).
- Its verdict was to hold shipping over data contradictions:
  - KO: a call dated Sep 22 citing an Oct 27 report; the dividend shown as 2.2%, 0.03% and 2.22%; a $96.90 price above the "past-year" max of $84.04.
  - NVIDIA's close $168.89 vs $168.79, and its dividend yield 0.59% vs 0.51%.
  - "this week" vs "next week", and "in 6 days" vs "in 7".
- Other findings:
  - On phones the active portfolio tab sits off-screen.
  - The memo repeats its opening, and "Eight ... are down 0.1%" reads oddly.
  - Earnings season says "Not reporting" and "±5.3% usual" (2 reports).
  - The agents default example competes with the request.
  - The biggest volaren gap: continuity. A finding should offer "watch this for me" in place.
- Delegated: a fixer for KO and cross-page data, relative dates, phone nav scroll, the memo, earnings labels, the agents example and contextual watch actions. Explore catalogue, pricing alert wording, briefing sources and the phone hero go to the UI loop (queued).

### 2026-11-11 ~05:00 UTC, baskets in plain English and share cards started; Codex judge round 2 (lead)
- New builders:
  - Baskets in plain English: type a theme and get matching stocks, with why each is in, a labelled backtest against the S&P 500, a follow action and a shareable URL. Builds on lib/ask-basket.ts, themes and backtest.
  - Shareable portfolio cards: a share action on the portfolio pages that snapshots one read, percentages only by default and confirm before sharing. A public /s/{id} page unfurls as the card and has one call to action. Aimed at the 544-visitors / 5-sign-ins problem.
- Codex judge round 2 started on the dev server (15 pages, including memo, stress, earnings season and agents).
- Running: UI loop round 18+, deeper earnings history, baskets, share cards, Codex judge. Ship 14 (earnings season, memo, loop work, history) waits for the loop and history builders.

### 2026-11-11 ~04:50 UTC, weekly memo landed (lead)
- `/portfolio/memo` built. Every Sunday-to-Friday week gets a memo built from facts the app already computes:
  - the week against the S&P 500 and who drove it;
  - call changes and their reasons;
  - explained moves;
  - earnings reported and coming;
  - 13F, Form 4 and Congress filings;
  - concentration and hidden exposure from the x-ray;
  - dividends;
  - the closest past shock.
- Rules pick the facts and write a complete memo. The Ask model may reword it, but every sentence goes through a numbers, names and direction check, and the rules' text is kept if one fails (a test rejects an invented "4.2%").
- On the example: "Eight of the example portfolio's nine holdings are down 0.1% through Tuesday's close, while the S&P 500 rose 2.0%... The thing to watch is that Technology makes up 56% of the portfolio, compared with 37% of the S&P 500." Past weeks are one tap away.
- Signed-in memos are stored per week at `tm_portfolio_memos/{uid}__{yyyy-ww}`, written by the web app only; finished weeks are never rewritten. The VPS LocalDB has no collection allowlist set (checked), so the writes are allowed.
- Gating follows `briefing_personal`; a `portfolio_memo` feature id is suggested for /pricing (owner, entitlements.ts is held back).
- Its quality pass found 9 bugs, all fixed. vitest 32/32, tsc and eslint clean. Screenshot read: desktop light.
- Lead fixes:
  - The memo said "moved to Hold (from Add)"; it now uses the app's words ("Keep", "Buy more", "Sell some").
  - A "Weekly memo" nav entry first under My stocks, and a sitemap line.
- Open: the briefing and portfolio links to the memo wait for the loop agent's files. The signed-in path is not run live (no local account with holdings).
- Ship 14 (earnings season, memo, loop rounds 18+, deeper earnings history) waits for the loop and history builders, which are editing files it would include.

### 2026-11-11 ~04:35 UTC, earnings season landed; council best scores; loop and history relaunched (lead)
- Earnings season planner built (`/portfolio/earnings`). On the example: "Two stocks in the example portfolio report in the next six weeks, 16% of its value. NVIDIA is the one to watch on Nov 17 after the close: it is 11% of the portfolio and moved 5.3% on average after its last two reports, about three times a normal day."
- The page shows a six-week strip with each report as a dot sized by portfolio share, report rows with past moves as dots around a "normal day" band, past reports on a tap, and holdings without a date at the bottom. Moves come from stored closes, with the session resolved from 8-K acceptance times.
- Only 1-3 past reports per stock exist (the calendar and reactions start May 15), and the read says so. Its quality pass found 7 bugs, all fixed. vitest 1579 (38 new), tsc and eslint clean. Screenshots read: desktop light, phone with NVDA opened.
- Lead: "Earnings season" nav entry and sitemap line. The landing card now prefers a showcase mover with a confirmed reason (of 1% or more), then the biggest move.
- Council rounds 16-17 (batches 15-16):
  - Codex 6.72, then 6.66 (best).
  - Cursor 5.30, then 5.39 (best).
  - From round 15 to 17: briefing Codex 45→50 and Cursor 32→43; explore 42→48 and 39→44; NVDA 45→48 and 36→42.
  - The landing is stuck at 44 / 33: the reviewers lead with the owner's "what to buy" headline beside a Keep with no reason, and about seven competing actions.
- Relaunched: UI loop round 18+, covering:
  - the landing as one story with one action;
  - the stock brief headline and "changed from what";
  - one S&P figure across pages;
  - the dark-mode dot and the screener's sign style.
- New builder: deeper earnings history (8+ quarters of 8-K report dates from EDGAR into a new collection, and one-day reaction windows in earnings_reactions.py).
- Running: weekly memo, UI loop, earnings history.

### 2026-11-11 ~04:20 UTC, company reasons, stress test and MCP tools live; VPS pulled (lead)
- `1917f95` LIVE:
  - The stress test.
  - Company-specific call reasons: 700 of 726 calls now have a reason written from the company's own numbers, against 35 shared templates before. The root cause was that no brief had been regenerated since `f57da15`.
  - The five MCP tools.
  - The opacity-class fix.
  - UI loop work: the briefing leads with the session, the landing shows one agent moment with "Watch X for me", tidier stock page hierarchy.
- Quality pass found five bugs, all fixed before shipping:
  - A "Full research report" chip on every stock page linked to the held-back /stock/X/research (404).
  - The chart's "over the past year" label was clipped on phones (now "in a year").
  - A null JSON body gave a 500 on /api/v1/agents/parse.
  - `_month_span` said "since November" for a year-long history.
  - The SQLite `_matches` let a missing field pass `<`/`<=`.
- Also fixed:
  - Dated plans in reasons ("The Nov 17 report decides...") now drop once the date passes (`dropPastDatedSentences`, with tests).
  - The landing card leads with the showcase stock that moved most (from the screener snapshot) and only says "What stood out today" for a move of 2% or more.
  - The briefing clock uses `hourCycle: "h23"`.
- Verified on the exact tree: tsc 0, vitest 1371/1371, eslint clean, Python 29 + 8 + schedule OK. The frozen tree ran on :8001.
- Screenshots read: briefing desktop, KO phone (its own reason), landing desktop and phone (NVIDIA −5.5% featured), NVDA phone. Live: 10 key pages 200.
- VPS: `/opt/tikrr` pulled to `1917f95` (owner allowed backend changes in this thread). Tonight's 22:30 UTC after-close run uses the new screener, so the company reasons stay; it also runs the new dividend history step. The 00:56 rerun finished (prices 3929s, screener ok); standing agents still fails (needs Firebase env, known).
- Open:
  - Done (council round 19-20): the stock page's brief panel is now "The news behind our call" and leads with the brief's first plain sentence as body text; the engine title ("AI growth remains powerful as scrutiny raises the proof required") is only a fallback.
  - `radar:read` tokens now read dollar values (scope decision for the owner).
  - The watchlist severity dot is faint in dark mode after the opacity fix.
  - The NVDA read still cites an 84%-away sell level.

### 2026-11-11 ~03:55 UTC, MCP tools landed (lead)
- Five new read-only tools on /api/mcp (20 in total), each wrapping the page's own loader and read:
  - `what_you_own` (x-ray)
  - `dividend_plan`
  - `stress_test`
  - `copy_test` (by slug, by search, or the ranking)
  - `watch_in_plain_words` (parse only; no MCP tool creates agents)
- Each also has a REST route under /api/v1, and /developers and the OpenAPI list them. Same Pro bearer auth, scope check and 200-a-day allowance as the existing tools. The user id comes only from the token.
- Tested through the real route handler in-process against live LocalDB, with the bearer check, usage counters and user doc stubbed (no real token minted): tools/list returned 20, a call with no token got 401, and all eight calls returned 200. Checks: tsc, eslint and vitest 1543/1543.
- Quality pass found no cross-user leakage, and its fixes are in (a 503 on a failed copy read, raw errors no longer reach clients). Lead added `maxDuration = 30` to /api/mcp.
- Open, for the owner: `watch_in_plain_words` sits under the `stocks:read` scope, and existing `radar:read` tokens now cover x-ray, dividends and stress (the consent text was widened). The /developers argument tables scroll sideways on phones (an existing table).

### 2026-11-11 ~03:40 UTC, memo, earnings season and MCP tools started (lead)
- New builders:
  - Weekly portfolio memo (`/portfolio/memo`): what changed, what could hurt and what is worth a look. The facts come from the existing reads; a model only words them, behind a numbers check.
  - Earnings season planner (`/portfolio/earnings`): every report coming for your stocks, with how each one moved after its past reports.
  - New MCP tools on the existing server at /api/mcp (OAuth, already on /developers): what_you_own, dividend_plan, stress_test, copy_test and watch_in_plain_words, so Claude and ChatGPT can use the new features.
- Running: UI loop round 14+, company-specific call reasons, plus the three above. Next ship: stress test, the opacity fix, the loop's work and call reasons, then these.

### 2026-11-11 ~03:35 UTC, stress test landed; opacity classes fixed site-wide (lead)
- Stress test built (`/portfolio/stress`): today's holdings replayed through eight real episodes pinned to SPY's own closes, with the S&P 500 beside each:
  - 2015 China scare
  - late-2018 sell-off
  - Covid crash
  - 2020 rebound
  - 2022 rate-hike slide
  - 2023 bank scare
  - 2024 yen unwind
  - 2025 tariff shock
- On the example: "In the Covid crash this portfolio would have lost 32%, against 34% for the S&P 500; of the single stocks, Apple did the most damage, down 31%." Each row opens to show each holding's move over the window.
- Gaps are named ("Not trading until ..."), never filled from the index. Under 50% coverage there is no figure, and hindsight bias is said out loud. Its quality pass found 15 issues, all fixed. Checks: 22 tests, tsc and eslint clean.
- Lead wiring: a "Stress test" nav entry under My stocks and a sitemap line. Screenshots read: d2-open (desktop, Covid row open) and m-open-dark (phone, dark).
- Found through the stress builder: every `oa-*` opacity class (`bg-oa-fg/30`, `text-oa-fg/85`, `border-oa-fg/30`, `bg-oa-muted-fg/45`, ...) compiled to nothing. That is 56 files; the `oa` colours were plain CSS variables, which Tailwind cannot fade. Bars and divider lines were invisible (likely the copy hub's visuals 3 from Cursor).
- Fixed in tailwind.config.ts: the `oa` colours are now `color-mix(in srgb, var(--oa-x) calc(<alpha-value> * 100%), transparent)`. Checked the served CSS (the classes now generate). Screenshots read: copy hub desktop (S&P bars visible), landing desktop, NVDA phone in dark mode. No regressions seen.
- Ships with the next batch (UI loop round 14+, company-specific call reasons) after one combined quality pass.

### 2026-11-11 ~03:20 UTC, x-ray, dividends and plain-English agents live (lead)
- `d9a21ae` LIVE:
  - /portfolio/xray and /portfolio/dividends, in the My stocks menu.
  - "Tell your agent what to watch" on Alerts & agents.
  - The Codex review fixes: one dated price source, VOO and QQQ in the example, copy-test wording and phone verdicts, stale follow records.
  - UI council batches 13a, 13b and 14.
- The quality pass found six bugs. Five were fixed before shipping:
  - The dated-price loader skipped newer quotes once the snapshot had any price, so a day-old snapshot could beat the live quote.
  - Dividends still priced from the last history bar.
  - VOO had no dividend history: the job now includes the x-ray ETFs; I ran it for 15 ETFs and 14 pay. The example now projects $1,220, not $932.
  - "NVDA account for" and a false "drove most of" on small shares.
  - Stale House profiles said "is reported" and "Dec 10" without a year.
  - Also fixed: a duplicate React key in the dividend list, fund weights over 1 in the x-ray, and pricing saying "save 17%" twice.
- Left open: "remind me before TSLA earnings and every Friday sum up my week" scopes the weekly review to TSLA (the preview shows it, and the save matches the preview). Two saves at the same instant can pass the 20-agent cap. Signed-in model reads are not counted during a store outage.
- Verified on the exact tree: tsc 0, vitest 1315/1315, eslint clean. Python: copy_trades, etf_holdings, schedule (unittest) and dividend_history (pytest) all pass.
- The frozen tree ran on :8001. Screenshots read: watchlist (prices match the screener: NVDA $168.79, MSFT $533.42), pricing, screener phone, dividends after the fix, McGarvey phone.
- Live: 10 key pages 200. A signed-out POST to /api/agents/parse returns the NVDA spec through the rules path.
- VPS: not pulled. The schedule lines for ETF holdings (weekly) and dividend history (after close) wait for the owner.

### 2026-11-11 ~03:05 UTC, plain-English agents landed (lead)
- "Tell your agent what to watch" now sits at the top of Alerts & agents. Fixed rules read the common shapes for free; Claude Haiku (the same setup as Ask) reads only leftover words and can only pick among the 12 existing watch kinds. Every sentence shown is written by our code, and tickers or numbers the person never typed are dropped.
- Saving goes through the existing `parseJobDraft` and `createJob`, so Free still runs two agents and saves extras paused. Daily rate limits apply per person, and signed-out model reads share one 300-a-day ceiling and fail closed.
- Example: "Tell me if NVDA drops below 150 or a fund sells it" becomes "I'll watch NVIDIA (NVDA) and tell you: when it closes below $150, or when a fund we track files a new 13F..." with an honest note that 13F filings can't tell a sale from a purchase. "sell NVDA for me" gets "agents never buy or sell for you".
- Its quality pass found 11 bugs, all fixed with regression tests. Checks: tsc 0, eslint clean, vitest 1457/1457.
- Screenshots read: desk-preview-light, phone-cannot-dark (plain-agents scratchpad).
- Not verified: a signed-in save end to end (the route is tested with the data layer mocked), and analytics events (product-analytics.ts is held back with the research work).
- Shared wiring: an optional `lead` prop on jobs-workspace.tsx and two lines in app/(app)/agents/jobs/page.tsx.
- Next ship: x-ray, dividends and plain-English agents, once the fixer (which edits the example portfolio and xray-data) lands, then one combined quality pass.

### 2026-11-11 ~02:55 UTC, council round 13 moved; loop and call reasons relaunched (lead)
- Council round 13 (structural reworks of the copy hub, pricing, screener and follow): Codex 6.57 (+0.14), Cursor 5.54 (+0.33), the first movement after four flat rounds. Copy hub +6/+13, follow +4/+9, pricing +2/+8, screener +4/+1. Batch 13b applied; the round-14 reviews finished, but the loop agent ended before parsing them.
- Relaunched the UI loop (round 14+): parse round 14, then the landing hero (one complete agent moment), briefing (session first), stock page hierarchy and explore.
- New builder: company-specific call reasons. The screener snapshot still carries eight shared templates, and the NVDA "Why" is generic engine prose. Extend backend/call_reason.py and regenerate for every covered stock. The screener snapshot gets rebuilt against LocalDB; the VPS steps get reported, not run.
- Times on the four entries below were corrected; they had been written about an hour ahead.

### 2026-11-11 ~02:50 UTC, stress test started (lead)
- New builder: "what if" stress test (`/portfolio/stress`). It replays real past episodes (Covid crash, the 2022 rate-hike slide, the 2023 bank stress, the Aug 2024 carry unwind, the Apr 2025 tariff shock, plus a recovery) on the portfolio's real holdings against the S&P 500, labelled as history, not a forecast.
- Running: fixer for the Codex findings (one price source, one example portfolio with VOO and QQQ, copy-page wording, stale profiles), UI loop round 13+ (structural reworks), plain-English agents, stress test. Next ship: x-ray, dividends and whatever of those lands, after one combined quality pass.

### 2026-11-11 ~02:45 UTC, dividend planner landed and wired (lead)
- `/portfolio/dividends` built on real data. `tm_dividend_history` has 798 stocks from Yahoo Finance, and announced payments come from the Nasdaq dividend calendar. On the example it reads "This example portfolio should pay about $842 from November to October, $55 of it already announced", with the biggest months, raises and yield on cost. Below that, a 12-bar chart with announced payments solid and estimates striped, then a per-stock list with frequency, next payment, yield, yield on cost and payout. Payout over 90% shows a risk line; REITs are exempt.
- Its quality pass found three bugs (a special dividend read as a raise, an announced special dropping the regular estimate, ties for the biggest month), all fixed with tests. Checks: vitest 23/23, pytest 8/8, tsc 0, eslint clean.
- Lead wiring: a "Dividends" nav entry under My stocks (longest-prefix matching lights it, not Portfolio), `/portfolio/xray` and `/portfolio/dividends` in the static sitemap, and an after-close `dividend history` job in schedule.py (VPS not pulled). Nav and sitemap tests 21/21, schedule test OK. Screenshots read: ship12/div-d.png, div-m.png.
- Open: a link to both pages from the portfolio view waits for the fixer, which owns the example portfolio files right now. Pay dates for stocks without calendar history assume a 21-day gap after the ex-date.

### 2026-11-11 ~02:35 UTC, Codex judge 7.0 overall; fixes delegated (lead)
- Codex (delegate_task, gpt-6-astra, high) scored 11 pages signed out at both widths. Columns are UI / UX / usability / wording / volaren similarity, then overall:
  - x-ray 8/8/8/8/8, 8.0
  - pricing 8/8/8/8/7, 7.8
  - briefing 8/7/8/8/7, 7.6
  - landing 8/7/8/7/6, 7.2
  - copy hub 8/8/7/6/7, 7.2
  - Berkshire copy 7.2
  - Pelosi copy 7.0
  - watchlist 8/7/6/7/7, 7.0
  - screener 8/7/7/7/5, 6.8
  - McGarvey 8/6/5/6/6, 6.2
  - NVDA 8/6/6/5/6, 6.2
- Top findings:
  1. The example portfolio and the stock pages disagree on prices (NVDA $176.79 vs $168.79).
  2. Stale records (McGarvey ends Dec 2024) lead with an 88-point headline.
  3. The NVDA "Why" is generic.
  4. Copy pages: "on the day it became public" contradicts the rule, gaps given as "%" instead of points, and phones hide dates and worst drop.
  5. The landing hero should show an observation, its portfolio consequence and "watch this for me".
  6. Watchlist and x-ray should share one example portfolio with the ETFs.
  7. The briefing should lead with the session, not the biggest mover.
  8. Screener presets should say why each stock qualifies.
- Delegated: 1, 2, 4 and 6 to a fixer. 3, 5, 7 and 8 are layout and pipeline work for the UI loop and the next tick.

### 2026-11-11 ~02:25 UTC, copy the smart money live (lead)
- `c89fa42` LIVE: /follow/copy hub plus a page per fund and House member (243 records in `tm_copy_trades`), UI batches 11-12, follow profiles and their share cards quoting the copy test.
- The second quality pass found two real bugs, both fixed before shipping. Share cards still showed the old performance numbers (Pelosi card +8.2 points vs 6.0 on the page). Records under a year were filed as "Not tested" although they had a full test; they now show "+x% vs +y% in all" under "Too short to rank", sorted last. Also fixed: a read error no longer caches a 404 for an hour, short or ended records say why they are not ranked on the profile, possessives ("Jones'"), "the copy made" rather than "it made" about a person, one "confirmed reason" wording, and the end date shown once per row.
- Verified on the exact tree: tsc 0, vitest 1211/1211, eslint clean, 20/20 Python. The frozen tree ran on :8001 and I screenshotted the opened short-record fold (ship11/w11-crop-d.png). Live: hub, Berkshire and Pelosi copy pages, McGarvey, follow, explore, briefing, screener and landing all 200; an unknown slug gives a real 404.
- Owner action: a deploy from a worktree without `.vercel/` created a stray Vercel project `wt11` (one failed build, no domain). Deleting it needs the owner's approval in Vercel.
- `COPY_TRADES_ENABLED` is not set on the VPS and the VPS is not pulled, so the copy records stay as they are until the owner turns on the weekly job.

### 2026-11-11 ~02:10 UTC, x-ray landed; ship 11 in QA; plain-English agents started (lead)
- ETF x-ray built (`/portfolio/xray`): 16 ETFs from SEC N-PORT in `tm_etf_holdings` (as of Jun 30 to Aug 31, 2026; 96.9-100% of stock weight matched to tickers). The read leads with "Once the funds are counted, Apple is 17% of this portfolio, not the 15% bought directly." It also shows a direct vs through-funds bar, sectors against the S&P, fund overlap (VOO and QQQ 54%), and the full table on a tap. Its own quality pass found and fixed 6 bugs. Lead fixes: dates in the app's format ("Jun 30, 2026"), the doubled-exposure row as a full sentence, a "What you own" nav entry under My stocks, and a weekly `ETF holdings` job in schedule.py (VPS not pulled). Screenshots read: final-desktop.png, final-mobile-read.png (xray scratchpad).
- Ship 11 candidate `4c31572`: UI batches 11-12, copy the smart money (with the fixes from its quality pass), and follow profiles reading the copy test's numbers (one figure on the profile and its copy page). tsc 0, vitest 1211/1211, eslint clean, 20/20 Python. The quality pass is running.
- UI council rounds 11-12: Codex 6.47 then 6.43, Cursor 5.11 then 5.21. Flat for four rounds of copy polish, so the fresh loop agent works on structural reworks of the weakest pages (copy hub, pricing, screener, follow, watchlist example).
- Started: plain-English agents (type what to watch, see the agent it understood, confirm). A Codex judge (delegate_task, gpt-6-astra) is scoring the new capabilities and the main pages against volaren.ai.
- Running: dividend planner, UI loop round 13+, plain-English agents, Codex judge, ship 11 QA.

### 2026-11-11 ~02:00 UTC, UI round 10 live (lead)
- `340850d` + `17b64f0` LIVE: round 10a+10b (screener fits at 1280 and opens on the 20 biggest, one S&P figure per day, company names in their own casing, share classes said out loud, calendar tense, Market today shows the giants, plainer copy across a dozen pages).
- Quality pass found seven issues; all fixed before shipping. The landing card leaked a call's reason on non-showcase stocks (now gated like the price levels). The screener note promised reasons Free does not get. "20 biggest" counted rows before share classes were folded. The giants read said "moved the other way" against a flat group. Pages said "the Nov 11 close" before 4 PM (new `closeWords`: "Nov 11, during trading"). Past reports said "Time not announced yet". Feed-name casing was wrong in places ("Bank OF", "Bny", "Ebay", "Hldgs", "AI Holdings" -> "AI").
- Exact tree verified in a worktree: tsc 0, vitest 1195/1195, eslint clean. Live: 13 key pages 200; the screener carries the new copy.
- Deploy gotcha: `vercel@latest` now writes a `services` vercel.json (backend/ seen as a Python service) and the build fails. Use `vercel@65.14.0`. `.vercelignore` now uploads only `backend/config`.
- Copy-trades quality pass: math and look-ahead clean. It did find: ended or short records rank #1 with nothing saying so (McGarvey stopped Dec 2024); the follow profile disagrees with the copy page by 10 points; the link 404s without a record; unknown slugs answer 200; and the biases are not stated. Sent back to its builder; it ships after that.

### 2026-11-11 ~01:50 UTC, round 10 candidate ready; x-ray and dividend planner started (lead)
- Round 10a+10b staged as candidate commit `ac39f7b` (built in the index only, with the import/thesis/research/copy-trades lines and files left out). Exact tree checked in a worktree: tsc 0 errors, vitest 1191/1191, eslint clean on the changed files. The quality-pass agent is still reading it. Ships after that.
- Council round 10: Codex 6.46 (flat), Cursor 5.20 (+0.39). Round 11 reviews are running. The loop agent is holding app edits until round 10 ships.
- New capabilities delegated (each owns its own directories, hooks come back to the lead): the ETF x-ray (`tm_etf_holdings` from SEC N-PORT, `lib/xray.ts`, `/portfolio/xray`) and the dividend income planner (`/portfolio/dividends`, 12-month projection with confirmed vs estimated payments).
- VPS after-close rerun still going at 01:46 UTC. Prices now run through Nov 10, which fixes the stale S&P figure once the snapshot rebuilds.
- Running: copy-trades builder, UI loop round 11, x-ray, dividend planner.

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
