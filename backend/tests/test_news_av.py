from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from backend.news_av import fetch_av_news_batch, fetch_av_news_for_tickers


class AlphaVantageNewsTests(unittest.TestCase):
    @patch("backend.news_av.requests.get")
    def test_market_wide_request_omits_provider_ticker_filter(self, get: MagicMock) -> None:
        response = MagicMock()
        response.json.return_value = {"feed": []}
        get.return_value = response

        fetch_av_news_batch([], api_key="test-key", limit=1000, time_from="20260721T0100")

        params = get.call_args.kwargs["params"]
        self.assertNotIn("tickers", params)
        self.assertEqual(params["time_from"], "20260721T0100")
        self.assertEqual(params["limit"], "1000")
        self.assertEqual(params["sort"], "LATEST")

    @patch("backend.news_av.fetch_av_news_batch")
    def test_ticker_list_is_filtered_locally_from_one_market_request(self, fetch: MagicMock) -> None:
        fetch.return_value = [
            {
                "url": "https://example.com/apple",
                "title": "Apple update",
                "summary": "Apple news.",
                "time_published": "20260721T090000",
                "source": "Example",
                "overall_sentiment_score": 0.1,
                "overall_sentiment_label": "Neutral",
                "ticker_sentiment": [
                    {
                        "ticker": "AAPL",
                        "relevance_score": "0.9",
                        "ticker_sentiment_score": "0.1",
                        "ticker_sentiment_label": "Neutral",
                    }
                ],
            }
        ]

        articles = fetch_av_news_for_tickers(["AAPL", "MSFT"], lookback_hours=12)

        self.assertEqual(len(articles), 1)
        self.assertEqual(articles[0].focus_ticker, "AAPL")
        fetch.assert_called_once()
        self.assertEqual(fetch.call_args.args[0], [])
        self.assertEqual(fetch.call_args.kwargs["limit"], 1000)
        self.assertIn("time_from", fetch.call_args.kwargs)


if __name__ == "__main__":
    unittest.main()
