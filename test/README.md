# Tikrr Test Frontend

Standalone Next.js app for raw US market data exploration.

## Run

```bash
cd test
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Data Sources

Reads directly from Firestore collections already used by backend:

- `markets`, `stocks`, `sectors`, `views_dashboard`
- `tm_config`, `tm_instruments`, `tm_latest_prices`, `tm_fundamental_snapshots`
- `tm_price_snapshots`, `tm_views_dashboard`, `tm_views_instrument`
- `tm_news_runs` and subcollections

## Notes

- No CSS is intentionally applied.
- This app expects Firebase admin credentials via one of:
  - `FIREBASE_SERVICE_ACCOUNT_JSON`
  - `FIREBASE_SERVICE_ACCOUNT_PATH`
- Env loading checks `test/.env*`, then repo root `.env*`, then `backend/.env`.
