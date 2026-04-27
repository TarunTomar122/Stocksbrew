"""Link-by-link verifier for curated URL files.

Usage:
  python3 -m backend.scripts.verify_urls market_macro_us.json
  python3 -m backend.scripts.verify_urls --url https://example.com/article

Prints one line per URL with status, word count, publisher, date, and the
first line of the extracted title/body so you can eyeball whether trafilatura
recovered usable content before wiring the source into the pipeline.
"""
from __future__ import annotations

import argparse
import sys

from backend.curated_fetcher import extract_url, load_curated_urls


def _print_result(url: str) -> str:
    result = extract_url(url)
    head = f"[{result.status:>13}] {result.word_count:>5}w  {result.publisher:<22}"
    date = result.published_at or "no-date"
    title = (result.title or "").strip() or "(no title)"
    preview = (result.summary or "").replace("\n", " ")
    if len(preview) > 120:
        preview = preview[:117] + "..."
    print(head, date)
    print(f"               url:   {url}")
    print(f"               title: {title}")
    if preview:
        print(f"               lead:  {preview}")
    print(f"               note:  {result.note}")
    print()
    return result.status


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify curated URL extraction.")
    parser.add_argument("urls_file", nargs="?", help="JSON file under backend/config/curated_urls/")
    parser.add_argument("--url", action="append", default=[], help="Verify a single URL (repeatable)")
    args = parser.parse_args()

    urls: list[str] = []
    if args.urls_file:
        urls.extend(load_curated_urls(args.urls_file))
    urls.extend(args.url)
    if not urls:
        parser.error("provide a urls_file or at least one --url")

    counts: dict[str, int] = {}
    for url in urls:
        status = _print_result(url)
        counts[status] = counts.get(status, 0) + 1

    total = len(urls)
    summary = ", ".join(f"{k}={v}" for k, v in sorted(counts.items()))
    print(f"--- {total} url(s) | {summary} ---")
    return 0 if counts.get("ok", 0) > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
