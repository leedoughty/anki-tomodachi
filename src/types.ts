import { z } from "zod";

export const AnkiConnectResponseSchema = z.object({
  result: z.unknown(),
  error: z.string().nullable(),
});

export const AnkiNoteSchema = z.object({
  noteId: z.number(),
  modelName: z.string(),
  tags: z.array(z.string()),
  fields: z.record(
    z.object({
      value: z.string(),
      order: z.number(),
    }),
  ),
  cards: z.array(z.number()),
});

export type AnkiNote = z.infer<typeof AnkiNoteSchema>;

export const AnkiCardInfoSchema = z.object({
  cardId: z.number(),
  note: z.number(),
  deckName: z.string(),
  interval: z.number(),
  factor: z.number(),
  lapses: z.number(),
  due: z.number(),
  queue: z.number(),
});

export type AnkiCardInfo = z.infer<typeof AnkiCardInfoSchema>;

export const CardType = z.enum([
  "vocabulary",
  "grammar",
  "kanji",
  "sentence",
  "other",
]);

export type CardType = z.infer<typeof CardType>;

export interface CardMetadata {
  noteId: number;
  deck: string;
  tags: string;
  interval: number;
  ease: number;
  lapses: number;
  due: number;
  cardType: CardType;
}

export interface CardDocument {
  id: string;
  text: string;
  metadata: CardMetadata;
}

export interface SearchResult {
  id: string;
  text: string;
  metadata: CardMetadata;
  distance: number;
}

export interface IngestSummary {
  totalNotes: number;
  totalCards: number;
  duration: number;
}
