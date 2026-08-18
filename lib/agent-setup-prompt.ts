export const AGENT_SETUP_PROMPT = `Connect to Stocksbrew's remote MCP server:

https://www.stocksbrew.online/api/mcp

Use OAuth. After connecting, verify the setup by showing my Watchlist and its latest changes.

Stocksbrew gives you five kinds of read access:
1. My Watchlist and holdings: use get_my_radar and get_radar_changes.
2. Explore: use get_explore for the Explore page's trending, heat, 52-week, Reddit and Trump sections.
3. Market history: use get_market_history for the last seven published US Market Daily editions (or a shorter window); if fewer are available, say "not enough current evidence".
4. Full stock detail: use get_stock_detail for the stock page's facts, financial history, valuation, balance sheet, dividends, business mix, institutions, price history, technicals, AI business questions, earnings, news and Reddit context.
5. Screens: use get_screens for Stocksbrew's curated thematic screen catalog and matches.

When I ask about a stock, call get_stock_intelligence for a concise current read. Call get_stock_detail when I ask for the full stock page or deeper evidence. If a field is missing, say "not enough current evidence"; never fill gaps with an invented thesis. If detailed research is missing, explain what data is available and ask before using add_to_radar to queue or refresh research. Recheck the stock later when research is queued or running.

You may read my Watchlist and alerts. Ask for my confirmation before adding or removing a Watchlist stock, or creating or deleting a price alert. Use get_radar_changes for earnings, RSI, call, anomaly and news updates. Never place trades or claim Stocksbrew can access a brokerage.

If you cannot add the server automatically, give me the exact setup steps for this client. Never ask me to paste an access token into chat.`;
