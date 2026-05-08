import ora from "ora";
import chalk from "chalk";
import { ingestCards } from "../src/ingest.js";

async function main(): Promise<void> {
  console.log(chalk.bold("\nanki-tomodachi — Card Ingestion\n"));

  const spinner = ora("Finding notes in Anki...").start();

  try {
    const summary = await ingestCards({
      onNoteIds(count) {
        spinner.text = `Fetching ${count.toLocaleString()} notes...`;
      },
      onNotesFetched(count) {
        spinner.text = `Fetched ${count.toLocaleString()} notes. Getting card data...`;
      },
      onCardsFetched(count) {
        spinner.text = `${count.toLocaleString()} cards fetched. Building documents...`;
      },
      onDocumentsBuilt(count) {
        spinner.text = `Embedding ${count.toLocaleString()} documents into ChromaDB...`;
      },
    });

    spinner.succeed("Ingestion complete!");
    console.log();
    console.log(
      `  Notes ingested:  ${chalk.green(summary.totalNotes.toLocaleString())}`,
    );
    console.log(
      `  Cards processed: ${chalk.green(summary.totalCards.toLocaleString())}`,
    );
    console.log(
      `  Duration:        ${chalk.cyan((summary.duration / 1000).toFixed(1))}s`,
    );
    console.log();
  } catch (error) {
    spinner.fail("Ingestion failed");
    if (error instanceof Error) {
      console.error(chalk.red(`\n  ${error.message}`));
      if (
        error.message.includes("ECONNREFUSED") &&
        error.message.includes("8765")
      ) {
        console.error(
          chalk.yellow(
            "\n  Is Anki running with AnkiConnect? (Anki → Tools → Add-ons → AnkiConnect)",
          ),
        );
      }
      if (
        error.message.includes("ECONNREFUSED") &&
        error.message.includes("8000")
      ) {
        console.error(
          chalk.yellow(
            "\n  Is ChromaDB running? (docker run -p 8000:8000 chromadb/chroma)",
          ),
        );
      }
    }
    console.log();
    process.exit(1);
  }
}

main();
