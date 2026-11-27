import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { onTestFinished } from "vitest";
import os from "node:os";
import path from "node:path";

const PANEL = "app/modules/views/lib/panel.ts";
const PANEL_LINES = [
  'const TITLE = "Panel";',
  "",
  "export function shown() {",
  "  const title = TITLE;",
  "  return title;",
  "}",
  "",
  "export function hidden() {",
  '  const words = ["never", "rendered"];',
  '  return words.join(" ");',
  "}",
  "",
];
const DEPENDENCIES = ["@tailwindcss/vite", "tailwindcss", "vite"];
const STYLESHEET_TEXT = '@import "tailwindcss";\n';
const VITE_CONFIG = [
  'import { defineConfig } from "vite";',
  'import tailwindcss from "@tailwindcss/vite";',
  "",
  "export default defineConfig({ plugins: [tailwindcss()] });",
  "",
].join("\n");
const FILES: Readonly<Record<string, string>> = {
  ".gitignore": "node_modules\n",
  "app/modules/design-system/styles.css": STYLESHEET_TEXT,
  "app/modules/probe/web.ts": 'document.body.dataset["probe"] = "probe-ran";\n',
  "app/modules/views/lib/panel.ts": PANEL_LINES.join("\n"),
  "app/modules/views/tests/panel.test.ts": "export const NOT_BUILT = true;\n",
  "app/web.ts": [
    `import "./modules/design-system/styles.css";`,
    `import { hidden, shown } from "./modules/views/lib/panel.ts";`,
    "",
    'document.title = "app-ran " + shown();',
    'Reflect.set(globalThis, "hidden", hidden);',
    "",
  ].join("\n"),
  "index.html":
    '<!doctype html><html><head><title>web</title></head><body><script type="module" src="/app/web.ts"></script></body></html>\n',
  "vite.config.ts": VITE_CONFIG,
};

interface Written {
  readonly file: string;
  readonly root: string;
  readonly text: string;
}

function writeFile({ file, root, text }: Written): void {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
}

function webProject(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "cookout-web-project-"));
  onTestFinished(() => {
    rmSync(root, { force: true, recursive: true });
  });
  for (const [file, text] of Object.entries(FILES)) {
    writeFile({ file, root, text });
  }
  for (const dependency of DEPENDENCIES) {
    mkdirSync(path.dirname(path.join(root, "node_modules", dependency)), { recursive: true });
    symlinkSync(path.resolve("node_modules", dependency), path.join(root, "node_modules", dependency));
  }
  return root;
}

function builtAsset(folder: string, extension: string): { readonly name: string; readonly text: string } {
  const assets = path.join(folder, "assets");
  const name = readdirSync(assets).find((file) => file.endsWith(extension)) ?? "";
  return { name, text: readFileSync(path.join(assets, name), "utf8") };
}

function builtScript(folder: string): { readonly name: string; readonly text: string } {
  return builtAsset(folder, ".js");
}

function builtStylesheet(folder: string): string {
  return builtAsset(folder, ".css").text;
}

export { PANEL, PANEL_LINES, builtScript, builtStylesheet, webProject, writeFile };
