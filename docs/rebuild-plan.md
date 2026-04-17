# Trace Money Rebuild Plan

## Goal

Rebuild Trace Money as a US-first, India-ready market intelligence product with:

- scheduled Python scripts
- Firebase as the system of record
- a thin frontend that mostly reads materialized Firestore view docs
- a low-fidelity frontend implementation first
- an article-intelligence pipeline that is reusable across stock pages, market pages, and later alerts/watchlists

This plan replaces the earlier mixed prototype approach. We should stop extending legacy feed/topic code unless it directly supports this plan.

## Product Direction

Trace Money is not a broker terminal and not a raw news reader.

It should combine:

1. `Market data`
   - price
   - day change
   - chart inputs
   - fundamentals
   - optional analyst/technical signals

2. `Intelligence data`
   - article understanding
   - stock/sector/market relevance
   - sentiment
   - key points
   - catalysts and risks
   - timeline of intelligence
   - market brief

The backend must keep those layers separate, even if the frontend shows them side by side.

## Scope

### Phase 1

- support `US` only
- support a curated `core` stock universe
- support small test universes of `5` and `10` stocks
- store all intermediate and materialized outputs in Firebase
- build low-fidelity frontend screens that show the correct information hierarchy

### Phase 2

- add `IN` market namespace using the same schemas and script interfaces
- expand the stock universe
- add richer analyst/institutional and technical layers if needed

## Stock Universe Strategy

We should not start with all stocks.

### Initial universes

- `us_test_5`
- `us_test_10`
- `us_core_150`

### Example `us_test_5`

- `NVDA`
- `AMD`
- `MSFT`
- `AAPL`
- `TSLA`

### Universe tiers

- `core`
  - fully supported
  - scheduled price snapshots
  - intelligence aggregation
  - dedicated frontend views

- `discovery`
  - can appear from news enrichment
  - not guaranteed price/fundamental snapshots
  - can later be promoted to `core`

The universe should live in a canonical file such as:

- `backend/config/instrument_universe.json`

## Data Model

The frontend should read 3 main kinds of documents:

1. `instrument reference docs`
2. `market/intelligence docs`
3. `materialized view docs`

### 1. Instrument reference docs

Each supported stock gets a canonical instrument record.

Fields:

- `instrument_id`
- `market`
- `ticker`
- `name`
- `exchange`
- `country`
- `sector`
- `industry`
- `index_memberships`
- `logo_url`
- `peer_ids`
- `support_tier`

### 2. Market data docs

These come from provider-backed scripts.

Fields:

- latest price
- day change absolute
- day change percent
- open/high/low/previous close
- volume
- captured time
- market cap
- P/E
- dividend yield
- annual dividend
- 52-week low/high
- chart series
- optional analyst consensus
- optional technicals like RSI

### 3. Intelligence docs

These come from news + enrichment + aggregation.

#### Article intelligence

For each article:

- raw title/url/source/summary/published time
- article overview
- article key points
- extracted entities
- entity-level sentiment
- event type tags
- confidence/relevance

#### Stock intelligence

For each supported stock:

- AI summary
- catalyst
- risk
- key points
- overall sentiment score/label
- source count
- article count
- recent coverage volume
- sentiment breakdown by source type
- related instruments
- timeline events

#### Market intelligence

For each market:

- market brief
- market sentiment
- top narratives
- most active stocks
- sector flows
- gainers / losers snapshot

## Firebase Plan

We should store both normalized data and materialized views.

### Canonical collections

- `tm_instruments/{instrument_id}`
- `tm_price_snapshots/{instrument_id}/points/{point_id}`
- `tm_latest_prices/{instrument_id}`
- `tm_fundamental_snapshots/{instrument_id}`
- `tm_price_series/{instrument_id}`
- `tm_articles/{article_id}`
- `tm_article_enrichments/{article_id}`
- `tm_stock_intelligence/{instrument_id}`
- `tm_market_intelligence/{market}`

### Materialized view collections

- `tm_views/dashboard/{market}`
- `tm_views/instrument/{instrument_id}`

The frontend should primarily read from `tm_views/*`.

## Script Pipeline

### Provider-backed scripts

#### `sync_instrument_universe.py`

Writes:

- `tm_instruments`

#### `sync_price_snapshots.py`

Writes:

- `tm_price_snapshots`
- `tm_latest_prices`

Runs:

- open snapshot
- mid-session snapshot
- near-close snapshot

#### `sync_fundamentals.py`

Writes:

- `tm_fundamental_snapshots`

Runs:

- daily

#### `sync_price_series.py`

Writes:

- `tm_price_series`

Runs:

- daily or end-of-session

### News and intelligence scripts

#### `ingest_news.py`

Responsibilities:

- fetch fixed sources
- fetch stock-targeted sources for core names
- dedupe
- normalize raw articles

Writes:

- `tm_articles`

#### `enrich_articles.py`

Responsibilities:

- read article once
- generate article overview
- generate article key points
- extract stocks/sectors/market lanes
- assign sentiment and confidence
- assign event tags

Writes:

- `tm_article_enrichments`

#### `build_stock_intelligence.py`

Responsibilities:

- aggregate enriched article rows per stock
- compute article count/source count
- compute sentiment summary
- identify catalyst and risk
- assemble intelligence timeline

Writes:

- `tm_stock_intelligence`

#### `build_market_brief.py`

Responsibilities:

- aggregate stock and sector intelligence
- identify top narratives
- compute market sentiment
- compute top active names and sector flows
- optionally do one small final synthesis step

Writes:

- `tm_market_intelligence`

#### `materialize_dashboard_view.py`

Responsibilities:

- combine latest prices + market intelligence
- produce page-ready dashboard docs

Writes:

- `tm_views/dashboard/{market}`

#### `materialize_instrument_view.py`

Responsibilities:

- combine instrument reference + latest price + fundamentals + stock intelligence
- produce page-ready stock detail docs

Writes:

- `tm_views/instrument/{instrument_id}`

## News Coverage Plan

We need to support two complementary lanes.

### Lane A: broad discovery

Purpose:

- discover what is active today
- capture macro, sector, and surprise names

### Lane B: stock-targeted

Purpose:

- guarantee major supported stocks get enough relevant coverage
- reduce the chance that broad macro noise crowds out core names

We should validate coverage at the stock-universe level, not just source-by-source.

For each stock in `us_test_5` / `us_test_10`, we should be able to answer:

- how many raw articles were fetched in the last 24h
- how many sources covered it
- whether the major stock-specific headlines were captured

## LLM Cost-Control Plan

The canonical expensive unit is the `article`, not the stock page and not the market page.

### Rules

- LLM reads each article once
- enriched output is stored and reused
- stock/sector/market intelligence is aggregated from stored article intelligence
- market brief is built mostly from aggregates, not from rereading every raw article

### Cost controls

- small test universes first
- source lane caps
- article ranking before LLM
- dedupe before LLM
- Firestore cache keyed by article fingerprint + model
- one cheap structured model for article enrichment
- optional small final synthesis call for market brief only

### Preferred LLM pattern

1. article enrichment pass
2. deterministic aggregation
3. optional tiny synthesis pass

This gives us lower cost and better auditability.

## Frontend Plan

We do **not** need a high-fidelity frontend first.

We only need low-fidelity screens that place the right information in the right place.

### Dashboard / Markets page should show

- search
- market cards / index cards
- market sentiment
- AI market brief
- top sector flows
- watchlist / stocks table
- tabs like watchlist / sectors / gainers / losers

### Instrument detail page should show

- stock header with ticker/exchange/sector
- current price
- fundamentals cards
- AI intelligence summary
- sentiment breakdown
- optional analyst consensus
- trend chart
- momentum signal
- related tickers
- intelligence timeline

### Frontend implementation principles

- low fidelity first
- correct layout and information hierarchy
- real data contracts from Firestore
- no attempt at polished design until data flow is stable

## What To Scrap Or Stop Extending

The current codebase contains prototype code that is no longer the correct center of gravity.

Likely legacy candidates to delete or stop extending after the new pipeline is in place:

- `lib/service.ts`
- `lib/rss.ts`
- `lib/topicing.ts`
- `lib/overview.ts`
- `lib/sentiment.ts`
- `lib/sources.ts`
- `components/snapshot-explorer.tsx`
- `components/bucket-card.tsx`
- `components/source-pill.tsx`
- old tests tied only to the feed/topic prototype

We should only keep code that helps:

- Firebase-backed view rendering
- canonical backend scripts
- current app shell/layout if reusable

## Phased Execution Plan

### Phase 0: lock contracts

- define instrument schema
- define latest price schema
- define article enrichment schema
- define stock intelligence schema
- define dashboard view schema
- define instrument view schema

### Phase 1: tiny test universe

- create `us_test_5`
- implement price snapshot script
- implement raw news ingest
- implement article enrichment
- materialize basic dashboard/instrument views

### Phase 2: aggregation

- build stock intelligence
- build market brief
- wire dashboard and detail pages to materialized docs

### Phase 3: scale to core universe

- expand to `us_test_10`
- then `us_core_150`
- validate price API budgets
- validate article volumes and LLM costs

### Phase 4: cleanup

- remove legacy feed/topic prototype code
- remove stale README/runtime assumptions
- simplify frontend data access to view docs only

## Testing Plan

We should be able to test the system cheaply at multiple levels.

### Unit tests

- article normalization
- article enrichment schema handling
- stock aggregation logic
- market-brief aggregation logic

### Small-universe integration tests

- `us_test_5`
- `us_test_10`

Check:

- price docs written
- news docs written
- article enrichments written
- stock intelligence docs written
- dashboard/instrument views materialized

### Coverage validation

For each test stock:

- fetched article count
- unique source count
- freshness
- missed-major-headline review

### Cost validation

Track:

- raw article count
- enriched article count
- cache hit rate
- per-run LLM count

## Immediate Next Steps

1. create the canonical `instrument_universe.json`
2. use the contracts defined in [contracts-v1.md](/Users/ttomar/Documents/personal/claudia/trace-money/docs/contracts-v1.md) and `backend/config/schemas/*`
3. implement `us_test_5`
4. implement price snapshot and article enrichment around that small universe
5. build low-fidelity dashboard and instrument pages against the materialized views
