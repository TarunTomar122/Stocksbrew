import datetime as dt
import gzip
import io
import tempfile
import unittest
import urllib.error
from pathlib import Path

from backend.agentdata import geo_db

GOOD = b"\x00" * geo_db.MIN_BYTES + geo_db.MARKER + b"\xe0meta"


class FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


def opener_for(files):
    calls = []

    def opener(request, timeout=0):
        calls.append(request.full_url)
        for month, data in files.items():
            if month in request.full_url:
                return FakeResponse(gzip.compress(data))
        raise urllib.error.HTTPError(request.full_url, 404, "not found", {}, None)

    return opener, calls


class GeoDbTest(unittest.TestCase):
    def test_months_to_try_falls_back_to_last_month(self):
        self.assertEqual(geo_db.months_to_try(dt.date(2026, 1, 3)), ["2026-01", "2025-12"])

    def test_stores_this_months_file_and_skips_next_time(self):
        with tempfile.TemporaryDirectory() as tmp:
            opener, calls = opener_for({"2026-11": GOOD})
            out = io.StringIO()
            self.assertEqual(geo_db.refresh(Path(tmp), dt.date(2026, 11, 13), opener=opener, out=out), 0)
            self.assertEqual((Path(tmp) / geo_db.FILE_NAME).read_bytes(), GOOD)
            self.assertEqual((Path(tmp) / geo_db.STAMP_NAME).read_text().strip(), "2026-11")
            self.assertEqual(geo_db.refresh(Path(tmp), dt.date(2026, 11, 20), opener=opener, out=out), 0)
            self.assertEqual(len(calls), 1)

    def test_early_in_a_month_uses_last_months_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            opener, _ = opener_for({"2026-10": GOOD})
            self.assertEqual(geo_db.refresh(Path(tmp), dt.date(2026, 11, 1), opener=opener, out=io.StringIO()), 0)
            self.assertEqual((Path(tmp) / geo_db.STAMP_NAME).read_text().strip(), "2026-10")

    def test_a_bad_download_never_replaces_the_stored_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / geo_db.FILE_NAME
            target.write_bytes(GOOD)
            opener, _ = opener_for({"2026-11": b"<html>oops</html>"})
            self.assertEqual(geo_db.refresh(Path(tmp), dt.date(2026, 11, 13), force=True, opener=opener, out=io.StringIO()), 1)
            self.assertEqual(target.read_bytes(), GOOD)
            self.assertEqual([p.name for p in Path(tmp).iterdir()], [geo_db.FILE_NAME])

    def test_unpacking_is_capped(self):
        original = geo_db.MAX_BYTES
        try:
            geo_db.MAX_BYTES = 10
            with self.assertRaises(ValueError):
                geo_db.unpack(gzip.compress(b"x" * 11))
            self.assertEqual(geo_db.unpack(gzip.compress(b"x" * 10)), b"x" * 10)
        finally:
            geo_db.MAX_BYTES = original


if __name__ == "__main__":
    unittest.main()
