"""Shared test setup for backend/tests.

The suite pins today's Free/Pro line (five covered stocks on Free). A PAYWALL_V2
set in the shell must not flip it under tests that assert today's numbers; the
tighter line is tested on purpose in test_subscription_entitlement.py by
setting the variable and reloading the module.
"""

import os

os.environ.pop("PAYWALL_V2", None)
