import type { CookoutClient, EventStream, MessageId } from "../../sdk/index.ts";
import { expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { inSidebar } from "./regions.ts";
import { openWithClockStopped } from "./clock.ts";
import { subscribedReader } from "./inbox-reader.ts";
import { watched } from "./watched.ts";

function badgesOn(channel: string): readonly string[] {
  const link = inSidebar().getByRole("link", { name: new RegExp(`^#${channel}(?![a-z-])`, "u") });
  const badges: string[] = [];
  for (const badge of within(link).queryAllByText(/^\d+ (?:unread|for you)$/u)) {
    badges.push(badge.textContent);
  }
  return badges;
}

async function openInbox(reader: CookoutClient): Promise<() => Promise<void>> {
  const { live, stream } = watched(reader);
  const unmount = openWithClockStopped({ client: reader, hash: "#/inbox", live });
  await screen.findByRole("list", { name: "Earlier" });
  const events: EventStream = await stream;
  return async () => {
    unmount();
    await events.close();
  };
}

const BADGES = ["1 unread", "1 for you"];

interface Thread {
  readonly channel: string;
  readonly parent: MessageId;
  readonly poster: CookoutClient;
  readonly reader: CookoutClient;
}

async function threadWithNews(channel: string): Promise<Thread> {
  const { poster, reader } = await subscribedReader(channel);
  const { message: parent } = await poster.createMessage({ channel, text: "Deploy at noon?" });
  await reader.follow(parent.id);
  await reader.ack(parent.id);
  await poster.createMessage({ channel, replyTo: parent.id, text: `@${channel}-reader look` });
  await poster.createMessage({ channel, replyTo: parent.id, text: "Two" });
  return { channel, parent: parent.id, poster, reader };
}

async function badgesBecome(channel: string, badges: readonly string[]): Promise<void> {
  await waitFor(() => {
    expect(badgesOn(channel)).toStrictEqual(badges);
  });
}

it("closing the only thread with unread replies in a channel keeps its badge, live", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { channel, parent, poster, reader } = await threadWithNews("web-badge-closed");
  const close = await openInbox(reader);
  await badgesBecome(channel, BADGES);

  await poster.closeThread(parent);
  await screen.findByText("Closed");
  await badgesBecome(channel, BADGES);

  await poster.reopenThread(parent);
  await badgesBecome(channel, BADGES);

  await close();
});
