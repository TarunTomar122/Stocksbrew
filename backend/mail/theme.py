"""Colour and type tokens for stocksbrew email, baked to hex.

Mirrors the app kit in app/globals.css (`.oa-app`, light mode): warm paper,
a near-white card, ink text and copper as the one accent. Email clients
cannot read CSS custom properties, so every value here is a literal.
"""
from __future__ import annotations

# surfaces
PAGE = "#f0eadd"  # --oa-page, the paper behind the card
CARD = "#fffdf9"  # --oa-card
WELL = "#f4efe4"  # --oa-bg, nested panels and table heads

# text
INK = "#1d1a16"
BODY = "#3a352d"
MUTED = "#564f44"  # --oa-muted-fg; still 7:1 on CARD
FAINT = "#7a7266"  # timestamps and sources only, never body copy

# lines
BORDER = "#e4ddcf"
DIVIDER = "#ece6da"

# the one accent
COPPER = "#9a4816"  # --oa-primary
COPPER_FG = "#fffaf2"
COPPER_WASH = "#f6e9dc"

# data colours, for numbers only
UP = "#0f6b45"
UP_WASH = "#e3f1e8"
DOWN = "#a3271c"
DOWN_WASH = "#f8e4e0"
CAUTION = "#6f5210"  # --oa-label
CAUTION_WASH = "#f5ecd3"

# level bar zones: stronger than the washes so the bar reads at a glance
ZONE_ADD = "#9fd0b4"
ZONE_HOLD = "#e2dacb"
ZONE_TRIM = "#e6c98a"

FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif"
MONO = "'SF Mono',Menlo,Consolas,'Liberation Mono',monospace"

# sizes: nothing under 13px
TEXT_XS = 13
TEXT_SM = 14
TEXT_MD = 16
TEXT_LG = 20
TEXT_XL = 26

RADIUS = 14
RADIUS_SM = 10
WIDTH = 600
