import chalk from "chalk";
import type { DeckStat } from "./vectorstore.js";
import { describeModel, type ModelConfig } from "./model.js";

const STAR_WIDTH = 17;
const starBlue = chalk.hex("#5fadff");

const STAR = [
  "       .  ✦",
  "      /^\\",
  " .---'   '---.",
  " '-. ● ‿ ● .-'",
  "   /       \\",
  "  /_.-¯¯¯-._\\",
  "  ˚        ✧",
];

const MAX_DECKS_SHOWN = 3;

function formatDecks(decks: DeckStat[]): string {
  if (decks.length === 0) return chalk.dim("none ingested yet");

  const shown = decks
    .slice(0, MAX_DECKS_SHOWN)
    .map((d) => `${d.deck} (${d.count.toLocaleString()})`)
    .join(chalk.dim(" · "));
  const more = decks.length - MAX_DECKS_SHOWN;
  return more > 0 ? `${shown}${chalk.dim(` +${more} more`)}` : shown;
}

export interface BannerInfo {
  cardCount: number;
  decks: DeckStat[];
  model: ModelConfig;
}

export function printBanner(info: BannerInfo): void {
  const label = (s: string) => chalk.dim(s.padEnd(8));

  const lines = [
    chalk.bold("anki-tomodachi") + chalk.dim("  友達"),
    "",
    label("cards") + info.cardCount.toLocaleString(),
    label("decks") + formatDecks(info.decks),
    label("model") + describeModel(info.model),
    label("help") + chalk.dim("/help for commands"),
  ];

  console.log();
  for (let i = 0; i < Math.max(STAR.length, lines.length); i++) {
    const art = (STAR[i] ?? "").padEnd(STAR_WIDTH);
    console.log(`  ${starBlue(art)}  ${lines[i] ?? ""}`);
  }
  console.log();
}
