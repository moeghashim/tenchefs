import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { Function } from "effect";
import { Scanner } from "@tailwindcss/oxide";
import type { SourceEntry } from "@tailwindcss/oxide";
import { build } from "vite";
import { compile } from "@tailwindcss/node";
import path from "node:path";
import { probePlugins } from "../../app/modules/probe/server.ts";
import { spawnSync } from "node:child_process";

interface WebBuildOptions {
  readonly probe: boolean;
  readonly root: string;
}

interface WebBuild {
  readonly built: boolean;
  readonly folder: string;
}

const EXIT_SUCCESS = 0;
const CACHE = path.join("node_modules", ".cache", "cookout-web");
const INPUT_FOLDERS = ["app", "public"];
const INPUT_FILES = ["index.html", "package.json", "pnpm-lock.yaml", "vite.config.ts"];
const NOT_INPUTS = new Set(["node_modules", "tests"]);
const STYLESHEET = path.join("app", "modules", "design-system", "styles.css");

function isInput(file: string): boolean {
  return !file.split(path.sep).some((segment) => NOT_INPUTS.has(segment));
}

function filesIn(root: string, folder: string): readonly string[] {
  const at = path.join(root, folder);
  if (!existsSync(at)) {
    return [];
  }
  return readdirSync(at, { encoding: "utf8", recursive: true })
    .map((file) => path.join(folder, file))
    .filter((file) => isInput(file) && statSync(path.join(root, file)).isFile());
}

function gitHash(root: string, args: readonly string[], input: string): string {
  const hashed = spawnSync("git", ["hash-object", ...args], { cwd: root, encoding: "utf8", input });
  if (hashed.status !== EXIT_SUCCESS) {
    throw new Error(`web-build: git hash-object failed: ${hashed.stderr}`);
  }
  return hashed.stdout.trim();
}

type TailwindRoot = Awaited<ReturnType<typeof compile>>["root"];

function tailwindSources(tailwindRoot: Readonly<TailwindRoot>, root: string): readonly SourceEntry[] {
  if (tailwindRoot === "none") {
    return [];
  }
  if (tailwindRoot === null) {
    return [{ base: root, negated: false, pattern: "**/*" }];
  }
  return [{ ...tailwindRoot, negated: false }];
}

async function tailwindStylesheet(root: string): Promise<string> {
  const file = path.join(root, STYLESHEET);
  if (!existsSync(file)) {
    return "";
  }
  const compiler = await compile(readFileSync(file, "utf8"), {
    base: path.dirname(file),
    onDependency: Function.constVoid,
  });
  const scanner = new Scanner({ sources: [...tailwindSources(compiler.root, root), ...compiler.sources] });
  return compiler.build(scanner.scan());
}

async function inputsHash({ probe, root }: WebBuildOptions): Promise<string> {
  const inputs = [...INPUT_FOLDERS.flatMap((folder) => filesIn(root, folder)), ...INPUT_FILES]
    .filter((file) => existsSync(path.join(root, file)))
    .toSorted();
  const files = [path.relative(root, import.meta.filename), ...inputs];
  const ids = gitHash(root, ["--stdin-paths"], files.join("\n")).split("\n");
  const listing = files.map((file, index) => `${ids[index] ?? ""} ${file}`);
  const stylesheet = gitHash(root, ["--stdin"], await tailwindStylesheet(root));
  return gitHash(root, ["--stdin"], [`probe ${String(probe)}`, `stylesheet ${stylesheet}`, ...listing].join("\n"));
}

function configFileIn(root: string): string | false {
  const file = path.join(root, "vite.config.ts");
  if (existsSync(file)) {
    return file;
  }
  return false;
}

async function viteBuild({ probe, root }: WebBuildOptions, outDir: string): Promise<void> {
  function repoRelative(source: string, mapFile: string): string {
    return path.relative(root, path.resolve(path.dirname(mapFile), source));
  }
  await build({
    build: {
      emptyOutDir: true,
      minify: false,
      outDir,
      rolldownOptions: { output: { sourcemapPathTransform: repoRelative } },
      sourcemap: "inline",
    },
    configFile: configFileIn(root),
    logLevel: "error",
    plugins: probePlugins(probe),
    root,
  });
}

function variant(probe: boolean): string {
  if (probe) {
    return "probe-";
  }
  return "plain-";
}

function keepOnly(folder: string, prefix: string): void {
  const cache = path.dirname(folder);
  for (const entry of readdirSync(cache)) {
    if (entry.startsWith(prefix) && path.join(cache, entry) !== folder) {
      rmSync(path.join(cache, entry), { force: true, recursive: true });
    }
  }
}

async function buildInto(options: WebBuildOptions, folder: string): Promise<void> {
  mkdirSync(path.dirname(folder), { recursive: true });
  const building = mkdtempSync(path.join(path.dirname(folder), "building-"));
  try {
    await viteBuild(options, building);
    rmSync(folder, { force: true, recursive: true });
    renameSync(building, folder);
  } finally {
    rmSync(building, { force: true, recursive: true });
  }
  keepOnly(folder, variant(options.probe));
}

async function webBuild(options: WebBuildOptions): Promise<WebBuild> {
  const folder = path.join(options.root, CACHE, `${variant(options.probe)}${await inputsHash(options)}`);
  if (existsSync(path.join(folder, "index.html"))) {
    return { built: false, folder };
  }
  await buildInto(options, folder);
  return { built: true, folder };
}

export { webBuild };
