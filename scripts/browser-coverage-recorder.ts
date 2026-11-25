import { chromium, test } from "@playwright/test";
import type { Outcome } from "./lib/tools.ts";
import type { Page } from "@playwright/test";
import type { PageCoverage } from "./lib/page-coverage.ts";
import type { TestCoverage } from "./lib/browser-coverage.ts";
import { appendFileSync } from "node:fs";
import { pageCoverage } from "./lib/page-coverage.ts";
import path from "node:path";

interface Recording {
  readonly dir: string;
  readonly root: string;
}

interface Opened {
  readonly opened: readonly Page[];
  readonly test: string;
}

interface CloseOptions {
  readonly reason?: string;
  readonly runBeforeUnload?: boolean;
}

interface Closing {
  readonly close: (options?: CloseOptions) => Promise<void>;
}

interface Context {
  readonly browser: () => Closing | null;
  readonly newPage: () => Promise<Page>;
  readonly on: (event: "page", listener: (page: Page) => void) => unknown;
}

interface Tracked {
  readonly flushed: boolean;
  readonly test: string;
}

const UNTRACKED_PAGE = "a page opened that the recorder didn't start coverage on";
const UNFLUSHED_PAGE = "a page's coverage wasn't taken before the worker ended";
const NO_INSTRUMENTATION = "Playwright's instrumentation hooks aren't there, so no page's coverage can be taken";
const FLUSHED: Tracked = { flushed: true, test: "" };
const NOT_OPENED: Opened = { opened: [], test: "" };

const where = { file: "", root: "" };
const pages = new Map<Page, Tracked>();
const contexts = new Map<Context, Opened>();
const browsers = new Set<Closing>();

function write(record: TestCoverage): void {
  appendFileSync(where.file, `${JSON.stringify(record)}\n`);
}

function currentTest(): string {
  try {
    return path.relative(where.root, test.info().file);
  } catch {
    return "";
  }
}

function recordOf(testFile: string, coverage: Outcome<PageCoverage>): TestCoverage {
  if (!coverage.ok) {
    return { incomplete: coverage.reason, test: testFile };
  }
  return { files: coverage.value, test: testFile };
}

async function flush(page: Page): Promise<void> {
  const tracked = pages.get(page) ?? FLUSHED;
  if (tracked.flushed) {
    return;
  }
  pages.set(page, { flushed: true, test: tracked.test });
  try {
    const coverage = pageCoverage(await page.coverage.stopJSCoverage());
    write(recordOf(tracked.test, coverage));
  } catch (error) {
    write({ incomplete: `the page's coverage couldn't be taken: ${String(error)}`, test: tracked.test });
  }
}

async function flushAll(): Promise<void> {
  await Promise.all(
    [...pages.keys()].map(async (page) => {
      await flush(page);
    }),
  );
}

async function track(page: Page, testFile: string): Promise<Page> {
  await page.coverage.startJSCoverage({ resetOnNavigation: false });
  pages.set(page, { flushed: false, test: testFile });
  const close = page.close.bind(page);
  return Object.assign(page, {
    close: async (options?: CloseOptions) => {
      await flush(page);
      await close(options);
    },
  });
}

function flushBeforeClosing(browser: Closing | null): void {
  if (browser === null || browsers.has(browser)) {
    return;
  }
  browsers.add(browser);
  const close = browser.close.bind(browser);
  Object.assign(browser, {
    close: async (options?: CloseOptions) => {
      await flushAll();
      await close(options);
    },
  });
}

function afterCreate(context: Context): void {
  const testFile = currentTest();
  flushBeforeClosing(context.browser());
  const newPage = context.newPage.bind(context);
  const opened: Page[] = [];
  contexts.set(context, { opened, test: testFile });
  context.on("page", (page) => {
    opened.push(page);
  });
  Object.assign(context, { newPage: async () => track(await newPage(), testFile) });
}

async function beforeClose(context: Context): Promise<void> {
  const { opened, test: testFile } = contexts.get(context) ?? NOT_OPENED;
  contexts.delete(context);
  if (opened.some((page) => !pages.has(page))) {
    write({ incomplete: UNTRACKED_PAGE, test: testFile });
  }
  await Promise.all(
    opened.map(async (page) => {
      await flush(page);
    }),
  );
}

function writeUnflushed(): void {
  for (const { flushed, test: testFile } of pages.values()) {
    if (!flushed) {
      write({ incomplete: UNFLUSHED_PAGE, test: testFile });
    }
  }
}

function recordBrowserCoverage({ dir, root }: Recording): void {
  where.file = path.join(dir, `${String(process.pid)}.jsonl`);
  where.root = root;
  const instrumentation: unknown = Reflect.get(chromium, "_instrumentation");
  const addListener: unknown =
    typeof instrumentation === "object" && instrumentation !== null && Reflect.get(instrumentation, "addListener");
  if (typeof addListener !== "function") {
    write({ incomplete: NO_INSTRUMENTATION, test: "" });
    return;
  }
  process.on("exit", writeUnflushed);
  Reflect.apply(addListener, instrumentation, [
    { runAfterCreateBrowserContext: afterCreate, runBeforeCloseBrowserContext: beforeClose },
  ]);
}

export { recordBrowserCoverage };
