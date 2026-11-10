# Tikrr Pipeline Test

Minimal test path for:

1. query SearXNG
2. generate a rich stock payload with the model
3. optionally push it to the Tikrr API

## Environment

Set in `backend/.env` or shell:

- `MIMO_API_KEY`
- `SEARXNG_BASE_URL=http://localhost:8888`
- `TIKRR_API_BASE_URL=https://www.stocksbrew.online/api/tikrr`
- `TIKRR_API_KEY=openclaw`
- optional: `TIKRR_PIPELINE_MODEL=mimo-v2.5`

## Start SearXNG

If Docker is available:

```bash
docker run -d \
  --name searxng \
  --restart unless-stopped \
  -p 8888:8080 \
  searxng/searxng
```

The default image only enables `html` responses, while this pipeline uses `format=json`.
Patch the running container once:

```bash
docker exec searxng sh -lc "python - <<'PY'
from pathlib import Path
p = Path('/etc/searxng/settings.yml')
text = p.read_text()
text = text.replace('formats:\\n    - html', 'formats:\\n    - html\\n    - json')
text = text.replace('method: \"POST\"', 'method: \"GET\"')
p.write_text(text)
print('patched')
PY"
docker restart searxng
```

Quick check:

```bash
curl "http://localhost:8888/search?q=AAPL+stock+news&format=json"
```

## Dry Run

```bash
# from the repo root
npm run backend:test-tikrr-stock -- --market US --symbol AAPL --name "Apple Inc." --output /tmp/aapl_tikrr.json
```

## Push To Tikrr

```bash
# from the repo root
npm run backend:test-tikrr-stock -- --market US --symbol AAPL --name "Apple Inc." --push
```

The script prints the generated `data` payload and, with `--push`, posts it to `/api/tikrr/stock`.
