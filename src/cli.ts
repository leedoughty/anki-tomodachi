import "dotenv/config";
import * as readline from "readline";
import chalk from "chalk";
import ora from "ora";
import { HumanMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";
import { createAgent } from "./agent.js";
import { getCollectionStats } from "./vectorstore.js";
import { ingestCards } from "./ingest.js";

async function handleSlashCommand(command: string): Promise<boolean> {
  switch (command) {
    case "/quit":
    case "/exit":
      console.log("\nじゃあね！");
      process.exit(0);

    case "/stats": {
      const stats = await getCollectionStats();
      console.log(`\n  Cards: ${chalk.green(stats.count.toLocaleString())}\n`);
      return true;
    }

    case "/ingest": {
      const spinner = ora("Ingesting cards...").start();
      try {
        const result = await ingestCards();
        spinner.succeed(
          `Ingested ${result.totalNotes.toLocaleString()} cards in ${(result.duration / 1000).toFixed(1)}s`,
        );
      } catch (error) {
        spinner.fail("Ingestion failed");
        console.error(
          chalk.red(error instanceof Error ? error.message : "Unknown error"),
        );
      }
      console.log();
      return true;
    }

    case "/help":
      console.log(`
  ${chalk.bold("Commands:")}
    /stats    Show deck statistics
    /ingest   Re-import cards from Anki
    /help     Show this help
    /quit     Exit
`);
      return true;

    default:
      return false;
  }
}

async function main(): Promise<void> {
  let cardCount = 0;
  try {
    const stats = await getCollectionStats();
    cardCount = stats.count;
  } catch {
    console.error(
      chalk.red(
        "\nCould not connect to ChromaDB. Is it running on localhost:8000?\n",
      ),
    );
    process.exit(1);
  }

  console.log(chalk.bold("\n友達 — anki-tomodachi"));
  console.log(chalk.dim(`${cardCount.toLocaleString()} cards loaded`));
  console.log(chalk.dim("Type /help for commands\n"));

  const agent = createAgent({ checkpointSaver: new MemorySaver() });
  const config = { configurable: { thread_id: "chat" } };

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const showPrompt = () => process.stdout.write(chalk.cyan("友達 > "));
  showPrompt();

  rl.on("line", async (line) => {
    const input = line.trim();
    if (!input) {
      showPrompt();
      return;
    }

    if (input.startsWith("/")) {
      const handled = await handleSlashCommand(input);
      if (!handled) {
        console.log(
          chalk.yellow(`Unknown command: ${input}. Type /help for commands.\n`),
        );
      }
      showPrompt();
      return;
    }

    rl.pause();

    try {
      const stream = agent.streamEvents(
        { messages: [new HumanMessage(input)] },
        { version: "v2", ...config },
      );

      let hasOutput = false;

      for await (const event of stream) {
        if (event.event === "on_tool_start") {
          let args = event.data?.input;
          if (args && typeof args === "object" && "input" in args) {
            try {
              args = JSON.parse(args.input as string);
            } catch {
              // keep original
            }
          }
          console.log(chalk.dim(`  → ${event.name}(${JSON.stringify(args)})`));
        }

        if (event.event === "on_chat_model_stream") {
          const chunk = event.data?.chunk;
          if (!chunk) continue;

          let text = "";
          if (typeof chunk.content === "string") {
            text = chunk.content;
          } else if (Array.isArray(chunk.content)) {
            for (const block of chunk.content as Array<{
              type: string;
              text?: string;
            }>) {
              if (block.type === "text" && block.text) {
                text += block.text;
              }
            }
          }

          if (text) {
            process.stdout.write(text);
            hasOutput = true;
          }
        }
      }

      if (hasOutput) console.log("\n");
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      console.error(chalk.red(`\nError: ${msg}\n`));
      if (msg.includes("api_key") || msg.includes("API key")) {
        console.error(
          chalk.yellow("Set ANTHROPIC_API_KEY in your .env file\n"),
        );
      }
    }

    rl.resume();
    showPrompt();
  });

  rl.on("close", () => {
    console.log("\nじゃあね！");
    process.exit(0);
  });
}

main().catch(console.error);
