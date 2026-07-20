export const AGENT_SETUP_PROMPT = `Connect yourself to Stocksbrew using its remote MCP server:

https://www.stocksbrew.online/api/mcp

Use OAuth and open the Stocksbrew sign-in and approval flow for me. Request read-only access to stocks, market context, and my Radar. After connecting, verify the setup by searching for NVDA and reading its current Stocksbrew intelligence.

If you cannot add a remote MCP server automatically, give me the exact configuration steps for this client. Do not ask me to paste a personal access token into chat.`;
