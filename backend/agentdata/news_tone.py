"""Tone and theme for each recent headline in ``tm_agent_news``.

The live headline store (``news_feed.py``) keeps the publisher's words only: no
tone, no topic. The wire's read ("62% of today's stock news is positive, led by
the Nvidia probe...") needs both, per article, so this job labels each new
headline once with a language model and stores the label beside it in
``tm_agent_news_tone/{headline id}``:

- ``tone``: positive, negative or neutral for the stocks it names (or for US
  stocks in general when it names none), judged from the headline and the
  publisher's excerpt only.
- ``theme``: a short name for the story or market driver it belongs to
  ("Nvidia CEO probe", "Oil prices", "Anthropic IPO"), or null for routine
  items (fund flows, conference notices). Names already used in the window are
  passed back in, so the same story keeps the same name across batches.
- ``scope``: ``stock`` (about specific companies), ``market`` (economy, rates,
  policy, the market as a whole) or ``other`` (nothing a US stock investor
  would act on).

The model only labels. Every number the app shows (shares, counts, changes)
is computed from these labels by plain code. A headline is labelled once; a
rerun only sends the ones without a label.

Run: ``python3 -m backend.agentdata.news_tone`` (needs ``ANTHROPIC_API_KEY`` and
the ``anthropic`` package; without either it reports "skipped" and exits cleanly,
and the wire simply shows no read once its labels are a day old). The model
defaults to Claude Haiku 5.5, the same one Ask uses; ``NEWS_TONE_MODEL`` overrides it.
"""

from __future__ import annotations

import argparse
import json
import os
from datetime import timedelta
from typing import Any, Iterable

from .feeds_common import iso_now, query, utc_now
from .store import DocStore
from backend.serve_docs import mark_dirty_in_store, news_tickers, refresh_stamped_pages

SOURCE = "tm_agent_news"
COLLECTION = "tm_agent_news_tone"
META_PATH = "tm_agent_news_tone_meta/US"
METHOD = "news_tone_v1"
DEFAULT_MODEL = "claude-haiku-5-5"
BATCH = 80
TONES = ("positive", "negative", "neutral")
SCOPES = ("stock", "market", "other")

SYSTEM = """You label financial news headlines for a US stock research app.

For each numbered headline (with the publisher's excerpt and any stock tickers it names), return:
- tone: how the news reads for the stocks it names, or for US stocks in general when it names none.
  "positive" (good for the share price: beats, raised outlook, upgrades, wins, rallies),
  "negative" (bad for it: misses, cuts, probes, lawsuits, selloffs, downgrades),
  "neutral" (routine, mixed or unclear: conference notices, fund flows, explainers, previews).
  Judge the news itself, not your opinion of the stock.
- scope: "stock" when it is about one or more specific companies; "market" when it is about the economy,
  rates, inflation, commodities, policy or the market as a whole; "other" when a US stock investor would not act on it
  (local politics abroad, lifestyle, sports, crime, items unrelated to markets).
- theme: a 2 to 4 word name for the specific story or market driver this headline is part of, so headlines about the
  same thing share a name. Examples: "Nvidia CEO probe", "Anthropic IPO", "Oil prices", "US inflation data",
  "Fed rate path", "AI data center spending", "Midterm election". Name the company or the driver, never a sentiment.
  Reuse a name from the list of existing themes verbatim whenever the headline fits it. Use null for routine items that
  are not part of a wider story (single-company earnings snapshots, ETF flow tallies, conference notices, ads).

Write nothing except the JSON."""

SCHEMA = {
    "type": "object",
    "properties": {
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "n": {"type": "integer"},
                    "tone": {"type": "string", "enum": list(TONES)},
                    "scope": {"type": "string", "enum": list(SCOPES)},
                    "theme": {"anyOf": [{"type": "string"}, {"type": "null"}]},
                },
                "required": ["n", "tone", "scope", "theme"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["items"],
    "additionalProperties": False,
}


def clean_theme(raw: Any) -> str | None:
    """A short, tidy theme name, or None."""
    if not isinstance(raw, str):
        return None
    text = " ".join(raw.replace("’", "'").split()).strip(" .,:;-\"'")
    if not text or text.lower() in {"none", "null", "n/a", "other", "general", "misc", "market news", "stock news"}:
        return None
    words = text.split()
    if len(words) > 6:
        text = " ".join(words[:6])
    if len(text) > 48:
        text = text[:48].rsplit(" ", 1)[0]
    return text[0].upper() + text[1:]


def build_prompt(rows: list[dict[str, Any]], themes: Iterable[str]) -> str:
    """The user message for one batch: existing themes, then numbered headlines."""
    known = sorted({t for t in themes if t})
    lines = ["Existing themes: " + ("; ".join(known) if known else "(none yet)"), "", "Headlines:"]
    for n, row in enumerate(rows, start=1):
        tickers = ", ".join(row.get("stock_tickers") or [])
        excerpt = " ".join(str(row.get("summary") or "").split())[:220]
        line = f"{n}. {row.get('title', '').strip()}"
        if tickers:
            line += f" [tickers: {tickers}]"
        if excerpt:
            line += f" | excerpt: {excerpt}"
        lines.append(line)
    return "\n".join(lines)


def parse_labels(payload: Any, rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Map the model's numbered answers back to headline ids. Anything malformed is dropped."""
    out: dict[str, dict[str, Any]] = {}
    items = payload.get("items") if isinstance(payload, dict) else None
    if not isinstance(items, list):
        return out
    for item in items:
        if not isinstance(item, dict):
            continue
        n = item.get("n")
        if not isinstance(n, int) or not 1 <= n <= len(rows):
            continue
        tone, scope = item.get("tone"), item.get("scope")
        if tone not in TONES or scope not in SCOPES:
            continue
        row = rows[n - 1]
        out[str(row["id"])] = {"tone": tone, "scope": scope, "theme": clean_theme(item.get("theme"))}
    return out


def label_batch(client: Any, model: str, rows: list[dict[str, Any]], themes: Iterable[str]) -> dict[str, dict[str, Any]]:
    response = client.messages.create(
        model=model,
        max_tokens=16000,
        system=SYSTEM,
        messages=[{"role": "user", "content": build_prompt(rows, themes)}],
        output_config={"effort": "low", "format": {"type": "json_schema", "schema": SCHEMA}},
    )
    if response.stop_reason == "refusal":
        return {}
    text = next((block.text for block in response.content if block.type == "text"), "")
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        return {}
    return parse_labels(payload, rows)


MERGE_SYSTEM = """You tidy story names for a news app. You get theme names, each with how many headlines carry it.
Some names describe the same story in different words ("Nvidia CEO probe" and "Nvidia governance concerns";
"Oil prices" and "Crude oil slide"). Map every name that duplicates another to the single best name for that
story, preferring the clearer and more specific wording, usually the one with more headlines. Leave distinct stories
apart: two different companies' news are never the same story. Return only the names that change."""

MERGE_SCHEMA = {
    "type": "object",
    "properties": {
        "merges": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"from": {"type": "string"}, "to": {"type": "string"}},
                "required": ["from", "to"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["merges"],
    "additionalProperties": False,
}


def parse_merges(payload: Any, counts: dict[str, int]) -> dict[str, str]:
    """``{old name: canonical name}`` for names that exist; chains are followed, cycles dropped."""
    mapping: dict[str, str] = {}
    merges = payload.get("merges") if isinstance(payload, dict) else None
    for row in merges if isinstance(merges, list) else []:
        if not isinstance(row, dict):
            continue
        source, target = clean_theme(row.get("from")), clean_theme(row.get("to"))
        if source and target and source != target and source in counts:
            mapping[source] = target
    resolved: dict[str, str] = {}
    for source in mapping:
        seen = {source}
        target = mapping[source]
        while target in mapping and target not in seen:
            seen.add(target)
            target = mapping[target]
        if target not in seen:
            resolved[source] = target
    return resolved


def merge_themes(client: Any, model: str, counts: dict[str, int]) -> dict[str, str]:
    """One call over the window's theme names to fold duplicates together."""
    names = [name for name, _ in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))][:400]
    if len(names) < 2:
        return {}
    response = client.messages.create(
        model=model,
        max_tokens=16000,
        system=MERGE_SYSTEM,
        messages=[{"role": "user", "content": "\n".join(f"{name} ({counts[name]})" for name in names)}],
        output_config={"effort": "low", "format": {"type": "json_schema", "schema": MERGE_SCHEMA}},
    )
    if response.stop_reason == "refusal":
        return {}
    text = next((block.text for block in response.content if block.type == "text"), "")
    try:
        return parse_merges(json.loads(text), counts)
    except json.JSONDecodeError:
        return {}


def note_skip(reason: str, *, store: Any = None, dry_run: bool = False) -> dict[str, Any]:
    """Say on the meta doc why the job did nothing, so a stalled label feed shows its cause.

    Only ``skipped`` and ``skipped_at`` are written: ``updated_at`` stays the time labels were last written, which is
    what the wire reads as the labels' age. A store that cannot be reached is not an error here.
    """
    if not dry_run:
        try:
            (store or DocStore.from_env()).set(META_PATH, {"skipped": reason, "skipped_at": iso_now()}, merge=True)
        except Exception as error:  # noqa: BLE001 - the skip itself is the result; the note is best effort
            print(f"[news_tone] could not note the skip: {type(error).__name__}", flush=True)
    return {"skipped": reason}


def run(*, hours: int = 48, limit: int | None = None, dry_run: bool = False, model: str | None = None) -> dict[str, Any]:
    try:
        import anthropic  # only this job needs it
    except ImportError:
        return note_skip("the anthropic package is not installed", dry_run=dry_run)
    if not os.getenv("ANTHROPIC_API_KEY", "").strip():
        return note_skip("ANTHROPIC_API_KEY is not set", dry_run=dry_run)

    model = model or os.getenv("NEWS_TONE_MODEL", "").strip() or DEFAULT_MODEL
    store = DocStore.from_env()
    since = (utc_now() - timedelta(hours=hours)).isoformat()
    headlines = [data for _, data in query(store, SOURCE, filters=[("published_at", ">=", since)], limit=10000)]
    headlines = [row for row in headlines if row.get("id") and row.get("title")]
    labelled = {data.get("id"): data for _, data in query(store, COLLECTION, filters=[("published_at", ">=", since)], limit=10000)}
    themes = {str(data.get("theme")) for data in labelled.values() if data.get("theme")}
    todo = [row for row in headlines if row["id"] not in labelled or labelled[row["id"]].get("title") != row.get("title")]
    todo.sort(key=lambda row: str(row.get("published_at") or ""), reverse=True)
    if limit:
        todo = todo[:limit]

    client = anthropic.Anthropic()
    now_iso = iso_now()
    written = failed = 0
    for start in range(0, len(todo), BATCH):
        rows = todo[start : start + BATCH]
        try:
            labels = label_batch(client, model, rows, themes)
        except (anthropic.APIConnectionError, anthropic.RateLimitError, anthropic.APIStatusError) as error:
            print(f"[news_tone] batch {start // BATCH + 1} failed: {type(error).__name__}", flush=True)
            failed += len(rows)
            continue
        writes = []
        for row in rows:
            label = labels.get(str(row["id"]))
            if not label:
                failed += 1
                continue
            if label["theme"]:
                themes.add(label["theme"])
            writes.append(
                (
                    f"{COLLECTION}/{row['id']}",
                    {
                        "id": row["id"],
                        "title": row.get("title"),
                        "published_at": row.get("published_at"),
                        **label,
                        "method": METHOD,
                        "model": model,
                        "scored_at": now_iso,
                    },
                )
            )
        if writes and not dry_run:
            # A new label changes the tone on its stocks' pages (backend/serve_docs.py): stale before and after.
            toned = news_tickers(row for row in rows if labels.get(str(row["id"])))
            mark_dirty_in_store(store, toned, ["news"])
            try:
                store.set_many(writes, merge=True)
            finally:
                mark_dirty_in_store(store, toned, ["news"])
        written += len(writes)
        print(f"[news_tone] batch {start // BATCH + 1}: {len(writes)}/{len(rows)} labelled", flush=True)

    # The stock pages whose headline tone changed are dropped from the page cache (backend/serve_docs.py).
    if not dry_run:
        refresh_stamped_pages()

    # Fold duplicate story names together across the whole window, labelled earlier or now.
    merged = 0
    current = {data.get("id"): data for _, data in query(store, COLLECTION, filters=[("published_at", ">=", since)], limit=10000)} if not dry_run else {}
    counts: dict[str, int] = {}
    for data in current.values():
        if data.get("theme"):
            counts[str(data["theme"])] = counts.get(str(data["theme"]), 0) + 1
    try:
        mapping = merge_themes(client, model, counts) if counts else {}
    except (anthropic.APIConnectionError, anthropic.RateLimitError, anthropic.APIStatusError) as error:
        print(f"[news_tone] theme merge failed: {type(error).__name__}", flush=True)
        mapping = {}
    renames = [
        (f"{COLLECTION}/{doc_id}", {"theme": mapping[str(data["theme"])], "theme_raw": data.get("theme_raw") or data["theme"]})
        for doc_id, data in current.items()
        if doc_id and data.get("theme") and str(data["theme"]) in mapping
    ]
    if renames and not dry_run:
        store.set_many(renames, merge=True)
        merged = len(renames)

    if not dry_run:
        if written == 0 and failed > 0:
            # Every batch failed (a revoked key, an outage): say so, and leave ``updated_at`` as the last time labels
            # were written, so the stall shows instead of looking like a fresh run.
            store.set(META_PATH, {"skipped": f"every batch failed ({failed} headlines)", "skipped_at": now_iso, "failed": failed}, merge=True)
        else:
            store.set(
                META_PATH,
                {"market": "US", "updated_at": now_iso, "model": model, "method": METHOD, "window_hours": hours, "labelled": written, "failed": failed, "theme_renames": merged, "skipped": None},
                merge=True,
            )
    return {"headlines": len(headlines), "already": len(headlines) - len(todo), "labelled": written, "failed": failed, "themes": len(counts), "theme_renames": merged}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--hours", type=int, default=48, help="label headlines published in this window")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--model", default=None)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    print(f"[news_tone] {run(hours=args.hours, limit=args.limit, dry_run=args.dry_run, model=args.model)}", flush=True)


if __name__ == "__main__":
    main()
