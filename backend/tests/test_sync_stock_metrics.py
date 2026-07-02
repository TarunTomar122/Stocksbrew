from unittest import TestCase

from backend.scripts.sync_stock_metrics import _merge_sparse_us_snapshot


class SyncStockMetricsTests(TestCase):
    def test_sparse_us_snapshot_keeps_previous_rich_metrics(self) -> None:
        previous = {
            "instrument_id": "US_NVDA",
            "metrics": {f"metric_{i}": float(i) for i in range(20)},
            "zacks_meta": {"style_growth": "A"},
        }
        payload = {
            "instrument_id": "US_NVDA",
            "snapshot_date": "2026-07-01",
            "metrics": {"market_cap": 1_000.0},
            "zacks_meta": {"zacks_rank_label": "Strong Buy"},
            "source": "finviz+zacks",
        }

        merged = _merge_sparse_us_snapshot(payload, previous)

        self.assertEqual(merged["metrics"]["metric_19"], 19.0)
        self.assertEqual(merged["metrics"]["market_cap"], 1_000.0)
        self.assertEqual(merged["sparse_source_metric_count"], 1)
