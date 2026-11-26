import type { ChannelName, CookoutClient, EventStream, MessageId } from "../../sdk/index.ts";
import { adminClient, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import { inConversation, inThread } from "./regions.ts";
import { screen, waitFor, within } from "@testing-library/react";
import { openAt } from "./render.tsx";
import { subscribedReader } from "./inbox-reader.ts";
import { watched } from "./watched.ts";

const GONE = "This thread was deleted";
const SECTIONS = ["For you", "Activity"] as const;
const NONE = 0;

interface Place {
  readonly channel: ChannelName;
  readonly id: MessageId;
}

interface Shown {
  readonly parent: HTMLElement | null;
  readonly reply: HTMLElement | null;
  readonly focused: string | null;
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

function focusedName(): string | null {
  const focused = globalThis.document.activeElement;
  if (focused === null) {
    return null;
  }
  return focused.getAttribute("aria-label");
}

function shownIn(region: typeof inThread): Shown {
  const panel = within(region().element());
  return {
    focused: focusedName(),
    parent: panel.queryByText("Ship it?"),
    reply: panel.queryByRole("textbox", { name: "Reply" }),
  };
}

async function postedThread(channel: string, poster: CookoutClient): Promise<Place> {
  const { message: parent } = await poster.createMessage({ channel, text: "Ship it?" });
  await poster.createMessage({ channel, replyTo: parent.id, text: "Shipped." });
  return { channel: parent.channel, id: parent.id };
}

async function replyBoxFocused(): Promise<void> {
  const reply = await inThread().findByRole("textbox", { name: "Reply" });
  await waitFor(() => {
    expect(globalThis.document.activeElement).toBe(reply);
  });
}

async function deletedInPanel(channel: string): Promise<Shown> {
  await adminClient().createChannel({ name: channel });
  const parent = await postedThread(channel, adminClient());
  const { client } = await newIdentity({ kind: "human", name: `${channel}-reader` });
  const close = await openLive(client, `#/channels/${channel}/threads/${String(parent.id)}`);
  await replyBoxFocused();
  await adminClient().deleteMessage(parent.id);
  await inThread().findByText(GONE);
  const shown = shownIn(inThread);
  await close();
  return shown;
}

it("an open thread that is deleted says so in its panel, without a reply box, and its close link takes focus", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const shown = await deletedInPanel("web-thread-deleted");

  expect(shown).toStrictEqual({ focused: "Close panel", parent: null, reply: null });
});

function threadRows({ channel, id }: Place): readonly string[] {
  const opener = `#/inbox/${channel}/${String(id)}`;
  const hrefs: string[] = [];
  for (const list of SECTIONS.flatMap((name) => screen.queryAllByRole("list", { name }))) {
    for (const link of within(list).queryAllByRole("link")) {
      hrefs.push(link.getAttribute("href") ?? "");
    }
  }
  return hrefs.filter((href) => href.startsWith(opener));
}

interface Selected {
  readonly poster: CookoutClient;
  readonly parent: Place;
  readonly close: () => Promise<void>;
}

async function selectedInInbox(channel: string): Promise<Selected> {
  const { poster, reader } = await subscribedReader(channel);
  const { message } = await poster.createMessage({ channel, text: "Ship it?" });
  await reader.follow(message.id);
  await poster.createMessage({ channel, replyTo: message.id, text: "Shipped." });
  const close = await openLive(reader, `#/inbox/${channel}/${String(message.id)}`);
  await inConversation().findByText("Shipped.");
  return { close, parent: { channel: message.channel, id: message.id }, poster };
}

async function deletedInInbox(channel: string): Promise<{ rows: readonly string[]; shown: Shown }> {
  const { close, parent, poster } = await selectedInInbox(channel);
  await waitFor(() => {
    expect(threadRows(parent).length).toBeGreaterThan(NONE);
  });
  inConversation().getByRole("textbox", { name: "Reply" }).focus();
  await poster.deleteMessage(parent.id);
  await inConversation().findByText(GONE);
  const seen = { rows: threadRows(parent), shown: shownIn(inConversation) };
  await close();
  return seen;
}

it("a thread deleted while selected in the Inbox says so in the conversation, without a reply box, and leaves the list", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const seen = await deletedInInbox("web-inbox-thread-deleted");

  expect(seen).toStrictEqual({ rows: [], shown: { focused: "Back to the inbox", parent: null, reply: null } });
});
