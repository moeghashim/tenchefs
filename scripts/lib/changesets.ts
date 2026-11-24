import { existsSync, readFileSync, statSync } from "node:fs";
import { field, list, parseJson, text } from "./json.ts";
import path from "node:path";

interface Change {
  readonly file: string;
  readonly status: string;
}

interface Changes {
  readonly changes: readonly Change[];
  readonly ships: (file: string) => boolean;
}

interface Sources {
  readonly entries: readonly string[];
  readonly read: (file: string) => string | undefined;
}

interface Reference {
  readonly file: string;
  readonly read: Sources["read"];
  readonly source: string;
}

interface Builds {
  readonly entries: readonly string[];
  readonly outDirs: readonly string[];
}

const PACKAGE = "@ai-hero/cookout";
const CHANGESET = /^\.changeset\/(?!README\.md$)[^/]+\.md$/u;
const SCRIPT = /\.(?:[cm]?js|tsx?)$/u;
const RELATIVE_IMPORT = /\b(?:from|import)\s*\(?\s*["'](?<specifier>\.{1,2}\/[^"']+)["']/gu;
const PAGE_ASSET = /\b(?:src|href)="\/(?<asset>[^"]+)"/gu;
const WEB_PAGE = "index.html";
const PUBLIC = "public";
const API_REPORT = "api/sdk.api.md";
const NONE = 0;
const FIRST = 0;

function changesetMissing({ changes, ships }: Changes): readonly string[] {
  const added = changes.some(({ file, status }) => status === "A" && CHANGESET.test(file));
  const released = changes.some(({ file, status }) => status === "D" && CHANGESET.test(file));
  const shipped = changes.filter(({ file, status }) => status !== "D" && ships(file)).map(({ file }) => file);
  if (added || released || shipped.length === NONE) {
    return [];
  }
  return [
    `this changes files that ship in ${PACKAGE} (${shipped.join(", ")}), but adds no changeset since its merge base with v1. Add one with pnpm changeset, or pnpm changeset --empty for a change users never see, and commit it.`,
  ];
}

function scriptImports({ file, source }: Reference): readonly string[] {
  return Array.from(source.matchAll(RELATIVE_IMPORT), ([, specifier = ""]: readonly string[]) =>
    path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier)),
  );
}

function publicAsset(asset: string, read: Sources["read"]): string {
  if (typeof read(asset) !== "string") {
    return `${PUBLIC}/${asset}`;
  }
  return asset;
}

function pageAssets({ read, source }: Reference): readonly string[] {
  return Array.from(source.matchAll(PAGE_ASSET), ([, asset = ""]: readonly string[]) => publicAsset(asset, read));
}

function referenced(reference: Reference): readonly string[] {
  if (reference.file.endsWith(".html")) {
    return pageAssets(reference);
  }
  if (SCRIPT.test(reference.file)) {
    return scriptImports(reference);
  }
  return [];
}

function shippedSources({ entries, read }: Sources): ReadonlySet<string> {
  const reached = new Set<string>();
  const pending = [...entries];
  while (pending.length > NONE) {
    const file = pending.pop() ?? "";
    const source = read(file);
    if (typeof source === "string" && !reached.has(file)) {
      reached.add(file);
      pending.push(...referenced({ file, read, source }));
    }
  }
  return reached;
}

function readFile(file: string): string | undefined {
  return [file]
    .filter((readable) => existsSync(readable) && statSync(readable).isFile())
    .map((readable) => readFileSync(readable, "utf8"))
    .at(FIRST);
}

function strings(value: unknown): readonly string[] {
  if (typeof value === "object" && value !== null) {
    return Object.values(value).flatMap((entry) => strings(entry));
  }
  return [text(value) ?? ""].filter((found) => found !== "").map((found) => path.posix.normalize(found));
}

async function builds(): Promise<Builds> {
  const { default: config } = await import("../../tsdown.config.ts");
  const each = list(config) ?? [];
  return {
    entries: each.flatMap((build) => strings(field(build, "entry"))),
    outDirs: each.flatMap((build) => strings(field(build, "outDir"))),
  };
}

function isUnder(file: string, entry: string): boolean {
  return file === entry || file.startsWith(`${entry}/`);
}

async function packageShips(): Promise<(file: string) => boolean> {
  const manifest = parseJson(readFile("package.json") ?? "");
  const files = strings(field(manifest, "files"));
  const { entries, outDirs } = await builds();
  const listed = [...files.filter((entry) => !outDirs.includes(entry)), PUBLIC];
  const exported = strings(field(manifest, "exports"));
  const sources = shippedSources({ entries: [...entries, WEB_PAGE, ...exported], read: (file) => readFile(file) });
  return (file) => file === API_REPORT || sources.has(file) || listed.some((entry) => isUnder(file, entry));
}

export { changesetMissing, packageShips };
export type { Change };
