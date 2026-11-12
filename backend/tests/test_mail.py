from __future__ import annotations

import re
from datetime import date, datetime, timedelta, timezone

import pytest

from backend.mail import alerts, daily, kit, lifecycle, weekly
from backend.mail import data as mail_data
from backend.mail.data import Call, Headline, Person, Stock, is_reason_headline

NOW = datetime(2026, 11, 10, 13, 30, tzinfo=timezone.utc)  # 8:30am ET Tuesday
CLOSE = datetime(2026, 11, 9, 21, 0, tzinfo=timezone.utc)  # Monday's close


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
    assert "Free covers 5" in email.text and "S6" in email.text


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
    email = alerts.build_alerts(person([]), f)
    # a batch of moves is one headline: how many, how big, who led
    assert email.subject == "5 of your stocks rose 9% or more on Nov 6, led by T0 at +9.0%"
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
        lifecycle.build_winback(p, now=NOW),
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


def test_cards_repeat_no_link_text_and_odd_card_spans_the_row():
    stocks = [stock(f"M{i}", price=110.0, prev_close=100.0, change_pct=10.0 + i,
                    news=[Headline(f"M{i} jumps after deal {i}", "Reuters", "", CLOSE - timedelta(hours=2))]) for i in range(3)]
    e = daily.build_daily(person(stocks), now=NOW)
    assert "Open research" not in e.html and "&rarr;" not in e.html
    assert "colspan='3'" in e.html  # the third card fills its row (two cards and the gutter)


def test_an_unexplained_move_is_a_tile_not_a_card():
    s = stock("BAR", price=110.0, prev_close=100.0, change_pct=10.0)
    e = daily.build_daily(person([s]), now=NOW)
    assert "sbtile" in e.html and "Also moved more than usual" in e.text


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


def test_calendar_row_without_ticker_has_no_stock_link():
    d = kit.Doc().calendar([("11/06", "", "Something happened")])
    assert "/stock/'" not in d.html_body() and "/stock/" not in d.html_body()


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


def test_daily_copy_is_singular_for_one_stock():
    e = daily.build_daily(person([stock("ONE", change_pct=9.0)]), now=NOW)
    assert "the 1 stock you track" in e.text
    free = daily.build_daily(person([stock("ONE", change_pct=9.0)], pro=False), now=NOW)
    assert "your 1 covered stock " in free.text


def test_a_big_mover_keeps_its_earnings_date():
    s = stock("ERN", change_pct=9.0, earnings_date=date(2026, 11, 11), earnings_time="amc")
    e = daily.build_daily(person([s]), now=NOW)
    assert "Earnings coming up" in e.text and "Wed Nov 11" in e.text


def test_free_note_uses_the_plan_number_and_inclusive_wording():
    stocks = [stock(f"S{i}") for i in range(7)]
    stocks[0].change_pct = 9.0
    stocks[6].change_pct = 4.0
    e = daily.build_daily(person(stocks, pro=False), now=NOW)
    assert "Free covers 5 of them" in e.text and "S6 (+4.0%) moved 4% or more" in e.text


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
    section = e.text.split("Coming up next week")[1]
    assert "NXT" in section and "FAR" not in section
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
    assert "allows up to 20" in e.text and "no limit" not in e.text
    assert "has no limit" in lifecycle.build_limit_reached(person([]), title="T", body="B.", used=5, cap=5).text


def test_pro_welcome_grammar_for_one_stock():
    e = lifecycle.build_pro_welcome(person([stock("ONE")]))
    assert "the stock you track is covered now" in e.text and "all 1" not in e.subject


def test_winback_survives_a_zero_close_and_points_at_settings():
    s = stock("ZER")
    s.closes[-16] = 0.0
    assert lifecycle.build_winback(person([s]), now=NOW) is None
    e = lifecycle.build_winback(person([stock("OK")]), now=NOW)
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
    assert "Below its $142.07 buy-more level" in e.html and "Space Exploration" in e.html
    assert "add zone" not in e.text and "Names entering" not in e.text  # the old default name reads in the call's words
    assert "Nov 9 close" in e.text and "11/09" not in e.text
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
    assert text.count("\n  MID ") == 1


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
    assert e.subject == "BKNG fell 6.0% over five sessions to $1,410.60, below its $1,411.20 buy-more level"
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
    assert text.count("\n  MID ") == 2 and "Reports tomorrow after the close" in text
    assert "OLD" not in text
