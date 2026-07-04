import os
import unittest
from unittest.mock import patch

from backend import url_extractor


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


class UrlExtractorTest(unittest.TestCase):
    def test_extract_urls_uses_firecrawl_batch_results(self) -> None:
        calls: list[str] = []

        def fake_post(url, **_kwargs):
            calls.append(url)
            return FakeResponse({"success": True, "url": "http://firecrawl/batch/1"})

        def fake_get(url, **_kwargs):
            calls.append(url)
            body = " ".join(["word"] * 80)
            return FakeResponse(
                {
                    "status": "completed",
                    "data": [
                        {
                            "markdown": body,
                            "metadata": {"title": "A real article", "description": "Summary"},
                        }
                    ],
                }
            )

        with patch.dict(os.environ, {"EXTRACT_PROVIDER": "auto"}, clear=True):
            with patch.object(url_extractor.requests, "post", fake_post), patch.object(url_extractor.requests, "get", fake_get):
                rows = url_extractor.extract_urls(["https://example.com/a"])

        self.assertEqual(rows[0].status, "ok")
        self.assertEqual(rows[0].provider, "firecrawl")
        self.assertEqual(rows[0].title, "A real article")
        self.assertEqual(calls, ["http://127.0.0.1:3002/v1/batch/scrape", "http://firecrawl/batch/1"])

    def test_extract_urls_falls_back_when_firecrawl_batch_is_short(self) -> None:
        def fake_post(_url, **_kwargs):
            return FakeResponse({"success": True, "url": "http://firecrawl/batch/1"})

        def fake_get(_url, **_kwargs):
            return FakeResponse({"status": "completed", "data": [{"markdown": "too short", "metadata": {"title": "Short"}}]})

        def fake_trafilatura(url):
            return url_extractor.ExtractedArticle(
                url=url,
                title="Fallback",
                body_text=" ".join(["fallback"] * 80),
                summary="Fallback summary",
                published_at="",
                publisher="example.com",
                status="ok",
                word_count=80,
                provider="trafilatura",
                note="ok",
            )

        with patch.dict(os.environ, {"EXTRACT_PROVIDER": "auto"}, clear=True):
            with patch.object(url_extractor.requests, "post", fake_post), patch.object(url_extractor.requests, "get", fake_get):
                with patch.object(url_extractor, "_extract_trafilatura", fake_trafilatura):
                    rows = url_extractor.extract_urls(["https://example.com/a"])

        self.assertEqual(rows[0].status, "ok")
        self.assertEqual(rows[0].provider, "trafilatura")
        self.assertEqual(rows[0].title, "Fallback")

    def test_extract_urls_falls_back_when_firecrawl_returns_consent_page(self) -> None:
        def fake_post(_url, **_kwargs):
            return FakeResponse({"success": True, "url": "http://firecrawl/batch/1"})

        def fake_get(_url, **_kwargs):
            body = "Your privacy choices " + " ".join(["we use cookies"] * 80)
            return FakeResponse({"status": "completed", "data": [{"markdown": body, "metadata": {"title": "Your privacy choices"}}]})

        def fake_trafilatura(url):
            return url_extractor.ExtractedArticle(
                url=url,
                title="Real title",
                body_text=" ".join(["real"] * 80),
                summary="Real summary",
                published_at="",
                publisher="example.com",
                status="ok",
                word_count=80,
                provider="trafilatura",
                note="ok",
            )

        with patch.dict(os.environ, {"EXTRACT_PROVIDER": "auto"}, clear=True):
            with patch.object(url_extractor.requests, "post", fake_post), patch.object(url_extractor.requests, "get", fake_get):
                with patch.object(url_extractor, "_extract_trafilatura", fake_trafilatura):
                    rows = url_extractor.extract_urls(["https://example.com/a"])

        self.assertEqual(rows[0].provider, "trafilatura")
        self.assertEqual(rows[0].title, "Real title")


if __name__ == "__main__":
    unittest.main()
