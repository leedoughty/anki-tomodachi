import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import * as readline from "readline";
import chalk from "chalk";
import ora from "ora";
import { HumanMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph";
import { createAgent } from "./agent.js";
import { printBanner } from "./banner.js";
import { getCollectionStats, getDeckStats } from "./vectorstore.js";
import { ingestCards } from "./ingest.js";
import {
  ANTHROPIC_MODELS,
  defaultModelConfig,
  describeModel,
  fetchOllamaModels,
  parseModelSpec,
  type ModelConfig,
} from "./model.js";

// Load the repo-root .env regardless of the caller's working directory.
dotenv.config({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
  quiet: true,
});

async function selectModel(): Promise<ModelConfig> {
  const current = defaultModelConfig();
  if (!process.stdin.isTTY) return current;

  const options: ModelConfig[] = [current];
  for (const model of ANTHROPIC_MODELS) {
    if (current.provider === "anthropic" && current.name === model.name)
      continue;
    options.push(model);
  }
  for (const name of await fetchOllamaModels()) {
    if (current.provider === "ollama" && current.name === name) continue;
    options.push({ provider: "ollama", name });
  }

  console.log(chalk.dim("\n  Select model:"));
  options.forEach((opt, i) => {
    const marker = i === 0 ? chalk.dim(" (default)") : "";
    console.log(`    ${i + 1}. ${describeModel(opt)}${marker}`);
  });
  console.log(
    chalk.dim("    or type a custom spec, e.g. openai/gpt-4o, ollama/llama3.1"),
  );

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = await new Promise<string>((resolve) =>
    rl.question(chalk.cyan("\n  model [1] > "), (a) => resolve(a.trim())),
  );
  rl.close();

  if (!answer) return current;

  const num = Number(answer);
  if (Number.isInteger(num) && num >= 1 && num <= options.length) {
    return options[num - 1] ?? current;
  }

  try {
    return parseModelSpec(answer);
  } catch (error) {
    console.log(
      chalk.yellow(
        `  ${error instanceof Error ? error.message : "Invalid choice."} Using default.`,
      ),
    );
    return current;
  }
}

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
    /quit     Exit (alias /exit)
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

  const model = await selectModel();

  let decks: Awaited<ReturnType<typeof getDeckStats>> = [];
  try {
    decks = await getDeckStats();
  } catch {
    // banner still renders without deck breakdown
  }

  printBanner({ cardCount, decks, model });

  const agent = createAgent({ checkpointSaver: new MemorySaver(), model });
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
