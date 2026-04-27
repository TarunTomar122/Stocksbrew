"""Backfill historical daily price snapshots for a universe.

Uses the batched `yfinance.download(threads=True)` API to pull ~260 trading
days of OHLCV for the entire universe in one concurrent call, then writes
each instrument's history as a single `tm_latest_prices/{id}` doc with an
embedded `history_window` array.

Cost shape: **one Firestore write per instrument** (not per day). A full
260-ticker backfill is ~260 writes, comfortably inside free-tier quotas.

This history is what `build_stock_technicals` reads to compute SMA 20 / 50
/ 200, RSI, distance from 52w high, etc. Without enough history every
technical field collapses to `insufficient_data`, which in turn zeroes out
the momentum_leaders screen and breaks a few other downstream signals.

Run once per market after expanding the universe:

    python -m backend.scripts.backfill_price_history --market IN --universe in_core_150
    python -m backend.scripts.backfill_price_history --market US --universe us_core_100
"""
from __future__ import annotations

import argparse
import math
from datetime import datetime, timezone
from typing import Any

import pandas as pd
import yfinance as yf

from backend.instrument_universe import list_instruments
from backend.storage import TraceMoneyStore


def _yahoo_symbol(instrument: dict[str, Any]) -> str:
    return instrument["ticker"] + (".NS" if instrument["market"] == "IN" else "")


def _safe(value: Any) -> float | None:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(v) else v


def _build_snapshot(
    instrument: dict[str, Any],
    day_row: dict[str, Any],
    captured_at: datetime,
    previous_close: float | None,
) -> dict[str, Any]:
    current = _safe(day_row.get("Close"))
    prev = previous_close if previous_close is not None else _safe(day_row.get("Open"))
    day_change_abs = None
    day_change_pct = None
    if current is not None and prev not in (None, 0):
        day_change_abs = round(current - prev, 6)
        day_change_pct = round((current - prev) / prev * 100, 6)

    return {
        "instrument_id": instrument["instrument_id"],
        "ticker": instrument["ticker"],
        "market": instrument["market"],
        "captured_at": captured_at.isoformat(),
        "currency": "INR" if instrument["market"] == "IN" else "USD",
        "source": "yfinance-history",
        "session_phase": "historical",
        "quote": {
            "current": current,
            "open": _safe(day_row.get("Open")),
            "high": _safe(day_row.get("High")),
            "low": _safe(day_row.get("Low")),
            "volume": _safe(day_row.get("Volume")),
            "previous_close": prev,
            "day_change_abs": day_change_abs,
            "day_change_pct": day_change_pct,
        },
    }


def _frame_for_symbol(
    data: pd.DataFrame,
    symbol: str,
    single_ticker: bool,
) -> pd.DataFrame | None:
    if data is None or data.empty:
        return None
    if single_ticker:
        return data
    if isinstance(data.columns, pd.MultiIndex):
        if symbol not in data.columns.get_level_values(0):
            return None
        sub = data[symbol]
        sub = sub.dropna(how="all")
        return sub if not sub.empty else None
    return None


def _rows_for_instrument(
    instrument: dict[str, Any],
    frame: pd.DataFrame,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    previous_close: float | None = None
    for idx, row in frame.iterrows():
        close = _safe(row.get("Close"))
        if close is None:
            continue
        if hasattr(idx, "to_pydatetime"):
            ts = idx.to_pydatetime()
        else:
            ts = datetime.fromisoformat(str(idx))
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        rows.append(_build_snapshot(instrument, row.to_dict(), ts, previous_close))
        previous_close = close
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill daily price history via yfinance")
    parser.add_argument("--market", choices=["US", "IN"], default="IN")
    parser.add_argument("--universe", required=True)
    parser.add_argument("--period", default="1y", help="yfinance period (e.g. 6mo, 1y, 2y)")
    parser.add_argument(
        "--chunk-size",
        type=int,
        default=50,
        help="Symbols per yf.download call (yfinance handles threading internally)",
    )
    args = parser.parse_args()

    store = TraceMoneyStore()
    instruments = list_instruments(args.market, args.universe)
    if not instruments:
        raise ValueError(f"No instruments found for {args.market} / {args.universe}")

    print(
        f"Backfilling {len(instruments)} {args.market} tickers "
        f"(period={args.period}, chunk={args.chunk_size})..."
    )

    symbol_to_instrument: dict[str, dict[str, Any]] = {
        _yahoo_symbol(inst): inst for inst in instruments
    }
    all_symbols = list(symbol_to_instrument.keys())

    rows_by_instrument: dict[str, tuple[dict[str, Any], list[dict[str, Any]]]] = {}
    fetch_failures = 0

    for start in range(0, len(all_symbols), args.chunk_size):
        chunk = all_symbols[start : start + args.chunk_size]
        single_ticker = len(chunk) == 1
        print(
            f"  fetch {start + 1}-{start + len(chunk)} of {len(all_symbols)} "
            f"({len(chunk)} symbols)..."
        )
        try:
            data = yf.download(
                tickers=chunk,
                period=args.period,
                interval="1d",
                group_by="ticker",
                auto_adjust=False,
                threads=True,
                progress=False,
            )
        except Exception as exc:
            print(f"    [fail] chunk starting at {chunk[0]}: {exc}")
            fetch_failures += len(chunk)
            continue

        for symbol in chunk:
            instrument = symbol_to_instrument[symbol]
            frame = _frame_for_symbol(data, symbol, single_ticker)
            if frame is None or frame.empty:
                print(f"    [skip] {instrument['ticker']}: no history")
                continue
            rows = _rows_for_instrument(instrument, frame)
            if not rows:
                print(f"    [skip] {instrument['ticker']}: empty after normalize")
                continue
            rows_by_instrument[instrument["instrument_id"]] = (instrument, rows)
            print(f"    [ok] {instrument['ticker']}: {len(rows)} points")

    if not rows_by_instrument:
        print("No rows to write.")
        return

    total_points = sum(len(r) for _, r in rows_by_instrument.values())
    print(
        f"Writing {len(rows_by_instrument)} ticker docs "
        f"({total_points} embedded points total)..."
    )
    for instrument_id, (_, rows) in rows_by_instrument.items():
        store.save_price_history_bulk(instrument_id, rows)

    print(
        f"Done. Wrote {len(rows_by_instrument)} ticker docs "
        f"({fetch_failures} symbols failed to fetch)."
    )


if __name__ == "__main__":
    main()
