import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelV3, LanguageModelV3Prompt, LanguageModelV3StreamPart } from "@ai-sdk/provider";
import type { LanguageModel } from "ai";

import { OFFLINE_NO_PLAN, planOffline, writeOffline } from "@/lib/ask-offline";
import { llmApiKey, llmApiUrl, llmModel } from "@/lib/server-llm";

/**
 * Which model answers in Ask.
 *
 * With `ANTHROPIC_API_KEY` set, Ask runs on Claude Haiku 5.5 (override with
 * `ASK_ANTHROPIC_MODEL`) at low effort, since it answers from tool results and
 * speed matters more than depth here. Otherwise it uses the same OpenAI
 * configuration as every other server call (`lib/server-llm.ts`). A checkout that only has an OpenRouter key talks to
 * the same model family through OpenRouter's OpenAI-compatible endpoint. A
 * checkout with no key at all, outside production, gets the offline planner
 * (`lib/ask-offline.ts`): fixed rules that pick tools and write from their
 * results, so the rest of the copilot can be run and tested. It is labelled
 * on the page and it never runs in production.
 */

const DEFAULT_MODEL = "gpt-5.6-luna";
const DEFAULT_ANTHROPIC_MODEL = "claude-haiku-5-5";

export type AskModel = {
  model: LanguageModel;
  /** For logs and for the "no language model" notice. */
  via: "anthropic" | "openai" | "openrouter" | "offline";
  providerOptions?:
    | { openai: { reasoningEffort: "low" } }
    | { anthropic: { effort: "low"; cacheControl: { type: "ephemeral" } } };
};

const NO_USAGE = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
};

function lastUserText(prompt: LanguageModelV3Prompt): { text: string; index: number } {
  for (let i = prompt.length - 1; i >= 0; i -= 1) {
    const message = prompt[i]!;
    if (message.role !== "user") continue;
    const text = message.content.map((part) => (part.type === "text" ? part.text : "")).join(" ").trim();
    return { text, index: i };
  }
  return { text: "", index: -1 };
}

function toolOutputsAfter(prompt: LanguageModelV3Prompt, index: number): unknown[] {
  const outputs: unknown[] = [];
  for (const message of prompt.slice(index + 1)) {
    if (message.role !== "tool") continue;
    for (const part of message.content) {
      if (part.type !== "tool-result") continue;
      const output = part.output;
      if (output.type === "json") outputs.push(output.value);
    }
  }
  return outputs;
}

function offlineParts(prompt: LanguageModelV3Prompt): LanguageModelV3StreamPart[] {
  const parts: LanguageModelV3StreamPart[] = [{ type: "stream-start", warnings: [] }];
  const { text: question, index } = lastUserText(prompt);
  const outputs = toolOutputsAfter(prompt, index);
  const say = (text: string) => {
    parts.push({ type: "text-start", id: "t1" });
    // A few words at a time, so the page streams the way it does with a model.
    for (const chunk of text.match(/\S+\s*/g) ?? [text]) parts.push({ type: "text-delta", id: "t1", delta: chunk });
    parts.push({ type: "text-end", id: "t1" });
    parts.push({ type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage: NO_USAGE });
  };
  if (outputs.length > 0) {
    say(writeOffline(outputs));
    return parts;
  }
  const plan = planOffline(question);
  if (plan.length === 0) {
    say(OFFLINE_NO_PLAN);
    return parts;
  }
  plan.forEach((call, i) => {
    parts.push({ type: "tool-call", toolCallId: `offline-${Date.now().toString(36)}-${i}`, toolName: call.tool, input: JSON.stringify(call.input) });
  });
  parts.push({ type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage: NO_USAGE });
  return parts;
}

/** A stand-in "model" driven by the offline planner. Development only. */
export function offlineAskModel(): LanguageModelV3 {
  return {
    specificationVersion: "v3",
    provider: "stocksbrew-offline",
    modelId: "rule-planner",
    supportedUrls: {},
    async doGenerate() {
      throw new Error("The offline planner only streams.");
    },
    async doStream(options) {
      const parts = offlineParts(options.prompt);
      return {
        stream: new ReadableStream<LanguageModelV3StreamPart>({
          async start(controller) {
            for (const part of parts) {
              if (part.type === "text-delta") await new Promise((resolve) => setTimeout(resolve, 12));
              controller.enqueue(part);
            }
            controller.close();
          },
        }),
      };
    },
  };
}

export function askModel(): AskModel | null {
  const anthropicKey = (process.env.ANTHROPIC_API_KEY || "").trim();
  if (anthropicKey) {
    const provider = createAnthropic({ apiKey: anthropicKey });
    const model = (process.env.ASK_ANTHROPIC_MODEL || "").trim() || DEFAULT_ANTHROPIC_MODEL;
    // cacheControl turns on automatic caching, so each tool step in one answer reads the steps before it
    // from cache. The route also marks the system prompt, so separate questions share the tools and prompt.
    return { model: provider(model), via: "anthropic", providerOptions: { anthropic: { effort: "low", cacheControl: { type: "ephemeral" } } } };
  }
  const providerOptions = { openai: { reasoningEffort: "low" as const } };
  const openaiKey = llmApiKey();
  if (openaiKey) {
    const provider = createOpenAI({ baseURL: llmApiUrl().replace(/\/chat\/completions$/, ""), apiKey: openaiKey });
    return { model: provider(llmModel(DEFAULT_MODEL)), via: "openai", providerOptions };
  }
  const openrouterKey = (process.env.OPENROUTER_API_KEY || "").trim();
  if (openrouterKey) {
    const provider = createOpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey: openrouterKey, name: "openrouter" });
    const model = (process.env.ASK_OPENROUTER_MODEL || "").trim() || `openai/${DEFAULT_MODEL}`;
    // OpenRouter speaks chat completions, not the Responses API.
    return { model: provider.chat(model), via: "openrouter", providerOptions };
  }
  // No key. Production says so (503); anywhere else runs on fixed rules.
  if (process.env.NODE_ENV !== "production") {
    return { model: offlineAskModel(), via: "offline" };
  }
  return null;
}
