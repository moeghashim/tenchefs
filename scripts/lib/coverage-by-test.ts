import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { field, list, parseJson, text } from "./json.ts";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { strings } from "./coverage-unstable.ts";

interface Kept {
  readonly environment: string;
  readonly file: string;
  readonly projectName: string;
  readonly testFiles: readonly string[];
}

interface CoverageMap {
  readonly toJSON: () => unknown;
}

type CoverageByTestFiles = Readonly<Record<string, string>>;

interface V8Provider {
  readonly convertCoverage: (
    coverage: { readonly result: readonly unknown[] },
    project: unknown,
    environment: string,
  ) => Promise<CoverageMap>;
  readonly coverageFiles: ReadonlyMap<string | symbol, Readonly<Record<string, CoverageByTestFiles>>>;
  readonly ctx: { readonly getProjectByName: (name: string) => unknown };
  readonly generateCoverage: (context: unknown) => Promise<CoverageMap>;
}

const INDEX = "index.json";
const NONE = 0;

function isV8Provider(provider: unknown): provider is V8Provider {
  return (
    typeof provider === "object" && provider !== null && "convertCoverage" in provider && "coverageFiles" in provider
  );
}

function entries<Value>(record: Readonly<Record<string, Value>>): readonly (readonly [string, Value])[] {
  return Object.entries(record);
}

function keptOf(projectName: string, environment: string, byTestFiles: CoverageByTestFiles): readonly Kept[] {
  return entries(byTestFiles).map(([testFiles, file]) => ({
    environment,
    file,
    projectName,
    testFiles: testFiles.split(","),
  }));
}

function keep(provider: V8Provider, directory: string): void {
  mkdirSync(directory, { recursive: true });
  const projects: readonly (readonly [string | symbol, Readonly<Record<string, CoverageByTestFiles>>])[] = [
    ...provider.coverageFiles.entries(),
  ];
  const found = projects.flatMap(([projectName, byEnvironment]) =>
    entries(byEnvironment).flatMap(([environment, byTestFiles]) =>
      keptOf(String(projectName), environment, byTestFiles),
    ),
  );
  const kept = found.map((entry, index): Kept => {
    const file = path.join(directory, `${String(index)}.json`);
    copyFileSync(entry.file, file);
    return { environment: entry.environment, file, projectName: entry.projectName, testFiles: entry.testFiles };
  });
  writeFileSync(path.join(directory, INDEX), JSON.stringify(kept));
}

function keepingTestFiles({
  directory,
  provider,
}: {
  readonly directory: string;
  readonly provider: V8Provider;
}): void {
  const generate = provider.generateCoverage.bind(provider);
  async function generateCoverage(context: unknown): Promise<CoverageMap> {
    keep(provider, directory);
    const generated = await generate(context);
    return generated;
  }
  Object.assign(provider, { generateCoverage });
}

function keptEntry(entry: unknown): Kept {
  return {
    environment: text(field(entry, "environment")) ?? "",
    file: text(field(entry, "file")) ?? "",
    projectName: text(field(entry, "projectName")) ?? "",
    testFiles: strings(field(entry, "testFiles")),
  };
}

function keptFrom(directory: string): readonly Kept[] {
  const index = parseJson(readFileSync(path.join(directory, INDEX), "utf8"));
  return (list(index) ?? []).map((entry) => keptEntry(entry));
}

function isSource(script: unknown, sources: ReadonlySet<string>): boolean {
  const url = text(field(script, "url")) ?? "";
  return url.startsWith("file:") && sources.has(fileURLToPath(url));
}

function scriptsOf(kept: Kept, sources: ReadonlySet<string>): readonly unknown[] {
  const raw = parseJson(readFileSync(kept.file, "utf8"));
  return (list(field(raw, "result")) ?? []).filter((script) => isSource(script, sources));
}

async function attribute(provider: V8Provider, kept: Kept, sources: ReadonlySet<string>): Promise<readonly unknown[]> {
  const result = scriptsOf(kept, sources);
  if (result.length === NONE) {
    return [];
  }
  const project = provider.ctx.getProjectByName(kept.projectName);
  const converted = await provider.convertCoverage({ result }, project, kept.environment);
  return [{ coverage: converted.toJSON(), testFiles: kept.testFiles }];
}

async function coverageByTestFile(inputs: {
  readonly kept: readonly string[];
  readonly provider: V8Provider;
  readonly sources: readonly string[];
}): Promise<readonly unknown[]> {
  const sources = new Set(inputs.sources);
  const kept = inputs.kept.flatMap((directory) => keptFrom(directory));
  const found = await Promise.all(
    kept.map(async (entry) => {
      const attributed = await attribute(inputs.provider, entry, sources);
      return attributed;
    }),
  );
  return found.flat();
}

export { coverageByTestFile, isV8Provider, keepingTestFiles };
