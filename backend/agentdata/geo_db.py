"""Keep the country database for the first-party analytics current.

db-ip.com publishes "IP to Country Lite" (CC BY 4.0, credited on
/admin/analytics) as a MaxMind DB once a month, with no key. This job
downloads this month's file into ``GEO_DIR`` (default
``/srv/tikrr-data/geo``) as ``dbip-country-lite.mmdb``, unless the stored one
is already this month's. The web app (lib/analytics/geo.ts) notices the new
file by its mtime within an hour; nothing restarts.

Run it::

    python3 -m backend.agentdata.geo_db            # fetch if the stored file is not this month's
    python3 -m backend.agentdata.geo_db --force    # fetch again anyway

It runs in the weekly group (backend/agentdata/schedule.py), so a new month's
file lands within a week of its release; the other weekly runs are a stat
call. On a machine without the data folder (a laptop) it says so and exits 0.

Standard library only. The file is checked before it replaces the old one:
gzip intact, the MaxMind metadata marker present, and a sane size.
"""

from __future__ import annotations

import argparse
import datetime as dt
import gzip
import io
import os
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

URL = "https://download.db-ip.com/free/dbip-country-lite-{month}.mmdb.gz"
FILE_NAME = "dbip-country-lite.mmdb"
STAMP_NAME = "dbip-country-lite.month"
DEFAULT_DIR = "/srv/tikrr-data/geo"
MARKER = b"\xab\xcd\xefMaxMind.com"
MIN_BYTES = 1_000_000
MAX_BYTES = 200_000_000
USER_AGENT = "stocksbrew geo refresh (+https://www.stocksbrew.online)"


def months_to_try(today: dt.date) -> list[str]:
    """This month, then last month (early in a month the new file may not be out yet)."""
    first = today.replace(day=1)
    previous = (first - dt.timedelta(days=1)).replace(day=1)
    return [first.strftime("%Y-%m"), previous.strftime("%Y-%m")]


def looks_like_mmdb(data: bytes) -> bool:
    return MIN_BYTES <= len(data) <= MAX_BYTES and MARKER in data[-128 * 1024 :]


def fetch(month: str, opener=urllib.request.urlopen) -> bytes | None:
    """The unpacked database for a month, or None when db-ip has no file for it."""
    request = urllib.request.Request(URL.format(month=month), headers={"User-Agent": USER_AGENT})
    try:
        with opener(request, timeout=120) as response:
            packed = response.read(MAX_BYTES)
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return None
        raise
    return unpack(packed)


def unpack(packed: bytes) -> bytes:
    """Gunzip, but never more than MAX_BYTES: a bad or hostile file can't fill the memory or the disk."""
    with gzip.GzipFile(fileobj=io.BytesIO(packed)) as handle:
        data = handle.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ValueError(f"unpacked file is over {MAX_BYTES} bytes")
    return data


def refresh(directory: Path, today: dt.date, *, force: bool = False, opener=urllib.request.urlopen, out=sys.stdout) -> int:
    target = directory / FILE_NAME
    stamp = directory / STAMP_NAME
    current = stamp.read_text().strip() if stamp.exists() else ""
    wanted = months_to_try(today)
    if not force and target.exists() and current == wanted[0]:
        print(f"geo: {FILE_NAME} is already {current}", file=out)
        return 0
    for month in wanted:
        if not force and target.exists() and current == month:
            print(f"geo: {month} is the newest published and already stored", file=out)
            return 0
        data = fetch(month, opener)
        if data is None:
            print(f"geo: no file for {month} yet", file=out)
            continue
        if not looks_like_mmdb(data):
            print(f"geo: the {month} download does not look like a MaxMind DB ({len(data)} bytes); keeping the old file", file=out)
            return 1
        # Write next to the target and rename, so the app never reads half a file.
        fd, tmp = tempfile.mkstemp(dir=directory, prefix=".dbip-", suffix=".mmdb")
        try:
            with os.fdopen(fd, "wb") as handle:
                handle.write(data)
            os.chmod(tmp, 0o644)
            os.replace(tmp, target)
        finally:
            if os.path.exists(tmp):
                os.unlink(tmp)
        stamp.write_text(month + "\n")
        print(f"geo: stored {month} ({len(data) // 1024} KB)", file=out)
        return 0
    print("geo: no db-ip file found for this month or the last", file=out)
    return 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Download db-ip.com's IP to Country Lite database.")
    parser.add_argument("--force", action="store_true", help="download even if this month's file is stored")
    args = parser.parse_args(argv)
    directory = Path(os.getenv("GEO_DIR", DEFAULT_DIR))
    if not directory.is_dir():
        print(f"geo: {directory} does not exist here; skipping (create it on the VPS)")
        return 0
    return refresh(directory, dt.date.today(), force=args.force)


if __name__ == "__main__":
    raise SystemExit(main())
