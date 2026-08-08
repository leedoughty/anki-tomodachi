import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/vectorstore.js", () => ({
  searchCards: vi.fn(async () => []),
  getAllCards: vi.fn(async () => []),
  getOrCreateCollection: vi.fn(),
  getChromaClient: vi.fn(),
}));

import {
  buildOptions,
  tsukutteTools,
  wantsCards,
  TSUKUTTE_TOOLS,
} from "../src/agent-tsukutte.js";
import { TSUKUTTE_PROMPT } from "../src/prompts.js";
import type { DraftCard } from "../src/anki-write.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function mockResponse(result: unknown, error: string | null = null) {
  mockFetch.mockResolvedValueOnce({
    json: () => Promise.resolve({ result, error }),
  });
}

const card: DraftCard = {
  sentence: "拙速な決定が現場に混乱をもたらした",
  target: "拙速",
  meaning: "⏩❌ rushing and botching it",
  reading:
    " 拙速[せっそく]な 決定[けってい]が 現場[げんば]に 混乱[こんらん]をもたらした",
};

async function call(name: keyof typeof tsukutteTools, args: unknown) {
  const result = await tsukutteTools[name].handler(args as never, undefined);
  return result.content.map((c) => ("text" in c ? c.text : "")).join("\n");
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("tool permissions", () => {
  const options = buildOptions();

  it("exposes exactly the five card-making tools", () => {
    expect(Object.keys(tsukutteTools).sort()).toEqual(
      [...TSUKUTTE_TOOLS].sort(),
    );
  });

  it("pre-approves every one of its own MCP tools", () => {
    for (const name of TSUKUTTE_TOOLS) {
      expect(options.allowedTools).toContain(`mcp__tomodachi__${name}`);
    }
  });

  it("grants no filesystem or shell built-ins", () => {
    const builtins = options.tools as string[];
    for (const banned of ["Bash", "Read", "Write", "Edit", "Glob", "Grep"]) {
      expect(builtins).not.toContain(banned);
    }
  });

  it("still allows web fetching so URLs can be read", () => {
    expect(options.tools as string[]).toContain("WebFetch");
    expect(options.allowedTools).toContain("WebFetch");
  });

  it("explicitly disallows shell and file-writing tools", () => {
    for (const banned of ["Bash", "Write", "Edit", "NotebookEdit"]) {
      expect(options.disallowedTools).toContain(banned);
    }
  });

  it("never uses a permission mode that needs the dangerous-skip flag", () => {
    expect(options.permissionMode).not.toBe("bypassPermissions");
    expect(options.allowDangerouslySkipPermissions).toBeUndefined();
  });

  it("does not inherit the user's ambient Claude Code settings", () => {
    expect(options.settingSources).toEqual([]);
  });

  it("uses the 作って system prompt", () => {
    expect(options.systemPrompt).toBe(TSUKUTTE_PROMPT);
  });

  it("resumes the prior session only when asked to", () => {
    expect(buildOptions().resume).toBeUndefined();
    expect(buildOptions("abc-123").resume).toBe("abc-123");
  });
});

describe("routing", () => {
  it("routes an explicit card request with Japanese text", () => {
    expect(wantsCards("この記事の知らない単語をカードにして")).toBe(true);
  });

  it("routes a URL plus a card request", () => {
    expect(wantsCards("https://www3.nhk.or.jp/news/x.html カードにして")).toBe(
      true,
    );
  });

  it("routes an English card request about Japanese text", () => {
    expect(wantsCards("make cards from this: 拙速な決定")).toBe(true);
  });

  it("leaves ordinary deck questions to the chat agent", () => {
    expect(wantsCards("カードは何枚ある？")).toBe(false);
    expect(wantsCards("拙速ってどういう意味？")).toBe(false);
    expect(wantsCards("最近どの分野が弱い？")).toBe(false);
  });

  it("does not route a bare URL with no card intent", () => {
    expect(wantsCards("https://example.com これ読んだ")).toBe(false);
  });
});

describe("anki_add_notes", () => {
  it("reports created ids and points at the verify step", async () => {
    mockResponse([1717171717]);
    const out = await call("anki_add_notes", { cards: [card] });
    expect(out).toContain("added 1717171717");
    expect(out).toContain("anki_verify_notes");
    expect(out).toContain("1717171717");
  });

  it("surfaces cards Anki refused instead of claiming success", async () => {
    mockResponse([null]);
    const out = await call("anki_add_notes", { cards: [card] });
    expect(out).toContain("FAILED");
    expect(out).toContain("0/1 written");
  });
});

describe("anki_verify_notes", () => {
  it("refuses to confirm ids that were never written this run", async () => {
    const out = await call("anki_verify_notes", { noteIds: [424242] });
    expect(out).toContain("nothing was verified");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("confirms a note that reads back correctly", async () => {
    mockResponse([2020202020]);
    await call("anki_add_notes", { cards: [card] });

    const { renderFields } = await import("../src/anki-write.js");
    mockResponse([
      {
        noteId: 2020202020,
        modelName: "Japanese",
        tags: [],
        cards: [1],
        fields: Object.fromEntries(
          Object.entries(renderFields(card)).map(([k, v], i) => [
            k,
            { value: v, order: i },
          ]),
        ),
      },
    ]);

    const out = await call("anki_verify_notes", { noteIds: [2020202020] });
    expect(out).toContain("read back clean");
  });

  it("reports a note that came back malformed", async () => {
    mockResponse([3030303030]);
    await call("anki_add_notes", { cards: [card] });

    mockResponse([
      {
        noteId: 3030303030,
        modelName: "Japanese",
        tags: [],
        cards: [1],
        fields: {
          Expression: { value: "<div>拙速な決定</div>", order: 0 },
          Meaning: { value: "<div>拙速：</div>", order: 1 },
          Reading: { value: "", order: 2 },
        },
      },
    ]);

    const out = await call("anki_verify_notes", { noteIds: [3030303030] });
    expect(out).toContain("Problems found");
    expect(out).toContain("Reading");
  });
});

describe("anki_can_add", () => {
  it("marks duplicates as rejected before anything is written", async () => {
    mockResponse([false]);
    const out = await call("anki_can_add", { cards: [card] });
    expect(out).toContain("REJECTED");
    expect(out).toContain("拙速");
  });
});
