import { expect, it, vi } from "vitest";
import type { Scheduling } from "../index.ts";
import { browserClock } from "../../format/index.ts";
import { createScheduling } from "../index.ts";
import { isChannelName } from "../../channels/index.ts";

const NO_PAUSE = 0;

function schedulingWith(create: () => never): Scheduling {
  return createScheduling({
    clock: browserClock,
    create,
    pause: NO_PAUSE,
    preview: async () => {
      await Promise.resolve();
      return [];
    },
    timeZone: "Europe/London",
  });
}

function openOn(scheduling: Scheduling, channel: string): void {
  if (!isChannelName(channel)) {
    throw new TypeError(`Not a channel name: ${channel}`);
  }
  scheduling.open(channel, "Standup");
}

it("saving before a time or a cron expression is given sends nothing", { timeout: 2000 }, () => {
  expect.hasAssertions();

  const create = vi.fn<() => never>();
  const saved = vi.fn<() => void>();
  const scheduling = schedulingWith(create);
  openOn(scheduling, "general");
  scheduling.save(saved);

  expect([create.mock.calls, saved.mock.calls, scheduling.snapshot().save]).toStrictEqual([[], [], { status: "idle" }]);
});
