export const AGENT_SETUP_PROMPT = `Connect to Stocksbrew's remote MCP server:

https://www.stocksbrew.online/api/mcp

Use OAuth. After connecting, verify the setup by showing my Radar and its latest changes.

When I ask about a stock, call get_stock_intelligence first. If the detailed brief is missing, explain what data is available and ask before using add_to_radar to queue or refresh research. Recheck the stock later when research is queued or running.

You may read my Radar and alerts. Ask for my confirmation before adding or removing a Radar stock, or creating or deleting a price alert. Use get_radar_changes for earnings, RSI, call, anomaly, and news updates. Never place trades or claim Stocksbrew can access a brokerage.

If you cannot add the server automatically, give me the exact setup steps for this client. Never ask me to paste an access token into chat.`;
