"""Stock logos: store keys, tile making, staleness and the keep-what-we-have rule."""

import io
from datetime import datetime, timedelta, timezone

import pytest

from backend.agentdata import stock_logos as sl

Image = pytest.importorskip("PIL.Image")


def png(image) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, "PNG")
    return buffer.getvalue()


def decode(data: bytes):
    out = Image.open(io.BytesIO(data))
    out.load()
    return out


def test_logo_key_joins_share_class_spellings():
    assert sl.logo_key("brk-b") == "BRK.B"
    assert sl.logo_key("BRK_B") == "BRK.B"
    assert sl.logo_key(" BRK.B ") == "BRK.B"
    assert sl.logo_key("cwen-a") == "CWEN.A"


def test_only_well_formed_keys_are_kept():
    assert sl.is_logo_key("BRK.B") and sl.is_logo_key("M&M") and sl.is_logo_key("A")
    for bad in ("", ".", "A..B", "A.", ".A", "^GSPC", "%41", "A" * 16):
        assert not sl.is_logo_key(bad), bad


def test_source_urls_use_dashes_and_googl_prefers_fmp():
    assert sl.finnhub_url("BRK.B").endswith("/stock_logo/BRK-B.png")
    assert sl.fmp_url("BRK.B").endswith("/image-stock/BRK-B.png")
    assert [name for name, _ in sl.sources_for("MSFT")] == ["finnhub", "fmp"]
    assert [name for name, _ in sl.sources_for("GOOGL")] == ["fmp", "finnhub"]


def test_opaque_tile_is_resized_to_a_square():
    source = Image.new("RGB", (1000, 1000), (20, 120, 200))
    for x in range(300, 700):
        for y in range(450, 550):
            source.putpixel((x, y), (255, 255, 255))
    data, mime, kind = sl.make_tile(png(source))
    tile = decode(data)
    assert kind == "source"
    assert tile.size == (sl.TILE, sl.TILE)
    assert mime in ("image/webp", "image/png")


def test_dark_mark_on_clear_canvas_goes_on_white():
    source = Image.new("RGBA", (250, 250), (0, 0, 0, 0))
    for x in range(60, 190):
        for y in range(100, 150):
            source.putpixel((x, y), (10, 10, 10, 255))
    data, _, kind = sl.make_tile(png(source))
    assert kind == "white"
    corner = decode(data).convert("RGB").getpixel((2, 2))
    assert min(corner) > 240


def test_white_mark_on_clear_canvas_goes_on_dark():
    source = Image.new("RGBA", (250, 250), (0, 0, 0, 0))
    for x in range(60, 190):
        for y in range(60, 190):
            source.putpixel((x, y), (255, 255, 255, 255))
    data, _, kind = sl.make_tile(png(source))
    assert kind == "dark"
    corner = decode(data).convert("RGB").getpixel((2, 2))
    assert max(corner) < 40


def test_blank_and_tiny_images_are_rejected():
    assert sl.make_tile(png(Image.new("RGB", (200, 200), (255, 255, 255)))) is None
    assert sl.make_tile(png(Image.new("RGBA", (200, 200), (0, 0, 0, 0)))) is None
    assert sl.make_tile(png(Image.new("RGB", (16, 16), (200, 0, 0)))) is None
    assert sl.make_tile(b"not an image") is None


def test_wide_short_wordmark_is_kept():
    source = Image.new("RGBA", (128, 19), (0, 0, 0, 0))
    for x in range(4, 124):
        for y in range(3, 16):
            if (x // 6) % 2 == 0:
                source.putpixel((x, y), (180, 20, 40, 255))
    assert sl.make_tile(png(source)) is not None


def test_raw_fallback_keeps_only_small_pngs():
    image = Image.new("RGB", (100, 100), (0, 0, 0))
    for x in range(100):
        image.putpixel((x, x), (255, (x * 7) % 255, 0))
    raw = png(image)
    assert sl.raw_fallback(raw, "image/png") == (raw, "image/png", "raw")
    assert sl.raw_fallback(raw, "image/jpeg") is None
    assert sl.raw_fallback(png(Image.new("RGB", (16, 16))), "image/png") is None


def test_is_stale_uses_separate_windows_for_hits_and_misses():
    now = datetime(2026, 11, 11, tzinfo=timezone.utc)
    day = lambda n: (now - timedelta(days=n)).isoformat()  # noqa: E731
    assert sl.is_stale(None, refresh_days=30, retry_days=7, now=now)
    assert not sl.is_stale({"status": "ok", "checked_at": day(10)}, refresh_days=30, retry_days=7, now=now)
    assert sl.is_stale({"status": "ok", "checked_at": day(31)}, refresh_days=30, retry_days=7, now=now)
    assert sl.is_stale({"status": "none", "checked_at": day(8)}, refresh_days=30, retry_days=7, now=now)
    assert sl.is_stale({"status": "ok", "checked_at": "garbage"}, refresh_days=30, retry_days=7, now=now)
    # A stamp without a timezone cannot be compared with an aware clock: fetch again, never crash.
    assert sl.is_stale({"status": "ok", "checked_at": "2026-11-10T00:00:00"}, refresh_days=30, retry_days=7, now=now)


class FakeStore:
    mode = "memory"

    def __init__(self, docs):
        self.docs = dict(docs)
        self.writes = []

    def get_many(self, paths):
        return {p: self.docs[p] for p in paths if p in self.docs}

    def set_many(self, docs, merge=False):
        docs = list(docs)
        self.writes.extend(docs)
        return len(docs)

    def set(self, path, data, merge=False):
        self.writes.append((path, data))

    def list(self, collection, limit=1000):
        return []


def test_a_miss_never_replaces_a_stored_logo_unless_forced(monkeypatch):
    old = (datetime.now(timezone.utc) - timedelta(days=60)).isoformat()
    store = FakeStore({"tm_stock_logos/MSFT": {"status": "ok", "checked_at": old}})
    monkeypatch.setattr(sl, "resolve", lambda s: {"symbol": s, "key": sl.logo_key(s), "status": "none", "tried": [], "checked_at": "now"})
    monkeypatch.setattr(sl, "_query_instruments", lambda store: [{"ticker": "MSFT", "status": "active"}])
    monkeypatch.setattr(sl, "FUNDS", ())
    summary = sl.run(store)
    assert [p for p, _ in store.writes if p.startswith("tm_stock_logos/")] == []
    assert summary["kept_after_miss"] == 1
    assert summary["ok_total"] == 1

    store = FakeStore({"tm_stock_logos/MSFT": {"status": "ok", "checked_at": old}})
    sl.run(store, symbols=["MSFT"], force=True)
    assert [(p, d["status"]) for p, d in store.writes] == [("tm_stock_logos/MSFT", "none")]


def test_placeholder_source_is_skipped(monkeypatch):
    calls = []

    def fake_fetch(url):
        calls.append(url)
        return (b"placeholder-bytes", "image/png")

    monkeypatch.setattr(sl, "fetch", fake_fetch)
    monkeypatch.setattr(sl, "PLACEHOLDER_SHAS", frozenset({__import__("hashlib").sha256(b"placeholder-bytes").hexdigest()[:16]}))
    doc = sl.resolve("HWKN")
    assert doc["status"] == "none"
    assert doc["tried"] == ["finnhub:placeholder", "fmp:placeholder"]
