"""Banks and brokers named in a headline as the analyst, not as the subject.

"JPMorgan says Strategy could face $2.8 billion of forced selling", "Meta wins JPMorgan
backing" and "JPMorgan cut its IREN target" are stories about Strategy, Meta and IREN. A
ticker match on the firm's name attaches them to JPM's stock page, where they read as news
about JPMorgan. ``firm_is_subject`` is the one rule for every bank and broker that publishes
research: the story counts for the firm unless the headline only quotes it as the analyst.

Two kinds of quote. A rating or a pick ("upgrades Nvidia", "names its top pick", "Meta wins
JPMorgan backing") is always about the stock rated. A view ("JPMorgan says...", "UBS sees...",
"Goldman lifts its outlook") is about the bank itself unless the headline also names another
company or is a market call (stocks, rates, oil, bitcoin...): "JPMorgan says third-quarter
profit rose" stays on JPM's page.

Used by the headline feed (``news_feed.py``) and the per-stock brief pipeline
(``backend/stock_intelligence.py``), and mirrored for stored rows in ``lib/analyst-firms.ts``.
Keep the two in step. Standard library only.
"""

from __future__ import annotations

import re
from typing import Iterable

BROKERS = {"JEF", "MS", "GS", "JPM", "C", "BAC", "WFC", "EVR", "HLI", "UBS", "BLK", "RJF", "SF", "PIPR", "BCS", "DB"}
# The names a headline uses for each firm, besides whatever the universe lists.
BROKER_NAMES: dict[str, tuple[str, ...]] = {
    "JPM": ("JPMorgan Chase", "JPMorgan", "J.P. Morgan", "JP Morgan"),
    "GS": ("Goldman Sachs", "Goldman"),
    "MS": ("Morgan Stanley",),
    "C": ("Citigroup", "Citi"),
    "BAC": ("Bank of America", "BofA"),
    "WFC": ("Wells Fargo",),
    "JEF": ("Jefferies",),
    "EVR": ("Evercore",),
    "HLI": ("Houlihan Lokey",),
    "UBS": ("UBS",),
    "BLK": ("BlackRock",),
    "RJF": ("Raymond James",),
    "SF": ("Stifel",),
    "PIPR": ("Piper Sandler",),
    "BCS": ("Barclays",),
    "DB": ("Deutsche Bank",),
}

_MOODS = r"(?:wary|cautious|bullish|bearish|positive|negative|optimistic|pessimistic|skeptical|constructive)"
# "JPMorgan", "Morgan Stanley's Mike Wilson", "Evercore ISI", "Citigroup CEO": who is speaking, before the verb.
_SPEAKER = r"^(?:['’]s)?(?:\s+(?:CEO|chief|ISI|Securities|Research|[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)){0,2}(?:\s+(?i:just|now|also|again|still))?\s+"

# A rating, a pick or a stance on other stocks: never news about the firm.
_RATING_AFTER = re.compile(
    _SPEAKER
    # "Jefferies says likes the Cohu setup"
    + r"(?:(?i:says)\s+)?"
    + r"(?i:upgrades|upgraded(?!\s+(?:to|at|by)\b)|downgrades|downgraded(?!\s+(?:to|at|by)\b)|initiates|initiated|reiterates|reiterated|"
    r"reaffirms|reaffirmed|likes|sends|names|named|picks|picked|backs|prefers|recommends|defends|defended|plays\s+down|spots|weighs\s+in|"
    r"calls|(?:backs|backed)\s+away|sours|soured|warms|warmed|"
    + _MOODS.join((r"(?:is|remains|stays|turns|turned|grows?|grew|gets|got)\s+", r"\s+(?:on|about|toward)\b"))
    + r"|"
    # "lifts its target", "cut its IREN target", "resets Eli Lilly stock target"
    r"(?:lifts|lifted|raises|raised|cuts|cut|lowers|lowered|trims|trimmed|boosts|boosted|hikes|hiked|slashes|slashed|resets|reset|sets|"
    r"maintains|maintained|keeps|kept)\s+(?:\S+\s+){0,3}?(?:price\s+)?(?:targets?|ratings?|PTs?|recommendation)\b|"
    # "just added Meta Platforms to its focus list", "drops Nvidia from elite stock list"
    r"(?:adds|added|removes|removed|drops|dropped|cuts|cut|pulls|pulled|kicks|kicked)\b.{0,60}?\b(?:to|from|off)\s+(?:its\s+|the\s+|their\s+)?.{0,40}?\b(?:list|picks?)|"
    r"drops?\s+(?:its\s+)?\S+\s+(?:stance|call|view|rating))"
    r"(?![A-Za-z])"
)
# A named analyst or research arm speaking: "Morgan Stanley's Mike Wilson sees...", "BofA strategists see...".
_ANALYST_SPEAKS = re.compile(
    r"^(?:['’]s)?\s+(?:(?i:analysts?|strategists?|economists?)|ISI|Research|Global\s+Research)\b"
    r"|^['’]s\s+[A-Z][a-z]+\s+[A-Z][\w'’-]+(?:\s*:|\s+(?i:says|said|sees|saw|expects|warns|predicts|thinks|believes|makes|calls|likes|is)\b)"
)
# A view the firm gives: about itself unless the headline also names another company or calls the market.
_VIEW_AFTER = re.compile(
    _SPEAKER
    + r"(?i:says|said|sees|saw|expects|warns|predicts|thinks|believes|forecasts|projects|estimates|argues|tells|highlights|flags|"
    r"turns|offers|issues|shares|makes|"
    + _MOODS.join((r"(?:is|remains|stays|turns|turned|grows?|grew|gets|got)\s+", ""))
    + r"|(?:lifts|lifted|raises|raised|cuts|cut|lowers|lowered|trims|trimmed|boosts|boosted|hikes|hiked|slashes|slashed)\s+(?:\S+\s+){0,3}?"
    r"(?:estimates?|forecasts?|outlook|views?|expectations|odds|probability)\b)"
    r"(?![A-Za-z])"
)
# "..., Jefferies says": an attribution closing the headline.
_TRAILING_ATTRIBUTION = re.compile(r"^\s*(?i:says|said|argues|warns|notes|writes|thinks|believes|predicts)\s*[.?!]?\s*$")
# "Meta Wins JPMorgan Backing", "after Jefferies upgrade", "Bank of America's JFrog call", "Goldman Sachs on IREN".
_RATING_NOUN_AFTER = re.compile(
    r"^(?:['’]s)?\s+(?i:backing|nod|endorsement|upgrade|downgrade|coverage|top\s+picks?|focus\s+list|"
    r"(?:bullish|bearish|cautious)\s+(?:case|view|call|stance|take))(?![A-Za-z])"
    r"|^['’]s\s+(?:[A-Z][\w.&-]*\s+){1,2}(?i:call|target|upgrade|downgrade|rating|pick|thesis)(?![A-Za-z])"
    r"|^\s+on\s+[A-Z]"
)
_OPINION_BEFORE = re.compile(
    r"(?:\b(?:as|per|from|by|says|said|warns|notes|argues|cautions|finds|found|according\s+to|wins|win|won|gets|got|earns|earned|"
    r"receives|received|lands|landed|draws|scores)\s+)$",
    re.IGNORECASE,
)
# "Jamie Dimon says JPMorgan will hire...": the firm starts its own clause, so a "says" before it is someone talking about it.
_CLAUSE_AFTER = re.compile(
    r"^(?:['’]s)?\s+(?:will|would|is|was|has|had|plans?|to|expects?|reports?|posts?|posted|hires?|cuts?|raises?|beats?|misses|sees)\b",
    re.IGNORECASE,
)
# "JPMorgan says Strategy could face...": a view whose subject is another, capitalised name is about that company.
_OTHER_AFTER_VIEW = re.compile(
    r"^\s+(?:says|said|sees|saw|expects|warns|thinks|believes|predicts)\s+"
    r"(?!(?:It|Its|The|This|That|They|There|Profit|Revenue|Earnings|Results|Shares|Stock|Fed|Federal|Treasury|SEC|FDIC|OCC|CFPB|FINRA|Regulators?|Government|Congress|Senate|Court|Judge)\b)[A-Z][a-z]"
)
# The firm as the subject: its own symbol, its stock, its results, or a rating on it ("JPMorgan (JPM) price target raised",
# "Citigroup gets upgrade from KBW").
_SUBJECT_AFTER = re.compile(
    r"^(?:['’]s)?(?:\s*\((?:[A-Za-z]+\s*:\s*)?[A-Z.]{1,6}\))?\s+(?i:stock|shares(?!\s+(?:a|an|its|the|their|his|her)\b)|earnings|results|profit|revenue|Q[1-4]\b|"
    r"price\s+target|(?:is\s+|gets\s+)?(?:upgraded|downgraded)\s+(?:to|at|by)\b|(?:gets|wins|earns|receives)\s+(?:an?\s+)?(?:upgrade|downgrade|price\s+target))"
)
# "Baird upgrades JPMorgan Chase", "Analysts upgrade JPMorgan": a rating on the firm.
_RATED_BEFORE = re.compile(
    r"\b(?:upgrades?|upgraded|downgrades?|downgraded|initiates?(?:\s+coverage\s+(?:on|of))?|initiated(?:\s+coverage\s+(?:on|of))?|"
    r"(?:raises|lifts|cuts|lowers|trims)\s+(?:its\s+)?(?:price\s+)?target\s+on)\s+$",
    re.IGNORECASE,
)
# A headline built around a rating or a pick is about the stock being rated, whoever else it names.
_ANALYST_VOCAB = re.compile(
    r"\b(?:price\s+targets?|stock\s+target|target\s+price|upgrades?|upgraded|downgrades?|downgraded|top\s+picks?|favou?rite\s+picks|"
    r"focus\s+list|stock\s+list|overweight|underweight|outperform|underperform|equal[-\s]weight|buy\s+rating|sell\s+rating|"
    r"bullish\s+case|bearish\s+case|screaming\s+buy|advice\s+for|buy['\"‘’“”]?\s+rating|prediction|verdict|opinion|stark\s+take|weighs\s+in|"
    r"give\s+up\s+on|bets\s+on\s+[\d$]|back(?:s|ed)\s+away\s+from|(?:bold|big)\s+(?:[\w&$.,-]+\s+){0,3}call)"
    # Companies presenting at a bank's conference: the bank is the host, not the story.
    r"|\b(?:present|presents|presenting|participate|participates|participation|participating|fireside)\b.{0,120}\b(?:conferences?|summit|symposium|forum)\b",
    re.IGNORECASE,
)
# A market call: the view is about the market, not the bank.
_MARKET_CALL = re.compile(
    r"S&P|\bNasdaq\b|\bDow\b|\bstocks?\b|\bmarkets?\b|\bequit(?:y|ies)\b|\brates?\b|\byields?\b|\btreasur|\bbonds?\b|\binflation\b|"
    r"\brecession\b|\beconom|\beconomy\b|\bGDP\b|\boil\b|\bgold\b|\bbitcoin\b|\bcrypto\b|\bdollar\b|\byen\b|\beuro\b|\bcurrenc|\btariffs?\b|"
    r"\bbubble\b|\bcorrection\b|\bsell-?off\b|\brally\b|\bsectors?\b|\bindustrials\b|\bchipmakers?\b|\bconsumers?\b|\bhousing\b|\bBank\s+of\s+(?:Canada|England|Japan)\b",
    re.IGNORECASE,
)
# Benzinga closes a headline with the companies it tagged: "... After Hours - Broadcom (NASDAQ:AVGO), JPMorgan Chase (NYSE:JPM) - Benzinga".
_TAG_TAIL = re.compile(r"\s+[-–—]\s+[^-–—]*\((?:NASDAQ|Nasdaq|NYSE|AMEX|OTC)[^)]*\).*$")
# "Zoetis to Participate in the Jefferies Global Healthcare Conference": the firm hosts.
_CONFERENCE_AFTER = re.compile(r"^(?:\s+[A-Z0-9][\w&.-]*){0,4}\s+(?:Conference|Summit|Symposium|Forum)\b")


def _headline_only(title: str) -> str:
    """The headline without a publisher's trailing list of tagged companies."""
    return _TAG_TAIL.sub("", title).strip()


def _rating_mention(headline: str, start: int, end: int) -> bool:
    """The name at ``headline[start:end]`` gives a rating, a pick or a stance on other stocks, or hosts their conference."""
    after = headline[end:]
    return bool(
        _RATING_AFTER.match(after)
        or _RATING_NOUN_AFTER.match(after)
        or _ANALYST_SPEAKS.match(after)
        or _TRAILING_ATTRIBUTION.match(after)
        or (_OPINION_BEFORE.search(headline[:start]) is not None and not _CLAUSE_AFTER.match(after))
        or _CONFERENCE_AFTER.match(after)
    )


def _firm_pattern(symbol: str, extra_names: Iterable[str]) -> re.Pattern[str] | None:
    names = sorted({*BROKER_NAMES.get(symbol, ()), *(name for name in extra_names if name)}, key=len, reverse=True)
    alternatives = [re.escape(name) for name in names]
    if len(symbol) >= 3:
        alternatives.append(re.escape(symbol))
    if not alternatives:
        return None
    return re.compile(r"(?<![A-Za-z0-9$])(?:" + "|".join(alternatives) + r")(?![A-Za-z0-9])")


def firm_is_subject(ticker: str, title: str, extra_names: Iterable[str] = (), *, others: bool = False) -> bool:
    """For a bank or broker, whether the story is about the firm itself rather than quoting it as the analyst.

    ``others`` says the headline also names another covered company, so a view the firm gives
    ("JPMorgan says Strategy could face...") is about that company. A headline that does not
    name the firm at all is left to whoever tagged it, unless the firm only turns up in a
    publisher's trailing tag list. Any other stock passes unchanged.
    """
    symbol = ticker.upper()
    if symbol not in BROKERS:
        return True
    pattern = _firm_pattern(symbol, extra_names)
    if pattern is None:
        return True
    headline = _headline_only(title)
    hits = list(pattern.finditer(headline))
    if not hits:
        # Named only in Benzinga's tag list after the headline: incidental.
        return pattern.search(title) is None
    rated = _ANALYST_VOCAB.search(headline) is not None
    about_others = others or rated or _MARKET_CALL.search(headline) is not None
    for hit in hits:
        after = headline[hit.end() :]
        if _SUBJECT_AFTER.match(after) or _RATED_BEFORE.search(headline[: hit.start()]):
            return True
        if _rating_mention(headline, hit.start(), hit.end()):
            continue
        if _VIEW_AFTER.match(after):
            if about_others or _OTHER_AFTER_VIEW.match(after):
                continue
            return True
        if rated:
            continue
        return True
    return False
