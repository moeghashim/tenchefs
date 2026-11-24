import type { CookoutClient, EventStream } from "../../sdk/index.ts";
import { expect, it } from "vitest";
import { inPane, inSidebar } from "./regions.ts";
import { screen, waitFor, within } from "@testing-library/react";
import { adminClient } from "./identities.ts";
import { openAt } from "./render.tsx";
import { subscribedReader } from "./inbox-reader.ts";
import { watched } from "./watched.ts";

interface OpenInbox {
  readonly channel: string;
  readonly also: string;
  readonly poster: CookoutClient;
  readonly reader: CookoutClient;
  readonly close: () => Promise<void>;
}

const BOTH_READ = 2;

async function openWatched(channel: string): Promise<OpenInbox> {
  const also = `${channel}-kept`;
  const { poster, reader } = await subscribedReader(channel, also);
  const { live, stream } = watched(reader);
  const unmount = openAt({ client: reader, hash: "#/inbox", live });
  await screen.findByText("You're all caught up.");
  const events: EventStream = await stream;
  return {
    also,
    channel,
    close: async () => {
      unmount();
      await events.close();
    },
    poster,
    reader,
  };
}

function inboxBadges(): readonly string[] {
  const link = inSidebar().getByRole("link", { name: /^Inbox(?![a-z-])/u });
  const texts: string[] = [];
  for (const badge of within(link).queryAllByText(/^\d+ (?:unread|for you)$/u)) {
    texts.push(badge.textContent);
  }
  return texts;
}

function rowTexts(label: string): readonly string[] {
  const list = inPane().queryByRole("list", { name: label });
  const texts: string[] = [];
  if (list === null) {
    return texts;
  }
  for (const row of within(list).queryAllByRole("listitem")) {
    texts.push(row.textContent);
  }
  return texts;
}

async function postedUnread({ also, channel, poster }: OpenInbox): Promise<void> {
  await poster.createMessage({ channel, text: `@${channel}-reader look` });
  await poster.createMessage({ channel, text: "Anyone?" });
  await poster.createMessage({ channel: also, text: "Still here" });
  await within(await screen.findByRole("list", { name: "For you" })).findByRole("link", { name: /^Mentioned you/u });
}

async function postedRead({ also, channel, poster, reader }: OpenInbox): Promise<void> {
  const { message: gone } = await poster.createMessage({ channel, text: `@${channel}-reader gone soon` });
  const { message: kept } = await poster.createMessage({ channel: also, text: `@${channel}-reader kept` });
  await reader.ack(gone.id);
  await reader.ack(kept.id);
  const earlier = await screen.findByRole("list", { name: "Earlier" });
  await waitFor(() => {
    expect(within(earlier).getAllByRole("listitem")).toHaveLength(BOTH_READ);
  });
}

it("a channel deleted while the Inbox is open takes its rows out of For you, Activity and the count, live", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const inbox = await openWatched("web-inbox-deleted");
  await postedUnread(inbox);
  await adminClient().deleteChannel(inbox.channel);

  await waitFor(() => {
    expect([rowTexts("For you"), rowTexts("Activity"), inboxBadges()]).toStrictEqual([
      [],
      [expect.stringContaining("Still here")],
      ["1 unread"],
    ]);
  });

  await inbox.close();
});

it("a channel deleted while the Inbox is open takes its read rows out of Earlier, live", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const inbox = await openWatched("web-inbox-deleted-earlier");
  await postedRead(inbox);
  await adminClient().deleteChannel(inbox.channel);

  await waitFor(() => {
    expect(rowTexts("Earlier")).toStrictEqual([expect.stringContaining("kept")]);
  });

  await inbox.close();
});
