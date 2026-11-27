import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { inPane, inSidebar } from "./regions.ts";
import type { CookoutClient } from "../../sdk/index.ts";
import { openAt } from "./render.tsx";
import { subscribedReader } from "./inbox-reader.ts";

interface Posted {
  readonly poster: CookoutClient;
  readonly reader: CookoutClient;
}

async function postedIn(channel: string, also: string): Promise<Posted> {
  const { poster, reader } = await subscribedReader(channel, also);
  await poster.createMessage({ channel: also, text: "Lunch?" });
  const { message: parent } = await reader.createMessage({ channel, text: "Deploy at noon?" });
  await poster.createMessage({ channel, replyTo: parent.id, text: `@${channel}-reader noon` });
  await poster.createMessage({ channel, text: `Or at one, @${channel}-reader?` });
  return { poster, reader };
}

function countsOn(channel: string): readonly (string | null)[] {
  const link = inSidebar().getByRole("link", { name: new RegExp(`^#${channel}(?![a-z-])`, "u") });
  const counts: (string | null)[] = [];
  for (const count of within(link).queryAllByText(/^\d+ (?:unread|for you)$/u)) {
    counts.push(count.textContent);
  }
  return counts;
}

it("marking all as read empties the inbox and clears the channel list's unread counts", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const channel = "web-mark-all";
  const { reader } = await postedIn(channel, `${channel}-also`);
  const unmount = openAt({ client: reader, hash: "#/inbox" });
  await screen.findByRole("heading", { level: 2, name: "For you 2" });

  fireEvent.click(inPane().getByRole("button", { name: "Mark all as read" }));

  await screen.findByText("You're all caught up.");
  const { items } = await reader.inbox();

  expect([countsOn(channel), countsOn(`${channel}-also`), items]).toStrictEqual([[], [], []]);

  unmount();
});

it("a message that arrives after marking all as read stays unread", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const channel = "web-mark-all-later";
  const { poster, reader } = await postedIn(channel, `${channel}-also`);
  const unmount = openAt({ client: reader, hash: "#/inbox" });
  await screen.findByRole("heading", { level: 2, name: "For you 2" });
  const { message } = await poster.createMessage({ channel, text: "Arrived since" });

  fireEvent.click(inPane().getByRole("button", { name: "Mark all as read" }));
  await screen.findByText("You're all caught up.");

  await waitFor(async () => {
    const { items } = await reader.inbox();

    expect(items.map((item) => item.message.id)).toStrictEqual([message.id]);
  });

  unmount();
});

it("marking all as read is off while nothing is unread", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { reader } = await subscribedReader("web-mark-all-none");
  const unmount = openAt({ client: reader, hash: "#/inbox" });
  await screen.findByText("You're all caught up.");

  expect(inPane().getByRole("button", { name: "Mark all as read" }).getAttribute("aria-disabled")).toBe("true");

  unmount();
});

it("marking all as read that can't reach the server says why and leaves the inbox as it was", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const channel = "web-mark-all-down";
  const { reader } = await postedIn(channel, `${channel}-also`);
  const client: CookoutClient = {
    ...reader,
    ackAll: async () => {
      await Promise.resolve();
      throw new Error("down");
    },
  };
  const unmount = openAt({ client, hash: "#/inbox" });
  await screen.findByRole("heading", { level: 2, name: "For you 2" });

  fireEvent.click(inPane().getByRole("button", { name: "Mark all as read" }));
  const alert = await within(screen.getByRole("main")).findByRole("alert");

  expect([alert.textContent, screen.getByRole("heading", { level: 2, name: "For you 2" }).tagName]).toStrictEqual([
    "Couldn't mark all as read (unreachable): Error: down",
    "H2",
  ]);

  unmount();
});
