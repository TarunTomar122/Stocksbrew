import os
import unittest
from dataclasses import dataclass
from unittest.mock import patch

from backend.context_search import (
    DEFAULT_API_URL,
    SOURCE_ID,
    context_search_enabled,
    search_context,
    search_context_articles_for_ticker,
)


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


@dataclass
class FakeExtracted:
    url: str
    title: str
    body_text: str
    summary: str
    published_at: str
    publisher: str
    status: str = "ok"


class ContextSearchTest(unittest.TestCase):
    def test_disabled_without_endpoint(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            self.assertFalse(context_search_enabled())

    def test_enabled_with_key_uses_default_endpoint(self) -> None:
        with patch.dict(os.environ, {"CONTEXT_DEV_API_KEY": "secret"}, clear=True):
            self.assertTrue(context_search_enabled())

    def test_search_parses_common_result_shapes(self) -> None:
        calls = []

        def fake_post(*args, **kwargs):
            calls.append((args, kwargs))
            return FakeResponse(
                {
                    "data": {
                        "results": [
                            {
                                "title": "Rocket Lab wins launch contract",
                                "url": "https://example.com/rklb",
                                "snippet": "Rocket Lab announced a new launch deal.",
                            }
                        ]
                    }
                }
            )

        env = {
            "CONTEXT_DEV_API_KEY": "secret",
        }
        with patch.dict(os.environ, env, clear=True):
            rows = search_context("RKLB news", limit=5, lookback_hours=24, post_func=fake_post)

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].url, "https://example.com/rklb")
        self.assertEqual(rows[0].title, "Rocket Lab wins launch contract")
        self.assertEqual(calls[0][0][0], DEFAULT_API_URL)
        self.assertEqual(calls[0][1]["json"]["numResults"], 10)
        self.assertEqual(calls[0][1]["json"]["freshness"], "last_24_hours")
        self.assertEqual(calls[0][1]["json"]["markdownOptions"], {"enabled": False})

    def test_search_results_become_normal_articles_after_scrape(self) -> None:
        def fake_post(*args, **kwargs):
            return FakeResponse(
                {
                    "results": [
                        {
                            "title": "Rocket Lab wins launch contract",
                            "url": "https://example.com/rklb",
                            "snippet": "Rocket Lab announced a new launch deal.",
                        }
                    ]
                }
            )

        def fake_extract(url):
            return FakeExtracted(
                url=url,
                title="Rocket Lab wins launch contract",
                body_text="Rocket Lab announced a new launch contract worth $50 million.",
                summary="Rocket Lab announced a new launch contract.",
                published_at="2026-06-30T00:00:00+00:00",
                publisher="example.com",
            )

        env = {
            "CONTEXT_DEV_API_KEY": "secret",
            "CONTEXT_API_URL": "https://context.test/search",
        }
        with patch.dict(os.environ, env, clear=True):
            articles, health = search_context_articles_for_ticker(
                {"ticker": "RKLB", "name": "Rocket Lab"},
                market="US",
                post_func=fake_post,
                extract_func=fake_extract,
            )

        self.assertEqual(health["ok"], True)
        self.assertEqual(health["article_count"], 1)
        self.assertEqual(len(articles), 1)
        article = articles[0]
        self.assertEqual(article.source_id, SOURCE_ID)
        self.assertEqual(article.focus_ticker, "RKLB")
        self.assertEqual(article.stock_tickers, ["RKLB"])
        self.assertEqual(article.body_text, "Rocket Lab announced a new launch contract worth $50 million.")


if __name__ == "__main__":
    unittest.main()
