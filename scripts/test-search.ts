import chalk from "chalk";
import {
  searchCards,
  getOrCreateCollection,
  getCollectionStats,
} from "../src/vectorstore.js";

async function main() {
  const stats = await getCollectionStats();
  console.log(
    chalk.bold(`\nCollection: ${stats.count.toLocaleString()} documents\n`),
  );

  const queries = ["食べる", "撤回", "N1 grammar", "causative passive"];

  for (const query of queries) {
    console.log(chalk.cyan(`Search: "${query}"`));
    const results = await searchCards(query, { limit: 3 });
    for (const r of results) {
      const preview = r.text.slice(0, 80) + (r.text.length > 80 ? "…" : "");
      console.log(`  ${chalk.green(r.metadata.deck)} | ${preview}`);
    }
    console.log();
  }
}

main();
