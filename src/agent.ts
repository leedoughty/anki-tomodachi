import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MemorySaver } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import {
  searchCardsTool,
  findGapsTool,
  cardStatsTool,
  analyseTextTool,
} from "./tools.js";
import { SYSTEM_PROMPT } from "./prompts.js";
import { createModel, defaultModelConfig, type ModelConfig } from "./model.js";

export interface AgentOptions {
  checkpointSaver?: MemorySaver;
  model?: ModelConfig;
}

export function createAgent(options?: AgentOptions) {
  const model = createModel(options?.model ?? defaultModelConfig());

  return createReactAgent({
    llm: model,
    tools: [searchCardsTool, findGapsTool, cardStatsTool, analyseTextTool],
    messageModifier: SYSTEM_PROMPT,
    ...(options?.checkpointSaver
      ? { checkpointSaver: options.checkpointSaver }
      : {}),
  });
}

export async function invokeAgent(
  agent: ReturnType<typeof createAgent>,
  message: string,
): Promise<string> {
  const result = await agent.invoke({
    messages: [new HumanMessage(message)],
  });

  const messages = result.messages;
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage) return "";

  return typeof lastMessage.content === "string"
    ? lastMessage.content
    : JSON.stringify(lastMessage.content);
}
