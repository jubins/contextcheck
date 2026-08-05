import { describe, it, expect } from "vitest";
import { extractClaims } from "../src/index.js";
import type { Claim } from "../src/index.js";

/** Filter helper: claims of a given kind, sorted by appearance. */
function of(claims: Claim[], kind: Claim["kind"]): Claim[] {
  return claims.filter((c) => c.kind === kind);
}

interface Case {
  name: string;
  md: string;
  /** Expected command values (normalized), in order. Omit to skip check. */
  commands?: string[];
  /** Expected path values, in order. Omit to skip check. */
  paths?: string[];
}

const cases: Case[] = [
  // ---- Commands: fences ----
  {
    name: "bash fence single command",
    md: "```bash\nnpm run build\n```",
    commands: ["npm run build"],
  },
  {
    name: "sh fence",
    md: "```sh\nyarn test\n```",
    commands: ["yarn test"],
  },
  {
    name: "shell fence",
    md: "```shell\npnpm install\n```",
    commands: ["pnpm install"],
  },
  {
    name: "unlabeled shell-like fence",
    md: "```\nnpm ci\nnpm run build\n```",
    commands: ["npm ci", "npm run build"],
  },
  {
    name: "unlabeled non-shell fence ignored",
    md: "```\nconst x = 1;\nreturn x;\n```",
    commands: [],
  },
  {
    name: "chained commands with &&",
    md: "```bash\nnpm ci && npm run build\n```",
    commands: ["npm ci", "npm run build"],
  },
  {
    name: "chained with semicolon",
    md: "```bash\ncargo fmt; cargo test\n```",
    commands: ["cargo fmt", "cargo test"],
  },
  {
    name: "piped commands",
    md: "```bash\nnpm run list | make filter\n```",
    commands: ["npm run list", "make filter"],
  },
  {
    name: "prompt-prefixed dollar sign stripped",
    md: "```console\n$ npm run dev\n```",
    commands: ["npm run dev"],
  },
  {
    name: "comment line in fence ignored",
    md: "```bash\n# install first\nnpm install\n```",
    commands: ["npm install"],
  },
  {
    name: "inline trailing comment stripped",
    md: "```bash\nnpm run build # production\n```",
    commands: ["npm run build"],
  },
  {
    name: "non-runner line in fence ignored",
    md: "```bash\ncd packages/api\nnpm test\n```",
    commands: ["npm test"],
  },
  {
    name: "hash inside quotes not treated as comment",
    md: "```bash\ngo run main.go --tag=\"#v1\"\n```",
    commands: ['go run main.go --tag="#v1"'],
  },
  {
    name: "multiple runners: poetry, uv, just, task",
    md: "```bash\npoetry run pytest\nuv sync\njust build\ntask deploy\n```",
    commands: ["poetry run pytest", "uv sync", "just build", "task deploy"],
  },
  {
    name: "make and cargo and go",
    md: "```bash\nmake lint\ncargo build\ngo test ./...\n```",
    commands: ["make lint", "cargo build", "go test ./..."],
  },
  {
    name: "gradle and mvn and dotnet",
    md: "```bash\ngradle build\nmvn verify\ndotnet test\n```",
    commands: ["gradle build", "mvn verify", "dotnet test"],
  },

  // ---- Commands: inline ----
  {
    name: "inline code command",
    md: "Run `npm run build` to compile.",
    commands: ["npm run build"],
  },
  {
    name: "inline non-command ignored",
    md: "The `Widget` class lives here.",
    commands: [],
  },
  {
    name: "inline chained command",
    md: "Do `npm ci && npm test` locally.",
    commands: ["npm ci", "npm test"],
  },

  // ---- Paths ----
  {
    name: "inline path with separator",
    md: "See `src/services/auth.ts` for details.",
    paths: ["src/services/auth.ts"],
  },
  {
    name: "inline path dir with trailing slash",
    md: "Look in `src/api/`.",
    paths: ["src/api/"],
  },
  {
    name: "inline bare filename with known extension",
    md: "Edit `tsconfig.json`.",
    paths: ["tsconfig.json"],
  },
  {
    name: "known filename without extension",
    md: "The `Makefile` has targets.",
    paths: ["Makefile"],
  },
  {
    name: "url excluded",
    md: "Visit `https://example.com/docs/guide.md`.",
    paths: [],
  },
  {
    name: "scoped package excluded",
    md: "Install `@scope/pkg`.",
    paths: [],
  },
  {
    name: "windows-style path",
    md: "Config at `src\\config\\app.json`.",
    paths: ["src\\config\\app.json"],
  },
  {
    name: "prose trap: bare word 'src' not a path",
    md: "We use the src directory for source.",
    paths: [],
  },
  {
    name: "prose trap: bare filename mention not a path",
    md: "Supports AGENTS.md and CLAUDE.md style files.",
    paths: [],
  },
  {
    name: "prose path detected at low confidence",
    md: "Handlers live in src/handlers/index.ts today.",
    paths: ["src/handlers/index.ts"],
  },
  {
    name: "bare token no extension no separator ignored",
    md: "The `build` step runs.",
    paths: [],
  },
  {
    name: "trailing punctuation stripped from prose path",
    md: "It is defined in config/settings.yml.",
    paths: ["config/settings.yml"],
  },
  {
    name: "heading path low confidence",
    md: "## src/api/routes.ts",
    paths: ["src/api/routes.ts"],
  },
];

describe("extractClaims", () => {
  for (const c of cases) {
    it(c.name, () => {
      const claims = extractClaims(c.md);
      if (c.commands !== undefined) {
        expect(of(claims, "command").map((x) => x.value)).toEqual(c.commands);
      }
      if (c.paths !== undefined) {
        expect(of(claims, "path").map((x) => x.value)).toEqual(c.paths);
      }
    });
  }

  it("reports accurate line numbers across a fence", () => {
    const md = "intro\n\n```bash\nnpm ci\nnpm run build\n```";
    const cmds = of(extractClaims(md), "command");
    expect(cmds.map((c) => c.line)).toEqual([4, 5]);
  });

  it("marks prose paths low and code-fence commands high confidence", () => {
    const md = "See src/x.ts.\n\n```bash\nnpm test\n```";
    const claims = extractClaims(md);
    const path = of(claims, "path")[0]!;
    const cmd = of(claims, "command")[0]!;
    expect(path.confidence).toBe("low");
    expect(cmd.confidence).toBe("high");
  });

  it("marks glob paths low confidence", () => {
    const claims = extractClaims("Match `src/**/*.ts` files.");
    const path = of(claims, "path")[0]!;
    expect(path).toBeDefined();
    expect(path.confidence).toBe("low");
  });

  it("column points at the command start in a chain", () => {
    const md = "```bash\nnpm ci && npm test\n```";
    const cmds = of(extractClaims(md), "command");
    // "npm test" starts after "npm ci && " (10 chars), 1-based column 11.
    expect(cmds[1]!.column).toBe(11);
  });
});

describe("tool extraction", () => {
  it("extracts an inline-code tool at high confidence", () => {
    const tools = of(extractClaims("We use `jest` here."), "tool");
    expect(tools).toHaveLength(1);
    expect(tools[0]!.value).toBe("jest");
    expect(tools[0]!.confidence).toBe("high");
  });

  it("extracts a prose tool mention at low confidence", () => {
    const tools = of(extractClaims("The project uses Vitest for tests."), "tool");
    expect(tools.map((t) => t.value)).toContain("vitest");
    expect(tools[0]!.confidence).toBe("low");
  });

  it("ignores unknown words", () => {
    const tools = of(extractClaims("We use `frobnicator` here."), "tool");
    expect(tools).toHaveLength(0);
  });
});
