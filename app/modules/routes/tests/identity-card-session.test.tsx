import { adminClient, clientWith, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { CookoutClient } from "../../sdk/index.ts";
import { openAt } from "./render.tsx";
import { testAgentDisplayName } from "../../testing/index.ts";
import { watched } from "./watched.ts";

const SESSION_URL = "https://claude.ai/code/session_01AbCdEf";

interface Watched {
  readonly owner: CookoutClient;
  readonly reader: CookoutClient;
  readonly bot: string;
  readonly session: CookoutClient;
}

interface Shown {
  readonly bot: string;
  readonly channel: string;
}

interface Link {
  readonly text: string;
  readonly href: string | null;
  readonly target: string | null;
  readonly rel: string | null;
}

async function watchedAgent(prefix: string): Promise<Watched> {
  const owner = await newIdentity({ kind: "human", name: `${prefix}-owner` });
  const reader = await newIdentity({ kind: "human", name: `${prefix}-reader` });
  const bot = `${prefix}-bot`;
  const agent = await newIdentity({ kind: "agent", name: bot, owner: `${prefix}-owner` });
  const { agentSessionToken } = await agent.client.join({ as: bot, sessionUrl: SESSION_URL });
  const session = clientWith(agentSessionToken);
  await adminClient().createChannel({ name: prefix });
  await session.createMessage({ channel: prefix, text: "Working on it" });
  return { bot, owner: owner.client, reader: reader.client, session };
}

async function openLive(client: CookoutClient, hash: string): Promise<() => Promise<void>> {
  const { live, stream } = watched(client);
  const unmount = openAt({ client, hash, live });
  const events = await stream;
  return async () => {
    unmount();
    await events.close();
  };
}

async function openedCard(name: string): Promise<HTMLElement> {
  const messages = await screen.findByRole("feed", { name: "Messages" });
  fireEvent.pointerMove(await within(messages).findByRole("link", { name: testAgentDisplayName(name) }), {
    pointerType: "mouse",
  });
  const card = await screen.findByRole("dialog");
  return card;
}

function shownLink(): Link | null {
  const link = within(screen.getByRole("dialog")).queryByRole("link", { name: /Open session/u });
  if (link === null) {
    return null;
  }
  return {
    href: link.getAttribute("href"),
    rel: link.getAttribute("rel"),
    target: link.getAttribute("target"),
    text: link.textContent,
  };
}

async function shownTo(client: CookoutClient, { bot, channel }: Shown): Promise<Link | null> {
  const close = openAt({ client, hash: `#/channels/${channel}` });
  const card = await openedCard(bot);
  await within(card).findByRole("link", { name: "View profile" });
  const link = shownLink();
  close();
  return link;
}

it("an agent's owner sees Open session with its host on the agent's card while the session is live", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { bot, owner } = await watchedAgent("web-session-owner");
  const close = openAt({ client: owner, hash: "#/channels/web-session-owner" });
  const card = await openedCard(bot);
  await within(card).findByRole("link", { name: /Open session/u });

  expect(shownLink()).toStrictEqual({
    href: SESSION_URL,
    rel: "noopener noreferrer",
    target: "_blank",
    text: "Open session ↗claude.ai",
  });

  close();
});

it("the Open session link goes once the session ends", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { bot, owner, session } = await watchedAgent("web-session-left");
  const close = await openLive(owner, "#/channels/web-session-left");
  const card = await openedCard(bot);
  await within(card).findByRole("link", { name: /Open session/u });
  await session.leave();

  await waitFor(() => {
    expect(shownLink()).toBeNull();
  });

  await close();
});

it("anyone but the agent's owner never sees Open session on its card", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { bot, reader } = await watchedAgent("web-session-reader");
  const shown = { bot, channel: "web-session-reader" };

  expect([await shownTo(reader, shown), await shownTo(adminClient(), shown)]).toStrictEqual([null, null]);
});
