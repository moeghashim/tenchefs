import type { CookoutClient, CookoutEvent, EventStream } from "../../sdk/index.ts";
import { addWebhookCommand, suggestedFor } from "./webhook-commands.ts";
import { adminClient, clientWith, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { Live } from "../../testing/web.ts";
import { inSidebar } from "./regions.ts";
import { openAt } from "./render.tsx";
import { watched } from "./watched.ts";

async function openLive(client: CookoutClient, hash: string): Promise<() => Promise<void>> {
  const { live, stream } = watched(client);
  const unmount = openAt({ client, hash, live });
  const events: EventStream = await stream;
  return async () => {
    unmount();
    await events.close();
  };
}

async function openChannelLive(client: CookoutClient, channel: string): Promise<() => Promise<void>> {
  await adminClient().createChannel({ name: channel });
  const close = await openLive(client, `#/channels/${channel}`);
  await screen.findByLabelText("Message");
  return close;
}

interface HeldOpen {
  readonly deletionHeard: Promise<boolean>;
  readonly events: EventStream;
  readonly release: () => void;
}

interface Hearing {
  readonly live: Live;
  readonly heard: Promise<boolean>;
}

function hearing(live: Live, type: CookoutEvent["type"]): Hearing {
  const { promise, resolve } = Promise.withResolvers<boolean>();
  return {
    heard: promise,
    live: {
      ...live,
      follow: (follower) => {
        live.follow({
          ...follower,
          heard: (event) => {
            follower.heard(event);
            if (event.type === type) {
              resolve(true);
            }
          },
        });
      },
    },
  };
}

async function openWithListHeld(channel: string): Promise<HeldOpen> {
  const client = adminClient();
  await client.createChannel({ name: channel });
  const gate = Promise.withResolvers<boolean>();
  const held: CookoutClient = {
    ...client,
    listChannels: async () => {
      await gate.promise;
      const listed = await client.listChannels();
      return listed;
    },
  };
  const watching = watched(held);
  const { heard: deletionHeard, live } = hearing(watching.live, "channel-deleted");
  openAt({ client: held, hash: "#/inbox", live });
  const { stream } = watching;
  return {
    deletionHeard,
    events: await stream,
    release: () => {
      gate.resolve(true);
    },
  };
}

async function agentCard(name: string): Promise<HTMLElement> {
  const card = await screen.findByRole("group", { name: `@${name}` });
  return card;
}

async function ownerWithAgent(prefix: string): Promise<CookoutClient> {
  const human = await newIdentity({ kind: "human", name: `${prefix}-human` });
  await newIdentity({ kind: "agent", name: `${prefix}-bot`, owner: `${prefix}-human` });
  return human.client;
}

it("a Webhook command registered elsewhere shows in the / suggestions without a reload", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  await addWebhookCommand({ description: "Builds it", name: "web-live-command-build" });
  const close = await openChannelLive(adminClient(), "web-live-command");

  await expect(suggestedFor("/web-live-command")).resolves.toStrictEqual(["/web-live-command-buildBuilds it"]);

  await addWebhookCommand({ description: "Ships it", name: "web-live-command-ship" });

  await waitFor(async () => {
    await expect(suggestedFor("/web-live-command")).resolves.toStrictEqual([
      "/web-live-command-buildBuilds it",
      "/web-live-command-shipShips it",
    ]);
  });

  await close();
});

it("an agent's join and leave elsewhere show in Settings without a reload", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const human = await ownerWithAgent("web-live-session");
  const close = await openLive(human, "#/settings/agents?profile=web-live-session-bot");
  const card = await agentCard("web-live-session-bot");
  await within(card).findByText("No live session");
  const { agentSessionToken } = await human.join({ as: "web-live-session-bot", host: "laptop" });
  await within(card).findByText(/^Joined from laptop/u);
  await clientWith(agentSessionToken).leave();

  await expect(within(card).findByText("No live session")).resolves.toBeInstanceOf(HTMLElement);

  await close();
});

it("an agent's session that expires leaves Settings without a reload", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const human = await ownerWithAgent("web-live-expiry");
  await human.join({ as: "web-live-expiry-bot", host: "laptop", idleExpiry: "1s" });
  const close = await openLive(human, "#/settings/agents");
  const card = await agentCard("web-live-expiry-bot");
  await within(card).findByText(/^Joined from laptop/u);

  await expect(within(card).findByText("No live session", {}, { timeout: 3000 })).resolves.toBeInstanceOf(HTMLElement);

  await close();
});

it("an agent deactivated elsewhere shows no live session in Settings without a reload", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const human = await ownerWithAgent("web-live-deactivated");
  await human.join({ as: "web-live-deactivated-bot", host: "laptop" });
  const close = await openLive(human, "#/settings/agents");
  const card = await agentCard("web-live-deactivated-bot");
  await within(card).findByText(/^Joined from laptop/u);
  await adminClient().deactivateIdentity("web-live-deactivated-bot");

  await expect(within(card).findByText("No live session")).resolves.toBeInstanceOf(HTMLElement);

  await close();
});

it("a channel deleted elsewhere leaves the sidebar, and its open view goes to the Inbox with a notice", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const reader = await newIdentity({ kind: "human", name: "web-live-deleted-reader" });
  const close = await openChannelLive(reader.client, "web-live-deleted");
  await adminClient().deleteChannel("web-live-deleted");
  const notice = await screen.findByRole("status", { name: "" });

  expect([
    notice.textContent,
    globalThis.location.hash,
    inSidebar().queryByRole("link", { name: /^#web-live-deleted/u }),
  ]).toStrictEqual(["#web-live-deleted was deleted, so you're back in your inbox.Dismiss", "#/inbox", null]);

  fireEvent.click(within(notice).getByRole("button", { name: "Dismiss" }));

  expect(screen.queryByRole("status", { name: "" })).toBeNull();

  await close();
});

it("a channel deleted elsewhere leaves the sidebar of a page open on another, with no notice", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  await adminClient().createChannel({ name: "web-live-gone" });
  const close = await openChannelLive(adminClient(), "web-live-stays");
  await inSidebar().findByRole("link", { name: /^#web-live-gone/u });
  await adminClient().deleteChannel("web-live-gone");

  await waitFor(() => {
    expect([
      inSidebar().queryByRole("link", { name: /^#web-live-gone/u }),
      screen.queryByRole("status", { name: "" }),
    ]).toStrictEqual([null, null]);
  });

  await close();
});

it("channels created and deleted while the list still loads leave it as the server has it", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const opened = await openWithListHeld("web-live-early-gone");
  await adminClient().createChannel({ name: "web-live-early-new" });
  await adminClient().deleteChannel("web-live-early-gone");
  await opened.deletionHeard;
  opened.release();

  await expect(inSidebar().findByRole("link", { name: /^#web-live-early-new/u })).resolves.toBeInstanceOf(HTMLElement);
  expect(inSidebar().queryByRole("link", { name: /^#web-live-early-gone/u })).toBeNull();

  await opened.events.close();
});
