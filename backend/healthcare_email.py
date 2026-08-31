from __future__ import annotations

from typing import Any

from backend.ai_capex_email import PREVIEW_RECIPIENT, build_theme_watch_data
from backend.email import send_email
from backend.email_runtime import log_email_send
from backend.emails.healthcare_watch import build_healthcare_watch_for_user
from backend.storage import TraceMoneyStore


EMAIL_TYPE = "healthcare_watch"


SELECTIONS: tuple[dict[str, str], ...] = (
    {
        "ticker": "LLY",
        "role": "GLP-1 medicines",
        "why_benefits": "Mounjaro and Zepbound are scaling an obesity and diabetes franchise, while new manufacturing capacity and next-generation programs broaden the opportunity.",
        "risk": "Pricing pressure, access changes, safety signals, or a competitor taking share could compress the growth story.",
    },
    {
        "ticker": "DXCM",
        "role": "Glucose biosensing",
        "why_benefits": "Dexcom is widening glucose monitoring with the G7 15 Day system, broader access, and continuous data that can reach more people beyond insulin-dependent patients.",
        "risk": "Reimbursement limits, lower sensor pricing, product execution, or cheaper alternatives could slow adoption.",
    },
    {
        "ticker": "VEEV",
        "role": "Life-sciences software",
        "why_benefits": "Veeva provides a mission-critical cloud layer for regulated life-sciences workflows, while Vault adds industry-specific AI across research, commercial, and quality teams.",
        "risk": "Pharma customers can slow software budgets, consolidate vendors, or demand more proof that AI features create measurable value.",
    },
    {
        "ticker": "ISRG",
        "role": "Robotic surgery",
        "why_benefits": "Intuitive compounds its installed base through procedures, instruments, services, and new system placements. Recent procedure growth and guidance remain double-digit.",
        "risk": "Hospitals can defer capital purchases, international tenders can slow, or competition can rise in robotic surgery.",
    },
    {
        "ticker": "TMO",
        "role": "Research and biopharma tools",
        "why_benefits": "Thermo Fisher supplies the instruments, lab products, and biopharma services underneath drug discovery and manufacturing, giving it exposure across the research cycle.",
        "risk": "Biotech funding, pharma R&D budgets, or lab spending can soften; integrations and large expansions can also pressure margins.",
    },
)


def build_healthcare_watch_data(store: TraceMoneyStore) -> tuple[list[dict[str, Any]], str]:
    return build_theme_watch_data(store, SELECTIONS)


def send_healthcare_preview(
    store: TraceMoneyStore,
    *,
    recipient: str = PREVIEW_RECIPIENT,
    dry_run: bool = False,
) -> dict[str, int]:
    email = recipient.strip().lower()
    if email != PREVIEW_RECIPIENT:
        raise ValueError("The preview sender is restricted to the owner email address.")

    names, as_of = build_healthcare_watch_data(store)
    subject, html_body = build_healthcare_watch_for_user(
        display_name=None,
        email=email,
        names=names,
        as_of=as_of,
    )
    if dry_run:
        print(f"[dry-run] would send to {email}: {subject}")
        return {"checked": 1, "sent": 1, "failed": 0}

    if not send_email(email, subject, html_body):
        return {"checked": 1, "sent": 0, "failed": 1}

    log_email_send(
        store,
        uid=f"preview:{email}",
        email=email,
        email_type=EMAIL_TYPE,
        subject=subject,
        dedupe_key=f"{EMAIL_TYPE}_preview_{as_of}",
        trigger_type="healthcare_preview",
        meta={"market": "US", "as_of": as_of, "preview": True, "tickers": [item["ticker"] for item in names]},
    )
    return {"checked": 1, "sent": 1, "failed": 0}
