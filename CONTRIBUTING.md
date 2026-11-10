# Contributing to stocksbrew

Thanks for helping. Small, focused pull requests get reviewed fastest.

## Before you start

- Open an issue first for anything bigger than a bug fix, so we can agree on the shape before you spend time.
- Read [What we won't build](README.md#what-we-wont-build). Broker connections, order placement and copy trading are out of scope.
- Skim [`docs/architecture.md`](docs/architecture.md) (ten minutes) and [`docs/product-voice.md`](docs/product-voice.md) (five).

## Setup

Follow [Run it locally](README.md#run-it-locally) in the README: install Node and Python deps, copy `.env.example` to `.env.local`, start LocalDB with an empty database, `npm run dev` on port 8000, then run a job or two to get data. You need your own Firebase project for sign-in; if you use the Firebase CLI, point it at your project with `firebase use --add` (`.firebaserc` is gitignored).

## Branches and pull requests

1. Fork, then branch from `main` (`fix/short-name` or `feat/short-name`).
2. Keep the change to one idea. Unrelated cleanups go in their own PR.
3. Run the checks below and say in the PR which ones you ran.
4. Add or update tests for behaviour you change.
5. For any visible change, attach screenshots (see the next section).
6. Sign off your commits (`git commit -s`). This is the [Developer Certificate of Origin](https://developercertificate.org/): you confirm you wrote the change or have the right to submit it.
7. A maintainer reviews, may push small fixes to your branch, then merges.

## Checks

```sh
npx tsc --noEmit                   # typecheck
npx vitest run                     # web and lib tests
npx eslint app components lib      # lint; warnings are fine, errors are not
python3 -m pytest backend/tests    # backend tests, when you touch backend/ (pip install pytest)
node scripts/oss/scan.mjs --tree   # secrets and personal data; must report no secret
```

On a small machine, `npx vitest run --maxWorkers=2` keeps memory down. Don't run `next build` while `next dev` is running in the same checkout: both write `.next/`.

## Look at what you changed

Typecheck, lint and tests passing is not enough for a frontend change. Before you ask for review, open the page and look at it:

1. Screenshot every page or component you touched at desktop size (about 1280x900) and phone size (about 390x844). Attach them to the PR.
2. Try the states that matter for your change: open and closed, hover, menus open, empty state, error state, signed out and signed in, dark mode.
3. Check for overlap with the fixed and sticky parts of the shell (the sidebar, the phone tab bar, the Ask composer, modals, banners), text that gets clipped, horizontal scroll on phones, and contrast. The `--oa-*` color tokens only exist inside `.oa-app` and `.oa-landing`; a component rendered outside them gets a transparent background.
4. Say in the PR what you checked.

Any browser works. For a scripted capture, headless Chrome does it: `chrome --headless=new --screenshot=out.png --window-size=390,844 http://localhost:8000/briefing`.

## Code style

- TypeScript strict, no `any` unless a comment says why. Prettier-like formatting as you find it; ESLint is `next/core-web-vitals`.
- Server components by default; `"use client"` only for components that need state or browser APIs.
- Data loading lives in `lib/` loaders, never in components. Pages call loaders and pass plain objects down.
- Gated data is removed on the server (`lib/entitlements-server.ts`). Never hide it with CSS or blur.
- Pure logic (formatting, insight sentences, gating rules) goes in a small `lib/*.ts` file with a test next to it.
- Comments say why, not what. No dead code or commented-out blocks; delete it, git remembers.
- Python: type hints, `from __future__ import annotations`, standard library in `backend/agentdata/`.

## Rules that keep the product honest

- Every number shown to a person needs a source and an as-of time near it. When data is missing, show nothing or say so. Never a placeholder or a zero standing in for "unknown".
- Simulated or backtested results are labelled as such, with the period and the known biases.
- Numbers and "the read" sentences come from data and plain rules, not from model-written text.
- Copy follows [`docs/product-voice.md`](docs/product-voice.md): ordinary verbs, name the thing, one idea per sentence, no hype, no em dashes.

## Adding a page

1. Create `app/(app)/<name>/page.tsx`. The `(app)` layout already draws the shell, so render only your `<main>`.
2. Build it from the kit in `components/oa/kit` (`AppPage`, `PageHead`, `Panel`, `StatStrip`, `TabBar`, `DataTable`, the `fmt*` helpers) before writing new primitives. Look at a page close to yours, for example `app/(app)/filings/page.tsx` or `app/(app)/strategies/page.tsx`.
3. Load data in a `lib/<name>.ts` loader. If the page opens with a read, build it in `lib/<name>-insights.ts` with a test and render it with `TheRead` from `components/oa/insight.tsx`.
4. If any part depends on the plan, add or reuse a feature in `lib/entitlements.ts` and check it on the server.
5. Add metadata (`generateMetadata`, canonical URL), add the route to `lib/seo/sitemap.ts` if it should be indexed, and to `components/oa/nav-items.ts` if it belongs in the sidebar.
6. Replacing an old page? Delete it and add a redirect in `next.config.js`.
7. Screenshot it as described above.

## Adding a data job

See [`docs/data-jobs.md`](docs/data-jobs.md#adding-a-job). In short: a standard-library module in `backend/agentdata/` that writes through `DocStore.from_env()`, is safe to re-run, has a `--dry-run` or a limit, a fixture-based test in `backend/tests/`, and a place in a group in `backend/agentdata/schedule.py`. Respect each provider's terms and rate limits; SEC needs a contact in the User-Agent.

## Secrets and personal data

- Never commit `.env*` files (except `.env.example`), service-account JSON, database files, exports, fetched data or user data. `.gitignore` covers the usual names; check `git status` anyway.
- New env var? Add it to `.env.example` with a one-line comment and an empty value.
- Run `node scripts/oss/scan.mjs --tree` before opening a PR. It prints masked findings and exits non-zero when it sees a secret. A reviewed false positive goes in `scripts/oss/allowlist.json` with a reason.
- Found a vulnerability? Don't open an issue; follow [SECURITY.md](SECURITY.md).

## Code of conduct

Be kind and specific. Critique code, not people. Maintainers may remove comments or contributors that make the project unwelcoming.
