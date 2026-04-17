# Tikrr OpenClaw Spec

Last updated: 2026-03-30

This document captures the proposed Tikrr backend/data contract for moving away from the earlier custom news/materialization scripts and toward OpenClaw-driven dynamic updates via Next.js API routes.

## Agreed Decisions

- Stock ids are market namespaced: `US_AAPL`, `IN_RELIANCE`
- Dynamic writes are full-document replacements, not merges
- Latest state and history are both retained
- Run status is tracked per `market + runType`
- Canonical market ids are `US` and `IN`
- Frontend should prefer materialized page-friendly docs over client-side Firestore fan-out

## Part 1: Static Data

### 1.1 Stock Registry

Firestore path: `meta/stocks`

Purpose:
- render stock names and logos
- filter by sector/cap
- show exchange and currency

```json
{
  "us": {
    "AAPL": {
      "name": "Apple Inc.",
      "sector": "tech",
      "cap": "mega",
      "exchange": "NASDAQ",
      "currency": "USD",
      "logo": "https://tikrr.online/logos/AAPL.png"
    }
  },
  "india": {
    "RELIANCE": {
      "name": "Reliance Industries Ltd",
      "sector": "energy",
      "cap": "mega",
      "exchange": "NSE",
      "currency": "INR",
      "logo": "https://tikrr.online/logos/RELIANCE.png"
    }
  }
}
```

### 1.2 Sector Registry

Firestore path: `meta/sectors`

Purpose:
- render sector pages
- determine which stocks belong to each sector

```json
{
  "us": {
    "us-tech": {
      "name": "Technology",
      "icon": "monitor",
      "stocks": ["AAPL", "MSFT", "GOOGL", "NVDA", "META", "AMD", "INTC", "QCOM", "CRM", "ORCL", "ADBE", "NFLX", "AVGO", "INTU", "NOW", "SNPS", "CDNS", "PANW", "CRWD", "NET"]
    },
    "us-finance": {
      "name": "Finance",
      "icon": "banknote",
      "stocks": ["JPM", "V", "MA", "GS", "PYPL", "SQ", "COIN", "SOFI", "AFRM", "UPST", "HOOD"]
    },
    "us-healthcare": {
      "name": "Healthcare",
      "icon": "heart-pulse",
      "stocks": ["UNH", "JNJ", "ABBV", "MRK", "ISRG"]
    },
    "us-energy": {
      "name": "Energy",
      "icon": "zap",
      "stocks": ["XOM", "CVX", "PLUG", "FCEL"]
    },
    "us-consumer": {
      "name": "Consumer",
      "icon": "shopping-bag",
      "stocks": ["AMZN", "WMT", "COST", "HD", "KO", "PEP", "PG", "CMG", "ABNB", "DIS"]
    },
    "us-auto": {
      "name": "Auto & EV",
      "icon": "car",
      "stocks": ["TSLA", "RIVN", "LCID", "NIO"]
    },
    "us-crypto": {
      "name": "Crypto & Blockchain",
      "icon": "bitcoin",
      "stocks": ["COIN", "MSTR", "MARA", "RIOT"]
    },
    "us-ai": {
      "name": "AI & Semiconductors",
      "icon": "cpu",
      "stocks": ["NVDA", "AMD", "AVGO", "MRVL", "MU", "ARM", "SMCI", "PLTR", "SNOW", "DDOG", "MDB", "IONQ", "RGTI"]
    }
  },
  "india": {
    "india-it": {
      "name": "IT",
      "icon": "code",
      "stocks": ["TCS", "INFY", "HCLTECH", "WIPRO", "TECHM"]
    },
    "india-banking": {
      "name": "Banking",
      "icon": "landmark",
      "stocks": ["HDFCBANK", "ICICIBANK", "SBIN", "AXISBANK", "KOTAKBANK", "BAJFINANCE"]
    },
    "india-auto": {
      "name": "Auto",
      "icon": "car",
      "stocks": ["TATAMOTORS", "MARUTI", "M&M", "BAJAJ-AUTO", "EICHERMOT"]
    },
    "india-energy": {
      "name": "Energy",
      "icon": "zap",
      "stocks": ["RELIANCE", "NTPC", "POWERGRID", "COALINDIA", "ADANIENT"]
    },
    "india-pharma": {
      "name": "Pharma",
      "icon": "pill",
      "stocks": ["SUNPHARMA", "DRREDDY", "CIPLA", "DIVISLAB"]
    },
    "india-fmcg": {
      "name": "FMCG",
      "icon": "shopping-cart",
      "stocks": ["HINDUNILVR", "ITC", "NESTLEIND", "BRITANNIA", "DABUR"]
    },
    "india-metals": {
      "name": "Metals & Mining",
      "icon": "hammer",
      "stocks": ["TATASTEEL", "JSWSTEEL", "HINDALCO", "VEDL"]
    }
  }
}
```

### 1.3 Schedule Config

Firestore path: `meta/schedule`

Purpose:
- show last-updated and next-update timing in the frontend

```json
{
  "runs": [
    {"id": "pre_market", "label": "Pre-Market", "time": "06:00", "tz": "Asia/Kolkata"},
    {"id": "market_open", "label": "Market Open", "time": "09:30", "tz": "Asia/Kolkata"},
    {"id": "midday", "label": "Midday", "time": "12:30", "tz": "Asia/Kolkata"},
    {"id": "market_close", "label": "Market Close", "time": "15:30", "tz": "Asia/Kolkata"}
  ]
}
```

## Part 2: Dynamic Data

These payloads are written by OpenClaw through Next.js API routes.

### 2.1 `POST /api/tikrr/stock`

Purpose:
- one stock update per request
- called up to 4x daily per stock
- persisted to latest doc `stocks/{market}_{symbol}`
- history persisted to `stocks/{market}_{symbol}/history/*`

Request shape:

```json
{
  "apiKey": "tikrr-secret-key",
  "symbol": "TSLA",
  "market": "US",
  "data": {
    "lastUpdated": "2026-03-30T15:30:00Z",
    "runType": "market_close",
    "price": {
      "current": 364.31,
      "open": 368.50,
      "high": 370.20,
      "low": 360.15,
      "previousClose": 367.00,
      "change": -2.69,
      "changePct": -0.73,
      "volume": 52000000,
      "avgVolume": 48000000
    },
    "sentiment": {
      "overall": -0.2,
      "drivers": ["Delivery concerns", "Q1 below expectations"]
    },
    "news": [
      {
        "timestamp": "2026-03-30T14:00:00Z",
        "title": "Why April Could Be a Turning Point for Tesla",
        "source": "Motley Fool",
        "summary": "Analysts debate Q1 delivery numbers.",
        "sentiment": -0.1,
        "category": "market-move"
      }
    ],
    "highlights": {
      "positive": ["Dan Ives maintains Buy with $600 target"],
      "negative": ["Stock down 20% in 6 months"],
      "neutral": ["April potential turning point"]
    },
    "technicals": {
      "rsi14": 38.5,
      "sma50": 380.20,
      "sma200": 345.60,
      "fiftyTwoWeekHigh": 488.50,
      "fiftyTwoWeekLow": 280.00,
      "fromHigh": "-25.4%",
      "trend": "bearish"
    },
    "analystConsensus": {
      "rating": "Hold",
      "targetPrice": 383.54,
      "upside": 5.3,
      "numAnalysts": 41
    },
    "catalysts": ["Q1 delivery numbers", "Cybercab updates"],
    "bottomLine": "Tesla faces critical inflection point..."
  }
}
```

Response:

```json
{"success": true, "symbol": "TSLA", "docId": "US_TSLA"}
```

### 2.2 `POST /api/tikrr/market`

Purpose:
- one market update per request
- called once per market per run
- persisted to latest doc `markets/{market}`
- history persisted to `markets/{market}/history/*`

```json
{
  "apiKey": "tikrr-secret-key",
  "market": "US",
  "data": {
    "lastUpdated": "2026-03-30T16:00:00Z",
    "runType": "market_close",
    "indices": [
      {"name": "S&P 500", "value": 5580, "change": -45, "changePct": -0.8},
      {"name": "Nasdaq", "value": 17200, "change": -120, "changePct": -0.7},
      {"name": "Dow Jones", "value": 41800, "change": -200, "changePct": -0.48}
    ],
    "sentiment": {
      "overall": -0.3,
      "label": "Bearish",
      "drivers": ["Trade war fears", "Oil surge"]
    },
    "topMovers": {
      "gainers": [
        {"symbol": "NVDA", "changePct": 3.2},
        {"symbol": "AAPL", "changePct": 1.1}
      ],
      "losers": [
        {"symbol": "TSLA", "changePct": -4.5},
        {"symbol": "META", "changePct": -2.8}
      ]
    },
    "globalCues": {
      "oil": {"value": 114.5, "change": 2.3},
      "gold": {"value": 2950, "change": 15},
      "dxy": {"value": 104.2, "change": 0.3},
      "vix": {"value": 22.5, "change": 1.8},
      "usTenYear": {"value": 4.35, "change": 0.05}
    },
    "keyHeadlines": [
      "Trade war escalation fears grip Wall Street",
      "Oil surges past $114 on Middle East tensions"
    ],
    "bottomLine": "Markets closed lower on escalating fears..."
  }
}
```

Response:

```json
{"success": true, "market": "US"}
```

### 2.3 `POST /api/tikrr/sector`

Purpose:
- one sector update per request
- called once per sector per run
- persisted to latest doc `sectors/{sectorId}`
- history persisted to `sectors/{sectorId}/history/*`

```json
{
  "apiKey": "tikrr-secret-key",
  "sectorId": "us-tech",
  "data": {
    "lastUpdated": "2026-03-30T16:00:00Z",
    "runType": "market_close",
    "sentiment": {
      "overall": -0.15,
      "label": "Slightly Bearish",
      "drivers": ["AI capex concerns", "Semi demand strong"]
    },
    "performance": {
      "changePct": -0.9,
      "vsMarket": "underperforming"
    },
    "topMovers": {
      "gainers": [{"symbol": "NVDA", "changePct": 3.2}],
      "losers": [{"symbol": "TSLA", "changePct": -4.5}]
    },
    "drivers": ["AI spending fears weigh on mega caps"],
    "bottomLine": "Tech under pressure from AI spending concerns..."
  }
}
```

Response:

```json
{"success": true, "sectorId": "us-tech"}
```

### 2.4 `POST /api/tikrr/run-status`

Purpose:
- save overall job status for the latest OpenClaw run
- persisted to latest doc `meta_run_status/{market}__{runType}`
- compact latest index also written to `meta/lastRun`

```json
{
  "apiKey": "tikrr-secret-key",
  "market": "US",
  "status": "completed",
  "runType": "market_close",
  "startedAt": "2026-03-30T15:30:00Z",
  "completedAt": "2026-03-30T15:45:00Z",
  "stocksUpdated": 200,
  "sectorsUpdated": 15,
  "marketsUpdated": 2,
  "errors": []
}
```

Response:

```json
{"success": true}
```

## Part 3: Frontend Reads

### 3.1 Home / Dashboard

Reads:
- `markets/us`
- `markets/india`
- `meta/lastRun`

Materialized option:
- `views/dashboard/US`
- `views/dashboard/IN`

### 3.2 Market Page

Reads:
- `markets/{market}`
- `meta/sectors`
- `stocks/{symbol}` for top movers shown in market context

Materialized option:
- `views/market/{market}`

### 3.3 Sector Page

Reads:
- `sectors/{sectorId}`
- `meta/sectors`
- `stocks/{symbol}` for sector constituents

Materialized option:
- `views/sector/{sectorId}`

### 3.4 Stock Page

Reads:
- `stocks/{market}_{symbol}`
- `meta/stocks`

Materialized option:
- `views/stock/{market}_{symbol}`

### 3.5 Search / Browse

Reads:
- `meta/stocks`

## Part 4: OpenClaw Flow

```text
OpenClaw cron fires (4x daily)
│
├─ Step 1: Generate market overviews (2 parallel sub-agents)
│   ├─ US market → POST /api/tikrr/market {market: "us", data: {...}}
│   └─ India market → POST /api/tikrr/market {market: "india", data: {...}}
│
├─ Step 2: Generate sector briefings (8 parallel sub-agents)
│   ├─ us-tech → POST /api/tikrr/sector {sectorId: "us-tech", data: {...}}
│   ├─ us-finance → POST /api/tikrr/sector {sectorId: "us-finance", data: {...}}
│   └─ ... (all sectors)
│
├─ Step 3: Generate stock briefings (8 parallel sub-agents, batched)
│   ├─ Batch 1: AAPL, MSFT, GOOGL... → POST /api/tikrr/stock for each
│   ├─ Batch 2: next 8 stocks...
│   └─ ... (25 batches for 200 stocks)
│
└─ Step 4: Update run status
    └─ POST /api/tikrr/run-status {status: "completed", ...}
```

Operational assumptions:
- estimated time per run: `15-20 minutes`
- estimated cost per run: `~$0` using free models
- runs per day: `4`

## Part 5: Build Scope

### Next.js + Firebase side

Build:
1. `POST /api/tikrr/stock`
2. `POST /api/tikrr/market`
3. `POST /api/tikrr/sector`
4. `POST /api/tikrr/run-status`
5. Firestore-backed frontend pages using:
   - `meta/stocks`
   - `meta/sectors`
   - `meta/schedule`
   - `stocks/*`
   - `markets/*`
   - `sectors/*`
   - `meta/lastRun`

### OpenClaw side

Build:
1. Tikrr skill with JSON templates
2. cron schedule for 4 daily runs
3. parallel sub-agent orchestration
4. POST calls into the Tikrr API routes
