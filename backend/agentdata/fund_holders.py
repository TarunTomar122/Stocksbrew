"""Which followed funds hold a given stock: a per-ticker index over the 13F data.

Run it after ``funds_13f`` has written its profiles::

    python3 -m backend.agentdata.fund_holders            # write tm_fund_holders/{TICKER}
    python3 -m backend.agentdata.fund_holders --dry-run  # print counts only

``tm_fund_profiles/{slug}`` is one large document per fund. The stock page
cannot afford to read sixty of them to answer "who holds NVDA", so this job
turns them inside out into one small document per ticker:

* ``tm_fund_holders/{TICKER}``  holders (latest filing of each fund) and the
  funds that sold out in their latest filing
* ``tm_fund_holders_meta/run``  counts and the time of the run

Everything is copied from the profiles; nothing is computed beyond sorting.
A 13F is a quarter-end snapshot filed up to 45 days late, so every row keeps
the quarter it reports on and the date it was filed.

Standard library only.
"""

from __future__ import annotations

import argparse
import re
import sys
from datetime import datetime, timezone
from typing import Any, Iterable

from .store import DocStore

HOLDERS_PER_TICKER = 60
_TICKER = re.compile(r"^[A-Z][A-Z0-9.\-]{0,9}$")


def _num(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value)


def _doc_key(ticker: str) -> str:
    """Store ids cannot hold a slash; class shares such as BRK/B are stored as BRK.B."""
    return ticker.replace("/", ".")


def build_holder_docs(profiles: Iterable[dict[str, Any]], *, now_iso: str) -> dict[str, dict[str, Any]]:
    """Per-ticker documents keyed by store path. Pure: profiles in, documents out."""
    holders: dict[str, list[dict[str, Any]]] = {}
    sold: dict[str, list[dict[str, Any]]] = {}

    for profile in profiles:
        slug = str(profile.get("slug") or "").strip()
        fund = str(profile.get("fund") or "").strip()
        latest = profile.get("latest") if isinstance(profile.get("latest"), dict) else {}
        period = str(latest.get("period") or "")
        if not slug or not fund or not period:
            continue
        base = {
            "slug": slug,
            "fund": fund,
            "manager": str(profile.get("manager") or "").strip(),
            "active": bool(profile.get("active", True)),
            "period": period,
            "quarter": str(latest.get("quarter") or ""),
            "filed_at": str(latest.get("filed_at") or ""),
            "url": str(latest.get("url") or profile.get("source_url") or ""),
        }
        for rank, position in enumerate(profile.get("portfolio") or [], start=1):
            if not isinstance(position, dict):
                continue
            ticker = str(position.get("ticker") or "").strip().upper()
            if not _TICKER.match(_doc_key(ticker)):
                continue
            row = {
                **base,
                "rank": rank,
                "value": _num(position.get("value")),
                "weight": _num(position.get("weight")),
                "shares": _num(position.get("shares")),
                "change": str(position.get("change") or "") or None,
                "shares_delta_pct": _num(position.get("shares_delta_pct")),
                "held_since": str(position.get("held_since") or "") or None,
                "held_since_is_floor": bool(position.get("held_since_is_floor")),
            }
            holders.setdefault(ticker, []).append(row)

        changes = profile.get("changes") if isinstance(profile.get("changes"), dict) else {}
        for item in changes.get("sold") or []:
            if not isinstance(item, dict):
                continue
            ticker = str(item.get("ticker") or "").strip().upper()
            if not _TICKER.match(_doc_key(ticker)):
                continue
            sold.setdefault(ticker, []).append(
                {
                    **base,
                    "prev_value": _num(item.get("prev_value")),
                    "prev_weight": _num(item.get("prev_weight")),
                    "prev_shares": _num(item.get("prev_shares")),
                    "compared_with": str(profile.get("compared_with") or "") or None,
                }
            )

    docs: dict[str, dict[str, Any]] = {}
    for ticker in sorted(set(holders) | set(sold)):
        rows = sorted(holders.get(ticker, []), key=lambda row: -(row["value"] or 0))
        exits = sorted(sold.get(ticker, []), key=lambda row: -(row["prev_value"] or 0))
        filed = [row["filed_at"] for row in rows + exits if row["filed_at"]]
        docs[f"tm_fund_holders/{_doc_key(ticker)}"] = {
            "ticker": ticker,
            "holders": rows[:HOLDERS_PER_TICKER],
            "holder_count": len(rows),
            "sold": exits[:HOLDERS_PER_TICKER],
            "latest_filed_at": max(filed) if filed else None,
            "source": "SEC EDGAR form 13F",
            "updated_at": now_iso,
        }
    return docs


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--dry-run", action="store_true", help="build the index and print counts without writing")
    args = parser.parse_args(argv)

    store = DocStore.from_env()
    profiles = [data for _, data in store.list("tm_fund_profiles", limit=1000)]
    if not profiles:
        print("fund_holders: tm_fund_profiles is empty; run backend.agentdata.funds_13f first")
        return 1

    now_iso = datetime.now(timezone.utc).isoformat()
    docs = build_holder_docs(profiles, now_iso=now_iso)
    print(f"fund_holders: {len(profiles)} funds -> {len(docs)} tickers ({store.mode})")
    if args.dry_run:
        return 0

    written = store.set_many(docs.items())
    store.set(
        "tm_fund_holders_meta/run",
        {"funds": len(profiles), "tickers": len(docs), "updated_at": now_iso},
    )
    print(f"fund_holders: wrote {written} documents")
    return 0


if __name__ == "__main__":
    sys.exit(main())
