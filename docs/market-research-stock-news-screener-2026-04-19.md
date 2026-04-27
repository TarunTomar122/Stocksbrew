# Stock News Screener Market Research

Date: April 19, 2026  
Scope: Competitor benchmarking for a paid stock news screener app targeting:
- US: `$12/month`
- India: `₹59/month`

---

## 1) Executive Summary

Your current `tm_*` pipeline is directionally right for a news-intelligence product, but competitor research shows a clear gap in **depth, freshness, and explainability** versus paid incumbents.

Most serious competitors are priced much higher than your targets:
- US serious tools: roughly `$25–$80+/month`
- India serious tools: roughly `₹250–₹1300+/month` (monthly-equivalent)

This creates an opportunity if you position as:
1. **News-first screener** (not full terminal)
2. **Actionable summaries + timeline + watchlist alerts**
3. **Low-friction pricing** with limited but high-value scope

Key conclusion: `$12/₹59` can work only if you keep infrastructure light and focus on one sharp use case: **“Tell me what changed and why it matters for my watchlist, fast.”**

---

## 2) Competitor Matrix (Pricing + Offer)

Prices below are as listed on official pages at research time and can change frequently.

| Competitor | Market Focus | Public Pricing (Observed) | Core Data / Intelligence Offer | Presentation Pattern |
|---|---|---:|---|---|
| Benzinga Pro | US | Basic `$37/mo`; Essential `$197/mo`; Options Mentorship `$457/mo` | Real-time newsfeed, signals, scanner, squawk, chat, watchlists | Fast terminal-like feed + scanner panels + alert workflow |
| TradingView | Global/US | Essential `$12.95/mo`; Plus `$24.95/mo`; Premium `$49.95/mo` | Charting + screeners + community ideas + alerts; market/news context | Chart-first workspace; dense visual watchlists and alert-centric UX |
| Finviz Elite | US | `$24.96/mo` annual-equivalent or `$39.50/mo` monthly | Screener, heatmaps, advanced charting, real-time-ish data tiers, alerts | Screener/grid-first with map + compact signal panels |
| Koyfin | US/Global | Plus `$39/mo`; Pro `$79/mo`; Advisor Pro `$199/mo` | Financial dashboards, market data, charting, estimates, portfolio workflows | Dashboard-first (macro + company cards + customizable workspace) |
| TrendSpider | US | Standard promo around `$52.38/mo`; Premium around `$56.42/mo`; Advanced around `$114.75/mo` | Automated technical analysis, AI assistant, bots, scanners, alerts | Workflow/automation-first; heavy power-user chart + automation stack |
| Tickertape Pro | India | Pro monthly around `₹299/mo` (higher tiers/annual options available) | Indian equities/fundamentals, “market mood,” forecasts, model portfolios | Mobile-friendly card/feed UX; retail-investor guidance format |
| Trendlyne | India | Basic `₹59/mo`; Premium `₹129/mo`; Super `₹649/mo`; Ultra `₹1300/mo` (plus annual variants) | Indian screeners, scorecards, DVM-style metrics, technical/fundamental tracking | Table + scorecard + screen flow; signal and ranking-heavy |

---

## 3) What Competitors Give in “Data”

### 3.1 Core data categories repeatedly present

Across 3–5 serious tools, winning stacks include:

1. **Live/near-live market context**
- Broad indices
- Sector performance
- Top movers
- Vol/flow/risk indicators

2. **Entity-level intelligence (stock/security)**
- Price + volume + volatility
- Analyst context (ratings/targets/revisions)
- Earnings/events calendar
- News + source confidence + event tagging

3. **Alerting and monitoring**
- Multi-condition alerts (price, indicator, news keyword, watchlist event)
- Mobile/email/desktop delivery

4. **Explainability layer**
- Why this moved
- What changed versus yesterday/last week
- What to watch next (catalyst + risk)

### 3.2 What your current TM pipeline already has

Your `tm_*` model already supports a lot:
- Instrument master (`tm_instruments`)
- Latest and historical quote snapshots (`tm_latest_prices`, `tm_price_snapshots`)
- News ingestion + enrichment (`tm_news_runs/articles`, `.../enrichments`)
- Stock intelligence docs (`.../stock_intelligence` with summary + timeline)
- Materialized views (`tm_views_dashboard`, `tm_views_instrument`)

### 3.3 Highest-priority gaps versus competitors

1. **Consistency/Freshness guarantees per active universe**
- Biggest issue you just saw: active universe points to stale namespace.
- Need strict run registry + active pointer integrity checks.

2. **News confidence + source quality scoring surfaced in UI**
- Competitors earn trust by showing source diversity/quality.

3. **Alerting UX and delivery**
- Many competitors win on alerts, not static dashboards.

4. **Calendar/event layer**
- Earnings, macro events, guidance windows.

5. **Comparative context**
- “Compared with peers/sector/market” for every key stock insight.

---

## 4) How Competitors Present the Product

### 4.1 Dominant UX archetypes

1. **Terminal Feed (Benzinga-like)**
- Speed-first, timestamped stream, scanner + chat + audio/squawk.
- Best for intraday traders.

2. **Chart/Alert Workspace (TradingView/TrendSpider-like)**
- Primary interaction is chart + conditions + alerting.
- Best for technical workflows.

3. **Screener + Intelligence Cards (Finviz/Koyfin/Tickertape-like)**
- Rank/filter grid + short insight blocks.
- Best for broad retail audience and subscription conversion.

### 4.2 Best fit for your planned product

For `$12/₹59`, you should optimize for archetype #3:
- **Screener rows + short AI reason cards + timeline drilldown**
- Minimal cognitive load
- Very fast “what changed today?” answers

Avoid trying to match full charting/automation suites at this price point.

---

## 5) Pricing Analysis for Your Targets

### 5.1 US at `$12/month`

This sits below most serious paid competitors and roughly at entry-level charting plan range.

To make this viable:
- Limit heavy compute per user/day
- Gate expensive features (deep historical backfills, high-frequency alerts, custom AI queries)
- Keep a tight default universe and cap custom watchlist size in base plan

### 5.2 India at `₹59/month`

This is extremely aggressive. Even India-focused paid tools often price higher for meaningful functionality.

A workable strategy:
- Keep `₹59` as **starter/intro tier** with hard limits
- Offer higher tier (`₹199–₹299`) for full watchlist intelligence + alerts + deeper history

---

## 6) Product Strategy Recommendation

### 6.1 Suggested 3-tier structure

1. **Free**
- Delayed/baseline feed
- Limited symbols
- No advanced alerts

2. **Starter (US `$12`, IN `₹59`)**
- Daily + session intelligence for a limited watchlist
- Basic timeline and catalyst/risk summaries
- Limited alert count

3. **Pro (US `$24–$29`, IN `₹199–₹299`)**
- Larger watchlist
- Faster refresh windows
- Advanced alert rules
- Priority insights and richer event context

### 6.2 Data features to build next (priority order)

1. **Universe integrity + freshness monitor**
- Hard fail if active universe lacks required docs.

2. **Event calendar joins**
- Earnings, macro, corporate actions.

3. **Confidence layer in every insight**
- Source count, source quality, recency score.

4. **Alerting pipeline**
- Watchlist signal alerts (web/email/mobile).

5. **Peer-relative context**
- “Outperforming/underperforming peers” with simple explanations.

---

## 7) Immediate Execution Plan (Next 2 Weeks)

### Week 1

1. Enforce TM-only run contract:
- one orchestrator command
- universe pointer validation
- run-status doc under `tm_news_runs/{namespace}`

2. Add freshness guardrails:
- UI badge for stale data
- backend checks before materialization

3. Add source-confidence fields into view docs

### Week 2

1. Launch watchlist alert MVP
2. Add event calendar block on stock detail and dashboard
3. Ship pricing page with tier limits clearly defined

---

## 8) Sources

- Benzinga Pro Pricing: https://www.benzinga.com/pro/pricing
- TradingView Pricing: https://www.tradingview.com/pricing
- Finviz Pricing (Elite): https://finviz.com/elite.ashx
- Koyfin Pricing: https://www.koyfin.com/pricing/
- TrendSpider Pricing: https://trendspider.com/pricing/
- Tickertape Pricing: https://www.tickertape.in/pricing
- Trendlyne Plans: https://trendlyne.com/subscription/plans/
- Screener AI (pricing signal pages): https://www.screener.in/ai/

