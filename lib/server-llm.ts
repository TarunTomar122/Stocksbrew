export type LlmProvider = "openai" | "cerebras";

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_DEFAULT_MODEL = "gpt-4.1-mini";
const CEREBRAS_API_URL = "https://api.cerebras.ai/v1/chat/completions";
const CEREBRAS_DEFAULT_MODEL = "gpt-oss-120b";

function clean(value: string | undefined): string {
  return (value || "").trim();
}

export function llmProvider(): LlmProvider {
  const explicit = clean(process.env.LLM_PROVIDER).toLowerCase();
  if (explicit === "cerebras") return "cerebras";
  if (explicit === "openai") return "openai";

  const hasCerebras = Boolean(clean(process.env.CEREBRAS_API_KEY));
  const hasOpenAI = Boolean(clean(process.env.OPENAI_API_KEY));
  return hasCerebras && !hasOpenAI ? "cerebras" : "openai";
}

export function llmApiKey(): string {
  const explicit = clean(process.env.LLM_API_KEY);
  if (explicit) return explicit;
  return llmProvider() === "cerebras"
    ? clean(process.env.CEREBRAS_API_KEY)
    : clean(process.env.OPENAI_API_KEY);
}

export function llmApiUrl(): string {
  const explicit = clean(process.env.LLM_API_URL);
  if (explicit) return explicit;
  return llmProvider() === "cerebras"
    ? clean(process.env.CEREBRAS_API_URL) || CEREBRAS_API_URL
    : OPENAI_API_URL;
}

export function llmModel(defaultModel?: string): string {
  const explicit = clean(process.env.LLM_MODEL);
  if (explicit) return explicit;
  if (llmProvider() === "cerebras") {
    return clean(process.env.CEREBRAS_MODEL) || defaultModel || CEREBRAS_DEFAULT_MODEL;
  }
  return clean(process.env.OPENAI_MODEL) || defaultModel || OPENAI_DEFAULT_MODEL;
}

export function llmHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

export function llmMissingKeyError(): string {
  return "LLM_API_KEY, CEREBRAS_API_KEY, or OPENAI_API_KEY is required";
}
