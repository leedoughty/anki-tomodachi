import { describe, it, expect } from "vitest";
import {
  stripHtml,
  extractText,
  inferCardType,
  aggregateCardData,
  buildDocuments,
} from "../src/ingest.js";
import type { AnkiNote, AnkiCardInfo } from "../src/types.js";
import fixtures from "./fixtures/sample-cards.json";

const sampleNotes = fixtures.notes as unknown as AnkiNote[];
const sampleCards = fixtures.cards as unknown as AnkiCardInfo[];

describe("stripHtml", () => {
  it("removes simple HTML tags", () => {
    expect(stripHtml("<b>食べる</b>")).toBe("食べる");
  });

  it("removes nested tags", () => {
    expect(stripHtml('<div class="expression">〜ざるを得ない</div>')).toBe(
      "〜ざるを得ない",
    );
  });

  it("removes multiple tags", () => {
    expect(stripHtml("<i>ちょうせん</i><br>challenge")).toBe(
      "ちょうせんchallenge",
    );
  });

  it("handles ruby annotations", () => {
    expect(
      stripHtml("彼は<ruby>約束<rt>やくそく</rt></ruby>を守る人だ。"),
    ).toBe("彼は約束やくそくを守る人だ。");
  });

  it("preserves emoji", () => {
    expect(stripHtml("🍎 りんご")).toBe("🍎 りんご");
  });

  it("trims whitespace", () => {
    expect(stripHtml("  hello  ")).toBe("hello");
  });

  it("returns empty string for empty input", () => {
    expect(stripHtml("")).toBe("");
  });
});

describe("extractText", () => {
  it("concatenates fields in order", () => {
    const note = sampleNotes[0]!;
    expect(extractText(note)).toBe("食べる to eat");
  });

  it("strips HTML from all fields", () => {
    const note = sampleNotes[1]!;
    const text = extractText(note);
    expect(text).toBe("突破 とっぱ breakthrough; breaking through 記録を突破する");
    expect(text).not.toContain("<b>");
  });

  it("skips empty fields", () => {
    const note = sampleNotes[3]!;
    const text = extractText(note);
    expect(text).toBe("翔 soar; fly high ショウ");
    expect(text).not.toMatch(/\s{2,}/);
  });

  it("returns empty string for notes with no content", () => {
    const note = sampleNotes[7]!;
    expect(extractText(note)).toBe("");
  });

  it("preserves cloze deletion markers as text", () => {
    const note = sampleNotes[8]!;
    const text = extractText(note);
    expect(text).toContain("にもかかわらず");
  });
});

describe("inferCardType", () => {
  it("detects grammar from tags", () => {
    expect(inferCardType("Japanese::Core", ["grammar", "jlpt::n2"])).toBe(
      "grammar",
    );
  });

  it("detects grammar from Japanese tag 文法", () => {
    expect(inferCardType("Japanese", ["文法"])).toBe("grammar");
  });

  it("detects kanji from deck name", () => {
    expect(inferCardType("Japanese::Kanji", [])).toBe("kanji");
  });

  it("detects vocabulary from tags", () => {
    expect(inferCardType("Japanese", ["vocabulary"])).toBe("vocabulary");
  });

  it("detects vocabulary from Japanese tag 単語", () => {
    expect(inferCardType("Japanese", ["単語"])).toBe("vocabulary");
  });

  it("detects sentence from deck name", () => {
    expect(inferCardType("Japanese::Sentences", [])).toBe("sentence");
  });

  it("returns other when nothing matches", () => {
    expect(inferCardType("Default", [])).toBe("other");
  });
});

describe("aggregateCardData", () => {
  it("takes worst-case across multiple cards", () => {
    const cards = sampleCards.filter((c) => c.note === 1001);
    expect(cards).toHaveLength(2);

    const agg = aggregateCardData(cards);
    expect(agg.interval).toBe(12);
    expect(agg.ease).toBe(1800);
    expect(agg.lapses).toBe(5);
    expect(agg.deck).toBe("Japanese::Vocabulary");
  });

  it("handles single card", () => {
    const cards = sampleCards.filter((c) => c.note === 1000);
    const agg = aggregateCardData(cards);
    expect(agg.interval).toBe(180);
    expect(agg.ease).toBe(2500);
    expect(agg.lapses).toBe(0);
  });
});

describe("buildDocuments", () => {
  it("builds documents from notes and cards", () => {
    const docs = buildDocuments(sampleNotes, sampleCards);
    expect(docs.length).toBeGreaterThan(0);
  });

  it("skips notes with empty text", () => {
    const docs = buildDocuments(sampleNotes, sampleCards);
    const emptyNote = docs.find((d) => d.id === "1007");
    expect(emptyNote).toBeUndefined();
  });

  it("uses note ID as document ID", () => {
    const docs = buildDocuments(sampleNotes, sampleCards);
    expect(docs[0]!.id).toBe("1000");
  });

  it("stores tags as JSON string", () => {
    const docs = buildDocuments(sampleNotes, sampleCards);
    const doc = docs.find((d) => d.id === "1000")!;
    expect(doc.metadata.tags).toBe(JSON.stringify(["jlpt::n3", "vocabulary"]));
  });

  it("infers card type correctly", () => {
    const docs = buildDocuments(sampleNotes, sampleCards);
    const grammar = docs.find((d) => d.id === "1002")!;
    expect(grammar.metadata.cardType).toBe("grammar");

    const kanji = docs.find((d) => d.id === "1003")!;
    expect(kanji.metadata.cardType).toBe("kanji");
  });

  it("aggregates scheduling data for multi-card notes", () => {
    const docs = buildDocuments(sampleNotes, sampleCards);
    const doc = docs.find((d) => d.id === "1001")!;
    expect(doc.metadata.ease).toBe(1800);
    expect(doc.metadata.lapses).toBe(5);
    expect(doc.metadata.interval).toBe(12);
  });
});
