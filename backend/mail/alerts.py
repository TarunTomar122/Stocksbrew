"""Alert emails: what your agent jobs found, bundled.

Price alerts you set by hand still go out one by one from backend/price_alerts.py
and obey the same email_alerts_enabled switch.

Runs that land within the bundling window go out as one email. Each
finding keeps the job that found it and the source it read, so the email
says where every fact came from.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from backend.mail import kit
from backend.mail.data import Person, parse_ts
from backend.mail.source import Source

BUNDLE_WINDOW_MIN = 15
MAX_ALERT_EMAILS_PER_DAY = 4


@dataclass
class Finding:
    job_name: str
    ticker: str | None
    headline: str
    detail: str
    source: str
    at: str
    url: str


def load_findings(src: Source, uid: str, *, since: datetime) -> list[Finding]:
    rows = src.query("tm_agent_runs", [("uid", "==", uid), ("decision", "==", "notify")], limit=200)
    out: list[Finding] = []
    for _, run in sorted(rows, key=lambda r: str(r[1].get("ran_at") or "")):
        ran = parse_ts(run.get("ran_at"))
        if ran is None or ran < since:
            continue
        for f in run.get("findings") or []:
            url = str(f.get("url") or "")
            out.append(
                Finding(
                    job_name=str(run.get("job_name") or "Agent job"),
                    ticker=(str(f.get("ticker")).upper() if f.get("ticker") else None),
                    headline=str(f.get("headline") or "").strip(),
                    detail=str(f.get("detail") or "").strip(),
                    source=str(f.get("source") or "").strip(),
                    at=str(f.get("at") or "")[:10],
                    url=kit.app_url(url) if url.startswith("/") else url,
                )
            )
    return out


def build_alerts(person: Person, findings: list[Finding], *, unsubscribe_token: str | None = None) -> kit.Email | None:
    findings = [f for f in findings if f.headline]
    if not findings:
        return None
    by_ticker = {s.ticker: s for s in person.stocks}
    jobs: dict[str, list[Finding]] = {}
    for f in findings:
        jobs.setdefault(f.job_name, []).append(f)

    doc = kit.Doc()
    doc.eyebrow("Alert")
    n = len(findings)
    if n == 1:
        doc.h1(findings[0].headline)
    else:
        doc.h1(f"Your agents found {kit.plural(n, 'thing')}")
    doc.p(f"From {kit.join_words([f'“{j}”' for j in jobs])}.", muted=True, size=14)
    for job, items in jobs.items():
        if len(jobs) > 1:
            doc.h2(job, aside=kit.plural(len(items), "finding"))
        if len(items) > 3:
            # a busy job reads better as a list than as a stack of cards
            rows = []
            for f in items[:10]:
                when = f.at[5:].replace("-", "/") if f.at else ""
                rows.append((when, f.ticker or "", f.headline.removeprefix(f"{f.ticker} ").strip() if f.ticker else f.headline))
            doc.calendar(rows)
            src_names = sorted({f.source for f in items if f.source})
            if src_names:
                doc.p(f"Source: {', '.join(src_names)}.", muted=True, size=13)
            if len(items) > 10:
                doc.p(f"Plus {len(items) - 10} more in the app.", muted=True, size=14)
            continue
        for f in items:
            s = by_ticker.get(f.ticker or "")
            if f.ticker:
                doc.stock(
                    ticker=f.ticker,
                    name=s.name if s else "",
                    headline=f.headline,
                    detail=f.detail,
                    source=", ".join(x for x in (f.source, _day(f.at)) if x),
                )
            else:
                doc.note(f.detail, title=f.headline)

    doc.button("See all agent runs", kit.app_url("/agents/jobs"))
    doc.link("Change what your agents watch", kit.app_url("/agents/jobs"))

    if n == 1:
        subject = findings[0].headline
    else:
        tickers = [f.ticker for f in findings if f.ticker]
        uniq = list(dict.fromkeys(tickers))
        subject = f"{findings[0].headline} + {kit.plural(n - 1, 'more alert')}" if len(findings[0].headline) < 48 else f"{n} alerts: {', '.join(uniq[:4])}"
    preheader = "; ".join(f.headline for f in findings[1:4]) or findings[0].detail
    return kit.render(doc, kind="alerts", category="alerts", subject=subject, preheader=preheader,
                      unsubscribe_token=unsubscribe_token, meta={"count": n})


def _day(iso: str) -> str:
    """2026-11-12 -> Nov 12, the way dates read everywhere else in the emails."""
    try:
        return date.fromisoformat(iso[:10]).strftime("%b %-d")
    except ValueError:
        return iso


def bundle_since(last_sent_at: datetime | None, now: datetime | None = None) -> datetime:
    """Findings newer than the last alert email, and never older than a day."""
    now = now or datetime.now(timezone.utc)
    floor = now - timedelta(days=1)
    return max(last_sent_at, floor) if last_sent_at else floor
