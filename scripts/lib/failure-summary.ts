import { failingTests } from "./failing-tests.ts";

interface Failed {
  readonly name: string;
  readonly output: string;
}

interface Kind {
  readonly found: (output: string) => readonly string[];
  readonly plural: string;
}

const SHOWN = 20;
const NONE = 0;
const FIRST = 0;
const VIOLATION = /^(?<at>\S+:\d+) (?<rule>[\w@/-]+\([\w@/-]+\)) /u;

function violations(output: string): readonly string[] {
  return output.split("\n").flatMap((line) => {
    const match = VIOLATION.exec(line.trim());
    if (match === null) {
      return [];
    }
    const { at = "", rule = "" } = match.groups ?? {};
    return [`${at} ${rule}`];
  });
}

const kinds: readonly Kind[] = [
  { found: (output) => failingTests(output).map(({ name }) => name), plural: "failing tests" },
  { found: violations, plural: "lint violations" },
];

function linesOf(kind: Kind, failed: readonly Failed[]): readonly string[] {
  const named = failed.flatMap(({ name, output }) => kind.found(output).map((found) => `  ${name}: ${found}`));
  const unique = [...new Set(named)];
  if (unique.length <= SHOWN) {
    return unique;
  }
  return [...unique.slice(FIRST, SHOWN), `  …and ${String(unique.length - SHOWN)} more ${kind.plural}`];
}

function failureSummary(failed: readonly Failed[]): readonly string[] {
  const lines = kinds.flatMap((kind) => linesOf(kind, failed));
  if (lines.length === NONE) {
    return [];
  }
  return ["Failures:", ...lines];
}

export { failureSummary };
