from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from backend.mail import jobs, kit, send

NOW = datetime(2026, 11, 10, 13, 30, tzinfo=timezone.utc)  # Tuesday 8:30am ET


class FakeSource:
    def __init__(self, sends=None, events=None):
        self.sends = sends or []
        self.events = events or []

    def query(self, collection, filters=None, *, limit=None, select=None):
        rows = self.sends if collection == send.SENDS else self.events if collection == "tm_lifecycle_events" else []
        out = []
        for i, r in enumerate(rows):
            ok = True
            for f, op, v in filters or []:
                val = r.get(f)
                ok = ok and (val == v if op == "==" else str(val or "") >= v if op == ">=" else True)
            if ok:
                out.append((f"{collection}/{i}", r))
        return out


class FakeStore:
    def __init__(self):
        self.added = []
        store = self

        class _Coll:
            def add(self, payload):
                store.added.append(payload)

        class _Db:
            def collection(self, name):
                return _Coll()

        self.db = _Db()


def email(kind="daily_brief", category="daily") -> kit.Email:
    unsub = kit.unsubscribe_url(category)
    return kit.Email(kind=kind, category=category, subject="Hi", preheader="", html=f"<a href='{kit.esc(unsub)}'>x</a>",
                     text=f"stop: {unsub}", meta={"count": 1, "skip": [1]})


USER = {"email": "A@Example.com"}


def empty_history() -> send.History:
    return send.History(set(), {}, {})


# ----------------------------------------------------------------- preferences

def test_wants_respects_each_category_and_global_stops():
    assert send.wants({}, "daily")
    assert not send.wants({"email_digest_enabled": False}, "daily")
    assert send.wants({"email_digest_enabled": False}, "alerts")
    assert not send.wants({"email_product_enabled": False}, "product", "setup_nudge_d2")
    assert send.wants({"email_product_enabled": False}, "product", "welcome")
    assert not send.wants({"email_unsubscribed_all": True}, "product", "welcome")
    assert not send.wants({"unsubscribed": True}, "alerts")


def test_weekly_inherits_an_old_digest_opt_out_until_set():
    assert not send.wants({"email_digest_enabled": False}, "weekly")
    assert send.wants({"email_digest_enabled": False, "email_weekly_enabled": True}, "weekly")
    assert not send.wants({"email_weekly_enabled": False}, "weekly")
    assert send.wants({"email_weekly_enabled": False}, "daily")


# ----------------------------------------------------------------- unsubscribe

def test_token_matches_the_web_route(monkeypatch):
    monkeypatch.setenv("EMAIL_UNSUBSCRIBE_SECRET", "test-secret")
    # same value lib/email-unsubscribe.test.ts checks
    assert send.unsubscribe_token("abcUSER123", "daily") == "Vz-M2boyqs2a1kkkfjIGLpAw"
    assert send.unsubscribe_token("abcUSER123", "weekly") != "Vz-M2boyqs2a1kkkfjIGLpAw"


def test_no_secret_falls_back_to_settings(monkeypatch):
    monkeypatch.delenv("EMAIL_UNSUBSCRIBE_SECRET", raising=False)
    assert send.unsubscribe_token("u1", "daily") == ""
    assert send.unsubscribe_link("u1", "daily") == kit.settings_url()


def test_personalize_swaps_the_footer_link(monkeypatch):
    monkeypatch.setenv("EMAIL_UNSUBSCRIBE_SECRET", "test-secret")
    e = send.personalize(email(), "abcUSER123")
    assert "t=Vz-M2boyqs2a1kkkfjIGLpAw" in e.text and "u=abcUSER123" in e.text
    assert kit.esc(send.unsubscribe_link("abcUSER123", "daily")) in e.html


# ------------------------------------------------------------------- history

def test_history_counts_caps_per_et_day_and_tracks_the_alert_cursor():
    rows = [
        # 11:30pm ET on Nov 9 is Nov 10 in UTC: yesterday in ET, so not today's cap
        {"uid": "u1", "dedupe_key": "alerts_a", "email_type": "alerts", "sent_at": "2026-11-10T04:30:00+00:00",
         "meta": {"category": "alerts", "until": "2026-11-10T04:29:58+00:00"}},
        {"uid": "u1", "dedupe_key": "alerts_b", "email_type": "alerts", "sent_at": "2026-11-10T13:00:00+00:00",
         "meta": {"category": "alerts", "until": "2026-11-10T12:59:59+00:00"}},
        {"uid": "u1", "dedupe_key": "welcome", "email_type": "welcome", "sent_at": "2026-10-01T13:00:00+00:00",
         "meta": {"category": "product"}},
        {"uid": "other", "dedupe_key": "daily_x", "email_type": "daily_brief", "sent_at": "2026-11-10T13:00:00+00:00",
         "meta": {"category": "daily"}},
    ]
    h = send.History.load(FakeSource(rows), "u1", now=NOW)
    assert h.keys == {"alerts_a", "alerts_b", "welcome"}
    assert h.by_category_today == {"alerts": 1}
    assert h.alerts_until == datetime(2026, 11, 10, 12, 59, 59, tzinfo=timezone.utc)


def test_history_alert_cursor_falls_back_to_sent_at():
    rows = [{"uid": "u1", "dedupe_key": "alerts_a", "email_type": "alerts", "sent_at": "2026-11-10T13:00:00Z",
             "meta": None}]
    h = send.History.load(FakeSource(rows), "u1", now=NOW)
    assert h.alerts_until == datetime(2026, 11, 10, 13, 0, tzinfo=timezone.utc)
    assert h.by_category_today == {}


# ------------------------------------------------------------------- deliver

def test_deliver_dry_run_decides_like_a_real_send():
    hist = send.History({"daily_2026-11-09"}, {"product": 1, "alerts": 4}, {})
    kw = dict(store=None, uid="u1", history=hist, dry_run=True)
    assert send.deliver(user={}, email=email(), dedupe_key="k", **kw).status == "no_email"
    assert send.deliver(user=USER, email=email(), dedupe_key="daily_2026-11-09", **kw).status == "skipped_dupe"
    assert send.deliver(user={**USER, "email_digest_enabled": False}, email=email(), dedupe_key="k", **kw).status == "skipped_pref"
    assert send.deliver(user=USER, email=email("alerts", "alerts"), dedupe_key="k", **kw).status == "skipped_cap"
    assert send.deliver(user=USER, email=email("setup_nudge_d2", "product"), dedupe_key="k", **kw).status == "skipped_cap"
    # welcome ignores the product cap and the product switch
    assert send.deliver(user={**USER, "email_product_enabled": False}, email=email("welcome", "product"),
                        dedupe_key="welcome", **kw).status == "dry_run"
    assert send.deliver(user=USER, email=email(), dedupe_key="k", **kw).status == "dry_run"
    # a dry run records nothing
    assert "k" not in hist.keys


def test_deliver_to_override_skips_checks_and_logs_nothing(monkeypatch):
    sent = []
    monkeypatch.setattr(send, "_post_brevo", lambda to, e, h: sent.append(to) or True)
    store = FakeStore()
    hist = send.History({"k"}, {}, {})
    out = send.deliver(store=store, uid="u1", user={"email_digest_enabled": False}, email=email(), dedupe_key="k",
                       history=hist, dry_run=False, to_override="me@example.com")
    assert out.status == "sent" and sent == ["me@example.com"] and store.added == []


def test_deliver_logs_once_and_dedupes_the_rest_of_the_run(monkeypatch):
    monkeypatch.setenv("EMAIL_UNSUBSCRIBE_SECRET", "test-secret")
    headers_seen = []
    monkeypatch.setattr(send, "_post_brevo", lambda to, e, h: headers_seen.append(h) or True)
    store = FakeStore()
    hist = empty_history()
    first = send.deliver(store=store, uid="abcUSER123", user=USER, email=email(), dedupe_key="daily_2026-11-09",
                         history=hist, dry_run=False)
    again = send.deliver(store=store, uid="abcUSER123", user=USER, email=email(), dedupe_key="daily_2026-11-09",
                         history=hist, dry_run=False)
    assert (first.status, again.status) == ("sent", "skipped_dupe")
    assert len(store.added) == 1
    row = store.added[0]
    assert row["email"] == "a@example.com" and row["dedupe_key"] == "daily_2026-11-09"
    assert row["meta"] == {"count": 1, "category": "daily"}  # non-scalar meta is dropped
    h = headers_seen[0]
    assert h["List-Unsubscribe"].startswith("<") and "/api/email/unsubscribe?" in h["List-Unsubscribe"]
    assert h["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"


def test_deliver_without_a_secret_sends_no_one_click_header(monkeypatch):
    monkeypatch.delenv("EMAIL_UNSUBSCRIBE_SECRET", raising=False)
    headers_seen = []
    monkeypatch.setattr(send, "_post_brevo", lambda to, e, h: headers_seen.append(h) or True)
    send.deliver(store=None, uid="u1", user=USER, email=email(), dedupe_key="k", history=empty_history(), dry_run=False)
    assert headers_seen == [{}]


def test_failed_send_is_not_logged_so_it_retries(monkeypatch):
    monkeypatch.setattr(send, "_post_brevo", lambda to, e, h: False)
    store = FakeStore()
    hist = empty_history()
    out = send.deliver(store=store, uid="u1", user=USER, email=email(), dedupe_key="k", history=hist, dry_run=False)
    assert out.status == "failed" and store.added == [] and "k" not in hist.keys


# ---------------------------------------------------------------------- jobs

def test_swap_available_uses_a_rolling_week():
    recent = {"covered_adds_log": [{"id": "US_A", "kind": "swap", "at": (NOW - timedelta(days=3)).isoformat()}]}
    old = {"covered_adds_log": [{"id": "US_A", "kind": "swap", "at": (NOW - timedelta(days=8)).isoformat()}]}
    fill = {"covered_adds_log": [{"id": "US_A", "kind": "fill", "at": NOW.isoformat()}, "junk", None]}
    assert not jobs._swap_available(recent, NOW)
    assert jobs._swap_available(old, NOW)
    assert jobs._swap_available(fill, NOW)
    assert jobs._swap_available({}, NOW)


def test_converted_recently_only_counts_the_last_three_days():
    events = [{"uid": "u1", "type": "subscription_converted", "created_at": (NOW - timedelta(days=5)).isoformat()}]
    assert not jobs._converted_recently(FakeSource(events=events), "u1", NOW)
    events.append({"uid": "u1", "type": "subscription_converted", "created_at": (NOW - timedelta(hours=2)).isoformat()})
    assert jobs._converted_recently(FakeSource(events=events), "u1", NOW)
    assert not jobs._converted_recently(FakeSource(events=events), "u2", NOW)


@pytest.fixture
def stub_lifecycle(monkeypatch):
    monkeypatch.setattr(jobs, "load_person", lambda *a, **k: object())
    for name in ("build_welcome", "build_setup_nudge", "build_pro_welcome", "build_swap_open", "build_winback"):
        kind = name.removeprefix("build_")
        monkeypatch.setattr(jobs.lifecycle, name,
                            lambda *a, _kind=kind, **k: email(_kind if _kind != "setup_nudge" else f"setup_nudge_d{k['day']}", "product"))


def keys_for(user, now, hist=None, src=None):
    return [k for _, k in jobs._lifecycle(src or FakeSource(), "u1", user, now, hist or empty_history(), [])]


def test_lifecycle_welcome_then_nudges(stub_lifecycle):
    created = NOW - timedelta(hours=3)
    assert keys_for({"created_at": created.isoformat()}, NOW) == ["welcome"]
    assert keys_for({"created_at": created.isoformat()}, NOW, send.History({"welcome"}, {}, {})) == []
    d2 = {"created_at": (NOW - timedelta(days=2, hours=1)).isoformat()}
    assert keys_for(d2, NOW, send.History({"welcome"}, {}, {})) == ["setup_nudge_d2"]
    assert keys_for({**d2, "tracked_stocks": ["US_A"]}, NOW, send.History({"welcome"}, {}, {})) == []
    d5 = {"created_at": (NOW - timedelta(days=5, hours=1)).isoformat()}
    assert keys_for(d5, NOW) == ["setup_nudge_d5"]


def test_swap_open_waits_for_monday_morning(stub_lifecycle):
    user = {"tracked_stocks": ["US_A"], "created_at": "2026-01-01T00:00:00Z"}
    monday_early = datetime(2026, 11, 9, 5, 20, tzinfo=timezone.utc)  # 00:20 ET
    monday_late = datetime(2026, 11, 9, 15, 20, tzinfo=timezone.utc)  # 10:20 ET
    assert keys_for(user, monday_early) == []
    assert keys_for(user, monday_late) == ["swap_open_2026-W46"]
    assert keys_for(user, monday_late, send.History({"swap_open_2026-W46"}, {}, {})) == []
    assert keys_for(user, NOW) == []  # Tuesday
    assert keys_for({**user, "is_subscribed": True}, monday_late) == []


def test_winback_once_per_absence(stub_lifecycle):
    seen = NOW - timedelta(days=25)
    user = {"tracked_stocks": ["US_A"], "created_at": "2026-01-01T00:00:00Z", "last_sign_in_at": seen.isoformat()}
    key = f"winback_{seen.date().isoformat()}"
    assert keys_for(user, NOW) == [key]
    assert keys_for(user, NOW, send.History({key}, {}, {})) == []
    assert keys_for({**user, "last_sign_in_at": (NOW - timedelta(days=61)).isoformat()}, NOW) == []


def test_alerts_bundle_starts_where_the_last_one_stopped(monkeypatch):
    seen = {}

    def fake_findings(src, uid, *, since):
        seen["since"] = since
        return ["f"]

    monkeypatch.setattr(jobs.alerts, "load_findings", fake_findings)
    monkeypatch.setattr(jobs, "load_person", lambda *a, **k: object())
    monkeypatch.setattr(jobs.alerts, "build_alerts", lambda p, f: email("alerts", "alerts"))
    cursor = NOW - timedelta(hours=1)
    hist = send.History(set(), {}, {"alerts": NOW - timedelta(minutes=50)}, alerts_until=cursor)
    clock = NOW + timedelta(seconds=5)
    [(e, key)] = jobs._alerts(FakeSource(), "u1", {}, NOW, hist, clock=lambda: clock)
    assert seen["since"] == cursor
    assert e.meta["until"] == clock.isoformat()
    assert key == "alerts_2026-11-10T13:30"


def test_one_failing_account_does_not_stop_the_batch(monkeypatch):
    class Src(FakeSource):
        def query(self, collection, filters=None, *, limit=None, select=None):
            if collection == "users":
                return [("users/bad", {"email": "b@x.com"}), ("users/good", {"email": "g@x.com"})]
            if collection == send.SENDS and filters and filters[0][2] == "bad":
                raise RuntimeError("boom")
            return []

    monkeypatch.setattr(jobs, "open_source", lambda sending: (Src(), None))
    monkeypatch.setattr(jobs, "stocks_by_id", lambda *a, **k: [])
    monkeypatch.setattr(jobs, "_alerts", lambda src, uid, user, now, hist: [(email("alerts", "alerts"), f"alerts_{uid}")])
    stats = jobs.run("alerts", dry_run=True, only_uid=None, to=None, limit=0, now=NOW)
    assert stats["error"] == 1 and stats["dry_run"] == 1 and stats["checked"] == 2


def test_send_refuses_to_run_without_the_unsubscribe_secret(monkeypatch):
    monkeypatch.delenv("EMAIL_UNSUBSCRIBE_SECRET", raising=False)
    with pytest.raises(SystemExit, match="EMAIL_UNSUBSCRIBE_SECRET"):
        jobs.open_source(sending=True)


def test_sent_but_unlogged_stops_the_batch(monkeypatch):
    """A send the log can't see would go out again next run, so the job stops."""

    class BrokenStore(FakeStore):
        def __init__(self):
            super().__init__()

            class _Db:
                def collection(self, name):
                    raise RuntimeError("db down")

            self.db = _Db()

    class Src(FakeSource):
        def query(self, collection, filters=None, *, limit=None, select=None):
            if collection == "users":
                return [("users/one", {"email": "1@x.com"}), ("users/two", {"email": "2@x.com"})]
            return []

    monkeypatch.setattr(jobs, "open_source", lambda sending: (Src(), BrokenStore()))
    monkeypatch.setattr(jobs, "stocks_by_id", lambda *a, **k: [])
    monkeypatch.setattr(jobs, "_alerts", lambda src, uid, user, now, hist: [(email("alerts", "alerts"), f"alerts_{uid}")])
    sent = []
    monkeypatch.setattr(send, "_post_brevo", lambda to, e, h: sent.append(to) or True)
    stats = jobs.run("alerts", dry_run=False, only_uid=None, to=None, limit=0, now=NOW)
    assert sent == ["1@x.com"] and stats["aborted"] == 1


def test_settings_links_land_on_the_emails_section():
    assert kit.settings_url().endswith("/profile#notifications")
    assert kit.plan_url().endswith("/profile#plan")
