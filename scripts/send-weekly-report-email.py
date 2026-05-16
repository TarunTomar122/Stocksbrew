#!/usr/bin/env python3
"""Send weekly market report email with CID-embedded logos and clickable stock links."""

import smtplib
import json
import base64
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.image import MIMEImage

with open("/home/ubuntu/.openclaw/workspace/email_config.json") as f:
    config = json.load(f)

sender = config["email"]
password = config["app_password"].replace(" ", "")
receiver = "tomartarun2001@gmail.com"

# Ticker -> domain mapping
TICKERS = {
    "DOCN": {"name": "DigitalOcean", "domain": "digitalocean.com", "change": 34.73, "desc": "Q1 revenue $258M (+22% YoY). Raised FY guidance to $1.14B. AI workloads accelerating cloud demand."},
    "MU":   {"name": "Micron",       "domain": "micron.com",       "change": 15.49, "desc": "Memory chip shortage goes parabolic. Best week since Dec 2008. Market cap now $840B."},
    "INTC": {"name": "Intel",        "domain": "intel.com",        "change": 13.96, "desc": "Apple chip deal signals foundry pivot gaining traction. Up 240% YTD. Gov stake worth $55B."},
    "AMD":  {"name": "AMD",          "domain": "amd.com",          "change": 11.44, "desc": "Q2 forecast $11.2B. AI server demand accelerating. Market cap crossed $740B."},
    "NET":  {"name": "Cloudflare",   "domain": "cloudflare.com",   "change": -23.62, "desc": "Crashes 24% on 1,100 layoffs despite beating Q1 estimates. AI restructuring spooked investors."},
    "APTV": {"name": "Aptiv",        "domain": "aptiv.com",        "change": -10.57, "desc": "Cautious outlook and margin pressure despite solid Q1. Auto sector headwinds persist."},
    "EXPE": {"name": "Expedia",      "domain": "expedia.com",      "change": -9.02,  "desc": "Strong Q1 (EPS beat by 41%) but soft Q2 revenue guidance spooked the market."},
}

# Download logos
logo_dir = "/tmp/tikrr_logos"
os.makedirs(logo_dir, exist_ok=True)

import subprocess
for ticker, info in TICKERS.items():
    path = os.path.join(logo_dir, f"{ticker}.png")
    if not os.path.exists(path):
        subprocess.run(
            ["curl", "-sL", "-o", path, f"https://www.google.com/s2/favicons?domain={info['domain']}&sz=128"],
            timeout=10
        )

def stock_row(ticker, info, is_last=False):
    change = info["change"]
    name = info["name"]
    desc = info["desc"]
    arrow = "+" if change > 0 else ""
    sign_color = "#10b981" if change > 0 else "#ef4444"
    bg_color = "rgba(16,185,129,0.08)" if change > 0 else "rgba(239,68,68,0.08)"
    border = "" if is_last else 'border-bottom: 1px solid #f0f0f0;'
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

# Build surging and dropping rows
surging = [(t, i) for t, i in TICKERS.items() if i["change"] > 0]
dropping = [(t, i) for t, i in TICKERS.items() if i["change"] < 0]
surging.sort(key=lambda x: -x[1]["change"])
dropping.sort(key=lambda x: x[1]["change"])

surging_rows = ""
for i, (ticker, info) in enumerate(surging):
    surging_rows += stock_row(ticker, info, is_last=(i == len(surging) - 1))

dropping_rows = ""
for i, (ticker, info) in enumerate(dropping):
    dropping_rows += stock_row(ticker, info, is_last=(i == len(dropping) - 1))

html = f"""<!doctype html>
<html lang="en">
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <title>tikrr Weekly Market Report</title>
  <style media="all" type="text/css">
    body {{
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, sans-serif;
      -webkit-font-smoothing: antialiased;
      font-size: 16px;
      line-height: 1.5;
      background-color: #f4f5f6;
      margin: 0;
      padding: 0;
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
        <span class="preheader">tikrr Weekly Market Report &mdash; The AI chip rally went parabolic. Micron +38%, Intel +25%, AMD +26%.</span>
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" class="main">

          <!-- HEADER -->
          <tr>
            <td style="background: linear-gradient(135deg, #1e3a8a 0%, #0b1228 100%); border-radius: 16px 16px 0 0; padding: 36px 28px; text-align: center;">
              <a href="https://www.tikrr.online" style="text-decoration: none;">
                <div style="font-size: 36px; margin-bottom: 10px;">&#128293;</div>
                <h1 style="font-size: 24px; color: #ffffff; margin: 0; font-weight: 700; letter-spacing: -0.02em;">Weekly Market Report</h1>
                <p style="color: rgba(255,255,255,0.6); font-size: 13px; margin: 6px 0 0;">Week of May 5-9, 2026 &middot; tikrr Intelligence</p>
              </a>
            </td>
          </tr>

          <tr>
            <td class="wrapper">

              <!-- HEADLINE -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td style="background: #fffbeb; border-radius: 10px; padding: 16px 20px; border: 1px solid #fbbf24;">
                    <h2 style="font-size: 16px; margin: 0 0 6px; color: #92400e;">&#9889; The AI Chip Rally Went Parabolic</h2>
                    <p style="font-size: 13px; line-height: 1.5; color: #78350f; margin: 0;">Memory chips are the new bottleneck. Micron had its best week since 2008. The Nasdaq hit all-time highs.</p>
                  </td>
                </tr>
              </table>

              <!-- INDEX CARDS -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td style="padding: 0 3px;" width="33%">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="background: #f0fdf4; border-radius: 10px; border: 1px solid #bbf7d0;">
                      <tr><td style="padding: 12px; text-align: center;">
                        <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #15803d;">S&amp;P 500</div>
                        <div style="font-size: 20px; font-weight: 700; color: #166534;">+2.3%</div>
                        <div style="font-size: 10px; color: #86efac;">7,398</div>
                      </td></tr>
                    </table>
                  </td>
                  <td style="padding: 0 3px;" width="33%">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="background: #f0fdf4; border-radius: 10px; border: 1px solid #bbf7d0;">
                      <tr><td style="padding: 12px; text-align: center;">
                        <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #15803d;">Nasdaq</div>
                        <div style="font-size: 20px; font-weight: 700; color: #166534;">+4.5%</div>
                        <div style="font-size: 10px; color: #86efac;">26,247 &middot; ATH</div>
                      </td></tr>
                    </table>
                  </td>
                  <td style="padding: 0 3px;" width="33%">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="background: #fef2f2; border-radius: 10px; border: 1px solid #fecaca;">
                      <tr><td style="padding: 12px; text-align: center;">
                        <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #dc2626;">Anomalies</div>
                        <div style="font-size: 20px; font-weight: 700; color: #991b1b;">16</div>
                        <div style="font-size: 10px; color: #fca5a5;">8 stocks</div>
                      </td></tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- SURGING -->
              <div style="font-size: 12px; color: #10b981; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700; margin-bottom: 8px;">&#9650; Surging</div>
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; margin-bottom: 24px;">
                {surging_rows}
              </table>

              <!-- DROPPING -->
              <div style="font-size: 12px; color: #ef4444; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700; margin-bottom: 8px;">&#9660; Dropping</div>
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; margin-bottom: 24px;">
                {dropping_rows}
              </table>

              <!-- KEY THEMES -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="background: #0f172a; border-radius: 10px; margin-bottom: 24px;">
                <tr><td style="padding: 20px; color: white;">
                  <h3 style="font-size: 15px; margin: 0 0 12px;">&#129504; Key Themes</h3>
                  <div style="font-size: 13px; line-height: 1.7; color: rgba(255,255,255,0.85);">
                    <div style="padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.08);"><strong>1. Memory is the new GPU</strong> &mdash; DRAM/NAND shortages driving prices. Hyperscaler capex heading to $1T.</div>
                    <div style="padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.08);"><strong>2. Intel comeback is real</strong> &mdash; Apple deal validates manufacturing pivot. Gov stake worth 6x.</div>
                    <div style="padding: 5px 0; border-bottom: 1px solid rgba(255,255,255,0.08);"><strong>3. AI layoffs spook investors</strong> &mdash; Cloudflare's "beat and cut" rattled markets.</div>
                    <div style="padding: 5px 0;"><strong>4. Beats aren't enough</strong> &mdash; Market wants forward momentum, not backward-looking results.</div>
                  </div>
                </td></tr>
              </table>

              <!-- WHAT TO WATCH -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="background: #f9fafb; border-radius: 10px; border: 1px solid #f3f4f6; margin-bottom: 24px;">
                <tr><td style="padding: 20px;">
                  <h3 style="font-size: 15px; margin: 0 0 12px;">&#128065; What to Watch Next Week</h3>
                  <div style="font-size: 13px; line-height: 1.8; color: #374151;">
                    <div style="padding: 3px 0;">&#9889; Memory chip prices &mdash; if DRAM keeps climbing, MU has room to run</div>
                    <div style="padding: 3px 0;">&#9889; Intel follow-through &mdash; Apple deal confirmation could push toward $150</div>
                    <div style="padding: 3px 0;">&#9889; AI layoff contagion &mdash; more "beat and cut" could shift sentiment</div>
                    <div style="padding: 3px 0;">&#9889; Consumer softness &mdash; EXPE guidance may signal broader travel weakness</div>
                  </div>
                </td></tr>
              </table>

              <!-- CTA -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 8px;">
                <tr>
                  <td align="center">
                    <a href="https://www.tikrr.online" style="display: inline-block; background: #111111; color: #ffffff; padding: 12px 32px; border-radius: 100px; font-size: 14px; font-weight: 600; text-decoration: none;">View on tikrr &rarr;</a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="padding: 20px 28px; border-top: 1px solid #f3f4f6; text-align: center;">
              <p style="font-size: 11px; color: #9ca3af; margin: 0;">Generated by tikrr AI &middot; <a href="https://www.tikrr.online" style="color: #3b82f6; text-decoration: none;">tikrr.online</a></p>
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

text = """TIKKR WEEKLY MARKET REPORT - Week of May 5-9, 2026

THE AI CHIP RALLY WENT PARABOLIC

S&P 500: +2.3% | Nasdaq: +4.5% (ATH) | 16 anomaly events

SURGING:
- DOCN (DigitalOcean): +34.73% - https://www.tikrr.online/stock/DOCN
- MU (Micron): +15.49% - https://www.tikrr.online/stock/MU
- INTC (Intel): +13.96% - https://www.tikrr.online/stock/INTC
- AMD: +11.44% - https://www.tikrr.online/stock/AMD

DROPPING:
- NET (Cloudflare): -23.62% - https://www.tikrr.online/stock/NET
- APTV (Aptiv): -10.57% - https://www.tikrr.online/stock/APTV
- EXPE (Expedia): -9.02% - https://www.tikrr.online/stock/EXPE

View on tikrr: https://www.tikrr.online
"""

# Build multipart/related email with CID images
msg = MIMEMultipart("related")
msg["Subject"] = "tikrr Weekly Market Report - Week of May 5-9, 2026"
msg["From"] = f"tikrr <{sender}>"
msg["To"] = receiver

# Alternative part (text + html)
alt_part = MIMEMultipart("alternative")
alt_part.attach(MIMEText(text, "plain"))
alt_part.attach(MIMEText(html, "html"))
msg.attach(alt_part)

# Attach logos as CID images
for ticker in TICKERS:
    logo_path = f"/tmp/tikrr_logos/{ticker}.png"
    if os.path.exists(logo_path):
        with open(logo_path, "rb") as f:
            img = MIMEImage(f.read())
            img.add_header("Content-ID", f"<logo_{ticker}>")
            img.add_header("Content-Disposition", "inline", filename=f"{ticker}.png")
            msg.attach(img)

try:
    server = smtplib.SMTP("smtp.gmail.com", 587)
    server.starttls()
    server.login(sender, password)
    server.sendmail(sender, receiver, msg.as_string())
    server.quit()
    print("Email sent with embedded logos!")
except Exception as e:
    print(f"ERROR: {e}")
