# Trace Money V1 Contracts

These are the canonical JSON contracts for the first rebuild pass.

The authoritative schema files live in:

- [instrument.schema.json](backend/config/schemas/instrument.schema.json)
- [latest_price.schema.json](backend/config/schemas/latest_price.schema.json)
- [article_enrichment.schema.json](backend/config/schemas/article_enrichment.schema.json)
- [stock_intelligence.schema.json](backend/config/schemas/stock_intelligence.schema.json)
- [dashboard_view.schema.json](backend/config/schemas/dashboard_view.schema.json)
- [instrument_view.schema.json](backend/config/schemas/instrument_view.schema.json)

## Collection Mapping

| Firestore Path | Contract |
|---|---|
| `tm_instruments/{instrument_id}` | `instrument` |
| `tm_latest_prices/{instrument_id}` | `latest_price` |
| `tm_article_enrichments/{article_id}` | `article_enrichment` |
| `tm_stock_intelligence/{instrument_id}` | `stock_intelligence` |
| `tm_views/dashboard/{market}` | `dashboard_view` |
| `tm_views/instrument/{instrument_id}` | `instrument_view` |

## 1. Instrument

Purpose:

- canonical stock identity
- search and routing
- sector/industry/peer reference

Example:

```json
{
  "instrument_id": "US_NVDA",
  "market": "US",
  "ticker": "NVDA",
  "name": "NVIDIA Corporation",
  "exchange": "NASDAQ",
  "country": "US",
  "currency": "USD",
  "sector": "Technology",
  "industry": "Semiconductors",
  "description": "AI and graphics semiconductor company.",
  "logo_url": "https://cdn.example.com/nvda.png",
  "index_memberships": ["S&P 500", "NASDAQ 100"],
  "peer_ids": ["US_AMD", "US_AVGO", "US_TSM"],
  "aliases": ["Nvidia", "NVIDIA"],
  "support_tier": "core",
  "universes": ["us_test_5", "us_test_10", "us_core_150"],
  "status": "active",
  "updated_at": "2026-03-25T08:00:00Z"
}
```

## 2. Latest Price

Purpose:

- latest frontend quote snapshot
- show current price and daily move
- provide freshness timestamp

Example:

```json
{
  "instrument_id": "US_NVDA",
  "market": "US",
  "ticker": "NVDA",
  "captured_at": "2026-03-25T14:35:00Z",
  "session_phase": "mid_check",
  "source": "twelve_data",
  "currency": "USD",
  "quote": {
    "current": 942.89,
    "day_change_abs": 31.05,
    "day_change_pct": 3.42,
    "open": 915.20,
    "high": 948.10,
    "low": 910.80,
    "previous_close": 911.84,
    "volume": 45230000
  }
}
```

## 3. Article Enrichment

Purpose:

- canonical reusable article intelligence layer
- one article read once by the LLM
- feeds stock intelligence, market intelligence, timeline, and market brief

Example:

```json
{
  "article_id": "a_123",
  "market": "US",
  "source": {
    "source_id": "nasdaq-markets",
    "source_name": "Nasdaq Markets News",
    "source_kind": "publisher",
    "source_lane": "broad"
  },
  "title": "Nvidia rises after analyst upgrades reinforce AI demand",
  "url": "https://example.com/nvidia-upgrades",
  "summary": "Nvidia moved higher after multiple analysts raised targets.",
  "published_at": "2026-03-25T13:41:00Z",
  "ingested_at": "2026-03-25T13:45:00Z",
  "article_overview": "Nvidia gained after analysts raised targets and reiterated confidence in AI infrastructure demand.",
  "article_key_points": [
    "Analysts raised targets on Nvidia.",
    "AI demand remains the dominant narrative.",
    "The article is directly positive for the stock."
  ],
  "overall_sentiment_score": 0.72,
  "overall_sentiment_label": "bullish",
  "event_tags": ["ratings", "product"],
  "entities": [
    {
      "type": "stock",
      "instrument_id": "US_NVDA",
      "ticker": "NVDA",
      "name": "NVIDIA Corporation",
      "role": "primary",
      "sentiment_score": 0.82,
      "sentiment_label": "bullish",
      "confidence": 0.96,
      "relevance": 0.98,
      "entity_overview": "The article is directly positive for Nvidia.",
      "entity_key_points": [
        "Upgrades are the immediate catalyst.",
        "AI demand supports the move."
      ]
    },
    {
      "type": "sector",
      "name": "Semiconductors",
      "sector_id": "semiconductors",
      "role": "secondary",
      "sentiment_score": 0.43,
      "sentiment_label": "constructive",
      "confidence": 0.8,
      "relevance": 0.7,
      "entity_overview": "The article supports broader semiconductor strength.",
      "entity_key_points": [
        "Chip demand is framed positively."
      ]
    }
  ],
  "model": "gpt-5-nano",
  "cache_key": "us_abcd1234",
  "enriched_at": "2026-03-25T13:45:10Z"
}
```

## 4. Stock Intelligence

Purpose:

- aggregate article intelligence into stock-level understanding
- feed stock cards, detail screens, and market brief generation

Example:

```json
{
  "instrument_id": "US_NVDA",
  "market": "US",
  "ticker": "NVDA",
  "as_of": "2026-03-25T14:50:00Z",
  "summary": {
    "headline": "AI hardware demand remains the dominant Nvidia narrative.",
    "body": "Coverage remains positive as analysts keep raising targets and AI infrastructure demand stays central.",
    "catalyst": "Analyst upgrades",
    "risk": "Export controls"
  },
  "sentiment": {
    "overall_label": "bullish",
    "overall_score": 84,
    "breakdown": [
      {
        "lane": "news_articles",
        "positive_pct": 72,
        "neutral_pct": 20,
        "negative_pct": 8,
        "sample_size": 18
      }
    ]
  },
  "coverage": {
    "article_count": 18,
    "source_count": 12,
    "recent_article_count": 6,
    "verified_source_count": 12
  },
  "key_points": [
    "Analyst upgrades are recurring.",
    "AI demand is the dominant narrative.",
    "Coverage volume is elevated."
  ],
  "event_mix": [
    {"event_tag": "ratings", "count": 6},
    {"event_tag": "product", "count": 4}
  ],
  "related_instruments": [
    {
      "instrument_id": "US_AMD",
      "ticker": "AMD",
      "name": "Advanced Micro Devices",
      "relation": "peer"
    }
  ],
  "timeline": [
    {
      "event_id": "evt_1",
      "timestamp": "2026-03-25T13:41:00Z",
      "title": "Nvidia rises after analyst upgrades reinforce AI demand",
      "summary": "Target hikes and AI demand remain the main positive drivers.",
      "sentiment_label": "bullish",
      "source_name": "Nasdaq Markets News",
      "article_url": "https://example.com/nvidia-upgrades"
    }
  ]
}
```

## 5. Dashboard View

Purpose:

- low-friction dashboard read model
- frontend should render this directly

Example:

```json
{
  "market": "US",
  "generated_at": "2026-03-25T15:00:00Z",
  "universe_id": "us_test_10",
  "macro_cards": [
    {
      "id": "sp500",
      "label": "S&P 500",
      "value": 5288.2,
      "day_change_pct": 1.24,
      "series": [5201, 5210, 5232, 5248, 5265, 5288]
    }
  ],
  "market_sentiment": {
    "label": "Strong Bullish",
    "score": 86
  },
  "hero_brief": {
    "title": "AI Market Briefing",
    "body": "Semiconductors and AI infra remain the strongest narratives today, with Nvidia and AMD leading coverage.",
    "verified_source_count": 12,
    "updated_at": "2026-03-25T14:56:00Z"
  },
  "sector_flows": [
    {"sector": "Semiconductors", "flow_pct": 2.4, "direction": "up"},
    {"sector": "Energy", "flow_pct": 1.1, "direction": "up"},
    {"sector": "Autos", "flow_pct": -0.4, "direction": "down"}
  ],
  "watchlist_rows": [
    {
      "instrument_id": "US_NVDA",
      "ticker": "NVDA",
      "name": "NVIDIA Corporation",
      "price": 942.89,
      "day_change_pct": 3.42,
      "ai_sentiment_score": 84,
      "news_count": 18,
      "source_count": 12
    }
  ],
  "gainers": [],
  "losers": []
}
```

## 6. Instrument View

Purpose:

- one document per stock detail page
- frontend should not need to join multiple collections at render time

Example:

```json
{
  "instrument_id": "US_NVDA",
  "market": "US",
  "generated_at": "2026-03-25T15:00:00Z",
  "instrument": {
    "ticker": "NVDA",
    "name": "NVIDIA Corporation",
    "exchange": "NASDAQ",
    "sector": "Technology",
    "industry": "Semiconductors",
    "logo_url": "https://cdn.example.com/nvda.png",
    "index_memberships": ["S&P 500", "NASDAQ 100"]
  },
  "price_snapshot": {
    "current": 942.89,
    "day_change_abs": 31.05,
    "day_change_pct": 3.42,
    "captured_at": "2026-03-25T14:35:00Z"
  },
  "fundamentals": {
    "market_cap": 2360000000000,
    "pe_ttm": 75.42,
    "dividend_yield": 0.0002,
    "annual_dividend": 0.04,
    "week_52_low": 380.2,
    "week_52_high": 974.0
  },
  "intelligence_summary": {
    "headline": "AI hardware demand remains the dominant Nvidia narrative.",
    "body": "Coverage remains positive as analysts keep raising targets and AI infrastructure demand stays central.",
    "catalyst": "Blackwell ramp",
    "risk": "Export controls",
    "key_points": [
      "Upgrades are recurring.",
      "AI demand remains strong.",
      "Coverage volume is elevated."
    ]
  },
  "sentiment_breakdown": {
    "overall_label": "bullish",
    "overall_score": 84,
    "lanes": [
      {"label": "News Articles", "positive_pct": 72},
      {"label": "Institutional Reports", "positive_pct": 91}
    ]
  },
  "analyst_consensus": {
    "label": "Buy",
    "target_price": 1150,
    "buy": 42,
    "hold": 6,
    "sell": 1
  },
  "trend_convergence": {
    "range": "1M",
    "price_series": [780, 812, 855, 910, 935, 942],
    "mention_volume_series": [4, 7, 9, 12, 15, 18]
  },
  "momentum_signal": {
    "label": "Bullish Momentum",
    "rsi_14": 84.2,
    "score": 84
  },
  "related_tickers": [
    {
      "instrument_id": "US_AMD",
      "ticker": "AMD",
      "name": "Advanced Micro Devices",
      "price": 164.2,
      "day_change_pct": 1.8
    }
  ],
  "timeline": [
    {
      "timestamp": "2026-03-25T13:41:00Z",
      "title": "Nvidia rises after analyst upgrades reinforce AI demand",
      "summary": "Target hikes and AI demand remain the main positive drivers.",
      "sentiment_label": "bullish",
      "source_name": "Nasdaq Markets News",
      "article_url": "https://example.com/nvidia-upgrades"
    }
  ]
}
```

## Notes

- `article_enrichment` is the core reusable intelligence layer.
- `stock_intelligence` should mostly aggregate from `article_enrichment`, not rerun the LLM over the same raw articles.
- `instrument_view` and `dashboard_view` are frontend-facing view docs and should stay thin and stable.
- India support should use the same contracts with `market: "IN"` and `instrument_id` values like `IN_RELIANCE`.
