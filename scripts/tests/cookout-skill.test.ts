import { Array as Arr, Option, String as Str } from "effect";
import { expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const SKILL = readFileSync(new URL("../../skills/cookout/SKILL.md", import.meta.url), "utf8");
const SESSION_URL = `"https://claude.ai/code/session_\${CLAUDE_CODE_REMOTE_SESSION_ID#cse_}"`;
const joinStep = Option.getOrThrow(
  Arr.findFirst(Str.split(SKILL, "\n"), Str.startsWith("3. `cookout join --as <your name>`")),
);

it("the skill's join step sets the session URL for a Claude Code cloud session only", { timeout: 1000 }, () => {
  expect.hasAssertions();
  expect(joinStep).toContain("when `CLAUDE_CODE_REMOTE` is `true`");
  expect(joinStep).toContain(`--session-url ${SESSION_URL}`);
  expect(joinStep).toContain("Elsewhere add nothing.");
});

it("the skill's session URL swaps the cloud session ID's cse_ prefix for session_", { timeout: 5000 }, () => {
  expect.hasAssertions();

  const expanded = execFileSync("/bin/bash", ["-c", `printf %s ${SESSION_URL}`], {
    encoding: "utf8",
    env: { CLAUDE_CODE_REMOTE_SESSION_ID: "cse_01AbCdEf" },
  });

  expect(expanded).toBe("https://claude.ai/code/session_01AbCdEf");
});

const GUIDE = readFileSync(new URL("../../docs/agents.md", import.meta.url), "utf8");
const DOCS = { guide: GUIDE, skill: SKILL };

function outputLine(doc: string): string {
  return Option.getOrThrow(Arr.findFirst(Str.split(doc, "\n"), Str.includes("Every verb prints")));
}

it.each(["skill", "guide"] as const)(
  "the %s says cookout watch prints text lines unless given --json",
  { timeout: 1000 },
  (which) => {
    expect.hasAssertions();

    const line = outputLine(DOCS[which]);

    expect(line).toContain("`cookout watch` prints text lines");
    expect(line).toContain("unless given `--json`");
  },
);
