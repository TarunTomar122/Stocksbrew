from __future__ import annotations

import json
from pathlib import Path

from backend.radar_intelligence import Citation, validate_prose

FIXTURES = Path(__file__).parent / "fixtures" / "radar_quality_cases.json"


def test_radar_copy_quality_fixtures() -> None:
    cases = json.loads(FIXTURES.read_text(encoding="utf-8"))
    citation = Citation(
        source="Daily price history",
        title="AAPL RSI",
        url="",
        occurred_at="2026-07-10T12:00:00+00:00",
    )
    for case in cases:
        result = validate_prose(
            case["what_changed"],
            case["why_it_matters"],
            case["next_trigger"],
            (citation,) if case["citations"] else (),
            case["payload"],
        )
        assert result.is_valid is case["valid"], case["name"]
        if case.get("issue"):
            assert case["issue"] in result.issues, case["name"]
