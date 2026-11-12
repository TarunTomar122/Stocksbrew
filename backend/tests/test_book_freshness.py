"""Edits to a person's stocks reach the scheduled view build and the emails (docs/data-freshness-audit.md).

Every store here is a throwaway SQLite file or an in-memory fake: nothing touches a real LocalDB.
"""
from __future__ import annotations

import os
import sys
import tempfile
from datetime import date, datetime, timezone

import pytest

from backend.localdb.firestore import LocalFirestoreClient
from backend.mail import alerts, jobs, send
from backend.mail import data as mail_data
from backend.mail.data import Stock
from backend.storage import TraceMoneyStore

NOW = datetime(2026, 11, 10, 15, 0, tzinfo=timezone.utc)  # 10am ET Tuesday
EARLY = datetime(2026, 11, 10, 12, 0, tzinfo=timezone.utc)  # 7am ET Tuesday

HOLDING = {"quantity": 10, "average_cost": 150.0, "market_value": None, "currency": "USD", "source": "manual"}


@pytest.fixture()
def store():
    tmp = tempfile.TemporaryDirectory()
    s = object.__new__(TraceMoneyStore)
    s.db = LocalFirestoreClient(os.path.join(tmp.name, "docs.sqlite3"))
    yield s
    tmp.cleanup()


def _user(store, uid="u1", **fields):
    doc = {
        "tracked_stocks": ["US_AAPL", "US_NVDA"],
        "watchlist_positions": {"US_AAPL": "holding", "US_NVDA": "watchlist"},
        "watchlist_holdings": {"US_AAPL": dict(HOLDING)},
        "watchlist_version": 5,
        **fields,
    }
    store.db.collection("users").document(uid).set(doc)
    return doc


# ------------------------------------------------------------- step 3: the scheduled view build


def test_scheduled_build_reads_share_counts(store):
    _user(store)
    users = store.list_subscribed_users()
    assert [u["uid"] for u in users] == ["u1"]
    assert users[0]["watchlist_holdings"] == {"US_AAPL": HOLDING}


def test_guarded_save_writes_only_the_newest_book(store):
    _user(store)
    assert store.save_watchlist_view_if_current("u1", {"rows": [], "source_version": 5}, source_version=5)
    assert store.get_watchlist_view("u1")["source_version"] == 5

    # The person edited their list while the build ran: version 6 is on the user doc now.
    store.db.collection("users").document("u1").set({"watchlist_version": 6}, merge=True)
    assert not store.save_watchlist_view_if_current("u1", {"rows": ["old"], "source_version": 5}, source_version=5)
    assert store.get_watchlist_view("u1")["rows"] == []

    # The web rebuilt the view from version 7; a build from 6 must not overwrite it.
    store.db.collection("users").document("u1").set({"watchlist_version": 7}, merge=True)
    store.db.collection("tm_watchlist_views").document("u1").set({"rows": ["web"], "source_version": 7})
    assert not store.save_watchlist_view_if_current("u1", {"rows": ["stale"], "source_version": 6}, source_version=6)
    assert store.get_watchlist_view("u1")["rows"] == ["web"]
    assert store.save_watchlist_view_if_current("u1", {"rows": ["new"], "source_version": 7}, source_version=7)
    assert store.get_watchlist_view("u1")["rows"] == ["new"]


def test_build_job_passes_holdings_and_skips_a_user_who_edited_mid_build(store, monkeypatch):
    from backend.scripts import build_watchlist_views as job

    _user(store, "u1")
    _user(store, "u2")
    seen: dict[str, dict] = {}
    events: list[str] = []

    def fake_build(_store, uid, tracked, **kw):
        seen[uid] = kw["holdings"]
        if uid == "u2":  # an edit lands while this user's view is being built
            store.db.collection("users").document("u2").set({"watchlist_version": 6}, merge=True)
        return {"rows": [], "tracked_count": len(tracked), "pulse": {"headline": ""}, "portfolio": {}}

    monkeypatch.setattr(job, "TraceMoneyStore", lambda: store)
    monkeypatch.setattr(job, "_active_universe_cache", lambda _s: {})
    monkeypatch.setattr(job, "build_watchlist_view", fake_build)
    monkeypatch.setattr(job, "_queue_directive_change_events", lambda _s, **kw: events.append(kw["uid"]) or 0)
    monkeypatch.setattr(sys, "argv", ["build_watchlist_views", "--no-llm"])
    job.main()

    assert seen["u1"] == {"US_AAPL": HOLDING} and seen["u2"] == {"US_AAPL": HOLDING}
    assert store.get_watchlist_view("u1")["source_version"] == 5
    assert store.get_watchlist_view("u2") is None  # skipped, not written from the old book
    assert events == ["u1"]  # no call-change or earnings events for the skipped user


# ------------------------------------------------------------- step 4: emails read the live book


class FakeSource:
    def __init__(self, docs: dict[str, dict], queries: dict[str, list] | None = None):
        self.docs = docs
        self.queries = queries or {}

    def get(self, path):
        return self.docs.get(path)

    def get_many(self, paths):
        return {p: self.docs[p] for p in paths if p in self.docs}

    def query(self, collection, filters=None, *, limit=None, select=None):
        return list(self.queries.get(collection, []))

    def children(self, parent_path, collection, *, limit=200):
        return []


def _view_row(iid, position):
    return {"instrument_id": iid, "ticker": iid.split("_", 1)[1], "market": "US", "position_type": position}


def test_email_uses_the_live_holding_or_watching_not_the_view_row():
    # The view still says AAPL is held; the person moved it to Watching and bought NVDA since the last build.
    src = FakeSource({
        "users/u1": {"email": "a@example.com", "tracked_stocks": ["US_AAPL", "US_NVDA"],
                     "watchlist_positions": {"US_AAPL": "watchlist", "US_NVDA": "holding"},
                     "watchlist_holdings": {"US_NVDA": dict(HOLDING)}},
        "tm_watchlist_views/u1": {"rows": [_view_row("US_AAPL", "holding"), _view_row("US_NVDA", "watchlist")]},
    })
    person = mail_data.load_person(src, "u1", now=NOW, with_news=False, with_calls=False)
    assert {s.ticker: s.position for s in person.stocks} == {"AAPL": "watchlist", "NVDA": "holding"}


def test_email_falls_back_to_the_view_row_only_without_a_positions_map():
    src = FakeSource({
        "users/u1": {"email": "a@example.com", "tracked_stocks": ["US_AAPL"]},
        "tm_watchlist_views/u1": {"rows": [_view_row("US_AAPL", "holding")]},
    })
    person = mail_data.load_person(src, "u1", now=NOW, with_news=False, with_calls=False)
    assert [s.position for s in person.stocks] == ["holding"]


def test_someone_who_removed_every_stock_gets_no_rows_from_the_old_view():
    src = FakeSource({
        "users/u1": {"email": "a@example.com", "tracked_stocks": []},
        "tm_watchlist_views/u1": {"rows": [_view_row("US_AAPL", "holding")]},
    })
    person = mail_data.load_person(src, "u1", now=NOW, with_news=False, with_calls=False)
    assert person.tracked_ids == [] and person.stocks == []


# ------------------------------------------------------------- step 5: a removed stock's alerts are paused


def _price_alert(**kw):
    return {"uid": "u1", "ticker": "AAPL", "instrument_id": "US_AAPL", "condition": "below", "target_price": 100.0,
            "kind": "price_threshold", "active": True, "triggered": False, **kw}


def test_mail_v2_skips_paused_price_alerts():
    src = FakeSource({}, {"tm_alerts": [("tm_alerts/a1", _price_alert()), ("tm_alerts/a2", _price_alert(paused_reason="removed"))]})
    assert [a["id"] for a in alerts.load_price_alerts(src)["u1"]] == ["a1"]


def test_old_price_alert_sender_skips_paused_alerts(store):
    from backend.price_alerts import load_active_price_alerts

    store.db.collection("tm_alerts").document("a1").set(_price_alert())
    store.db.collection("tm_alerts").document("a2").set(_price_alert(paused_reason="removed"))
    store.db.collection("tm_alerts").document("a3").set(_price_alert(paused_reason=None))  # resumed
    assert sorted(a["id"] for a in load_active_price_alerts(store)) == ["a1", "a3"]


# ------------------------------------------------------------- bug 4: the earnings reminder toggle sends


def _reminder(**kw):
    return {"uid": "u1", "ticker": "AAPL", "instrument_id": "US_AAPL", "kind": "earnings_24h", "active": True,
            "triggered": False, "metadata": {"event_date": "2026-10-01"}, **kw}


def _aapl(day: date | None, time: str = "amc") -> Stock:
    s = Stock(id="US_AAPL", ticker="AAPL", name="Apple Inc.", position="holding", price=230.0, change_pct=1.2,
              price_at=datetime(2026, 11, 9, 21, 0, tzinfo=timezone.utc))
    s.earnings_date, s.earnings_time = day, time
    return s


def test_reminders_load_only_live_unpaused_toggles():
    src = FakeSource({}, {"tm_alerts": [("tm_alerts/r1", _reminder()), ("tm_alerts/r2", _reminder(paused_reason="removed")),
                                        ("tm_alerts/r3", _reminder(uid="")), ("tm_alerts/p1", _price_alert())]})
    assert [a["id"] for a in alerts.load_earnings_reminders(src)["u1"]] == ["r1"]


def test_reminder_goes_out_the_day_before_from_9am_on_the_calendar_date():
    tomorrow = date(2026, 11, 11)
    email = alerts.build_earnings_reminder(_aapl(tomorrow), _reminder(id="r1"), now=NOW)
    assert email is not None
    assert email.subject == "AAPL reports tomorrow after the close"
    assert "Earnings Wednesday, Nov 11 after the close." in email.text
    assert email.kind == "earnings_reminder" and email.category == "alerts"
    assert email.meta["event_date"] == "2026-11-11"
    assert alerts.build_earnings_reminder(_aapl(tomorrow), _reminder(), now=EARLY) is None  # not before 9am ET
    assert alerts.build_earnings_reminder(_aapl(date(2026, 11, 12)), _reminder(), now=NOW) is None  # two days out
    assert alerts.build_earnings_reminder(_aapl(date(2026, 11, 10)), _reminder(), now=NOW) is None  # today
    assert alerts.build_earnings_reminder(_aapl(None), _reminder(), now=NOW) is None


PRO = {"email": "a@x.com", "is_subscribed": True, "subscriptionStatus": "active"}


def test_reminder_job_dedupes_per_report_and_never_marks_the_toggle_fired(monkeypatch):
    monkeypatch.setattr(jobs, "stocks_by_id", lambda src, ids, now=None: [_aapl(None)])
    calendar = {("US", "AAPL"): (date(2026, 11, 11), "bmo")}
    hist = send.History(keys=set(), by_category_today={"alerts": 9}, last_by_kind={})
    planned = jobs._earnings_reminder_emails(None, PRO, NOW, hist, [_reminder(id="r1")], calendar)
    assert len(planned) == 1
    email, key = planned[0]  # two entries: no "after send" step, so the toggle stays on for next quarter
    assert key == "earnings_24h:r1:2026-11-11"
    assert email.subject == "AAPL reports tomorrow before the open"
    out = send.deliver(store=None, uid="u1", user={"email": "a@x.com"}, email=email, dedupe_key=key, history=hist, dry_run=True)
    assert out.status == "dry_run"  # the agent-alert cap does not hold a reminder back
    hist.keys.add(key)
    assert jobs._earnings_reminder_emails(None, PRO, NOW, hist, [_reminder(id="r1")], calendar) == []


def test_reminder_is_pro_only_and_matches_market_and_ticker(monkeypatch):
    monkeypatch.setattr(jobs, "stocks_by_id", lambda src, ids, now=None: [_aapl(None)])
    hist = send.History(keys=set(), by_category_today={}, last_by_kind={})
    tomorrow = (date(2026, 11, 11), "amc")
    assert jobs._earnings_reminder_emails(None, {"email": "a@x.com"}, NOW, hist, [_reminder(id="r1")],
                                          {("US", "AAPL"): tomorrow}) == []  # Free: the toggle is a Pro alert
    # an Indian listing with the same ticker reporting tomorrow is not this stock
    assert jobs._earnings_reminder_emails(None, PRO, NOW, hist, [_reminder(id="r1")], {("IN", "AAPL"): tomorrow}) == []


def test_reminder_calendar_reads_tomorrow_once_keyed_by_market():
    seen = []

    class Src:
        def query(self, collection, filters=None, **kw):
            seen.append((collection, filters))
            return [("e/1", {"ticker": "aapl", "event_date": "2026-11-11", "time": "AMC", "market": "US"}),
                    ("e/2", {"ticker": "INFY", "event_date": "2026-11-11", "market": "IN"})]

    cal = alerts.load_earnings_calendar(Src(), NOW)
    assert seen == [("tm_earnings_events", [("event_date", "==", "2026-11-11")])]
    assert cal == {("US", "AAPL"): (date(2026, 11, 11), "amc"), ("IN", "INFY"): (date(2026, 11, 11), "")}


def test_reminders_only_with_their_flag_mail_v2_and_the_old_alerts_off(monkeypatch):
    for name in ("EARNINGS_REMINDER_ACTIVE", "MAIL_V2_ACTIVE", "LEGACY_ALERTS"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("MAIL_V2_ACTIVE", "1")
    assert not alerts.earnings_reminders_enabled()  # off by default: the owner turns it on
    monkeypatch.setenv("EARNINGS_REMINDER_ACTIVE", "1")
    assert alerts.earnings_reminders_enabled()
    monkeypatch.delenv("MAIL_V2_ACTIVE")
    assert not alerts.earnings_reminders_enabled()
    monkeypatch.setenv("MAIL_V2_ACTIVE", "1")
    monkeypatch.setenv("LEGACY_ALERTS", "1")  # the old sender mails its own earnings note
    assert not alerts.earnings_reminders_enabled()
    assert not alerts.earnings_reminder_window(EARLY) and alerts.earnings_reminder_window(NOW)


def test_alerts_run_sends_no_reminder_without_the_flag(monkeypatch):
    """The whole alerts run, dry, with a Pro person whose stock reports tomorrow: no reminder unless the flag is on."""
    monkeypatch.delenv("EARNINGS_REMINDER_ACTIVE", raising=False)
    monkeypatch.setenv("MAIL_V2_ACTIVE", "1")
    monkeypatch.delenv("LEGACY_ALERTS", raising=False)
    reads = []

    class Src:
        def get(self, path):
            return None

        def get_many(self, paths):
            return {}

        def query(self, collection, filters=None, **kw):
            reads.append((collection, filters))
            if collection == "users":
                return [("users/u1", {**PRO, "tracked_stocks": ["US_AAPL"]})]
            if collection == "tm_alerts" and ("kind", "==", "earnings_24h") in (filters or []):
                return [("tm_alerts/r1", _reminder())]
            if collection == "tm_earnings_events":
                return [("e/1", {"ticker": "AAPL", "event_date": "2026-11-11", "time": "amc", "market": "US"})]
            return []

        def children(self, *a, **k):
            return []

    monkeypatch.setattr(jobs, "open_source", lambda sending: (Src(), None))
    monkeypatch.setattr(jobs, "stocks_by_id", lambda src, ids, now=None: [_aapl(None)])
    monkeypatch.setattr(jobs, "_alerts", lambda *a, **k: [])
    monkeypatch.setattr(send.History, "load", classmethod(lambda cls, src, uid, now: send.History(set(), {}, {})))
    stats = jobs.run("alerts", dry_run=True, only_uid=None, to=None, limit=0, now=NOW)
    assert stats["dry_run"] == 0
    assert not any(c == "tm_earnings_events" or ("kind", "==", "earnings_24h") in (f or []) for c, f in reads)

    monkeypatch.setenv("EARNINGS_REMINDER_ACTIVE", "1")  # the same run with the flag on plans the reminder
    stats = jobs.run("alerts", dry_run=True, only_uid=None, to=None, limit=0, now=NOW)
    assert stats["dry_run"] == 1
