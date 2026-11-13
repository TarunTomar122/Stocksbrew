from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone

import pytest

from backend.mail import alerts, daily, kit, lifecycle, weekly
from backend.mail import data as mail_data
from backend.mail import nyse
from backend.mail.data import Call, Headline, Person, Stock, is_reason_headline

NOW = datetime(2026, 11, 10, 13, 30, tzinfo=timezone.utc)  # 8:30am ET Tuesday
CLOSE = datetime(2026, 11, 9, 21, 0, tzinfo=timezone.utc)  # Monday's close
# the win-back looks back three calendar weeks, so it runs the morning after the helper's last close (Oct 20)
AWAY_NOW = datetime(2026, 10, 21, 13, 30, tzinfo=timezone.utc)


def closes(n: int = 80, start: float = 100.0, step: float = 0.5) -> tuple[list[str], list[float]]:
    days, vals, d, v = [], [], date(2026, 7, 1), start
    while len(days) < n:
        if d.weekday() < 5:
            days.append(d.isoformat())
            v = v + (step if len(days) % 2 else -step)
            vals.append(round(v, 2))
        d += timedelta(days=1)
    return days, vals


def stock(ticker="AAA", **kw) -> Stock:
    days, vals = closes()
    s = Stock(id=f"US_{ticker}", ticker=ticker, name=f"{ticker} Inc.", position=kw.pop("position", "watchlist"),
              price=kw.pop("price", 100.0), prev_close=kw.pop("prev_close", 100.0), change_pct=kw.pop("change_pct", 0.2),
              price_at=CLOSE, dates=days, closes=vals)
    for k, v in kw.items():
        setattr(s, k, v)
    return s


def person(stocks: list[Stock], *, pro=True) -> Person:
    ids = [s.id for s in stocks]
    return Person(uid="u1", email="a@example.com", first_name="Sam", is_pro=pro, created_at=None, last_seen=None,
                  tracked_ids=ids, covered_ids=ids if pro else ids[:5], stocks=stocks, view_built_at=NOW)


def calls(*stances: str, last_day="2026-11-09", trigger=("", None)) -> list[Call]:
    end = date.fromisoformat(last_day)
    out = []
    for i, st in enumerate(stances):
        d = (end - timedelta(days=len(stances) - 1 - i)).isoformat()
        out.append(Call(day=d, stance=st, text=st.title(), reason="", price=100.0,
                        trigger_type=trigger[0], trigger_value=trigger[1]))
    return out


def test_quiet_day_sends_nothing():
    p = person([stock("AAA"), stock("BBB", change_pct=-0.8)])
    assert daily.build_daily(p, now=NOW) is None


def test_big_move_is_relative_to_the_stocks_normal_day():
    calm = stock("CALM", change_pct=4.5)  # typical move here is ~0.5%
    p = person([calm])
    email = daily.build_daily(p, now=NOW)
    assert email is not None and "CALM up 4.5%" in email.subject
    assert "a normal day" in email.text  # the move is read against the stock's normal day
    wild = stock("WILD", change_pct=4.5)
    days, vals = closes(step=6.0)  # swings ~12% a day
    wild.dates, wild.closes = days, vals
    assert daily.build_daily(person([wild]), now=NOW) is None


def test_level_crossing_uses_the_level_set_before_the_session():
    s = stock("LVL", price=95.0, prev_close=101.0, change_pct=-1.0, stance="accumulate",
              add_below=95.0)  # the new call reset the level to today's close
    s.calls = calls("accumulate", "accumulate", trigger=("price_below", 98.0))
    s.calls[-1].day = "2026-11-08"  # standing call from before Monday's session
    items = daily.items_for(person([s]), NOW)
    assert items and items[0].kind == "level_add" and "$98.00" in items[0].headline


def test_no_add_zone_when_the_call_no_longer_says_add():
    s = stock("HLD", price=95.0, prev_close=101.0, change_pct=-1.0, stance="hold")
    s.calls = calls("accumulate", trigger=("price_below", 98.0), last_day="2026-11-06")
    assert not [i for i in daily.items_for(person([s]), NOW) if i.kind == "level_add"]


def test_flip_flopping_calls_are_not_news():
    s = stock("FLP", stance="accumulate", previous_stance="hold", call_text="Accumulate")
    s.calls = calls("accumulate", "hold", "accumulate", "hold", "accumulate")
    assert daily.items_for(person([s]), NOW) == []
    t = stock("STB", stance="accumulate", previous_stance="hold", call_text="Accumulate")
    t.calls = calls("hold", "hold", "hold", "accumulate")
    assert [i.kind for i in daily.items_for(person([t]), NOW)] == ["call_change"]


def test_free_daily_only_covers_five_and_says_so():
    stocks = [stock(f"S{i}") for i in range(7)]
    stocks[6].change_pct = 9.0  # outside the covered five
    stocks[0].change_pct = 9.0
    email = daily.build_daily(person(stocks, pro=False), now=NOW)
    assert email is not None
    assert "S0" in email.subject and "S6" not in email.subject
    # one quiet line for the upgrade; the briefing button stays the one action
    assert "Cover all your stocks with Pro." in email.text and "S6" not in email.text


def test_reason_comes_from_news_around_the_session_only():
    s = stock("NWS", change_pct=7.0)
    s.news = [
        Headline("NWS jumps after FDA approval", "Reuters", "", CLOSE - timedelta(hours=5)),
        Headline("NWS later headline", "Reuters", "", CLOSE + timedelta(hours=9)),
    ]
    s.news.sort(key=lambda h: h.published_at, reverse=True)
    why, src = daily.why_line(s)
    assert why == "NWS jumps after FDA approval" and src.startswith("Reuters")


@pytest.mark.parametrize("title,ok", [
    ("ETFs Are Net Sellers of Broadcom (AVGO) on Friday", False),
    ("Broadcom Heads These 3 Top Undervalued Stocks", False),
    ("Is Nvidia a Buy Now?", False),
    ("Nvidia falls after report China curbs H20 purchases", True),
    ("AMD Lands EPYC Role In New AI Security System", True),
    ("PLTR support and resistance levels to watch", False),
    ("Is Vertiv Stock Really Expensive?", False),
    ("Meta Platforms Stock: Is it a Steal of a Deal at $650?", False),
    ("Should You Buy Tesla Before Earnings?", False),
    ("Why Is Apple Stock Down Today?", False),
    ("Is Oracle overvalued? Analysts split", False),
    ("Nvidia price prediction for 2027", False),
    ("Technical analysis: AMD tests its 50-day average", False),
    ("Micron stock chart shows a breakout", False),
    ("Analyzing AMD as a near-term beneficiary of Nvidia's leadership uncertainty", False),
    ("Analyst cuts Intel target after weak guidance", True),
])
def test_listicles_are_not_reasons(title, ok):
    assert is_reason_headline(title) is ok


def test_alerts_bundle_and_list_busy_jobs():
    f = [alerts.Finding("Big daily moves", f"T{i}", f"T{i} rose 9% in the last session", "", "Daily closing prices", "2026-11-06", "")
         for i in range(5)]
    email = alerts.build_alerts(person([]), f, now=NOW)
    # a batch of moves is one headline of ten words at most: how many, how big, and the day in words
    assert email.subject == "5 of your stocks rose 9% or more on Friday"
    assert alerts.build_alerts(person([]), []) is None


def test_every_email_has_one_button_text_part_and_no_tiny_type():
    s = stock("ALL", change_pct=8.0, position="holding", week_change_pct=2.0, stance="accumulate",
              add_below=90.0, trim_above=130.0, call_text="Accumulate")
    s.calls = calls("hold", "hold", "hold", "accumulate")
    p = person([s] + [stock(f"X{i}", week_change_pct=-4.0) for i in range(6)])
    free = person(p.stocks, pro=False)
    emails = [
        daily.build_daily(p, now=NOW),
        weekly.build_weekly(p, now=NOW),
        lifecycle.build_welcome(p, [s]),
        lifecycle.build_setup_nudge(p, [s], day=2),
        lifecycle.build_setup_nudge(p, [s], day=5),
        lifecycle.build_pro_welcome(p),
        lifecycle.build_swap_open(free),
        lifecycle.build_limit_reached(free, title="Limit", body="Body.", used=2, cap=2),
        lifecycle.build_winback(p, now=AWAY_NOW),
    ]
    for e in emails:
        assert e is not None
        sizes = [int(x) for x in re.findall(r"font-size:(\d+)px", e.html)]
        assert min(sizes) >= 13, e.kind
        assert e.html.count(f"background:{kit.t.COPPER}'") <= 1, e.kind
        assert e.text and "Email settings:" in e.text
        assert "<script" not in e.html


def test_second_button_is_refused():
    d = kit.Doc().button("One", "https://x")
    with pytest.raises(ValueError):
        d.button("Two", "https://y")


def test_user_text_is_escaped():
    s = stock("ESC", change_pct=9.0)
    s.name = "<img src=x onerror=alert(1)>"
    s.news = [Headline("<b>ESC</b> jumps after deal", "x", "", CLOSE - timedelta(hours=1))]
    e = daily.build_daily(person([s]), now=NOW)
    assert "<img src=x" not in e.html and "&lt;b&gt;ESC" in e.html


# ------------------------------------------------------------- quality pass

def test_pct_never_prints_negative_zero():
    assert kit.pct(-0.04) == "0.0%" and kit.pct(0.04) == "0.0%"
    assert kit.pct(-0.05, digits=0) == "0%" and kit.pct(-1.26) == "−1.3%"


def test_level_at_the_close_is_not_under_it():
    # a new call that sets its add level at the close is "at" the level, not under it
    assert "right at our buy-more price" in kit.level_phrase(59.38, 59.38, "add")
    assert "7.4% under our buy-more price of $59.38" in kit.level_phrase(55.0, 59.38, "add")
    assert "right at our sell-some price" in kit.level_phrase(103.67, 103.67, "trim")


def test_inverted_levels_are_not_used():
    assert not kit.levels_valid(120.0, 110.0)
    assert kit.call_level(kit.BUY, 120.0, 110.0) is None


def test_a_call_shows_only_its_own_level_and_only_three_words():
    assert kit.call_level(kit.BUY, 90.0, 130.0) == 90.0
    assert kit.call_level(kit.SELL, 90.0, 130.0) == 130.0
    assert kit.call_level(kit.KEEP, 90.0, 130.0) is None
    assert kit.call_pill_text(kit.BUY, 90.0) == "Buy more under $90.00"
    for stance, text, want in [("accumulate", "Accumulate on pullbacks", "Buy more"), ("hold", "Hold here", "Keep"),
                               ("avoid", "Avoid for now", "Sell some"), ("", "Trim into strength", "Sell some"), ("", "", "")]:
        assert kit.call_label(stance, text) == want


def test_title_case_headlines_read_as_sentences():
    assert kit.sentence_case("Microsoft Stock Fell After Anthropic Launches Claude Sheets to Rival Excel") == \
        "Microsoft stock fell after Anthropic launches Claude Sheets to rival Excel"
    assert kit.sentence_case("NWS jumps after FDA approval") == "NWS jumps after FDA approval"


def test_no_reason_means_no_filler():
    s = stock("QUI", price=110.0, prev_close=100.0, change_pct=10.0)
    why, src = daily.why_line(s)
    assert why == "" and src == ""
    e = daily.build_daily(person([s]), now=NOW)
    assert "confirmed reason" not in e.text and "haven't found" not in e.text


def test_cards_repeat_no_link_text_and_odd_card_keeps_its_width():
    stocks = [stock(f"M{i}", price=110.0, prev_close=100.0, change_pct=10.0 + i,
                    news=[Headline(f"M{i} jumps after deal {i}", "Reuters", "", CLOSE - timedelta(hours=2))]) for i in range(3)]
    e = daily.build_daily(person(stocks), now=NOW)
    assert "Open research" not in e.html and "&rarr;" not in e.html
    # the third card stays one column wide (owner, Nov 12: fixed width), beside an empty slot
    # three cards: one per row, so no row has an empty slot and no card is stretched
    assert e.html.count("class='sbcol sbc' width='100%'") == 3
    one = kit.Doc().cards([kit.Card(ticker="ONE", line="Alone.")]).html_body()
    assert "width='100%' valign='top'" in one  # a single card takes the row


def test_an_unexplained_move_is_a_card_with_no_line():
    s = stock("BAR", price=110.0, prev_close=100.0, change_pct=10.0)
    e = daily.build_daily(person([s]), now=NOW)
    assert "Also moved more than usual" in e.text and "Rose 10.0%" not in e.text.split("Also moved more than usual")[1]


def test_big_list_stays_under_gmail_clip():
    stocks = [stock(f"T{i:02d}", price=110.0, prev_close=100.0, change_pct=(i % 9) - 4.5, position="holding" if i % 3 else "watchlist")
              for i in range(60)]
    for s in stocks[:10]:
        s.change_pct = 12.0
    e = daily.build_daily(person(stocks), now=NOW)
    assert len(e.html.encode()) < 90_000


def test_premarket_move_is_news_before_the_open():
    s = stock("PRE", premarket_pct=8.0)
    e = daily.build_daily(person([s]), now=NOW)
    assert e is not None and "PRE up 8.0% pre-market" in e.subject and "before the open" in e.text


def test_dark_mode_and_bgcolor_fallbacks():
    e = daily.build_daily(person([stock("DRK", price=110.0, prev_close=100.0, change_pct=10.0)]), now=NOW)
    assert "prefers-color-scheme: dark" in e.html and "bgcolor=" in e.html


def test_a_card_without_a_ticker_link_has_no_stock_link():
    d = kit.Doc().cards([kit.Card(ticker="FUND", line="Something happened", link=False)])
    assert "/stock/" not in d.html_body()


def test_email_links_never_point_at_localhost(monkeypatch):
    monkeypatch.delenv("MAIL_APP_URL", raising=False)
    monkeypatch.setenv("NEXT_PUBLIC_APP_URL", "http://localhost:8000")
    assert kit._app_base() == kit.PROD_URL
    monkeypatch.setenv("NEXT_PUBLIC_APP_URL", "https://staging.example.com/")
    assert kit._app_base() == "https://staging.example.com"
    monkeypatch.setenv("MAIL_APP_URL", "http://localhost:3000")
    assert kit._app_base() == "http://localhost:3000"  # explicit override for local previews


def test_preheader_is_hidden_and_padded():
    e = daily.build_daily(person([stock("PRE", change_pct=9.0)]), now=NOW)
    assert "mso-hide:all" in e.html and e.html.count("&#8199;&#65279;&#847;") >= 40


def test_daily_opens_on_the_stocks_without_a_summary():
    stocks = [stock(f"S{i}", change_pct=9.0 - i) for i in range(4)]
    e = daily.build_daily(person(stocks), now=NOW)
    # no read paragraph or insight cards between the headline and the stocks (owner, Nov 12)
    assert "average move" not in e.text and "Morning" not in e.text and "Prices are to" not in e.text
    first_section = e.text.split("\n\n")[2]
    assert first_section.startswith(("Moved more than usual", "Also moved"))


def test_a_big_mover_keeps_its_earnings_date():
    s = stock("ERN", change_pct=9.0, earnings_date=date(2026, 11, 11), earnings_time="amc")
    e = daily.build_daily(person([s]), now=NOW)
    assert "Reports tomorrow after the close." in e.text and "Nov 11" not in e.text
    # the date rides on its move card: the stock is not carded a second time under "Earnings coming up"
    assert "Earnings coming up" not in e.text and e.text.count("/stock/ERN") == 1


def test_free_note_uses_the_plan_number_and_inclusive_wording():
    stocks = [stock(f"S{i}") for i in range(7)]
    stocks[0].change_pct = 9.0
    stocks[6].change_pct = 4.0
    e = daily.build_daily(person(stocks, pro=False), now=NOW)
    assert "Cover all your stocks with Pro." in e.text and e.html.count(f"background:{kit.t.COPPER}'") == 1


def test_weekly_with_one_stock_does_not_call_it_best_and_worst():
    s = stock("SOLO", week_change_pct=2.0)
    e = weekly.build_weekly(person([s]), now=NOW)
    assert "did best" not in e.text and "lagged" not in e.subject


def test_weekly_flat_week_and_stale_history():
    a = stock("FLAT", week_change_pct=0.02)
    old = stock("OLD", week_change_pct=-30.0)
    old.dates = [d for d in old.dates][:-10]  # history stopped two weeks ago
    old.closes = old.closes[:-10]
    e = weekly.build_weekly(person([a, old]), now=NOW)
    assert "were flat" in e.text and "OLD" not in e.text.split("Coming up next week")[0]


def test_weekly_coming_up_is_next_week_only():
    sat = datetime(2026, 11, 14, 14, 0, tzinfo=timezone.utc)
    s1 = stock("NXT", week_change_pct=1.0, earnings_date=date(2026, 11, 20))  # next Friday
    s2 = stock("FAR", week_change_pct=1.0, earnings_date=date(2026, 11, 23))  # Monday after
    e = weekly.build_weekly(person([s1, s2]), now=sat)
    # NXT is a best-week card already, so its date rides on that card rather than a second one (owner rule 1)
    assert "Reports Friday." in e.text and "Coming up next week" not in e.text
    assert "Reports Monday" not in e.text and "Nov 23" not in e.text
    assert "1 earnings report coming up" in e.preheader


def test_weekly_never_shows_a_record_of_our_calls():
    # The owner does not want a scoreboard of our calls in emails.
    e = weekly.build_weekly(person([stock("NOC", week_change_pct=1.0)]), now=NOW)
    assert "How our calls did" not in e.text and "went the right way" not in e.text and "calls" not in e.preheader


def test_alert_source_has_no_trailing_comma():
    f = [alerts.Finding("Job", "AAA", "AAA did a thing", "detail", "Filings", "", "")]
    e = alerts.build_alerts(person([]), f)
    assert "Filings," not in e.text


def test_limit_reached_states_the_real_pro_limit():
    e = lifecycle.build_limit_reached(person([]), title="Free runs two agents", body="B.", used=2, cap=2, pro_cap=20)
    assert "Pro allows 20" in e.text and "no limit" not in e.text
    assert "has no limit" in lifecycle.build_limit_reached(person([]), title="T", body="B.", used=5, cap=5).text


def test_pro_welcome_grammar_for_one_stock():
    e = lifecycle.build_pro_welcome(person([stock("ONE")]))
    assert "Your stocks are now covered." in e.text and "all 1" not in e.subject


def test_winback_survives_a_zero_close_and_points_at_settings():
    s = stock("ZER")
    s.closes[s.dates.index("2026-09-30")] = 0.0  # the three-week base for a run on Oct 21
    assert lifecycle.build_winback(person([s]), now=AWAY_NOW) is None
    e = lifecycle.build_winback(person([stock("OK")]), now=AWAY_NOW)
    assert "daily brief" not in e.text.split("--")[0]


def test_setup_nudge_does_not_call_a_small_move_big():
    s = stock("SML", change_pct=0.8)
    e = lifecycle.build_setup_nudge(person([]), [s], day=5)
    assert "[Big move]" not in e.text
    assert "buy more or sell some" not in e.text  # this stock has no levels


class _FakeSource:
    def __init__(self, docs):
        self.docs = docs

    def get_many(self, paths):
        return {p: self.docs[p] for p in paths if p in self.docs}


def test_week_change_skips_missing_closes():
    days, vals = closes(10)
    vals[3] = None
    src = _FakeSource({"tm_price_history_daily/AAA": {"dates": days, "closes": vals}})
    s = Stock(id="US_AAA", ticker="AAA", name="AAA", position="watchlist")
    mail_data._apply_week_change(src, [s])
    assert s.week_change_pct is not None and None not in s.closes and len(s.closes) == len(s.dates) == 9


def test_company_name_match_needs_a_whole_word():
    s = Stock(id="US_META", ticker="META", name="Meta Platforms", position="watchlist")
    s.ticker = "FB"
    assert mail_data._mentions("Meta beats on revenue", s)
    assert not mail_data._mentions("Base metals rally on China data", s)


def test_close_and_level_never_print_as_the_same_price():
    assert kit.money_pair(1410.6, 1411.2) == ("$1,410.60", "$1,411.20")
    assert kit.money_pair(35.85, 36.33) == ("$35.85", "$36.33")


def test_alert_report_says_when_without_a_date_column():
    f = [alerts.Finding("Job", "AAA", "AAA reports soon", "Scheduled for Nov 12 before the open.", "Earnings calendar", "2026-11-12", "")]
    e = alerts.build_alerts(person([]), f, now=NOW)  # Tuesday Nov 10
    assert "Reports Thursday before the open" in e.text and "2026-11-12" not in e.text and "11/12" not in e.text


def _zone(ticker, change, close, level, at="2026-11-09", **kw):
    return alerts.Finding("Names entering their add zone", ticker, f"{ticker} closed in its add zone, at or below ${level}", "",
                          alerts.PRICE_SOURCE, at, "", kind="level", change_pct=change, close=close, zone="add", level=level,
                          run_day="2026-11-09", run_close="2026-11-09", **kw)


def test_zone_alert_says_the_move_the_close_and_the_buy_more_level():
    p = person([stock("SPCX", name="Space Exploration Technologies Corp.")])
    e = alerts.build_alerts(p, [_zone("SPCX", -4.21, 139.8, 142.07)], now=NOW)
    assert e.subject == "SPCX fell 4.2% to $139.80, below its $142.07 buy-more level"
    # the card shows the close and the move as figures, so its line is only the level it reached
    assert "Below its $142.07 buy-more level.</div>" in e.html and "Space Exploration" in e.html
    assert "SPCX fell 4.2% to $139.80, below its $142.07 buy-more level." in e.preheader
    assert "add zone" not in e.text and "Names entering" not in e.text  # the old default name reads in the call's words
    # the close is said once, in words: Nov 9 is the day before this Tuesday's email
    assert "Yesterday's close" in e.text and "Nov 9" not in e.text and "11/09" not in e.text
    assert kit.esc(kit.logo_src("SPCX")) in e.html


def test_zones_lead_then_moves_and_a_stale_quote_is_left_out():
    sessions = person([stock("AAA")])
    morning = dict(run_day="2026-11-09", run_close="2026-11-09")
    f = [
        alerts.Finding("Morning check", "BIG", "BIG rose 12.0% in the last session", "", alerts.PRICE_SOURCE, "2026-11-09", "", kind="move", change_pct=12.0, close=50.0, **morning),
        # its price stopped updating on Nov 5: not the last session's news
        alerts.Finding("Morning check", "OLD", "OLD rose 9.4% in the last session", "", alerts.PRICE_SOURCE, "2026-11-05", "", kind="move", change_pct=9.4, close=10.0, **morning),
        alerts.Finding("Morning check", "MID", "MID fell 5.0% in the last session", "", alerts.PRICE_SOURCE, "2026-11-09", "", kind="move", change_pct=-5.0, close=20.0, **morning),
        alerts.Finding("Morning check", "MID", "MID reports earnings tomorrow", "Scheduled for Nov 11 after the close.", "Earnings calendar", "2026-11-11", "", kind="earnings", time="amc", **morning),
        _zone("ZZZ", -1.0, 9.9, 10.0),
    ]
    e = alerts.build_alerts(sessions, f, now=NOW)
    assert "OLD" not in e.text
    text = e.text
    assert text.index("ZZZ") < text.index("BIG") < text.index("MID")
    assert "Reports tomorrow after the close" in text  # merged into MID's row, said once
    assert text.count("\nMID ") == 1


def test_reasons_never_contradict_the_card():
    up = stock("MU", name="Micron Technology", price=108.6, prev_close=100.0, change_pct=8.6)
    up.news = [Headline("Micron Technology Stocks Slip as Hot CPI Overshadows Bet", "Yahoo", "", CLOSE - timedelta(hours=3))]
    assert daily.why_line(up) == ("", "")  # a "slip" headline can't explain a +8.6% day
    peer = stock("NBIS", name="Nebius Group N.V.", price=114.9, prev_close=100.0, change_pct=14.9)
    peer.news = [Headline("CoreWeave Surges 16% as Beat-and-Raise Quarter Eases Financing Fears; Nebius Gains 13%, Oracle Advances 5%",
                          "Yahoo", "", CLOSE - timedelta(hours=3))]
    # Nebius's own clause names no cause, so the headline is not a reason for NBIS (no invented link)
    assert daily.why_line(peer) == ("", "")
    own = stock("SNDK", name="Sandisk Corporation", price=112.3, prev_close=100.0, change_pct=12.3)
    own.news = [Headline("Seagate Spikes 9%, Sandisk Surges 8% as CoreWeave’s Results Revive AI Trade; Micron Climbs 7%",
                         "Yahoo", "", CLOSE - timedelta(hours=3))]
    # its own clause, with the intraday 8% that disagrees with the +12.3% close dropped
    assert daily.why_line(own)[0] == "Sandisk surges as CoreWeave’s results revive AI trade"


def test_swap_email_needs_a_real_move_outside_the_covered_stocks():
    flat = person([stock(f"F{i}", week_change_pct=0.4) for i in range(7)], pro=False)
    assert lifecycle.build_swap_open(flat) is None


def test_free_alerts_show_no_call_for_uncovered_stocks():
    stocks = [stock(f"C{i}", stance="accumulate", add_below=90.0) for i in range(7)]
    f = [alerts.Finding("Job", "C6", "C6 jumps after deal", "Detail about C6.", "News", "2026-11-10", "")]
    e = alerts.build_alerts(person(stocks, pro=False), f)
    assert "Buy more" not in e.text
    assert "Buy more" in alerts.build_alerts(person(stocks), f).text


def test_zone_rows_keep_their_span_their_cents_and_the_report_said_once():
    big = alerts.Finding("Weekly", "BKNG", "BKNG fell 6.00% over five sessions", "", alerts.PRICE_SOURCE, "2026-11-09", "",
                         kind="move", change_pct=-6.0, close=1410.6, zone="add", level=1411.2, run_day="2026-11-09", run_close="2026-11-09")
    e = alerts.build_alerts(person([]), [big], now=NOW)
    # five sessions, not a day; and a close that never reads the same as the level it is under
    # the five-session sentence runs past ten words, so the headline is the level and the row keeps the move
    assert e.subject == "BKNG reached our buy-more price, $1,411.20"
    assert "$1,410.60" in e.html
    morning = dict(run_day="2026-11-09", run_close="2026-11-09")
    f = [
        _zone("MID", -5.0, 9.5, 10.0),
        alerts.Finding("Morning check", "MID", "MID fell 5.0% in the last session", "", alerts.PRICE_SOURCE, "2026-11-09", "", kind="move", change_pct=-5.0, close=9.5, **morning),
        alerts.Finding("Morning check", "MID", "MID reports earnings tomorrow", "", "Earnings calendar", "2026-11-11", "", kind="earnings", time="amc", **morning),
        # already reported: not a heads-up any more
        alerts.Finding("Morning check", "OLD", "OLD reports earnings", "", "Earnings calendar", "2026-11-05", "", kind="earnings", **morning),
    ]
    text = alerts.build_alerts(person([]), f, now=NOW).text
    assert text.count("\nMID ") == 2 and "Reports tomorrow after the close" in text
    assert "OLD" not in text


# ------------------------------------------------------------ owner rules, Nov 12

def _h1s(e):
    return [re.sub(r"<[^>]+>", "", m) for m in re.findall(r"<h1[^>]*>(.*?)</h1>", e.html)]


def _all_emails():
    s = stock("ALL", change_pct=8.0, position="holding", week_change_pct=2.0, stance="accumulate",
              add_below=90.0, trim_above=130.0, call_text="Accumulate", earnings_date=date(2026, 11, 12), earnings_time="amc")
    s.calls = calls("hold", "hold", "hold", "accumulate")
    p = person([s] + [stock(f"X{i}", week_change_pct=-4.0, change_pct=-5.0 - i) for i in range(6)])
    free = person(p.stocks, pro=False)
    return [
        daily.build_daily(p, now=NOW), weekly.build_weekly(p, now=NOW), lifecycle.build_welcome(p, [s], now=NOW),
        lifecycle.build_setup_nudge(p, [s], day=2, now=NOW), lifecycle.build_setup_nudge(p, [s], day=5, now=NOW),
        lifecycle.build_pro_welcome(p), lifecycle.build_swap_open(free), lifecycle.build_winback(p, now=AWAY_NOW),
        alerts.build_alerts(p, [_zone("ALL", -4.21, 89.8, 90.0)], now=NOW),
        lifecycle.build_brief_ready(ticker="ALL", name="All Things Inc.", price=101.5, change_pct=2.1, headline="All Things rises after results beat"),
    ]


def test_titles_are_ten_words_and_cards_one_short_line():
    for e in _all_emails():
        assert e is not None
        for h in _h1s(e):
            assert kit.word_count(h) <= 10, (e.kind, h)
        assert "via " not in e.text, e.kind  # no source lines
        assert "border-top:3px" not in e.html and "border-top:4px" not in e.html, e.kind  # no coloured top edge


def test_a_card_shows_one_line_and_never_cuts_it():
    long = "This sentence is far too long for a card because it keeps going on and on past fifteen words."
    d = kit.Doc().cards([kit.Card(ticker="A", name="Alpha Inc.", line=long, why="Short and its own.", price=10.0, move=1.0,
                                  period="today")])
    assert "Short and its own." in d.text_body() and long not in d.text_body()
    assert "A Alpha $10.00 +1.0% today" in d.text_body()


def test_every_stock_card_has_name_price_and_a_labelled_move():
    s = stock("PRC", name="Price Co Inc.", price=123.45, change_pct=9.0, earnings_date=date(2026, 11, 12), earnings_time="bmo")
    e = daily.build_daily(person([s, stock("OTH", name="Other Corp", price=50.0, change_pct=0.1, earnings_date=date(2026, 11, 13))]), now=NOW)
    assert "$123.45" in e.html and "+9.0%" in e.html and "Price Co" in e.html and "&nbsp;yesterday" in e.html
    w = weekly.week_card(stock("WK", name="Week Corp", week_change_pct=3.0), NOW.date())
    assert w.period == "this week"


def test_recent_days_are_words():
    today = date(2026, 11, 12)  # Thursday
    assert kit.day_word("2026-11-12", today) == "today"
    assert kit.day_word("2026-11-11", today) == "yesterday"
    assert kit.day_word("2026-11-13", today) == "tomorrow"
    assert kit.day_word("2026-11-09", today) == "Monday"
    assert kit.day_word("2026-11-17", today) == "Tuesday"
    assert kit.day_word("2026-11-02", today) == "Nov 2"
    assert kit.close_word("2026-11-10", today) == "Tuesday's close"
    e = daily.build_daily(person([stock("ONE", change_pct=9.0)]), now=NOW)
    assert e.text.startswith("Tuesday · before the open") and "Nov 10" not in e.text


def _sell(ticker, close, level, move=3.0):
    return alerts.Finding("When to sell some", ticker, f"{ticker} rose {move}% to ${close}, above its ${level} sell-some level", "",
                          alerts.PRICE_SOURCE, "2026-11-09", "", kind="level", change_pct=move, close=close, zone="trim",
                          level=level, run_day="2026-11-09", run_close="2026-11-09")


def _turn(ticker, before, after, reason="Margins are shrinking faster than revenue grows."):
    return alerts.Finding("Our call changes", ticker, f"Our call on {ticker} moved from {before} to {after}", reason,
                          "Our research call", "2026-11-09", f"/stock/{ticker}", kind="call", call_from=before, call_to=after)


def test_sell_some_alert_names_the_company_and_our_price():
    p = person([stock("ORCL", name="Oracle Corporation")])
    e = alerts.build_alerts(p, [_sell("ORCL", 256.10, 255.76)], now=NOW)
    assert e.subject == "Oracle reached our sell-some price, $255.76"
    # the card shows the close and the move as figures; its line is the level it passed
    assert "Above its $255.76 sell-some level.</div>" in e.html and "$256.10" in e.html and "Oracle" in e.html


def test_call_change_alert_says_the_new_call_in_plain_words():
    s = stock("AMD", price=250.0, change_pct=-2.0)
    s.dates, s.closes = ["2026-11-06", "2026-11-09"], [255.0, 250.0]
    e = alerts.build_alerts(person([s]), [_turn("AMD", "Keep", "Sell some")], now=NOW)
    assert e.subject == "Our call on AMD changed to Sell some"
    assert "Keep → Sell some" in e.html and "Margins are shrinking" in e.html
    assert "$250.00" in e.html and "−2.0%" in e.html  # the price and the day's move on the row
    two = alerts.build_alerts(person([s, stock("MU")]), [_turn("AMD", "Keep", "Sell some"), _turn("MU", "Buy more", "Keep")], now=NOW)
    assert two.subject == "Our calls on AMD and MU changed"
    stored = alerts.Finding("j", "X", "h", "", "", "2026-11-09", "", kind="call", call_from="Keep", call_to="Sell some")
    assert stored.call_to == "Sell some"


def test_call_changes_load_from_stored_runs():
    class Src:
        def query(self, *a, **k):
            return [("r/1", {"ran_at": "2026-11-10T12:00:00Z", "job_name": "Our call changes", "findings": [
                {"ticker": "amd", "headline": "Our call on AMD moved from Keep to Sell some", "kind": "call",
                 "call_from": "Keep", "call_to": "Sell some", "at": "2026-11-09"}]}), ]
    f = alerts.load_findings(Src(), "u", since=NOW - timedelta(days=1))
    assert f[0].call_from == "Keep" and f[0].call_to == "Sell some" and f[0].ticker == "AMD"


def test_research_ready_email_is_on_the_kit():
    from backend.emails.brief_ready import build_brief_ready_email

    subject, page = build_brief_ready_email(ticker="nvda", company_name="NVIDIA Corporation", price=180.5, day_change_pct=1.25,
                                            headline="Nvidia rises after a new chip order")
    assert subject == "Our research on NVDA is ready"
    assert "AI brief" not in page and "$180.50" in page and ("+1.2%" in page or "+1.3%" in page)
    assert kit.esc(kit.logo_src("NVDA")) in page and page.count(f"background:{kit.t.COPPER}'") == 1


def test_call_rows_drop_desk_words_and_shared_reasons():
    canned = "The setup is not paying enough for the risk right now."
    e = alerts.build_alerts(person([stock("A"), stock("B")]),
                            [_turn("A", "Keep", "Sell some", canned), _turn("B", "Buy more", "Keep", "Sales slowed for a second quarter.")],
                            now=NOW)
    assert "setup" not in e.text and "Sales slowed for a second quarter." in e.text and "Buy more → Keep" in e.text
    shared = "Sales slowed for a second quarter."
    two = alerts.build_alerts(person([stock("A"), stock("B")]), [_turn("A", "Keep", "Sell some", shared), _turn("B", "Keep", "Sell some", shared)], now=NOW)
    assert shared not in two.text


def test_a_report_row_takes_the_quote_when_the_history_is_behind():
    mover = stock("MOV")
    rep = stock("REP", price=42.0, change_pct=3.5)
    rep.price_at = datetime(2026, 11, 9, 21, 0, tzinfo=timezone.utc)
    rep.dates, rep.closes = ["2026-11-05", "2026-11-06"], [40.0, 40.5]
    zone = _zone("MOV", -4.0, 95.0, 96.0)
    report = alerts.Finding(zone.job_name, "REP", "REP reports earnings tomorrow", "", "Earnings calendar", "2026-11-11", "",
                            kind="earnings")
    e = alerts.build_alerts(person([mover, rep]), [zone, report], now=NOW)
    # its stored closes stop on Nov 6, but the quote is from the section's session (Nov 9), so the row has a price
    assert "$42.00" in e.html and "+3.5%" in e.html


def test_card_rows_are_always_full():
    two = kit.Doc().cards([kit.Card(ticker=f"T{i}") for i in range(2)]).html_body()
    three = kit.Doc().cards([kit.Card(ticker=f"T{i}") for i in range(3)]).html_body()
    assert two.count("width='50%' valign") == 2 and "sbgap' width='50%'" not in two
    assert three.count("width='100%' valign") == 3  # an odd count goes one per row instead of leaving a gap


def test_every_alert_headline_stays_within_ten_words():
    many = [_zone(t, -4.0, 95.0, 96.0) for t in ("AAPL", "MSFT", "NVDA", "AMZN", "META")]
    mixed = [_zone("AAPL", -4.0, 95.0, 96.0), _zone("MSFT", -4.0, 95.0, 96.0), _sell("ORCL", 256.10, 255.76)]
    span = [_zone("AAPL", -4.21, 139.75, 142.07)]
    span[0].headline = "AAPL fell 4.21% over five sessions, into its add zone"
    for findings in (many, mixed, span):
        p = person([stock(f.ticker or "") for f in findings])
        e = alerts.build_alerts(p, findings, now=NOW)
        assert kit.word_count(e.subject) <= 10, e.subject
    e = alerts.build_alerts(person([stock("AAPL")]), span, now=NOW)
    assert e.subject == "AAPL reached our buy-more price, $142.07"


def test_weekly_card_labels_the_week_and_the_day_apart():
    s = stock("AMD", name="Advanced Micro Devices", week_change_pct=-2.3)
    s.dates, s.closes = ["2026-11-06", "2026-11-09"], [140.0, 139.75]
    d = kit.Doc().cards([weekly.week_card(s, NOW.date())])
    assert "$139.75 −2.3% this week; −0.2% yesterday" in d.text_body()


def test_research_ready_stop_link_works_without_a_signed_token():
    from backend.emails.brief_ready import build_brief_ready_email

    _, page = build_brief_ready_email(ticker="NVDA", price=100.0, day_change_pct=1.0)
    assert "/email/unsubscribe" not in page and kit.esc(kit.settings_url()) in page
    _, rupees = build_brief_ready_email(ticker="TCS", price=3500.0, day_change_pct=1.0, currency="₹")
    assert "$3,500" not in rupees


def test_a_premarket_card_shows_no_stale_price():
    s = stock("PRE", price=50.0, change_pct=0.2)
    s.premarket_pct = 9.0
    it = daily.Item(s, "premarket", 80, "Up 9.0% before the open.", "")
    assert daily.card_for(it, NOW.date()).price is None


# ------------------------------------------------------------- hand-set price alerts

def _sessions(first: date, last: date) -> list[str]:
    """NYSE trading days from `first` to `last`, as stored history dates."""
    out, d = [], first
    while d <= last:
        if nyse.trading_day(d):
            out.append(d.isoformat())
        d += timedelta(days=1)
    return out


def _closed(ticker, close, prev, **kw):
    """A stock whose stored closes end on Monday Nov 9, the session a Tuesday 8:30am run judges an alert on."""
    s = stock(ticker, **kw)
    s.dates, s.closes = ["2026-11-06", "2026-11-09"], [prev, close]
    return s


def _alert(**kw):
    return {"id": "a1", "uid": "u1", "ticker": "SPCX", "instrument_id": "US_SPCX", "condition": "below", "target_price": 142.0,
            "kind": "price_threshold", "active": True, "triggered": False, **kw}


def test_price_alert_reads_as_one_card_and_one_button():
    s = _closed("SPCX", 139.75, 143.04, name="Space Exploration Technologies Corp.")
    e = alerts.build_price_alert(s, _alert(), now=NOW)
    assert e.subject == "SPCX is below your $142 alert"
    assert "Fell 2.3% to $139.75, below your $142 alert." in e.html and "Space Exploration" in e.html
    assert "Open SPCX" in e.html and e.html.count(f"background:{kit.t.COPPER}'") == 1
    assert e.kind == "price_alert" and e.category == "alerts"
    assert alerts.build_price_alert(_closed("SPCX", 150.0, 149.0), _alert(), now=NOW) is None  # not reached
    up = alerts.build_price_alert(_closed("SPCX", 251.0, 248.5), _alert(condition="above", target_price=250.5), now=NOW)
    assert up.subject == "SPCX is above your $250.50 alert"
    # no stored close for Monday yet: wait for it rather than judge on an older one
    behind = _closed("SPCX", 139.0, 140.0)
    behind.dates = ["2026-11-05", "2026-11-06"]
    assert alerts.build_price_alert(behind, _alert(), now=NOW) is None


def test_price_alerts_load_only_live_threshold_alerts():
    class Src:
        def query(self, *a, **k):
            return [("tm_alerts/a1", _alert()), ("tm_alerts/a2", _alert(kind="earnings_24h")),
                    ("tm_alerts/a3", _alert(condition="")), ("tm_alerts/a4", _alert(target_price=0)),
                    ("tm_alerts/a5", _alert(uid="")), ("tm_alerts/a6", {**_alert(), "kind": None})]
    got = alerts.load_price_alerts(Src())
    assert [a["id"] for a in got["u1"]] == ["a1", "a6"]


def test_a_price_alert_is_never_capped_and_is_marked_only_after_a_real_send(monkeypatch):
    from backend.mail import jobs, send

    s = _closed("SPCX", 139.75, 143.04)
    monkeypatch.setattr(jobs, "stocks_by_id", lambda src, ids, now=None: [s])
    planned = jobs._price_alert_emails(None, NOW, [_alert()])
    assert len(planned) == 1 and planned[0][1] == "price_alert:a1"
    email = planned[0][0]
    hist = send.History(keys=set(), by_category_today={"alerts": 9}, last_by_kind={})
    out = send.deliver(store=None, uid="u1", user={"email": "a@x.com"}, email=email, dedupe_key="price_alert:a1", history=hist, dry_run=True)
    assert out.status == "dry_run"  # the alert cap (4 a day) does not hold it back
    marked = []
    planned[0] = (email, "price_alert:a1", lambda store: marked.append(store))
    stats = __import__("collections").Counter()
    monkeypatch.setattr(send.History, "load", classmethod(lambda cls, src, uid, now: send.History(set(), {}, {})))
    # nothing may leave the machine: the transport is a stub that records the call
    posted = []
    monkeypatch.setattr(send, "_post_brevo", lambda to, email, headers: posted.append(to) or True)
    run = lambda **kw: jobs._run_one("alerts", lambda *a: planned, None, object(), "u1", {"email": "a@x.com"}, now=NOW,
                                     stats=stats, **kw)
    run(dry_run=True, to=None)
    assert marked == [] and posted == []  # a dry run never sends or writes
    run(dry_run=False, to="me@x.com")
    assert marked == []  # a --to test send never marks the alert fired
    monkeypatch.setattr("backend.email_runtime.log_email_send", lambda *a, **k: None)
    run(dry_run=False, to=None)
    assert len(marked) == 1  # a real send marks it, so it is not checked again


def test_two_cards_reporting_the_same_day_both_keep_their_date():
    a, b = (stock(t, earnings_date=date(2026, 11, 12), earnings_time="amc", change_pct=0.1) for t in ("AAA", "BBB"))
    e = daily.build_daily(person([stock("MOV", change_pct=9.0), a, b]), now=NOW)
    assert e.text.count("Reports Thursday after the close.") == 2


def test_a_level_and_its_report_read_as_one_line():
    morning = dict(run_day="2026-11-09", run_close="2026-11-09")
    f = [_zone("MID", -5.0, 9.5, 10.0),
         alerts.Finding("Morning check", "MID", "MID reports earnings tomorrow", "", "Earnings calendar", "2026-11-11", "", kind="earnings",
                        time="amc", **morning)]
    from dataclasses import replace

    text = alerts.build_alerts(person([]), [replace(f[0], job_name="Morning check"), f[1]], now=NOW).text
    assert "level., " not in text and "Below its $10.00 buy-more level, reports tomorrow after the close." in text


def test_price_alerts_do_not_use_up_the_agent_alert_cap():
    from backend.mail import send

    class Src:
        def query(self, *a, **k):
            return [("s/1", {"dedupe_key": "price_alert:a1", "email_type": "price_alert", "sent_at": NOW.isoformat(),
                             "meta": {"category": "alerts"}})] * 5
    hist = send.History.load(Src(), "u1", now=NOW)
    assert hist.by_category_today.get("alerts", 0) == 0


def test_winback_falls_back_to_three_weeks_when_the_visit_is_older_than_our_prices():
    s = stock("OLD", week_change_pct=1.0)
    s.dates = _sessions(date(2026, 10, 1), date(2026, 11, 9))  # starts a month after the visit, ends on the latest close
    s.closes = [100.0 + i for i in range(len(s.dates))]
    p = person([s])
    p.last_seen = datetime(2026, 9, 1, tzinfo=timezone.utc)
    e = lifecycle.build_winback(p, now=NOW)
    assert e is not None and "over the past three weeks" in e.text and "while you were away" not in e.text
    assert "since your last visit" not in e.text.lower().split("--")[0]


# ------------------------------------------------------------- council round 2

def test_scraped_title_case_is_cleaned_in_card_reasons():
    from backend.mail.headline_case import headline_case

    assert headline_case("Sandisk soar as CoreWeave CEO says AI demand outpaces World's Capacity", "Sandisk Corporation") == \
        "Sandisk soar as CoreWeave CEO says AI demand outpaces world's capacity"
    assert headline_case("TSM Stock Jumps Premarket After Board Approves $1B Investment In Anthropic And OpenAI",
                         "Taiwan Semiconductor") == "TSM stock jumps premarket after board approves $1B investment in Anthropic and OpenAI"
    # names keep their capitals: a company beside a common word, and a first name with its surname
    assert headline_case("Constellation Energy Shares Rise After Strong Results", "Constellation Energy Corp") == \
        "Constellation Energy shares rise after strong results"
    assert headline_case("Tim Cook Says Apple Will Beat Estimates", "Apple Inc.") == "Tim Cook says Apple will beat estimates"
    s = stock("SNDK", name="Sandisk Corporation", change_pct=13.7,
              news=[Headline("Sandisk Soars As CoreWeave CEO Says AI Demand Outpaces World's Capacity", "Reuters", "",
                             CLOSE - timedelta(hours=2))])
    e = daily.build_daily(person([s]), now=NOW)
    assert "World's Capacity" not in e.text and "Outpaces" not in e.text


def test_the_web_word_lists_are_read():
    from backend.mail.headline_case import word_lists

    lists = word_lists()
    assert "capacity" in lists["COMMON"] and "board" in lists["MIXED_COMMON"] and "nvidia" in lists["KNOWN_NAMES"]


def test_a_price_alert_is_judged_on_a_fresh_quote_or_the_real_close():
    from backend.mail.alerts import alert_price

    et = mail_data.ET
    s = _closed("SPCX", 139.75, 143.04, price=138.0, change_pct=-3.5)
    # 11am ET Tuesday, market open: the live quote, only when at most 30 minutes old
    open_ = datetime(2026, 11, 10, 11, 0, tzinfo=et)
    s.price_at = open_ - timedelta(minutes=20)
    assert alert_price(s, open_)[0] == 138.0
    s.price_at = open_ - timedelta(minutes=45)
    assert alert_price(s, open_) is None
    # before the open: Monday's stored close, never a quote taken before the bell
    s.price_at = datetime(2026, 11, 9, 15, 30, tzinfo=et)
    price, move, day = alert_price(s, datetime(2026, 11, 10, 8, 30, tzinfo=et))
    assert (price, day.isoformat()) == (139.75, "2026-11-09") and round(move, 1) == -2.3
    # after 4pm on Monday, the close for Monday must be stored before an alert can fire
    s.dates = ["2026-11-05", "2026-11-06"]
    assert alert_price(s, datetime(2026, 11, 9, 16, 30, tzinfo=et)) is None


def test_half_days_close_at_one():
    assert nyse.session_close(date(2026, 11, 27)).hour == 13 and nyse.session_close(date(2026, 11, 25)).hour == 16
    # 2pm ET on the half day after Thanksgiving: that session is over, so it is the one an alert is judged on
    assert nyse.last_closed_session(datetime(2026, 11, 27, 14, 0, tzinfo=mail_data.ET)) == date(2026, 11, 27)
    assert nyse.last_closed_session(datetime(2026, 11, 27, 12, 0, tzinfo=mail_data.ET)) == date(2026, 11, 25)


def test_a_price_right_on_the_alert_reads_at():
    s = _closed("SPCX", 142.0, 143.43)
    e = alerts.build_price_alert(s, _alert(), now=NOW)
    assert e.subject == "SPCX is at your $142 alert" and "Fell 1.0% to $142.00, at your $142 alert." in e.html


def test_rebalance_shows_every_tracked_stock_before_cutting():
    from backend.mail import rebalance

    added = [{"symbol": f"S{i}", "weight": 0.05} for i in range(10)] + [{"symbol": "NVDA", "weight": 0.01},
                                                                        {"symbol": "MU", "weight": 0.01}]
    many = [{"slug": "a", "name": "A", "date": "2026-11-10", "added": added, "removed": [], "previously_held": 10},
            {"slug": "b", "name": "B", "date": "2026-11-10", "added": [{"symbol": "X"}], "removed": [], "previously_held": 5}]
    e = rebalance.build_note(many, tracked={"NVDA", "MU", "AAPL", "TSLA"}, now=NOW)
    assert "/stock/NVDA" in e.html and "/stock/MU" in e.html  # tracked ones are never hidden by the two-card limit
    # said once in a heading, never on every card (owner rule 1)
    assert e.text.count("Stocks you track") == 1 and "You track it" not in e.text
    assert "And 8 more on the strategy page." in e.text  # 10 untracked bought: 2 shown, 8 wait


def test_winback_counts_from_the_first_close_after_the_visit():
    s = stock("WBK", name="Winback Co")
    s.dates = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-11-09"]
    s.closes = [100.0, 110.0, 120.0, 130.0, 156.0]
    p = person([s])
    p.last_seen = datetime(2026, 10, 20, 15, 0, tzinfo=timezone.utc)  # 11am ET on the 20th: counts from that day's close
    e = lifecycle.build_winback(p, now=NOW)
    assert "+41.8% since your last visit" in e.text  # 110 -> 156, not 100 -> 156
    p.last_seen = datetime(2026, 10, 21, 0, 30, tzinfo=timezone.utc)  # 8:30pm ET on the 20th: the next day's close
    assert "+30.0% since your last visit" in lifecycle.build_winback(p, now=NOW).text  # 120 -> 156


def test_winback_counts_from_a_half_day_close():
    s = stock("HALF", name="Half Day Co")
    s.dates = ["2026-11-25", "2026-11-27", "2026-11-30", "2026-12-15"]
    s.closes = [100.0, 110.0, 120.0, 132.0]
    p = person([s])
    p.last_seen = datetime(2026, 11, 27, 18, 30, tzinfo=timezone.utc)  # 1:30pm ET on the half day: after its 1pm close
    e = lifecycle.build_winback(p, now=datetime(2026, 12, 16, 13, 0, tzinfo=timezone.utc))
    assert "+10.0% since your last visit" in e.text  # from Nov 30 (120), not the half day's close (110)


def test_rebalance_fetches_quotes_for_tracked_and_untracked_cards(monkeypatch):
    import backend.mail.data as data
    from backend.mail import rebalance

    record = {"slug": "a", "added": [{"symbol": f"S{i}", "weight": 0.1 - i / 100} for i in range(6)] + [{"symbol": "MU"}],
              "removed": [{"symbol": "NOW"}, {"symbol": "JPM", "previous_weight": 0.05}]}
    asked = []

    def fake(src, ids, now=None):
        asked.extend(ids)
        return []
    monkeypatch.setattr(data, "stocks_by_id", fake)
    rebalance.quotes_for(object(), [record], NOW, {"MU", "NOW"})
    assert {"US_MU", "US_NOW", "US_S0", "US_S1", "US_JPM"} <= set(asked)


def test_a_premarket_quote_never_fires_an_alert_at_the_open():
    from backend.mail.alerts import alert_price

    et = mail_data.ET
    s = _closed("SPCX", 139.75, 143.04, price=138.0, change_pct=-3.5)
    s.price_at = datetime(2026, 11, 10, 9, 25, tzinfo=et)  # a premarket quote, five minutes old at 9:30
    assert alert_price(s, datetime(2026, 11, 10, 9, 30, tzinfo=et)) is None
    s.price_at = datetime(2026, 11, 10, 9, 31, tzinfo=et)
    assert alert_price(s, datetime(2026, 11, 10, 9, 40, tzinfo=et))[0] == 138.0


def test_winback_leaves_out_a_stock_whose_history_starts_after_the_visit():
    old = stock("OLD", name="Old Co")
    old.dates, old.closes = ["2026-10-19", "2026-10-20", "2026-11-09"], [100.0, 110.0, 121.0]
    new = stock("NEW", name="New Co")
    new.dates, new.closes = ["2026-10-28", "2026-11-09"], [50.0, 100.0]  # listed after the visit
    p = person([old, new])
    p.last_seen = datetime(2026, 10, 20, 15, 0, tzinfo=timezone.utc)
    e = lifecycle.build_winback(p, now=NOW)
    assert "OLD" in e.text and "NEW" not in e.text and "+10.0% since your last visit" in e.text


def test_winback_fallback_is_three_calendar_weeks():
    s = stock("CAL", name="Calendar Co")
    s.dates = ["2026-10-16", "2026-10-19", "2026-10-20", "2026-10-21", "2026-11-09"]
    s.closes = [80.0, 100.0, 104.0, 108.0, 125.0]
    e = lifecycle.build_winback(person([s]), now=NOW)  # no known visit; Nov 10 minus 21 days is Oct 20
    assert "+20.2% over the past three weeks" in e.text  # from Oct 20 (104), not 15 sessions back


# ------------------------------------------------------------- council round 5

def test_a_price_alert_says_no_day_move_across_a_gap():
    s = _closed("SPCX", 139.75, 150.0)
    s.dates = ["2026-11-04", "2026-11-09"]  # the close before Monday's is from last Wednesday: several days, not one
    e = alerts.build_price_alert(s, _alert(), now=NOW)
    assert "At $139.75, below your $142 alert." in e.html and "yesterday" not in e.text.split("--")[0]
    assert "−6.8%" not in e.html


def test_winback_leaves_out_a_stock_whose_prices_stopped():
    fresh = stock("NEW", name="Fresh Co")
    fresh.dates, fresh.closes = ["2026-10-19", "2026-10-20", "2026-11-09"], [100.0, 110.0, 121.0]
    stale = stock("STL", name="Stale Co")
    stale.dates, stale.closes = ["2026-10-19", "2026-10-20", "2026-11-05"], [10.0, 11.0, 30.0]  # stopped on Thursday
    p = person([fresh, stale])
    p.last_seen = datetime(2026, 10, 20, 15, 0, tzinfo=timezone.utc)
    e = lifecycle.build_winback(p, now=NOW)
    assert "NEW" in e.text and "STL" not in e.text


def test_winback_fallback_needs_the_exact_cutoff_session():
    exact = stock("EXA", name="Exact Co")
    exact.dates, exact.closes = ["2026-10-19", "2026-10-20", "2026-11-09"], [90.0, 100.0, 110.0]
    gap = stock("GAP", name="Gap Co")
    gap.dates, gap.closes = ["2026-10-16", "2026-11-09"], [50.0, 100.0]  # no close for Oct 20, the cutoff session
    e = lifecycle.build_winback(person([exact, gap]), now=NOW)
    assert "EXA" in e.text and "GAP" not in e.text and "+10.0% over the past three weeks" in e.text


def test_a_live_alert_moves_from_the_previous_sessions_stored_close():
    from backend.mail.alerts import alert_price

    et = mail_data.ET
    now = datetime(2026, 11, 10, 11, 0, tzinfo=et)  # Tuesday, market open
    s = _closed("SPCX", 140.0, 143.0, price=133.0, change_pct=-9.9)  # the quote's own move is ignored
    s.price_at = now - timedelta(minutes=5)
    price, move, _ = alert_price(s, now)
    assert price == 133.0 and round(move, 1) == -5.0  # 133 against Monday's stored 140
    s.dates = ["2026-11-05", "2026-11-06"]  # no stored close for Monday: no move rather than a guess
    assert alert_price(s, now)[1] is None
    e = alerts.build_price_alert(s, _alert(), now=now)
    assert "At $133.00, below your $142 alert." in e.html and "−9.9%" not in e.html


# ------------------------------------------------------------- no number twice (owner rule 1, Nov 13)

from backend.mail.repeats import repeats_in  # noqa: E402


def test_new_facts_keeps_only_what_the_figures_do_not_say():
    shown = kit.figures("$50.77 −1.8% Buy more under $50.79")
    # every figure is already on the card, and what's left only restates the call pill
    assert kit.new_facts("Fell 1.8% to $50.77.", shown) == ""
    assert kit.new_facts("Fell 1.8% to $50.77, below its $50.79 buy-more level.", shown) == "Below its $50.79 buy-more level."
    # a new figure stays, and so does a sentence with no shown figure
    assert kit.new_facts("Up 2.4% before the open this morning.", shown) == "Up 2.4% before the open this morning."
    assert kit.new_facts("Down 8.8% over the last 20 sessions.", shown) == "Down 8.8% over the last 20 sessions."
    # a reason keeps its cause without the move the card already shows
    assert kit.new_facts("Sandisk surges 12.3% as AI trade revives.", kit.figures("+12.3%")) == "Sandisk surges as AI trade revives."
    assert kit.new_facts("Rose 32.9% to $35.87, at its $35.87 sell-some level.",
                         kit.figures("$35.87 +32.9%")) == "At its $35.87 sell-some level."
    # $1,431 and $1,431.00 are one price; the sign of a move is its colour
    assert kit.new_facts("Closed at $1,431.00.", kit.figures("$1,431")) == ""
    assert kit.new_facts("Its biggest day was Tuesday, −3.0%.", kit.figures("−3.0%")) == "Its biggest day was Tuesday."
    # a move written with its own sign is a different move when the sign differs
    assert kit.new_facts("Its biggest day was Thursday, +0.5%.", kit.figures("−0.5%")) == "Its biggest day was Thursday, +0.5%."
    # a figure that measures something else stays, even when its value matches the card's (QA, Nov 13)
    for line, shown_text in (("A normal day moves it 4.2%.", "4.2%"), ("Now 3.0% over our sell-some price.", "3.0%"),
                             ("Up 1.8% over the last 20 sessions.", "−1.8%"), ("About 3.1x its usual daily move.", "3.1x"),
                             ("S&P 500 fell 1.8%, the stock held up.", "1.8%"), ("Up 1.8% before the open this morning.", "1.8%")):
        assert kit.new_facts(line, kit.figures(shown_text)) == line
    # "U.S." is not the end of a sentence, and a semicolon stays a semicolon
    assert kit.new_facts("U.S. stocks fell 1.8% as yields rose.", kit.figures("1.8%")) == "U.S. stocks fell as yields rose."
    assert kit.new_facts("Fell 4.3% to $166.19; below your $168 alert.", kit.figures("$166.19 −4.3%")) == "Below your $168 alert."


def test_daily_level_card_says_no_figure_twice():
    s = stock("CGNX", name="Cognex Corporation", price=50.77, prev_close=51.7, change_pct=-1.8, stance="accumulate",
              add_below=50.79)
    s.calls = calls("accumulate", "accumulate", trigger=("price_below", 50.79))
    s.calls[-1].day = "2026-11-08"
    e = daily.build_daily(person([s]), now=NOW)
    assert e is not None and "At our buy-more price" in e.text
    assert repeats_in(e.html) == []
    assert "Fell 1.8% to $50.77" not in e.html.split("</h1>", 1)[1]  # the headline may say it; the card does not


def test_daily_level_card_keeps_a_morning_move_it_does_not_show():
    s = stock("OUST", price=36.6, prev_close=38.3, change_pct=-4.2, stance="accumulate", add_below=38.22)
    s.calls = calls("accumulate", "accumulate", trigger=("price_below", 38.22))
    s.calls[-1].day = "2026-11-08"
    s.premarket_pct = 1.8
    e = daily.build_daily(person([s]), now=NOW)
    assert "Up 1.8% before the open this morning." in e.text and repeats_in(e.html) == []


def test_zone_and_sell_alert_cards_say_no_figure_twice():
    e = alerts.build_alerts(person([stock("SPCX")]), [_zone("SPCX", -4.21, 139.8, 142.07)], now=NOW)
    assert repeats_in(e.html) == []
    sell = alerts.Finding("When to sell some", "SMCI", "SMCI rose 32.9% to $35.87, at its $35.87 sell-some level", "",
                          alerts.PRICE_SOURCE, "2026-11-09", "", kind="level", change_pct=32.9, close=35.87, zone="trim",
                          level=35.87, run_day="2026-11-09", run_close="2026-11-09")
    e = alerts.build_alerts(person([stock("SMCI")]), [sell], now=NOW)
    assert repeats_in(e.html) == [] and "At its sell-some level." in e.text


def test_price_alert_card_does_not_repeat_its_headline_or_figures():
    s = _closed("SPCX", 139.75, 143.04, name="Space Exploration Technologies Corp.")
    e = alerts.build_price_alert(s, _alert(), now=NOW)
    assert repeats_in(e.html) == [] and e.text.count("$142") == 1 + e.text.count("Subject")


def test_a_level_set_at_the_close_is_not_said_beside_the_same_price():
    card = kit.Card(ticker="AVGO", name="Broadcom Inc.", price=364.38, move=5.5, period="yesterday",
                    call=kit.call_pill_text(kit.BUY, 364.38), line="Up 5.8% over the last 20 sessions.")
    d = kit.Doc().cards([card])
    assert "[Buy more]" in d.text_body() and "under $364.38" not in d.html_body()
    assert repeats_in(d.html_body()) == []


def test_weekly_call_change_rides_on_its_best_week_card():
    up = stock("UPP", week_change_pct=12.0, stance="hold")
    # settled on Sell some well before the week, then Keep during it (the helper's closes end on Oct 20)
    up.calls = calls("trim", "trim", "trim", last_day="2026-10-03") + calls("hold", last_day="2026-10-16")
    down = stock("DWN", week_change_pct=-6.0)
    e = weekly.build_weekly(person([up, down]), now=NOW)
    assert "Sell some → Keep" in e.text and "Calls we changed" not in e.text
    assert repeats_in(e.html) == []


def test_rebalance_headings_do_not_count_the_stocks_again():
    from backend.mail import rebalance

    rec = {"slug": "dip", "name": "Buy the dip", "date": "2026-11-09", "previously_held": 3,
           "added": [{"symbol": "AAA", "weight": 0.5}, {"symbol": "BBB", "weight": 0.5}],
           "removed": [{"symbol": "CCC"}, {"symbol": "DDD"}]}
    e = rebalance.build_note([rec], now=NOW)
    assert "swapped 2 of its 3 stocks" in e.text and "Bought 2" not in e.text and "Sold 2" not in e.text


def test_a_carded_stock_that_reports_later_says_when_on_its_card():
    # QA, Nov 13: a level card for a stock reporting next week used to come back under "Earnings coming up"
    s = stock("CGNX", name="Cognex Corporation", price=50.77, prev_close=51.7, change_pct=-1.8, stance="accumulate",
              add_below=50.79, earnings_date=date(2026, 11, 18), earnings_time="amc")
    s.calls = calls("accumulate", "accumulate", trigger=("price_below", 50.79))
    s.calls[-1].day = "2026-11-08"
    e = daily.build_daily(person([s]), now=NOW)
    assert "Earnings coming up" not in e.text and e.text.count("/stock/CGNX") == 1
    assert "Reports Wednesday, Nov 18 after the close." in e.text and repeats_in(e.html) == []


def test_weekly_pick_that_reports_next_week_is_carded_once():
    sat = datetime(2026, 11, 14, 14, 0, tzinfo=timezone.utc)
    up = stock("UPP", week_change_pct=12.0, earnings_date=date(2026, 11, 18), earnings_time="bmo")
    e = weekly.build_weekly(person([up, stock("DWN", week_change_pct=-6.0)]), now=sat)
    assert e.text.count("/stock/UPP") == 1 and "Reports Wednesday before the open." in e.text
    assert repeats_in(e.html) == []


def test_rebalance_heading_counts_when_the_title_does_not():
    from backend.mail import rebalance

    rec = {"slug": "dip", "name": "Buy the dip", "date": "2026-11-09", "previously_held": 2, "market_ok": False,
           "added": [], "removed": [{"symbol": "CCC"}, {"symbol": "DDD"}]}
    e = rebalance.build_note([rec], now=NOW)
    assert "sold everything" in e.text and "Sold 2" in e.text
