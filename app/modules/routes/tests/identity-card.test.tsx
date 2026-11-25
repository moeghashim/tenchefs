import type { CookoutClient, EventStream } from "../../sdk/index.ts";
import { adminClient, anonymousClient, clientWith, newIdentity } from "./identities.ts";
import { agentNamed, openedBy } from "./presence.ts";
import { createTestAgent, testAgentDisplayName } from "../../testing/index.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { inPane } from "./regions.ts";
import { openAt } from "./render.tsx";

const PREFIX = "web-card";

interface Card {
  readonly avatar: { readonly agent: string | null; readonly initials: string | null } | null;
  readonly chip: string | null;
  readonly dot: string | null;
  readonly lines: readonly string[];
  readonly message: "disabled" | "enabled";
  readonly profile: string | null;
}

async function readerOn(channel: string): Promise<() => void> {
  const reader = await newIdentity({ kind: "human", name: `${channel}-reader` });
  return openAt({ client: reader.client, hash: `#/channels/${channel}` });
}

async function authorName(name: string): Promise<HTMLElement> {
  const messages = await screen.findByRole("feed", { name: "Messages" });
  const link = await within(messages).findByRole("link", {
    name: (shown) => shown === name || shown === testAgentDisplayName(name),
  });
  return link;
}

function shownCard(): HTMLElement {
  return screen.getByRole("dialog");
}

function cardDot(): string | null {
  const dot = shownCard().querySelector<HTMLElement>("[data-presence]");
  if (dot === null) {
    return null;
  }
  return dot.dataset["presence"] ?? null;
}

function cardAvatar(): Card["avatar"] {
  const avatar = shownCard().querySelector<HTMLElement>('[data-testid="avatar"]');
  if (avatar === null) {
    return null;
  }
  return { agent: avatar.dataset["agent"] ?? null, initials: avatar.dataset["initials"] ?? null };
}

function chipOf(): string | null {
  const chip = within(shownCard()).queryByText("Agent");
  if (chip === null) {
    return null;
  }
  return chip.textContent;
}

function messageOf(): Card["message"] {
  if (within(shownCard()).getByRole("button", { name: "Message" }).hasAttribute("disabled")) {
    return "disabled";
  }
  return "enabled";
}

async function cardOf(trigger: () => HTMLElement): Promise<Card> {
  const card = await screen.findByRole("dialog");
  await waitFor(() => {
    expect(trigger().getAttribute("aria-describedby")).toBe(screen.getByRole("tooltip").id);
  });
  const lines: string[] = [];
  for (const line of card.querySelectorAll("p")) {
    lines.push(line.textContent);
  }
  return {
    avatar: cardAvatar(),
    chip: chipOf(),
    dot: cardDot(),
    lines,
    message: messageOf(),
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

it("hovering an agent author's name opens a card led by its avatar tile with an Agent chip, then its name, handle, presence, owner, description, Message and a link to its profile in People", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const channel = `${PREFIX}-agent`;
  const bot = `${channel}-bot`;
  const events = await onlineAgent(channel);

  await expect(hovered("Mail Bot")).resolves.toStrictEqual({
    avatar: { agent: "true", initials: "WC" },
    chip: "Agent",
    dot: "online",
    lines: ["Mail Bot", `@${bot}`, "Online", `Agent · owned by ${channel}-owner`, "Reads the mail"],
    message: "enabled",
    profile: `#/people/${bot}`,
  });

  await events.close();

  await waitFor(() => {
    expect([cardDot(), shownCard().textContent]).toStrictEqual(["offline", expect.stringMatching(/Offline/u)]);
  });

  fireEvent.click(within(shownCard()).getByRole("link", { name: "View profile" }));

  await expect(profileHeading()).resolves.toMatch(`Mail Bot@${bot}`);
});

it("hovering a person's name opens a card led by their avatar tile with no Agent chip, with their presence, name and profile link, and no owner", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const channel = `${PREFIX}-person`;
  const ann = await newIdentity({ kind: "human", name: `${channel}-ann` });
  const close = await postedBy(channel, ann.client);

  await expect(hovered(`${channel}-ann`)).resolves.toStrictEqual({
    avatar: { agent: "false", initials: "WC" },
    chip: null,
    dot: "offline",
    lines: [`${channel}-ann`, "Offline", "Human"],
    message: "enabled",
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
    avatar: { agent: "false", initials: "WC" },
    chip: null,
    dot: "offline",
    lines: [`${channel}-reader`, "Offline", "Human"],
    message: "enabled",
    profile: `#/people/${channel}-reader`,
  });

  fireEvent.keyDown(mention, { key: "Escape" });

  await waitFor(() => {
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  close();
});

it("a deactivated identity's card says Deactivated in place of its presence, still shows its avatar tile, and can't be messaged", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const channel = `${PREFIX}-gone`;
  const cy = await newIdentity({ kind: "human", name: `${channel}-cy` });
  const close = await deactivatedAuthor(channel, cy.client);

  await expect(hovered(`${channel}-cy`)).resolves.toStrictEqual({
    avatar: { agent: "false", initials: "WC" },
    chip: null,
    dot: null,
    lines: [`${channel}-cy`, "Deactivated", "Human"],
    message: "disabled",
    profile: `#/people/${channel}-cy`,
  });

  close();
});

async function chiefWithWorker(channel: string): Promise<Awaited<ReturnType<typeof newIdentity>>> {
  const chief = await newIdentity({ kind: "agent", name: `${channel}-chief`, owner: `${channel}-owner` });
  await createTestAgent({ broughtIn: true, by: chief.client, name: `${channel}-worker` });
  return chief;
}

async function broughtInAuthor(channel: string): Promise<() => void> {
  const owner = await newIdentity({ kind: "human", name: `${channel}-owner` });
  const chief = await chiefWithWorker(channel);
  const started = await anonymousClient().startAgentJoin({ as: `${channel}-worker`, host: "box" });
  await chief.client.approveAgentJoin(started.userCode);
  const collected = await anonymousClient().collectAgentJoin(started.requestId);
  if (collected.status !== "approved") {
    throw new Error("The agent join request was not approved.");
  }
  await adminClient().createChannel({ name: channel });
  await clientWith(collected.agentSession.agentSessionToken).createMessage({ channel, text: "Reporting in" });
  return openAt({ client: owner.client, hash: `#/channels/${channel}` });
}

it("an agent another agent brought in has a card saying Brought in by, linking to that agent's card", {
  timeout: 10_000,
}, async () => {
  expect.hasAssertions();

  const channel = `${PREFIX}-brought`;
  const close = await broughtInAuthor(channel);
  const card = await hovered(`${channel}-worker`);
  const bringer = within(shownCard()).getByRole("link", { name: `@${channel}-chief` });

  expect(card.lines).toStrictEqual([
    testAgentDisplayName(`${channel}-worker`),
    `@${channel}-worker`,
    "Offline",
    `Agent · owned by ${channel}-owner`,
    `Brought in by @${channel}-chief`,
  ]);
  expect(bringer.getAttribute("href")).toBe(`#/people/${channel}-chief`);

  close();
});
