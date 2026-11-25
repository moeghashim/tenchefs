import { buttonsOf, channelMade, listOpened, made, pressedIn } from "./schedule-lists.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { CookoutClient } from "../../sdk/index.ts";
import { alertSaying } from "./alerts.ts";
import { newIdentity } from "./identities.ts";

async function refusingPauses(channel: string): Promise<CookoutClient> {
  await channelMade(channel);
  const { client } = await newIdentity({ kind: "human", name: `${channel}-maker` });
  await made({ by: client, channel, text: "Retro" });
  const gone = await made({ by: client, channel, text: "Gone" });
  await client.deleteScheduledMessage(gone.id);
  return {
    ...client,
    deleteScheduledMessage: async () => {
      const deleted = await client.deleteScheduledMessage(gone.id);
      return deleted;
    },
    pauseScheduledMessage: async () => {
      const paused = await client.pauseScheduledMessage(gone.id);
      return paused;
    },
  };
}

async function refused(): Promise<string | null> {
  await pressedIn({ button: "Pause", text: "Retro" });
  const alert = await alertSaying("Couldn't change it.");
  return alert.textContent;
}

async function deleteRefused(): Promise<string | null> {
  await pressedIn({ button: "Delete", text: "Retro" });
  const confirming = await screen.findByRole("alertdialog", { name: "Delete this scheduled message?" });
  fireEvent.click(within(confirming).getByRole("button", { name: "Delete" }));
  const alert = await alertSaying("Couldn't delete it.");
  return alert.textContent;
}

function unreadable(client: CookoutClient): CookoutClient {
  return {
    ...client,
    listScheduledMessages: async () => {
      const listed = await client.listScheduledMessages({ channel: "no-such-channel" });
      return listed;
    },
  };
}

async function cancelled(): Promise<readonly string[]> {
  await pressedIn({ button: "Delete", text: "Retro" });
  const confirming = await screen.findByRole("alertdialog", { name: "Delete this scheduled message?" });
  fireEvent.click(within(confirming).getByRole("button", { name: "Cancel" }));
  await waitFor(() => {
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
  const buttons = await buttonsOf("Retro");
  return buttons;
}

it("a refused change says why on its row, and cancelling a delete keeps the schedule", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const channel = "web-schedule-list-refused";
  const client = await refusingPauses(channel);
  const close = await listOpened({ channel, client });
  const said = await refused();

  expect([said, await cancelled()]).toStrictEqual([
    expect.stringMatching(/^Couldn't change it\. .+\(scheduled_message_not_found\)$/u),
    ["Pause", "Edit", "Delete"],
  ]);

  close();
});

it("a refused delete says why in its confirmation", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const channel = "web-schedule-list-refused-delete";
  const close = await listOpened({ channel, client: await refusingPauses(channel) });

  await expect(deleteRefused()).resolves.toMatch(/^Couldn't delete it\. .+\(scheduled_message_not_found\)$/u);

  close();
});

it("a refused read of the schedules says it couldn't load them", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const channel = "web-schedule-list-unreadable";
  const close = await listOpened({ channel, client: unreadable(await refusingPauses(channel)) });
  const alert = await alertSaying("Couldn't load the scheduled messages.");

  expect(alert.textContent).toBe("Couldn't load the scheduled messages.");

  close();
});
