#!/usr/bin/env python3
"""Send weekly market report email using battle-tested email template."""

import smtplib
import json
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

with open("/home/ubuntu/.openclaw/workspace/email_config.json") as f:
    config = json.load(f)

sender = config["email"]
password = config["app_password"].replace(" ", "")
receiver = "tomartarun2001@gmail.com"

msg = MIMEMultipart("alternative")
msg["Subject"] = "Tikrr Weekly Market Report - Week of May 5-9, 2026"
msg["From"] = f"Tikrr <{sender}>"
msg["To"] = receiver

# Stock logo URLs from Clearbit Logo API (free, reliable in emails)
LOGOS = {
    "DOCN": "https://logo.clearbit.com/digitalocean.com",
    "MU": "https://logo.clearbit.com/micron.com",
    "INTC": "https://logo.clearbit.com/intel.com",
    "AMD": "https://logo.clearbit.com/amd.com",
    "NET": "https://logo.clearbit.com/cloudflare.com",
    "APTV": "https://logo.clearbit.com/aptiv.com",
    "EXPE": "https://logo.clearbit.com/expedia.com",
}

# Company domains for logo URLs
DOMAINS = {
    "DOCN": "digitalocean.com",
    "MU": "micron.com",
    "INTC": "intel.com",
    "AMD": "amd.com",
    "NET": "cloudflare.com",
    "APTV": "aptiv.com",
    "EXPE": "expedia.com",
}

# Colors for letter fallback
TICKER_COLORS = {
    "DOCN": "#0080ff",
    "MU": "#7c3aed",
    "INTC": "#0068b5",
    "AMD": "#000000",
    "NET": "#f48120",
    "APTV": "#6366f1",
    "EXPE": "#1e40af",
}

def stock_row(ticker, name, change_pct, change_color, bg_color, description):
    domain = DOMAINS.get(ticker, "")
    letter = ticker[0]
    color = TICKER_COLORS.get(ticker, "#374151")
    arrow = "+" if change_pct > 0 else ""
    sign_color = "#10b981" if change_pct > 0 else "#ef4444"
    # Use Google favicon as img, with a styled letter fallback onerror
    logo_url = f"https://www.google.com/s2/favicons?domain={domain}&sz=80" if domain else ""
    return f"""
    <tr>
      <td style="padding: 16px; border-bottom: 1px solid #f0f0f0;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="width: 48px; vertical-align: top;">
              <div style="width: 42px; height: 42px; border-radius: 10px; background: {color}; text-align: center; line-height: 42px; font-size: 18px; font-weight: 700; color: #ffffff; font-family: -apple-system, sans-serif;">{letter}</div>
            </td>
            <td style="padding-left: 14px; vertical-align: top;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <span style="font-size: 16px; font-weight: 700; color: #111111;">{ticker}</span>
                    <span style="font-size: 13px; color: #6b7280; padding-left: 6px;">{name}</span>
                  </td>
                  <td align="right" style="vertical-align: top;">
                    <span style="background: {bg_color}; color: {sign_color}; padding: 4px 12px; border-radius: 20px; font-weight: 700; font-size: 15px; white-space: nowrap;">{arrow}{change_pct:.2f}%</span>
                  </td>
                </tr>
                <tr>
                  <td colspan="2" style="padding-top: 6px;">
                    <span style="font-size: 13px; color: #374151; line-height: 1.5;">{description}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>"""

html = f"""<!doctype html>
<html lang="en">
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <title>Tikrr Weekly Market Report</title>
  <style media="all" type="text/css">
    body {{
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, sans-serif;
      -webkit-font-smoothing: antialiased;
      font-size: 16px;
      line-height: 1.5;
      -ms-text-size-adjust: 100%;
      -webkit-text-size-adjust: 100%;
      background-color: #f4f5f6;
      margin: 0;
      padding: 0;
    }}
    table {{ border-collapse: separate; mso-table-lspace: 0pt; mso-table-rspace: 0pt; width: 100%; }}
    table td {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, sans-serif; font-size: 16px; vertical-align: top; }}
    .container {{ margin: 0 auto !important; max-width: 600px; padding: 0; padding-top: 24px; width: 600px; }}
    .main {{ background: #ffffff; border: 1px solid #eaebed; border-radius: 16px; width: 100%; }}
    .wrapper {{ box-sizing: border-box; padding: 32px; }}
    .preheader {{ color: transparent; display: none; height: 0; max-height: 0; max-width: 0; opacity: 0; overflow: hidden; mso-hide: all; visibility: hidden; width: 0; }}
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
        <span class="preheader">Tikrr Weekly Market Report - The AI chip rally went parabolic this week.</span>
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" class="main">

          <!-- HEADER -->
          <tr>
            <td style="background: linear-gradient(135deg, #1e3a8a 0%, #0b1228 100%); border-radius: 16px 16px 0 0; padding: 40px 32px; text-align: center;">
              <div style="font-size: 40px; margin-bottom: 12px;">&#128293;</div>
              <h1 style="font-size: 26px; color: #ffffff; margin: 0; font-weight: 700; letter-spacing: -0.02em;">Weekly Market Report</h1>
              <p style="color: rgba(255,255,255,0.7); font-size: 14px; margin: 8px 0 0;">Week of May 5-9, 2026 &middot; Tikrr Intelligence</p>
            </td>
          </tr>

          <tr>
            <td class="wrapper">

              <!-- HEADLINE -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td style="background: #fef3c7; border-radius: 12px; padding: 20px; border: 1px solid #f59e0b;">
                    <h2 style="font-size: 18px; margin: 0 0 8px; color: #92400e;">&#9889; The AI Chip Rally Went Parabolic</h2>
                    <p style="font-size: 14px; line-height: 1.6; color: #78350f; margin: 0;">Semiconductors dominated Wall Street. Memory chips are the new bottleneck in the AI buildout. Micron had its best week since 2008.</p>
                  </td>
                </tr>
              </table>

              <!-- INDEX CARDS -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 28px;">
                <tr>
                  <td style="padding: 0 4px;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="background: #f0fdf4; border-radius: 12px; border: 1px solid #bbf7d0;">
                      <tr><td style="padding: 14px; text-align: center;">
                        <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #15803d;">S&amp;P 500</div>
                        <div style="font-size: 20px; font-weight: 700; color: #166534;">+2.3%</div>
                        <div style="font-size: 10px; color: #4ade80;">7,398</div>
                      </td></tr>
                    </table>
                  </td>
                  <td style="padding: 0 4px;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="background: #f0fdf4; border-radius: 12px; border: 1px solid #bbf7d0;">
                      <tr><td style="padding: 14px; text-align: center;">
                        <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #15803d;">Nasdaq</div>
                        <div style="font-size: 20px; font-weight: 700; color: #166534;">+4.5%</div>
                        <div style="font-size: 10px; color: #4ade80;">26,247 &middot; ATH</div>
                      </td></tr>
                    </table>
                  </td>
                  <td style="padding: 0 4px;">
                    <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="background: #fef2f2; border-radius: 12px; border: 1px solid #fecaca;">
                      <tr><td style="padding: 14px; text-align: center;">
                        <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #dc2626;">Anomalies</div>
                        <div style="font-size: 20px; font-weight: 700; color: #991b1b;">16</div>
                        <div style="font-size: 10px; color: #f87171;">8 stocks</div>
                      </td></tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- SURGING -->
              <h3 style="font-size: 14px; color: #10b981; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700;">&#9650; Surging</h3>
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; margin-bottom: 28px;">
                {stock_row("DOCN", "DigitalOcean", 34.73, "#10b981", "rgba(16,185,129,0.12)", "Q1 revenue $258M (+22% YoY). Raised FY guidance to $1.14B. AI workloads accelerating cloud demand.")}
                {stock_row("MU", "Micron", 15.49, "#10b981", "rgba(16,185,129,0.12)", "Memory chip shortage goes parabolic. Best week since Dec 2008. Market cap now $840B.")}
                {stock_row("INTC", "Intel", 13.96, "#10b981", "rgba(16,185,129,0.12)", "Apple chip deal signals foundry pivot gaining traction. Up 240% YTD. Gov stake worth $55B.")}
                {stock_row("AMD", "AMD", 11.44, "#10b981", "rgba(16,185,129,0.12)", "Q2 forecast $11.2B. AI server demand accelerating. Market cap crossed $740B.")}
              </table>

              <!-- DROPPING -->
              <h3 style="font-size: 14px; color: #ef4444; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700;">&#9660; Dropping</h3>
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; margin-bottom: 28px;">
                {stock_row("NET", "Cloudflare", -23.62, "#ef4444", "rgba(239,68,68,0.12)", "Crashes 24% on 1,100 layoffs despite beating Q1 estimates. AI restructuring spooked investors.")}
                {stock_row("APTV", "Aptiv", -10.57, "#ef4444", "rgba(239,68,68,0.12)", "Cautious outlook and margin pressure despite solid Q1. Auto sector headwinds persist.")}
                {stock_row("EXPE", "Expedia", -9.02, "#ef4444", "rgba(239,68,68,0.12)", "Strong Q1 (EPS beat by 41%) but soft Q2 revenue guidance spooked the market.")}
              </table>

              <!-- KEY THEMES -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #1e3a8a, #0b1228); border-radius: 12px; margin-bottom: 28px;">
                <tr><td style="padding: 24px; color: white;">
                  <h3 style="font-size: 16px; margin: 0 0 16px;">&#129504; Key Themes</h3>
                  <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="font-size: 14px; line-height: 1.8;">
                    <tr><td style="padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.9);"><strong>1. Memory is the new GPU</strong> &mdash; DRAM/NAND shortages driving prices. Hyperscaler capex heading to $1T.</td></tr>
                    <tr><td style="padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.9);"><strong>2. Intel comeback is real</strong> &mdash; Apple deal validates manufacturing pivot. Gov stake worth 6x.</td></tr>
                    <tr><td style="padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.9);"><strong>3. AI layoffs spook investors</strong> &mdash; Cloudflare's "beat and cut" pattern rattled markets.</td></tr>
                    <tr><td style="padding: 6px 0; color: rgba(255,255,255,0.9);"><strong>4. Beats aren't enough</strong> &mdash; Market wants forward momentum, not backward-looking results.</td></tr>
                  </table>
                </td></tr>
              </table>

              <!-- WHAT TO WATCH -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="background: #f9fafb; border-radius: 12px; border: 1px solid #f3f4f6; margin-bottom: 28px;">
                <tr><td style="padding: 24px;">
                  <h3 style="font-size: 16px; margin: 0 0 16px;">&#128065; What to Watch Next Week</h3>
                  <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="font-size: 13px; line-height: 1.8; color: #374151;">
                    <tr><td style="padding: 4px 0;">&#9889; Memory chip prices &mdash; if DRAM keeps climbing, MU has room to run</td></tr>
                    <tr><td style="padding: 4px 0;">&#9889; Intel follow-through &mdash; Apple deal confirmation could push toward $150</td></tr>
                    <tr><td style="padding: 4px 0;">&#9889; AI layoff contagion &mdash; more "beat and cut" could shift sentiment</td></tr>
                    <tr><td style="padding: 4px 0;">&#9889; Consumer softness &mdash; EXPE guidance may signal broader travel weakness</td></tr>
                  </table>
                </td></tr>
              </table>

              <!-- CTA -->
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 16px;">
                <tr>
                  <td align="center">
                    <a href="https://www.tikrr.online" style="display: inline-block; background: #111111; color: #ffffff; padding: 14px 36px; border-radius: 100px; font-size: 15px; font-weight: 600; text-decoration: none;">View on Tikrr &rarr;</a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="padding: 24px 32px; border-top: 2px solid #f3f4f6; text-align: center;">
              <p style="font-size: 12px; color: #9ca3af; margin: 0;">Generated by Tikrr AI &middot; <a href="https://www.tikrr.online" style="color: #3b82f6; text-decoration: none;">tikrr.online</a></p>
              <p style="font-size: 11px; color: #d1d5db; margin: 8px 0 0;">This is not financial advice. Do your own research.</p>
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
- DOCN (DigitalOcean): +34.73% - Q1 revenue $258M (+22% YoY)
- MU (Micron): +15.49% - Memory chip shortage, best week since 2008
- INTC (Intel): +13.96% - Apple chip deal, up 240% YTD
- AMD: +11.44% - AI server demand accelerating

DROPPING:
- NET (Cloudflare): -23.62% - 1,100 layoffs despite strong Q1
- APTV (Aptiv): -10.57% - Cautious outlook
- EXPE (Expedia): -9.02% - Weak Q2 guidance

View on Tikrr: https://www.tikrr.online
"""

msg.attach(MIMEText(text, "plain"))
msg.attach(MIMEText(html, "html"))

try:
    server = smtplib.SMTP("smtp.gmail.com", 587)
    server.starttls()
    server.login(sender, password)
    server.sendmail(sender, receiver, msg.as_string())
    server.quit()
    print("Email sent successfully!")
except Exception as e:
    print(f"ERROR: {e}")
