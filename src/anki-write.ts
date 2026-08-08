import { z } from "zod";
import {
  ankiConnect,
  AnkiConnectError,
  fetchNotesInfo,
} from "./anki-connect.js";
import type { AnkiNote } from "./types.js";

export const TARGET_DECK =
  process.env.TOMODACHI_DECK?.trim() || "Japanese Vocabulary";
export const TARGET_MODEL = "Japanese";
export const HIGHLIGHT = "rgb(255, 189, 0)";

export interface DraftCard {
  sentence: string;
  target: string;
  meaning: string;
  reading: string;
}

export interface AnkiNoteInput {
  deckName: string;
  modelName: string;
  fields: Record<string, string>;
  tags: string[];
  options?: Record<string, unknown>;
}

export const draftCardShape = {
  sentence: z
    .string()
    .describe(
      "The full source sentence exactly as it appeared, plain text, no HTML. Must contain the target word verbatim.",
    ),
  target: z
    .string()
    .describe(
      "The single unknown word being learned, exactly as it appears in the sentence",
    ),
  meaning: z
    .string()
    .describe(
      "The meaning line WITHOUT the leading '・'. Prefer emoji, then a Japanese gloss, then concise English.",
    ),
  reading: z
    .string()
    .describe(
      "The whole sentence in Anki Japanese Support furigana notation: a space before each kanji word, reading in square brackets. Example: ' 彼[かれ]は 毎朝[まいあさ] 早[はや]く 起[お]きて 公園[こうえん]を 走[はし]っている'",
    ),
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function renderFields(card: DraftCard): Record<string, string> {
  const index = card.sentence.indexOf(card.target);
  if (index === -1) {
    throw new Error(
      `Target "${card.target}" does not appear in sentence "${card.sentence}".`,
    );
  }

  const before = escapeHtml(card.sentence.slice(0, index));
  const after = escapeHtml(card.sentence.slice(index + card.target.length));
  const target = escapeHtml(card.target);
  const meaning = escapeHtml(card.meaning);

  return {
    Expression: `<div>${before}<span style="color: ${HIGHLIGHT};">${target}</span>${after}</div>`,
    Meaning: `<div><span style="color: ${HIGHLIGHT};">${target}：</span></div><div><span style="color: ${HIGHLIGHT};">・${meaning}</span></div>`,
    Reading: card.reading,
  };
}

export function toNoteInput(card: DraftCard): AnkiNoteInput {
  return {
    deckName: TARGET_DECK,
    modelName: TARGET_MODEL,
    fields: renderFields(card),
    tags: [],
    options: { allowDuplicate: false, duplicateScope: "deck" },
  };
}

export async function pingAnki(): Promise<void> {
  try {
    await ankiConnect<number>("version");
  } catch (error) {
    throw new AnkiConnectError(
      `Could not reach Anki on localhost:8765. Is Anki desktop running with the AnkiConnect add-on installed? (${
        error instanceof Error ? error.message : "unknown error"
      })`,
    );
  }
}

export async function canAddNotes(notes: AnkiNoteInput[]): Promise<boolean[]> {
  const result = await ankiConnect<unknown>("canAddNotes", { notes });
  return z.array(z.boolean()).parse(result);
}

export async function addNotes(
  notes: AnkiNoteInput[],
): Promise<Array<number | null>> {
  const result = await ankiConnect<unknown>("addNotes", { notes });
  return z.array(z.number().nullable()).parse(result);
}

export async function notesInfo(ids: number[]): Promise<AnkiNote[]> {
  return fetchNotesInfo(ids);
}

export interface VerificationIssue {
  noteId: number;
  field: string;
  problem: string;
}

export function verifyNote(
  note: AnkiNote,
  expected: DraftCard,
): VerificationIssue[] {
  const issues: VerificationIssue[] = [];
  const value = (name: string) => note.fields[name]?.value ?? "";
  const plain = (html: string) =>
    html
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .trim();

  if (note.modelName !== TARGET_MODEL) {
    issues.push({
      noteId: note.noteId,
      field: "modelName",
      problem: `expected ${TARGET_MODEL}, got ${note.modelName}`,
    });
  }

  const expression = value("Expression");
  if (!plain(expression).includes(expected.target)) {
    issues.push({
      noteId: note.noteId,
      field: "Expression",
      problem: `target "${expected.target}" missing from written sentence`,
    });
  }
  if (!expression.includes(HIGHLIGHT)) {
    issues.push({
      noteId: note.noteId,
      field: "Expression",
      problem: "target is not highlighted",
    });
  }

  const meaning = value("Meaning");
  const meaningText = plain(meaning);
  if (!meaningText.includes(`${expected.target}：`)) {
    issues.push({
      noteId: note.noteId,
      field: "Meaning",
      problem: `missing "${expected.target}："`,
    });
  }
  if (!meaningText.includes("・")) {
    issues.push({
      noteId: note.noteId,
      field: "Meaning",
      problem: "missing the ・ meaning line",
    });
  }

  const reading = value("Reading");
  if (!reading.trim()) {
    issues.push({
      noteId: note.noteId,
      field: "Reading",
      problem: "empty",
    });
  } else if (
    /[一-鿿]/.test(expected.sentence) &&
    !/\[[ぁ-ん]+\]/.test(reading)
  ) {
    issues.push({
      noteId: note.noteId,
      field: "Reading",
      problem: "no furigana brackets despite kanji in the sentence",
    });
  }

  return issues;
}

export async function verifyWrittenNotes(
  pairs: Array<{ noteId: number; card: DraftCard }>,
): Promise<VerificationIssue[]> {
  if (pairs.length === 0) return [];
  const notes = await notesInfo(pairs.map((p) => p.noteId));
  const byId = new Map(notes.map((n) => [n.noteId, n]));

  const issues: VerificationIssue[] = [];
  for (const { noteId, card } of pairs) {
    const note = byId.get(noteId);
    if (!note) {
      issues.push({
        noteId,
        field: "note",
        problem: "not found in Anki after writing",
      });
      continue;
    }
    issues.push(...verifyNote(note, card));
  }
  return issues;
}
