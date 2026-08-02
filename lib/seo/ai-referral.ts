const AI_REFERRERS: Array<[string, string]> = [
  ["chatgpt.com", "chatgpt"],
  ["chat.openai.com", "chatgpt"],
  ["perplexity.ai", "perplexity"],
  ["www.perplexity.ai", "perplexity"],
  ["copilot.microsoft.com", "microsoft_copilot"],
  ["gemini.google.com", "google_gemini"],
  ["claude.ai", "claude"],
];

export function identifyAiReferrer(referrer: string | null | undefined): string | null {
  if (!referrer) return null;
  try {
    const hostname = new URL(referrer).hostname.toLowerCase();
    return AI_REFERRERS.find(([domain]) => hostname === domain || hostname.endsWith(`.${domain}`))?.[1] ?? null;
  } catch {
    return null;
  }
}
