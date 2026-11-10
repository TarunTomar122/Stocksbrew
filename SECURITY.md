# Security policy

## Reporting a vulnerability

Please report security problems privately by email to **tomartarun2001@gmail.com** with "stocksbrew security" in the subject. If GitHub private vulnerability reporting is enabled on the repository, you can use that instead.

Include what you found, how to reproduce it, and what an attacker could do with it. Please don't open a public issue, and don't access, change or delete other people's data while testing. Use your own account.

What to expect:

- an acknowledgement within 3 working days;
- an assessment and a plan within 10 working days;
- credit in the fix notes if you want it, once a fix is out.

There is no paid bug bounty.

## Supported versions

Only the latest `main` is supported. Fixes land there and in the hosted site; there are no release branches.

## In scope

- the web app and its API routes (`app/api/*`), including auth, sessions, entitlements (Free vs Pro data leaking to the browser counts), the REST API under `/api/v1` and the MCP server with its OAuth flow;
- the LocalDB HTTP service (`backend/localdb`);
- the jobs in `backend/` where they handle credentials or user data;
- secrets or personal data accidentally present in this repository.

## Out of scope

- third-party providers (Firebase, payment processor, data APIs) themselves;
- denial of service and volume testing;
- reports that need a compromised device or browser.

## For operators

- Keep `LOCALDB_API_TOKEN` long and random, bind LocalDB to localhost and put TLS in front of it before exposing it. The token is not encryption.
- Keep service-account JSON outside the repo and readable only by the service user.
- Rotate any key you suspect was exposed, then report it.
