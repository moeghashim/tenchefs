import { expect, it, vi } from "vitest";
import type { ScheduledMessage } from "../../sdk/index.ts";
import type { Scheduling } from "../index.ts";
import { browserClock } from "../../format/index.ts";
import { createCookoutClient } from "../../sdk/index.ts";
import { createScheduling } from "../index.ts";
import { isChannelName } from "../../channels/index.ts";
import { webTestCookout } from "../../../../scripts/web-test-server.ts";

const NO_PAUSE = 0;
const ONCE = 1;

type Edit = (id: ScheduledMessage["id"], request: object) => Promise<ScheduledMessage>;

function schedulingWith(create: () => never, edit: Edit = create): Scheduling {
  return createScheduling({
    clock: browserClock,
    create,
    edit,
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
  scheduling.open({ channel, thread: null }, "Standup");
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

async function oneOff(): Promise<ScheduledMessage> {
  const client = createCookoutClient({ env: {}, token: webTestCookout().adminToken, url: webTestCookout().url });
  await client.createChannel({ name: "board-scheduling-edit" }).catch(() => null);
  const { scheduledMessage } = await client.createScheduledMessage({
    at: "2099-06-01T09:30",
    channel: "board-scheduling-edit",
    text: "Deploy window",
    timeZone: "Europe/London",
  });
  return scheduledMessage;
}

it("editing a schedule opens with its text and its time in its zone, and saving edits it by ID", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const schedule = await oneOff();
  const edit = vi.fn<Edit>(async () => {
    await Promise.resolve();
    return schedule;
  });
  const scheduling = schedulingWith(vi.fn<() => never>(), edit);
  scheduling.openEdit(schedule);
  const { channel, date, editing, kind, text, time, timeZone } = scheduling.snapshot();
  const saved = vi.fn<() => void>();
  scheduling.save(saved);
  await vi.waitFor(() => {
    expect(saved).toHaveBeenCalledTimes(ONCE);
  });

  expect([{ channel, date, editing, kind, text, time, timeZone }, edit.mock.calls]).toStrictEqual([
    {
      channel: "board-scheduling-edit",
      date: "2099-06-01",
      editing: schedule.id,
      kind: "once",
      text: "Deploy window",
      time: "09:30",
      timeZone: "Europe/London",
    },
    [[schedule.id, { at: "2099-06-01T09:30", text: "Deploy window", timeZone: "Europe/London" }]],
  ]);
});
