import { z } from "zod";
import {
  AnkiConnectResponseSchema,
  AnkiNoteSchema,
  AnkiCardInfoSchema,
  type AnkiNote,
  type AnkiCardInfo,
} from "./types.js";

const ANKI_CONNECT_URL = "http://localhost:8765";
const BATCH_SIZE = 200;

export class AnkiConnectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnkiConnectError";
  }
}

export async function ankiConnect<T>(
  action: string,
  params?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(ANKI_CONNECT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, version: 6, params: params ?? {} }),
  });

  const json: unknown = await response.json();
  const parsed = AnkiConnectResponseSchema.parse(json);

  if (parsed.error) {
    throw new AnkiConnectError(parsed.error);
  }

  return parsed.result as T;
}

export async function findAllNoteIds(): Promise<number[]> {
  const result = await ankiConnect<unknown>("findNotes", { query: "deck:*" });
  return z.array(z.number()).parse(result);
}

async function fetchBatched<TInput, TOutput>(
  ids: TInput[],
  action: string,
  paramKey: string,
  schema: z.ZodType<TOutput[]>,
): Promise<TOutput[]> {
  const results: TOutput[] = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const raw = await ankiConnect<unknown>(action, { [paramKey]: batch });
    const parsed = schema.parse(raw);
    results.push(...parsed);
  }
  return results;
}

export async function fetchNotesInfo(ids: number[]): Promise<AnkiNote[]> {
  return fetchBatched(ids, "notesInfo", "notes", z.array(AnkiNoteSchema));
}

export async function fetchCardsInfo(ids: number[]): Promise<AnkiCardInfo[]> {
  return fetchBatched(ids, "cardsInfo", "cards", z.array(AnkiCardInfoSchema));
}
