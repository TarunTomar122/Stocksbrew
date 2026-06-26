from __future__ import annotations

import html


def email_shell(
    *,
    title: str,
    body_html: str,
    footer: str | None = None,
    max_width: int = 520,
) -> str:
    width = max(320, int(max_width))
    foot = footer or (
        "You received this because you set a price alert on stocksbrew. "
        f"<a href='{html.escape(_profile_url())}' style='color:#065f46;text-decoration:none;font-weight:600'>"
        "Manage alerts</a>"
        " · Not investment advice."
    )
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{html.escape(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px"><tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:{width}px">
      <tr><td style="padding-bottom:18px">
        <span style="font-size:22px;font-weight:800;color:#065f46;letter-spacing:-0.04em">stocksbrew</span>
      </td></tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:{width}px;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden">
      {body_html}
      <tr><td style="padding:18px 24px 24px 24px;border-top:1px solid #f3f4f6">
        <p style="margin:0;font-size:11px;line-height:1.6;color:#9ca3af">{foot}</p>
      </td></tr>
    </table>
  </td></tr></table>
</body>
</html>"""


def _profile_url() -> str:
    from backend.email import APP_URL

    return f"{APP_URL}/profile"
