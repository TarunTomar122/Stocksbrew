"""Company logos, fetched once and served from our own domain (``tm_stock_logos``).

The app used to point every ``<img>`` at third-party hosts (Finnhub, Clearbit,
Google favicons, FMP) and walk that chain in the browser. Clearbit is gone,
Finnhub answers a 302 and then a 1000px PNG for a 20px icon, and the chain
needed JavaScript to move on, so logos were slow or never showed. This job
fetches each logo once, checks it is not blank, turns it into a small square
tile and stores it. ``app/api/logo/[symbol]`` serves the tile with a one-year
immutable cache.

Who gets a logo: every active US stock in ``tm_instruments`` (not the macro
series), the funds the markets page and the ETF x-ray use, and any US ticker in
a user's ``tracked_stocks`` (read only). ``--symbols`` adds more.

Sources, in order:

1. Finnhub's public logo CDN (``static2.finnhub.io/.../stock_logo/SYM.png``):
   square brand tiles, the same files Finnhub's own apps show.
2. Financial Modeling Prep's image endpoint (``/image-stock/SYM.png``): marks on
   a transparent canvas; covers funds and names Finnhub lacks.

Coins (``COINS``, stored as ``DOGE-USD`` and so on) come first from the open
cryptocurrency-icons set (CC0-1.0, pinned on jsDelivr), then the two above.

A logo is a company's trademark; we show it only next to that company's ticker
to identify it, which is how every finance site uses them. The files are kept
in the store, never committed to the public repo.

One document per symbol in ``tm_stock_logos/{KEY}`` (KEY: upper case, ``-``
and ``_`` written as ``.``, so ``BRK-B`` and ``BRK.B`` meet)::

    {symbol, key, status: "ok" | "none", mime, data_b64, size, bytes, sha,
     source, source_url, tile, fetched_at, checked_at}

``status: "none"`` means both sources were tried and neither had a usable
logo; the route then serves a lettered tile, and the next run past
``--retry-days`` tries again. Writes are additive: whole documents replaced by
id, nothing deleted.

Tiles are 128px square (sharp at 2x for the largest 48px logo in the app),
WebP when Pillow can write it, PNG otherwise. Without Pillow the job only fills
gaps (new tickers), keeping small FMP PNGs (300px or less) as they are and never
replacing a stored tile, so install Pillow where it runs (``pip install Pillow``).

Run::

    python3 -m backend.agentdata.stock_logos              # fill gaps, refresh old entries
    python3 -m backend.agentdata.stock_logos --symbols TSM,VOO --force
    python3 -m backend.agentdata.stock_logos --dry-run    # fetch and report, write nothing
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import io
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable

from .store import DocStore

COLLECTION = "tm_stock_logos"
META_PATH = "tm_stock_logos_meta/US"
TILE = 128
USER_AGENT = "stocksbrew-logos/1.0 (+https://stocksbrew.online)"
TIMEOUT = 10
MAX_SOURCE_BYTES = 3 * 1024 * 1024
# A raw PNG kept without Pillow must already be small.
MAX_RAW_BYTES = 48 * 1024
# Dark tile for a light mark that would vanish on white.
DARK_TILE = (24, 24, 27)

# Funds shown across the app beyond the stock universe (markets page, ETF x-ray,
# strategies). Kept here so the job does not import the heavier jobs.
FUNDS = (
    "SPY", "VOO", "IVV", "VTI", "QQQ", "QQQM", "DIA", "IWM", "RSP", "SCHD", "VYM", "VUG", "VGT", "VIG",
    "VXUS", "VEA", "VWO", "BND", "AGG", "EFA", "EEM", "XLK", "XLF", "XLE", "XLV", "XLI", "XLY", "XLP",
    "XLU", "XLB", "XLRE", "XLC", "SMH", "SOXX", "TLT", "IEF", "SHY", "LQD", "HYG", "GLD", "SLV", "USO",
    "ARKK", "IGV", "BOTZ", "CIBR", "XBI", "KRE", "ITA", "XHB", "JETS", "URA", "TAN", "GDX", "KWEB",
    "IBIT", "FBTC", "JEPI", "JEPQ", "SCHG", "SPLG", "MDY", "IJH", "IJR", "VNQ",
)


def log(message: str) -> None:
    print(f"[stock_logos] {message}", file=sys.stderr, flush=True)


# A key we store and the route will ask for. Same rule as ``isLogoKey`` in
# lib/stock-logo-sources.ts: letters and digits with single dots between them.
LOGO_KEY = re.compile(r"^[A-Z0-9][A-Z0-9&^]*(?:\.[A-Z0-9&^]+)*$")


def is_logo_key(key: str) -> bool:
    return len(key) <= 15 and bool(LOGO_KEY.match(key))


def logo_key(symbol: str) -> str:
    """Store key for a ticker. Must match ``logoKey`` in ``lib/stock-logo-sources.ts``."""
    return symbol.strip().upper().replace("-", ".").replace("_", ".").replace("/", ".")


def finnhub_url(symbol: str) -> str:
    return (
        "https://static2.finnhub.io/file/publicdatany/finnhubimage/stock_logo/"
        + urllib.parse.quote(symbol.upper().replace(".", "-"))
        + ".png"
    )


def fmp_url(symbol: str) -> str:
    return "https://financialmodelingprep.com/image-stock/" + urllib.parse.quote(symbol.upper().replace(".", "-")) + ".png"


# Where Finnhub's tile is not the mark people know (GOOGL is Alphabet's red "A"
# there), FMP goes first.
PREFER_FMP = frozenset({"GOOGL"})

# Source files that are a "no logo" placeholder (FMP's grey person), by the
# first 16 hex of their SHA-256.
PLACEHOLDER_SHAS = frozenset({"c7fe0cb0ef5982a3"})


# The coins the markets page lists (backend/agentdata/markets.py CRYPTO), stored under "<SYMBOL>-USD" so a coin never
# takes the logo of a stock that shares its letters (DOGE, LINK, SOL are also tickers). The app asks for them that way
# (components/markets/widgets.tsx AssetRow).
COINS = ("BTC", "ETH", "SOL", "XRP", "BNB", "DOGE", "ADA", "TRX", "LINK", "AVAX")
COIN_SUFFIX = "-USD"
# The open cryptocurrency-icons set (github.com/spothq/cryptocurrency-icons), released under CC0-1.0, pinned to one
# version on jsDelivr: a 128px colour PNG per coin, the round mark people know.
COIN_ICONS = "https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/128/color/"


def coin_base(symbol: str) -> str | None:
    """The coin in a "<COIN>-USD" symbol we list, else None."""
    key = logo_key(symbol)
    base = key[: -len(".USD")] if key.endswith(".USD") else ""
    return base if base in COINS else None


def coin_icon_url(base: str) -> str:
    return COIN_ICONS + urllib.parse.quote(base.lower()) + ".png"


def sources_for(symbol: str) -> list[tuple[str, str]]:
    coin = coin_base(symbol)
    if coin:
        # A coin's own mark first; the stock sources stay as a fallback.
        return [("cryptocurrency-icons", coin_icon_url(coin)), ("finnhub", finnhub_url(symbol)), ("fmp", fmp_url(symbol))]
    ordered = [("finnhub", finnhub_url(symbol)), ("fmp", fmp_url(symbol))]
    return ordered[::-1] if logo_key(symbol) in PREFER_FMP else ordered


# -- fetching -------------------------------------------------------------------


def fetch(url: str) -> tuple[bytes, str] | None:
    """Image bytes and content type, or None for a miss (404, HTML, empty)."""
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "image/*"})
    for attempt in range(2):
        try:
            with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
                kind = (response.headers.get("Content-Type") or "").split(";")[0].strip().lower()
                if not kind.startswith("image/"):
                    return None
                body = response.read(MAX_SOURCE_BYTES + 1)
                if len(body) > MAX_SOURCE_BYTES or len(body) < 200:
                    return None
                return body, kind
        except urllib.error.HTTPError as error:
            if error.code in (404, 403, 410):
                return None
            if attempt == 0:
                time.sleep(1.5)
        except (urllib.error.URLError, TimeoutError, OSError):
            if attempt == 0:
                time.sleep(1.5)
    return None


# -- tiles ----------------------------------------------------------------------


def _pil():
    try:
        from PIL import Image  # type: ignore

        return Image
    except Exception:  # noqa: BLE001 - Pillow is optional
        return None


def _webp_ok() -> bool:
    try:
        from PIL import features  # type: ignore

        return bool(features.check("webp"))
    except Exception:  # noqa: BLE001
        return False


def _luma(rgb: tuple[int, int, int]) -> float:
    r, g, b = rgb
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0


def make_tile(raw: bytes) -> tuple[bytes, str, str] | None:
    """A 128px square tile from a source image, or None when it is blank or broken.

    Returns ``(bytes, mime, tile)`` where ``tile`` says how it was made:
    ``"source"`` (the source was already an opaque tile), ``"white"`` or
    ``"dark"`` (a transparent mark placed on that background).
    """
    Image = _pil()
    if Image is None:
        return None
    try:
        image = Image.open(io.BytesIO(raw))
        image.load()
    except Exception:  # noqa: BLE001 - any decode error is a miss
        return None
    if max(image.width, image.height) < 32 or min(image.width, image.height) < 8:
        return None
    rgba = image.convert("RGBA")

    # Measure on a small copy: share of see-through pixels and the colours of the rest.
    probe = rgba.copy()
    probe.thumbnail((64, 64))
    flat = getattr(probe, "get_flattened_data", None)
    pixels = list(flat() if flat else probe.getdata())
    total = len(pixels) or 1
    clear = sum(1 for p in pixels if p[3] < 200)
    solid = [p[:3] for p in pixels if p[3] >= 200]
    if len(solid) < total * 0.02:
        return None  # nearly empty canvas
    lumas = [_luma(p) for p in solid]
    mean = sum(lumas) / len(lumas)
    spread = (sum((v - mean) ** 2 for v in lumas) / len(lumas)) ** 0.5
    transparent = clear > total * 0.04

    if transparent:
        # A mark on a clear canvas. Light marks go on a dark tile so they show.
        dark_pixels = sum(1 for v in lumas if v < 0.82)
        on_dark = dark_pixels < len(lumas) * 0.04
        background = DARK_TILE if on_dark else (255, 255, 255)
        tile_kind = "dark" if on_dark else "white"
        # Trim the empty margin, then give every mark the same breathing room.
        box = rgba.getchannel("A").point(lambda a: 255 if a >= 24 else 0).getbbox()
        if not box:
            return None
        mark = rgba.crop(box)
        inner = int(TILE * 0.76)
        mark.thumbnail((inner, inner), Image.LANCZOS)
        canvas = Image.new("RGBA", (TILE, TILE), background + (255,))
        canvas.alpha_composite(mark, ((TILE - mark.width) // 2, (TILE - mark.height) // 2))
        out = canvas.convert("RGB")
    else:
        # An opaque image. A single flat colour is a placeholder, not a logo.
        if spread < 0.015:
            return None
        rgb = rgba.convert("RGB")
        tile_kind = "source"
        if rgb.width != rgb.height:
            side = max(rgb.width, rgb.height)
            corner = rgb.getpixel((0, 0))
            square = Image.new("RGB", (side, side), corner)
            square.paste(rgb, ((side - rgb.width) // 2, (side - rgb.height) // 2))
            rgb = square
        out = rgb.resize((TILE, TILE), Image.LANCZOS)

    buffer = io.BytesIO()
    if _webp_ok():
        out.save(buffer, "WEBP", quality=88, method=6)
        mime = "image/webp"
    else:
        out.save(buffer, "PNG", optimize=True)
        mime = "image/png"
    return buffer.getvalue(), mime, tile_kind


def raw_fallback(raw: bytes, kind: str) -> tuple[bytes, str, str] | None:
    """Without Pillow: keep a small PNG as it is (FMP marks are 100-250px, a few KB)."""
    if kind != "image/png" or len(raw) > MAX_RAW_BYTES or len(raw) < 300:
        return None
    if raw[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    width = int.from_bytes(raw[16:20], "big")
    height = int.from_bytes(raw[20:24], "big")
    if width < 32 or height < 32 or max(width, height) > 300:
        return None
    return raw, "image/png", "raw"


def resolve(symbol: str) -> dict[str, Any]:
    """Try each source for one symbol and build its document."""
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    have_pil = _pil() is not None
    tried: list[str] = []
    for source, url in sources_for(symbol):
        got = fetch(url)
        if not got:
            tried.append(f"{source}:miss")
            continue
        raw, kind = got
        if hashlib.sha256(raw).hexdigest()[:16] in PLACEHOLDER_SHAS:
            tried.append(f"{source}:placeholder")
            continue
        tile = make_tile(raw) if have_pil else raw_fallback(raw, kind)
        if not tile:
            tried.append(f"{source}:blank")
            continue
        data, mime, tile_kind = tile
        return {
            "symbol": symbol,
            "key": logo_key(symbol),
            "status": "ok",
            "mime": mime,
            "data_b64": base64.b64encode(data).decode("ascii"),
            "size": TILE if have_pil else None,
            "bytes": len(data),
            "sha": hashlib.sha256(data).hexdigest()[:16],
            "source": source,
            "source_url": url,
            "tile": tile_kind,
            "tried": tried,
            "fetched_at": now,
            "checked_at": now,
        }
    return {
        "symbol": symbol,
        "key": logo_key(symbol),
        "status": "none",
        "tried": tried,
        "checked_at": now,
    }


# -- universe -------------------------------------------------------------------


def _query_instruments(store: DocStore) -> list[dict[str, Any]]:
    from .feeds_common import query

    return [data for _path, data in query(store, "tm_instruments", filters=[("market", "==", "US")], limit=10000)]


def universe(store: DocStore, extra: Iterable[str] = ()) -> list[str]:
    """Covered US stocks, funds, and every US ticker someone tracks."""
    seen: dict[str, str] = {}

    def add(raw: Any) -> None:
        symbol = str(raw or "").strip().upper()
        if not is_logo_key(logo_key(symbol)):
            return
        seen.setdefault(logo_key(symbol), symbol)

    stocks = 0
    for row in _query_instruments(store):
        if str(row.get("status") or "active").lower() != "active":
            continue
        if str(row.get("support_tier") or "").lower() == "macro" or str(row.get("type") or "").lower() == "macro":
            continue
        add(row.get("ticker"))
        stocks += 1
    for symbol in FUNDS:
        add(symbol)
    for coin in COINS:
        add(coin + COIN_SUFFIX)
    tracked = 0
    try:
        for _path, user in store.list("users", limit=1000):
            for raw in user.get("tracked_stocks") or []:
                iid = str(raw or "").strip().upper()
                if iid.startswith("US_"):
                    add(iid[3:])
                    tracked += 1
    except Exception as error:  # noqa: BLE001 - tracked lists are a bonus, never fatal
        log(f"could not read tracked stocks: {error}")
    for symbol in extra:
        add(symbol)
    log(f"universe: {stocks} stocks, {len(FUNDS)} funds, {len(COINS)} coins, {tracked} tracked entries -> {len(seen)} symbols")
    return sorted(seen.values())


def stored_status(store: DocStore, paths: list[str]) -> dict[str, dict[str, Any]]:
    """``status`` and ``checked_at`` of stored logos, without pulling the image bytes."""
    if store.mode != "http":
        return store.get_many(paths)
    out: dict[str, dict[str, Any]] = {}
    for start in range(0, len(paths), 300):
        body = {"paths": paths[start : start + 300], "select": ["status", "checked_at"]}
        payload = store._request("POST", "/documents:batchGet", body) or {}
        for document in payload.get("documents", []):
            if isinstance(document, dict) and isinstance(document.get("data"), dict):
                out[document["path"]] = document["data"]
    return out


def is_stale(doc: dict[str, Any] | None, *, refresh_days: int, retry_days: int, now: datetime) -> bool:
    if not doc:
        return True
    checked = str(doc.get("checked_at") or "")
    try:
        when = datetime.fromisoformat(checked)
        return now - when > timedelta(days=refresh_days if doc.get("status") == "ok" else retry_days)
    except (ValueError, TypeError):  # unreadable or timezone-less stamp: fetch again
        return True


# -- run ------------------------------------------------------------------------


def run(
    store: DocStore,
    *,
    symbols: list[str] | None = None,
    force: bool = False,
    refresh_days: int = 30,
    retry_days: int = 7,
    workers: int = 6,
    dry_run: bool = False,
) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    wanted = universe(store, extra=symbols or []) if not symbols or not force else sorted({s.strip().upper() for s in symbols if is_logo_key(logo_key(s))})
    if symbols and force:
        log(f"{len(wanted)} symbols from --symbols")
    existing = stored_status(store, [f"{COLLECTION}/{logo_key(s)}" for s in wanted])
    todo = [
        s
        for s in wanted
        if force or is_stale(existing.get(f"{COLLECTION}/{logo_key(s)}"), refresh_days=refresh_days, retry_days=retry_days, now=now)
    ]
    if _pil() is None:
        # Raw files are worse than the tiles a Pillow run made: only fill gaps, never refresh.
        todo = [s for s in todo if (existing.get(f"{COLLECTION}/{logo_key(s)}") or {}).get("status") != "ok"]
        log("Pillow is not installed: filling gaps only, with small FMP PNGs kept as they are")
    log(f"{len(todo)} to fetch, {len(wanted) - len(todo)} fresh")

    docs: list[tuple[str, dict[str, Any]]] = []
    kept = 0
    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        for index, doc in enumerate(pool.map(resolve, todo), start=1):
            prior = existing.get(f"{COLLECTION}/{doc['key']}")
            if doc["status"] == "none" and not force and prior and prior.get("status") == "ok":
                # A source hiccup never replaces a logo we already have: leave it, it is retried
                # next run. --force is the way to clear a logo that turned out to be wrong.
                kept += 1
                continue
            else:
                docs.append((f"{COLLECTION}/{doc['key']}", doc))
            if index % 100 == 0:
                log(f"  {index}/{len(todo)}")

    fetched = [d for _, d in docs]
    ok = sum(1 for d in fetched if d.get("status") == "ok")
    by_source: dict[str, int] = {}
    for d in fetched:
        if d.get("status") == "ok":
            by_source[str(d.get("source"))] = by_source.get(str(d.get("source")), 0) + 1
    missing = sorted(d["symbol"] for d in fetched if d.get("status") != "ok")
    written_keys = {d["key"] for d in fetched}
    total_ok = ok + sum(
        1
        for s in wanted
        if logo_key(s) not in written_keys and (existing.get(f"{COLLECTION}/{logo_key(s)}") or {}).get("status") == "ok"
    )
    sizes = [int(d.get("bytes") or 0) for d in fetched if d.get("status") == "ok"]
    summary = {
        "symbols": len(wanted),
        "fetched": len(todo),
        "ok_this_run": ok,
        "ok_total": total_ok,
        "coverage_pct": round(100.0 * total_ok / len(wanted), 1) if wanted else 0.0,
        "by_source": by_source,
        "missing": missing,
        "kept_after_miss": kept,
        "avg_bytes": round(sum(sizes) / len(sizes)) if sizes else 0,
        "max_bytes": max(sizes) if sizes else 0,
        "updated_at": now.isoformat(timespec="seconds"),
    }
    log(
        f"{ok}/{len(todo)} fetched ok ({by_source}); {total_ok}/{len(wanted)} symbols have a logo "
        f"({summary['coverage_pct']}%); avg {summary['avg_bytes']} B, max {summary['max_bytes']} B"
    )
    if missing:
        log(f"no logo: {', '.join(missing[:60])}{' ...' if len(missing) > 60 else ''}")
    if dry_run:
        return summary
    if docs:
        written = store.set_many(docs)
        log(f"wrote {written} documents to {COLLECTION} ({store.mode})")
    if not symbols:
        store.set(META_PATH, summary)
    return summary


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Fetch company logos into tm_stock_logos.")
    parser.add_argument("--symbols", help="comma-separated tickers to add (with --force: only these)")
    parser.add_argument("--force", action="store_true", help="refetch even when the stored logo is fresh")
    parser.add_argument("--refresh-days", type=int, default=30, help="refetch a stored logo after this many days")
    parser.add_argument("--retry-days", type=int, default=7, help="retry a ticker with no logo after this many days")
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--dry-run", action="store_true", help="fetch and report, write nothing")
    args = parser.parse_args(argv)
    symbols = [s for s in (args.symbols or "").split(",") if s.strip()] or None
    store = DocStore.from_env()
    run(
        store,
        symbols=symbols,
        force=args.force,
        refresh_days=args.refresh_days,
        retry_days=args.retry_days,
        workers=args.workers,
        dry_run=args.dry_run,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
