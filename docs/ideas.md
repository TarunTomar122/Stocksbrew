# Ideas

Product ideas for stocksbrew, newest research first. Owner said no to: WhatsApp/Telegram delivery, a public scoreboard of our calls, a browser extension.

Context (Nov 2026): about 544 visitors a month but only 5 signed in, so getting people to try the product is the biggest problem. Surveys say most retail investors now use AI for research (Investing.com: 62%; Finimize: 41% weekly) and YouTube is the top research source (56%). Big players are shipping AI agents: eToro (agents that trade), Schwab (AI summary of your top movers), Public (portfolios from plain language). Nobody we found ties a written investment thesis to what you actually own.

## The big one: an AI analyst that knows why you own each stock

- You add your stocks by screenshot, and it asks in a short chat why you own each one.
- It then reads every filing, earnings call, fund move and news story about your stocks, and tells you when a reason gets stronger or breaks, and what it would do.
- Once a week it writes a short memo on your whole portfolio: what changed, what is at risk, what is worth a look.
- It ties together screenshot import, the thesis tracker, the earnings day agent and the exposure x-ray, and it is the clearest reason to pay for Pro.

## Round 1 (approved)

- Screenshot import: snap your broker app and the AI reads your holdings into a portfolio in seconds.
- Try it without signing up: paste or screenshot your stocks on the landing page and get a full portfolio read instantly, then sign in to save it.
- Earnings day agent: minutes after a stock you own reports, get the numbers against expectations, what management said and how the stock reacted, from the actual filing.
- Plain-English agents: type "tell me if NVDA drops below 150 or a fund sells it" and the agent gets built for you.
- Deep research on any stock: one click runs a multi-step agent that reads filings, news and peers and writes a long, sourced report.
- Copy the smart money, tested: for every fund and congress member, show how you would have done copying their trades, with real backtests.
- "Best stocks for X" pages for Google: data-backed lists like "best dividend stocks under $50", refreshed daily.

## Round 2 (approved)

- Thesis tracker: write one line on why you bought a stock, and an agent watches for anything that breaks that reason and tells you.
- Hidden exposure x-ray: see what you really own inside your ETFs, e.g. "you hold 18% NVDA once QQQ and VOO are counted".
- What-if stress test: "what happens to my portfolio if rates jump or tech falls 20%", answered with real past episodes.
- Build a basket in plain English: "AI power stocks under $50B" becomes a tracked, backtested basket you can follow.
- Your portfolio in 60 seconds: a short daily video of what happened to your stocks, made automatically from your data.
- YouTube and X digest: what the big finance channels said about your stocks this week, summarised with links.
- Earnings call Q&A: ask questions of any earnings call transcript and get answers with the exact quote.
- Dividend income planner: a calendar and 12-month projection of the dividends your portfolio will pay you.
- Goal planner: "will I have $1M by 55" with your actual holdings, contributions and a range of outcomes.
- Stocksbrew inside ChatGPT and Claude: use your portfolio and our research from the chat app you already use.
- Smart rebalancing suggestions: concrete "trim this, add that" ideas to fix concentration and drift, with tax impact shown.
- Tax-loss harvesting alerts: tell me when I can sell a loser to save tax, and what similar stock keeps my exposure.
- Earnings season planner: one page of every report coming for your stocks this month, with what usually happens.
- Shareable portfolio cards: a clean image of your portfolio's read to post, which also brings new visitors.

## Spec: the reason watcher (the big one, not built yet)

What exists now: a person can save one reason per stock ("Why do you own NVDA?"), a kind plus an optional line of their own, stored on their own user doc as `theses: { [instrument_id]: { kind, reason, created_at, updated_at } }` (`lib/thesis.ts`, `/api/thesis`). The watcher reads that map and checks each reason against data we already store. It never writes numbers with a model; the rules pick the facts, and a model may only word the note.

How it runs
- Once a day after the screener snapshot and earnings jobs, plus right after an event for a held stock (earnings intel, an 8-K, a big move with an explanation).
- One check per (person, stock with a reason). Free runs it on covered stocks only; Pro on every stock with a reason. That makes it the clearest Pro reason, in line with `covered_stocks`.
- Each check ends in one of four verdicts, with the evidence, its source and as-of time: **still holds**, **weaker** (one signal), **broken** (two signals, or one hard one), **played out** (the reason did its job, e.g. a cheap stock is no longer cheap). Doing nothing is a valid outcome and is recorded.
- Output goes to the briefing as a "Needs you" item when the verdict changes, and to the alerts email for weaker or broken. Stored as `tm_thesis_checks/{uid}__{instrument_id}` (latest verdict, the signals that fired, history of the last 20).
- Thresholds are written down before they are tested, then replayed over two years of stored data per kind to count how often each fires. Anything that fires more than about once a quarter per stock is too noisy to ship.

What breaks each kind of reason, from data we store

| Kind | Weaker | Broken | Played out | Data |
|---|---|---|---|---|
| The growth story | Revenue growth slows by a third or more from the prior year; next-year EPS estimate cut 10%+ in 90 days | Revenue shrinks year on year, or guidance is cut in the earnings read, or our call moves to Trim and stays 30 days | n/a | screener `rev_growth`, `eps_growth`, `eps_next_y`; earnings intel; call history (`lib/stock-events.ts`) |
| The dividend | Payout ratio above 90%, or free cash flow below the dividend for two quarters | Dividend cut or suspended (yield drops with price flat, or an 8-K says so), or `div_growth` turns negative | n/a | screener `div_yield`, `payout`, `div_growth`, `fcf`; filings |
| It is cheap | EPS falls two quarters in a row while the P/E stays low (a value trap) | Losses or a going-concern note | P/E back above its own five-year median (`pe_hist_pctile` above 60) | screener `pe`, `fwd_pe`, `pe_hist_pctile`, `pe_hist_median`; filings |
| I believe in the product | Two weeks of mostly negative news about the company, or revenue growth below its sector's median | Recall, lawsuit or regulator action named in an 8-K or a confirmed move explanation, plus a falling revenue line | n/a | news tone per company, move explanations, filings, sector medians (`lib/insight-data.ts`). Weakest coverage of the six; say so in the copy |
| A long-term hold | Down 30% from the person's average cost with the call at Trim | Revenue down three quarters in a row, CEO or CFO leaves (8-K item 5.02), or a going-concern note | n/a | holdings `average_cost`, price history, filings, screener fundamentals |
| A short-term trade | Held more than 60 days | Price 15% below cost, or earnings in the next three days with no plan written | Price 15% above cost | holdings, price history, earnings calendar |

Signals that apply to every kind: insiders selling more than $10M in 30 days (needs Form 4 sales; `backend/agentdata/insider_history.py` keeps buys today), a tracked fund cutting the position by half in a 13F, our call changing direction, and an unexplained move of more than three times the stock's normal daily range.

The person's own words: when there is a free-text reason, the note quotes it back ("You said: every big cloud is still buying its chips") and names which stored facts speak to it. Matching free text to data is the one place a model helps; it chooses among the signals above and never invents a new number.

Not in the first version: segment revenue (we do not store segments), price targets of our own, any trading action. The weekly portfolio memo builds on these verdicts and comes after.
