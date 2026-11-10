"""Pure-function tests for the headline tone job (no network, no store, no model)."""

from backend.agentdata import news_tone as nt

ROWS = [
    {"id": "a", "title": "Nvidia CEO faces board probe", "summary": "The board opened an investigation.", "stock_tickers": ["NVDA"]},
    {"id": "b", "title": "Oil falls below $90", "summary": "", "stock_tickers": []},
]


def test_clean_theme():
    assert nt.clean_theme("  nvidia CEO probe. ") == "Nvidia CEO probe"
    assert nt.clean_theme("None") is None
    assert nt.clean_theme("") is None
    assert nt.clean_theme(None) is None
    assert nt.clean_theme("one two three four five six seven eight") == "One two three four five six"


def test_build_prompt_numbers_headlines_and_lists_known_themes():
    prompt = nt.build_prompt(ROWS, ["Oil prices", "", "Anthropic IPO"])
    assert prompt.startswith("Existing themes: Anthropic IPO; Oil prices")
    assert "1. Nvidia CEO faces board probe [tickers: NVDA] | excerpt: The board opened an investigation." in prompt
    assert "2. Oil falls below $90" in prompt
    assert nt.build_prompt(ROWS, []).startswith("Existing themes: (none yet)")


def test_parse_labels_maps_numbers_back_and_drops_junk():
    payload = {
        "items": [
            {"n": 1, "tone": "negative", "scope": "stock", "theme": "Nvidia CEO probe"},
            {"n": 2, "tone": "great", "scope": "market", "theme": None},  # bad tone
            {"n": 9, "tone": "neutral", "scope": "market", "theme": None},  # out of range
            "junk",
        ]
    }
    assert nt.parse_labels(payload, ROWS) == {"a": {"tone": "negative", "scope": "stock", "theme": "Nvidia CEO probe"}}
    assert nt.parse_labels({"items": "nope"}, ROWS) == {}
    assert nt.parse_labels(None, ROWS) == {}


def test_parse_merges_follows_chains_and_drops_cycles():
    counts = {"Nvidia governance concerns": 22, "Nvidia CEO probe": 7, "Crude slide": 2, "A": 1, "B": 1}
    payload = {
        "merges": [
            {"from": "Nvidia governance concerns", "to": "Nvidia CEO probe"},
            {"from": "Crude slide", "to": "Oil slide"},
            {"from": "Oil slide", "to": "Oil prices"},  # not an existing name, so not a source
            {"from": "A", "to": "B"},
            {"from": "B", "to": "A"},
            {"from": "Unknown", "to": "Nvidia CEO probe"},
        ]
    }
    assert nt.parse_merges(payload, counts) == {"Nvidia governance concerns": "Nvidia CEO probe", "Crude slide": "Oil slide"}
    assert nt.parse_merges({}, counts) == {}
