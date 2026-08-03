import { afterEach, describe, expect, it } from "vitest";

import { llmApiKey, llmApiUrl, llmModel, llmProvider } from "@/lib/server-llm";

const ORIGINAL_ENV = { ...process.env };
const LLM_ENV_KEYS = [
  "LLM_PROVIDER",
  "LLM_MODEL",
  "OPENROUTER_API_KEY",
  "OPENROUTER_MODEL",
  "CEREBRAS_API_KEY",
  "CEREBRAS_API_URL",
  "CEREBRAS_MODEL",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
] as const;

function setLlmEnv(values: Record<string, string>) {
  for (const key of LLM_ENV_KEYS) {
    delete process.env[key];
  }
  Object.assign(process.env, values);
}

afterEach(() => {
  for (const key of LLM_ENV_KEYS) {
    if (ORIGINAL_ENV[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = ORIGINAL_ENV[key];
    }
  }
});

describe("server LLM provider", () => {
  it("ignores a legacy Cerebras provider and uses direct OpenAI", () => {
    setLlmEnv({
      LLM_PROVIDER: "cerebras",
      CEREBRAS_API_KEY: "cerebras-key",
      CEREBRAS_MODEL: "gpt-oss-120b",
      OPENAI_API_KEY: "openai-key",
    });

    expect(llmProvider()).toBe("openai");
    expect(llmApiKey()).toBe("openai-key");
    expect(llmApiUrl()).toBe("https://api.openai.com/v1/chat/completions");
    expect(llmModel()).toBe("gpt-5.6-luna");
  });

  it("does not fall back to a third-party key", () => {
    setLlmEnv({
      CEREBRAS_API_KEY: "cerebras-key",
    });

    expect(llmProvider()).toBe("openai");
    expect(llmApiKey()).toBe("");
    expect(llmModel()).toBe("gpt-5.6-luna");
  });

  it("normalizes stale router model names to Luna", () => {
    setLlmEnv({
      LLM_PROVIDER: "openrouter",
      LLM_MODEL: "qwen/qwen-2.5-7b-instruct",
      OPENROUTER_API_KEY: "router-key",
      OPENAI_API_KEY: "openai-key",
    });

    expect(llmProvider()).toBe("openai");
    expect(llmApiKey()).toBe("openai-key");
    expect(llmApiUrl()).toBe("https://api.openai.com/v1/chat/completions");
    expect(llmModel()).toBe("gpt-5.6-luna");
  });
});
