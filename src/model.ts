import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOllama } from "@langchain/ollama";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

export type Provider = "anthropic" | "ollama" | "openai";

export interface ModelConfig {
  provider: Provider;
  name: string;
  baseUrl?: string;
  apiKeyEnv?: string;
}

const DEFAULT_MODEL: ModelConfig = {
  provider: "anthropic",
  name: "claude-sonnet-4-6",
};

const OLLAMA_DEFAULT_URL = "http://localhost:11434";
const PROVIDERS: Provider[] = ["anthropic", "ollama", "openai"];

export function parseModelSpec(spec: string): ModelConfig {
  const slash = spec.indexOf("/");
  if (slash === -1) {
    throw new Error(
      `Invalid model "${spec}". Expected "provider/name" (e.g. ollama/qwen2.5:7b).`,
    );
  }

  const provider = spec.slice(0, slash);
  const name = spec.slice(slash + 1);

  if (!PROVIDERS.includes(provider as Provider)) {
    throw new Error(
      `Unknown provider "${provider}". Expected one of: ${PROVIDERS.join(", ")}.`,
    );
  }
  if (!name) {
    throw new Error(`Missing model name in "${spec}".`);
  }

  return { provider: provider as Provider, name };
}

export function defaultModelConfig(): ModelConfig {
  const spec = process.env.TOMODACHI_MODEL?.trim();
  return spec ? parseModelSpec(spec) : { ...DEFAULT_MODEL };
}

export function createModel(config: ModelConfig): BaseChatModel {
  switch (config.provider) {
    case "anthropic":
      return new ChatAnthropic({
        model: config.name,
        temperature: 0,
        ...(config.apiKeyEnv ? { apiKey: process.env[config.apiKeyEnv] } : {}),
      });

    case "ollama":
      return new ChatOllama({
        model: config.name,
        baseUrl: config.baseUrl ?? OLLAMA_DEFAULT_URL,
        temperature: 0,
      });

    case "openai":
      return new ChatOpenAI({
        model: config.name,
        temperature: 0,
        apiKey: process.env[config.apiKeyEnv ?? "OPENAI_API_KEY"],
        ...(config.baseUrl
          ? { configuration: { baseURL: config.baseUrl } }
          : {}),
      });
  }
}

export function describeModel(config: ModelConfig): string {
  return `${config.name} (${config.provider})`;
}

export async function fetchOllamaModels(
  baseUrl = OLLAMA_DEFAULT_URL,
): Promise<string[]> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`);
    if (!res.ok) return [];
    const data = (await res.json()) as { models?: { name: string }[] };
    return data.models?.map((m) => m.name) ?? [];
  } catch {
    return [];
  }
}
