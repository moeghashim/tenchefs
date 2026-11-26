import type { CookoutClient, EventStream, MessageId } from "../../sdk/index.ts";
import { adminClient, newIdentity } from "./identities.ts";
import { expect, it, onTestFinished, vi } from "vitest";
import { inPane, inThread } from "./regions.ts";
import { screen, within } from "@testing-library/react";
import { openAt } from "./render.tsx";
import { watched } from "./watched.ts";

const DELETED = "Message deleted";
const TALL = 1000;
const SHOWN = 100;
const NONE = 0;

function bodyMeasured(height: number): (this: unknown) => number {
  return function measured(this: unknown): number {
    if (this instanceof HTMLElement && this.classList.contains("message-text")) {
      return height;
    }
    return NONE;
  };
}

function measuredAsLong(): void {
  const scroll = vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockImplementation(bodyMeasured(TALL));
  const client = vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockImplementation(bodyMeasured(SHOWN));
  onTestFinished(() => {
    scroll.mockRestore();
    client.mockRestore();
  });
}

async function openLive(client: CookoutClient, hash: string): Promise<() => Promise<void>> {
  const { live, stream } = watched(client);
  const unmount = openAt({ client, hash, live });
  const events: EventStream = await stream;
  return async () => {
    unmount();
    await events.close();
  };
}

async function leaveAndComeBack(hash: string): Promise<void> {
  globalThis.location.hash = "#/";
  await screen.findByRole("list", { name: "Channels" });
  globalThis.location.hash = hash;
}

interface Withdrawing {
  readonly reader: CookoutClient;
  readonly hash: string;
  readonly region: typeof inPane;
  readonly gone: { readonly id: MessageId; readonly text: string };
  readonly back: string;
}

interface Seen {
  readonly shown: HTMLElement | null;
  readonly reopened: HTMLElement | null;
}

async function deletedThenReopened({ back, gone, hash, reader, region }: Withdrawing): Promise<Seen> {
  const close = await openLive(reader, hash);
  await region().findByText(gone.text);
  await adminClient().deleteMessage(gone.id);
  await region().findByText(DELETED);
  const shown = within(region().element()).queryByText(gone.text);
  await leaveAndComeBack(hash);
  await region().findByText(back);
  const reopened = within(region().element()).queryByText(DELETED);
  await close();
  return { reopened, shown };
}

it("a message deleted elsewhere shows as Message deleted in the open channel, and is gone once it is opened again", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const channel = "web-message-deleted";
  await adminClient().createChannel({ name: channel });
  await adminClient().createMessage({ channel, text: "Kept" });
  const { message } = await adminClient().createMessage({ channel, text: "Withdrawn" });
  const { client } = await newIdentity({ kind: "human", name: `${channel}-reader` });
  const gone = { id: message.id, text: "Withdrawn" };
  const seen = await deletedThenReopened({
    back: "Kept",
    gone,
    hash: `#/channels/${channel}`,
    reader: client,
    region: inPane,
  });

  expect(seen).toStrictEqual({ reopened: null, shown: null });
});

it("a reply deleted elsewhere shows as Message deleted in the open thread, and is gone once it is opened again", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const channel = "web-reply-deleted";
  await adminClient().createChannel({ name: channel });
  const { message: parent } = await adminClient().createMessage({ channel, text: "Ship it?" });
  const { message: reply } = await adminClient().createMessage({ channel, replyTo: parent.id, text: "Shipped." });
  const { client } = await newIdentity({ kind: "human", name: `${channel}-reader` });
  const hash = `#/channels/${channel}/threads/${String(parent.id)}`;
  const gone = { id: reply.id, text: "Shipped." };
  const seen = await deletedThenReopened({ back: "No replies yet.", gone, hash, reader: client, region: inThread });

  expect(seen).toStrictEqual({ reopened: null, shown: null });
});

const LONG = "A long report.";
const ONE = 1;

interface FoldedThenDeleted {
  readonly folded: number;
  readonly text: HTMLElement | null;
  readonly unfold: readonly HTMLElement[];
}

async function postedLongAndRead(channel: string): Promise<{ client: CookoutClient; id: MessageId }> {
  await adminClient().createChannel({ name: channel });
  const { message } = await adminClient().createMessage({ channel, text: LONG });
  const { client } = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await client.ack(message.id);
  return { client, id: message.id };
}

async function foldedThenDeleted(channel: string): Promise<FoldedThenDeleted> {
  const { client, id } = await postedLongAndRead(channel);
  const close = await openLive(client, `#/channels/${channel}`);
  await inPane().findByText(LONG);
  const folded = within(inPane().element()).getAllByRole("button", { name: "Unfold" }).length;
  await adminClient().deleteMessage(id);
  await inPane().findByText(DELETED);
  const pane = within(inPane().element());
  const seen = { folded, text: pane.queryByText(LONG), unfold: pane.queryAllByRole("button", { name: "Unfold" }) };
  await close();
  return seen;
}

it("a folded long message deleted elsewhere shows as Message deleted, with nothing left to unfold", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  measuredAsLong();
  const seen = await foldedThenDeleted("web-folded-deleted");

  expect(seen).toStrictEqual({ folded: ONE, text: null, unfold: [] });
});
