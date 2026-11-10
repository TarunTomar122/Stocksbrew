# email v2: release note

the new emails live in `backend/mail/`. they're built, tested and dry-run against real data. nothing sends yet: the timers aren't installed and `MAIL_V2_ACTIVE` isn't set anywhere, so today the old premarket, open and weekly emails keep going out as before.

owner decisions this is built on: US investors (everything runs on Eastern time), no email on quiet days, keep Brevo as the sender, Free users get emails too (daily and weekly cover their 5 covered stocks).

## the set

| email | who | when | trigger |
| --- | --- | --- | --- |
| daily brief | everyone with tracked stocks; Pro gets every stock, Free gets the covered 5 | trading days 8:30am ET | only when a stock crossed an add/trim level, our call changed direction (not a flip-flop), it moved 2.5x its usual day (at least 4%, 3% for holdings), or it reports today/next session. quiet day = no email |
| weekly recap | everyone with tracked stocks (same Free/Pro scope) | Saturday 9am ET | always, if the stocks have a week of prices. week vs the S&P 500, biggest moves, our calls' hit rate with misses, next week's earnings |
| alerts | anyone whose agent jobs logged a `notify` finding | checked every 15 min | new findings since the last alert email, bundled; max 4 a day |
| welcome | new accounts | hourly check, first 48h | signup |
| setup nudge (day 2, day 5) | accounts with an empty watchlist | hourly check | 2 and 5 days after signup |
| Pro welcome | new Pro subscribers | hourly check | `subscription_converted` event in the last 3 days |
| weekly swap open | Free with tracked stocks | Monday from 9am ET | no swap used in the last 7 days and a stock outside the five moved |
| we miss you | tracked stocks, no sign-in for 21–60 days | hourly check | once per absence |

`build_limit_reached` (Free hit a plan limit) is written but nothing calls it yet.

price alerts (the ones people set by hand), power-trade alerts and automatic Radar alerts stay on the old senders for now. they obey the same "Alerts" switch.

every send goes through `send.deliver()`: preference check, dedupe against `tm_email_sends`, per-day caps, then Brevo with `List-Unsubscribe` + `List-Unsubscribe-Post: One-Click`. one account failing doesn't stop the batch. if Brevo accepts a send but the log write fails, the job stops (exit 1) so the next run can't send it twice.

dedupe keys: `daily_<session date>` (a holiday rerun finds the same session and stops), `weekly_<ISO week>`, `alerts_<minute>` plus a cursor so the next bundle starts where the last stopped, `welcome`, `setup_nudge_d2/d5`, `pro_welcome`, `swap_open_<week>`, `winback_<last sign-in date>`.

## what was verified (2026-11-10)

- `backend/tests/test_mail.py` + `test_mail_send.py`: 73 passed. `lib/email-unsubscribe.test.ts` (token parity with python): 3 passed. `tsc --noEmit` clean, eslint clean on the touched web files.
- dry runs, read-only over the LocalDB API with `BREVO_API_KEY` blank and `EMAILS_ENABLED=0`: all four jobs on the owner account (daily, weekly, alerts each planned one email, lifecycle nothing due), daily across 12 accounts (11 quiet or no stocks, 1 email).
- `--send` refuses to run without `EMAIL_UNSUBSCRIBE_SECRET` and without `LOCALDB_PATH` (VPS only).
- with `MAIL_V2_ACTIVE=1`, `send_premarket_briefs`, `send_open_briefs` and `weekly_email_job` print a skip line and exit before touching the store.
- every template rendered from real data and screenshotted at 640px and 390px.

## cutover steps

do these in order. the web side goes first so the unsubscribe links and the logo work before the first email.

1. make a secret on your machine, don't paste it anywhere public: `openssl rand -base64 32`
2. Vercel, production env: `EMAIL_UNSUBSCRIBE_SECRET=<secret>` and `MAIL_V2_ACTIVE=1`. then deploy (clean worktree, `vercel --prod`). this ships `/email/unsubscribe`, `/api/email/unsubscribe`, the account email switches, `public/email/mark.png` (404 on prod today), and stops the web app's own Pro welcome so it isn't sent twice.
   check: `https://www.stocksbrew.online/email/mark.png` is 200, `/email/unsubscribe` shows the "link has expired" page.
3. VPS: `cd /opt/tikrr && git pull --ff-only origin main`. in `/etc/tikrr/backend.env` add
   ```
   EMAIL_UNSUBSCRIBE_SECRET=<same secret>
   MAIL_V2_ACTIVE=1
   EMAILS_ENABLED=1
   ```
   the old premarket, open and weekly senders read this file on every run, so they stop at their next run. no restart needed.
4. look before sending: `sudo -u ubuntu /opt/tikrr/backend/vps/run-mail.sh lifecycle` (no `--send` = dry run). the first lifecycle run sends "we miss you" to everyone away 21–60 days at once; check that count is sane. same for `daily` and `weekly`.
5. one real email to yourself: `sudo -u ubuntu /opt/tikrr/backend/vps/run-mail.sh daily --uid <your uid> --to <your email>`. in Gmail, "show original" should show `List-Unsubscribe` and pass SPF/DKIM.
6. install the timers: `sudo /opt/tikrr/backend/vps/install-mail-timers.sh` (refuses unless step 3 is done). check with `systemctl list-timers 'tikrr-mail-*'` and `journalctl -u tikrr-mail-daily -n 50`.

## rollback

1. `sudo systemctl disable --now tikrr-mail-{daily,weekly,alerts,lifecycle}.timer`
2. remove `MAIL_V2_ACTIVE` from `/etc/tikrr/backend.env` (old emails resume on their next run)
3. remove `MAIL_V2_ACTIVE` from Vercel and redeploy (web Pro welcome resumes)

keep `EMAIL_UNSUBSCRIBE_SECRET` set so links in emails already sent keep working. heads up: the old weekly only obeys the daily switch, so someone who stopped just the weekly would get the old one again after a rollback.

## needs your yes

- **the cutover itself.** it turns on email for about 140 Free accounts that get nothing today, and a one-time burst of "we miss you" emails on the first lifecycle run.
- **sender domain.** we still send from a gmail.com address through Brevo, which fails DMARC at Gmail and Yahoo. authenticate stocksbrew.online in Brevo and set `STOCKSBREW_FROM_EMAIL` before the bulk daily goes out, or a lot of it lands in spam.
- **postal address in the footer.** US commercial email (CAN-SPAM) needs a physical mailing address. the footer has none. give me one (a PO box works) and it goes in `backend/mail/kit.py`.
- **the leftover old alerts.** power trades and automatic Radar alerts still send from the old code after cutover. the plan said fold or drop them. keep, or gate them behind `MAIL_V2_ACTIVE` too?
- **limit-reached email.** written, not wired. want it hooked into the agent and alert limits?
