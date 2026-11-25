import {
  LIST,
  buttonsOf,
  channelMade,
  linesOf,
  listDialog,
  listOpened,
  made,
  pressedIn,
  rowOf,
} from "./schedule-lists.ts";
import { adminClient, clientWith, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { CookoutClient } from "../../sdk/index.ts";
import { createTestAgent } from "../../testing/index.ts";

const EDIT = "Edit a scheduled message";
const CONTROLS = ["Pause", "Edit", "Delete"] as const;

async function deactivatedMaker(channel: string): Promise<void> {
  const maker = await newIdentity({ kind: "human", name: `${channel}-maker` });
  await made({ by: maker.client, channel, text: "Their standup" });
  await adminClient().deactivateIdentity(`${channel}-maker`);
}

async function fieldsBoard(channel: string): Promise<void> {
  await channelMade(channel);
  await made({ by: adminClient(), channel, cron: "0 9 * * 1-5", text: "Standup" });
  await adminClient().createScheduledMessage({
    at: "2099-06-01T09:30",
    channel,
    text: "Deploy window",
    timeZone: "Europe/London",
  });
  const paused = await made({ by: adminClient(), channel, cron: "15 8 1 * *", text: "Invoices" });
  await adminClient().pauseScheduledMessage(paused.id);
  await made({ by: adminClient(), channel, cron: "0 9 21 6 *", text: "Midsummer" });
  await deactivatedMaker(channel);
}

it("the channel menu's Scheduled messages lists the channel's schedules with their timing, zone, next run, creator and state", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const channel = "web-schedule-list-fields";
  await fieldsBoard(channel);
  const close = await listOpened({ channel, client: adminClient() });
  const shown = await Promise.all(
    ["Standup", "Deploy window", "Invoices", "Midsummer", "Their standup"].map(async (text) => {
      const lines = await linesOf(text);
      return lines;
    }),
  );

  expect(shown).toStrictEqual([
    [
      "Standup",
      "Weekdays at 09:00 (0 9 * * 1-5)",
      expect.stringMatching(/^Next run \w{3}, .+, 09:00 · UTC$/u),
      "Created by @admin",
    ],
    [
      "Deploy window",
      "Once, at Mon, 1 Jun 2099, 09:30",
      "Next run Mon, 1 Jun 2099, 09:30 · Europe/London",
      "Created by @admin",
    ],
    ["Invoices", "On day 1 of every month at 08:15 (15 8 1 * *)", "No next run · UTC", "Created by @admin", "Paused"],
    [
      "Midsummer",
      "Cron 0 9 21 6 *",
      expect.stringMatching(/^Next run \w{3}, 21 Jun \d{4}, 09:00 · UTC$/u),
      "Created by @admin",
    ],
    [
      "Their standup",
      "Every day at 09:00 (0 9 * * *)",
      "No next run · UTC",
      `Created by @${channel}-maker`,
      "Paused: its creator was deactivated",
    ],
  ]);

  close();
});

it("a channel with nothing scheduled says so, and Close shuts the list", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const channel = "web-schedule-list-empty";
  await channelMade(channel);
  const close = await listOpened({ channel, client: adminClient() });
  const said = await within(listDialog()).findByText(`Nothing is scheduled in #${channel}.`);
  fireEvent.click(within(listDialog()).getByRole("button", { name: "Close" }));
  await waitFor(() => {
    expect(screen.queryByRole("dialog", { name: LIST })).toBeNull();
  });

  expect(said.textContent).toBe(`Nothing is scheduled in #${channel}.`);

  close();
});

type Viewer = "maker" | "owner" | "stranger" | "admin";

async function viewerClient(viewer: Viewer, channel: string): Promise<CookoutClient> {
  if (viewer === "admin") {
    return adminClient();
  }
  const { client } = await newIdentity({ kind: "human", name: `${channel}-${viewer}-viewer` });
  return client;
}

async function permissionBoard(channel: string): Promise<Readonly<Record<Viewer, CookoutClient>>> {
  await channelMade(channel);
  const [maker, owner, stranger] = await Promise.all([
    viewerClient("maker", channel),
    viewerClient("owner", channel),
    viewerClient("stranger", channel),
  ]);
  const agent = await createTestAgent({ by: owner, name: `${channel}-agent` });
  await made({ by: maker, channel, text: "The maker's" });
  await made({ by: clientWith(agent.token), channel, text: "The agent's" });
  return { admin: adminClient(), maker, owner, stranger };
}

it.for([
  ["maker", CONTROLS, []],
  ["owner", [], CONTROLS],
  ["stranger", [], []],
  ["admin", CONTROLS, CONTROLS],
] as const)(
  "the Pause, Edit and Delete buttons show to the %s only on the schedules it may change",
  {
    timeout: 10_000,
  },
  async ([viewer, makers, agents]) => {
    expect.hasAssertions();

    const channel = `web-schedule-list-may-${viewer}`;
    const clients = await permissionBoard(channel);
    const close = await listOpened({ channel, client: clients[viewer] });
    const shown = await Promise.all(
      ["The maker's", "The agent's"].map(async (text) => {
        const buttons = await buttonsOf(text);
        return buttons;
      }),
    );

    expect(shown).toStrictEqual([makers, agents]);

    close();
  },
);

async function pausedAndResumed(text: string): Promise<readonly (readonly string[])[]> {
  await pressedIn({ button: "Pause", text });
  await within(await rowOf(text)).findByRole("button", { name: "Resume" });
  const paused = await buttonsOf(text);
  await pressedIn({ button: "Resume", text });
  await within(await rowOf(text)).findByRole("button", { name: "Pause" });
  return [paused, await buttonsOf(text)];
}

async function edited(text: string, to: string): Promise<readonly string[]> {
  await pressedIn({ button: "Edit", text });
  const editing = await screen.findByRole("dialog", { name: EDIT });
  const filled = [
    within(editing).getByLabelText<HTMLInputElement>("Text").value,
    within(editing).getByLabelText<HTMLInputElement>("Cron expression").value,
  ];
  await within(editing).findByRole("list", { name: "Next runs" });
  fireEvent.change(within(editing).getByLabelText("Text"), { target: { value: to } });
  fireEvent.click(within(editing).getByRole("button", { name: "Save" }));
  await rowOf(to);
  return filled;
}

async function deleted(text: string, channel: string): Promise<string | null> {
  await pressedIn({ button: "Delete", text });
  const confirming = await screen.findByRole("alertdialog", { name: "Delete this scheduled message?" });
  fireEvent.click(within(confirming).getByRole("button", { name: "Delete" }));
  const said = await waitFor(() => within(listDialog()).getByText(`Nothing is scheduled in #${channel}.`));
  return said.textContent;
}

async function retroBy(channel: string): Promise<CookoutClient> {
  await channelMade(channel);
  const { client } = await newIdentity({ kind: "human", name: `${channel}-maker` });
  await made({ by: client, channel, cron: "30 9 * * 1", text: "Retro" });
  return client;
}

it("its creator pauses, resumes, edits (in the composer's dialog, filled in) and, once confirmed, deletes a schedule", {
  timeout: 15_000,
}, async () => {
  expect.hasAssertions();

  const channel = "web-schedule-list-actions";
  const client = await retroBy(channel);
  const close = await listOpened({ channel, client });
  const toggled = await pausedAndResumed("Retro");
  const filled = await edited("Retro", "Retro, in the big room");
  const { scheduledMessages } = await adminClient().listScheduledMessages({ channel });
  const gone = await deleted("Retro, in the big room", channel);

  expect([toggled, filled, scheduledMessages.map(({ cron, text }) => ({ cron, text })), gone]).toStrictEqual([
    [
      ["Resume", "Edit", "Delete"],
      ["Pause", "Edit", "Delete"],
    ],
    ["Retro", "30 9 * * 1"],
    [{ cron: "30 9 * * 1", text: "Retro, in the big room" }],
    `Nothing is scheduled in #${channel}.`,
  ]);

  close();
});

it("cancelling an edit gives focus back to that schedule's Edit", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const channel = "web-schedule-list-edit-cancel";
  const client = await retroBy(channel);
  const close = await listOpened({ channel, client });
  await pressedIn({ button: "Edit", text: "Retro" });
  const editing = await screen.findByRole("dialog", { name: EDIT });
  fireEvent.click(within(editing).getByRole("button", { name: "Cancel" }));
  const edit = within(await rowOf("Retro")).getByRole("button", { name: "Edit" });

  await waitFor(() => {
    expect(globalThis.document.activeElement).toBe(edit);
  });

  close();
});
