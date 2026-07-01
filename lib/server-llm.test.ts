import { afterEach, describe, expect, it } from "vitest";

import { llmApiKey, llmApiUrl, llmModel, llmProvider } from "@/lib/server-llm";

const ORIGINAL_ENV = { ...process.env };
const LLM_ENV_KEYS = [
  "LLM_PROVIDER",
  "LLM_API_KEY",
  "LLM_API_URL",
  "LLM_MODEL",
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
  it("uses Cerebras when LLM_PROVIDER is cerebras", () => {
    setLlmEnv({
      LLM_PROVIDER: "cerebras",
      CEREBRAS_API_KEY: "cerebras-key",
      CEREBRAS_MODEL: "gpt-oss-120b",
      OPENAI_API_KEY: "openai-key",
    });

    expect(llmProvider()).toBe("cerebras");
    expect(llmApiKey()).toBe("cerebras-key");
    expect(llmApiUrl()).toBe("https://api.cerebras.ai/v1/chat/completions");
    expect(llmModel()).toBe("gpt-oss-120b");
  });

  it("auto-selects Cerebras when only CEREBRAS_API_KEY is present", () => {
    setLlmEnv({
      CEREBRAS_API_KEY: "cerebras-key",
    });

    expect(llmProvider()).toBe("cerebras");
    expect(llmApiKey()).toBe("cerebras-key");
    expect(llmModel()).toBe("gpt-oss-120b");
  });

  it("lets explicit LLM_* env override provider defaults", () => {
    setLlmEnv({
      LLM_PROVIDER: "cerebras",
      LLM_API_KEY: "explicit-key",
      LLM_API_URL: "https://example.test/v1/chat/completions",
      LLM_MODEL: "custom-model",
      CEREBRAS_API_KEY: "cerebras-key",
    });

    expect(llmApiKey()).toBe("explicit-key");
    expect(llmApiUrl()).toBe("https://example.test/v1/chat/completions");
    expect(llmModel()).toBe("custom-model");
  });
});
