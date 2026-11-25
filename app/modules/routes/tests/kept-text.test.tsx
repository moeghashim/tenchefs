import type { CookoutClient, Message } from "../../sdk/index.ts";
import { adminClient, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { inConversation, inThread } from "./regions.ts";
import type { MemoryStorage } from "../../testing/web.ts";
import { memoryStorage } from "../../testing/web.ts";
import { openAt } from "./render.tsx";

const MESSAGE = "Message";
const REPLY = "Reply";
const ONE_KEPT = 1;
const NOTHING_KEPT = 0;

interface Shown {
  readonly caret: number;
  readonly text: string;
}

function boxLabelled(label: string): HTMLTextAreaElement {
  return screen.getByLabelText<HTMLTextAreaElement>(label, { selector: "textarea" });
}

async function shownIn(label: string): Promise<Shown> {
  await screen.findByLabelText(label, { selector: "textarea" });
  const box = boxLabelled(label);
  return { caret: box.selectionStart, text: box.value };
}

async function typeIn(label: string, text: string): Promise<void> {
  await screen.findByLabelText(label, { selector: "textarea" });
  fireEvent.change(boxLabelled(label), {
    target: { selectionEnd: text.length, selectionStart: text.length, value: text },
  });
}

async function shownOnceSaying(label: string, text: string): Promise<Shown> {
  await waitFor(() => {
    expect(boxLabelled(label)).toHaveProperty("value", text);
  });
  const shown = await shownIn(label);
  return shown;
}

async function visit(channel: string): Promise<void> {
  globalThis.location.hash = `#/channels/${channel}`;
  await screen.findByRole("region", { name: `Messages in #${channel}` });
}

async function channels(...names: readonly string[]): Promise<void> {
  await Promise.all(
    names.map(async (name) => {
      await adminClient().createChannel({ name });
    }),
  );
}

function openAs(client: CookoutClient, hash: string, storage: MemoryStorage): () => void {
  return openAt({ client, hash, storage });
}

async function typedThenLeft(typed: string, left: string): Promise<Shown> {
  await visit(typed);
  await typeIn(MESSAGE, "Half a thought");
  await visit(left);
  const empty = await shownIn(MESSAGE);
  await typeIn(MESSAGE, "Another");
  return empty;
}

it("each channel's message box keeps its unsent text, and shows it only in that channel, with the caret at its end", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  await channels("web-kept-a", "web-kept-b");
  const close = openAs(adminClient(), "#/channels/web-kept-a", memoryStorage());
  const emptyInB = await typedThenLeft("web-kept-a", "web-kept-b");
  await visit("web-kept-a");
  const backInA = await shownOnceSaying(MESSAGE, "Half a thought");
  await visit("web-kept-b");
  const backInB = await shownOnceSaying(MESSAGE, "Another");

  expect([emptyInB, backInA, backInB.text]).toStrictEqual([
    { caret: 0, text: "" },
    { caret: "Half a thought".length, text: "Half a thought" },
    "Another",
  ]);

  close();
});

async function shownTo(client: CookoutClient, storage: MemoryStorage): Promise<Shown> {
  const close = openAs(client, "#/channels/web-kept-reopen", storage);
  await screen.findByRole("region", { name: "Messages in #web-kept-reopen" });
  const shown = await shownIn(MESSAGE);
  close();
  return shown;
}

it("a channel's unsent text is back when the page opens again, for the same identity only", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  await channels("web-kept-reopen");
  const other = await newIdentity({ kind: "human", name: "web-kept-reopen-other" });
  const storage = memoryStorage();
  const first = openAs(adminClient(), "#/channels/web-kept-reopen", storage);
  await typeIn(MESSAGE, "Before the reload");
  first();
  const toOther = await shownTo(other.client, storage);
  const toAdmin = await shownTo(adminClient(), storage);

  expect([toOther, toAdmin]).toStrictEqual([
    { caret: 0, text: "" },
    { caret: "Before the reload".length, text: "Before the reload" },
  ]);
});

async function sentIn(channel: string): Promise<void> {
  await visit(channel);
  await typeIn(MESSAGE, "Sent at last");
  fireEvent.keyDown(boxLabelled(MESSAGE), { key: "Enter" });
  await screen.findByText("Sent at last", { selector: "p" });
}

async function keptWhileTyped(channel: string, storage: MemoryStorage): Promise<number> {
  await visit(channel);
  await typeIn(MESSAGE, "Never mind");
  const kept = storage.kept().size;
  await typeIn(MESSAGE, "");
  return kept;
}

it("sending a channel's message, or emptying its box by hand, forgets its unsent text", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  await channels("web-kept-sent", "web-kept-emptied");
  const storage = memoryStorage();
  const close = openAs(adminClient(), "#/channels/web-kept-sent", storage);
  await sentIn("web-kept-sent");
  const whileTyped = await keptWhileTyped("web-kept-emptied", storage);
  const { text } = await shownIn(MESSAGE);

  expect([whileTyped, storage.kept().size, text]).toStrictEqual([ONE_KEPT, NOTHING_KEPT, ""]);

  close();
});

async function threadIn(channel: string): Promise<Message> {
  await adminClient().createChannel({ name: channel });
  const { message } = await adminClient().createMessage({ channel, text: "The parent" });
  return message;
}

function threadHash(parent: Message): string {
  return `#/channels/${parent.channel}/threads/${String(parent.id)}`;
}

async function replyShownIn(region: typeof inThread, text: string): Promise<Shown> {
  await region().findByText(text);
  const box = await region().findByRole("textbox", { name: REPLY });
  return { caret: Number(Reflect.get(box, "selectionStart")), text: String(Reflect.get(box, "value")) };
}

async function twoThreads(channel: string): Promise<readonly [Message, Message]> {
  const first = await threadIn(channel);
  const { message: second } = await adminClient().createMessage({ channel, text: "Another parent" });
  return [first, second];
}

async function typedThenOpened(second: Message): Promise<Shown> {
  await inThread().findByText("The parent");
  await typeIn(REPLY, "A reply in the first");
  globalThis.location.hash = threadHash(second);
  return replyShownIn(inThread, "Another parent");
}

it("each thread's reply box keeps its own unsent text, and the page opening again keeps it", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const [first, second] = await twoThreads("web-kept-thread");
  const storage = memoryStorage();
  const opened = openAs(adminClient(), threadHash(first), storage);
  const inSecond = await typedThenOpened(second);
  opened();
  const again = openAs(adminClient(), threadHash(first), storage);
  const reopened = await replyShownIn(inThread, "The parent");

  expect([inSecond, reopened]).toStrictEqual([
    { caret: 0, text: "" },
    { caret: "A reply in the first".length, text: "A reply in the first" },
  ]);

  again();
});

interface Followed {
  readonly parent: Message;
  readonly reader: CookoutClient;
}

async function followedByReader(channel: string): Promise<Followed> {
  const parent = await threadIn(channel);
  const reader = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await reader.client.follow(parent.id);
  await adminClient().createMessage({ channel, replyTo: parent.id, text: "Any takers?" });
  return { parent, reader: reader.client };
}

it("a thread's reply box in the Inbox shows the text kept by its reply box in the thread panel", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const { parent, reader } = await followedByReader("web-kept-inbox");
  const storage = memoryStorage();
  const inPanel = openAs(reader, threadHash(parent), storage);
  await inThread().findByText("Any takers?");
  await typeIn(REPLY, "Typed in the panel");
  inPanel();
  const inInbox = openAs(reader, `#/inbox/${parent.channel}/${String(parent.id)}`, storage);

  await expect(replyShownIn(inConversation, "The parent")).resolves.toStrictEqual({
    caret: "Typed in the panel".length,
    text: "Typed in the panel",
  });

  inInbox();
});
