"""
Price alert checker - checks active alerts against current prices and sends email notifications.

Usage: python -m backend.scripts.check_price_alerts
Env vars: BREVO_API_KEY (for email delivery via Brevo)
"""

import asyncio
import os
import sys
from datetime import datetime, timezone

import yfinance as yf

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from backend.storage import TraceMoneyStore  # noqa: E402


BREVO_API = "https://api.brevo.com/v3/smtp/email"
FROM_EMAIL = "yourtrace.online@gmail.com"
FROM_NAME = "stocksbrew Alerts"


def send_email(to: str, subject: str, body: str) -> bool:
    api_key = os.environ.get("BREVO_API_KEY")
    if not api_key:
        print("  [skip] BREVO_API_KEY not set")
        return False

    try:
        import requests

        resp = requests.post(
            BREVO_API,
            headers={
                "api-key": api_key,
                "Content-Type": "application/json",
            },
            json={
                "sender": {"email": FROM_EMAIL, "name": FROM_NAME},
                "to": [{"email": to}],
                "subject": subject,
                "htmlContent": body,
            },
            timeout=10,
        )
        if resp.status_code in (200, 201):
            print(f"  email sent to {to}")
            return True
        print(f"  brevo error {resp.status_code}: {resp.text[:300]}")
        return False
    except Exception as exc:
        print(f"  brevo exception: {exc}")
        return False


def build_email(ticker: str, condition: str, target: float, current: float, directive_text: str = "") -> tuple[str, str]:
    direction = "dropped below" if condition == "below" else "rose above"
    subject = f"🔔 {ticker} {direction} ${target:.2f}"
    directive_block = ""
    if directive_text:
        directive_block = f"""<tr><td style="padding:0 24px 20px 24px">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border-radius:12px">
          <tr><td style="padding:14px 16px">
            <table cellpadding="0" cellspacing="0">
              <tr><td style="padding-bottom:4px;font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:600;color:#6b7280;letter-spacing:0.06em;text-transform:uppercase">Your directive</td></tr>
              <tr><td style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;font-weight:500;font-style:italic">"{directive_text}"</td></tr>
            </table>
          </td></tr>
        </table>
      </td></tr>"""
    body = f"""<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background-color:#f3f4f6">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:40px 16px">
  <tr><td align="center">
    <table width="480" cellpadding="0" cellspacing="0" style="background-color:#fff;border-radius:16px;border:1px solid #e5e7eb;margin:0 auto">
      <tr><td style="padding:32px 24px 20px 24px">
        <table cellpadding="0" cellspacing="0">
          <tr>
            <td width="32" height="32" align="center" valign="middle" style="background-color:#111;border-radius:8px"><span style="font-size:16px;line-height:1">🔔</span></td>
            <td width="12"></td>
            <td style="font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:600;color:#6b7280;letter-spacing:0.08em;text-transform:uppercase">Price Alert</td>
          </tr>
        </table>
      </td></tr>
      <tr><td style="padding:0 24px 8px 24px;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:600;color:#111;letter-spacing:-0.02em;line-height:1.2">{ticker} just {direction} your target of ${target:.2f}</td></tr>
      <tr><td style="padding:0 24px 8px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#374151;line-height:1.6">Your price alert triggered: <strong>{ticker}</strong> just {direction} your target of <strong>${target:.2f}</strong>.</td></tr>
      <tr><td style="padding:0 24px 20px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;color:#374151;line-height:1.6">Current price: <strong style="color:#ef4444">${current:.2f}</strong></td></tr>
{directive_block}
      <tr><td align="left" style="padding:0 24px 24px 24px">
        <table cellpadding="0" cellspacing="0">
          <tr>
            <td align="center" valign="middle" height="40" style="height:40px;background-color:#111;border-radius:999px;padding-left:20px;padding-right:20px">
              <a href="https://www.stocksbrew.online/stock/{ticker}" target="_blank" style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:600;color:#fff;text-decoration:none;white-space:nowrap;line-height:1">View {ticker} on stocksbrew →</a>
            </td>
          </tr>
        </table>
      </td></tr>
      <tr><td style="padding:0 24px"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:1px solid #e5e7eb;font-size:0;line-height:0">&nbsp;</td></tr></table></td></tr>
      <tr><td style="padding:24px 24px 32px 24px;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#9ca3af;line-height:1.5">Sent by stocksbrew because you set a price alert. <a href="https://www.stocksbrew.online/profile" target="_blank" style="color:#0052ff;text-decoration:none">Manage alerts</a></td></tr>
    </table>
  </td></tr>
</table>
</body></html>"""
    return subject, body
    return subject, body


def main() -> None:
    store = TraceMoneyStore()

    price_alerts = (
        store.db.collection("tm_alerts")
        .where("active", "==", True)
        .where("triggered", "==", False)
        .where("kind", "==", "price_threshold")
        .stream()
    )
    legacy_alerts = (
        store.db.collection("tm_alerts")
        .where("active", "==", True)
        .where("triggered", "==", False)
        .stream()
    )
    alert_list = []
    seen_ids: set[str] = set()
    for doc in price_alerts:
        data = doc.to_dict()
        if not isinstance(data, dict):
            continue
        seen_ids.add(doc.id)
        data.setdefault("kind", "price_threshold")
        alert_list.append({"id": doc.id, **data})

    for doc in legacy_alerts:
        if doc.id in seen_ids:
            continue
        data = doc.to_dict()
        if not isinstance(data, dict):
            continue
        if data.get("kind") not in (None, "", "price_threshold"):
            continue
        data.setdefault("kind", "price_threshold")
        alert_list.append({"id": doc.id, **data})

    if not alert_list:
        print("No active alerts to check")
        return

    print(f"Checking {len(alert_list)} active alerts...")

    tickers = list({a["ticker"] for a in alert_list})
    prices: dict[str, float | None] = {}

    for ticker in tickers:
        try:
            info = yf.Ticker(ticker).info
            price = info.get("regularMarketPrice") or info.get("currentPrice") or info.get("previousClose")
            prices[ticker] = float(price) if price else None
        except Exception as exc:
            print(f"  [warn] yfinance failed for {ticker}: {exc}")
            prices[ticker] = None

    now = datetime.now(timezone.utc).isoformat()

    for alert in alert_list:
        tid = alert["id"]
        ticker = alert["ticker"]
        target = float(alert.get("target_price", 0))
        condition = alert.get("condition", "")
        email = alert.get("email", "")
        current = prices.get(ticker)

        if current is None:
            print(f"  [{ticker}] no price data - skipping")
            continue

        triggered = False
        if condition == "below" and current <= target:
            triggered = True
        elif condition == "above" and current >= target:
            triggered = True

        if triggered:
            print(f"  [{ticker}] ALERT: ${current:.2f} {condition} ${target:.2f} → {email}")
            directive = alert.get("directive_text", "")
            subject, body = build_email(ticker, condition, target, current, directive)
            sent = send_email(email, subject, body)
            store.db.collection("tm_alerts").document(tid).update({
                "triggered": True,
                "triggered_at": now,
                "active": not sent,  # deactivate after send; keep if email failed
            })
        else:
            print(f"  [{ticker}] not triggered - ${current:.2f} (target ${target:.2f} {condition})")


if __name__ == "__main__":
    main()
