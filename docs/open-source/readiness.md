# open source readiness

State as of 2026-11-10. Scan of the working tree (tracked plus untracked, not ignored) and every blob and commit reachable from `origin/main` (581 commits, 5,986 blobs).

Reproduce it:

```sh
node scripts/oss/scan.mjs                 # tree + origin/main history, masked
node scripts/oss/scan.mjs --tree          # before every commit
node scripts/oss/scan.mjs --json /tmp/oss-scan.json
```

Values are always masked; `fp=` is a sha256 prefix so the same value can be matched across files without showing it. Reviewed false positives go in `scripts/oss/allowlist.json` with a reason.

## update, 2026-11-10 cleanup pass

The working tree no longer has: the waitlist CSV (item 3; still in history), the Discord IDs (item 8), the root scratch files, `explorations/`, `zexp/`, `gallery/`, `hackathon/`, `automated-youtube/`, `test/`, the retired weekly-report scripts, `MIGRATION_PLAN.md`, `migrate-steve-to-hermes.py`, the OpenClaw setup and spec, and the unused `public/` images. The VPS IP, OVH and Tailscale hosts, the LocalDB host, the GCP and Firebase project ids and the work paths are replaced by placeholders or env in `AGENTS.md`, `backend/AGENTS.md`, `backend/vps/*` and `docs/` (item 6). `.firebaserc`, `.ai-memory.toml` and `.commandcode/` are untracked and ignored. Still open: the owner's second Gmail as the sender default in `backend/email.py` and `lib/brevo.ts` (item 9, waits for the email rework and `STOCKSBREW_FROM_EMAIL` in production), the work email and Vercel team slug in `AGENTS.md`, key rotation, history, license. The tables below are the original findings and are not rewritten.

## checklist

| # | item | status |
|---|---|---|
| 1 | No live secret in the working tree | done (Finnhub and Marketaux keys moved to env on 2026-11-10) |
| 2 | Keys that ever appeared in history rotated | **open, owner** (list below) |
| 3 | Waitlist CSV with 27 real emails out of the tree | **open, owner** (delete `backend/waitlist_emails_2026-05-05.csv`) |
| 4 | Waitlist CSV and keys out of the public history | **open, owner**: publish a fresh-history repo (recommended) |
| 5 | Commit metadata clean (work email, VPS root hostname) | solved by the fresh-history repo |
| 6 | Private infra (VPS IP, OVH hostname, Tailscale IP/host, Vercel team) out of public files | open: redacted automatically in the snapshot; rewrite `AGENTS.md`, `backend/AGENTS.md`, `backend/vps/README.md` by hand |
| 7 | Personal tooling and junk excluded | open: proposed list in `scripts/oss/exclude.txt`, owner confirms |
| 8 | Discord IDs out | open: only in `scripts/vps-setup-openclaw.sh` and `backend/vps/migrate-steve-to-hermes.py`, both on the exclude list |
| 9 | Private emails out of code | open: `backend/email.py:16` and `lib/brevo.ts:2` default the sender to the owner's second Gmail; `scripts/send-weekly-broadcast.py:39` filters it. Set `STOCKSBREW_FROM_EMAIL` in production, then change the defaults (the snapshot does it automatically) |
| 10 | README, .env.example, CONTRIBUTING, SECURITY | done (review) |
| 11 | License chosen | **open, owner**: AGPL-3.0-or-later recommended, see `LICENSE.proposed` |
| 12 | Data-source terms reviewed; no fetched data shipped | open: README table; owner decides whether scrapers stay on by default |
| 13 | Third-party assets cleared | open: `public/trump-avatar.png` (photo rights), `public/agent-logos/` (trademarks), OFL notices for `assets/og` fonts, `fixtures/*.xml` (headline snippets from news sites, replace with synthetic) |
| 14 | Local setup works without the owner's infra | partial: needs your own Firebase project; no seed data, so pages start empty |
| 15 | `.gitignore` covers data, DB files, exports, keys | done (new block at the end) |
| 16 | Dev routes guarded in production | done upstream (`/dev/watchlist`, `/api/dev/user-watchlist`, commit `607e04a`) |
| 17 | Never push local refs | note: `refs/t3/*` checkpoint refs and `.claude/worktrees/` contain the service-account file and waitlist copies. Never `git push --all` or `--mirror` from this checkout |

## findings

Counts are distinct values. "both" = in the working tree and in history, "history-only" = removed from the tree but still in `origin/main` history.

### secrets (6 distinct keys, all history-only now)

| type | masked | where | first commit |
|---|---|---|---|
| OpenAI API key | `sk-p****** (len 71)` fp `023163aeb9` | `stocksbrew/generate_html_newsletter.py:8`, `stocksbrew/newsletter_system/scripts/2_generate_summaries.py:16`, `2.5_refine_summaries.py:15` | `26f87c4` (2026-04-27, deleted in `5aaf5c4`) |
| Google API key (Gemini) | `AIza****** (len 39)` fp `eda24957e1` | `stocksbrew/test.py:10`, `.../2_generate_summaries_gemini.py:15`, `.../2.5_refine_summaries_gemini'.py:7` | `26f87c4` |
| NewsAPI.org key | `ad38****** (len 32)` fp `481750b1f0` | `stocksbrew/test.py:9`, `.../1_fetch_news.py:14`, `stocksbrew/generate_html_newsletter.py:12` | `26f87c4` |
| Brevo API key | `xkey****** (len 64)` fp `0d943723b7` | `stocksbrew/newsletter_system/scripts/4_send_email.py:17`, `stocksbrew/test_mail.py:7` | `26f87c4` |
| Finnhub API key | `d8be****** (len 40)` fp `37c18d90bb` | `backend/news_finnhub.py:31` | `5ea4ab8` (2026-05-27); in the tree until this pass |
| Marketaux API key | `rY0p****** (len 40)` fp `fd8863b6fa` | `backend/news_marketaux.py:28` | `5ea4ab8`; in the tree until this pass |

None of the six matches a value in today's `.env.local` or `.env.vps.local` (fingerprint check), so the current local keys look different. That doesn't prove the old ones are dead.

Not found anywhere in history: private keys, service-account JSON, `LOCALDB_API_TOKEN` values, Anthropic, Stripe/Dodo, GitHub, Slack, AWS, Tavily or Tailscale auth keys, JWTs, `.env` files. `backend/firebase-service-account.json` is gitignored and never reached `origin/main`.

Reviewed and allowed: `lib/email-unsubscribe.test.ts:6` (HMAC of the literal `test-secret`), `backend/mail/jobs.py:10` (`you@x.com` in usage text), `lib/seo/indexnow.ts:2` / `public/stocksbrew-seo-2026.txt` (IndexNow keys are public by design).

### personal data

| finding | where | status |
|---|---|---|
| 27 real people's emails | `backend/waitlist_emails_2026-05-05.csv` | both (added `69c2cdd`) |
| owner's work email (`tt***@adobe.com`) | `AGENTS.md:37`, `stocksbrew/test.py` (history), author/committer of 7 commits | both |
| owner's second Gmail (`yo***@gmail.com`) | `AGENTS.md:37`, `backend/email.py:16`, `lib/brevo.ts:2`, `scripts/send-weekly-broadcast.py:39`, author of ~530 commits | both |
| another person's Gmail (`du***@gmail.com`) | `backend/scripts/send_stock_request_backlog_email.py:21` | history-only (`7edb527`) |
| old brand addresses (`he***@tikrr.com`, `pr***@tikrr.com`, `ta***@tikrr.online`) | old legal/about/profile pages | history-only; low risk |
| `co***@stocksbrew.online` | `backend/vps/install-systemd.sh:41`, `backend/vps/run-dispatch.sh:22` | both; project domain, fine to keep if it is a role address (owner decision) |
| `root@<vps-hostname>` commit identity | commit `7da4196` | history-only (metadata) |
| 3 Discord IDs (2 channel/guild, 1 user) | `scripts/vps-setup-openclaw.sh:7-9,57`, `backend/vps/migrate-steve-to-hermes.py:75` | both |
| VPS public IP (`144.***.***.112`) | `backend/AGENTS.md:17,23,30`, `backend/vps/Caddyfile:4`, `backend/vps/MIGRATION_PLAN.md:35`, `backend/vps/README.md` (8 lines), `backend/vps/T3_ACCESS.md:9,69`; was the default in `backend/vps/deploy-code.sh:4` | both |
| Tailscale IP (`100.x.x.69`) | `backend/vps/T3_ACCESS.md` (9 lines) | both (CGNAT range, not flagged by the scanner's public-IP rule) |
| work username paths `/Users/<work-user>/...` | `backend/tikrr_pipeline/README.md:56,63`, `docs/contracts-v1.md:7-12`, `docs/rebuild-plan.md:524`, `nitin_ppt.js:535` | both |
| owner's GitHub handle | `backend/vps/GITHUB.md:10,34`, git remote | fine (public anyway) |
| owner's name "Tarun" in email sign-offs and tests | `backend/emails/welcome_pro.py:76`, `lib/emails/welcome-pro.ts:108`, tests | fine (owner is the public author) |

The chosen public contact `tomartarun2001@gmail.com` is allowed (SEC User-Agent, preview default recipient, site schema, SECURITY.md).

### private infrastructure

| reference | where | classification |
|---|---|---|
| `stocksbrew.online`, `www.stocksbrew.online` | app, emails, SEO | fine: public product domain |
| the LocalDB host (behind Caddy) | `AGENTS.md:4`, `backend/vps/Caddyfile:3`, `docs/local-db-migration.md:95` | fine to publish as a name, but it is a live database endpoint; it stays protected only by the bearer token. Prefer replacing with `<your-localdb-host>` in docs and confirm rate limiting / token strength before going public |
| VPS IP | see above | remove (snapshot redacts to `<vps-ip>`); keep the real value only in the ignored `backend/vps/LOCAL_SECRETS.md` or `~/.ssh/config` |
| OVH hostname `vps-******.vps.ovh.ca` | `backend/vps/README.md:7`, commit metadata | remove |
| Tailscale Funnel host `vps-******.tail******.ts.net` | `AGENTS.md`, `docs/local-db-migration.md` (history only, `7f60838`) | remove (history only, solved by fresh history) |
| Vercel team slug `yourtraceonline-…-projects` | `AGENTS.md:37` | remove |
| Vercel team/project IDs (`team_…`, `prj_…`) | none found | n/a |
| Firebase project id `<firebase-project-id>` | `.firebaserc:3`, `backend/vps/README.md:102`, 4 docs | move to env/placeholder: not secret (it's in the public web config) but ties forks to your project. Replace `.firebaserc` default with `your-firebase-project` |
| `/opt/tikrr`, `/etc/tikrr/*`, `/srv/tikrr-data/*`, `/var/lib/tikrr/*` | systemd units, run scripts, docs (23 distinct paths) | fine: generic server layout, all overridable by `TIKRR_REPO_DIR` / `TIKRR_ENV_FILE` |
| systemd unit names `tikrr-*.service` | `backend/vps/units/` | fine |
| `/mnt/data/workspace/tikrr` | `scripts/weekly-report-cron.sh`, `scripts/send-weekly-broadcast.py` | remove with the retired OpenClaw cron scripts |
| service-account filename with key-id prefix | `backend/vps/README.md:102` | remove (not a secret, but names your key) |
| `/Users/tarat` | nowhere in tracked files | n/a |

## junk and private files

Nothing has been deleted. Recommendation per item; `scripts/oss/exclude.txt` mirrors the delete/move ones so the snapshot leaves them out.

| path | what it is | recommendation |
|---|---|---|
| `backend/waitlist_emails_2026-05-05.csv` | real people's emails | delete now, never publish |
| `xyz.html` | empty file | delete |
| `test.html` | an old email preview | delete |
| `nitin_ppt.js` | slide generator for an unrelated deck, personal path | move to a private repo |
| `infobay-eval-report.csv` (untracked) | a repo evaluation report | delete or keep private (now ignored) |
| `pipelineaudit.txt` | rough notes on pipeline call counts | delete, or fold into `docs/pipeline-cost-audit.md` |
| `explorations/` (66 files, 5.4 MB) | design variations, audit dumps, a 4.7 MB JSON | move to a private repo |
| `zexp/` | landing experiments | move to a private repo |
| `gallery/` | old static mockups | delete |
| `hackathon/` + `app/api/hackathon/` | thesis compiler prototype (the page was removed, the API route still imports it) | delete both together, or keep if Ask still needs it |
| `automated-youtube/` | a .docx video plan | move to a private repo |
| `output/` (untracked, partly ignored) | playwright screenshots | delete (now ignored) |
| `.commandcode/` | an AI tool's learned style notes | delete (or keep private) |
| `backend/vps/T3_ACCESS.md`, `setup-t3*.sh`, `t3-dedupe.sh`, `t3vps`, `tattach`, `occ`, `setup-gh-token.sh`, `setup-opencode-auth.sh`, `GITHUB.md`, `migrate-steve-to-hermes.py` | personal dev-box and agent tooling on the VPS | move to a private ops repo |
| `backend/vps/MIGRATION_PLAN.md` | finished Cloud Run to VPS plan, has the IP | delete or move |
| `scripts/vps-setup-openclaw.sh`, `docs/tikrr-openclaw-spec.md` | personal OpenClaw agent setup, Discord IDs | move to a private repo |
| `scripts/weekly-report-cron.sh`, `send-weekly-broadcast.py`, `weekly-report-generator.js`, `generate-report-json.js`, `daily-anomaly-scanner.js` | retired OpenClaw-era weekly broadcast (reads every Auth user) | delete |
| `docs/volaren-parity-hillclimb.md` | internal loop state that names a competitor throughout | move to a private repo |
| `docs/editorial-audit-2026-08-04.md`, `docs/pro-trial-email-preview.html`, `docs/firebase-migration-*.txt` | internal one-offs | move or delete |
| `AGENTS.md`, `backend/AGENTS.md` | agent instructions with private details | keep, rewrite for contributors |
| `backend/cloudrun/` | retired Cloud Run jobs (schedulers paused) | keep for now as reference; delete after the VPS is the only path |
| `remotion/`, `content/`, `fixtures/`, `packages/` | launch video, SEO content, test fixtures, CLI | keep (replace fixture XML with synthetic samples) |

## the history problem

`origin/main` history contains the waitlist CSV, six API keys, the owner's work email and a VPS hostname in commit metadata, and older copies of the infra details. Making the current repo public exposes all of it, even after the files are deleted, and GitHub keeps cached views and forks.

Options:

1. **Rewrite history** (`git filter-repo` or BFG): strip the CSV and `stocksbrew/`, replace key strings, rewrite author emails with a mailmap, force-push, then ask GitHub support to purge cached views.
   - keeps 581 commits of history and blame
   - every clone, worktree, open branch and the VPS checkout must be re-cloned or hard-reset; the VPS deploy (`git pull --ff-only`) breaks until fixed
   - easy to miss something (the metadata, old paths, a blob under another name), and the old SHAs stay reachable in existing clones and the local `refs/t3/*` checkpoints
2. **Fresh-history public repo from a clean snapshot** (recommended): keep this repo private as is, and create a new public repo whose first commit is a reviewed snapshot.
   - nothing in the old history can leak; no force-push, the VPS and your workflow are untouched
   - you lose public history/blame (the private repo keeps it)
   - you then need one direction of truth: develop in the public repo and point the VPS at it, or keep syncing snapshots

Recommendation: option 2. The history here is mostly one person's work-in-progress, and the cost of a missed blob is real people's emails. Rotating the keys is needed either way.

## steps for the owner

1. **Rotate** (in each provider's dashboard), whether or not you go public, since the private repo history has them: OpenAI, Google AI Studio / Gemini key, NewsAPI.org, Brevo, Finnhub, Marketaux. Then put the new Finnhub and Marketaux keys in the VPS env file as `FINNHUB_API_KEY` and `MARKETAUX_API_KEY` **before** the next backend deploy. Without them those two news sources log `*_skipped reason=missing_api_key` and return nothing (the rest of the pipeline runs).
   Optional: rotate the Firebase service-account key (it never left this machine, but it is in local checkpoint refs and worktrees) and `LOCALDB_API_TOKEN` if it was ever pasted anywhere.
2. Set `STOCKSBREW_FROM_EMAIL` explicitly in production (Vercel and the VPS env) so the code default can change safely.
3. Delete `backend/waitlist_emails_2026-05-05.csv` from the private repo and keep the list somewhere private.
4. Decide the license (step 11 above) and the exclude list (`scripts/oss/exclude.txt`).
5. Rewrite `AGENTS.md`, `backend/AGENTS.md` and `backend/vps/README.md` for contributors: no IPs, no team slug, no private emails; real values go in the ignored `backend/vps/LOCAL_SECRETS.md`.
6. Commit the current work in the private repo (the snapshot is built from a ref).
7. Build the snapshot in a new folder outside the repo:
   ```sh
   node scripts/oss/make-snapshot.mjs --out ../stocksbrew-public --ref main
   ```
   It copies the files, drops the exclude list, redacts IPs, hostnames, personal paths, private Gmail/work addresses and Discord IDs, runs `git init` + `git add -A` (no commit) and rescans. A dry run on today's working tree removed 37 paths, redacted 9 files and left 0 secret and 0 private-email findings (only the project-domain address and generic server paths).
8. Review the folder by hand (`git -C ../stocksbrew-public diff --cached --stat`, read the README, run the app and tests there).
9. Create an empty **private** GitHub repo, commit as `Tarun Tomar <tomartarun2001@gmail.com>` (the public contact), push, check GitHub's secret-scanning results, then flip it to public.
10. Turn on secret scanning, push protection and private vulnerability reporting in the repo settings.
11. Add `node scripts/oss/scan.mjs --tree` to CI or a pre-commit hook.

## blocks going public today

- six keys in history not yet rotated;
- the waitlist CSV is in the tree and in history;
- no license chosen;
- `AGENTS.md` / `backend/AGENTS.md` / `backend/vps/README.md` still carry private details (the snapshot redacts the patterns, but these files read like private runbooks);
- the Finnhub and Marketaux keys must be added to the VPS env before the next backend deploy, or those sources go quiet.
