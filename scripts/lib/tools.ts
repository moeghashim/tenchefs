import { field, list, parseJson, text } from "./json.ts";
import { spawnSync } from "node:child_process";

export interface Run {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}
export interface Diagnostic {
  readonly code: string;
  readonly filename: string;
  readonly message: string;
  readonly line: number;
}
export type Outcome<A> = { readonly ok: true; readonly value: A } | { readonly ok: false; readonly reason: string };

export const fail = (script: string, reason: string, code = 1): never => {
  console.error(`${script}: ${reason}`);
  process.exit(code);
};

export const unwrap = <A>(script: string, outcome: Outcome<A>): A =>
  outcome.ok ? outcome.value : fail(script, outcome.reason);

export const tool = (name: string, args: readonly string[]): Outcome<Run> => {
  const run = spawnSync(`node_modules/.bin/${name}`, args, { encoding: "utf8", maxBuffer: 1 << 28 });
  if (run.error) {
    return { ok: false, reason: `${name} could not run (${run.error.message}). Run pnpm install.` };
  }
  return { ok: true, value: { status: run.status, stderr: run.stderr, stdout: run.stdout } };
};

const line = (diagnostic: unknown) => {
  const value = field(field(list(field(diagnostic, "labels"))?.[0], "span"), "line");
  return typeof value === "number" ? value : 0;
};

const UNUSED_DIRECTIVE = /^Unused (?:oxlint|eslint)-disable directive/u;
const NO_DIAGNOSTICS = 0;

function codeOf(diagnostic: unknown, message: string): string {
  const code = text(field(diagnostic, "code"));
  if (typeof code === "string") {
    return code;
  }
  if (UNUSED_DIRECTIVE.test(message)) {
    return "oxlint(unused-disable-directive)";
  }
  return "";
}

const toDiagnostic = (diagnostic: unknown): readonly Diagnostic[] => {
  const filename = text(field(diagnostic, "filename"));
  const message = text(field(diagnostic, "message")) ?? "";
  const code = codeOf(diagnostic, message);
  return code && filename ? [{ code, filename, line: line(diagnostic), message }] : [];
};

function unshaped(diagnostics: readonly unknown[]): string {
  return diagnostics
    .filter((diagnostic) => toDiagnostic(diagnostic).length === NO_DIAGNOSTICS)
    .map((diagnostic) => `${text(field(diagnostic, "filename")) ?? "?"}: ${text(field(diagnostic, "message")) ?? ""}`)
    .join("\n");
}

export function reportOf(run: Run): Outcome<readonly Diagnostic[]> {
  const diagnostics = list(field(parseJson(run.stdout), "diagnostics"));
  if (!diagnostics) {
    const output = `${run.stdout}${run.stderr}`.trim();
    return { ok: false, reason: `oxlint produced no JSON report (exit ${run.status}): ${output}` };
  }
  const parsed = diagnostics.flatMap(toDiagnostic);
  if (parsed.length !== diagnostics.length) {
    return { ok: false, reason: `oxlint's JSON report has an unknown shape:\n${unshaped(diagnostics)}` };
  }
  return { ok: true, value: parsed };
}

export const oxlint = (args: readonly string[]): Outcome<readonly Diagnostic[]> => {
  const run = tool("effect-tsgo", ["oxlint", "--type-aware", "-f", "json", ...args]);
  if (!run.ok) {
    return run;
  }
  return reportOf(run.value);
};

export const describe = (diagnostic: Diagnostic) =>
  `${diagnostic.filename}:${diagnostic.line} ${diagnostic.code} ${diagnostic.message}`;
