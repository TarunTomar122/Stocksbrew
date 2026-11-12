"""Source headlines as sentences: the Python side of lib/plain-copy.ts `headlineCase`.

A scraped headline often arrives in Title Case ("Sandisk Soar As CoreWeave CEO Says AI Demand Outpaces World's
Capacity"), or half-fixed with stray capitals left over. `kit.sentence_case` handles a Title Case headline; this
module then lowers the strays the way the web app does (`lowerStrays`): a capitalised word is lowered when it is a
common word, is not the first word or after a colon or full stop, is not a known name, and does not stand next to an
unknown capitalised word that may be part of a name ("Constellation Energy").

The word lists are the web app's own, read from lib/plain-copy.ts so the email and the site agree. When that file is
missing (a trimmed deploy), the kit's headline word list stands in and the rest still works.
"""
from __future__ import annotations

import re
from functools import lru_cache
from pathlib import Path

from backend.mail import kit

PLAIN_COPY = Path(__file__).resolve().parents[2] / "lib" / "plain-copy.ts"

_DAY_OR_MONTH = re.compile(r"^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|"
                           r"June|July|August|September|October|November|December)$")
_COMMON_ENDING = re.compile(r"^[a-z]{3,}(?:ing|ments?|tions?|sions?|ness)$|^[a-z]{4,}(?:ed|ly)$")
_OWN_SMALL = {"a", "an", "and", "of", "the", "for", "in", "on", "inc", "corp", "co", "company", "corporation", "ltd", "plc",
              "group", "holdings"}
# Words the email has met that the web lists don't have yet (Nov 12: "outpaces World's Capacity"). Treated like the
# web's MIXED_COMMON: lowered unless an unknown capitalised word stands beside them ("World Wrestling Entertainment").
EMAIL_MIXED_COMMON = {"world"}
_TOKEN = re.compile(r"[A-Za-z](?:[A-Za-z]|['’](?=[A-Za-z]))*")
_TITLED = re.compile(r"^[A-Z][a-z]+(?:['’]s)?$")


def _strip_comments(src: str) -> str:
    return "\n".join(line.split("//", 1)[0] if not line.lstrip().startswith("*") else "" for line in src.splitlines())


@lru_cache(maxsize=1)
def word_lists() -> dict[str, set[str]]:
    """COMMON, MIXED_COMMON, NAME_PRONE, MIXED_NAME_RISK, KNOWN_NAMES, FIRST_NAMES and NAME_WORDS from the web app."""
    out: dict[str, set[str]] = {k: set() for k in ("COMMON", "MIXED_COMMON", "NAME_PRONE", "MIXED_NAME_RISK", "KNOWN_NAMES",
                                                    "FIRST_NAMES", "NAME_WORDS")}
    try:
        src = _strip_comments(PLAIN_COPY.read_text())
    except OSError:
        out["COMMON"] = set(kit._COMMON)
        return out
    # each statement that builds one of the sets: `const X = new Set(...)` or `for (const word of ...) X.add(word)`
    starts = [m.start() for m in re.finditer(r"^(?:const |for \(const word of|export |function |let )", src, re.M)] + [len(src)]
    for a, b in zip(starts, starts[1:]):
        chunk = src[a:b]
        m = re.match(r"const (\w+)(?::[^=]+)? = new Set", chunk) or re.search(r"(\w+)\.add\(word\)", chunk)
        if m and m.group(1) in out:
            out[m.group(1)] |= {w for lit in re.findall(r'"([^"]*)"', chunk) for w in lit.split() if w}
        elif chunk.startswith("const NAME_WORDS"):
            out["NAME_WORDS"] |= {k.lower() for k in re.findall(r'(?:^|[,{]\s*)"?([A-Za-z&\'-]+)"?\s*:', chunk, re.M)}
    if not out["COMMON"]:
        out["COMMON"] = set(kit._COMMON)
    out["MIXED_COMMON"] |= EMAIL_MIXED_COMMON
    return out


def _bare(word: str) -> str:
    return re.sub(r"'s$", "", word.lower().replace("’", "'"))


def lower_strays(value: str, company: str = "") -> str:
    """Lower the stray capitals of common words, keeping names (lib/plain-copy.ts lowerStrays)."""
    lists = word_lists()
    own = {re.sub(r"['’]s$", "", p) for p in re.split(r"[^a-z0-9'’&-]+", company.lower()) if p and p not in _OWN_SMALL}
    tokens = [(m.group(0), m.start()) for m in _TOKEN.finditer(value)]

    def named(bare: str, word: str) -> bool:
        return (bare in lists["KNOWN_NAMES"] or bare in own or bare in lists["NAME_WORDS"]
                or bool(_DAY_OR_MONTH.match(re.sub(r"['’]s$", "", word))))

    def listed(bare: str) -> bool:
        return bare in lists["COMMON"] or bare in lists["MIXED_COMMON"] or bare in kit._COMMON

    def unknown(word: str | None) -> bool:
        if not word or not _TITLED.match(word):
            return False
        bare = _bare(word)
        if bare in lists["MIXED_NAME_RISK"]:
            return True
        return not listed(bare) and not named(bare, word) and not _COMMON_ENDING.match(bare) and bare not in lists["NAME_PRONE"]

    decision: list[str] = []
    for i, (word, offset) in enumerate(tokens):
        end = offset + len(word)
        bare = _bare(word)
        prev = tokens[i - 1] if i else None
        nxt = tokens[i + 1] if i + 1 < len(tokens) else None
        if (prev and _TITLED.match(word) and _bare(prev[0]) in lists["FIRST_NAMES"] and prev[0][:1].isupper()
                and value[prev[1] + len(prev[0]):offset].isspace()):
            decision.append("keep")  # a surname after a first name ("Tim Cook")
            continue
        gap_before = value[prev[1] + len(prev[0]):offset] if prev else value[:offset]
        gap_after = value[end:nxt[1]] if nxt else ""
        keep = (i == 0 or not _TITLED.match(word) or re.search(r"[:.!?(“\"‘'—–]\s*$", gap_before)
                or re.search(r"(?:^|\s)-{1,2}\s*$", gap_before) or re.search(r"\d$", value[:offset])
                or re.match(r"\d", value[end:]) or gap_before == "-" or gap_after == "-" or named(bare, word)
                or bare in lists["MIXED_NAME_RISK"])
        if keep:
            decision.append("keep")
            continue
        if not (listed(bare) or _COMMON_ENDING.match(bare) or bare in lists["NAME_PRONE"]):
            decision.append("keep")
            continue
        joined_prev = bool(prev) and gap_before.isspace()
        joined_next = bool(nxt) and gap_after.isspace()
        decision.append("name" if (joined_prev and unknown(prev[0])) or (joined_next and unknown(nxt[0])) else "lower")
    # a common word in front of one kept for a name is part of that name too ("shares of The Trade Desk")
    for i in range(len(tokens) - 2, -1, -1):
        gap = value[tokens[i][1] + len(tokens[i][0]):tokens[i + 1][1]]
        if decision[i] == "lower" and decision[i + 1] == "name" and gap.isspace():
            decision[i] = "name"
    out, cursor = [], 0
    for (word, offset), d in zip(tokens, decision):
        out.append(value[cursor:offset])
        out.append(word.lower() if d == "lower" else word)
        cursor = offset + len(word)
    out.append(value[cursor:])
    return "".join(out)


def headline_case(text: str, company: str = "", hint: str = "") -> str:
    """A source headline as a sentence, whatever casing it arrived in (lib/plain-copy.ts headlineCase)."""
    value = re.sub(r"\s+", " ", text or "").strip()
    if not value:
        return value
    return lower_strays(kit.sentence_case(value, hint) if kit.is_title_case(value) else value, company)
