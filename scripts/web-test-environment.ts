import type { Environment } from "vitest/runtime";
import { builtinEnvironments } from "vitest/runtime";
import { startWebTestCookout } from "./web-test-server.ts";

const { jsdom } = builtinEnvironments;

const webTestEnvironment: Environment = {
  ...jsdom,
  name: "jsdom-cookout",
  setup: async (global: unknown, options: Readonly<Record<string, unknown>>) => {
    const cookout = await startWebTestCookout();
    const page = await jsdom.setup(global, { ...options, jsdom: { url: cookout.url } });
    return {
      teardown: async (done: unknown) => {
        await page.teardown(done);
        await cookout.stop();
      },
    };
  },
};

export default webTestEnvironment;
