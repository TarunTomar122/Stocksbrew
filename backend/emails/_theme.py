"""Shared color/radius tokens for transactional and digest emails.

Mirrors the web app's design tokens (see app/globals.css, light mode):
--oa-bg, --oa-card, --ink, --oa-border, --oa-muted-fg, --oa-primary,
--signal-bullish, --signal-bearish, --signal-neutral.

Email clients can't read CSS custom properties, so these are the same
values baked in as plain hex for inline styles.
"""
from __future__ import annotations

# surfaces
BG = "#f6f6f6"
CARD = "#ffffff"
INSET = "#f7f7f7"  # nested panel background (was #f9fafb/#fafafa)

# text
INK = "#292929"
BODY = "#4a4a4a"
MUTED = "#6d6d6d"

# lines
BORDER = "#e7e7e7"
DIVIDER = "#efefef"

# the one brand accent — links, CTAs, brand-voice highlights
PRIMARY = "#305dde"
PRIMARY_FG = "#ffffff"
PRIMARY_BG = "#eaf0fd"  # light tint for badges

# data-only signal colors — never used for brand chrome
BULLISH = "#047857"
BULLISH_BG = "#e7f5ef"
BEARISH = "#b91c1c"
BEARISH_BG = "#fdecec"
NEUTRAL = "#475569"
NEUTRAL_BG = "#eef1f4"

# radii
RADIUS_CARD = 20
RADIUS_INNER = 14
RADIUS_PILL = 999
