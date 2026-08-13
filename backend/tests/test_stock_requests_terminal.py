from backend.scripts.process_stock_requests import RUNNABLE_REQUEST_STATUSES, _requester_emails


def test_needs_confirmation_is_not_reprocessed_by_cron() -> None:
    assert "needs_confirmation" not in RUNNABLE_REQUEST_STATUSES
    assert {"queued", "retry", "pending"} <= RUNNABLE_REQUEST_STATUSES


def test_requester_emails_are_deduplicated() -> None:
    assert _requester_emails(
        {"requester_emails": [" A@example.com ", "a@example.com"], "requester_email": "b@example.com"}
    ) == {"a@example.com", "b@example.com"}
