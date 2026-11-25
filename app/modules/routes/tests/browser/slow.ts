import type { Fixtures, PlaywrightTestArgs, PlaywrightTestOptions } from "@playwright/test";

interface SlowOptions {
  readonly slowMs: number;
}

const NO_DELAY = 0;
const BOARD_CALLS = "**/v1/**";
const LIVE_STREAM = "/v1/events";

const slowFixtures: Fixtures<SlowOptions, object, PlaywrightTestArgs & PlaywrightTestOptions> = {
  context: async ({ context, slowMs }, provide) => {
    if (slowMs !== NO_DELAY) {
      await context.route(BOARD_CALLS, async (route) => {
        const page = route.request().frame().page();
        if (route.request().url().includes(LIVE_STREAM)) {
          await page.waitForTimeout(slowMs);
          await route.fallback();
          return;
        }
        const response = await route.fetch();
        await page.waitForTimeout(slowMs);
        await route.fulfill({ response });
      });
    }
    await provide(context);
    await context.unrouteAll({ behavior: "ignoreErrors" });
  },
  slowMs: [NO_DELAY, { option: true }],
};

export { type SlowOptions, slowFixtures };
