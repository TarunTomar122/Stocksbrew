"""Verify RSS news sources return parseable, finance-relevant articles."""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass

from backend.market_strategy import PROVIDER_TEMPLATES, build_ticker_sources
from backend.models import Article, SourceDefinition
from backend.rss import fetch_feed
from backend.source_registry import list_sources_for_market


FINANCE_TITLE_MARKERS = (
    "stock",
    "shares",
    "earnings",
    "market",
    "fed",
    "rate",
    "nasdaq",
    "s&p",
    "ipo",
    "merger",
    "acquisition",
    "revenue",
    "profit",
    "guidance",
    "analyst",
    "tariff",
    "inflation",
    "gdp",
    "treasury",
    "bond",
    "oil",
    "chip",
    "futures",
    "dow",
    "rally",
    "selloff",
    "ai ",
)

MIN_BROAD_FINANCE_RATIO = 0.4
MIN_TICKER_FINANCE_RATIO = 0.5


@dataclass(slots=True)
class ProbeResult:
    source_id: str
    feed_url: str
    ok: bool
    article_count: int
    finance_ratio: float
    detail: str


def _finance_ratio(articles: list[Article]) -> float:
    if not articles:
        return 0.0
    hits = sum(
        1
        for article in articles
        if any(marker in article.title.lower() for marker in FINANCE_TITLE_MARKERS)
    )
    return hits / len(articles)


def _probe_source(
    source: SourceDefinition,
    *,
    require_quality: bool,
    min_finance_ratio: float,
) -> ProbeResult:
    if not str(source.feed_url or "").strip():
        return ProbeResult(source.id, source.feed_url, True, 0, 0.0, "no feed_url (curated)")
    try:
        articles = fetch_feed(source)
        count = len(articles)
        ratio = _finance_ratio(articles)
        if count == 0:
            return ProbeResult(source.id, source.feed_url, False, 0, ratio, "empty feed")
        sample = articles[0].title[:72]
        if require_quality and ratio < min_finance_ratio:
            return ProbeResult(
                source.id,
                source.feed_url,
                False,
                count,
                ratio,
                f"low finance signal ({ratio:.0%} < {min_finance_ratio:.0%}): {sample}",
            )
        return ProbeResult(
            source.id,
            source.feed_url,
            True,
            count,
            ratio,
            f"{ratio:.0%} finance | {sample}",
        )
    except Exception as exc:
        return ProbeResult(source.id, source.feed_url, False, 0, 0.0, str(exc)[:120])


def _probe_ticker_providers(
    market: str,
    tickers: list[str],
    *,
    require_quality: bool,
) -> list[ProbeResult]:
    entries = [
        {
            "ticker": ticker,
            "display_name": ticker,
            "aliases": [],
            "providers": list(PROVIDER_TEMPLATES),
            "max_items_per_source": 8,
            "max_age_hours": 168,
        }
        for ticker in tickers
    ]
    results: list[ProbeResult] = []
    seen: set[str] = set()
    for source in build_ticker_sources(market, entries, lane="core"):
        provider_key = source.id.rsplit("-", 1)[0]
        if provider_key in seen:
            continue
        seen.add(provider_key)
        results.append(
            _probe_source(
                source,
                require_quality=require_quality,
                min_finance_ratio=MIN_TICKER_FINANCE_RATIO,
            )
        )
    return results


def verify_registry(markets: list[str], *, require_quality: bool) -> list[ProbeResult]:
    results: list[ProbeResult] = []
    for market in markets:
        for source in list_sources_for_market(market):
            results.append(
                _probe_source(
                    source,
                    require_quality=require_quality,
                    min_finance_ratio=MIN_BROAD_FINANCE_RATIO,
                )
            )
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--market", default="US", help="Market code to verify (default: US)")
    parser.add_argument(
        "--only",
        nargs="*",
        default=[],
        help="Optional source ids to verify (registry) or provider keys (ticker)",
    )
    parser.add_argument("--json", action="store_true", help="Emit JSON instead of a table")
    parser.add_argument("--ticker-providers", action="store_true", help="Also verify per-ticker providers")
    parser.add_argument("--tickers", nargs="*", default=["AAPL", "NVDA", "MU"])
    parser.add_argument(
        "--skip-quality",
        action="store_true",
        help="Only check feed health, not finance-relevance ratio",
    )
    args = parser.parse_args()

    market = args.market.upper()
    require_quality = not args.skip_quality
    results = verify_registry([market], require_quality=require_quality)
    if args.only:
        allowed = {item.strip() for item in args.only if item.strip()}
        results = [row for row in results if row.source_id in allowed]
    if args.ticker_providers:
        ticker_rows = _probe_ticker_providers(market, [t.upper() for t in args.tickers], require_quality=require_quality)
        if args.only:
            allowed = {item.strip() for item in args.only if item.strip()}
            ticker_rows = [
                row
                for row in ticker_rows
                if any(row.source_id.startswith(f"core-{key}-") for key in allowed)
            ]
        results.extend(ticker_rows)

    failed = [row for row in results if not row.ok]
    if args.json:
        print(json.dumps([row.__dict__ for row in results], indent=2))
    else:
        for row in results:
            status = "OK" if row.ok else "FAIL"
            print(f"{status:4} {row.article_count:3} {row.finance_ratio:4.0%} {row.source_id:40} {row.detail}")
        print(f"\n{len(results) - len(failed)}/{len(results)} sources passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
