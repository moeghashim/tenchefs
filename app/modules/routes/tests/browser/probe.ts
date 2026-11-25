import type { Fixtures, Page, PlaywrightTestArgs, PlaywrightTestOptions, PlaywrightWorkerArgs } from "@playwright/test";
import type { SlowOptions } from "./slow.ts";
import { test as base } from "@playwright/test";
import { readProbeReport } from "../../../probe/index.ts";
import { slowFixtures } from "./slow.ts";

interface ProbeOptions {
  readonly probe: boolean;
}

interface ProbeFixtures {
  readonly probeOtherContexts: null;
}

interface PageReport {
  readonly url: string;
  readonly report: string | null;
}

async function reportOf(page: Page): Promise<PageReport> {
  const report = await page.evaluate(readProbeReport, null).catch(() => null);
  return { report, url: page.url() };
}

async function attachReports(probe: boolean, pages: readonly Page[]): Promise<void> {
  const testInfo = base.info();
  if (!probe || testInfo.status === testInfo.expectedStatus) {
    return;
  }
  const reading: Promise<PageReport>[] = [];
  for (const page of pages) {
    reading.push(reportOf(page));
  }
  const reports = await Promise.all(reading);
  const attached = reports.flatMap(({ report, url }) => {
    if (report === null) {
      return [];
    }
    return [testInfo.attach(`probe of ${url}`, { body: report, contentType: "text/plain" })];
  });
  await Promise.all(attached);
}

const probeFixtures: Fixtures<
  ProbeFixtures & ProbeOptions & SlowOptions,
  object,
  PlaywrightTestArgs & PlaywrightTestOptions,
  PlaywrightWorkerArgs
> = {
  ...slowFixtures,
  page: async ({ page, probe }, provide) => {
    await provide(page);
    await attachReports(probe, page.context().pages());
  },
  probe: [false, { option: true }],
  probeOtherContexts: [
    async ({ browser, probe }, provide) => {
      await provide(null);
      const pages: Page[] = [];
      for (const context of browser.contexts()) {
        pages.push(...context.pages());
      }
      await attachReports(probe, pages);
    },
    { auto: true },
  ],
};

export { type ProbeFixtures, type ProbeOptions, probeFixtures };
