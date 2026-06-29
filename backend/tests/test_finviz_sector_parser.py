from __future__ import annotations

import re
import unittest

from backend.fundamentals_scraper import parse_finviz_quote
from backend.sector_slugs import finviz_slug_from_label, resolve_sector_fields


class FinvizSectorParserTests(unittest.TestCase):
    def test_parses_quote_header_category_markup(self) -> None:
        html = """
        <a href="screener?v=111&f=sec_technology" class="quote-header_category">Technology</a>
        <a href="screener?v=111&f=ind_consumerelectronics" class="quote-header_category" title="Consumer Electronics"><span>Consumer Electronics</span></a>
        """
        quote = parse_finviz_quote(html, "AAPL")
        self.assertEqual(quote.sector_slug, "technology")
        self.assertEqual(quote.sector_label, "Technology")
        self.assertEqual(quote.industry_slug, "consumerelectronics")
        self.assertEqual(quote.industry_label, "Consumer Electronics")

    def test_parses_legacy_tab_link_markup(self) -> None:
        html = '<a href="quote.ashx?t=MSFT&f=sec_technology" class="tab-link">Technology</a>'
        quote = parse_finviz_quote(html, "MSFT")
        self.assertEqual(quote.sector_slug, "technology")
        self.assertEqual(quote.sector_label, "Technology")


class SectorSlugResolutionTests(unittest.TestCase):
    def test_maps_consumer_discretionary_to_finviz_slug(self) -> None:
        self.assertEqual(finviz_slug_from_label("Consumer Discretionary"), "consumercyclical")

    def test_falls_back_to_instrument_sector(self) -> None:
        slug, label = resolve_sector_fields(
            sector_slug="",
            sector_label="",
            instrument_sector="Technology",
        )
        self.assertEqual(slug, "technology")
        self.assertEqual(label, "Technology")


if __name__ == "__main__":
    unittest.main()
