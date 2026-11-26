import { expect, it } from "vitest";
import { mergedShards, shardFile } from "../lib/coverage-shards.ts";
import type { Outcome } from "../lib/tools.ts";
import type { Span } from "../lib/page-coverage.ts";

const VIEW = "app/modules/views/lib/panel.tsx";
const SHOWN_START = 3;
const SHOWN_END = 6;
const HIDDEN_START = 8;
const HIDDEN_END = 11;
const SHOWN: Span = [SHOWN_START, SHOWN_END];
const HIDDEN: Span = [HIDDEN_START, HIDDEN_END];
const FUNCTIONS = [SHOWN, HIDDEN];

function valueOf<Value>(outcome: Outcome<Value>): Value {
  if (!outcome.ok) {
    throw new Error(outcome.reason);
  }
  return outcome.value;
}

function ran(called: readonly Span[]): {
  readonly [VIEW]: { readonly called: readonly Span[]; readonly functions: readonly Span[] };
} {
  return { [VIEW]: { called, functions: FUNCTIONS } };
}

const FIRST = valueOf(
  shardFile({
    commit: "abc123",
    coverage: [
      { files: ran([SHOWN]), test: "a.browser.test.ts" },
      { files: ran([]), test: "b.browser.test.ts" },
    ],
    shard: "1/2",
  }),
);

const SECOND = valueOf(
  shardFile({
    commit: "abc123",
    coverage: [
      { files: ran([HIDDEN]), test: "a.browser.test.ts" },
      { files: ran([HIDDEN]), test: "c.browser.test.ts" },
      { incomplete: "a page closed before its coverage was taken", test: "b.browser.test.ts" },
    ],
    shard: "2/2",
  }),
);

it("merges every shard's map into one, leaving out a test some shard couldn't record all of", { timeout: 1000 }, () => {
  expect.hasAssertions();

  expect(mergedShards([SECOND, FIRST])).toStrictEqual({
    ok: true,
    value: {
      commit: "abc123",
      files: { [VIEW]: FUNCTIONS },
      tests: { "a.browser.test.ts": { [VIEW]: FUNCTIONS }, "c.browser.test.ts": { [VIEW]: [HIDDEN] } },
    },
  });
});

it("makes no map from shards that aren't one whole run at one commit", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const elsewhere = FIRST.replace("abc123", "def456");
  const merged = [
    mergedShards([FIRST]),
    mergedShards([elsewhere, SECOND]),
    mergedShards([FIRST, FIRST]),
    mergedShards([FIRST, "not json"]),
    mergedShards([]),
  ];

  expect(merged).toStrictEqual(
    merged.map(() => ({ ok: false, reason: "CI's coverage maps aren't every shard of one run at one commit" })),
  );
});
