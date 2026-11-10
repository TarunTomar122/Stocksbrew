"""Daily scoring job for the call engine: score every stock's families against
its peers, advance each stock's call, and store it.

Reads (never writes) ``tm_price_history_daily``, ``tm_fundamentals_pit``,
``tm_insider_buy_history`` / ``tm_insider_trades`` and ``tm_screener_snapshot``.

Writes, only with ``--write``:

* ``tm_call_engine_state/{SYMBOL}``: the current call object (what the brief
  pipeline reads when ``CALL_ENGINE_MODE`` is shadow or on, and the state the
  next run continues from).
* ``tm_call_engine_daily/{SYMBOL}__{YYYY-MM-DD}``: one record per stock per
  close with every raw factor value and each family's percentile and vote, so
  the whole scorecard stays replayable from stored, dated data.

Both collections are new and belong to this job. The state machine only moves
on the first close of an ISO week; running the job on other days rebuilds
the levels from that close and the daily record, never the call.

Run: ``python3 -m backend.agentdata.call_scores [--write] [--symbols NVDA,AAPL]``
     ``python3 -m backend.agentdata.call_scores --data-dir <local cache>``   (never writes)
"""

from __future__ import annotations

import argparse
import json
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from backend import call_engine as ce
from backend import call_factors as cf

from .insider_history import cluster_buyers

STATE_COLLECTION = "tm_call_engine_state"
DAILY_COLLECTION = "tm_call_engine_daily"
BENCHMARK = "SPY"
MIN_UNIVERSE = 100


# --------------------------------------------------------------------------
# loading
# --------------------------------------------------------------------------

def _recent_trades_as_rows(trades: list[dict[str, Any]]) -> dict[str, list[list[Any]]]:
    """``tm_insider_trades`` (the live Form 4 feed) in the history row shape."""
    out: dict[str, list[list[Any]]] = {}
    for trade in trades:
        if str(trade.get("tx_type") or "").lower() != "buy" or trade.get("plan_10b5_1"):
            continue
        symbol = str(trade.get("symbol") or "").upper()
        filed = str(trade.get("filing_date") or "")[:10]
        if symbol and filed:
            out.setdefault(symbol, []).append(
                [filed, str(trade.get("transaction_date") or "")[:10], str(trade.get("insider_id") or "").lstrip("0"), trade.get("shares"), trade.get("price"), trade.get("role") or ""]
            )
    return out


def load_from_store(store: Any) -> dict[str, Any]:
    prices = {path.split("/", 1)[1]: data for path, data in store.list("tm_price_history_daily", limit=5000)}
    funds = {path.split("/", 1)[1]: data for path, data in store.list("tm_fundamentals_pit", limit=5000)}
    insiders = {path.split("/", 1)[1]: list(data.get("rows") or []) for path, data in store.list("tm_insider_buy_history", limit=5000)}
    recent = _recent_trades_as_rows([data for _, data in store.list("tm_insider_trades", limit=10000)])
    for symbol, rows in recent.items():
        seen = {(row[0], row[2]) for row in insiders.get(symbol, [])}
        insiders.setdefault(symbol, []).extend(row for row in rows if (row[0], row[2]) not in seen)
    meta = store.get("tm_screener_snapshot/US") or {}
    shard_ids = list(meta.get("shards") or []) + ([meta["extra_shard"]] if meta.get("extra_shard") else [])
    rows: dict[str, dict[str, Any]] = {}
    for doc in store.get_many([f"tm_screener_snapshot/{shard}" for shard in shard_ids]).values():
        for row in doc.get("rows") or []:
            if isinstance(row, dict) and row.get("symbol"):
                rows[str(row["symbol"]).upper()] = row
    states = {path.split("/", 1)[1]: data for path, data in store.list(STATE_COLLECTION, limit=5000)}
    return {"prices": prices, "funds": funds, "insiders": insiders, "rows": rows, "states": states}


def load_from_dir(data_dir: Path) -> dict[str, Any]:
    """The same inputs from the local research cache (for dry runs and tests)."""
    prices = json.loads((data_dir / "prices.json").read_text())
    funds = {path.stem: json.loads(path.read_text()) for path in (data_dir / "sec").glob("*.json") if not path.name.startswith("_")}
    insider_path = data_dir / "insider" / "insider_buys.json"
    rows_path = data_dir / "screener_rows.json"
    states_path = data_dir / "call_engine_state.json"
    return {
        "prices": prices,
        "funds": funds,
        "insiders": json.loads(insider_path.read_text()) if insider_path.exists() else {},
        "rows": json.loads(rows_path.read_text()) if rows_path.exists() else {},
        "states": json.loads(states_path.read_text()) if states_path.exists() else {},
    }


# --------------------------------------------------------------------------
# scoring
# --------------------------------------------------------------------------

STALE_FILINGS_DAYS = 215  # call_factors.raw_factors drops fundamentals older than this


def _num_or_none(value: Any) -> float | None:
    return float(value) if isinstance(value, (int, float)) and not isinstance(value, bool) and value > 0 else None


def _unscored_reason(stock: dict[str, Any], families: dict[str, dict[str, Any]], day: str, params: ce.Params) -> str:
    """Why a stock with prices and filings still gets no call."""
    fund = stock.get("fund") or {}
    period_end = str(fund.get("period_end") or "")
    votes = ce.tally(families)
    head = f"only {votes['scored']} of the families could be scored (a call needs {params.min_families})"
    if not fund:
        return f"{head}: no SEC filing was known on {day}."
    if not period_end:
        return f"{head}: the filings have no trailing-year profit or revenue (latest filed {fund.get('filed')})."
    age = (date.fromisoformat(day[:10]) - date.fromisoformat(period_end[:10])).days
    if age > STALE_FILINGS_DAYS:
        return f"{head}: the latest filed period ends {period_end}, {age} days before {day}, so its fundamentals count as stale."
    missing = [ce.FAMILY_LABELS[name].lower() for name, entry in families.items() if entry.get("status") == "no_data"]
    return f"{head}: no data for {', '.join(missing) or 'the fundamental families'}."


def score_universe(inputs: dict[str, Any], *, day: str | None = None, params: ce.Params = ce.DEFAULT_PARAMS) -> dict[str, Any]:
    """Score every stock's families against its peers and build its call.
    Pure: nothing is read or written.

    Returns ``calls`` and ``records`` for scored stocks and ``skipped``
    (symbol -> reason) for every stock with a fundamentals document that got
    no call.
    """
    prices = inputs["prices"]
    bench = prices.get(BENCHMARK) or {}
    bench_by_day = dict(zip(bench.get("dates") or [], bench.get("closes") or []))
    if not bench_by_day:
        raise ValueError(f"no {BENCHMARK} history: cannot score")
    day = (day or max(bench_by_day))[:10]

    stocks: dict[str, dict[str, Any]] = {}
    skipped: dict[str, str] = {}
    for symbol, fund_doc in inputs["funds"].items():
        if symbol == BENCHMARK:
            continue
        series_doc = prices.get(symbol)
        if not series_doc:
            skipped[symbol] = "no price history in tm_price_history_daily."
            continue
        series = cf.PriceSeries(series_doc.get("dates") or [], series_doc.get("closes") or [], bench_by_day)
        i = series.index_on(day, max_stale_days=4)
        price = series.features(i) if i is not None else None
        if not price:
            skipped[symbol] = "under a year of daily closes, or no close within four days of the scored day."
            continue
        fund = cf.Fundamentals(fund_doc)
        model = cf.factor_model(fund.sic)
        if model not in ce.FAMILIES:
            skipped[symbol] = "a commodity trust, fund or blank-check company (SEC industry code " + (fund.sic or "?") + "): not an operating company."
            continue
        row = inputs["rows"].get(symbol) or {}
        known = fund.as_of(day)
        market_cap = row.get("market_cap") if isinstance(row.get("market_cap"), (int, float)) and row.get("market_cap") > 0 else None
        if market_cap is None and known and _num_or_none(known.get("shares")):
            # no screener row: the latest filed share count (at most ~13 months
            # old, see Fundamentals) times this close
            market_cap = float(known["shares"]) * float(price["price"])
        insider_rows = inputs["insiders"].get(symbol) or []
        stocks[symbol] = {
            "model": model,
            "group": ce.peer_group(model, row.get("sector"), fund.sic),
            "size": market_cap,
            "raw": cf.raw_factors(price, known, market_cap=market_cap, day=day),
            "insider_buyers": cluster_buyers(insider_rows, day) if insider_rows else 0,
            "price": price,
            "fund": known,
            "row": row,
            "sector": row.get("sector") or None,
        }

    families = ce.family_scores(stocks, params)
    eligible = [symbol for symbol in stocks if ce.has_enough_families(families[symbol], params)]
    for symbol in stocks:
        if symbol not in eligible:
            skipped[symbol] = _unscored_reason(stocks[symbol], families[symbol], day, params)
    if len(eligible) < MIN_UNIVERSE:
        raise ValueError(f"only {len(eligible)} stocks could be scored; a peer ranking needs at least {MIN_UNIVERSE}")

    calls: dict[str, dict[str, Any]] = {}
    records: dict[str, dict[str, Any]] = {}
    for symbol in eligible:
        stock = stocks[symbol]
        call = ce.build_call(
            day=day,
            model=stock["model"],
            group=stock["group"],
            families=families[symbol],
            price=stock["price"],
            universe_size=len(eligible),
            previous=inputs["states"].get(symbol),
            analyst_target=stock["row"].get("target"),
            params=params,
        )
        call["symbol"] = symbol
        call["sector"] = stock["sector"]
        call["close"] = stock["price"]["price"]
        calls[symbol] = call
        records[symbol] = {
            "symbol": symbol,
            "day": day,
            "engine_version": ce.ENGINE_VERSION,
            "sector": stock["sector"],
            "model": stock["model"],
            "peer_group": stock["group"],
            "close": call["close"],
            "sma_200": call["trend"]["sma_200"],
            "market_cap": stock["size"],
            "call": call["call"],
            "since": call["since"],
            "votes": call["votes"],
            "trend_up": call["trend"]["up"],
            "families": {
                name: {key: entry.get(key) for key in ("status", "percentile", "vote", "members", "buyers_90d") if key in entry}
                for name, entry in families[symbol].items()
            },
            # every raw input, not only the ones in a family, so a later
            # check can re-score from stored, dated values
            "raw_factors": {name: round(value, 6) for name, value in stock["raw"].items()},
            "insider_buyers_90d": stock["insider_buyers"],
            "fundamentals_filed": (stock["fund"] or {}).get("filed"),
            "fundamentals_period_end": (stock["fund"] or {}).get("period_end"),
            "zones": call["zones"],
            "changed": call["changed"],
            "trigger": (call["change"] or {}).get("trigger") if call["changed"] else None,
            "reason": (call["change"] or {}).get("reason") if call["changed"] else None,
            "confidence": call["confidence"]["label"],
            "universe_size": len(eligible),
        }
    return {"day": day, "calls": calls, "records": records, "scored": len(eligible), "candidates": len(stocks), "skipped": skipped}


def write(store: Any, result: dict[str, Any]) -> dict[str, int]:
    now = datetime.now(timezone.utc).isoformat()
    states = [(f"{STATE_COLLECTION}/{symbol.replace('/', '-')}", {**call, "updated_at": now}) for symbol, call in result["calls"].items()]
    daily = [(f"{DAILY_COLLECTION}/{symbol.replace('/', '-')}__{result['day']}", {**record, "written_at": now}) for symbol, record in result["records"].items()]
    return {"state": store.set_many(states), "daily": store.set_many(daily)}


def summary(result: dict[str, Any]) -> str:
    counts: dict[str, int] = {}
    changed = 0
    for call in result["calls"].values():
        counts[call["call"]] = counts.get(call["call"], 0) + 1
        changed += 1 if call["changed"] else 0
    return f"{result['day']}: scored {result['scored']} of {result['candidates']} stocks; calls {dict(sorted(counts.items()))}; {changed} changed today"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data-dir", help="read the local research cache instead of the document store (never writes)")
    parser.add_argument("--write", action="store_true", help=f"store the calls in {STATE_COLLECTION} and {DAILY_COLLECTION}")
    parser.add_argument("--symbols", help="print these tickers' calls")
    args = parser.parse_args()

    store = None
    if args.data_dir:
        inputs = load_from_dir(Path(args.data_dir))
    else:
        from .store import DocStore

        store = DocStore.from_env()
        inputs = load_from_store(store)
    result = score_universe(inputs)
    print(summary(result))
    for symbol in [item.strip().upper() for item in (args.symbols or "").split(",") if item.strip()]:
        call = result["calls"].get(symbol)
        if call:
            print(json.dumps({key: call[key] for key in ("symbol", "call", "since", "votes", "trend", "zones", "review_on")}, indent=1))
            for row in call["families"]:
                print(f"  {row['text']}")
        else:
            print(f"{symbol}: not scored: {result['skipped'].get(symbol, 'no SEC fundamentals document for it.')}")
    if args.write and store is not None:
        print(f"wrote {write(store, result)}")
    elif args.write:
        print("--data-dir is read-only: nothing written")


if __name__ == "__main__":
    main()
