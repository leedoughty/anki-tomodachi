import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ankiConnect,
  findAllNoteIds,
  fetchNotesInfo,
  fetchCardsInfo,
  AnkiConnectError,
} from "../src/anki-connect.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function mockResponse(result: unknown, error: string | null = null) {
  mockFetch.mockResolvedValueOnce({
    json: () => Promise.resolve({ result, error }),
  });
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("ankiConnect", () => {
  it("sends a well-formed POST request", async () => {
    mockResponse("ok");

    await ankiConnect("test", { key: "value" });

    expect(mockFetch).toHaveBeenCalledWith("http://localhost:8765", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "test",
        version: 6,
        params: { key: "value" },
      }),
    });
  });

  it("sends empty params when none provided", async () => {
    mockResponse("ok");

    await ankiConnect("test");

    const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
    expect(body.params).toEqual({});
  });

  it("returns the result on success", async () => {
    mockResponse([1, 2, 3]);

    const result = await ankiConnect<number[]>("findNotes");
    expect(result).toEqual([1, 2, 3]);
  });

  it("throws AnkiConnectError when error is non-null", async () => {
    mockResponse(null, "collection not found");
    await expect(ankiConnect("bad")).rejects.toThrow(AnkiConnectError);

    mockResponse(null, "oops");
    await expect(ankiConnect("bad")).rejects.toThrow("oops");
  });
});

describe("findAllNoteIds", () => {
  it("returns an array of note IDs", async () => {
    mockResponse([1000, 1001, 1002]);

    const ids = await findAllNoteIds();
    expect(ids).toEqual([1000, 1001, 1002]);

    const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
    expect(body.action).toBe("findNotes");
    expect(body.params.query).toBe("deck:*");
  });
});

describe("fetchNotesInfo", () => {
  it("fetches notes in a single batch for small inputs", async () => {
    const mockNotes = [
      {
        noteId: 1000,
        modelName: "Basic",
        tags: ["vocab"],
        fields: {
          Front: { value: "食べる", order: 0 },
          Back: { value: "to eat", order: 1 },
        },
        cards: [2000],
      },
    ];
    mockResponse(mockNotes);

    const notes = await fetchNotesInfo([1000]);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.noteId).toBe(1000);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("batches requests for large inputs", async () => {
    const ids = Array.from({ length: 500 }, (_, i) => i);

    const makeMockNote = (id: number) => ({
      noteId: id,
      modelName: "Basic",
      tags: [],
      fields: { Front: { value: "test", order: 0 } },
      cards: [id + 1000],
    });

    mockResponse(ids.slice(0, 200).map(makeMockNote));
    mockResponse(ids.slice(200, 400).map(makeMockNote));
    mockResponse(ids.slice(400, 500).map(makeMockNote));

    const notes = await fetchNotesInfo(ids);
    expect(notes).toHaveLength(500);
    expect(mockFetch).toHaveBeenCalledTimes(3);

    const firstBatchBody = JSON.parse(mockFetch.mock.calls[0]![1].body);
    expect(firstBatchBody.params.notes).toHaveLength(200);
    const lastBatchBody = JSON.parse(mockFetch.mock.calls[2]![1].body);
    expect(lastBatchBody.params.notes).toHaveLength(100);
  });
});

describe("fetchCardsInfo", () => {
  it("fetches card scheduling data", async () => {
    const mockCards = [
      {
        cardId: 2000,
        note: 1000,
        deckName: "Japanese::Vocabulary",
        interval: 180,
        factor: 2500,
        lapses: 0,
        due: 1700000000,
        queue: 2,
      },
    ];
    mockResponse(mockCards);

    const cards = await fetchCardsInfo([2000]);
    expect(cards).toHaveLength(1);
    expect(cards[0]!.factor).toBe(2500);
    expect(cards[0]!.deckName).toBe("Japanese::Vocabulary");
  });

  it("batches large card requests", async () => {
    const ids = Array.from({ length: 450 }, (_, i) => i);

    const makeMockCard = (id: number) => ({
      cardId: id,
      note: id - 1000,
      deckName: "Test",
      interval: 30,
      factor: 2500,
      lapses: 0,
      due: 0,
      queue: 2,
    });

    mockResponse(ids.slice(0, 200).map(makeMockCard));
    mockResponse(ids.slice(200, 400).map(makeMockCard));
    mockResponse(ids.slice(400, 450).map(makeMockCard));

    const cards = await fetchCardsInfo(ids);
    expect(cards).toHaveLength(450);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});
