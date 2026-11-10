"""House periodic transaction reports (PTRs): read the PDFs, build the Congress side of Follow.

Run it::

    python3 -m backend.agentdata.house_ptr                  # 2023 to this year, write to the store
    python3 -m backend.agentdata.house_ptr --years 2026 --dry-run

The Clerk of the House publishes a yearly index of every financial disclosure
and each electronically filed PTR as a small PDF: RC4-encrypted with an empty
password, text drawn one glyph at a time in embedded fonts. The first half of
this module does just enough PDF to get the text back with its position on
the page and rebuilds the transaction table from it. It is not a general PDF
reader. Scanned paper filings (document ids that do not start with 2) have no
text layer and return no rows; the run counts them.

Collections (all additive):

* ``tm_follow_trades/{doc id}-{n}``        one disclosed trade
* ``tm_follow_people/{slug}``              a member's profile: trades, record, caveats
* ``tm_follow_sources/{slug}``             the directory card (kind "congress")
* ``tm_follow_activity/{slug}__{date}``    one "they filed" event per filing date
* ``tm_follow_meta/congress``              run counts and the time of the run

The record is the "follow the disclosure" portfolio. A report gives a dollar
bracket, never an amount, so each buy counts at the middle of its bracket. On
the first session on or after each filing date the portfolio is set to the
stocks the member has disclosed buying and not yet disclosed selling, and held
until their next report. What they owned before the first report we read is
unknown and left out. Nobody ran this portfolio.

The Senate files in a different system (eFD) that needs a browser session, so
senators are not ingested here.

Standard library only.
"""

from __future__ import annotations

import hashlib
import re
import zlib
from typing import Any

_PAD = bytes.fromhex("28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A")
_DATE = re.compile(r"^\d{2}/\d{2}/\d{4}$")
_TX_TYPES = {"P": "buy", "S": "sell", "S (partial)": "sell", "E": "exchange"}
_OWNERS = {"SP": "spouse", "DC": "dependent child", "JT": "joint"}
# Field labels are set in small caps whose glyphs carry no unicode, so
# "FILING STATUS:" survives as "F S:" and "DESCRIPTION:" as "D:".
_LABEL = re.compile(r"^(F\s*S|S\s*O|D|C|L|O)\s*:")
_TICKER = re.compile(r"\(([A-Z][A-Z0-9.\-]{0,6})\)")
_ASSET_TYPE = re.compile(r"\[([A-Z]{2})\]")
_AMOUNT = re.compile(r"\$\s*([\d,]+)")


def _rc4(key: bytes, data: bytes) -> bytes:
    state = list(range(256))
    j = 0
    for i in range(256):
        j = (j + state[i] + key[i % len(key)]) & 255
        state[i], state[j] = state[j], state[i]
    out = bytearray(len(data))
    i = j = 0
    for position, byte in enumerate(data):
        i = (i + 1) & 255
        j = (j + state[i]) & 255
        state[i], state[j] = state[j], state[i]
        out[position] = byte ^ state[(state[i] + state[j]) & 255]
    return bytes(out)


class _Pdf:
    def __init__(self, data: bytes) -> None:
        self.objects: dict[int, tuple[int, bytes]] = {}
        for match in re.finditer(rb"(\d+) (\d+) obj\b(.*?)endobj", data, re.S):
            self.objects[int(match.group(1))] = (int(match.group(2)), match.group(3))
        self.key = self._file_key(data)

    def _file_key(self, data: bytes) -> bytes | None:
        trailer = data[data.rfind(b"trailer") :] if b"trailer" in data else b""
        encrypt = re.search(rb"/Encrypt (\d+) \d+ R", trailer)
        if not encrypt:
            return None
        body = self.objects.get(int(encrypt.group(1)), (0, b""))[1]
        owner = re.search(rb"/O\s*<([0-9A-Fa-f]+)>", body)
        permissions = re.search(rb"/P (-?\d+)", body)
        revision = re.search(rb"/R (\d+)", body)
        length = re.search(rb"/Length (\d+)", body)
        first_id = re.search(rb"/ID\s*\[\s*<([0-9A-Fa-f]+)>", trailer)
        if not (owner and permissions and revision and first_id):
            raise ValueError("unsupported PDF encryption")
        if int(revision.group(1)) > 3:
            raise ValueError("unsupported PDF encryption revision")
        size = int(length.group(1)) // 8 if length else 5
        digest = hashlib.md5(
            _PAD
            + bytes.fromhex(owner.group(1).decode())
            + (int(permissions.group(1)) & 0xFFFFFFFF).to_bytes(4, "little")
            + bytes.fromhex(first_id.group(1).decode())
        ).digest()
        if int(revision.group(1)) >= 3:
            for _ in range(50):
                digest = hashlib.md5(digest[:size]).digest()
        return digest[:size]

    def dictionary(self, number: int) -> bytes:
        body = self.objects.get(number, (0, b""))[1]
        marker = re.search(rb"stream\r?\n", body)
        return body[: marker.start()] if marker else body

    def stream(self, number: int) -> bytes | None:
        generation, body = self.objects.get(number, (0, b""))
        marker = re.search(rb"stream\r?\n", body)
        if not marker:
            return None
        head = body[: marker.start()]
        raw = body[marker.end() : body.rfind(b"endstream")]
        length = re.search(rb"/Length (\d+)(?! \d+ R)", head)
        if length:
            raw = raw[: int(length.group(1))]
        if self.key:
            object_key = hashlib.md5(
                self.key + number.to_bytes(3, "little") + generation.to_bytes(2, "little")
            ).digest()[: min(len(self.key) + 5, 16)]
            raw = _rc4(object_key, raw)
        if b"FlateDecode" in head:
            try:
                raw = zlib.decompress(raw)
            except zlib.error:
                raw = zlib.decompressobj().decompress(raw)
        return raw


def _parse_cmap(text: str) -> dict[int, str]:
    mapping: dict[int, str] = {}

    def to_text(hex_value: str) -> str:
        try:
            return bytes.fromhex(hex_value).decode("utf-16-be", "ignore")
        except ValueError:
            return ""

    for block in re.findall(r"beginbfchar(.*?)endbfchar", text, re.S):
        for source, target in re.findall(r"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>", block):
            mapping[int(source, 16)] = to_text(target)
    for block in re.findall(r"beginbfrange(.*?)endbfrange", text, re.S):
        for low, high, target in re.findall(r"<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>", block):
            base = int(target, 16)
            for offset, code in enumerate(range(int(low, 16), int(high, 16) + 1)):
                mapping[code] = chr(base + offset)
    return mapping


def _multiply(a: list[float], b: list[float]) -> list[float]:
    return [
        a[0] * b[0] + a[1] * b[2],
        a[0] * b[1] + a[1] * b[3],
        a[2] * b[0] + a[3] * b[2],
        a[2] * b[1] + a[3] * b[3],
        a[4] * b[0] + a[5] * b[2] + b[4],
        a[4] * b[1] + a[5] * b[3] + b[5],
    ]


_TOKEN = re.compile(rb"<[0-9A-Fa-f\s]*>|\((?:\\.|[^\\)])*\)|\[|\]|/[^\s/<>\[\]()]+|[-+]?\d*\.?\d+|[A-Za-z'\"*]+")


def _page_chunks(content: bytes, fonts: dict[str, dict[int, str]], page: int) -> list[dict[str, Any]]:
    """Text runs of one content stream as ``{page, x, y, text}`` in page coordinates."""
    chunks: list[dict[str, Any]] = []
    ctm = [1.0, 0.0, 0.0, 1.0, 0.0, 0.0]
    stack: list[list[float]] = []
    operands: list[Any] = []
    font: dict[int, str] = {}
    text_matrix = [1.0, 0.0, 0.0, 1.0, 0.0, 0.0]
    current: dict[str, Any] | None = None

    def decode(token: bytes) -> str:
        if token.startswith(b"<"):
            digits = re.sub(rb"\s", b"", token[1:-1]).decode()
            return "".join(font.get(int(digits[i : i + 4], 16), "") for i in range(0, len(digits) - 3, 4))
        return token[1:-1].decode("latin-1")

    def show(text: str) -> None:
        nonlocal current
        if current is None:
            placed = _multiply(text_matrix, ctm)
            current = {"page": page, "x": placed[4], "y": placed[5], "text": ""}
        current["text"] += text

    def numbers(count: int) -> list[float] | None:
        tail = operands[-count:]
        if len(tail) < count or not all(isinstance(value, float) for value in tail):
            return None
        return tail

    for raw in _TOKEN.findall(content):
        first = raw[:1]
        if first in b"<([" or first == b"]" or first == b"/":
            operands.append(raw)
            continue
        if first in b"0123456789.-+":
            try:
                operands.append(float(raw))
            except ValueError:
                pass
            continue
        operator = raw.decode("latin-1")
        if operator == "q":
            stack.append(list(ctm))
        elif operator == "Q":
            if stack:
                ctm = stack.pop()
        elif operator == "cm":
            values = numbers(6)
            if values:
                ctm = _multiply(values, ctm)
        elif operator == "BT":
            text_matrix = [1.0, 0.0, 0.0, 1.0, 0.0, 0.0]
            current = None
        elif operator == "ET":
            if current and current["text"].strip("\x00 "):
                chunks.append(current)
            current = None
        elif operator == "Tf":
            name = next((value for value in reversed(operands) if isinstance(value, bytes) and value[:1] == b"/"), b"")
            font = fonts.get(name[1:].decode("latin-1"), {})
        elif operator == "Tm":
            values = numbers(6)
            if values:
                if current and current["text"].strip("\x00 "):
                    chunks.append(current)
                current = None
                text_matrix = values
        elif operator in ("Tj", "'", '"'):
            for value in reversed(operands):
                if isinstance(value, bytes) and value[:1] in b"<(":
                    show(decode(value))
                    break
        elif operator == "TJ":
            for value in operands:
                if isinstance(value, bytes) and value[:1] in b"<(":
                    show(decode(value))
        operands = []
    return chunks


def extract_chunks(pdf_bytes: bytes) -> list[dict[str, Any]]:
    """Every text run in the document, in page order."""
    pdf = _Pdf(pdf_bytes)
    fonts: dict[str, dict[int, str]] = {}
    for number in pdf.objects:
        head = pdf.dictionary(number)
        for name, reference in re.findall(rb"/([A-Za-z0-9]+) (\d+) \d+ R", head):
            target = pdf.dictionary(int(reference))
            if b"/Type /Font" not in target:
                continue
            unicode_ref = re.search(rb"/ToUnicode (\d+) \d+ R", target)
            if not unicode_ref:
                continue
            cmap = pdf.stream(int(unicode_ref.group(1)))
            if cmap:
                fonts[name.decode("latin-1")] = _parse_cmap(cmap.decode("latin-1"))

    pages: list[int] = []

    def walk(number: int, depth: int = 0) -> None:
        head = pdf.dictionary(number)
        if depth > 8:
            return
        if re.search(rb"/Type\s*/Pages\b", head):
            kids = re.search(rb"/Kids\s*\[(.*?)\]", head, re.S)
            for kid in re.findall(rb"(\d+) \d+ R", kids.group(1) if kids else b""):
                walk(int(kid), depth + 1)
        elif re.search(rb"/Type\s*/Page\b", head):
            pages.append(number)

    for number in pdf.objects:
        head = pdf.dictionary(number)
        if re.search(rb"/Type\s*/Catalog\b", head):
            root = re.search(rb"/Pages (\d+) \d+ R", head)
            if root:
                walk(int(root.group(1)))
            break

    chunks: list[dict[str, Any]] = []
    for index, number in enumerate(pages):
        head = pdf.dictionary(number)
        streams: list[int] = []
        contents = re.search(rb"/Contents\s*(\[(.*?)\]|(\d+) \d+ R)", head, re.S)
        if contents:
            streams += [int(value) for value in re.findall(rb"(\d+) \d+ R", contents.group(1))]
        # The first page draws everything inside a form XObject.
        for reference in re.findall(rb"/XOBJ\d+ (\d+) \d+ R", head):
            streams.append(int(reference))
        for stream_number in streams:
            content = pdf.stream(stream_number)
            if content:
                chunks.extend(_page_chunks(content, fonts, index))
    return chunks


def _clean(text: str) -> str:
    return " ".join(text.replace("\x00", "").split())


def group_lines(chunks: list[dict[str, Any]], tolerance: float = 2.0) -> list[list[dict[str, Any]]]:
    """Runs that share a baseline, top to bottom, each line left to right."""
    lines: list[list[dict[str, Any]]] = []
    # PDF y grows upward, so the top of the page is the largest y.
    ordered = sorted(chunks, key=lambda item: (item["page"], -item["y"], item["x"]))
    for chunk in ordered:
        text = _clean(chunk["text"])
        if not text:
            continue
        entry = {**chunk, "text": text}
        last = lines[-1] if lines else None
        if last and last[0]["page"] == entry["page"] and abs(last[0]["y"] - entry["y"]) <= tolerance:
            last.append(entry)
        else:
            lines.append([entry])
    for line in lines:
        line.sort(key=lambda item: item["x"])
    return lines


def _iso(us_date: str) -> str:
    month, day, year = us_date.split("/")
    return f"{year}-{month}-{day}"


def parse_amount(text: str) -> tuple[float | None, float | None]:
    """"$1,001 - $15,000" -> (1001, 15000). "Over $50,000,000" has no upper bound."""
    values = [float(value.replace(",", "")) for value in _AMOUNT.findall(text)]
    if not values:
        return None, None
    if len(values) == 1:
        return values[0], None
    return values[0], values[1]


def parse_transactions(chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Rebuild the transaction table.

    A row starts on the line that carries the type (P, S, S (partial), E) and
    the two dates. The asset name and the amount can wrap, so the lines under
    a row are folded back into the column they sit in until a field label or
    the next row.
    """
    lines = group_lines(chunks)
    rows: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None

    def finish() -> None:
        nonlocal current
        if current is None:
            return
        asset = " ".join(current.pop("asset_parts")).strip()
        amount_text = " ".join(current.pop("amount_parts"))
        low, high = parse_amount(amount_text)
        tickers = _TICKER.findall(asset)
        asset_type = _ASSET_TYPE.search(asset)
        current.pop("asset_x")
        current.pop("amount_x")
        current.pop("type_x")
        current.update(
            {
                "asset": _ASSET_TYPE.sub("", asset).strip(),
                "ticker": tickers[-1] if tickers else "",
                "asset_type": asset_type.group(1) if asset_type else "",
                "amount_low": low,
                "amount_high": high,
                "amount_text": amount_text,
            }
        )
        rows.append(current)
        current = None

    for line in lines:
        texts = [item["text"] for item in line]
        dates = [index for index, text in enumerate(texts) if _DATE.match(text)]
        type_index = next((index for index, text in enumerate(texts) if text in _TX_TYPES), None)
        if len(dates) >= 2 and type_index is not None and type_index < dates[0]:
            finish()
            left = line[:type_index]
            owner = ""
            if left and left[0]["text"] in _OWNERS:
                owner = left[0]["text"]
                left = left[1:]
            right = line[dates[1] + 1 :]
            amount_chunks = [item for item in right if "$" in item["text"]]
            current = {
                "owner": owner,
                "tx_type": _TX_TYPES[texts[type_index]],
                "partial": texts[type_index] == "S (partial)",
                "transaction_date": _iso(texts[dates[0]]),
                "notification_date": _iso(texts[dates[1]]),
                "asset_parts": [item["text"] for item in left],
                "amount_parts": [item["text"] for item in amount_chunks],
                "asset_x": left[0]["x"] if left else None,
                "type_x": line[type_index]["x"],
                "amount_x": amount_chunks[0]["x"] if amount_chunks else line[dates[1]]["x"] + 40,
                "page": line[0]["page"],
            }
            continue
        if current is None:
            continue
        if _LABEL.match(texts[0]) or line[0]["page"] != current["page"]:
            finish()
            continue
        for item in line:
            if item["x"] >= current["amount_x"] - 3 and ("$" in item["text"] or item["text"][:1].isdigit()):
                current["amount_parts"].append(item["text"])
            elif item["x"] < current["type_x"] - 3 and (current["asset_x"] is None or item["x"] >= current["asset_x"] - 3):
                current["asset_parts"].append(item["text"])
    finish()
    for row in rows:
        row.pop("page", None)
    return rows


def parse_ptr(pdf_bytes: bytes) -> list[dict[str, Any]]:
    """Transactions in one PTR PDF. Empty for scans and anything unreadable."""
    try:
        chunks = extract_chunks(pdf_bytes)
    except (ValueError, KeyError, IndexError, zlib.error):
        return []
    return parse_transactions(chunks)


# ---------------------------------------------------------------------------
# Ingestion: index, members, trades, the record
# ---------------------------------------------------------------------------

import argparse  # noqa: E402
import io  # noqa: E402
import json  # noqa: E402
import statistics  # noqa: E402
import sys  # noqa: E402
import time  # noqa: E402
import urllib.error  # noqa: E402
import urllib.request  # noqa: E402
import xml.etree.ElementTree as ET  # noqa: E402
import zipfile  # noqa: E402
from datetime import date, datetime, timezone  # noqa: E402
from pathlib import Path  # noqa: E402

CLERK = "https://disclosures-clerk.house.gov/public_disc"
LEGISLATORS_URL = "https://unitedstates.github.io/congress-legislators/legislators-current.json"
USER_AGENT = "Mozilla/5.0 (compatible; stocksbrew.online research; tomartarun2001@gmail.com)"
FIRST_YEAR = 2023
SOURCE = "Clerk of the House, periodic transaction reports"
LATE_AFTER_DAYS = 45  # the STOCK Act deadline
PROFILE_TRADES = 400
ACTIVITY_DAYS = 120
_PTR_CACHE = Path(__file__).resolve().parents[1] / ".cache" / "house_ptr"
_SKIP_ASSET_TYPES = {"OP", "CS", "GS", "MF", "CT", "PS", "VA", "VI", "HN", "OL"}  # options, bonds, funds without a listing
_PARTY = {"Democrat": "D", "Republican": "R", "Independent": "I"}


def log(message: str) -> None:
    print(f"[house] {message}", flush=True)


def _get(url: str, cache: Path, *, ttl: float | None, pause: float = 0.25) -> bytes | None:
    """Bytes of ``url`` with a disk cache. None on 404 or repeated failure."""
    if cache.exists() and (ttl is None or time.time() - cache.stat().st_mtime < ttl):
        return cache.read_bytes()
    for attempt in range(4):
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                body = response.read()
            cache.parent.mkdir(parents=True, exist_ok=True)
            cache.write_bytes(body)
            time.sleep(pause)
            return body
        except urllib.error.HTTPError as error:
            if error.code in (404, 410):
                return None
            time.sleep(2.0 * (attempt + 1))
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError):
            time.sleep(2.0 * (attempt + 1))
    return None


def slugify(text: str) -> str:
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", text.lower())).strip("-")


def member_slug(first: str, last: str) -> str:
    """"Robert B." + "Aderholt" -> "robert-aderholt". Middle initials differ between filings."""
    given = (first or "").split()
    return slugify(f"{given[0] if given else ''} {last}")


def parse_state_district(raw: str) -> tuple[str, str]:
    match = re.match(r"^([A-Z]{2})(\d{2})$", (raw or "").strip().upper())
    if not match:
        return "", ""
    return match.group(1), str(int(match.group(2)))


def parse_index(xml_bytes: bytes) -> list[dict[str, str]]:
    """PTR rows of one year's index: who filed, when, and the document id."""
    out: list[dict[str, str]] = []
    for member in ET.fromstring(xml_bytes):
        row = {child.tag: (child.text or "").strip() for child in member}
        if row.get("FilingType") != "P" or not row.get("DocID"):
            continue
        match = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", row.get("FilingDate", ""))
        if not match:
            continue
        state, district = parse_state_district(row.get("StateDst", ""))
        out.append(
            {
                "doc_id": row["DocID"],
                "year": row.get("Year", ""),
                "filed_at": f"{match.group(3)}-{int(match.group(1)):02d}-{int(match.group(2)):02d}",
                "first": row.get("First", ""),
                "last": row.get("Last", ""),
                "suffix": row.get("Suffix", ""),
                "state": state,
                "district": district,
            }
        )
    return out


def amount_mid(low: float | None, high: float | None) -> float | None:
    """The middle of the disclosed bracket; the floor when the bracket has no top."""
    if low is None:
        return None
    if high is None or high < low:
        return float(low)
    return (float(low) + float(high)) / 2


def clean_ptr_ticker(raw: str) -> str:
    ticker = (raw or "").strip().upper().replace("/", ".")
    return ticker if re.match(r"^[A-Z][A-Z0-9.]{0,6}$", ticker) else ""


def disclosed_book_events(trades: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """What a follower would hold after each report.

    ``trades`` need ``disclosure_date``, ``transaction_date``, ``ticker``,
    ``tx_type``, ``partial`` and ``est_amount``. A buy adds the middle of its
    bracket, a partial sale takes its own bracket off, a full sale closes the
    position. One event per filing date, with weights that sum to one (or an
    empty book when everything disclosed has been sold).
    """
    usable = [item for item in trades if item.get("ticker") and item.get("est_amount") and item.get("tx_type") in ("buy", "sell")]
    usable.sort(key=lambda item: (item["disclosure_date"], item["transaction_date"], 0 if item["tx_type"] == "buy" else 1))
    book: dict[str, float] = {}
    events: list[dict[str, Any]] = []
    for item in usable:
        ticker = item["ticker"]
        if item["tx_type"] == "buy":
            book[ticker] = book.get(ticker, 0.0) + float(item["est_amount"])
        elif ticker in book:
            remaining = book[ticker] - float(item["est_amount"]) if item.get("partial") else 0.0
            if remaining > 0:
                book[ticker] = remaining
            else:
                del book[ticker]
        else:
            continue  # sold something bought before our first report: nothing to do
        total = sum(book.values())
        weights = {name: value / total for name, value in book.items()} if total > 0 else {}
        if events and events[-1]["date"] == item["disclosure_date"]:
            events[-1]["weights"] = weights
        elif events or weights:
            events.append({"date": item["disclosure_date"], "weights": weights})
    return events


def member_stats(trades: list[dict[str, Any]]) -> dict[str, Any]:
    buys = [item for item in trades if item["tx_type"] == "buy"]
    sells = [item for item in trades if item["tx_type"] == "sell"]
    lags = [item["lag_days"] for item in trades if item.get("lag_days") is not None and item["lag_days"] >= 0]
    bought: dict[str, float] = {}
    names: dict[str, str] = {}
    for item in buys:
        if item.get("ticker") and item.get("est_amount"):
            bought[item["ticker"]] = bought.get(item["ticker"], 0.0) + item["est_amount"]
            names[item["ticker"]] = item.get("company") or ""
    total_bought = sum(bought.values())
    top = sorted(bought.items(), key=lambda pair: -pair[1])[:5]
    return {
        "trades": len(trades),
        "buys": len(buys),
        "sells": len(sells),
        "est_volume": round(sum(item.get("est_amount") or 0 for item in trades)),
        "median_lag_days": int(statistics.median(lags)) if lags else None,
        "late_trades": sum(1 for lag in lags if lag > LATE_AFTER_DAYS),
        "top_bought": [
            {"ticker": ticker, "name": names.get(ticker) or "", "weight": round(value / total_bought, 4) if total_bought else None}
            for ticker, value in top
        ],
    }


def congress_headline(name: str, filed_at: str, rows: list[dict[str, Any]]) -> str:
    """One plain sentence about a report, built from its rows."""
    from .funds_13f import _join_names, fmt_day

    def labels(side: str) -> list[str]:
        seen: list[str] = []
        for item in sorted(rows, key=lambda row: -(row.get("est_amount") or 0)):
            label = item.get("ticker") or ""
            if item["tx_type"] == side and label and label not in seen:
                seen.append(label)
        return seen

    parts: list[str] = []
    for side, verb in (("buy", "bought"), ("sell", "sold")):
        found = labels(side)
        if found:
            more = f" and {len(found) - 3} more" if len(found) > 3 else ""
            parts.append(f"{verb} {_join_names(found[:3]) if not more else ', '.join(found[:3]) + more}")
    lead = f"{name} reported on {fmt_day(filed_at)}"
    if not parts:
        return f"{lead}: {len(rows)} trade{'s' if len(rows) != 1 else ''} in assets without a ticker."
    return f"{lead}: {' and '.join(parts)}."


def load_legislators() -> dict[tuple[str, str], list[dict[str, str]]]:
    """(state, last name) -> sitting representatives with that name.

    Keyed by name rather than district: redistricting moves a member to a new
    district number between one report and the next.
    """
    body = _get(LEGISLATORS_URL, _PTR_CACHE / "legislators-current.json", ttl=7 * 86400)
    out: dict[tuple[str, str], list[dict[str, str]]] = {}
    if not body:
        return out
    for person in json.loads(body):
        term = (person.get("terms") or [{}])[-1]
        if term.get("type") != "rep":
            continue
        name = person.get("name") or {}
        out.setdefault((term.get("state", ""), _name_key(name.get("last", ""))), []).append(
            {
                "party": _PARTY.get(term.get("party", ""), ""),
                "name": name.get("official_full") or f"{name.get('first', '')} {name.get('last', '')}".strip(),
                "first": name.get("first", ""),
                "nickname": name.get("nickname", ""),
                "district": str(term.get("district", "")),
            }
        )
    return out


def _name_key(text: str) -> str:
    return re.sub(r"[^a-z]", "", (text or "").lower())


def match_legislator(
    legislators: dict[tuple[str, str], list[dict[str, str]]], state: str, first: str, last: str, district: str
) -> dict[str, str] | None:
    """The sitting member behind a report, or None for someone who has left the House."""
    found = legislators.get((state, _name_key(last))) or []
    if len(found) <= 1:
        return found[0] if found else None
    initial = _name_key(first)[:1]
    for person in found:
        if person["district"] == district:
            return person
    for person in found:
        if initial and initial in (_name_key(person["first"])[:1], _name_key(person["nickname"])[:1]):
            return person
    return None


def build_trades(filing: dict[str, str], rows: list[dict[str, Any]], member: dict[str, Any], captured_at: str) -> list[dict[str, Any]]:
    url = f"{CLERK}/ptr-pdfs/{filing['year']}/{filing['doc_id']}.pdf"
    out: list[dict[str, Any]] = []
    for number, row in enumerate(rows, start=1):
        if row["tx_type"] not in ("buy", "sell"):
            continue
        ticker = "" if row.get("asset_type") in _SKIP_ASSET_TYPES else clean_ptr_ticker(row.get("ticker", ""))
        try:
            traded = date.fromisoformat(row["transaction_date"])
            lag = (date.fromisoformat(filing["filed_at"]) - traded).days
        except ValueError:
            continue
        if lag < 0 or lag > 3650:
            continue  # a typo in the report's date
        company = re.sub(r"\s*\([A-Z][A-Z0-9.\-]{0,6}\)\s*$", "", row.get("asset") or "").strip()
        company = re.sub(r"\s*-\s*(Common Stock|Class [A-C] Common Stock|Ordinary Shares).*$", "", company).strip()
        out.append(
            {
                "trade_id": f"{filing['doc_id']}-{number}",
                "doc_id": filing["doc_id"],
                "person_id": member["slug"],
                "person_name": member["name"],
                "chamber": "house",
                "party": member["party"],
                "state": member["state"],
                "district": member["district"],
                "ticker": ticker,
                "company": company[:120],
                "asset_type": row.get("asset_type") or "",
                "tx_type": row["tx_type"],
                "partial": bool(row.get("partial")),
                "owner": _OWNERS.get(row.get("owner") or "", "self"),
                "amount_low": row.get("amount_low"),
                "amount_high": row.get("amount_high") if (row.get("amount_high") or 0) >= (row.get("amount_low") or 0) else None,
                "est_amount": amount_mid(row.get("amount_low"), row.get("amount_high")),
                "transaction_date": row["transaction_date"],
                "disclosure_date": filing["filed_at"],
                "lag_days": lag,
                "source": SOURCE,
                "source_url": url,
                "captured_at": captured_at,
            }
        )
    return out


def congress_performance(
    trades: list[dict[str, Any]],
    book: Any,
    spy: dict[str, Any],
    first_year: int,
    *,
    last_report: str = "",
    sitting: bool = True,
) -> dict[str, Any] | None:
    from .funds_13f import _index_on_or_after, _round, downsample, performance_stats, simulate_follow

    events = disclosed_book_events(trades)
    if not events:
        return None
    # When everything disclosed has been sold there is nothing left to follow, so the record
    # stops on that report instead of drifting sideways in cash and reading as a 0% year.
    # The same goes for someone who has left the House: they will never report a sale, so the
    # record stops at their last report rather than holding their last buys forever.
    ended = not events[-1]["weights"] or not sitting
    end_index = None
    if ended:
        end_index = _index_on_or_after(book.calendar, max(events[-1]["date"], last_report or ""))
    run = simulate_follow(events, book, end_index=end_index)
    if run is None or len(run["dates"]) < 5:
        return None
    dates, values = run["dates"], run["values"]
    try:
        offset = spy["dates"].index(dates[0])
    except ValueError:
        return None
    spy_values = [spy["closes"][offset + step] / spy["closes"][offset] for step in range(len(dates))]
    covered = [entry["covered_weight"] for entry in run["coverage"] if entry["positions"]]
    if not covered:
        return None
    return {
        "label": "What following each report from the day it was public would have returned",
        "method": (
            "A report gives a dollar bracket, so each buy counts at the middle of its bracket. On the first trading "
            "day on or after each filing date, hold the stocks the member has disclosed buying and not yet disclosed "
            f"selling, then leave it until their next report. Starts with the first purchase reported since {first_year}; "
            "what they owned before that is unknown and left out. Hypothetical: nobody ran this portfolio. No trading "
            "costs or taxes. Adjusted closes, so dividends are included. Options, bonds and assets without a price "
            "series are left out and the rest is scaled up to 100%."
        ),
        "benchmark": "SPY (S&P 500 ETF, dividends included)",
        "start_date": dates[0],
        "end_date": dates[-1],
        "ended": ended,
        "sessions": len(dates),
        "filings_followed": len(run["coverage"]),
        "fund": {key: _round(value) for key, value in performance_stats(dates, values, ended=ended).items()},
        "spy": {key: _round(value) for key, value in performance_stats(dates, spy_values, ended=ended).items()},
        "covered_weight_latest": _round(covered[-1], 4),
        "covered_weight_avg": _round(sum(covered) / len(covered), 4),
        "covered_weight_min": _round(min(covered), 4),
        "priced_positions_latest": run["coverage"][-1]["priced"],
        "curve": downsample(dates, values, spy_values),
        "curve_columns": ["date", "fund", "spy"],
        "price_source": "Yahoo Finance adjusted daily closes",
    }


def perf_card(performance: dict[str, Any] | None) -> dict[str, Any] | None:
    """The slice of a record the directory needs, with a short sparkline."""
    if not performance:
        return None
    spark = [round(row[1], 4) for row in performance["curve"]]
    spark_spy = [round(row[2], 4) for row in performance["curve"]]
    step = max(1, len(spark) // 60)
    return {
        "start_date": performance["start_date"],
        "end_date": performance["end_date"],
        "ended": performance["ended"],
        "fund": performance["fund"],
        "spy": performance["spy"],
        "covered_weight_latest": performance["covered_weight_latest"],
        "covered_weight_avg": performance["covered_weight_avg"],
        "spark": spark[::step] + ([spark[-1]] if (len(spark) - 1) % step else []),
        "spark_spy": spark_spy[::step] + ([spark_spy[-1]] if (len(spark_spy) - 1) % step else []),
    }


def main(argv: list[str] | None = None) -> int:
    from . import prices
    from .funds_13f import PriceBook, _index_on_or_after
    from .store import DocStore

    this_year = datetime.now(timezone.utc).year
    parser = argparse.ArgumentParser(description="Ingest House periodic transaction reports.")
    parser.add_argument("--years", default=",".join(str(year) for year in range(FIRST_YEAR, this_year + 1)))
    parser.add_argument("--dry-run", action="store_true", help="do everything except write to the store")
    parser.add_argument("--skip-prices", action="store_true", help="no price fetch and no record")
    parser.add_argument("--limit", type=int, default=0, help="read at most this many reports (for a quick check)")
    args = parser.parse_args(argv)

    years = sorted(int(value) for value in args.years.split(",") if value.strip())
    store = DocStore.from_env()
    writer = None if args.dry_run else store
    now_iso = datetime.now(timezone.utc).isoformat()
    today = now_iso[:10]
    log(f"store: {store.mode}{' (dry run, no writes)' if args.dry_run else ''}; years {years}")

    filings: list[dict[str, str]] = []
    for year in years:
        ttl = 3600 if year == this_year else 7 * 86400
        body = _get(f"{CLERK}/financial-pdfs/{year}FD.zip", _PTR_CACHE / f"{year}FD.zip", ttl=ttl)
        if not body:
            log(f"{year}: index missing")
            continue
        with zipfile.ZipFile(io.BytesIO(body)) as archive:
            rows = parse_index(archive.read(f"{year}FD.xml"))
        log(f"{year}: {len(rows)} reports in the index")
        filings.extend(rows)
    filings.sort(key=lambda item: (item["filed_at"], item["doc_id"]))
    if args.limit:
        filings = filings[-args.limit :]

    legislators = load_legislators()
    members: dict[str, dict[str, Any]] = {}
    trades_by_member: dict[str, list[dict[str, Any]]] = {}
    filings_by_member: dict[str, list[dict[str, Any]]] = {}
    paper = unreadable = 0
    for index, filing in enumerate(filings, start=1):
        slug = member_slug(filing["first"], filing["last"])
        seat = match_legislator(legislators, filing["state"], filing["first"], filing["last"], filing["district"])
        member = members.setdefault(slug, {"slug": slug})
        # Reports are read oldest first, so the newest one decides the seat shown.
        member.update(
            {
                "name": seat["name"] if seat else f"{filing['first']} {filing['last']}".strip(),
                "party": seat["party"] if seat else "",
                "state": filing["state"],
                "district": seat["district"] if seat else filing["district"],
                "sitting": bool(seat),
            }
        )
        if not filing["doc_id"].startswith("2"):
            paper += 1
            continue
        pdf = _get(f"{CLERK}/ptr-pdfs/{filing['year']}/{filing['doc_id']}.pdf", _PTR_CACHE / filing["year"] / f"{filing['doc_id']}.pdf", ttl=None)
        rows = parse_ptr(pdf) if pdf else []
        if not rows:
            unreadable += 1
            continue
        built = build_trades(filing, rows, member, now_iso)
        trades_by_member.setdefault(slug, []).extend(built)
        filings_by_member.setdefault(slug, []).append({**filing, "trades": built})
        if index % 100 == 0:
            log(f"{index}/{len(filings)} reports read")

    for slug, rows in trades_by_member.items():
        for item in rows:
            item.update({"person_name": members[slug]["name"], "party": members[slug]["party"],
                         "state": members[slug]["state"], "district": members[slug]["district"]})
    all_trades = [item for rows in trades_by_member.values() for item in rows]
    log(f"{len(all_trades)} trades from {len(trades_by_member)} members; {paper} paper filings skipped, {unreadable} unreadable")

    book = spy = None
    if not args.skip_prices and all_trades:
        tickers = sorted({item["ticker"] for item in all_trades if item["ticker"] and item["tx_type"] == "buy"})
        log(f"prices: {len(tickers)} tickers plus SPY")
        series = prices.load_many(["SPY"] + tickers, store=None)
        spy = series.get("SPY")
        if spy:
            first = min(item["disclosure_date"] for item in all_trades)
            start = _index_on_or_after(spy["dates"], first) or 0
            book = PriceBook(spy["dates"][max(0, start - 1) :], series)

    docs: list[tuple[str, dict[str, Any]]] = []
    with_record = 0
    for slug, trades in trades_by_member.items():
        member = members[slug]
        trades.sort(key=lambda item: (item["disclosure_date"], item["transaction_date"], item["trade_id"]), reverse=True)
        performance = None
        if book is not None and spy is not None:
            try:
                performance = congress_performance(
                    trades,
                    book,
                    spy,
                    years[0],
                    last_report=max(item["filed_at"] for item in filings_by_member[slug]),
                    sitting=member["sitting"],
                )
            except Exception as error:  # one odd member should not sink the run
                log(f"{slug}: record failed ({error})")
        with_record += 1 if performance else 0
        stats = member_stats(trades)
        reports = sorted(filings_by_member[slug], key=lambda item: item["filed_at"], reverse=True)
        latest = reports[0]
        seat = f"{member['state']}-{member['district']}" if member["state"] else ""
        headline = congress_headline(member["name"], latest["filed_at"], latest["trades"])
        style = " · ".join(part for part in ({"D": "Democrat", "R": "Republican", "I": "Independent"}.get(member["party"], ""), seat) if part)
        report_rows = [
            {
                "doc_id": item["doc_id"],
                "filed_at": item["filed_at"],
                "trades": len(item["trades"]),
                "buys": sum(1 for row in item["trades"] if row["tx_type"] == "buy"),
                "sells": sum(1 for row in item["trades"] if row["tx_type"] == "sell"),
                "url": f"{CLERK}/ptr-pdfs/{item['year']}/{item['doc_id']}.pdf",
            }
            for item in reports
        ]
        base = {
            "slug": slug,
            "kind": "congress",
            "name": member["name"],
            "person": "US House" + (f", {seat}" if seat else ""),
            "chamber": "house",
            "party": member["party"],
            "state": member["state"],
            "district": member["district"],
            "sitting": member["sitting"],
            "style": style,
            "active": (date.fromisoformat(today) - date.fromisoformat(latest["filed_at"])).days <= 365,
            "latest_date": latest["filed_at"],
            "headline": headline,
            "stats": stats,
            "first_report": reports[-1]["filed_at"],
            "reports_count": len(reports),
            "source": SOURCE,
            "source_url": report_rows[0]["url"],
            "updated_at": now_iso,
        }
        docs.append((f"tm_follow_people/{slug}", {**base, "trades": trades[:PROFILE_TRADES], "trades_total": len(trades),
                                                  "reports": report_rows[:80], "performance": performance}))
        docs.append((f"tm_follow_sources/{slug}", {**base, "id": slug, "top_holdings": stats["top_bought"], "performance": perf_card(performance)}))
        for item in reports:
            if (date.fromisoformat(today) - date.fromisoformat(item["filed_at"])).days > ACTIVITY_DAYS or not item["trades"]:
                continue
            ranked = sorted(item["trades"], key=lambda row: -(row.get("est_amount") or 0))
            traded = sorted(row["transaction_date"] for row in item["trades"])
            docs.append(
                (
                    f"tm_follow_activity/{slug}__{item['filed_at']}__{item['doc_id']}",
                    {
                        "id": f"{slug}__{item['filed_at']}__{item['doc_id']}",
                        "source_id": slug,
                        "kind": "congress",
                        "type": "ptr",
                        "name": member["name"],
                        "person": base["person"],
                        "party": member["party"],
                        "date": item["filed_at"],
                        "traded_from": traded[0],
                        "traded_to": traded[-1],
                        "headline": congress_headline(member["name"], item["filed_at"], item["trades"]),
                        "counts": {"buys": sum(1 for row in item["trades"] if row["tx_type"] == "buy"),
                                   "sells": sum(1 for row in item["trades"] if row["tx_type"] == "sell")},
                        "items": [
                            {"action": row["tx_type"], "ticker": row["ticker"] or None, "name": row["company"],
                             "amount_low": row["amount_low"], "amount_high": row["amount_high"],
                             "transaction_date": row["transaction_date"]}
                            for row in ranked[:6]
                        ],
                        "url": f"{CLERK}/ptr-pdfs/{item['year']}/{item['doc_id']}.pdf",
                        "source": SOURCE,
                        "updated_at": now_iso,
                    },
                )
            )
    docs.extend((f"tm_follow_trades/{item['trade_id']}", item) for item in all_trades)

    meta = {
        "generated_at": now_iso,
        "years": years,
        "reports_in_index": len(filings),
        "paper_filings_skipped": paper,
        "unreadable_reports": unreadable,
        "members": len(trades_by_member),
        "members_with_record": with_record,
        "trades": len(all_trades),
        "trades_with_ticker": sum(1 for item in all_trades if item["ticker"]),
        "docs": len(docs),
        "source": f"{SOURCE}; party and seat from the unitedstates/congress-legislators project; prices from Yahoo Finance",
        "source_url": "https://disclosures-clerk.house.gov/FinancialDisclosure",
        "senate_note": "Senators file in the Senate eFD system, which this job does not read.",
    }
    if writer is not None:
        written = writer.set_many(docs)
        if not args.limit:
            writer.set("tm_follow_meta/congress", meta)
        log(f"wrote {written} documents")
    else:
        log(f"dry run: {len(docs)} documents not written")
    log(json.dumps(meta, indent=2))
    return 0 if all_trades else 1


if __name__ == "__main__":
    sys.exit(main())
