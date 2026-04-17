# Dashboard v2 — the delta feed

**Status:** spec in progress
**Owner:** ttomar
**Related files:** `app/dashboard/page.tsx`, `components/personalized-dashboard.tsx`, `app/api/chat/route.ts` (to be removed), `lib/api.ts`, `app/page.tsx` (landing)

---

## Why we're redoing the dashboard

### The wedge

> **What do I need to know about my stocks today that I wouldn't have caught otherwise?**

That is the only question tikrr needs to answer well. Every element on the dashboard serves it. Anything that doesn't serve it moves, shrinks, or dies.

### The positioning — pending final lock

Memory is the defensible differentiator. No competitor (TickerTape, Seeking Alpha, Koyfin, Yahoo, Bloomberg, TradingView, Stocktwits) tracks what they've communicated to a user so they can show only the delta. tikrr should.

**Tagline candidates, memory angle:**

1. *Every stock app forgets. tikrr remembers.*
2. *The only stock app that remembers.*
3. *Reads. Remembers. Briefs you.*
4. *Never read the same news twice.*
5. *See only what's new about your stocks.*
6. *Most apps tell you what happened. tikrr tells you what's new.*
7. *The opposite of a news feed.*
8. *Markets move fast. You shouldn't have to read the same thing twice.*
9. *An analyst for your stocks. With a memory.*
10. *A five-minute brief for your stocks. That remembers.*

**Placeholder until locked:** *Every stock app forgets. tikrr remembers.*

### The Reddit-validated pains it solves

- *"I follow 15 stocks, spend an hour a day, still miss info half the time."* → tikrr reads for you, never misses.
- *"Too much news makes me panic."* → tikrr shows only signal, suppresses noise.
- *"Why is this stock moving today?"* → tikrr answers this, per stock, every day.
- *"I keep reading the same news across five tabs."* → tikrr remembers what it told you, only shows you deltas.

### Why the current dashboard doesn't cut it

The current `PersonalizedDashboard` is a panel-grid showing the **state** of things:

- Portfolio heatmap, movers, signals, blind-spot, watchlist table, market context, sectors, indices, left/right rails
- Dense SNAPSHOT of the present
- Does not answer "what's new since you last looked"
- No citations
- Editorial typography (italic serif, magazine hierarchy) — fine for marketing, wrong for a daily-use tool
- Doesn't feel fast or keyboard-driven

Every visit looks the same until something moves more than 2%. No delta, no reason to come back tomorrow.

---

## Locked decisions

| Decision | Value |
|---|---|
| Layout | **Two-column** — left rail + center feed. No right rail. |
| Rail wrapper | `YOUR STOCKS` |
| Feed heading | `WHAT'S NEW` |
| Chat | **Removed entirely** from v0 — UI, API route, dependencies |
| Card click | Whole card is a link → navigates to the stock page |
| Card hover | Subtle highlight only, no slide-over |
| Sources | Only interactive element inside a card — clicking opens a slide-over preview with the quoted excerpt |
| Accent | Gold used only for `HIGH` priority and critical interactive states |
| Typography | Geist sans everywhere in the app. Magazine serif only on marketing pages (if at all) |
| Density | Linear-level — 13px body, 12px meta, 24px section titles |

---

## The dashboard — locked shape

```
┌──────────────┬──────────────────────────────────────────────┐
│              │                                              │
│  YOUR STOCKS │  WHAT'S NEW                                  │
│              │  Thu · 16 Apr · 5 min                        │
│  WATCHLIST   │                                              │
│    NVDA   ●  │  ┌────────────────────────────────────────┐  │
│    AMD       │  │ ▲ HIGH · 14m · NVDA                    │  │
│    MSFT  ●●  │  │ Catalyst shifted to hyperscaler capex  │  │
│    AAPL      │  │ MSFT's Q3 displaced Blackwell Ultra    │  │
│    TSLA   ●  │  │ as the primary driver.                 │  │
│    RELIANCE  │  │ [3 sources]                            │  │
│    TCS       │  └────────────────────────────────────────┘  │
│              │                                              │
│  SECTORS     │  ┌────────────────────────────────────────┐  │
│    US Tech ● │  │ ▲ MED · 42m · TSLA                     │  │
│    IN IT     │  │ On 3-day streak, vol 2.4× avg          │  │
│              │  │ No news — positioning shift.           │  │
│  INDICES     │  │ [1 source]                             │  │
│    SPX       │  └────────────────────────────────────────┘  │
│    NIFTY     │                                              │
│              │  ┌────────────────────────────────────────┐  │
│              │  │ ● LOW · 2h · MSFT                      │  │
│              │  │ Steady. No new catalysts.              │  │
│              │  └────────────────────────────────────────┘  │
│              │                                              │
│              │  ─── older than 24 hours ───                 │
│              │  (collapsed, click to expand)                │
│              │                                              │
└──────────────┴──────────────────────────────────────────────┘
```

### What moved, what stayed, what died

| Current element | New home |
|---|---|
| Greeting block | Top of feed, compressed to one line: "Thu · 16 Apr · 5 min" |
| Market status strip | Small badge in top bar |
| Portfolio heatmap | Moved to `/dashboard?view=market` |
| Portfolio brief narrative | Becomes the first HIGH card in the feed |
| Movers table | Each meaningful mover becomes its own card |
| Signals cluster | Folded into delta cards as evidence |
| Blind-spot card | Becomes one delta card in the feed |
| Watchlist table | Deleted from home. Rail replaces it. Full detail on stock page. |
| Market context strip | Deleted from home. Lives on `/dashboard?view=market`. |
| Sectors/indices rails | Moved to left rail, below WATCHLIST |
| Ask-tikrr floating widget | **Deleted** |
| Right-side chat rail | **Never built** (was in earlier spec draft) |
| Magazine typography | Killed. Geist sans everywhere in the app. |

---

## The delta card — atomic unit of the feed

Each card = one update about one entity since the user's last visit (or last 24h if first visit of day).

### Anatomy

```
┌────────────────────────────────────────┐
│ {priority}  ·  {age}  ·  {entity}      │   header row
│                                        │
│ {title} — one strong sentence          │   headline
│                                        │
│ {body} — 2–4 lines of context,         │   body
│ what changed, why                      │
│                                        │
│ [source 1] [source 2]                  │   footer (sources only)
└────────────────────────────────────────┘
```

### Click behavior

- **Entire card is a link** → navigates to `/stock/{id}` (or `/sector/{id}` or `/market?id={id}`)
- **Sources** are the exception — clicking a source opens a **slide-over preview** with the quoted excerpt, and a link to the original source. Does not navigate.
- **No "ask" button.** Chat is gone.
- **No expand-in-place.** Detail lives on the stock page.

### Fields

- `id`: stable id, used for deduping
- `entity`: `stock:US_NVDA` | `sector:us-tech` | `market:US` | `portfolio`
- `priority`: `high` | `medium` | `low`
- `kind`: `catalyst_shift` | `price_move` | `earnings` | `technical` | `news_sentiment` | `blind_spot` | `thesis_update`
- `title`: one strong sentence (≤ 90 chars)
- `body`: 2–4 lines, written to be read fast
- `citations`: array of `{label, url, excerpt, publishedAt}`
- `generatedAt`: ISO timestamp
- `seenAt`: per-user timestamp (v1 only, enables true delta)

### Card kinds (v0 starter set)

| Kind | When it fires | Data source (v0) |
|---|---|---|
| `catalyst_shift` | Stock's primary catalyst changes | `stock.brief.catalyst` vs previous run |
| `price_move` | Stock up/down > threshold or on streak | `stock.priceChangePercent`, `stock.streak` |
| `earnings` | Earnings event within 7 days | `stock.upcomingEarningsDate` |
| `technical` | Crossed SMA20/50, RSI extremes | `stock.technicals` |
| `news_sentiment` | Narrative shift in news | `stock.brief.highlights`, portfolio brief |
| `blind_spot` | Risk/angle user may be ignoring | `portfolioBrief.blindSpot` |
| `thesis_update` | Deeper narrative change | Portfolio brief narrative paragraph |

### Prioritization rule (v0)

1. `catalyst_shift` → always HIGH
2. `earnings` within 3 days → HIGH
3. `price_move` > 5% or 3+ day streak → HIGH
4. `news_sentiment` from portfolio brief → MEDIUM
5. `technical`, `blind_spot` → MEDIUM
6. Everything else → LOW

Max 8 cards above the fold. Rest collapsed under "older than 24 hours".

---

## Left rail — "YOUR STOCKS"

Dense, Linear-style. Not a table, not a grid. Monospace numerics, sans body.

```
YOUR STOCKS

WATCHLIST              ▾
  NVDA          ●       +2.1%
  AMD                   +0.4%
  MSFT          ●●     +1.2%
  AAPL                  -0.3%
  TSLA          ●       +4.8%
  RELIANCE              -1.1%
  TCS                   +0.2%

SECTORS                ▾
  US Tech       ●       +0.9%
  IN IT                  0.0%

INDICES                ▾
  SPX                   +0.3%
  NIFTY                 -0.1%
```

- `●` = number of unseen cards since user last visited that entity
- Click ticker → goes to stock page
- Keyboard: `j`/`k` to move up/down the rail, `Enter` to open
- `YOUR STOCKS` is the rail wrapper title, rendered small and quiet at the top

---

## Click states — where things go

### Click a card → `/stock/{id}`

Stock page, deeply redesigned for v2.

```
┌──────────────┬──────────────────────────────────────────────┐
│              │  ← back to what's new                        │
│  YOUR STOCKS │                                              │
│    NVDA [•]  │  NVDA · NVIDIA              $892.31  +2.14%  │
│    AMD       │  US · Semis · NASDAQ        live · 14:23 ET  │
│    MSFT      │                                              │
│    AAPL      │  ──────────────────────────────────────────  │
│    TSLA      │  THE STORY RIGHT NOW                         │
│    RELIANCE  │  Hyperscaler capex cycle has become the      │
│    TCS       │  dominant driver. MSFT's Q3 print reframed   │
│              │  the bull case; Blackwell is now table       │
│  SECTORS     │  stakes. Next catalyst: AMZN earnings Apr 24.│
│    US Tech   │  [3 sources]                                 │
│    IN IT     │                                              │
│              │  ──────────────────────────────────────────  │
│  INDICES     │  WHAT'S CHANGED (last 7 days)                │
│    SPX       │  ┌────────────────────────────────────────┐  │
│    NIFTY     │  │ ▲ HIGH · today                         │  │
│              │  │ Catalyst shifted                       │  │
│              │  └────────────────────────────────────────┘  │
│              │  ┌────────────────────────────────────────┐  │
│              │  │ ▲ MED · 2d ago                         │  │
│              │  │ Wells Fargo raised PT $1100            │  │
│              │  └────────────────────────────────────────┘  │
│              │  ┌────────────────────────────────────────┐  │
│              │  │ ● LOW · 4d ago                         │  │
│              │  │ Crossed above SMA20                    │  │
│              │  └────────────────────────────────────────┘  │
│              │                                              │
│              │  ──────────────────────────────────────────  │
│              │  PRICE              EARNINGS     TECHNICALS  │
│              │  [sparkline 30d]    Q1 · May 21  RSI 64      │
│              │  $892 +14%          last beat    >SMA50      │
│              │                                              │
│              │  ──────────────────────────────────────────  │
│              │  THE BRIEF                                   │
│              │  Catalyst · Risk · Highlights                │
│              │  (existing per-stock brief content)          │
│              │                                              │
└──────────────┴──────────────────────────────────────────────┘
```

- Left rail persists; active entity shown with `[•]`
- Page is: story → delta feed scoped to this stock → supporting data → existing brief as secondary
- Basic 30d sparkline only, no trading chart (explicit non-goal)
- **No "Ask tikrr about NVDA" button — chat is gone**

### Click a sector → `/sector/{id}`

```
┌──────────────┬──────────────────────────────────────────────┐
│  YOUR STOCKS │  ← back                                      │
│    ...       │                                              │
│              │  US TECH                    +0.9% today      │
│  SECTORS     │  28 stocks · 3 in your watchlist             │
│    US Tech[•]│                                              │
│    IN IT     │  ──────────────────────────────────────────  │
│              │  WHAT'S MOVING THE SECTOR                    │
│              │  Hyperscaler capex theme dominates. MSFT,    │
│              │  GOOG, AMZN setting up the Q2 thesis for     │
│              │  NVDA/AMD downstream. Software lagging.      │
│              │                                              │
│              │  ──────────────────────────────────────────  │
│              │  YOUR STOCKS IN US TECH                      │
│              │  NVDA · catalyst shifted          +2.1%  ●   │
│              │  MSFT · Q3 beat + guide           +1.2%  ●●  │
│              │  AAPL · quiet                     -0.3%      │
│              │                                              │
│              │  OTHERS MOVING IN US TECH                    │
│              │  GOOG  +3.4%   AMZN  +1.8%   META  -0.9%     │
│              │                                              │
│              │  ──────────────────────────────────────────  │
│              │  SECTOR UPDATES (last 7 days)                │
│              │  ┌──────────────────┐ ┌──────────────────┐   │
│              │  │ ▲ HIGH · today   │ │ ▲ MED · 3d       │   │
│              │  │ Capex reframing  │ │ Software rotation│   │
│              │  └──────────────────┘ └──────────────────┘   │
└──────────────┴──────────────────────────────────────────────┘
```

### Click an index → `/dashboard?view=market&id={id}`

```
┌──────────────┬──────────────────────────────────────────────┐
│              │  ← back                                      │
│  YOUR STOCKS │                                              │
│    ...       │  US MARKET                  SPX +0.32%       │
│              │  Thu · 16 Apr  14:23 ET                      │
│  INDICES     │                                              │
│    SPX [•]   │  ──────────────────────────────────────────  │
│              │  TODAY'S STORY                               │
│              │  Soft CPI print, capex-led tech rally,       │
│              │  yields down 6bps. Energy weak on crude.     │
│              │                                              │
│              │  ──────────────────────────────────────────  │
│              │  [heatmap: sectors × performance]            │
│              │                                              │
│              │  ──────────────────────────────────────────  │
│              │  INDICES    SPX +0.3   QQQ +0.6   RUT +0.1   │
│              │  RATES      10Y 4.23% (-6bp)                 │
│              │  FX         DXY 104.2                        │
│              │                                              │
│              │  ──────────────────────────────────────────  │
│              │  MOVERS IN YOUR WATCHLIST                    │
│              │  TSLA +4.8    NVDA +2.1    RELIANCE -1.1     │
└──────────────┴──────────────────────────────────────────────┘
```

### Click a source citation → slide-over preview

```
┌──────────────────────────┬────────────────────────────────┐
│                          │  MSFT Q3 earnings call         │
│                          │  seekingalpha.com              │
│   (page dimmed           │  3 hours ago                   │
│    behind)               │                                │
│                          │  ──────────────────────────    │
│                          │  "Capex guidance of $80B for   │
│                          │   FY25 reflects our confidence │
│                          │   in durable AI demand..."     │
│                          │                                │
│                          │  [excerpt continues, scroll]   │
│                          │                                │
│                          │  ──────────────────────────    │
│                          │  [open original ↗]             │
│                          │  [close  esc]                  │
└──────────────────────────┴────────────────────────────────┘
```

- Doesn't yank user out of tikrr
- Shows quoted excerpt in context
- External link opens in new tab

### `⌘K` command palette — navigation only (no chat, no ask)

```
      ╔═══════════════════════════════════════════════╗
      ║  jump to a ticker, sector, or page      esc   ║
      ╠═══════════════════════════════════════════════╣
      ║                                               ║
      ║  › nv                                         ║
      ║                                               ║
      ║  ─ STOCKS ─                                   ║
      ║    NVDA    NVIDIA           +2.1%    [enter]  ║
      ║    NVO     Novo Nordisk     -0.4%             ║
      ║                                               ║
      ║  ─ PAGES ─                                    ║
      ║    What's new                                 ║
      ║    Market overview                            ║
      ║    Settings                                   ║
      ║                                               ║
      ║  ─ RECENT ─                                   ║
      ║    TSLA · 2m ago                              ║
      ║    US Tech · 14m ago                          ║
      ║                                               ║
      ╚═══════════════════════════════════════════════╝
```

- Fuzzy match on ticker + name + sector + page name
- `↑`/`↓` to pick, `enter` to navigate
- No ask-mode, no chat-mode

---

## Mobile

Single column; left rail becomes a collapsible drawer pinned to the top.

```
┌──────────────────────┐
│ tikrr    US    ⌘    │   top bar (⌘ opens palette)
├──────────────────────┤
│ [YOUR STOCKS ▾]      │   collapsed drawer
├──────────────────────┤
│                      │
│  WHAT'S NEW          │
│  Thu · 16 Apr · 5min │
│                      │
│  ┌────────────────┐  │
│  │ ▲ HIGH · NVDA  │  │
│  │ Catalyst       │  │
│  │ shifted...     │  │
│  │ [3 sources]    │  │
│  └────────────────┘  │
│                      │
│  ┌────────────────┐  │
│  │ ▲ MED · TSLA   │  │
│  │ 3-day streak   │  │
│  │ [1 source]     │  │
│  └────────────────┘  │
│                      │
│  ── older than 24h ──│
│                      │
└──────────────────────┘
```

Drawer expanded:

```
┌──────────────────────┐
│ YOUR STOCKS      ×   │
├──────────────────────┤
│ WATCHLIST            │
│   NVDA     ●  +2.1%  │
│   AMD         +0.4%  │
│   MSFT    ●● +1.2%   │
│   AAPL       -0.3%   │
│   TSLA     ●  +4.8%  │
│                      │
│ SECTORS              │
│   US Tech  ● +0.9%   │
│   IN IT       0.0%   │
│                      │
│ INDICES              │
│   SPX        +0.3%   │
│   NIFTY      -0.1%   │
└──────────────────────┘
```

- Card tap → stock page (unchanged)
- No bottom nav bar
- Horizontal scroll inside the rail for long watchlists is fine
- Min width: 375px (iPhone SE)

---

## Landing page v2

Replaces the current `app/page.tsx` ticker-tape / simulated AI stream / magazine hero with anti-marketing, concrete, card-as-proof.

```
┌────────────────────────────────────────────────────────────┐
│  tikrr                             [sign in]  [join beta]  │
├────────────────────────────────────────────────────────────┤
│                                                            │
│     Every stock app forgets.                               │
│     tikrr remembers.                                       │
│                                                            │
│     Tells you only what's new about your stocks —          │
│     never what you've already seen.                        │
│                                                            │
│     Five minutes a day. US and India.                      │
│                                                            │
│     [Join the beta →]      [See today's sample brief]      │
│                                                            │
│  ────────────────────────────────────────────────────      │
│                                                            │
│     YOU FOLLOW                   TIKRR READS               │
│     15 stocks                    ~50 sources daily         │
│     ~1 hour a day trying         Surfaces only what        │
│     to keep up                   changed. In 5 minutes.    │
│                                                            │
│  ────────────────────────────────────────────────────      │
│                                                            │
│     WHAT YOU'D SEE TODAY                                   │
│                                                            │
│     ┌────────────────────────────────────────┐             │
│     │ ▲ HIGH · NVDA                          │             │
│     │ Catalyst shifted to hyperscaler capex  │             │
│     │ [3 sources]                            │             │
│     └────────────────────────────────────────┘             │
│                                                            │
│     ┌────────────────────────────────────────┐             │
│     │ ▲ MED · TSLA                           │             │
│     │ On 3-day streak, vol 2.4× avg          │             │
│     └────────────────────────────────────────┘             │
│                                                            │
│     ┌────────────────────────────────────────┐             │
│     │ ● BLIND SPOT · portfolio               │             │
│     │ 60% of your US exposure is AI infra    │             │
│     └────────────────────────────────────────┘             │
│                                                            │
│  ────────────────────────────────────────────────────      │
│                                                            │
│     WHAT TIKRR IS NOT                                      │
│                                                            │
│     Not a chart.         (TradingView does that.)          │
│     Not a screener.      (Koyfin, TickerTape do that.)     │
│     Not a firehose.      (Bloomberg does that for $27k.)   │
│     Not another feed of opinions.                          │
│                                                            │
│     It reads. It remembers. It tells you what's new.       │
│     That's it.                                             │
│                                                            │
│  ────────────────────────────────────────────────────      │
│                                                            │
│                  [Join the beta →]                         │
│                                                            │
│  tikrr · US + India equities · private beta                │
└────────────────────────────────────────────────────────────┘
```

Style notes:
- Headline can keep a more expressive serif treatment — this is the only place the magazine typography survives
- Sample cards render using the exact same `<DeltaCard />` component used in the app, for visual honesty
- No marketing hype, no carousel, no testimonials, no logos-of-companies-using-us

---

## Onboarding (first run)

Three steps, each one page, keyboardable.

```
STEP 1 of 3 · MARKETS
┌────────────────────────────────────────┐
│                                        │
│  Which markets should tikrr watch?     │
│                                        │
│  [✓] US        S&P 500, NASDAQ         │
│  [✓] India     Nifty 50, Sensex        │
│                                        │
│              [continue →]              │
└────────────────────────────────────────┘


STEP 2 of 3 · YOUR STOCKS
┌────────────────────────────────────────┐
│                                        │
│  Which stocks do you want tikrr to     │
│  watch? Add at least 3.                │
│                                        │
│  [type a ticker or name...        ⌕]   │
│                                        │
│  YOU PICKED (5)                        │
│    NVDA   NVIDIA              ×        │
│    TSLA   Tesla               ×        │
│    MSFT   Microsoft           ×        │
│    RELIANCE   Reliance        ×        │
│    TCS    Tata Consultancy    ×        │
│                                        │
│  POPULAR IN YOUR MARKETS               │
│    AAPL   Apple               +        │
│    GOOG   Alphabet            +        │
│    INFY   Infosys             +        │
│    HDFC   HDFC Bank           +        │
│                                        │
│  [← back]              [continue →]    │
└────────────────────────────────────────┘


STEP 3 of 3 · YOU'RE SET
┌────────────────────────────────────────┐
│                                        │
│  Building your first brief…            │
│  ~30 seconds.                          │
│                                        │
│  [·····················      ]         │
│                                        │
│  From tomorrow, tikrr will have a      │
│  fresh brief waiting for you every     │
│  morning at 7:30 am local time.        │
│                                        │
│          [take me to the feed →]       │
└────────────────────────────────────────┘
```

Empty-watchlist edge case: the suggestions list is pre-populated using the existing tikrr universe. Never let a user land on a blank dashboard.

---

## Settings

Minimal. No auth yet — `LOCAL_USER` in MVP — so the shape is about stocks, markets, briefs, and memory.

```
┌──────────────┬──────────────────────────────────────────────┐
│              │  ← back                                      │
│  YOUR STOCKS │                                              │
│    ...       │  SETTINGS                                    │
│              │                                              │
│              │  ──────────────────────────────────────────  │
│              │  YOU                                         │
│              │    Name       [ttomar                    ]   │
│              │    Email      [________________________]     │
│              │    Timezone   [America/New_York         ]    │
│              │                                              │
│              │  ──────────────────────────────────────────  │
│              │  MARKETS                                     │
│              │    [✓] US                                    │
│              │    [✓] India                                 │
│              │                                              │
│              │  ──────────────────────────────────────────  │
│              │  WATCHLIST (7)                               │
│              │    NVDA       NVIDIA          [remove]       │
│              │    AMD        AMD             [remove]       │
│              │    MSFT       Microsoft       [remove]       │
│              │    AAPL       Apple           [remove]       │
│              │    TSLA       Tesla           [remove]       │
│              │    RELIANCE   Reliance        [remove]       │
│              │    TCS        Tata Consultancy [remove]      │
│              │    [+ add stock]                             │
│              │                                              │
│              │  ──────────────────────────────────────────  │
│              │  BRIEFS                                      │
│              │    Morning delivery     [07:30  ▾]           │
│              │    Length               (•) 5 min            │
│              │                         ( ) 10 min           │
│              │                         ( ) Digest only      │
│              │    Email briefs         [ off ]              │
│              │                                              │
│              │  ──────────────────────────────────────────  │
│              │  MEMORY                                      │
│              │    tikrr has been watching your stocks       │
│              │    since Apr 2, 2026 (14 days).              │
│              │                                              │
│              │    [Reset memory — start fresh]              │
│              │                                              │
│              │  ──────────────────────────────────────────  │
│              │  DANGER                                      │
│              │    [Delete account]                          │
│              │                                              │
└──────────────┴──────────────────────────────────────────────┘
```

The **MEMORY** section is on-brand and a bragpoint: "tikrr has been watching your stocks for 14 days" is a flex no competitor can make.

---

## Empty states

- **Zero updates today:** one card that says *"All quiet in your universe. Last checked 4m ago. Here's what changed yesterday ↓"*
- **Not enough data (first run):** one card that says *"tikrr is still learning your stocks. Full briefs start tomorrow morning."*
- **Market closed, weekend:** *"Markets are closed. Here's the last 48 hours in your universe."*
- **User has memory-reset:** *"Starting fresh. Your next brief will be ready tomorrow morning."*

---

## Visual system (whole app, not just dashboard)

- Typography: Geist sans everywhere in-app. Instrument Serif confined to landing page.
- Accent: gold used only for `HIGH` priority + critical interactive states. Never decorative.
- Density: Linear-level — 13px body, 12px meta, 24px section titles. ~40% more content per viewport than today.
- Borders: 1px neutral-800, never 2px. No rounded-2xl on core chrome (max 6px radius).
- Motion: 120ms transitions. No 600ms intro animations on every panel.
- Keyboard: `⌘K` command palette. `j/k` navigate rail. `?` opens shortcuts sheet. `esc` closes any overlay.

---

## Code that gets deleted (chat rip-out)

Since chat is gone entirely in v0, a focused inventory is needed before build. At minimum:

- `app/api/chat/route.ts` — streaming chat endpoint
- Any chat UI components (`components/ask-tikrr-widget.tsx` or similar — inventory before deleting)
- Ticker-extraction utilities scoped to chat (keep those also used elsewhere)
- SearXNG integration if only used by chat
- OpenAI streaming helpers specific to chat (keep the generic OpenAI client — it's used for LLM briefs)
- Chat-only environment variables

The LLM brief pipeline (`backend/stock_intelligence.py`, `backend/scripts/bootstrap_tikrr_dynamic.py`) uses OpenAI directly and is unaffected.

**TODO before v0 build:** do a full grep for `chat|ask|/api/chat|SearXNG` across `app/`, `components/`, `lib/`, and list the exact files to delete/modify.

---

## Scope — v0 vs v1 vs v2

### v0 — ships first. Uses only data we already generate. No memory yet, but LOOKS right.

- [ ] Rip out chat (API route, UI, widget, deps)
- [ ] New route: `/dashboard/v2` (keep v1 at `/dashboard` until parity)
- [ ] Build `<DeltaFeed />` and `<DeltaCard />` components
- [ ] Wire existing portfolio brief + per-stock briefs into card kinds (mapping rules in "Card kinds" above)
- [ ] Build `<YourStocksRail />` (left), dense, with **static** `●` counts for now
- [ ] New typography system applied to v2 only (don't touch v1 yet)
- [ ] Stock page v2 (`/stock/[id]/v2` or gated behind a flag)
- [ ] Sector page v2
- [ ] Market view v2
- [ ] Source citation slide-over
- [ ] `⌘K` command palette (navigation only)
- [ ] Landing page v2 copy update
- [ ] Keyboard shortcuts (`j/k/⌘K/esc/?`)

### v1 — adds actual memory. Enables real deltas.

- [ ] Firestore collections: `stocks/{id}/insights/`, `stocks/{id}/updates/`, `users/{id}/seen/`
- [ ] Pipeline generates `Insight` docs per run, diffs against previous, emits `Update` events
- [ ] `seenAt` tracked per user, per update
- [ ] Real `●` unseen counts in rail
- [ ] Real citations with excerpt support
- [ ] "Older than 24 hours" actually filters by unseen
- [ ] Onboarding flow (replaces current LOCAL_USER)
- [ ] Settings page with real watchlist editing + memory stats

### v2 — polish + kill v1.

- [ ] Point `/dashboard` at v2 code; delete `/dashboard/v2` alias
- [ ] Delete old `PersonalizedDashboard` + its sub-components
- [ ] Delete old per-stock page code
- [ ] Mobile polish
- [ ] Daily morning email (optional)

---

## Non-goals (explicit)

- Not building a screener. (Koyfin, TickerTape own this.)
- Not building charting. (TradingView owns this.)
- Not building community. (Reddit, Stocktwits own this.)
- Not building a chat/ask interface in v0.
- Not building brokerage integration.
- Not expanding the stock universe. Current universe is the right size to prove the wedge.

---

## Open questions

- Landing page — keep a different editorial feel on marketing, or unify with app density?
- Daily morning email at 7:30am local — v0 or v1? Mirrors Sunday Morning Markets' winning format (29k subs).
- If a user visits multiple times a day, is the feed cleared after first view, or does it refresh continuously? Probably: updates stay in the feed for 24h regardless, `●` dots reset on first view.
- Stock page chat-less: is "The Story Right Now" + delta feed + existing brief enough, or do we need a new structured section that replaces what chat used to answer?
- Tagline — pick from candidates 1–10 above.
