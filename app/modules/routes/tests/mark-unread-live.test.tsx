import type { CookoutClient, MessageId } from "../../sdk/index.ts";
import { expect, it } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { rowsOf, subscribedReader } from "./inbox-reader.ts";
import { agentShown } from "./identities.ts";
import { messagesIn } from "./messages.ts";
import { openAt } from "./render.tsx";
import { watched } from "./watched.ts";

interface ReadEverywhere {
  readonly reader: CookoutClient;
  readonly marked: readonly MessageId[];
}

interface Watching {
  readonly reader: CookoutClient;
  readonly close: () => Promise<void>;
  readonly marked: readonly MessageId[];
}

async function readEverywhere(channel: string): Promise<ReadEverywhere> {
  const { poster, reader } = await subscribedReader(channel, `${channel}-also`);
  const { message: parent } = await reader.createMessage({ channel, text: "Deploy?" });
  await poster.createMessage({ channel, replyTo: parent.id, text: "Noon" });
  const { message: one } = await poster.createMessage({ channel, text: "One" });
  const { message: two } = await poster.createMessage({ channel: `${channel}-also`, text: "Two" });
  await reader.ackAll(two.id);
  return { marked: [one.id, two.id], reader };
}

function earlierTexts(): readonly string[] {
  return rowsOf("Earlier").map((row) => row.slice(row.lastIndexOf("now") + "now".length));
}

async function inboxWatched(channel: string): Promise<Watching> {
  const { marked, reader } = await readEverywhere(channel);
  const { live, stream } = watched(reader);
  const unmount = openAt({ client: reader, hash: "#/inbox", live });
  await screen.findByRole("list", { name: "Earlier" });
  const events = await stream;
  return {
    close: async () => {
      unmount();
      await events.close();
    },
    marked,
    reader,
  };
}

function refusingMarkUnread(reader: CookoutClient): CookoutClient {
  return {
    ...reader,
    markUnread: async () => {
      await Promise.resolve();
      throw new Error("down");
    },
  };
}

it("messages another session marks unread leave this tab's Earlier list and are unread again", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { close, marked, reader } = await inboxWatched("web-mark-unread-live");
  const before = earlierTexts();

  await Promise.all(
    marked.map(async (id) => {
      await reader.markUnread(id);
    }),
  );
  await screen.findByRole("heading", { level: 2, name: "Activity 2" });

  expect([before, earlierTexts()]).toStrictEqual([["Two", "One", "re: Deploy?Noon"], ["re: Deploy?Noon"]]);

  await close();
});

it("a mark unread the server refuses closes the menu and leaves the messages read", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const channel = "web-mark-unread-down";
  const { poster, reader } = await subscribedReader(channel);
  await poster.createMessage({ channel, text: "Only" });
  const unmount = openAt({ client: refusingMarkUnread(reader), hash: `#/channels/${channel}` });
  await screen.findByText("Only");

  fireEvent.contextMenu(screen.getByText("Only"));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Mark unread" }));

  expect([screen.queryAllByRole("menu"), await messagesIn("Messages")]).toStrictEqual([
    [],
    [`${agentShown(`${channel}-poster`)}agentOnly`],
  ]);

  unmount();
});
