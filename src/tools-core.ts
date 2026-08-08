import { z } from "zod";
import { searchCards, getAllCards } from "./vectorstore.js";
import type { SearchResult, CardMetadata } from "./types.js";
import n1Grammar from "../data/n1_grammar.json";

const KNOWN_DISTANCE = 1.5;

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

export function extractKanjiCompounds(text: string): string[] {
  const matches = text.match(/[一-鿿㐀-䶿]{2,}/g);
  return [...new Set(matches ?? [])];
}

export function computeStats(
  cards: Array<{ text: string; metadata: CardMetadata }>,
) {
  const total = cards.length;
  if (total === 0) return "No cards found.";

  const byType: Record<string, number> = {};
  const byDeck: Record<string, number> = {};
  let easeSum = 0;
  let intervalSum = 0;

  for (const c of cards) {
    byType[c.metadata.cardType] = (byType[c.metadata.cardType] ?? 0) + 1;
    byDeck[c.metadata.deck] = (byDeck[c.metadata.deck] ?? 0) + 1;
    easeSum += c.metadata.ease;
    intervalSum += c.metadata.interval;
  }

  const sorted = [...cards];
  sorted.sort((a, b) => a.metadata.ease - b.metadata.ease);
  const weakest = sorted.slice(0, 10);

  sorted.sort((a, b) => b.metadata.lapses - a.metadata.lapses);
  const leeches = sorted.filter((c) => c.metadata.lapses > 0).slice(0, 10);

  const lines: string[] = [];
  lines.push(`Total cards: ${total}`);
  lines.push(`Average ease: ${Math.round(easeSum / total)}`);
  lines.push(`Average interval: ${Math.round(intervalSum / total)} days\n`);

  lines.push("By type:");
  for (const [type, count] of Object.entries(byType).sort(
    (a, b) => b[1] - a[1],
  )) {
    lines.push(`  ${type}: ${count}`);
  }

  lines.push("\nBy deck:");
  for (const [deck, count] of Object.entries(byDeck).sort(
    (a, b) => b[1] - a[1],
  )) {
    lines.push(`  ${deck}: ${count}`);
  }

  if (leeches.length > 0) {
    lines.push("\nTop leeches (most lapses):");
    for (const c of leeches) {
      const preview = c.text.slice(0, 60);
      lines.push(
        `  lapses: ${c.metadata.lapses} | ease: ${c.metadata.ease} | ${preview}`,
      );
    }
  }

  lines.push("\nWeakest cards (lowest ease):");
  for (const c of weakest) {
    const preview = c.text.slice(0, 60);
    lines.push(
      `  ease: ${c.metadata.ease} | lapses: ${c.metadata.lapses} | ${preview}`,
    );
  }

  return lines.join("\n");
}

export const searchCardsShape = {
  query: z
    .string()
    .describe(
      "Search query — a word, kanji, meaning, or topic in Japanese or English",
    ),
  limit: z.number().optional().default(10).describe("Max results to return"),
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
    .describe("Minimum interval in days — higher interval means better known"),
};

export async function searchCardsReport(
  input: z.infer<z.ZodObject<typeof searchCardsShape>>,
): Promise<string> {
  const results = await searchCards(input.query, {
    limit: input.limit,
    deck: input.deck,
    cardType: input.cardType,
    maxEase: input.maxEase,
    minInterval: input.minInterval,
  });
  return formatResults(results, input.query);
}

export const findGapsShape = {
  category: z
    .enum(["grammar", "vocabulary"])
    .describe("What to check gaps for"),
  level: z.string().default("N1").describe("JLPT level to compare against"),
};

export async function findGapsReport(
  input: z.infer<z.ZodObject<typeof findGapsShape>>,
): Promise<string> {
  if (input.category === "vocabulary") {
    return "Vocabulary gap analysis is not yet available. Only grammar comparison is supported (N1 grammar reference list).";
  }

  const allCards = await getAllCards();
  const allTexts = allCards.map((c) => c.text).join("\n");

  const gaps: Array<{ pattern: string; meaning: string }> = [];
  const found: Array<{ pattern: string; meaning: string }> = [];

  for (const item of n1Grammar) {
    const normalized = item.pattern.replace(/[〜～]/g, "");
    if (allTexts.includes(normalized)) {
      found.push(item);
    } else {
      gaps.push(item);
    }
  }

  const lines: string[] = [];
  lines.push(
    `${input.level} Grammar Gap Analysis:\n`,
    `In deck: ${found.length}/${n1Grammar.length} patterns`,
    `Missing: ${gaps.length}\n`,
  );

  if (found.length > 0) {
    lines.push("Known patterns:");
    for (const f of found) {
      lines.push(`  ✓ ${f.pattern} — ${f.meaning}`);
    }
    lines.push("");
  }

  if (gaps.length > 0) {
    lines.push("Missing patterns:");
    for (const g of gaps) {
      lines.push(`  ✗ ${g.pattern} — ${g.meaning}`);
    }
  }

  return lines.join("\n");
}

export const cardStatsShape = {
  query: z
    .string()
    .optional()
    .describe(
      "Optional topic filter — if provided, only analyses cards matching this topic",
    ),
};

export async function cardStatsReport(
  input: z.infer<z.ZodObject<typeof cardStatsShape>>,
): Promise<string> {
  let cards: Array<{ text: string; metadata: CardMetadata }>;

  if (input.query) {
    const results = await searchCards(input.query, { limit: 100 });
    cards = results.map((r) => ({ text: r.text, metadata: r.metadata }));
  } else {
    cards = await getAllCards();
  }

  const header = input.query
    ? `Study Statistics (filtered: "${input.query}"):\n`
    : "Study Statistics:\n";

  return header + computeStats(cards);
}

export const analyseTextShape = {
  text: z.string().describe("The Japanese text to analyse"),
};

export async function analyseTextReport(
  input: z.infer<z.ZodObject<typeof analyseTextShape>>,
): Promise<string> {
  const kanjiWords = extractKanjiCompounds(input.text);

  const foundInDeck: Array<{ word: string; cards: SearchResult[] }> = [];
  const notFound: string[] = [];

  const searchWords = kanjiWords.slice(0, 15);
  for (const word of searchWords) {
    const results = await searchCards(word, { limit: 3 });
    const hasMatch = results.some(
      (r) => r.text.includes(word) && r.distance < KNOWN_DISTANCE,
    );
    if (hasMatch) {
      foundInDeck.push({
        word,
        cards: results.filter((r) => r.text.includes(word)),
      });
    } else {
      notFound.push(word);
    }
  }

  const semanticResults = await searchCards(input.text, { limit: 5 });

  const lines: string[] = [];
  lines.push(`Text Analysis:\n`);
  lines.push(
    `Input: ${input.text.slice(0, 100)}${input.text.length > 100 ? "..." : ""}\n`,
  );
  lines.push(`Kanji compounds found: ${kanjiWords.length}`);
  lines.push(`Checked: ${searchWords.length}\n`);

  if (foundInDeck.length > 0) {
    lines.push("Known words (in deck):");
    for (const { word, cards } of foundInDeck) {
      const card = cards[0]!;
      lines.push(
        `  ✓ ${word} — ${card.metadata.deck} | interval: ${card.metadata.interval}d`,
      );
    }
    lines.push("");
  }

  if (notFound.length > 0) {
    lines.push("Unknown words (not in deck):");
    for (const word of notFound) {
      lines.push(`  ✗ ${word}`);
    }
    lines.push("");
  }

  if (semanticResults.length > 0) {
    lines.push("Related cards (semantic match):");
    for (const r of semanticResults) {
      const preview = r.text.slice(0, 60);
      lines.push(`  ${preview}`);
    }
  }

  return lines.join("\n");
}

export interface WordVerdict {
  word: string;
  known: boolean;
  evidence?: string;
}

export const checkKnownShape = {
  words: z
    .array(z.string())
    .describe(
      "Exact surface forms to check against the deck, e.g. ['丸投げ','突き当たり','孵化']",
    ),
};

export async function checkWordsKnown(words: string[]): Promise<WordVerdict[]> {
  const verdicts: WordVerdict[] = [];

  for (const word of words) {
    const results = await searchCards(word, { limit: 5 });
    const hit = results.find(
      (r) => r.text.includes(word) && r.distance < KNOWN_DISTANCE,
    );
    verdicts.push(
      hit
        ? {
            word,
            known: true,
            evidence: `${hit.text.slice(0, 60)} (${hit.metadata.deck}, interval ${hit.metadata.interval}d)`,
          }
        : { word, known: false },
    );
  }

  return verdicts;
}

export function formatWordVerdicts(verdicts: WordVerdict[]): string {
  const known = verdicts.filter((v) => v.known);
  const unknown = verdicts.filter((v) => !v.known);

  const lines: string[] = [
    `Checked ${verdicts.length} words: ${unknown.length} not in deck, ${known.length} already known.\n`,
  ];

  if (unknown.length > 0) {
    lines.push("NOT in deck (safe to card):");
    for (const v of unknown) lines.push(`  ✗ ${v.word}`);
    lines.push("");
  }

  if (known.length > 0) {
    lines.push("ALREADY in deck (do not card):");
    for (const v of known) lines.push(`  ✓ ${v.word} — ${v.evidence}`);
  }

  return lines.join("\n");
}

export async function checkKnownReport(
  input: z.infer<z.ZodObject<typeof checkKnownShape>>,
): Promise<string> {
  return formatWordVerdicts(await checkWordsKnown(input.words));
}
