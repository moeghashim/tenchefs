import { RECEIVER_URL, startWebTestCookout } from "./web-test-server.ts";
import type { Environment } from "vitest/runtime";
import { builtinEnvironments } from "vitest/runtime";

const { jsdom } = builtinEnvironments;

const webTestEnvironment: Environment = {
  ...jsdom,
  name: "jsdom-cookout",
  setup: async (global: unknown, options: Readonly<Record<string, unknown>>) => {
    const cookout = await startWebTestCookout();
    Reflect.set(globalThis, RECEIVER_URL, cookout.receiverUrl);
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
