# TM Pipeline

Single active flow (no legacy cycle runner):

1. `sync_instrument_universe`
2. `sync_price_snapshots`
3. `ingest_news`
4. `enrich_articles`
5. `build_stock_intelligence`
6. `build_news_intelligence`
7. `materialize_views`

US convenience command:

```bash
npm run backend:tm:us
```
