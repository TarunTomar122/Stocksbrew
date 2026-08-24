# stocksbrew-cli

Official CLI for the Stocksbrew REST API.

```sh
npm install -g stocksbrew-cli
stocksbrew market
stocksbrew stock NVDA
stocksbrew search "semiconductor"
```

Set `STOCKSBREW_TOKEN` for authenticated Watchlist and alert endpoints, or pass `--token`. Use `--base-url` for a compatible deployment. The API reference is at <https://www.stocksbrew.online/developers> and the OpenAPI document is at <https://www.stocksbrew.online/api/v1/openapi.json>.
