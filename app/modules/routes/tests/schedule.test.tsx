import { expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { inPane, inThread } from "./regions.ts";
import type { ScheduledMessage } from "../../scheduled-messages/index.ts";
import { adminClient } from "./identities.ts";
import { openAt } from "./render.tsx";

const SHOWN_RUNS = 3;
const ONE = 1;
const TITLE = "Schedule a message";

function dialog(): HTMLElement {
  return screen.getByRole("dialog", { name: TITLE });
}

async function openChannel(channel: string, text: string): Promise<() => void> {
  await adminClient().createChannel({ name: channel });
  const close = openAt({ client: adminClient(), hash: `#/channels/${channel}` });
  fireEvent.change(await screen.findByLabelText("Message"), { target: { value: `/schedule ${text}` } });
  fireEvent.keyDown(screen.getByLabelText("Message"), { key: "Enter" });
  await screen.findByRole("dialog", { name: TITLE });
  return close;
}

function edit(label: string, value: string): void {
  fireEvent.change(within(dialog()).getByLabelText(label), { target: { value } });
}

function recurring(cron: string): void {
  fireEvent.click(within(dialog()).getByRole("radio", { name: "Recurring" }));
  edit("Cron expression", cron);
}

async function runsShown(): Promise<readonly string[]> {
  const list = await within(dialog()).findByRole("list", { name: "Next runs" });
  const runs: string[] = [];
  for (const time of list.querySelectorAll("time")) {
    runs.push(time.dateTime);
  }
  return runs;
}

async function runsAfter(label: string, value: string, ending: string): Promise<number> {
  edit(label, value);
  const runs = await vi.waitUntil(async () => {
    const shown = await runsShown();
    return shown.every((run) => run.endsWith(ending)) && shown;
  });
  return runs.length;
}

async function saved(channel: string): Promise<readonly ScheduledMessage[]> {
  await runsShown();
  fireEvent.click(within(dialog()).getByRole("button", { name: "Schedule" }));
  await screen.findByText(/^Scheduled\. Its next run is/u);
  const { scheduledMessages } = await adminClient().listScheduledMessages({ channel });
  return scheduledMessages;
}

async function refusalOf(cron: string, words: Readonly<RegExp>): Promise<readonly [string | null, boolean]> {
  edit("Cron expression", cron);
  const shown = await within(dialog()).findByText(words);
  const button = within(dialog()).getByRole<HTMLButtonElement>("button", { name: "Schedule" });
  return [shown.textContent, button.disabled];
}

async function refusedOnSave(): Promise<string | null> {
  fireEvent.click(within(dialog()).getByRole("button", { name: "Schedule" }));
  const refusal = await within(dialog()).findByRole("alert");
  return refusal.textContent;
}

async function closedByEscape(): Promise<void> {
  fireEvent.keyDown(dialog(), { key: "Escape" });
  await waitFor(() => {
    expect(screen.queryByRole("dialog", { name: TITLE })).toBeNull();
  });
}

function browserZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

it("/schedule opens a dialog with the rest of the composer's text, and saving a recurring schedule creates it in the browser's zone", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const close = await openChannel("web-schedule-recurring", "Standup starts now");
  const seeded = within(dialog()).getByLabelText<HTMLInputElement>("Text").value;
  edit("Text", "Standup starts now, @admin");
  recurring("0 9 * * 1-5");
  const schedules = await saved("web-schedule-recurring");
  fireEvent.click(inPane().getByRole("button", { name: "Dismiss" }));

  expect([
    seeded,
    schedules.map(({ cron, text, timeZone }) => ({ cron, text, timeZone })),
    screen.getByLabelText<HTMLTextAreaElement>("Message").value,
    screen.queryByText(/^Scheduled\./u),
  ]).toStrictEqual([
    "Standup starts now",
    [{ cron: "0 9 * * 1-5", text: "Standup starts now, @admin", timeZone: browserZone() }],
    "",
    null,
  ]);

  close();
});

it("a once schedule is created with its date, time and zone", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const close = await openChannel("web-schedule-once", "The deploy window opens now");
  recurring("0 9 * * *");
  fireEvent.click(within(dialog()).getByRole("radio", { name: "Once" }));
  edit("Date", "2099-06-01");
  edit("Time", "09:30");
  edit("Time zone", "Europe/London");
  const schedules = await saved("web-schedule-once");

  expect(schedules.map(({ at, timeZone }) => ({ at, timeZone }))).toStrictEqual([
    { at: "2099-06-01T08:30:00.000Z", timeZone: "Europe/London" },
  ]);

  close();
});

it("the next 3 runs follow the cron expression and the time zone as they change", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const close = await openChannel("web-schedule-preview", "Daily");
  edit("Time zone", "UTC");
  recurring("0 9 * * *");
  const inUtc = await runsAfter("Cron expression", "0 9 * * *", "T09:00:00.000Z");
  const later = await runsAfter("Cron expression", "30 9 * * *", "T09:30:00.000Z");
  const inTokyo = await runsAfter("Time zone", "Asia/Tokyo", "T00:30:00.000Z");

  expect([inUtc, later, inTokyo]).toStrictEqual([SHOWN_RUNS, SHOWN_RUNS, SHOWN_RUNS]);

  close();
});

it("a cron expression that runs too often or isn't valid shows why, and can't be saved", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const close = await openChannel("web-schedule-refused", "Too often");
  recurring("0 9 * * *");
  await runsShown();
  const tooOften = await refusalOf("*/5 * * * *", /more often than every 30 minutes/u);
  const invalid = await refusalOf("not a cron", /isn't a 5-field cron expression/u);

  expect([tooOften, invalid]).toStrictEqual([
    ["That runs more often than every 30 minutes.", true],
    [expect.stringMatching(/^That isn't a 5-field cron expression/u), true],
  ]);

  close();
});

it("a thread's reply box can't schedule, since every run posts at the top level", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  await adminClient().createChannel({ name: "web-schedule-thread" });
  const { message } = await adminClient().createMessage({ channel: "web-schedule-thread", text: "The parent" });
  const close = openAt({
    client: adminClient(),
    hash: `#/channels/web-schedule-thread/threads/${String(message.id)}`,
  });
  await inThread().findByRole("textbox", { name: "Reply" });

  expect(inThread().queryByRole("button", { name: "Post later" })).toBeNull();

  close();
});

it("a refusal on saving shows in the dialog, and Escape closes it without scheduling", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const close = await openChannel("web-schedule-save-refused", "Into a channel about to go");
  recurring("0 9 * * *");
  await runsShown();
  await adminClient().deleteChannel("web-schedule-save-refused");
  const refused = await refusedOnSave();
  await closedByEscape();

  expect(refused).toMatch(/^Couldn't schedule it\. .*\(channel_not_found\)$/u);

  close();
});

interface Written {
  readonly box: HTMLElement;
  readonly close: () => void;
}

async function written(channel: string, text: string): Promise<Written> {
  await adminClient().createChannel({ name: channel });
  const close = openAt({ client: adminClient(), hash: `#/channels/${channel}` });
  const box = await screen.findByLabelText("Message");
  fireEvent.change(box, { target: { value: text } });
  box.focus();
  return { box, close };
}

it("ctrl+Shift+Enter in a channel's message box opens the Schedule dialog with its text", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const { box, close } = await written("web-schedule-key", "Standup by key");
  fireEvent.keyDown(box, { ctrlKey: true, key: "Enter", shiftKey: true });
  await screen.findByRole("dialog", { name: TITLE });

  expect(within(dialog()).getByLabelText<HTMLInputElement>("Text").value).toBe("Standup by key");

  close();
});

it("ctrl+Shift+Enter in the Schedule dialog's Text field opens no second dialog", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const { box, close } = await written("web-schedule-key-field", "Standup twice");
  fireEvent.keyDown(box, { ctrlKey: true, key: "Enter", shiftKey: true });
  const field = within(await screen.findByRole("dialog", { name: TITLE })).getByLabelText("Text");
  field.focus();
  fireEvent.keyDown(field, { ctrlKey: true, key: "Enter", shiftKey: true });

  expect(screen.getAllByRole("dialog", { name: TITLE })).toHaveLength(ONE);

  close();
});
