"""List every figure said twice inside one email card, and every stock carded twice in one email (owner rule 1).

    python scripts/email-number-repeats.py <dir-of-rendered-emails>

Reads the .html files `python -m backend.mail.preview` writes (or any folder of email HTML), finds each card
(the kit's grid cells), and prints the figures ($ prices, % moves, multiples) that appear more than
once in it, with the card's text. Exits 1 when it finds any, so it can gate a render in CI or by hand.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.mail.repeats import repeats_in  # noqa: E402


def main() -> int:
    folder = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
    total = 0
    for f in sorted(folder.glob("*.html")):
        if f.name in ("index.html", "sheet.html"):
            continue
        for twice, text in repeats_in(f.read_text()):
            total += 1
            print(f"{f.name}\t{', '.join(twice)}\t{text[:220]}")
    print(f"{total} card(s) with a figure said twice")
    return 1 if total else 0


if __name__ == "__main__":
    raise SystemExit(main())
