const R = "app/modules";
const INTERNALS = `^${R}/[^/]+/[^/]+/`;
const TESTS = `^${R}/[^/]+/tests/`;
const BACKEND = `^${R}/[^/]+/(server\\.ts$|lib/server/)`;
const ENTRIES = String.raw`^app/(main\.ts|dev\.ts|web\.tsx)$`;
const DEV_ENTRY = String.raw`^app/dev\.ts$`;
const SCREENSHOTS = String.raw`^scripts/screenshots\.ts$`;
const WEB = `^app/web\\.tsx$|^${R}/(design-system|session|board|unread|composer|live|layout|paths|routes|format|views)/`;
const PUBLISHED_ENTRIES = ["app/main.ts", `${R}/sdk/index.ts`];
const PUBLISHED_SDK = `${R}/sdk/index.ts`;
const TESTED_INTERFACES = ["sdk", "cli", "storage", "webhook-fake", "dev", "routes", "board"];
const HANDLER_EXAMPLE = "packages/handler-example";
const HANDLER_EXAMPLE_MODULES = `${HANDLER_EXAMPLE}/app/modules`;
const HANDLER_EXAMPLE_TESTED_INTERFACES = ["handler"];
const exactly = (file) => `^${file.replaceAll(".", String.raw`\.`)}$`;
function installedDependencies() {
  const { readFileSync } = process.getBuiltinModule("node:fs");
  const { createHash } = process.getBuiltinModule("node:crypto");
  const { join } = process.getBuiltinModule("node:path");
  const lockfile = readFileSync(join(__dirname, "node_modules/.pnpm/lock.yaml"));
  return `installed-dependencies:${createHash("sha256").update(lockfile).digest("hex")}`;
}

module.exports = {
  forbidden: [
    {
      from: { path: PUBLISHED_ENTRIES.map(exactly) },
      name: "published-entries-ship-no-test-code",
      severity: "error",
      to: { path: `^${R}/(testing|webhook-fake|dev)/`, reachable: true },
    },
    {
      comment: "serve never runs on the dev program's adjustable clock, wherever that clock's file moves (#268).",
      from: { path: String.raw`(^|/)app/main\.ts$` },
      name: "serve-never-reaches-the-adjustable-clock",
      severity: "error",
      to: { path: String.raw`(^|/)adjustable-clock\.ts$`, reachable: true },
    },
    {
      from: { path: exactly(PUBLISHED_SDK) },
      name: "published-sdk-reaches-no-effect",
      severity: "error",
      to: { path: "(^|/)node_modules/(effect|@effect/[^/]+)/", reachable: true },
    },
    {
      from: { pathNot: `^${R}/` },
      name: "entry-points-only-from-app",
      severity: "error",
      to: { path: INTERNALS },
    },
    {
      from: { path: `^${R}/([^/]+)/`, pathNot: TESTS },
      name: "entry-points-only-across-modules",
      severity: "error",
      to: { path: INTERNALS, pathNot: `^${R}/$1/` },
    },
    {
      from: { path: `^${R}/([^/]+)/tests/` },
      name: "tests-through-entry-points",
      severity: "error",
      to: { path: INTERNALS, pathNot: `^${R}/$1/tests/` },
    },
    {
      from: {
        path: String.raw`\.test\.tsx?$`,
        pathNot: [
          `^${R}/(${TESTED_INTERFACES.join("|")})/tests/`,
          `^${HANDLER_EXAMPLE_MODULES}/(${HANDLER_EXAMPLE_TESTED_INTERFACES.join("|")})/tests/`,
          "^scripts/tests/",
        ],
      },
      name: "tests-only-at-tested-interfaces",
      severity: "error",
      to: {},
    },
    {
      from: { path: `^${HANDLER_EXAMPLE}/` },
      name: "handler-example-imports-only-the-sdk",
      severity: "error",
      to: {
        path: [
          `^(?!${HANDLER_EXAMPLE}/|node_modules/)[^/]+/`,
          String.raw`/node_modules/@ai-hero/cookout/(?!app/modules/sdk/index\.ts$)`,
        ],
      },
    },
    {
      from: { path: `^${HANDLER_EXAMPLE}/`, pathNot: `^${HANDLER_EXAMPLE_MODULES}/([^/]+)/tests/` },
      name: "handler-example-tests-folder-is-private",
      severity: "error",
      to: { path: `^${HANDLER_EXAMPLE_MODULES}/[^/]+/tests/` },
    },
    {
      from: { path: `^${HANDLER_EXAMPLE}/`, pathNot: `^${HANDLER_EXAMPLE_MODULES}/[^/]+/` },
      name: "handler-example-entry-points-only",
      severity: "error",
      to: { path: `^${HANDLER_EXAMPLE_MODULES}/[^/]+/[^/]+/` },
    },
    {
      from: { pathNot: TESTS },
      name: "tests-folder-is-private",
      severity: "error",
      to: { path: TESTS },
    },
    {
      from: { pathNot: BACKEND },
      name: "server-code-only-from-server",
      severity: "error",
      to: { path: `^${R}/[^/]+/lib/server/` },
    },
    {
      from: { pathNot: [TESTS, `^${R}/testing/`, `^${R}/dev/`, DEV_ENTRY, SCREENSHOTS] },
      name: "testing-only-from-tests",
      severity: "error",
      to: { path: `^${R}/testing/` },
    },
    {
      from: { path: SCREENSHOTS },
      name: "screenshots-move-the-clock-only",
      severity: "error",
      to: { path: `^${R}/testing/`, pathNot: exactly(`${R}/testing/index.ts`) },
    },
    {
      from: { pathNot: [TESTS, `^${R}/testing/`, `^${R}/webhook-fake/`, `^${R}/dev/`] },
      name: "webhook-fake-only-from-tests-and-dev",
      severity: "error",
      to: { path: `^${R}/webhook-fake/` },
    },
    {
      from: { pathNot: [TESTS, `^${R}/testing/`, `^${R}/dev/`, DEV_ENTRY] },
      name: "dev-only-from-the-dev-entry",
      severity: "error",
      to: { path: `^${R}/dev/` },
    },
    {
      from: { path: "^app/", pathNot: [BACKEND, ENTRIES, TESTS] },
      name: "no-node-builtins-in-client",
      severity: "error",
      to: { dependencyTypes: ["core"] },
    },
    {
      from: { path: "^app/", pathNot: [BACKEND, String.raw`^app/main\.ts$`, DEV_ENTRY, TESTS] },
      name: "client-never-imports-server",
      severity: "error",
      to: { path: `^${R}/[^/]+/server\\.ts$` },
    },
    {
      from: { path: `^${R}/sdk/`, pathNot: `^${R}/sdk/tests/` },
      name: "sdk-imports-only-client-entry-points",
      severity: "error",
      to: { path: `^${R}/(?!sdk/)[^/]+/`, pathNot: `^${R}/[^/]+/(index|client)\\.ts$` },
    },
    {
      from: { path: WEB },
      name: "web-never-imports-backend-modules",
      severity: "error",
      to: { path: `^${R}/(cli|storage|secrets)/|^${R}/config/server\\.ts$` },
    },
    {
      from: { pathNot: `^${R}/storage/lib/server/adapters/sqlite\\.ts$` },
      name: "sqlite-only-in-storage-adapter",
      severity: "error",
      to: { path: "^(node:)?sqlite$" },
    },
    {
      from: { pathNot: `^${R}/views/lib/markdown-(text\\.tsx|plain-text\\.ts)$` },
      name: "markdown-only-in-markdown-text",
      severity: "error",
      to: { path: "(^|/)node_modules/(react-markdown|remark-[^/]+|unified|micromark[^/]*|mdast-[^/]+)/" },
    },
    {
      from: { pathNot: `^${R}/design-system/` },
      name: "radix-only-in-design-system",
      severity: "error",
      to: { path: "(^|/)node_modules/@radix-ui/" },
    },
    {
      from: {},
      name: "no-undeclared-dependencies",
      severity: "error",
      to: { dependencyTypes: ["npm-no-pkg", "npm-unknown", "unknown", "undetermined"] },
    },
    {
      from: {},
      name: "no-circular",
      severity: "error",
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    enhancedResolveOptions: {
      conditionNames: ["import", "require", "node", "default", "types"],
      exportsFields: ["exports"],
    },
    exclude: { path: String.raw`^app/modules/sdk/lib/generated/validators\.d\.ts$` },
    exoticRequireStrings: [installedDependencies()],
    parser: "swc",
    preserveSymlinks: true,
    tsConfig: { fileName: "tsconfig.json" },
  },
};
