# stocksbrew: facts for SEO and AI answers

Checked 2026-11-11. Each fact names where it comes from. If a fact here and its
source disagree, the source wins; fix this file.

| Fact | Value | Source |
|---|---|---|
| What it is | Research app for US-listed stocks with an investing agent. Not a broker; cannot place trades | `lib/docs/content/start.ts` (what-stocksbrew-is) |
| The call | Buy more / Keep / Sell some, dated, with a short reason and what would change it | `lib/plain-copy.ts` `CALL_PLAIN`; `components/stock-report/report.tsx` |
| Call coverage | "more than 700 US stocks" (726 of 796 screener rows had a call on 2026-11-11) | `lib/brand-copy.ts` `CALL_COVERAGE` |
| How calls are made | Fixed scoring rule over a model-written evidence summary | `/docs/methodology/calls-and-zones` |
| Free plan | The call on every stock we cover; full report on 3 stocks (5 when `PAYWALL_V2` is off); 1 agent (2 off); 3 Ask questions a day; 3 long reports a month; 5 price alerts | `lib/entitlements.ts`, `lib/paywall-flag.ts`; live pages say "three" (seen on /stock/NVDA 2026-11-11) |
| Pro price | $19 a month or $190 a year, USD | `lib/pricing.ts` |
| Trial | 3-day free trial at US checkout, card required, one per account | `lib/pricing.ts` `US_PRO_TRIAL_DAYS`; `app/api/subscription/create-checkout/route.ts` |
| Data sources | Yahoo Finance prices (batched, not real time), SEC EDGAR, Nasdaq earnings calendar, Clerk of the House, market data vendors | `/docs/methodology/data-sources` |
| Not advice | "Our view, not advice." on every call | stock page call block |
| Stock pages | indexable at /stock/{TICKER} (680 in the stocks sitemap per the 2026-11-11 audit, not rechecked here); noindex without a call in 60 days or a price in 10 | `lib/seo/stock-pages.ts` `stockHasCurrentRead` |
| Product comparisons | 12 at /docs/compare/stocksbrew-vs-*; competitor prices checked 2026-11-11 (Seeking Alpha, Morningstar, Prospero, Danelfin not checked) | `lib/compare-data.ts` `PRICE_CHECKS` |
| What AI engines read | /llms.txt, generated from the files above | `lib/llms.ts` (test: `lib/llms.test.ts`) |
| Structured data | Organization, WebSite, WebApplication with an AggregateOffer (Free $0, Pro $19/mo, $190/yr). No FAQ, HowTo or review markup | `app/layout.tsx` |
| Sitemaps | Index at /sitemap.xml, one file per family under /sitemaps/ | `lib/seo/sitemap.ts` |
| IndexNow | Key file /stocksbrew-seo-2026.txt; stock pages sent after the evening run | `lib/seo/indexnow.ts`, `backend/scripts/research_daily_anomaly_reasons.py` |
| Signup source | "How did you hear about us?" stored as `heard_about_us` | `docs/analytics.md` |

Not checked: Bing Webmaster Tools status, Search Console coverage numbers,
search volumes for any query.
