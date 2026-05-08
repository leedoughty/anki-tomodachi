import {
  findAllNoteIds,
  fetchNotesInfo,
  fetchCardsInfo,
} from "./anki-connect.js";
import { getOrCreateCollection, addDocuments } from "./vectorstore.js";
import type {
  AnkiNote,
  AnkiCardInfo,
  CardDocument,
  CardMetadata,
  CardType,
  IngestSummary,
} from "./types.js";

export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

export function extractText(note: AnkiNote): string {
  return Object.values(note.fields)
    .sort((a, b) => a.order - b.order)
    .map((f) => stripHtml(f.value))
    .filter(Boolean)
    .join(" ");
}

export function inferCardType(deckName: string, tags: string[]): CardType {
  const combined = [deckName, ...tags].map((s) => s.toLowerCase()).join(" ");
  if (combined.includes("grammar") || combined.includes("文法"))
    return "grammar";
  if (combined.includes("kanji") || combined.includes("漢字")) return "kanji";
  if (combined.includes("sentence") || combined.includes("文"))
    return "sentence";
  if (combined.includes("vocab") || combined.includes("単語"))
    return "vocabulary";
  return "other";
}

export function aggregateCardData(
  cards: AnkiCardInfo[],
): Pick<CardMetadata, "interval" | "ease" | "lapses" | "due" | "deck"> {
  return {
    interval: Math.min(...cards.map((c) => c.interval)),
    ease: Math.min(...cards.map((c) => c.factor)),
    lapses: Math.max(...cards.map((c) => c.lapses)),
    due: Math.min(...cards.map((c) => c.due)),
    deck: cards[0]!.deckName,
  };
}

export function buildDocuments(
  notes: AnkiNote[],
  cardsData: AnkiCardInfo[],
): CardDocument[] {
  const cardsByNote = new Map<number, AnkiCardInfo[]>();
  for (const card of cardsData) {
    const existing = cardsByNote.get(card.note) ?? [];
    existing.push(card);
    cardsByNote.set(card.note, existing);
  }

  const documents: CardDocument[] = [];
  for (const note of notes) {
    const text = extractText(note);
    if (!text) continue;

    const cards = cardsByNote.get(note.noteId);
    if (!cards || cards.length === 0) continue;

    const agg = aggregateCardData(cards);

    documents.push({
      id: String(note.noteId),
      text,
      metadata: {
        noteId: note.noteId,
        deck: agg.deck,
        tags: JSON.stringify(note.tags),
        interval: agg.interval,
        ease: agg.ease,
        lapses: agg.lapses,
        due: agg.due,
        cardType: inferCardType(agg.deck, note.tags),
      },
    });
  }

  return documents;
}

export interface IngestProgress {
  onNoteIds?: (count: number) => void;
  onNotesFetched?: (count: number) => void;
  onCardsFetched?: (count: number) => void;
  onDocumentsBuilt?: (count: number) => void;
  onEmbedded?: (count: number) => void;
}

export async function ingestCards(
  progress?: IngestProgress,
): Promise<IngestSummary> {
  const start = Date.now();

  const noteIds = await findAllNoteIds();
  progress?.onNoteIds?.(noteIds.length);

  const notes = await fetchNotesInfo(noteIds);
  progress?.onNotesFetched?.(notes.length);

  const allCardIds = notes.flatMap((n) => n.cards);
  const cardsData = await fetchCardsInfo(allCardIds);
  progress?.onCardsFetched?.(cardsData.length);

  const documents = buildDocuments(notes, cardsData);
  progress?.onDocumentsBuilt?.(documents.length);

  const collection = await getOrCreateCollection();
  await addDocuments(collection, documents);
  progress?.onEmbedded?.(documents.length);

  return {
    totalNotes: documents.length,
    totalCards: allCardIds.length,
    duration: Date.now() - start,
  };
}
