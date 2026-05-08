import "dotenv/config";
import chalk from "chalk";
import { createAgent } from "../src/agent.js";
import { HumanMessage } from "@langchain/core/messages";

async function main() {
  console.log(chalk.bold("\nanki-tomodachi — Agent Test\n"));

  const agent = createAgent();
  const question = process.argv[2] ?? "食べるに関連する言葉を教えて";

  console.log(chalk.cyan(`Question: ${question}\n`));

  const result = await agent.invoke({
    messages: [new HumanMessage(question)],
  });

  for (const msg of result.messages) {
    if (msg._getType() === "ai" && msg.content) {
      const aiMsg = msg as { content: unknown; tool_calls?: unknown[] };

      if (aiMsg.tool_calls && aiMsg.tool_calls.length > 0) {
        console.log(chalk.dim("Tool calls:"));
        for (const tc of aiMsg.tool_calls as Array<{
          name: string;
          args: Record<string, unknown>;
        }>) {
          console.log(chalk.dim(`  → ${tc.name}(${JSON.stringify(tc.args)})`));
        }
        console.log();
      }
    }

    if (msg._getType() === "tool") {
      const preview =
        typeof msg.content === "string"
          ? msg.content.slice(0, 200)
          : JSON.stringify(msg.content).slice(0, 200);
      console.log(chalk.dim(`  ← ${preview}...`));
      console.log();
    }
  }

  const lastMessage = result.messages[result.messages.length - 1];

  if (lastMessage) {
    console.log(chalk.green("Response:"));
    console.log(
      typeof lastMessage.content === "string"
        ? lastMessage.content
        : JSON.stringify(lastMessage.content),
    );
    console.log();
  }
}

main().catch(console.error);
