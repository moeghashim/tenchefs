import { adminClient, newIdentity } from "./identities.ts";
import { expect, it, vi } from "vitest";
import type { CookoutClient } from "../../sdk/index.ts";
import { openAt } from "./render.tsx";
import { screen } from "@testing-library/react";
import { streamOf } from "./messages.ts";

const NONE = 0;

interface Reading {
  readonly poster: CookoutClient;
  readonly reader: CookoutClient;
}

async function readerOf(channel: string): Promise<Reading> {
  const poster = await newIdentity({ kind: "human", name: `${channel}-ada` });
  const reader = await newIdentity({ kind: "human", name: `${channel}-grace` });
  await adminClient().createChannel({ name: channel });
  await reader.client.subscribe(channel);
  return { poster: poster.client, reader: reader.client };
}

async function inboxEmptied(client: CookoutClient): Promise<void> {
  await vi.waitUntil(async () => {
    const inbox = await client.inbox();
    return inbox.items.length === NONE;
  });
}

async function openedAs(reader: CookoutClient, hash: string, text: string): Promise<() => void> {
  const close = openAt({ client: reader, hash });
  await screen.findByText(text);
  await inboxEmptied(reader);
  return close;
}

function withoutDays(shown: readonly string[]): readonly string[] {
  return shown.filter((row) => row === "[New]" || !row.startsWith("["));
}

it('opening a channel with unread messages shows "New" above the first, and it stays after the ack', {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const channel = "web-new-line";
  const { poster, reader } = await readerOf(channel);
  await reader.createMessage({ channel, text: "Already read" });
  await poster.createMessage({ channel, text: "First new" });
  await poster.createMessage({ channel, text: "Second new" });
  const close = await openedAs(reader, `#/channels/${channel}`, "Second new");

  expect(withoutDays(await streamOf("Messages"))).toStrictEqual([
    "web-new-line-graceAlready read",
    "[New]",
    "web-new-line-adaFirst new",
    "Second new",
  ]);

  close();
});

it('opening a thread with unread replies shows "New" above the first, and it stays after the ack', {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const channel = "web-new-line-thread";
  const { poster, reader } = await readerOf(channel);
  const { message: parent } = await reader.createMessage({ channel, text: "Deploy?" });
  await reader.createMessage({ channel, replyTo: parent.id, text: "Me first" });
  await poster.createMessage({ channel, replyTo: parent.id, text: "Noon works" });
  const close = await openedAs(reader, `#/channels/${channel}/threads/${String(parent.id)}`, "Noon works");

  expect(withoutDays(await streamOf("Replies"))).toStrictEqual([
    "web-new-line-thread-graceMe first",
    "[New]",
    "web-new-line-thread-adaNoon works",
  ]);

  close();
});

it("a channel with nothing unread shows no New line", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const channel = "web-new-line-none";
  const { reader } = await readerOf(channel);
  await reader.createMessage({ channel, text: "Mine" });
  const close = openAt({ client: reader, hash: `#/channels/${channel}` });

  await expect(streamOf("Messages")).resolves.toStrictEqual([
    expect.stringMatching(/^\[/u),
    "web-new-line-none-graceMine",
  ]);

  close();
});

it('in an unsubscribed channel, "New" sits above the first message after the read position, mention or not', {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const channel = "web-new-line-position";
  const { poster, reader } = await readerOf(channel);
  await reader.unsubscribe(channel);
  await reader.createMessage({ channel, text: "Already read" });
  await poster.createMessage({ channel, text: "Plain new" });
  await poster.createMessage({ channel, text: `@${channel}-grace can you take the rollback?` });
  const close = await openedAs(reader, `#/channels/${channel}`, "Plain new");

  expect(withoutDays(await streamOf("Messages"))).toStrictEqual([
    "web-new-line-position-graceAlready read",
    "[New]",
    "web-new-line-position-adaPlain new",
    "@web-new-line-position-grace can you take the rollback?",
  ]);

  close();
});

it("with no read position in a channel, there is no New line", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const channel = "web-new-line-unread";
  const { poster, reader } = await readerOf(channel);
  await reader.unsubscribe(channel);
  await poster.createMessage({ channel, text: "Plain new" });
  await poster.createMessage({ channel, text: `@${channel}-grace a look?` });
  const close = await openedAs(reader, `#/channels/${channel}`, "Plain new");

  expect(withoutDays(await streamOf("Messages"))).toStrictEqual([
    "web-new-line-unread-adaPlain new",
    "@web-new-line-unread-grace a look?",
  ]);

  close();
});

it("a message mentioning the logged-in human is highlighted, and other mentions are only styled", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const channel = "web-mention-marks";
  const { poster, reader } = await readerOf(channel);
  await poster.createMessage({ channel, text: "@web-mention-marks-grace can you look?" });
  await poster.createMessage({ channel, text: "Or @web-mention-marks-ada will" });
  const close = openAt({ client: reader, hash: `#/channels/${channel}` });

  const other = await screen.findByText("@web-mention-marks-ada", { ignore: "a" });
  const mine = screen.getByText("@web-mention-marks-grace", { ignore: "a" });

  expect([
    mine.tagName,
    mine.closest('[data-for-you="true"]') === null,
    other.tagName,
    other.closest('[data-for-you="false"]') === null,
  ]).toStrictEqual(["MARK", false, "SPAN", false]);

  close();
});

it("a Webhook command call without data shows the Webhook command and null", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const channel = "web-call-no-data";
  const { poster, reader } = await readerOf(channel);
  await poster.createMessage({ channel, data: { command: "deploy" }, text: "/deploy" });
  const close = openAt({ client: reader, hash: `#/channels/${channel}` });

  const call = await screen.findByLabelText("Call to /deploy");

  expect(call.textContent).toBe("null");

  close();
});
