import unittest
from types import SimpleNamespace

from backend.watchlist_view import _instrument_meta_by_id


class WatchlistViewLabelTests(unittest.TestCase):
    def test_instrument_documents_are_joined_by_id_not_response_order(self):
        class FakeCollection:
            def document(self, instrument_id):
                return instrument_id

        class FakeDb:
            def collection(self, _name):
                return FakeCollection()

            def get_all(self, _refs):
                # Firestore may return documents in a different order than requested.
                return [
                    SimpleNamespace(id="US_NOW", exists=True, to_dict=lambda: {"name": "ServiceNow"}),
                    SimpleNamespace(id="US_SMCI", exists=True, to_dict=lambda: {"name": "Super Micro Computer"}),
                ]

        class FakeStore:
            db = FakeDb()

        store = FakeStore()
        ids = ["US_SMCI", "US_NOW"]
        labels = _instrument_meta_by_id(store, ids)

        self.assertEqual(labels["US_SMCI"]["name"], "Super Micro Computer")
        self.assertEqual(labels["US_NOW"]["name"], "ServiceNow")


if __name__ == "__main__":
    unittest.main()
