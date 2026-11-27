import { Array as Arr, pipe } from "effect";
import { existsSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SOURCE = "https://github.com/mattpocock/cookout/blob/main/";
const SHIPPED_DOCS = ["docs/agents.md", "skills/cookout/SKILL.md"] as const;

function shippedFiles(): readonly string[] {
  const manifest: unknown = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
  if (typeof manifest === "object" && manifest !== null && "files" in manifest && Array.isArray(manifest.files)) {
    return pipe(
      manifest.files,
      Arr.filter((entry): entry is string => typeof entry === "string"),
    );
  }
  return [];
}

const SHIPPED_FILES = shippedFiles();

function linkTargets(doc: string): readonly string[] {
  const text = readFileSync(path.join(ROOT, doc), "utf8");
  return text.match(/(?<=\]\()[^)\s]+(?=\))/gu) ?? [];
}

function withoutAnchor(target: string): string {
  return target.replace(/#.*$/u, "");
}

function isShipped(file: string): boolean {
  return pipe(
    SHIPPED_FILES,
    Arr.some((entry) => file === entry || file.startsWith(`${entry}/`)),
  );
}

function relativeTargets(doc: string): readonly string[] {
  return pipe(
    linkTargets(doc),
    Arr.filter((target) => !/^[a-z]+:/u.test(target) && !target.startsWith("#")),
  );
}

function opensNothingShipped(doc: string): (target: string) => boolean {
  return (target) => {
    const file = path.normalize(path.join(path.dirname(doc), withoutAnchor(target)));
    return !isShipped(file) || !existsSync(path.join(ROOT, file));
  };
}

function isMissingFromRepository(target: string): boolean {
  const file = withoutAnchor(target.slice(SOURCE.length));
  return !existsSync(path.join(ROOT, file));
}

function sourceTargets(doc: string): readonly string[] {
  return pipe(
    linkTargets(doc),
    Arr.filter((target) => target.startsWith(SOURCE)),
  );
}

it.each(SHIPPED_DOCS)(
  "every relative link in the npm-shipped %s opens a file the package ships",
  { timeout: 1000 },
  (doc) => {
    expect.hasAssertions();

    const targets = relativeTargets(doc);
    const unshipped = pipe(targets, Arr.filter(opensNothingShipped(doc)));

    expect(targets).not.toStrictEqual([]);
    expect(unshipped).toStrictEqual([]);
  },
);

it.each(SHIPPED_DOCS)(
  "every link from the npm-shipped %s to the cookout's source names a file in the repository",
  { timeout: 1000 },
  (doc) => {
    expect.hasAssertions();

    const missing = pipe(sourceTargets(doc), Arr.filter(isMissingFromRepository));

    expect(missing).toStrictEqual([]);
  },
);
