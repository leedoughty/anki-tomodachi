import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  addNotes,
  canAddNotes,
  pingAnki,
  renderFields,
  toNoteInput,
  verifyNote,
  verifyWrittenNotes,
  HIGHLIGHT,
  TARGET_DECK,
  TARGET_MODEL,
  type DraftCard,
} from "../src/anki-write.js";
import { AnkiConnectError } from "../src/anki-connect.js";
import type { AnkiNote } from "../src/types.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function mockResponse(result: unknown, error: string | null = null) {
  mockFetch.mockResolvedValueOnce({
    json: () => Promise.resolve({ result, error }),
  });
}

const card: DraftCard = {
  sentence: "長時間の会議で気力を消耗した",
  target: "消耗",
  meaning: "体力や気力がすり減ること",
  reading:
    " 長時間[ちょうじかん]の 会議[かいぎ]で 気力[きりょく]を 消耗[しょうもう]した",
};

function noteFrom(fields: Record<string, string>, overrides = {}): AnkiNote {
  return {
    noteId: 1,
    modelName: TARGET_MODEL,
    tags: [],
    cards: [10],
    fields: Object.fromEntries(
      Object.entries(fields).map(([k, v], i) => [k, { value: v, order: i }]),
    ),
    ...overrides,
  } as AnkiNote;
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("renderFields", () => {
  it("highlights the target inside the sentence on the front", () => {
    const fields = renderFields(card);
    expect(fields.Expression).toBe(
      `<div>長時間の会議で気力を<span style="color: ${HIGHLIGHT};">消耗</span>した</div>`,
    );
  });

  it("builds the back as target： then a ・ meaning line", () => {
    const fields = renderFields(card);
    expect(fields.Meaning).toContain("消耗：");
    expect(fields.Meaning).toContain("・体力や気力がすり減ること");
    expect(fields.Meaning).toContain(HIGHLIGHT);
  });

  it("passes the reading through untouched", () => {
    expect(renderFields(card).Reading).toBe(card.reading);
  });

  it("handles a target at the very start of the sentence", () => {
    const fields = renderFields({
      ...card,
      sentence: "消耗が激しい",
      target: "消耗",
    });
    expect(fields.Expression).toBe(
      `<div><span style="color: ${HIGHLIGHT};">消耗</span>が激しい</div>`,
    );
  });

  it("escapes HTML in the sentence and meaning", () => {
    const fields = renderFields({
      ...card,
      sentence: "A<B の消耗",
      target: "消耗",
      meaning: "wear & tear",
    });
    expect(fields.Expression).toContain("A&lt;B");
    expect(fields.Meaning).toContain("wear &amp; tear");
  });

  it("throws when the target is not in the sentence", () => {
    expect(() => renderFields({ ...card, target: "存在しない" })).toThrow(
      /does not appear/,
    );
  });
});

describe("toNoteInput", () => {
  it("targets the resolved deck and model with no tags", () => {
    const note = toNoteInput(card);
    expect(note.deckName).toBe(TARGET_DECK);
    expect(note.modelName).toBe(TARGET_MODEL);
    expect(note.tags).toEqual([]);
  });

  it("refuses duplicates within the deck", () => {
    expect(toNoteInput(card).options).toEqual({
      allowDuplicate: false,
      duplicateScope: "deck",
    });
  });
});

describe("canAddNotes", () => {
  it("returns a boolean per submitted note", async () => {
    mockResponse([true, false]);
    const result = await canAddNotes([toNoteInput(card), toNoteInput(card)]);
    expect(result).toEqual([true, false]);
  });
});

describe("addNotes", () => {
  it("returns created note ids", async () => {
    mockResponse([1234567890]);
    expect(await addNotes([toNoteInput(card)])).toEqual([1234567890]);
  });

  it("tolerates nulls for notes Anki refused", async () => {
    mockResponse([null, 999]);
    expect(await addNotes([toNoteInput(card), toNoteInput(card)])).toEqual([
      null,
      999,
    ]);
  });
});

describe("pingAnki", () => {
  it("resolves when Anki answers", async () => {
    mockResponse(6);
    await expect(pingAnki()).resolves.toBeUndefined();
  });

  it("raises a friendly error when Anki is unreachable", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await expect(pingAnki()).rejects.toThrow(AnkiConnectError);
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await expect(pingAnki()).rejects.toThrow(/Is Anki desktop running/);
  });
});

describe("verifyNote", () => {
  it("passes a correctly written note", () => {
    expect(verifyNote(noteFrom(renderFields(card)), card)).toEqual([]);
  });

  it("flags a missing highlight", () => {
    const fields = renderFields(card);
    expect(
      verifyNote(
        noteFrom({
          ...fields,
          Expression: "<div>長時間の会議で気力を消耗した</div>",
        }),
        card,
      ),
    ).toContainEqual(
      expect.objectContaining({
        field: "Expression",
        problem: expect.stringContaining("not highlighted"),
      }),
    );
  });

  it("flags a back missing the ・ line", () => {
    const fields = renderFields(card);
    const issues = verifyNote(
      noteFrom({ ...fields, Meaning: "<div>消耗：</div>" }),
      card,
    );
    expect(issues.some((i) => i.problem.includes("・"))).toBe(true);
  });

  it("flags an empty reading", () => {
    const issues = verifyNote(
      noteFrom({ ...renderFields(card), Reading: "" }),
      card,
    );
    expect(issues).toContainEqual(
      expect.objectContaining({ field: "Reading", problem: "empty" }),
    );
  });

  it("flags a reading with no furigana when the sentence has kanji", () => {
    const issues = verifyNote(
      noteFrom({ ...renderFields(card), Reading: "ちょうじかんのかいぎで" }),
      card,
    );
    expect(issues.some((i) => i.problem.includes("furigana"))).toBe(true);
  });

  it("accepts a kana-only sentence with no furigana brackets", () => {
    const kana: DraftCard = {
      sentence: "ひっかけだよ",
      target: "ひっかけ",
      meaning: "a trick question",
      reading: "ひっかけだよ",
    };
    expect(verifyNote(noteFrom(renderFields(kana)), kana)).toEqual([]);
  });

  it("flags the wrong note model", () => {
    const issues = verifyNote(
      noteFrom(renderFields(card), { modelName: "Basic" }),
      card,
    );
    expect(issues).toContainEqual(
      expect.objectContaining({ field: "modelName" }),
    );
  });
});

describe("verifyWrittenNotes", () => {
  it("reads notes back and reports a clean write", async () => {
    mockResponse([{ ...noteFrom(renderFields(card)), noteId: 55 }]);
    const issues = await verifyWrittenNotes([{ noteId: 55, card }]);
    expect(issues).toEqual([]);
  });

  it("reports notes that vanished after writing", async () => {
    mockResponse([]);
    const issues = await verifyWrittenNotes([{ noteId: 77, card }]);
    expect(issues).toContainEqual(
      expect.objectContaining({
        noteId: 77,
        problem: expect.stringContaining("not found"),
      }),
    );
  });

  it("skips the round trip when there is nothing to verify", async () => {
    expect(await verifyWrittenNotes([])).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
