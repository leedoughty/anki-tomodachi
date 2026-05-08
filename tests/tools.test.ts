import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SearchResult } from "../src/types.js";

vi.mock("../src/vectorstore.js", () => ({
  searchCards: vi.fn(),
  getOrCreateCollection: vi.fn(),
  getChromaClient: vi.fn(),
}));

import { searchCards } from "../src/vectorstore.js";
import { searchCardsTool, formatResults } from "../src/tools.js";

const mockSearchCards = vi.mocked(searchCards);

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
