"""The no-account morning brief (backend/mail/subscribers.py): who gets it, what it shows, and its links."""
from __future__ import annotations

import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import pytest

from backend.mail import jobs, kit, send, subscribers
from backend.mail.data import Call
from backend.tests.test_mail import NOW, calls, stock

ID = "a" * 64
OTHER = "b" * 64


def row(sub_id=ID, **kw):
    doc = {"email": "Sam@Example.com", "tickers": ["NVDA"], "confirmed_at": "2026-11-01T00:00:00Z",
           "unsubscribed_at": None, "linked_uid": None}
    doc.update(kw)
    return (f"{subscribers.COLLECTION}/{sub_id}", doc)


# ----------------------------------------------------------------- who

def test_only_confirmed_active_unlinked_signups_without_an_account():
    rows = [
        row(),
        row("c" * 64, confirmed_at=None),
        row("d" * 64, unsubscribed_at="2026-11-02T00:00:00Z"),
        row("e" * 64, linked_uid="u1"),
        row("f" * 64, email="owner@example.com"),
        row("not-a-hash"),
        row("1" * 64, email="no-at-sign"),
    ]
    picked = subscribers.select(rows, account_emails={"owner@example.com"})
    assert [(s.id, s.email, s.tickers) for s in picked] == [(ID, "sam@example.com", ["NVDA"])]
    assert picked[0].uid == "sub_" + ID[:32]


def test_tickers_are_cleaned_deduped_and_capped():
    raw = ["nvda", "NVDA", "brk.b", "bad ticker", 7, *[f"T{i}" for i in range(20)]]
    out = subscribers.clean_tickers(raw)
    assert out[:2] == ["NVDA", "BRK.B"]
    assert len(out) == subscribers.MAX_TICKERS
    assert subscribers.instrument_id("BRK.B") == "US_BRK_B"


def test_market_set_matches_the_web_featured_stocks():
    ts = (Path(__file__).resolve().parents[2] / "lib/seo/stock-pages.ts").read_text()
    block = re.search(r"FEATURED_STOCK_TICKERS = \[(.*?)\]", ts, re.S).group(1)
    assert subscribers.MARKET_TICKERS == re.findall(r'"([A-Z.]+)"', block)


# ----------------------------------------------------------------- links

def test_stop_link_is_signed_like_the_web_app(monkeypatch):
    # the same HMAC lib/email-subscribers.ts subscriberToken makes (value computed with node:crypto)
    monkeypatch.setenv("EMAIL_UNSUBSCRIBE_SECRET", "preview-only-secret")
    assert subscribers.stop_token("0" * 64) == "aTJz2H_srMGA4yNjVrg8y7q9"
    assert subscribers.stop_url("0" * 64).endswith("/email/stop?s=" + "0" * 64 + "&t=aTJz2H_srMGA4yNjVrg8y7q9")
    assert "/api/email/subscribe/stop?" in subscribers.stop_url("0" * 64, api=True)
    monkeypatch.delenv("EMAIL_UNSUBSCRIBE_SECRET")
    assert subscribers.stop_token("0" * 64) == ""


def test_signup_link_carries_the_free_number_of_stocks():
    url = subscribers.signup_url(["NVDA", "AMD", "TSLA", "PLTR", "MSFT", "AAPL"])
    picks = re.search(r"try=([^&]+)", url).group(1).replace("%2C", ",").split(",")
    assert picks == ["NVDA", "AMD", "TSLA", "PLTR", "MSFT", "AAPL"][: subscribers.FREE_COVERED_STOCKS]
    assert "try=" not in subscribers.signup_url([])


# ----------------------------------------------------------------- the email

def _stocks(**over):
    nvda = stock("NVDA", change_pct=over.pop("nvda_move", 9.0), price=150.0, prev_close=137.6,
                 stance="accumulate", call_text="Buy more", calls=calls("accumulate", "accumulate"))
    amd = stock("AMD", change_pct=0.3)
    return {"NVDA": nvda, "AMD": amd, **over}


def test_quiet_day_sends_nothing():
    sub = subscribers.Subscriber(ID, "sam@example.com", ["AMD"])
    assert subscribers.build(sub, _stocks(), now=NOW, market={}) is None


def test_ticker_brief_has_its_own_links_and_no_account_bits(monkeypatch):
    monkeypatch.setenv("EMAIL_UNSUBSCRIBE_SECRET", "s3cret")
    sub = subscribers.Subscriber(ID, "sam@example.com", ["NVDA", "AMD"])
    email, key = subscribers.build(sub, _stocks(), now=NOW, market={})
    assert key == "subscriber_daily_2026-11-09"
    assert email.kind == "subscriber_brief" and email.category == "daily"
    assert "NVDA" in email.subject
    assert "Email settings" not in email.html and "/profile" not in email.html
    assert kit.esc(subscribers.stop_url(ID)) in email.html and subscribers.stop_url(ID) in email.text
    assert "Stop this email" in email.html
    # one action (rule 5b): the signup is a quiet footer link beside the stop link, not a second action under the button
    signup = f"Make it yours: pick {subscribers.FREE_COVERED_STOCKS} stocks free"
    body, footer = email.html.split("You get this because", 1)
    assert signup not in body and signup in footer
    assert footer.index(signup) < footer.index("Stop this email")
    assert f"{signup}: " in email.text.split("--", 1)[1]
    assert "try=NVDA%2CAMD" in email.html
    assert "Open today&#x27;s news" in email.html or "Open today's news" in email.html
    assert "Cover all your stocks with Pro" not in email.html
    assert subscribers.REASON in email.text
    assert email.html.count("<a href") >= 1


def test_a_ticker_signup_only_ever_sees_its_own_stocks():
    """Stocks are read once per run for everyone: another signup's PLTR call change must never reach an NVDA-only email."""
    pltr = stock("PLTR", change_pct=11.0, price=159.0, prev_close=143.0, stance="trim", previous_stance="accumulate",
                 call_text="Sell some", call_reason="It trades at 90 times sales after a 40% run.")
    pltr.calls = calls("accumulate", "accumulate", "accumulate", "trim")
    stocks = {**_stocks(), "PLTR": pltr}
    sub = subscribers.Subscriber(ID, "sam@example.com", ["NVDA"])
    email, _ = subscribers.build(sub, stocks, now=NOW, market={})
    assert "PLTR" not in email.html and "PLTR" not in email.text and "Calls we changed" not in email.html
    assert [t for t, _ in email.meta["items"]] == ["NVDA"]


def test_one_stock_signup_opens_that_stock():
    sub = subscribers.Subscriber(ID, "sam@example.com", ["NVDA"])
    email, _ = subscribers.build(sub, _stocks(), now=NOW, market={})
    assert "Open NVDA" in email.html and "/stock/NVDA" in email.html


def test_no_price_level_without_an_account():
    """Levels come with covering a stock: load_stocks drops every trigger, so no crossing card and no level pill."""
    s = stock("NVDA", change_pct=-6.0, price=94.0, prev_close=100.0, stance="accumulate", call_text="Buy more",
              calls=calls("accumulate", "accumulate", last_day="2026-11-06", trigger=("price_below", 96.0)))
    # what load_stocks does to each stock's calls and levels (test_load_stocks_drops_levels checks it does)
    for c in s.calls:
        c.trigger_type, c.trigger_value = "", None
    s.add_below = s.trim_above = None
    sub = subscribers.Subscriber(ID, "sam@example.com", ["NVDA"])
    email, _ = subscribers.build(sub, {"NVDA": s}, now=NOW, market={})
    assert "buy-more price" not in email.html
    assert "under $" not in email.html
    assert "$96" not in email.html


def test_load_stocks_drops_levels(monkeypatch):
    s = stock("NVDA", change_pct=1.0)
    monkeypatch.setattr(subscribers, "stocks_by_id", lambda src, ids, now: [s])

    def fake_calls(src, stocks, now):
        for st in stocks:
            st.calls = [Call(day="2026-11-06", stance="accumulate", text="Buy more", reason="r", price=100.0,
                             trigger_type="price_below", trigger_value=96.0)]

    monkeypatch.setattr(subscribers, "_apply_calls", fake_calls)
    for name in ("_apply_earnings", "_apply_premarket", "_apply_news"):
        monkeypatch.setattr(subscribers, name, lambda *a, **k: None)
    out = subscribers.load_stocks(object(), ["NVDA"], NOW)
    got = out["NVDA"]
    assert got.stance == "accumulate" and got.call_text == "Buy more"
    assert got.add_below is None and got.trim_above is None
    assert got.standing_levels() == (None, None)


def test_market_version_uses_the_featured_stocks():
    sub = subscribers.Subscriber(ID, "sam@example.com", [])
    nvda = _stocks()["NVDA"]
    tsla = stock("TSLA", change_pct=12.0, price=380.0, prev_close=339.0)
    other = stock("ZZZ", change_pct=30.0)  # not in the market set: never shown
    email, _ = subscribers.build(sub, {"NVDA": nvda, "TSLA": tsla, "ZZZ": other}, now=NOW, market={})
    assert "TSLA" in email.html and "NVDA" in email.html and "ZZZ" not in email.html
    assert "Open today" in email.html
    assert "try=" not in email.html  # nothing to carry: the landing opens plain


# ----------------------------------------------------------------- the job

class FakeSource:
    def __init__(self, subs, users=(), sends=()):
        self.subs, self.users, self.sends = list(subs), list(users), list(sends)

    def query(self, collection, filters=None, *, limit=None, select=None):
        if collection == subscribers.COLLECTION:
            return self.subs
        if collection == "users":
            return [(f"users/{i}", u) for i, u in enumerate(self.users)]
        if collection == send.SENDS:
            uid = next((v for f, op, v in filters or [] if f == "uid"), None)
            return [(f"s/{i}", r) for i, r in enumerate(self.sends) if r.get("uid") == uid]
        return []


def test_job_sends_once_per_session_and_skips_account_addresses(monkeypatch):
    stocks = _stocks()
    monkeypatch.setattr(subscribers, "load_stocks", lambda src, tickers, now: stocks)
    delivered = []

    def fake_deliver(**kw):
        delivered.append(kw)
        status = "skipped_dupe" if kw["dedupe_key"] in kw["history"].keys else "dry_run"
        return send.Outcome(status, kw["email"].subject)

    monkeypatch.setattr(send, "deliver", fake_deliver)
    src = FakeSource(
        [row(), row(OTHER, email="owner@example.com")],
        users=[{"email": "Owner@Example.com"}],
        sends=[{"uid": "sub_" + OTHER[:32], "dedupe_key": "x", "sent_at": NOW.isoformat()}],
    )
    stats: Counter = Counter()
    jobs._subscribers(src, None, now=NOW, dry_run=True, to=None, limit=0, market={}, stats=stats)
    assert stats["dry_run"] == 1 and stats["subscribers_checked"] == 1
    assert [d["uid"] for d in delivered] == ["sub_" + ID[:32]]
    assert delivered[0]["user"] == {"email": "sam@example.com"}
    assert delivered[0]["dedupe_key"] == "subscriber_daily_2026-11-09"

    # a second run the same morning finds the logged key and sends nothing new
    src.sends.append({"uid": "sub_" + ID[:32], "dedupe_key": "subscriber_daily_2026-11-09", "sent_at": NOW.isoformat()})
    stats2: Counter = Counter()
    jobs._subscribers(src, None, now=NOW, dry_run=True, to=None, limit=0, market={}, stats=stats2)
    assert stats2["skipped_dupe"] == 1 and stats2["dry_run"] == 0


def test_job_with_no_confirmed_signups_does_nothing(monkeypatch):
    monkeypatch.setattr(subscribers, "load_stocks", lambda *a: pytest.fail("no stocks should be read"))
    stats: Counter = Counter()
    jobs._subscribers(FakeSource([row(confirmed_at=None)]), None, now=NOW, dry_run=True, to=None, limit=0, market={}, stats=stats)
    assert not stats


def test_deliver_sets_the_subscriber_one_click_header(monkeypatch):
    sent = {}

    def fake_post(to, email, headers):
        sent.update(to=to, headers=headers)
        return True

    monkeypatch.setattr(send, "_post_brevo", fake_post)
    email = kit.Email(kind="subscriber_brief", category="daily", subject="Hi", preheader="", html="", text="")
    out = send.deliver(store=None, uid="sub_x", user={"email": "sam@example.com"}, email=email, dedupe_key="k",
                       history=send.History(set(), {}, {}), dry_run=False,
                       list_unsubscribe="https://www.stocksbrew.online/api/email/subscribe/stop?s=a&t=b")
    assert out.status == "sent"
    assert sent["headers"]["List-Unsubscribe"] == "<https://www.stocksbrew.online/api/email/subscribe/stop?s=a&t=b>"
    assert sent["headers"]["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"


def test_daily_runs_the_subscribers_after_the_accounts(monkeypatch):
    calls_made = []
    monkeypatch.setattr(jobs, "open_source", lambda sending: (FakeSource([]), None))
    monkeypatch.setattr(jobs, "stocks_by_id", lambda *a, **k: [])
    monkeypatch.setattr(jobs, "users", lambda src, only: [])
    monkeypatch.setattr(jobs, "_subscribers", lambda *a, **k: calls_made.append(k))
    jobs.run("daily", dry_run=True, only_uid=None, to=None, limit=0, now=NOW)
    assert len(calls_made) == 1
    jobs.run("daily", dry_run=True, only_uid="u1", to=None, limit=0, now=NOW)  # a one-account run never mails them
    assert len(calls_made) == 1
    monkeypatch.setenv("SUBSCRIBER_MAIL", "0")
    jobs.run("daily", dry_run=True, only_uid=None, to=None, limit=0, now=NOW)
    assert len(calls_made) == 1
    weekend = datetime(2026, 11, 14, 13, 30, tzinfo=timezone.utc)
    monkeypatch.delenv("SUBSCRIBER_MAIL")
    jobs.run("daily", dry_run=True, only_uid=None, to=None, limit=0, now=weekend)
    assert len(calls_made) == 1
