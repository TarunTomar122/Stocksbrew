from __future__ import annotations

from copy import deepcopy
import unittest

from backend.scripts.refresh_research_themes import (
    THEME_SLUGS,
    load_seed,
    validate_theme,
)
from backend.watchlist_view import _radar_theme_data


class RefreshResearchThemesTest(unittest.TestCase):
    def setUp(self) -> None:
        self.seed = load_seed()
        self.by_slug = {theme["slug"]: theme for theme in self.seed}
        self.known = {
            candidate["ticker"]
            for theme in self.seed
            for candidate in [*theme["candidates"], *theme.get("watchlist", [])]
        }

    def test_seed_contains_all_runtime_themes_and_valid_candidate_counts(self) -> None:
        self.assertEqual(
            {theme["slug"] for theme in self.seed},
            set(THEME_SLUGS),
        )
        for theme in self.seed:
            normalized, error = validate_theme(
                theme,
                slug=theme["slug"],
                known_tickers=self.known,
                prior_theme=theme,
            )
            self.assertIsNone(error)
            self.assertIsNotNone(normalized)

    def test_rejects_duplicate_and_unknown_tickers(self) -> None:
        theme = deepcopy(self.by_slug["energy"])
        theme["candidates"][1]["ticker"] = theme["candidates"][0]["ticker"]
        _, error = validate_theme(
            theme,
            slug="energy",
            known_tickers=self.known,
            prior_theme=self.by_slug["energy"],
        )
        self.assertIn("duplicate ticker", error or "")

        theme = deepcopy(self.by_slug["energy"])
        theme["candidates"][0]["ticker"] = "FAKE"
        _, error = validate_theme(
            theme,
            slug="energy",
            known_tickers=self.known,
            prior_theme=self.by_slug["energy"],
        )
        self.assertIn("not in the live instrument catalogue", error or "")

    def test_preserves_existing_score_and_label_and_marks_new_names_uncovered(self) -> None:
        theme = deepcopy(self.by_slug["energy"])
        theme["candidates"][0]["stocksbrewLabel"] = "Strong"
        theme["candidates"][0]["stocksbrewScore"] = 99
        theme["candidates"][-1]["ticker"] = "NVDA"
        theme["candidates"][-1]["company"] = "NVIDIA"
        theme["candidates"][-1]["stocksbrewLabel"] = "Strong"
        theme["candidates"][-1].pop("stocksbrewScore", None)
        normalized, error = validate_theme(
            theme,
            slug="energy",
            known_tickers=self.known,
            prior_theme=self.by_slug["energy"],
        )
        self.assertIsNone(error)
        self.assertIsNotNone(normalized)
        assert normalized is not None
        by_ticker = {row["ticker"]: row for row in normalized["candidates"]}
        self.assertEqual(by_ticker["CEG"]["stocksbrewLabel"], self.by_slug["energy"]["candidates"][0]["stocksbrewLabel"])
        self.assertEqual(by_ticker["CEG"]["stocksbrewScore"], self.by_slug["energy"]["candidates"][0]["stocksbrewScore"])
        self.assertEqual(by_ticker["NVDA"]["stocksbrewLabel"], "Not covered")
        self.assertNotIn("stocksbrewScore", by_ticker["NVDA"])

    def test_radar_uses_live_themes_and_keeps_the_seed_as_its_fallback(self) -> None:
        class LiveStore:
            def get_research_themes(self) -> dict[str, object]:
                return {
                    "themes": [
                        {
                            "slug": "cybersecurity",
                            "candidates": [
                                {"ticker": "PANW", "stocksbrewScore": 72.5},
                                {"ticker": "CRWD"},
                            ],
                        }
                    ]
                }

        live_universe, live_scores = _radar_theme_data(LiveStore())  # type: ignore[arg-type]
        self.assertEqual(live_universe, {"cybersecurity": ["PANW", "CRWD"]})
        self.assertEqual(live_scores, {"PANW": 72.5})

        class EmptyStore:
            def get_research_themes(self) -> None:
                return None

        fallback_universe, _ = _radar_theme_data(EmptyStore())  # type: ignore[arg-type]
        for theme in self.seed:
            self.assertEqual(
                fallback_universe[theme["slug"]],
                [row["ticker"] for row in theme["candidates"]],
            )


if __name__ == "__main__":
    unittest.main()
