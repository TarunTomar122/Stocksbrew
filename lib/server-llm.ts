export type LlmProvider = "openai";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_DEFAULT_MODEL = "gpt-5.6-luna";

function clean(value: string | undefined): string {
  return (value || "").trim();
}

export function llmProvider(): LlmProvider {
  return "openai";
}

export function llmApiKey(): string {
  return clean(process.env.OPENAI_API_KEY);
}

export function llmApiUrl(): string {
  return OPENAI_API_URL;
}

export function llmModel(defaultModel?: string): string {
  const requested = clean(process.env.LLM_MODEL) || clean(process.env.OPENAI_MODEL) || defaultModel || OPENAI_DEFAULT_MODEL;
  if (requested.toLowerCase().startsWith("openai/")) return requested.slice("openai/".length);
  if (requested.includes("/") || requested.toLowerCase().startsWith("gpt-oss")) return OPENAI_DEFAULT_MODEL;
  return requested;
}

export function llmHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

export function llmMissingKeyError(): string {
  return "OPENAI_API_KEY is required";
}
