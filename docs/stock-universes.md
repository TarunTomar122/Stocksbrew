# Stock Universe Model

This app keeps old Firestore universe IDs for compatibility. Do not infer
product meaning from names like `us_core_100` or `us_core_155`; use the tier
definitions below.

## Current Product Scope

The user-facing product is US-only today. India config and some historical
Firestore data exist so IN can be reactivated later, but `getCurrentMarket()`
currently returns `US`.

Compute runs in Google Cloud project `tikrr-496409`. Firebase/Firestore data is
in project `trace-money-72276`; Cloud Run jobs use the Firebase service-account
secret to write there.

## Canonical Tiers

| Tier | Meaning | Current surface |
| --- | --- | --- |
| `search_catalog` | Everything users can search/request. This can grow toward ~2000 stocks without implying full refresh coverage. | `tm_search_index/US`, `tm_instruments` |
| `coverage_catalog` | 500-ish stocks with slower baseline data, such as instruments, fundamentals, and slower price coverage. | Historical ID `us_core_155`; `tm_config/instrument_universe_state.US.universe_id` currently points here with 500 instruments |
| `runtime_core` | 100-ish high-priority stocks used for the frequent product surfaces: homepage/dashboard rows, core price refreshes, movers/screens, and active US AI namespace. | Historical ID `us_core_100`; `tm_config/active_universes.US_universe` currently points here |
| `tracked_universe` | Dynamic union of user-tracked stocks. These get targeted news/AI/open briefs independent of whether they are in `runtime_core`. | `users/{uid}.tracked_stocks`, `tm_tracked_instruments`, Cloud Run tracked lanes |

## Current Verified Mapping

As of 2026-05-31:

- `tm_config/active_universes.US_universe = us_core_100`
- `backend/config/instrument_universe.json.markets.US.universes.us_core_100`
  contains exactly 100 IDs.
- `backend/config/instrument_universe.json.markets.US.universes.us_core_155`
  contains about 500 IDs. The name is historical.
- `tm_config/instrument_universe_state.US` says `universe_id = us_core_155`
  and `instrument_count = 500`.
- `tm_search_index/US` is broader than `runtime_core`.
- `tm_home_view/US` currently points to `us_core_100`.
- `tm_views_dashboard/US__us_core_100` is the materialized dashboard/runtime
  view.

## Operational Rules

- Do not rename Firestore namespaces casually. Existing documents use IDs like
  `US__us_core_100`; renaming requires a copy/regenerate/flip plan.
- It is acceptable for `search_catalog` to be broader than `runtime_core`.
- It is acceptable for `coverage_catalog` to be broader than `runtime_core`.
- `runtime_core` should remain small enough for frequent refreshes.
- `tracked_universe` should be driven from user profile data and tracked-stock
  counters, not from static universe names.
- India can remain configured but should not be assumed fresh until the frontend
  is re-enabled and IN home/search views are rebuilt.

## Naming Guidance

When writing new code or docs, use tier names:

- `search_catalog`
- `coverage_catalog`
- `runtime_core`
- `tracked_universe`

Only use legacy IDs (`us_core_100`, `us_core_155`) when referring to concrete
Firestore/config namespaces.
