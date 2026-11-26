import type { CookoutEvent, EventStream } from "../../sdk/index.ts";
import type { Live, WatchedLive } from "../../testing/web.ts";
import { expect, it } from "vitest";
import { adminClient } from "./identities.ts";
import { watchedLive } from "../../testing/web.ts";

const BEFORE = "web-heard-before";
const AFTER = "web-heard-after";

function isChannel(name: string): (event: CookoutEvent) => boolean {
  return (event) => event.type === "channel" && event.channel.name === name;
}

async function followedUntil(live: Live, name: string): Promise<boolean> {
  const { promise, resolve } = Promise.withResolvers<boolean>();
  const matches = isChannel(name);
  live.follow({
    back: () => {
      resolve(false);
    },
    heard: (event) => {
      if (matches(event)) {
        resolve(true);
      }
    },
  });
  const handed = await promise;
  return handed;
}

async function heardOnceHanded(heard: WatchedLive["heard"], handed: Promise<boolean>): Promise<string> {
  await adminClient().createChannel({ name: BEFORE });
  await handed;
  await heard(isChannel(BEFORE));
  return BEFORE;
}

async function heardWhenHanded(heard: WatchedLive["heard"]): Promise<string> {
  const after = heard(isChannel(AFTER));
  await adminClient().createChannel({ name: AFTER });
  await after;
  return AFTER;
}

it("heard resolves for an event the live already handed on, and for one it hands on later", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { heard, live, stream } = watchedLive(adminClient());
  const handed = followedUntil(live, BEFORE);
  const events: EventStream = await stream;
  const heardNames = [await heardOnceHanded(heard, handed), await heardWhenHanded(heard)];

  expect(heardNames).toStrictEqual([BEFORE, AFTER]);

  await events.close();
});
