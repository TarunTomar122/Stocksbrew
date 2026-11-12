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

# small charts: a bar that is neither up nor down, and the zero line
BAR_FLAT = "#cfc6b5"

# dark mode, for clients that honour prefers-color-scheme (Apple Mail, iOS, Outlook for Mac).
# Gmail ignores it and inverts on its own, so the light values above stay the inline default.
D_PAGE = "#14120f"
D_CARD = "#1d1a16"
D_WELL = "#26221c"
D_INK = "#f3ede2"
D_BODY = "#ddd5c7"
D_MUTED = "#b3a998"
D_BORDER = "#3a342b"
D_COPPER = "#e39a62"
D_UP = "#5fc795"
D_DOWN = "#f08a7c"
D_UP_WASH = "#173326"
D_DOWN_WASH = "#3a1c18"
D_CAUTION = "#e3c06e"
D_CAUTION_WASH = "#352a12"

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
COL_GAP = 10  # between cards side by side
