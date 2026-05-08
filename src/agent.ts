import { ChatAnthropic } from "@langchain/anthropic";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage } from "@langchain/core/messages";
import { searchCardsTool } from "./tools.js";
import { SYSTEM_PROMPT } from "./prompts.js";

export function createAgent() {
  const model = new ChatAnthropic({
    model: "claude-sonnet-4-6",
    temperature: 0,
  });

  return createReactAgent({
    llm: model,
    tools: [searchCardsTool],
    messageModifier: SYSTEM_PROMPT,
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
