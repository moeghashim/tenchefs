import { expect, it } from "vitest";
import { channelNamePattern } from "../../channels/index.ts";
import { plainNamePattern } from "../../identities/index.ts";
import { uniqueName } from "../../testing/index.ts";

const FIRST = { retry: 0, testId: "0123456789abcdef-aaaaaaaaaaaa11111111" };
const REPEAT = { retry: 0, testId: "0123456789abcdef-bbbbbbbbbbbb22222222" };
const RETRY = { retry: 1, testId: FIRST.testId };

it("names the same thing the same way within one run of a test, and differently in a repeat or a retry", {
  timeout: 1000,
}, () => {
  expect.hasAssertions();

  const named = uniqueName({ name: "browser-post", run: FIRST });

  expect(named).toMatch(/^browser-post-/u);
  expect(uniqueName({ name: "browser-post", run: FIRST })).toBe(named);
  expect(uniqueName({ name: "browser-post", run: REPEAT })).not.toBe(named);
  expect(uniqueName({ name: "browser-post", run: RETRY })).not.toBe(named);
  expect(uniqueName({ name: "browser-poster", run: FIRST })).toMatch(/^browser-poster-/u);
});

it("keeps a name a valid channel and identity name", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const named = uniqueName({ name: "browser-post-reviewer", run: RETRY });

  expect(named).toMatch(channelNamePattern);
  expect(named).toMatch(plainNamePattern);
});
