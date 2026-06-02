# SEO gap ship checklist (2026-05-25)

Verify before publishing all four gap pages:

1. **Meta length** — each post title ≤ 60 chars, description ≤ 155 chars (check `/blog/[slug]` in browser tab + OG debugger).
2. **JSON-LD** — Article + FAQPage + BreadcrumbList present on all 4 slugs (Rich Results Test).
3. **Internal links** — each article has ≥ 4 outgoing links to `/watchlist`, `/subscribe`, `/should-i-buy`, `/learn`, or other blog posts.
4. **Cross-links in** — hub linked from `/blog`, `/learn`; Finviz post links to Tickertape + hub.
5. **Sitemap** — posts auto-included via `allBlogPosts` in `app/sitemap.xml/route.ts`.
6. **Accessibility** — prose headings hierarchical; `[NEEDS: visual]` assets replaced with alt text before launch.
7. **Legal** — disclaimer lines on comparison/tool pages; no fabricated pricing (Tickertape uses tickertape.in/pricing).
8. **IndexNow / GSC** — submit URLs after deploy: `/blog/stocksbrew-vs-tickertape`, `/blog/stock-research-use-cases`, `/blog/free-should-i-buy-stock-checker`, `/blog/stock-research-guide-hub`.

## Primary KPIs (60 days, one per page)

| Slug | KPI |
|------|-----|
| `stocksbrew-vs-tickertape` | 120 organic clicks |
| `stock-research-use-cases` | 8 indexed use-case URLs live |
| `free-should-i-buy-stock-checker` | 200 Should I Buy runs from organic |
| `stock-research-guide-hub` | 3+ internal clicks/session to money URLs |
