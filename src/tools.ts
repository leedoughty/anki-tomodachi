import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { searchCards } from "./vectorstore.js";
import type { SearchResult } from "./types.js";

export function formatResults(results: SearchResult[], query: string): string {
  if (results.length === 0) {
    return `No cards found matching "${query}".`;
  }

  const lines = [`Found ${results.length} cards matching "${query}":\n`];

  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    lines.push(
      `[${i + 1}] ${r.metadata.deck} | ${r.metadata.cardType} | interval: ${r.metadata.interval}d | ease: ${r.metadata.ease} | lapses: ${r.metadata.lapses}`,
      r.text,
      "",
    );
  }

  return lines.join("\n");
}

export const searchCardsTool = tool(
  async (input) => {
    const results = await searchCards(input.query, {
      limit: input.limit,
      deck: input.deck,
      cardType: input.cardType,
      maxEase: input.maxEase,
      minInterval: input.minInterval,
    });
    return formatResults(results, input.query);
  },
  {
    name: "search_cards",
    description:
      "Search the user's Anki deck by meaning, reading, or kanji. Returns matching cards with their content and study metadata (interval, ease, lapses). Use this to check what the user knows before answering questions.",
    schema: z.object({
      query: z
        .string()
        .describe(
          "Search query — a word, kanji, meaning, or topic in Japanese or English",
        ),
      limit: z
        .number()
        .optional()
        .default(10)
        .describe("Max results to return"),
      deck: z.string().optional().describe("Filter by deck name"),
      cardType: z
        .enum(["vocabulary", "grammar", "kanji", "sentence"])
        .optional()
        .describe("Filter by card type"),
      maxEase: z
        .number()
        .optional()
        .describe(
          "Maximum ease factor — lower ease means the user struggles with these cards",
        ),
      minInterval: z
        .number()
        .optional()
        .describe(
          "Minimum interval in days — higher interval means better known",
        ),
    }),
  },
);
