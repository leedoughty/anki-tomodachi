import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  analyseTextReport,
  analyseTextShape,
  cardStatsReport,
  cardStatsShape,
  findGapsReport,
  findGapsShape,
  searchCardsReport,
  searchCardsShape,
} from "./tools-core.js";

export {
  computeStats,
  extractKanjiCompounds,
  formatResults,
} from "./tools-core.js";

export const searchCardsTool = tool(searchCardsReport, {
  name: "search_cards",
  description:
    "Search the user's Anki deck by meaning, reading, or kanji. Returns matching cards with their content and study metadata (interval, ease, lapses). Use this to check what the user knows before answering questions.",
  schema: z.object(searchCardsShape),
});

export const findGapsTool = tool(findGapsReport, {
  name: "find_gaps",
  description:
    "Compare the user's cards against a reference list (e.g., N1 grammar) and return what they know and what they're missing.",
  schema: z.object(findGapsShape),
});

export const cardStatsTool = tool(cardStatsReport, {
  name: "card_stats",
  description:
    "Get study statistics — weak areas (low ease), leeches (high lapses), card distribution by type and deck. Optionally filter by topic.",
  schema: z.object(cardStatsShape),
});

export const analyseTextTool = tool(analyseTextReport, {
  name: "analyse_text",
  description:
    "Analyse a Japanese passage. Extracts kanji compounds, checks which words the user knows (in deck) and which are new, and finds semantically related cards.",
  schema: z.object(analyseTextShape),
});
