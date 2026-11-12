"""The brief's first sentence must be about the company, not about the news feed.

The stock page leads its "news behind our call" panel with the first sentence of
a stock brief's ``body``. Too many briefs opened by describing the coverage
("Recent coverage highlights...", "JPMorgan's fresh news centers on...",
"Recent company-specific coverage is thin for AA.") instead of saying what
happened to the company.

Two halves live here so the prompt, the doc builder, the repair script and the
tests all share one definition:

- ``FORBIDDEN_BODY_OPENERS`` / ``BODY_LEAD_PROMPT_RULES``: what the brief
  prompts tell the model never to write.
- ``coverage_lead_pattern`` / ``fix_coverage_lead``: a deterministic check on
  the written body. A coverage-only first sentence (no figure in it) is dropped
  when the rest of the body still stands; anything else that opens on the
  coverage is kept as written and flagged for a rewrite. Nothing is reworded and
  no text is invented.

The front end keeps its own narrow read-time clean-up
(components/stock-report/format.ts ``plainBriefLead``) for briefs written
before this check existed.
"""
from __future__ import annotations

import re
from typing import NamedTuple

# Named in the brief prompts (and asserted by tests). Lowercase; the prompt
# quotes them as written here.
FORBIDDEN_BODY_OPENERS: tuple[str, ...] = (
    "recent coverage",
    "coverage highlights",
    "news centers on",
    "headlines suggest",
    "the narrative",
    "sentiment is",
    "coverage is thin",
    "no company-specific development was verified",
    "a single article",
    "the feed",
)

BODY_LEAD_PROMPT_RULES = (
    "BODY FIRST SENTENCE - ABOUT THE COMPANY, NOT THE NEWS:\n"
    "- The stock page prints the first sentence of `body` on its own, as the lead. It must say what happened to "
    "the company, with one concrete fact from the payload: a number, a date, or a named event (an earnings "
    "report, a deal, a launch, a ruling, a rating change, a dividend).\n"
    "- Its subject is the company, its people or the event. Never the news, the coverage, the headlines, the "
    "articles, the feed, the narrative or the sentiment.\n"
    "- Never describe what the coverage, the headlines or the articles say, anywhere in `body`. Forbidden: "
    + ", ".join(f'"{phrase}"' for phrase in FORBIDDEN_BODY_OPENERS)
    + ', "the latest coverage", "today\'s coverage", "news flow", "coverage has gone quiet".\n'
    "- When nothing new has happened, lead with the last real development and its date. A later sentence may "
    'say plainly "nothing newer has been reported".\n'
    "- One idea per sentence, in plain words. No hype.\n"
    "- Examples of the shape (made-up companies and facts; use only the payload's):\n"
    '  BAD: "Northwind Bank\'s fresh news centers on a partnership with an AI lab intended to improve coding."\n'
    '  GOOD: "Northwind Bank signed a partnership with an AI lab on Nov 10 to speed up its coding work."\n'
    '  BAD: "Recent coverage highlights Contoso\'s 5.8% dividend yield."\n'
    '  GOOD: "Contoso pays a 5.8% dividend and has raised it for 18 years in a row."\n'
    '  BAD: "Recent company-specific coverage is thin for Fabrikam."\n'
    '  GOOD: "Fabrikam\'s last report, on Oct 22, showed higher metal prices lifting profit. Nothing newer has '
    'been reported since."\n'
)

# Words that end in a period without ending the sentence.
_ABBREVIATIONS = {
    "u.s", "u.k", "e.u", "inc", "corp", "co", "ltd", "plc", "llc", "vs", "no", "st", "jr", "sr", "dr", "mr",
    "mrs", "ms", "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec", "approx",
    "est", "e.g", "i.e", "etc", "al", "fig", "dept",
}
_SENTENCE_END = re.compile(r"[.!?][\"”’')\]]*\s+(?=[\"“‘'(\[]?[A-Z0-9$])")

_NEWS_NOUN = r"(?:coverage|news(?:\s+flow|\s+coverage)?|newsflow|headlines?|reporting|articles?|media\s+coverage)"
# What may come before that noun when it is the subject: a possessive name ("JPMorgan's", "Lockheed Martin's")
# and up to three plain modifiers ("Recent", "The latest", "Today's only", "fresh"). Nothing with a verb in it, so
# "Shares fell while coverage highlights..." (a fact first) is never read as a coverage lead.
# (?-i:...) keeps the capital letter required even though the patterns below are case-insensitive.
_POSSESSIVE = r"(?:(?-i:[A-Z])[\w.&-]*(?:\s+(?-i:[A-Z])[\w.&-]*){0,3}['’]s?)"
_LEAD_WORD = (
    r"(?:the|this|today['’]s|this\s+week['’]s|recent|recently|fresh|current|latest|new|newer|positive|negative|"
    r"mixed|cautious|bullish|bearish|upbeat|downbeat|favou?rable|only|most|much|more|overall|broader|wider|"
    r"early|initial|continued|ongoing|online|financial|analyst|investor|market|retail|[\w-]+-specific|"
    r"[\w-]+-related)"
)
# "November 4 coverage links...", "A September 21 article highlights...", "October coverage calls..."
_MONTH = r"(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?"
_DATED = rf"(?:(?:a|an)\s+)?(?:{_MONTH}(?:\s+\d{{1,2}})?,?\s+)?"
_LEAD_IN = rf"(?:{_POSSESSIVE}\s+)?{_DATED}(?:{_LEAD_WORD}\s+){{0,3}}"
_COVERAGE_VERBS = (
    r"(?:now\s+|still\s+|also\s+|today\s+|instead\s+)?"
    r"(?:highlights?|highlighted|centers|centres|centred|centered|focuses|focused|is\s+focused|is\s+centered|"
    r"is\s+centred|emphasi[sz]es|points?|pointed|links|frames|argues|describes|combines|identifies|identified|"
    r"reviews|offers|offered|provides|repeats|reiterates|restates|compares|suggests?|suggested|shows|showed|"
    r"notes|mentions|includes|leans|leaned|turned|discusses|flags|cites|covers|concerns|says|said|puts|keeps|"
    r"is\s+dominated|was\s+dominated|is\s+mixed|was\s+mixed|is\s+mostly|is\s+largely|remains\s+focused|"
    r"continues|adds|added|contains|treats|casts|paints|revolves|underscores|reflects|raises|signals|"
    r"increasingly|mainly|mostly|largely|only|is\s+building|builds|reinforces|remains|does\s+not|doesn['’]t|"
    r"calls|frames|weighs|questions|ties|tied|connects|zeroes|asks|has\s+turned|has\s+shifted|has\s+been|"
    r"pointing|highlighting|showing|focusing|centering|centring|suggesting|describing|emphasi[sz]ing|linking|"
    r"framing|offering|citing|cited|flagging|supports|confirms|argues)"
)

_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    # "Recent company-specific coverage is thin for AA.", "Coverage has gone quiet for Jackson Financial: ...",
    # "Current coverage is thin: ...", "Coterra's lack of recent news suggests ..."
    (
        "coverage_is_thin",
        re.compile(
            rf"^{_LEAD_IN}{_NEWS_NOUN}\s+"
            r"(?:for\s+[^,:;]{1,60}?\s+)?(?:otherwise\s+|now\s+|still\s+|largely\s+|mostly\s+)?"
            r"(?:is|was|remains|has\s+(?:otherwise\s+|now\s+|largely\s+|mostly\s+)?gone|has\s+been|has\s+turned|has\s+stayed|stays|"
            r"went|looks|appears|is\s+running)\s+(?:otherwise\s+|very\s+|still\s+|mostly\s+|fairly\s+|relatively\s+|unusually\s+)?"
            r"(?:thin|quiet|light|sparse|limited|muted|scarce|slow|silent|quieter|thinner|lighter)\b"
            rf"|^{_LEAD_IN}lack\s+of\s+(?:recent\s+|fresh\s+|new\s+)?(?:company-specific\s+)?{_NEWS_NOUN}\b",
            re.IGNORECASE,
        ),
    ),
    # "No company-specific development was verified.", "No new company news was found this week."
    (
        "no_development_verified",
        re.compile(
            r"^(?:there\s+(?:is|was|has\s+been)\s+)?no\s+(?:new\s+|fresh\s+|recent\s+|verified\s+)?"
            r"(?:company-specific\s+|[\w-]+-specific\s+|company\s+|business\s+|operating\s+)?(?:[A-Z]{1,5}\s+)?"
            r"(?:development|catalyst|news|update|trigger|event|announcement|coverage|headlines?)s?"
            # "...was verified", "...appeared today", "No new company news." Never "No new development permits".
            r"(?:\s*[.;:,]|\s*$|\s+(?:was|were|has|have|had|is|are|appeared|came|emerged|surfaced|explains|explained|"
            r"today|this\s+week|since|so\s+far|yet)\b)",
            re.IGNORECASE,
        ),
    ),
    # "A single article argues ...", "The only fresh coverage compares ...", "Today's only report concerns ...",
    # "Today's sole article ..."
    (
        "single_article",
        re.compile(
            r"^(?:a\s+single|the\s+only|today['’]s\s+only|today['’]s\s+sole|the\s+sole|one|only\s+one)\s+"
            r"(?:fresh\s+|new\s+|recent\s+|relevant\s+|[\w-]+-related\s+)?"
            r"(?:article|report|story|item|piece|source|headline|coverage|mention)s?"
            # "A single article argues...", "One article dated September 21 discusses...", "The only recent
            # coverage, published November 2, simply confirms...". Never "One report from the FDA cleared...".
            rf"(?:,[^,]{{1,40}},|\s+dated\s+[\w ,]{{1,24}}?)?\s+(?:simply\s+|merely\s+|just\s+)?{_COVERAGE_VERBS}\b",
            re.IGNORECASE,
        ),
    ),
    # "JPMorgan's fresh news centers on ...", "Apple's current coverage centers on ..."
    (
        "news_centers_on",
        re.compile(
            rf"^{_LEAD_IN}{_NEWS_NOUN}\s+(?:centers|centres|centred|centered|is\s+centered|is\s+centred|"
            r"focuses|is\s+focused|remains\s+focused|revolves)\b",
            re.IGNORECASE,
        ),
    ),
    # "Headlines suggest ...", "Recent headlines point to ..."
    (
        "headlines_suggest",
        re.compile(rf"^{_LEAD_IN}headlines?\s+{_COVERAGE_VERBS}\b", re.IGNORECASE),
    ),
    # "Recent coverage highlights ...", "Fresh coverage is focused on ...", "The latest coverage offers ...",
    # "Recent coverage argues ...", "Recent coverage only reviews ..."
    (
        "coverage_highlights",
        re.compile(rf"^{_LEAD_IN}{_NEWS_NOUN}\s+{_COVERAGE_VERBS}\b", re.IGNORECASE),
    ),
    # "The narrative around Tesla has shifted ...", "Market narrative ..."
    (
        "the_narrative",
        re.compile(rf"^{_LEAD_IN}narrative\b", re.IGNORECASE),
    ),
    # "Sentiment is mixed ...", "Investor sentiment remains ...", "Analyst sentiment toward Nike has turned ..."
    (
        "sentiment_is",
        re.compile(
            rf"^{_LEAD_IN}sentiment\s+(?:is|was|remains|has|toward|towards|around|on|for|stays|turned)\b",
            re.IGNORECASE,
        ),
    ),
    # "The feed covers official press releases for over 10,000 US-listed stocks."
    ("the_feed", re.compile(rf"^(?:the|this|our)\s+(?:news\s+)?feed\s+{_COVERAGE_VERBS}\b", re.IGNORECASE)),
    # "Gallagher is the subject of the article.", "Dollar Tree is included in the article's review of Q2 earnings."
    (
        "about_the_article",
        re.compile(
            r"^[^,;:]{1,80}?\s+(?:is|are|was|were)\s+(?:the\s+subject\s+of|included\s+in|mentioned\s+in|featured\s+in|"
            r"named\s+in|listed\s+in|discussed\s+in|covered\s+in)\s+(?:the|an?|one|today['’]s)\s+"
            r"(?:\w+['’]s?\s+)?(?:article|report|story|coverage|piece|roundup)",
            re.IGNORECASE,
        ),
    ),
)

# The first sentence opens on a fact and then turns to the coverage: "Analysts remain bullish on Nvidia's long-term
# value, while coverage highlights its sharp discount from prior highs." The opening clause may be the only fact in
# the brief, so this is never dropped, only flagged.
COVERAGE_MID_SENTENCE = "coverage_mid_sentence"
_MID_SENTENCE = re.compile(
    rf"(?:,|;|\bwhile|\band|\bbut|\bas|\bwith|\bwhereas|\balthough)\s+(?:[\w’'-]+\s+){{0,3}}?{_NEWS_NOUN}\s+"
    rf"{_COVERAGE_VERBS}\b",
    re.IGNORECASE,
)
# "The narrative shifted after the FDA approved the drug." and "Investor sentiment improved after the upgrade."
# open on the story told about the company but can carry the event itself, so they are flagged, never dropped.
_FLAG_ONLY = {COVERAGE_MID_SENTENCE, "the_narrative", "sentiment_is"}

# A sentence that only talks about the news without saying anything happened ("...rather than treating stale
# headlines as a fresh catalyst.") never stands as a lead on its own either.
_STALE_HEADLINES = re.compile(r"\bstale\s+headlines\b|\brather\s+than\s+(?:report|treating)\b", re.IGNORECASE)

# The words a coverage-describing sentence needs before it can count as one (so "No debt matures before 2028"
# and "One plant restarted on Monday" are never touched).
_ABOUT_NEWS = re.compile(
    r"\b(?:coverage|news|headlines?|articles?|reporting|stories|story|reports?|feed|narrative|sentiment|"
    r"items?|mentions?|development|catalyst|trigger)\b",
    re.IGNORECASE,
)

# A sentence with a figure or a date in it carries a fact of its own; it is flagged, never dropped.
_HAS_FIGURE = re.compile(r"\d")

# What is left after a drop must still read as a brief: at least one whole sentence of this many words.
MIN_REST_WORDS = 8


def split_sentences(text: str) -> list[str]:
    """Whole sentences of ``text``, without splitting on "U.S.", "Inc.", "$1.50" or "Nov. 17"."""
    clean = " ".join(str(text or "").split())
    if not clean:
        return []
    out: list[str] = []
    start = 0
    for match in _SENTENCE_END.finditer(clean):
        end = match.start() + 1
        word = re.findall(r"[\w.]+$", clean[start:end - 1])
        token = (word[-1] if word else "").lower().rstrip(".")
        # "J. P. Morgan", "U.S." and the abbreviations above.
        if token in _ABBREVIATIONS or (len(token) == 1 and token.isalpha()):
            continue
        sentence = clean[start:match.end()].strip()
        if sentence:
            out.append(sentence)
        start = match.end()
    tail = clean[start:].strip()
    if tail:
        out.append(tail)
    return out


def coverage_lead_pattern(sentence: str) -> str | None:
    """The forbidden opener ``sentence`` starts with, or None when it is about the company."""
    text = " ".join(str(sentence or "").split()).lstrip("\"“‘'(")
    if not text:
        return None
    if not _ABOUT_NEWS.search(text):
        return None
    for name, pattern in _PATTERNS:
        if pattern.search(text):
            return name
    if _STALE_HEADLINES.search(text):
        return "stale_headlines"
    if _MID_SENTENCE.search(text):
        return COVERAGE_MID_SENTENCE
    return None


# A sentence that leans on the one before it ("However, ...", "It also ...") or tells the reader what to do
# ("Use the current fundamentals...", "Watch the next report") cannot lead once the opener is gone.
_CANNOT_LEAD = re.compile(
    r"^(?:however|but|yet|and|also|still|meanwhile|instead|even\s+so|otherwise|that|this|these|those|such|it|its|"
    r"they|their|both|neither|in\s+addition|additionally|separately|further|furthermore|use|watch|consider|"
    r"monitor|keep|look|wait|expect|note|investors\s+should)\b",
    re.IGNORECASE,
)


def _stands(sentences: list[str]) -> bool:
    if not sentences:
        return False
    if coverage_lead_pattern(sentences[0]) or _CANNOT_LEAD.search(sentences[0]):
        return False
    words = len(" ".join(sentences).split())
    return words >= MIN_REST_WORDS and sentences[-1][-1:] in ".!?\"”’)"


class LeadFix(NamedTuple):
    body: str
    # The forbidden opener the kept body still starts with ("" when the lead is about the company).
    issue: str
    # Sentences removed from the front, kept so nothing the model wrote is lost.
    dropped: tuple[str, ...]


def fix_coverage_lead(body: str) -> LeadFix:
    """The body with a coverage-only first sentence removed when the rest stands.

    - The first sentence is about the company: the body comes back unchanged.
    - It only describes the coverage (no figure in it) and what follows is a whole brief that opens on the
      company: that sentence is dropped (up to two such sentences) and listed in ``dropped``.
    - Otherwise (it carries a figure, it opens on a fact and then turns to the coverage, or nothing would be left
      that stands): the body is kept exactly as written and ``issue`` names the opener, so the brief can be
      queued for a rewrite.
    """
    original = str(body or "").strip()
    sentences = split_sentences(original)
    first_issue = coverage_lead_pattern(sentences[0]) if sentences else None
    if not first_issue:
        return LeadFix(original, "", ())
    if first_issue in _FLAG_ONLY:
        return LeadFix(original, first_issue, ())
    rest = list(sentences)
    for _ in range(2):
        lead = coverage_lead_pattern(rest[0]) if rest else None
        if not lead or lead in _FLAG_ONLY or _HAS_FIGURE.search(rest[0]):
            break
        rest = rest[1:]
        if _stands(rest):
            return LeadFix(" ".join(rest), "", tuple(sentences[: len(sentences) - len(rest)]))
    return LeadFix(original, first_issue, ())
