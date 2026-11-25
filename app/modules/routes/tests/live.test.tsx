import type { CookoutClient, EventStream, Message } from "../../sdk/index.ts";
import { adminClient, agentShown, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { clockStoppedAt } from "./clock.ts";
import { messagesIn } from "./messages.ts";
import { openAt } from "./render.tsx";
import { watched } from "./watched.ts";

interface LiveView {
  readonly parent: Message;
  readonly poster: CookoutClient;
  readonly reader: CookoutClient;
  readonly close: () => Promise<void>;
}

async function shownIn(name: string): Promise<readonly string[]> {
  const shown = await messagesIn(name);
  return shown;
}

async function closeBoth(unmount: () => void, stream: Promise<EventStream>): Promise<void> {
  unmount();
  const events = await stream;
  await events.close();
}

async function openLive(name: string, at: (parent: Message) => string): Promise<LiveView> {
  const poster = await newIdentity({ kind: "agent", name: `${name}-poster` });
  const reader = await newIdentity({ kind: "human", name: `${name}-reader` });
  await adminClient().createChannel({ name });
  const { message: parent } = await poster.client.createMessage({ channel: name, text: "Deploy at noon?" });
  const { live, stream } = watched(reader.client);
  const unmount = openAt({ client: reader.client, hash: at(parent), live });
  await screen.findByText("Deploy at noon?");
  await stream;
  return {
    close: async () => {
      await closeBoth(unmount, stream);
    },
    parent,
    poster: poster.client,
    reader: reader.client,
  };
}

it("a message posted by another identity appears in the open channel without a reload", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { close, parent, poster } = await openLive("web-live-channel", (message) => `#/channels/${message.channel}`);
  clockStoppedAt(parent.createdAt);

  await poster.createMessage({ channel: parent.channel, text: "Or at one?" });
  await poster.createMessage({ channel: parent.channel, replyTo: parent.id, text: "Noon works" });
  await screen.findByText("1 reply");

  await expect(shownIn("Messages")).resolves.toStrictEqual([
    `${agentShown("web-live-channel-poster")}agentDeploy at noon?1 replyLast reply just now →`,
    `${agentShown("web-live-channel-poster")}agentOr at one?`,
  ]);

  await close();
});

it("a reply posted by another identity appears in the open thread without a reload", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { close, parent, poster } = await openLive(
    "web-live-thread",
    (message) => `#/channels/${message.channel}/threads/${String(message.id)}`,
  );

  await poster.createMessage({ channel: parent.channel, text: "Not in this thread" });
  await poster.createMessage({ channel: parent.channel, replyTo: parent.id, text: "Noon works" });
  await screen.findByText("Noon works");

  const panel = screen.getByRole("complementary", { name: "Thread" });

  expect([await shownIn("Replies"), within(panel).queryByText("Not in this thread")]).toStrictEqual([
    [`${agentShown("web-live-thread-poster")}agentNoon works`],
    null,
  ]);

  await close();
});

it("a reply that arrives in the open thread counts as read", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { close, parent, poster, reader } = await openLive(
    "web-live-thread-read",
    (message) => `#/channels/${message.channel}/threads/${String(message.id)}`,
  );
  await reader.follow(parent.id);

  await poster.createMessage({ channel: parent.channel, replyTo: parent.id, text: "Noon works" });
  await screen.findByText("Noon works");

  await waitFor(async () => {
    await expect(reader.inbox()).resolves.toStrictEqual({
      agentJoinRequests: [],
      alerts: [],
      deactivatedQuietAgents: [],
      deactivationOffers: [],
      items: [],
      nudges: [],
    });
  });

  await close();
});
