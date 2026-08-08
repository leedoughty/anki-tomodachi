import {
  createSdkMcpServer,
  query,
  tool,
  type Options,
} from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import {
  analyseTextReport,
  analyseTextShape,
  checkKnownReport,
  checkKnownShape,
} from "./tools-core.js";
import {
  addNotes,
  canAddNotes,
  draftCardShape,
  pingAnki,
  toNoteInput,
  verifyWrittenNotes,
  TARGET_DECK,
  type DraftCard,
} from "./anki-write.js";
import { TSUKUTTE_PROMPT } from "./prompts.js";

const SERVER_NAME = "tomodachi";
const MAX_CARDS = 5;

export const TSUKUTTE_TOOLS = [
  "check_known",
  "analyse_text",
  "anki_can_add",
  "anki_add_notes",
  "anki_verify_notes",
] as const;

const written = new Map<number, DraftCard>();

function say(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

const cardsShape = {
  cards: z
    .array(z.object(draftCardShape))
    .max(MAX_CARDS)
    .describe(`The drafted cards, at most ${MAX_CARDS}`),
};

const checkKnownTool = tool(
  "check_known",
  "Check whether words are already in the user's Anki deck. Pass every candidate target word in ONE call. Words reported as already known must not be carded.",
  checkKnownShape,
  async (args) => say(await checkKnownReport(args)),
);

const analyseTextTool = tool(
  "analyse_text",
  "Analyse a Japanese passage: extracts kanji compounds, reports which are already in the deck, and finds semantically related cards. Coarse — prefer check_known for specific candidate words.",
  analyseTextShape,
  async (args) => say(await analyseTextReport(args)),
);

const ankiCanAddTool = tool(
  "anki_can_add",
  "Pre-flight check: asks Anki whether each drafted card could be added, catching duplicates before writing. Does not write anything.",
  cardsShape,
  async (args) => {
    const cards = args.cards as DraftCard[];
    const verdicts = await canAddNotes(cards.map(toNoteInput));
    const lines = cards.map(
      (c, i) =>
        `${verdicts[i] ? "OK" : "REJECTED (duplicate or invalid)"} — ${c.target}: ${c.sentence}`,
    );
    return say(lines.join("\n"));
  },
);

const ankiAddNotesTool = tool(
  "anki_add_notes",
  `Write the approved cards into the user's "${TARGET_DECK}" deck. ONLY call this after the user has explicitly approved the drafts. Returns the created note IDs.`,
  cardsShape,
  async (args) => {
    const cards = args.cards as DraftCard[];
    const ids = await addNotes(cards.map(toNoteInput));

    const lines: string[] = [];
    ids.forEach((id, i) => {
      const card = cards[i]!;
      if (id === null) {
        lines.push(
          `FAILED — ${card.target} (Anki refused it, likely a duplicate)`,
        );
      } else {
        written.set(id, card);
        lines.push(`added ${id} — ${card.target}`);
      }
    });

    const ok = ids.filter((id) => id !== null);
    lines.push(
      `\n${ok.length}/${cards.length} written. Now call anki_verify_notes with these IDs: [${ok.join(", ")}]`,
    );
    return say(lines.join("\n"));
  },
);

const ankiVerifyNotesTool = tool(
  "anki_verify_notes",
  "Read notes back out of Anki after writing and check each field against the house format. Always call this after anki_add_notes.",
  {
    noteIds: z
      .array(z.number())
      .describe("The note IDs returned by anki_add_notes"),
  },
  async (args) => {
    const pairs = args.noteIds
      .map((noteId) => ({ noteId, card: written.get(noteId) }))
      .filter((p): p is { noteId: number; card: DraftCard } => Boolean(p.card));

    if (pairs.length === 0) {
      return say(
        "No cards from this run match those IDs — nothing was verified. Report this to the user rather than claiming success.",
      );
    }

    const issues = await verifyWrittenNotes(pairs);
    if (issues.length === 0) {
      return say(
        `All ${pairs.length} notes read back clean: sentence on the front with the target highlighted, 単語： plus a ・ line on the back, and a furigana reading.`,
      );
    }

    return say(
      `Problems found in ${new Set(issues.map((i) => i.noteId)).size} note(s):\n` +
        issues
          .map((i) => `  note ${i.noteId} — ${i.field}: ${i.problem}`)
          .join("\n"),
    );
  },
);

export const tsukutteTools = {
  check_known: checkKnownTool,
  analyse_text: analyseTextTool,
  anki_can_add: ankiCanAddTool,
  anki_add_notes: ankiAddNotesTool,
  anki_verify_notes: ankiVerifyNotesTool,
};

const URL_PATTERN = /https?:\/\/\S+/;
const CARD_INTENT =
  /カードにして|カードを?作って|カードを?つくって|カード化|単語帳|make cards?|add cards?|create cards?/i;

export function wantsCards(input: string): boolean {
  if (!CARD_INTENT.test(input)) return false;
  return URL_PATTERN.test(input) || /[ぁ-んァ-ヶ一-鿿]/.test(input);
}

const tsukutteServer = createSdkMcpServer({
  name: SERVER_NAME,
  version: "1.0.0",
  tools: [
    checkKnownTool,
    analyseTextTool,
    ankiCanAddTool,
    ankiAddNotesTool,
    ankiVerifyNotesTool,
  ],
});

const MCP_TOOL_NAMES = TSUKUTTE_TOOLS.map(
  (name) => `mcp__${SERVER_NAME}__${name}`,
);

const WEB_TOOLS = ["WebFetch", "WebSearch"];

export function tsukutteModel(): string {
  return process.env.TOMODACHI_CARD_MODEL?.trim() || "claude-sonnet-5";
}

export function buildOptions(resume?: string): Options {
  return {
    systemPrompt: TSUKUTTE_PROMPT,
    model: tsukutteModel(),
    mcpServers: { [SERVER_NAME]: tsukutteServer },
    tools: WEB_TOOLS,
    allowedTools: [...MCP_TOOL_NAMES, ...WEB_TOOLS],
    disallowedTools: [
      "Bash",
      "BashOutput",
      "KillShell",
      "Read",
      "Write",
      "Edit",
      "NotebookEdit",
      "Glob",
      "Grep",
      "Task",
      "TodoWrite",
    ],
    permissionMode: "dontAsk",
    settingSources: [],
    maxTurns: 40,
    ...(resume ? { resume } : {}),
  };
}

export interface TsukutteEvent {
  type: "tool" | "text" | "session" | "error";
  name?: string;
  input?: unknown;
  text?: string;
  sessionId?: string;
}

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export async function* runTsukutte(
  prompt: string,
  resume?: string,
): AsyncGenerator<TsukutteEvent> {
  await pingAnki();

  const response = query({ prompt, options: buildOptions(resume) });
  let sessionId: string | undefined;

  for await (const message of response) {
    if (message.type === "assistant") {
      if (!sessionId && message.session_id) {
        sessionId = message.session_id;
        yield { type: "session", sessionId };
      }

      for (const block of message.message.content) {
        if (block.type === "text" && block.text) {
          yield { type: "text", text: block.text };
        } else if (block.type === "tool_use") {
          yield {
            type: "tool",
            name: block.name.replace(`mcp__${SERVER_NAME}__`, ""),
            input: block.input,
          };
        }
      }
    }

    if (message.type === "result") {
      if (!sessionId && message.session_id) {
        sessionId = message.session_id;
        yield { type: "session", sessionId };
      }
      if (message.subtype !== "success") {
        yield {
          type: "error",
          text: `Card generation stopped early (${message.subtype}).`,
        };
      }
    }
  }
}
