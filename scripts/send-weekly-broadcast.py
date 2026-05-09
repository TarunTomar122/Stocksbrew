#!/usr/bin/env python3
"""Send weekly market report to all Tikrr users. Run by cron every Saturday 10 AM IST."""

import smtplib
import json
import os
import subprocess
import base64
import time
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.image import MIMEImage

# ─── Config ───────────────────────────────────────────────────────────────────
with open("/home/ubuntu/.openclaw/workspace/email_config.json") as f:
    cfg = json.load(f)

SMTP_USER = cfg["email"]
SMTP_PASS = cfg["app_password"].replace(" ", "")
SENDER_NAME = "Tikrr"

# Logo CID images directory
LOGO_DIR = "/tmp/tikrr_logos"

# Ticker info (will be filled by the agent from Firestore)
REPORT_DATA_PATH = "/tmp/tikrr_weekly_report.json"

# ─── Fetch user emails from Firestore ────────────────────────────────────────
def get_all_user_emails():
    """Get all user emails from Firebase Auth via Node.js script."""
    script = """
const admin = require('firebase-admin');
const sa = require('/mnt/data/workspace/tikrr/backend/firebase-service-account.json');
admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id });

(async () => {
  const listResult = await admin.auth().listUsers(1000);
  const emails = listResult.users
    .filter(u => u.email && u.email !== 'yourtrace.online@gmail.com')
    .map(u => ({ email: u.email, name: u.displayName || u.email.split('@')[0] }));
  console.log(JSON.stringify(emails));
  process.exit(0);
})();
"""
    result = subprocess.run(
        ["node", "-e", script],
        capture_output=True, text=True, timeout=30,
        cwd="/mnt/data/workspace/tikrr"
    )
    if result.returncode != 0:
        print(f"Error fetching users: {result.stderr}")
        return []
    return json.loads(result.stdout.strip())


# ─── Build email HTML ────────────────────────────────────────────────────────
def build_stock_row(ticker, info, is_last=False):
    change = info["change"]
    name = info["name"]
    desc = info["desc"]
    arrow = "+" if change > 0 else ""
    sign_color = "#10b981" if change > 0 else "#ef4444"
    bg_color = "rgba(16,185,129,0.08)" if change > 0 else "rgba(239,68,68,0.08)"
    border = "" if is_last else "border-bottom: 1px solid #f0f0f0;"
    link = f"https://www.tikrr.online/stock/{ticker}"

    return f"""
    <tr>
      <td style="padding: 14px 16px; {border}">
        <a href="{link}" style="text-decoration: none; color: inherit; display: block;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td style="width: 44px; vertical-align: top;">
                <img src="cid:logo_{ticker}" width="40" height="40" alt="{ticker}" style="border-radius: 8px; display: block; border: 1px solid #e5e7eb;">
              </td>
              <td style="padding-left: 12px; vertical-align: top;">
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td>
                      <span style="font-size: 15px; font-weight: 700; color: #111111;">{ticker}</span>
                      <span style="font-size: 12px; color: #6b7280; padding-left: 6px;">{name}</span>
                    </td>
                    <td align="right" style="vertical-align: top;">
                      <span style="background: {bg_color}; color: {sign_color}; padding: 4px 10px; border-radius: 16px; font-weight: 700; font-size: 14px; white-space: nowrap;">{arrow}{change:.2f}%</span>
                    </td>
                  </tr>
                  <tr>
                    <td colspan="2" style="padding-top: 4px;">
                      <span style="font-size: 12px; color: #4b5563; line-height: 1.5;">{desc}</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </a>
      </td>
    </tr>"""


def build_html(report):
    surging = [(t, i) for t, i in report["tickers"].items() if i["change"] > 0]
    dropping = [(t, i) for t, i in report["tickers"].items() if i["change"] < 0]
    surging.sort(key=lambda x: -x[1]["change"])
    dropping.sort(key=lambda x: x[1]["change"])

    surging_rows = ""
    for i, (t, info) in enumerate(surging):
        surging_rows += build_stock_row(t, info, is_last=(i == len(surging) - 1))

    dropping_rows = ""
    for i, (t, info) in enumerate(dropping):
        dropping_rows += build_stock_row(t, info, is_last=(i == len(dropping) - 1))

    themes_html = ""
    for i, theme in enumerate(report.get("themes", [])):
        themes_html += f'<div style="padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.08);"><strong>{i+1}. {theme["title"]}</strong> &mdash; {theme["detail"]}</div>'
    # remove last border
    if themes_html:
        themes_html = themes_html.rsplit("border-bottom", 1)[0] + themes_html.rsplit("border-bottom", 1)[1].split("</div>", 1)[1] if "border-bottom" in themes_html else themes_html

    watch_html = ""
    for item in report.get("watch_next", []):
        watch_html += f'<div style="padding: 3px 0;">&#9889; {item}</div>'

    sp = report.get("indices", {}).get("sp500", {})
    nasdaq = report.get("indices", {}).get("nasdaq", {})
    sp_chg = sp.get("change", 0)
    nas_chg = nasdaq.get("change", 0)
    sp_val = sp.get("value", "")
    nas_val = nasdaq.get("value", "")
    nas_label = nasdaq.get("label", "")

    anomaly_count = report.get("anomaly_count", 0)
    anomaly_stocks = report.get("anomaly_stocks", 0)

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <title>Tikrr Weekly Market Report</title>
  <style media="all" type="text/css">
    body {{
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, sans-serif;
      -webkit-font-smoothing: antialiased; font-size: 16px; line-height: 1.5;
      background-color: #f4f5f6; margin: 0; padding: 0;
    }}
    table {{ border-collapse: separate; mso-table-lspace: 0pt; mso-table-rspace: 0pt; width: 100%; }}
    table td {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, sans-serif; font-size: 16px; vertical-align: top; }}
    .container {{ margin: 0 auto !important; max-width: 600px; padding: 0; padding-top: 24px; width: 600px; }}
    .main {{ background: #ffffff; border: 1px solid #eaebed; border-radius: 16px; width: 100%; }}
    .wrapper {{ box-sizing: border-box; padding: 28px; }}
    .preheader {{ color: transparent; display: none; height: 0; max-height: 0; max-width: 0; opacity: 0; overflow: hidden; mso-hide: all; visibility: hidden; width: 0; }}
    a:hover {{ opacity: 0.85; }}
    @media only screen and (max-width: 640px) {{
      .container {{ padding: 0 !important; padding-top: 8px !important; width: 100% !important; }}
      .main {{ border-left-width: 0 !important; border-radius: 0 !important; border-right-width: 0 !important; }}
      .wrapper {{ padding: 16px !important; }}
    }}
  </style>
</head>
<body>
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="background-color: #f4f5f6; width: 100%;">
    <tr>
      <td>&nbsp;</td>
      <td class="container">
        <span class="preheader">{report.get("headline", "Tikrr Weekly Market Report")}</span>
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" class="main">

          <!-- HEADER -->
          <tr>
            <td style="background: linear-gradient(135deg, #1e3a8a 0%, #0b1228 100%); border-radius: 16px 16px 0 0; padding: 36px 28px; text-align: center;">
              <a href="https://www.tikrr.online" style="text-decoration: none;">
                <div style="font-size: 36px; margin-bottom: 10px;">&#128293;</div>
                <h1 style="font-size: 24px; color: #ffffff; margin: 0; font-weight: 700; letter-spacing: -0.02em;">Weekly Market Report</h1>
                <p style="color: rgba(255,255,255,0.6); font-size: 13px; margin: 6px 0 0;">{report.get("week_label", "This Week")} &middot; Tikrr Intelligence</p>
              </a>
            </td>
          </tr>

          <tr>
            <td class="wrapper">

              <!-- HEADLINE -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td style="background: #fffbeb; border-radius: 10px; padding: 16px 20px; border: 1px solid #fbbf24;">
                    <h2 style="font-size: 16px; margin: 0 0 6px; color: #92400e;">&#9889; {report.get("headline", "Market Update")}</h2>
                    <p style="font-size: 13px; line-height: 1.5; color: #78350f; margin: 0;">{report.get("subheadline", "")}</p>
                  </td>
                </tr>
              </table>

              <!-- INDEX CARDS -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td style="padding: 0 3px;" width="33%">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="background: {'#f0fdf4' if sp_chg >= 0 else '#fef2f2'}; border-radius: 10px; border: 1px solid {'#bbf7d0' if sp_chg >= 0 else '#fecaca'};">
                      <tr><td style="padding: 12px; text-align: center;">
                        <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: {'#15803d' if sp_chg >= 0 else '#dc2626'};">S&amp;P 500</div>
                        <div style="font-size: 20px; font-weight: 700; color: {'#166534' if sp_chg >= 0 else '#991b1b'};">{"+" if sp_chg >= 0 else ""}{sp_chg:.1f}%</div>
                        <div style="font-size: 10px; color: {'#86efac' if sp_chg >= 0 else '#fca5a5'};">{sp_val}</div>
                      </td></tr>
                    </table>
                  </td>
                  <td style="padding: 0 3px;" width="33%">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="background: {'#f0fdf4' if nas_chg >= 0 else '#fef2f2'}; border-radius: 10px; border: 1px solid {'#bbf7d0' if nas_chg >= 0 else '#fecaca'};">
                      <tr><td style="padding: 12px; text-align: center;">
                        <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: {'#15803d' if nas_chg >= 0 else '#dc2626'};">Nasdaq</div>
                        <div style="font-size: 20px; font-weight: 700; color: {'#166534' if nas_chg >= 0 else '#991b1b'};">{"+" if nas_chg >= 0 else ""}{nas_chg:.1f}%</div>
                        <div style="font-size: 10px; color: {'#86efac' if nas_chg >= 0 else '#fca5a5'};">{nas_val}{" &middot; " + nas_label if nas_label else ""}</div>
                      </td></tr>
                    </table>
                  </td>
                  <td style="padding: 0 3px;" width="33%">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="background: #fef2f2; border-radius: 10px; border: 1px solid #fecaca;">
                      <tr><td style="padding: 12px; text-align: center;">
                        <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #dc2626;">Anomalies</div>
                        <div style="font-size: 20px; font-weight: 700; color: #991b1b;">{anomaly_count}</div>
                        <div style="font-size: 10px; color: #fca5a5;">{anomaly_stocks} stocks</div>
                      </td></tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- SURGING -->
              {"<div style='font-size: 12px; color: #10b981; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700; margin-bottom: 8px;'>&#9650; Surging</div><table role='presentation' border='0' cellpadding='0' cellspacing='0' style='border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; margin-bottom: 24px;'>" + surging_rows + "</table>" if surging_rows else ""}

              <!-- DROPPING -->
              {"<div style='font-size: 12px; color: #ef4444; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700; margin-bottom: 8px;'>&#9660; Dropping</div><table role='presentation' border='0' cellpadding='0' cellspacing='0' style='border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; margin-bottom: 24px;'>" + dropping_rows + "</table>" if dropping_rows else ""}

              <!-- KEY THEMES -->
              {"<table role='presentation' border='0' cellpadding='0' cellspacing='0' style='background: #0f172a; border-radius: 10px; margin-bottom: 24px;'><tr><td style='padding: 20px; color: white;'><h3 style='font-size: 15px; margin: 0 0 12px;'>&#129504; Key Themes</h3><div style='font-size: 13px; line-height: 1.7; color: rgba(255,255,255,0.85);'>" + themes_html + "</div></td></tr></table>" if themes_html else ""}

              <!-- WHAT TO WATCH -->
              {"<table role='presentation' border='0' cellpadding='0' cellspacing='0' style='background: #f9fafb; border-radius: 10px; border: 1px solid #f3f4f6; margin-bottom: 24px;'><tr><td style='padding: 20px;'><h3 style='font-size: 15px; margin: 0 0 12px;'>&#128065; What to Watch Next Week</h3><div style='font-size: 13px; line-height: 1.8; color: #374151;'>" + watch_html + "</div></td></tr></table>" if watch_html else ""}

              <!-- CTA -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 8px;">
                <tr>
                  <td align="center">
                    <a href="https://www.tikrr.online" style="display: inline-block; background: #111111; color: #ffffff; padding: 12px 32px; border-radius: 100px; font-size: 14px; font-weight: 600; text-decoration: none;">View on Tikrr &rarr;</a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="padding: 20px 28px; border-top: 1px solid #f3f4f6; text-align: center;">
              <p style="font-size: 11px; color: #9ca3af; margin: 0;">Generated by Tikrr AI &middot; <a href="https://www.tikrr.online" style="color: #3b82f6; text-decoration: none;">tikrr.online</a></p>
              <p style="font-size: 10px; color: #d1d5db; margin: 6px 0 0;">This is not financial advice. Do your own research.</p>
            </td>
          </tr>

        </table>
      </td>
      <td>&nbsp;</td>
    </tr>
  </table>
</body>
</html>"""


# ─── Send email ──────────────────────────────────────────────────────────────
def send_email(to_email, to_name, html, text_body, subject, logos):
    msg = MIMEMultipart("related")
    msg["Subject"] = subject
    msg["From"] = f"{SENDER_NAME} <{SMTP_USER}>"
    msg["To"] = to_email

    alt_part = MIMEMultipart("alternative")
    alt_part.attach(MIMEText(text_body, "plain"))
    alt_part.attach(MIMEText(html, "html"))
    msg.attach(alt_part)

    # Attach logo CID images
    for ticker in logos:
        logo_path = os.path.join(LOGO_DIR, f"{ticker}.png")
        if os.path.exists(logo_path):
            with open(logo_path, "rb") as f:
                img = MIMEImage(f.read())
                img.add_header("Content-ID", f"<logo_{ticker}>")
                img.add_header("Content-Disposition", "inline", filename=f"{ticker}.png")
                msg.attach(img)

    try:
        server = smtplib.SMTP("smtp.gmail.com", 587)
        server.starttls()
        server.login(SMTP_USER, SMTP_PASS)
        server.sendmail(SMTP_USER, to_email, msg.as_string())
        server.quit()
        return True
    except Exception as e:
        print(f"  FAILED {to_email}: {e}")
        return False


# ─── Main ────────────────────────────────────────────────────────────────────
def main():
    # Load report data (generated by the agent or weekly-report-generator.js)
    if not os.path.exists(REPORT_DATA_PATH):
        print(f"ERROR: Report data not found at {REPORT_DATA_PATH}")
        print("Run the weekly report generator first.")
        return

    with open(REPORT_DATA_PATH) as f:
        report = json.load(f)

    html = build_html(report)

    # Plain text version
    text_lines = [f"TIKKR WEEKLY MARKET REPORT - {report.get('week_label', '')}", ""]
    text_lines.append(report.get("headline", ""))
    text_lines.append("")
    for t, info in report["tickers"].items():
        sign = "+" if info["change"] > 0 else ""
        text_lines.append(f"- {t} ({info['name']}): {sign}{info['change']:.2f}% - https://www.tikrr.online/stock/{t}")
    text_lines.append("")
    text_lines.append("View on Tikrr: https://www.tikrr.online")
    text_body = "\n".join(text_lines)

    subject = f"Tikrr Weekly Market Report - {report.get('week_label', 'This Week')}"
    logos = list(report["tickers"].keys())

    # Download logos
    os.makedirs(LOGO_DIR, exist_ok=True)
    domains = {
        "DOCN": "digitalocean.com", "MU": "micron.com", "INTC": "intel.com",
        "AMD": "amd.com", "NET": "cloudflare.com", "APTV": "aptiv.com", "EXPE": "expedia.com",
    }
    import subprocess as sp
    for ticker in logos:
        path = os.path.join(LOGO_DIR, f"{ticker}.png")
        if not os.path.exists(path) and ticker in domains:
            sp.run(["curl", "-sL", "-o", path, f"https://www.google.com/s2/favicons?domain={domains[ticker]}&sz=128"], timeout=10)

    # Get user list
    print("Fetching users from Firebase...")
    users = get_all_user_emails()
    print(f"Found {len(users)} users")

    if not users:
        print("No users found. Exiting.")
        return

    # Send to all users
    sent = 0
    failed = 0
    for user in users:
        email = user["email"]
        name = user["name"]
        print(f"  Sending to {name} <{email}>...")
        ok = send_email(email, name, html, text_body, subject, logos)
        if ok:
            sent += 1
        else:
            failed += 1
        time.sleep(1)  # rate limit

    print(f"\nDone! Sent: {sent}, Failed: {failed}, Total: {len(users)}")


if __name__ == "__main__":
    main()
