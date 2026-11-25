import type { Message, ServerSentEvent } from "../../sdk/index.ts";
import { adminClient, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import { messagesIn } from "./messages.ts";
import { openWithClockStopped } from "./clock.ts";
import { screen } from "@testing-library/react";
import { scriptedLive } from "../../testing/web.ts";

interface ScriptedView {
  readonly parent: Message;
  readonly send: (...events: readonly ServerSentEvent[]) => void;
  readonly close: () => void;
}

function sent(message: Message): ServerSentEvent {
  return { data: JSON.stringify({ message, type: "message" }), event: "message" };
}

const garbage: readonly ServerSentEvent[] = [
  { data: "not json", event: "message" },
  { data: JSON.stringify({ type: "message" }), event: "message" },
  { data: "{}", event: "from-a-newer-server" },
];

async function post(channel: string, text: string): Promise<Message> {
  const { message } = await adminClient().createMessage({ channel, text });
  return message;
}

async function replyTo(parent: Message, text: string): Promise<Message> {
  const { message } = await adminClient().createMessage({ channel: parent.channel, replyTo: parent.id, text });
  return message;
}

async function shownIn(name: string): Promise<readonly string[]> {
  const shown = await messagesIn(name);
  return shown;
}

async function openScripted(channel: string, at: (parent: Message) => string): Promise<ScriptedView> {
  const reader = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await adminClient().createChannel({ name: channel });
  const parent = await post(channel, "The parent");
  const { live, send } = scriptedLive();
  const close = openWithClockStopped({ client: reader.client, hash: at(parent), live });
  await screen.findByText("The parent");
  return { close, parent, send };
}

it("the channel view shows each new message once, and drops events that don't match the protocol", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { close, parent, send } = await openScripted("web-live-script", () => "#/channels/web-live-script");
  await adminClient().createChannel({ name: "web-live-script-other" });
  const later = await post("web-live-script", "Later");
  const reply = await replyTo(parent, "A reply");
  const elsewhere = await post("web-live-script-other", "Elsewhere");

  send(...garbage, sent(later), sent(later), sent(reply), sent(reply), sent(elsewhere));

  await expect(shownIn("Messages")).resolves.toStrictEqual([
    "adminThe parent1 replyLast reply just now →",
    "adminLater",
  ]);

  close();
});

it("the thread view shows each new reply in it once, and nothing from elsewhere", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { close, parent, send } = await openScripted(
    "web-live-script-thread",
    (message) => `#/channels/${message.channel}/threads/${String(message.id)}`,
  );
  const other = await post("web-live-script-thread", "Another parent");
  const reply = await replyTo(parent, "A reply");
  const otherReply = await replyTo(other, "Another reply");
  const topLevel = await post("web-live-script-thread", "Top level");

  send(sent(reply), sent(reply), sent(otherReply), sent(topLevel));

  await expect(shownIn("Replies")).resolves.toStrictEqual(["adminA reply"]);

  close();
});
