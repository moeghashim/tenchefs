import { PANEL, PANEL_LINES, builtScript, webProject } from "./lib/web-project.ts";
import { coverageMapFrom, coverageMapOf, testCoverageFrom, testsReaching } from "../lib/browser-coverage.ts";
import { expect, it } from "vitest";
import type { CoverageMap } from "../lib/browser-coverage.ts";
import type { Outcome } from "../lib/tools.ts";
import type { Span } from "../lib/page-coverage.ts";
import { pageCoverage } from "../lib/page-coverage.ts";
import { transformWithOxc } from "vite";
import { webBuild } from "../lib/web-build.ts";

type ScriptCoverage = Parameters<typeof pageCoverage> extends readonly [readonly (infer Script)[]] ? Script : never;

const VIEW = "app/modules/views/lib/panel.tsx";
const LINES = [
  'const TITLE = "Panel";',
  "",
  "export function Shown() {",
  "  const title = TITLE;",
  "  return <h1>{title}</h1>;",
  "}",
  "",
  "export function Hidden() {",
  '  const words = ["never", "rendered"];',
  '  return <p>{words.join(" ")}</p>;',
  "}",
  "",
];
const SOURCE = LINES.join("\n");
const NEXT = 1;
const NEVER = 0;

function lineOf(code: string, after = NEXT): number {
  return LINES.indexOf(code, after - NEXT) + NEXT;
}

function only(line: number): Span {
  return [line, line];
}

const SHOWN: Span = [lineOf("export function Shown() {"), lineOf("}", lineOf("export function Shown() {"))];
const HIDDEN: Span = [lineOf("export function Hidden() {"), lineOf("}", lineOf("export function Hidden() {"))];
const [HIDDEN_HEADER] = HIDDEN;
const IN_SHOWN = lineOf("  const title = TITLE;");
const IN_HIDDEN = lineOf('  const words = ["never", "rendered"];');

function valueOf<Value>(outcome: Outcome<Value>): Value {
  if (!outcome.ok) {
    throw new Error(outcome.reason);
  }
  return outcome.value;
}

function functionRange(source: string, name: string, count: number): ScriptCoverage["functions"][number] {
  const start = source.indexOf(`function ${name}`);
  return {
    functionName: name,
    ranges: [{ count, endOffset: source.indexOf("}\n", start) + NEXT, startOffset: start }],
  };
}

async function servedView(called: { readonly hidden: number; readonly shown: number }): Promise<ScriptCoverage> {
  const transformed = await transformWithOxc(SOURCE, VIEW, { jsx: { runtime: "automatic" }, sourcemap: true });
  const map = Buffer.from(JSON.stringify(transformed.map)).toString("base64");
  const source = `${transformed.code}\n//# sourceMappingURL=data:application/json;base64,${map}\n`;
  return {
    functions: [
      { functionName: "", ranges: [{ count: NEXT, endOffset: source.length, startOffset: 0 }] },
      functionRange(source, "Shown", called.shown),
      functionRange(source, "Hidden", called.hidden),
    ],
    source,
    url: `http://127.0.0.1:5173/${VIEW}?t=1`,
  };
}

const CLIENT: ScriptCoverage = {
  functions: [{ functionName: "", ranges: [{ count: NEXT, endOffset: 8, startOffset: 0 }] }],
  source: "client();",
  url: "http://127.0.0.1:5173/@vite/client",
};

async function panelMap(): Promise<CoverageMap> {
  const shown = valueOf(pageCoverage([await servedView({ hidden: 0, shown: 1 })]));
  const hidden = valueOf(pageCoverage([await servedView({ hidden: 1, shown: 0 })]));
  return valueOf(
    coverageMapOf({
      commit: "abc123",
      coverage: [
        { files: shown, test: "a.browser.test.ts" },
        { files: hidden, test: "b.browser.test.ts" },
        { files: {}, test: "c.browser.test.ts" },
        { files: hidden, test: "b.browser.test.ts" },
      ],
    }),
  );
}

it("records each function of a served app file a page loaded, and which of them ran", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const page = pageCoverage([await servedView({ hidden: 0, shown: 2 }), CLIENT]);

  expect(page).toStrictEqual({ ok: true, value: { [VIEW]: { called: [SHOWN], functions: [SHOWN, HIDDEN] } } });
});

function panelSpan(name: string): Span {
  const header = PANEL_LINES.indexOf(`export function ${name}() {`);
  return [header + NEXT, PANEL_LINES.indexOf("}", header) + NEXT];
}

async function servedBundle(): Promise<ScriptCoverage> {
  const web = await webBuild({ probe: false, root: webProject() });
  const { name, text: source } = builtScript(web.folder);
  return {
    functions: [
      { functionName: "", ranges: [{ count: NEXT, endOffset: source.length, startOffset: 0 }] },
      functionRange(source, "shown", NEXT),
      functionRange(source, "hidden", NEVER),
    ],
    source,
    url: `http://127.0.0.1:4173/assets/${name}`,
  };
}

it("records each function of the built web UI's bundle against its own source file's lines", {
  timeout: 20_000,
}, async () => {
  expect.hasAssertions();

  const page = pageCoverage([await servedBundle()]);
  const [shown, hidden] = [panelSpan("shown"), panelSpan("hidden")];

  expect(page).toStrictEqual({
    ok: true,
    value: { [PANEL]: { called: [shown], functions: [shown, hidden] }, "app/web.ts": { called: [], functions: [] } },
  });
});

it("can't record a served app file that has no source map", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const page = pageCoverage([{ ...CLIENT, url: `http://127.0.0.1:5173/${VIEW}` }]);

  expect(page).toStrictEqual({ ok: false, reason: `${VIEW} was served without a source map` });
});

it("a change inside a function reaches only the browser tests that ran it", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const map = await panelMap();
  const reaching = [IN_SHOWN, IN_HIDDEN].map((line) => testsReaching({ changed: [only(line)], file: VIEW, map }));

  expect(reaching).toStrictEqual([
    { ok: true, value: ["a.browser.test.ts"] },
    { ok: true, value: ["b.browser.test.ts"] },
  ]);
});

it("a change outside every function's body reaches every browser test that loaded the file", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const map = await panelMap();
  const reaching = [lineOf('const TITLE = "Panel";'), HIDDEN_HEADER].map((line) =>
    testsReaching({ changed: [only(line)], file: VIEW, map }),
  );

  expect(reaching).toStrictEqual([
    { ok: true, value: ["a.browser.test.ts", "b.browser.test.ts"] },
    { ok: true, value: ["a.browser.test.ts", "b.browser.test.ts"] },
  ]);
});

it("can't tell which browser tests reach a file the map doesn't hold", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const reaching = testsReaching({ changed: [only(NEXT)], file: "app/web.tsx", map: await panelMap() });

  expect(reaching).toStrictEqual({ ok: false, reason: "the coverage map doesn't hold app/web.tsx" });
});

it("leaves out of the map a browser test whose coverage wasn't all recorded", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const shown = valueOf(pageCoverage([await servedView({ hidden: 0, shown: 1 })]));
  const map = coverageMapOf({
    commit: "abc123",
    coverage: [
      { files: shown, test: "a.browser.test.ts" },
      { files: shown, test: "b.browser.test.ts" },
      { incomplete: "a page closed before its coverage was taken", test: "b.browser.test.ts" },
    ],
  });

  expect(Object.keys(valueOf(map).tests)).toStrictEqual(["a.browser.test.ts"]);
});

it("makes no map when coverage was recorded outside any browser test", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const map = coverageMapOf({ commit: "abc123", coverage: [{ incomplete: "a page opened outside a test", test: "" }] });

  expect(map).toStrictEqual({ ok: false, reason: "a page opened outside a test" });
});

it("reads back the map it wrote, and refuses one that isn't a coverage map", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const map = await panelMap();
  const read = [coverageMapFrom(JSON.stringify(map)), coverageMapFrom(JSON.stringify({ commit: "abc123" }))];

  expect(read).toStrictEqual([
    { ok: true, value: map },
    { ok: false, reason: "the coverage map isn't one this check can read" },
  ]);
});

it("reads back each page's coverage record, and counts an unreadable one as incomplete", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const files = valueOf(pageCoverage([await servedView({ hidden: 0, shown: 1 })]));
  const lines = [
    JSON.stringify({ files, test: "a.browser.test.ts" }),
    JSON.stringify({ incomplete: "a page opened outside a test", test: "" }),
    JSON.stringify({ files: { [VIEW]: { called: "all" } }, test: "b.browser.test.ts" }),
  ];

  expect(lines.map((line) => testCoverageFrom(line))).toStrictEqual([
    { files, test: "a.browser.test.ts" },
    { incomplete: "a page opened outside a test", test: "" },
    { incomplete: "its coverage record couldn't be read", test: "b.browser.test.ts" },
  ]);
});
