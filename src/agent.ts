import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { MemorySaver } from "@langchain/langgraph";
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
