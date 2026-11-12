"""The note at each rebalance: detection in the strategies job, and the Pro email built from it."""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

import pytest

from backend.agentdata import backtest_fixture as fixture
from backend.agentdata import backtest_strategies as job
from backend.mail import jobs, kit, rebalance, send

MOMENTUM = {"rank": [{"type": "momentum", "months": 6, "skip_months": 1}], "holdings": 4}
TREND = {"filters": [{"type": "trend", "ma_days": 200, "min": 0}], "rank": [{"type": "momentum", "months": 3, "skip_months": 0}], "holdings": 4}
EXIT = dict(TREND, market_filter={"symbol": "SPY", "ma_days": 200})


@pytest.fixture(scope="module")
def world():
    panel = fixture.build_panel()
    prices = panel["prices"]
    data = {"prices": prices, "size_factors": panel["size_factors"], "events": [], "fundamentals": panel["fundamentals"]}
    group = {
        "id": "test", "label": "test companies", "description": "made-up companies", "kind": "stocks", "partial": True,
        "symbols": sorted(symbol for symbol in prices if symbol != "SPY"),
    }
    names = {symbol: f"{symbol} Inc." for symbol in prices}
    return {"prices": prices, "data": data, "group": group, "names": names}


def _definition(spec):
    return {"slug": "test", "name": "Test leaders", "style": "T", "tagline": "t", "summary": "s", "rules": ["one"],
            "watch_out": "w", "universe": "test", "spec": spec}


def _cut(prices, day):
    out = {}
    for symbol, series in prices.items():
        keep = len([d for d in series["dates"] if d <= day])
        out[symbol] = {"dates": series["dates"][:keep], "closes": series["closes"][:keep]}
    return out


def _run(world, spec, *, cut=None, previous=None, previous_run=None, today="2022-11-01"):
    prices = _cut(world["prices"], cut) if cut else world["prices"]
    out: list[dict] = []
    doc, run = job.run_strategy(_definition(spec), world["group"], dict(world["data"], prices=prices), world["names"], {},
                                previous, previous_run, today, rebalances_out=out)
    return doc, run, out


def _rebalanced(world, spec, cut="2022-07-20"):
    doc1, run1, first = _run(world, spec, cut=cut, today=cut)
    assert first == []  # nothing to compare with on the first publish
    doc2, run2, out = _run(world, spec, previous=doc1, previous_run=run1)
    return doc1, doc2, run2, out


# ------------------------------------------------------------------ detection

def test_a_new_month_basket_writes_one_record_with_what_changed(world):
    doc1, doc2, _, out = _rebalanced(world, MOMENTUM)
    assert len(out) == 1
    record = out[0]
    before = {h["symbol"] for h in doc1["basket"]["holdings"]}
    after = {h["symbol"] for h in doc2["basket"]["holdings"]}
    assert {a["symbol"] for a in record["added"]} == after - before
    assert {r["symbol"] for r in record["removed"]} == before - after
    assert {k["symbol"] for k in record["kept"]} == before & after
    assert record["signal_date"] == doc2["basket"]["as_of"]
    assert record["trade_date"] == doc2["last_rebalance"]["trade_date"]
    assert record["date"] == record["trade_date"]
    assert record["previous_as_of"] == doc1["basket"]["as_of"]
    assert job.rebalance_path(record) == f"tm_strategy_rebalances/test__{record['signal_date']}"
    for added in record["added"]:
        assert added["weight"] == pytest.approx(0.25) and added["reason"] and added["name"]
    for removed in record["removed"]:
        assert removed["cause"] == "rank"
        assert re.search(r"Rank \d+ of \d+, and the rules hold 4\.", removed["reason"])


def test_the_why_comes_from_the_rule_in_plain_words(world):
    _, _, _, out = _rebalanced(world, MOMENTUM)
    why = out[0]["why"]
    assert why.startswith("Each month the rules hold the 4 with the highest 6-month return.")
    assert "slipped out of that group" in why and "came in." in why
    assert "…" not in why and "  " not in why


def test_a_stock_that_fails_a_filter_is_named_with_the_number(world):
    _, _, _, out = _rebalanced(world, TREND)
    removed = {r["symbol"]: r for r in out[0]["removed"]}
    filtered = [r for r in removed.values() if r["cause"] == "filter"]
    assert filtered, removed
    assert all(re.match(r"Closed \d+\.\d% below its 200-day average", r["reason"]) for r in filtered)
    assert "below their 200-day average" in out[0]["why"] or "below its 200-day average" in out[0]["why"]


def test_the_market_exit_says_everything_went_to_cash(world):
    _, doc2, _, out = _rebalanced(world, EXIT)
    record = out[0]
    assert record["market_ok"] is False and record["added"] == [] and record["kept"] == []
    assert record["headline"] == "Sold every stock and moved to cash."
    assert all(r["cause"] == "market" for r in record["removed"])
    assert doc2["basket"]["holdings"] == []


def test_a_rerun_in_the_same_month_writes_nothing(world):
    _, doc2, run2, _ = _rebalanced(world, MOMENTUM)
    _, _, again = _run(world, MOMENTUM, previous=doc2, previous_run=run2, today="2022-11-02")
    assert again == []


def test_the_same_inputs_give_the_same_record(world):
    _, _, _, first = _rebalanced(world, MOMENTUM)
    _, _, _, second = _rebalanced(world, MOMENTUM)
    strip = lambda r: {k: v for k, v in r.items() if k != "generated_at"}
    assert strip(first[0]) == strip(second[0])


def test_a_failed_backtest_is_not_a_rebalance(world, monkeypatch):
    doc1, run1, _ = _run(world, MOMENTUM, cut="2022-07-20", today="2022-07-20")

    def broken(*args, **kwargs):
        raise job.backtest.BacktestError("no data tonight")

    monkeypatch.setattr(job.backtest, "run_backtest", broken)
    # mid-month fallback to today's picks: a new basket date, but not the scheduled rebalance
    _, _, out = _run(world, MOMENTUM, previous=doc1, previous_run=run1, cut="2022-08-10", today="2022-08-10")
    assert out == []


def test_a_broken_note_never_stops_the_publish(world, monkeypatch):
    doc1, run1, _ = _run(world, MOMENTUM, cut="2022-07-20", today="2022-07-20")
    monkeypatch.setattr(job, "rebalance_record", lambda *a, **k: 1 / 0)
    doc2, _, out = _run(world, MOMENTUM, previous=doc1, previous_run=run1)
    assert out == [] and doc2["basket"]["holdings"]


def test_one_kept_stock_reads_naturally(world):
    _, _, _, out = _rebalanced(world, MOMENTUM)
    assert "1 of them" not in out[0]["why"]


def test_an_unchanged_basket_is_not_a_rebalance():
    basket = {"as_of": "2026-10-30", "holdings": [{"symbol": "AAA", "weight": 0.5}, {"symbol": "BBB", "weight": 0.5}], "cash_weight": 0}
    assert job.is_new_rebalance({"as_of": "2026-09-30"}, basket)
    assert not job.is_new_rebalance({"as_of": "2026-10-01"}, basket)  # same month
    assert not job.is_new_rebalance({"as_of": "2026-11-28"}, basket)  # older than what was published
    assert not job.is_new_rebalance(None, basket)


def test_top_group_reads_naturally():
    spec = lambda **kw: {"holdings": kw.pop("n", 25), **kw}
    assert job.top_group(spec(rank=[{"type": "low_volatility", "days": 252}])) == "the 25 with the steadiest prices"
    assert job.top_group(spec(n=10, rank=[{"type": "size"}])) == "the 10 largest"
    assert job.top_group(spec(n=1, rank=[{"type": "momentum", "months": 12, "skip_months": 0}])) == "the one with the highest 12-month return"
    both = job.top_group(spec(rank=[{"type": "momentum", "months": 12, "skip_months": 1}, {"type": "low_volatility", "days": 252}]))
    assert both == "the 25 with the best combined rank on 12-month return and steady prices"


# ----------------------------------------------------------------------- mail

NOW = datetime(2026, 12, 1, 23, 30, tzinfo=timezone.utc)


def _record(slug="momentum-12-1", name="Momentum leaders", day="2026-12-01", written=NOW - timedelta(hours=1), **kw):
    record = {
        "slug": slug, "name": name, "kind": "stocks", "date": day, "signal_date": "2026-11-30", "trade_date": day,
        "headline": "2 stocks came in, 2 left and 23 stayed.",
        "why": "Each month the rules hold the 25 with the highest 12-month return. NVDA and AMD came in. AVGO and MU left because they slipped out of that group. The other 23 stayed.",
        "added": [{"symbol": "NVDA", "weight": 0.04, "reason": "Up 61.2% over the 12 months to a month ago. Rank 3 of 480."},
                  {"symbol": "AMD", "weight": 0.04, "reason": "Up 40.1% over the 12 months to a month ago. Rank 19 of 480."}],
        "removed": [{"symbol": "AVGO", "previous_weight": 0.04, "cause": "rank", "reason": "Rank 27 of 480, and the rules hold 25."},
                    {"symbol": "MU", "previous_weight": 0.04, "cause": "rank", "reason": "Rank 31 of 480, and the rules hold 25."}],
        "kept": [], "previously_held": 25, "held": 25, "market_ok": True, "generated_at": written.isoformat(),
    }
    record.update(kw)
    return record


def _user(pro=True, slugs=("momentum-12-1",), since="2026-11-01T00:00:00Z", **kw):
    user = {"email": "a@example.com", "tracked_strategies": [{"slug": s, "tracked_at": since} for s in slugs]}
    if pro:
        user.update(is_subscribed=True, subscriptionStatus="active")
    user.update(kw)
    return user


def test_only_pro_followers_get_the_note():
    records = [_record()]
    assert rebalance.due(_user(), records, NOW) == ("2026-12-01", records)
    assert rebalance.due(_user(pro=False), records, NOW) is None
    assert rebalance.due(_user(slugs=("quality",)), records, NOW) is None
    assert rebalance.due(_user(slugs=()), records, NOW) is None
    # followed after the rebalance was written: not news to them
    assert rebalance.due(_user(since="2026-12-01T23:00:00Z"), records, NOW) is None


def test_the_note_waits_until_the_whole_run_has_landed():
    early = [_record(written=NOW - timedelta(minutes=5))]
    assert rebalance.due(_user(), early, NOW) is None
    # one strategy written late holds back the whole day, so the email has them all
    mixed = [_record(written=NOW - timedelta(hours=2)), _record(slug="quality", name="Quality", written=NOW - timedelta(minutes=5))]
    assert rebalance.due(_user(slugs=("momentum-12-1", "quality")), mixed, NOW) is None
    later = NOW + timedelta(minutes=40)
    day, picked = rebalance.due(_user(slugs=("momentum-12-1", "quality")), mixed, later)
    assert day == "2026-12-01" and len(picked) == 2


def test_one_email_per_rebalance_day():
    records = [_record(day="2026-11-02", written=NOW - timedelta(days=2)), _record(), _record(slug="quality", name="Quality")]
    day, picked = rebalance.due(_user(slugs=("momentum-12-1", "quality")), records, NOW)
    assert day == "2026-12-01" and [r["slug"] for r in picked] == ["momentum-12-1", "quality"]
    assert rebalance.dedupe_key(day) == "strategy_rebalance_2026-12-01"


def test_the_note_reads_plainly_and_follows_the_kit_rules():
    evening = datetime(2026, 12, 1, 23, 0, tzinfo=timezone.utc)  # the evening of the rebalance
    single = rebalance.build_note([_record()], now=evening)
    assert single.subject == "Momentum leaders swapped 2 of its 25 stocks"
    assert single.kind == "strategy_rebalance" and single.category == "alerts"
    assert "NVDA" in single.text and "Out  AVGO" in single.text and "In   NVDA" in single.text
    assert "You get this because you follow a strategy on stocksbrew." in single.text
    assert "The rules' picks at yesterday's close, not trades made for you." in single.text
    assert single.text.startswith("Rebalance · Today")
    many = rebalance.build_note([_record(), _record(slug="quality", name="Quality", market_ok=False, added=[], kept=[])], now=evening)
    assert "2 strategies you follow rebalanced today." in many.text
    assert many.subject.startswith("2 of your strategies rebalanced: Momentum leaders and Quality")
    assert "Quality sold everything and moved to cash" in many.text
    for email in (single, many):
        sizes = [int(x) for x in re.findall(r"font-size:(\d+)px", email.html)]
        assert min(sizes) >= 13
        assert email.html.count(f"background:{kit.t.COPPER}'") <= 1
        assert "<script" not in email.html
        assert "/strategies" in email.html
    assert rebalance.build_note([]) is None


def test_long_changes_point_at_the_page():
    added = [{"symbol": f"S{i}", "weight": 0.04, "reason": ""} for i in range(30)]
    email = rebalance.build_note([_record(added=added)])
    assert "Plus 6 more on the strategy page." in email.text and "And 26 more on the strategy page." in email.text
    # the two that left still show next to the thirty that came in
    assert "Out  AVGO" in email.text and "Out  MU" in email.text


def test_a_bad_record_costs_only_the_note():
    hist = send.History(keys=set(), by_category_today={}, last_by_kind={})
    assert jobs._rebalance_notes(None, _user(), NOW, hist, [{"slug": "momentum-12-1", "date": "2026-12-01", "generated_at": 5}]) == []


def test_funds_are_not_linked_to_a_stock_page():
    email = rebalance.build_note([_record(kind="funds")])
    assert "/stock/NVDA" not in email.html
    assert "/stock/NVDA" in rebalance.build_note([_record()]).html


def test_the_alerts_job_adds_the_note_once_and_respects_preferences(monkeypatch):
    records = [_record()]
    hist = send.History(keys=set(), by_category_today={}, last_by_kind={})
    planned = jobs._rebalance_notes(None, _user(), NOW, hist, records)
    assert len(planned) == 1 and planned[0][1] == "strategy_rebalance_2026-12-01"
    email, key = planned[0]
    # alerts switched off: the same preference as every alert email
    out = send.deliver(store=None, uid="u1", user=_user(email_alerts_enabled=False), email=email, dedupe_key=key, history=hist, dry_run=True)
    assert out.status == "skipped_pref"
    out = send.deliver(store=None, uid="u1", user=_user(), email=email, dedupe_key=key, history=hist, dry_run=True)
    assert out.status == "dry_run"
    hist.keys.add(key)
    assert jobs._rebalance_notes(None, _user(), NOW, hist, records) == []
    assert jobs._rebalance_notes(None, _user(pro=False), NOW, send.History(set(), {}, {}), records) == []


def test_the_note_is_off_unless_switched_on(monkeypatch):
    monkeypatch.delenv("STRATEGY_REBALANCE_NOTES", raising=False)
    assert rebalance.enabled() is False
    monkeypatch.setenv("STRATEGY_REBALANCE_NOTES", "1")
    assert rebalance.enabled() is True
    assert "tracked_strategies" in jobs.USER_FIELDS
