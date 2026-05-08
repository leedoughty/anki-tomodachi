import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SearchResult } from "../src/types.js";

vi.mock("../src/vectorstore.js", () => ({
  searchCards: vi.fn(),
  getAllCards: vi.fn(),
  getOrCreateCollection: vi.fn(),
  getChromaClient: vi.fn(),
}));

import { searchCards, getAllCards } from "../src/vectorstore.js";
import {
  searchCardsTool,
  findGapsTool,
  cardStatsTool,
  analyseTextTool,
  formatResults,
  extractKanjiCompounds,
  computeStats,
} from "../src/tools.js";

const mockSearchCards = vi.mocked(searchCards);
const mockGetAllCards = vi.mocked(getAllCards);

const sampleResults: SearchResult[] = [
  {
    id: "1000",
    text: "食べる to eat",
    metadata: {
      noteId: 1000,
      deck: "Japanese::Vocabulary",
      tags: '["vocabulary"]',
      interval: 180,
      ease: 2500,
      lapses: 0,
      due: 1700000000,
      cardType: "vocabulary",
    },
    distance: 0.1,
  },
  {
    id: "1001",
    text: "食べまくる to eat a lot",
    metadata: {
      noteId: 1001,
      deck: "Japanese::Vocabulary",
      tags: '["vocabulary"]',
      interval: 30,
      ease: 2100,
      lapses: 2,
      due: 1699000000,
      cardType: "vocabulary",
    },
    distance: 0.3,
  },
];

beforeEach(() => {
  mockSearchCards.mockReset();
  mockGetAllCards.mockReset();
});

describe("formatResults", () => {
  it("formats results with metadata", () => {
    const output = formatResults(sampleResults, "食べる");
    expect(output).toContain('Found 2 cards matching "食べる"');
    expect(output).toContain("[1]");
    expect(output).toContain("[2]");
    expect(output).toContain("食べる to eat");
    expect(output).toContain("食べまくる to eat a lot");
    expect(output).toContain("interval: 180d");
    expect(output).toContain("ease: 2500");
    expect(output).toContain("lapses: 0");
  });

  it("handles empty results", () => {
    const output = formatResults([], "nonexistent");
    expect(output).toContain('No cards found matching "nonexistent"');
  });
});

describe("searchCardsTool", () => {
  it("calls searchCards with query and returns formatted text", async () => {
    mockSearchCards.mockResolvedValue(sampleResults);

    const result = await searchCardsTool.invoke({ query: "食べる" });

    expect(mockSearchCards).toHaveBeenCalledWith("食べる", {
      limit: 10,
      deck: undefined,
      cardType: undefined,
      maxEase: undefined,
      minInterval: undefined,
    });
    expect(result).toContain("食べる to eat");
  });

  it("passes filters through to searchCards", async () => {
    mockSearchCards.mockResolvedValue([]);

    await searchCardsTool.invoke({
      query: "grammar",
      cardType: "grammar",
      maxEase: 2000,
    });

    expect(mockSearchCards).toHaveBeenCalledWith("grammar", {
      limit: 10,
      deck: undefined,
      cardType: "grammar",
      maxEase: 2000,
      minInterval: undefined,
    });
  });

  it("handles empty results gracefully", async () => {
    mockSearchCards.mockResolvedValue([]);

    const result = await searchCardsTool.invoke({ query: "zzzzz" });
    expect(result).toContain("No cards found");
  });
});

describe("extractKanjiCompounds", () => {
  it("extracts multi-kanji sequences", () => {
    const result = extractKanjiCompounds("彼は約束を守る人だ");
    expect(result).toContain("約束");
  });

  it("skips single kanji", () => {
    const result = extractKanjiCompounds("彼は人だ");
    expect(result).toEqual([]);
  });

  it("deduplicates", () => {
    const result = extractKanjiCompounds("約束を守る。約束は大切だ。");
    expect(result.filter((w) => w === "約束")).toHaveLength(1);
  });

  it("handles text with no kanji", () => {
    const result = extractKanjiCompounds("これはテストです");
    expect(result).toEqual([]);
  });
});

describe("computeStats", () => {
  const statsCards = [
    {
      text: "食べる to eat",
      metadata: {
        noteId: 1,
        deck: "Vocab",
        tags: "[]",
        interval: 100,
        ease: 2500,
        lapses: 0,
        due: 0,
        cardType: "vocabulary" as const,
      },
    },
    {
      text: "走る to run",
      metadata: {
        noteId: 2,
        deck: "Vocab",
        tags: "[]",
        interval: 10,
        ease: 1500,
        lapses: 5,
        due: 0,
        cardType: "vocabulary" as const,
      },
    },
    {
      text: "ざるを得ない can't help but",
      metadata: {
        noteId: 3,
        deck: "Grammar",
        tags: "[]",
        interval: 30,
        ease: 2000,
        lapses: 2,
        due: 0,
        cardType: "grammar" as const,
      },
    },
  ];

  it("computes totals and averages", () => {
    const output = computeStats(statsCards);
    expect(output).toContain("Total cards: 3");
    expect(output).toContain("Average ease: 2000");
  });

  it("shows cards by type", () => {
    const output = computeStats(statsCards);
    expect(output).toContain("vocabulary: 2");
    expect(output).toContain("grammar: 1");
  });

  it("identifies leeches", () => {
    const output = computeStats(statsCards);
    expect(output).toContain("走る to run");
    expect(output).toContain("lapses: 5");
  });

  it("identifies weakest cards", () => {
    const output = computeStats(statsCards);
    expect(output).toContain("ease: 1500");
  });

  it("returns message for empty input", () => {
    expect(computeStats([])).toBe("No cards found.");
  });
});

describe("findGapsTool", () => {
  it("identifies grammar patterns not in deck", async () => {
    mockGetAllCards.mockResolvedValue([
      {
        id: "1",
        text: "にもかかわらず、彼は来なかった。",
        metadata: {
          noteId: 1,
          deck: "Grammar",
          tags: "[]",
          interval: 30,
          ease: 2000,
          lapses: 0,
          due: 0,
          cardType: "grammar",
        },
      },
    ]);

    const result = await findGapsTool.invoke({
      category: "grammar",
      level: "N1",
    });
    expect(result).toContain("Missing patterns:");
    expect(result).toContain("ものを");
    expect(result).toContain("Known patterns:");
    expect(result).toContain("にもかかわらず");
  });

  it("returns message for vocabulary category", async () => {
    const result = await findGapsTool.invoke({
      category: "vocabulary",
      level: "N1",
    });
    expect(result).toContain("not yet available");
  });
});

describe("cardStatsTool", () => {
  it("returns stats for all cards when no query", async () => {
    mockGetAllCards.mockResolvedValue([
      {
        id: "1",
        text: "食べる",
        metadata: {
          noteId: 1,
          deck: "Vocab",
          tags: "[]",
          interval: 100,
          ease: 2500,
          lapses: 0,
          due: 0,
          cardType: "vocabulary",
        },
      },
    ]);

    const result = await cardStatsTool.invoke({});
    expect(result).toContain("Study Statistics:");
    expect(result).toContain("Total cards: 1");
  });

  it("filters by query when provided", async () => {
    mockSearchCards.mockResolvedValue(sampleResults);

    const result = await cardStatsTool.invoke({ query: "食べる" });
    expect(result).toContain('filtered: "食べる"');
    expect(mockSearchCards).toHaveBeenCalled();
  });
});

describe("analyseTextTool", () => {
  it("extracts kanji compounds and checks deck", async () => {
    mockSearchCards.mockImplementation(async (query: string) => {
      if (query === "約束") {
        return [
          {
            id: "1",
            text: "約束を守る",
            metadata: {
              noteId: 1,
              deck: "Vocab",
              tags: "[]",
              interval: 60,
              ease: 2500,
              lapses: 0,
              due: 0,
              cardType: "vocabulary",
            },
            distance: 0.1,
          },
        ];
      }
      return [];
    });

    const result = await analyseTextTool.invoke({
      text: "彼は約束を守る人だ。勉強は大変だ。",
    });
    expect(result).toContain("約束");
    expect(result).toContain("Known words");
  });
});
