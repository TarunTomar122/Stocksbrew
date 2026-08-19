import { AGENT_SETUP_PROMPT } from "@/lib/agent-setup-prompt";

export function buildWatchlistAiPrompt(ticker?: string): string {
  const focus = ticker
    ? `Give me a clear, plain-English overview of ${ticker}. Explain what the business does, how it makes money, what is changing now, what the market expects, and the biggest risks. Use current Stocksbrew evidence, avoid dumping raw numbers, and say "not enough current evidence" when a point is missing.`
    : `Review my Stocksbrew Watchlist and give me a clear, plain-English overview of what matters most right now. Separate holdings from watched stocks, call out meaningful changes and risks, and tell me what deserves attention. Use current Stocksbrew evidence, avoid dumping raw numbers, and say "not enough current evidence" when a point is missing.`;

  return `If Stocksbrew MCP is not connected yet, connect it first. If it is already connected, skip setup and continue.

${AGENT_SETUP_PROMPT}

Once connected, ${focus}`;
}
