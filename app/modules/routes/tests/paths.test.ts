import { expect, it } from "vitest";
import { hrefOf, locationOf } from "../../paths/index.ts";

const REPLY = "#/channels/general/threads/7/messages/9";

function rebuilt(hash: string): string {
  const { route } = locationOf(hash);
  if (route.name !== "thread") {
    throw new TypeError(`${hash} is no thread route`);
  }
  return hrefOf(route);
}

it("a link to one reply names its channel, thread and message, and builds back to the same hash", {
  timeout: 1000,
}, () => {
  expect.hasAssertions();

  expect(locationOf(REPLY)).toStrictEqual({
    profile: null,
    route: { channel: "general", message: 9, name: "thread", thread: 7 },
  });
  expect(rebuilt(REPLY)).toBe(REPLY);
});

it("a top-level message's own link names the thread as its message", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const own = "#/channels/general/threads/7/messages/7";

  expect(locationOf(own).route).toStrictEqual({ channel: "general", message: 7, name: "thread", thread: 7 });
  expect(rebuilt(own)).toBe(own);
});

it("a thread link without a message still names no message", { timeout: 1000 }, () => {
  expect.hasAssertions();

  const thread = "#/channels/general/threads/7";

  expect(locationOf(thread).route).toStrictEqual({ channel: "general", name: "thread", thread: 7 });
  expect(rebuilt(thread)).toBe(thread);
});

it("a reply link whose message isn't a message ID names no page", { timeout: 1000 }, () => {
  expect.hasAssertions();

  expect(
    ["#/channels/general/threads/7/messages/x", "#/channels/general/threads/7/messages/0"].map(
      (hash) => locationOf(hash).route,
    ),
  ).toStrictEqual([{ name: "missing" }, { name: "missing" }]);
});

it("a profile opened over a reply link opens beside the channel", { timeout: 1000 }, () => {
  expect.hasAssertions();

  expect(locationOf(`${REPLY}?profile=ada`)).toStrictEqual({
    profile: "ada",
    route: { channel: "general", name: "channel" },
  });
});
