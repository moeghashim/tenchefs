import type { CookoutClient, EventStream } from "../../sdk/index.ts";
import { adminClient, newIdentity } from "./identities.ts";
import { agentNamed, openedBy } from "./presence.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { inPane } from "./regions.ts";
import { openAt } from "./render.tsx";

const PREFIX = "web-card";

interface Card {
  readonly avatar: { readonly agent: string | null; readonly presence: string | null } | null;
  readonly lines: readonly string[];
  readonly profile: string | null;
}

async function readerOn(channel: string): Promise<() => void> {
  const reader = await newIdentity({ kind: "human", name: `${channel}-reader` });
  return openAt({ client: reader.client, hash: `#/channels/${channel}` });
}

async function authorName(name: string): Promise<HTMLElement> {
  const messages = await screen.findByRole("list", { name: "Messages" });
  const link = await within(messages).findByRole("link", { name });
  return link;
}

function cardDot(): string | null {
  const dot = screen.getByRole("tooltip").querySelector<HTMLElement>("[data-presence]");
  if (dot === null) {
    return null;
  }
  return dot.dataset["presence"] ?? null;
}

function cardAvatar(): Card["avatar"] {
  const avatar = screen.getByRole("tooltip").querySelector<HTMLElement>('[data-testid="avatar"]');
  if (avatar === null) {
    return null;
  }
  return { agent: avatar.dataset["agent"] ?? null, presence: cardDot() };
}

async function cardOf(trigger: () => HTMLElement): Promise<Card> {
  const card = await screen.findByRole("tooltip");
  await waitFor(() => {
    expect(trigger().getAttribute("aria-describedby")).toBe(card.id);
  });
  const lines: string[] = [];
  for (const line of card.querySelectorAll("p")) {
    lines.push(line.textContent);
  }
  return {
    avatar: cardAvatar(),
    lines,
    profile: within(card).getByRole("link", { name: "View profile" }).getAttribute("href"),
  };
}

async function hovered(name: string): Promise<Card> {
  const trigger = await authorName(name);
  fireEvent.pointerMove(trigger, { pointerType: "mouse" });
  const card = await cardOf(() => trigger);
  return card;
}

async function profileHeading(): Promise<string> {
  const panel = await screen.findByRole("complementary", { name: "Profile" });
  const heading = await within(panel).findByRole("heading", { level: 3 });
  return heading.textContent;
}

async function postedBy(channel: string, author: CookoutClient): Promise<() => void> {
  const reader = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await adminClient().createChannel({ name: channel });
  await author.createMessage({ channel, text: `Hello @${channel}-reader` });
  return openAt({ client: reader.client, hash: `#/channels/${channel}` });
}

async function deactivatedAuthor(channel: string, author: CookoutClient): Promise<() => void> {
  await adminClient().createChannel({ name: channel });
  const { message } = await author.createMessage({ channel, text: "Bye" });
  await adminClient().deactivateIdentity(message.author.name);
  const close = await readerOn(channel);
  return close;
}

async function describedAgent(channel: string): Promise<Awaited<ReturnType<typeof agentNamed>>> {
  const owner = `${channel}-owner`;
  const bot = `${channel}-bot`;
  await newIdentity({ kind: "human", name: owner });
  const agent = await agentNamed(bot);
  await adminClient().transferAgent(bot, owner);
  await adminClient().setDisplayName(bot, "Mail Bot");
  await adminClient().setDescription(bot, "Reads the mail");
  return agent;
}

async function onlineAgent(channel: string): Promise<EventStream> {
  const agent = await describedAgent(channel);
  const events = await agent.watch();
  const reader = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await adminClient().createChannel({ name: channel });
  await agent.client.createMessage({ channel, text: "Beep" });
  await openedBy({ client: reader.client, hash: `#/channels/${channel}` });
  return events;
}

it("hovering an agent author's name opens a card led by its avatar, with its presence, name, owner, description and a link to its profile in People", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const channel = `${PREFIX}-agent`;
  const bot = `${channel}-bot`;
  const events = await onlineAgent(channel);

  await expect(hovered("Mail Bot")).resolves.toStrictEqual({
    avatar: { agent: "true", presence: "online" },
    lines: ["Mail Botagent", `@${bot}`, "Online", `Agent · owned by ${channel}-owner`, "Reads the mail"],
    profile: `#/people/${bot}`,
  });

  await events.close();

  await waitFor(() => {
    expect([cardDot(), screen.getByRole("tooltip").textContent]).toStrictEqual([
      "offline",
      expect.stringMatching(/Offline/u),
    ]);
  });

  fireEvent.click(within(screen.getByRole("tooltip")).getByRole("link", { name: "View profile" }));

  await expect(profileHeading()).resolves.toMatch(`Mail Bot@${bot}`);
});

it("hovering a person's name opens a card led by their round avatar, with their presence, name and profile link, and no owner", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const channel = `${PREFIX}-person`;
  const ann = await newIdentity({ kind: "human", name: `${channel}-ann` });
  const close = await postedBy(channel, ann.client);

  await expect(hovered(`${channel}-ann`)).resolves.toStrictEqual({
    avatar: { agent: "false", presence: "offline" },
    lines: [`${channel}-ann`, "Offline", "Human"],
    profile: `#/people/${channel}-ann`,
  });

  close();
});

it("focusing an @mention opens its card, and Escape closes it", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const channel = `${PREFIX}-mention`;
  const close = await postedBy(channel, adminClient());
  const mention = await inPane().findByRole("link", { name: `@${channel}-reader` });
  mention.focus();

  await expect(cardOf(() => mention)).resolves.toStrictEqual({
    avatar: { agent: "false", presence: "offline" },
    lines: [`${channel}-reader`, "Offline", "Human"],
    profile: `#/people/${channel}-reader`,
  });

  fireEvent.keyDown(mention, { key: "Escape" });

  await waitFor(() => {
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  close();
});

it("a deactivated identity's card says Deactivated and still shows its avatar", { timeout: 10_000 }, async () => {
  expect.hasAssertions();

  const channel = `${PREFIX}-gone`;
  const cy = await newIdentity({ kind: "human", name: `${channel}-cy` });
  const close = await deactivatedAuthor(channel, cy.client);

  await expect(hovered(`${channel}-cy`)).resolves.toStrictEqual({
    avatar: { agent: "false", presence: "offline" },
    lines: [`${channel}-cy`, "Offline", "Human", "Deactivated"],
    profile: `#/people/${channel}-cy`,
  });

  close();
});
