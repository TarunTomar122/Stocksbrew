# Backend Pipeline (TM Only)

Active backend writes only to `tm_*` Firestore collections.

Stages:

1. `backend/scripts/sync_instrument_universe.py`
2. `backend/scripts/sync_price_snapshots.py`
3. `backend/scripts/ingest_news.py`
4. `backend/scripts/enrich_articles.py`
5. `backend/scripts/build_stock_intelligence.py`
6. `backend/scripts/build_news_intelligence.py`
7. `backend/scripts/materialize_views.py`
8. `backend/scripts/build_stock_technicals.py`
9. `backend/scripts/build_market_breadth.py`
10. `backend/scripts/build_sentiment_gauge.py`
11. `backend/scripts/build_user_alert_flags.py`
12. `backend/scripts/build_heat_list.py`
13. `backend/scripts/build_divergence.py`

Legacy stock/market/sector pipeline scripts were removed to avoid dual-write confusion.
