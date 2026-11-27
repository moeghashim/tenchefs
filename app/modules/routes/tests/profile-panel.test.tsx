import type { CookoutClient, EventStream } from "../../sdk/index.ts";
import { adminClient, agentShown, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { inPane, inProfile } from "./regions.ts";
import { openAt } from "./render.tsx";
import { testAgentDisplayName } from "../../testing/index.ts";
import { watched } from "./watched.ts";

const NONE = 0;
const ONE = 1;

interface Crew {
  readonly human: CookoutClient;
  readonly bot: CookoutClient;
  readonly stranger: CookoutClient;
}

async function crewOf(prefix: string): Promise<Crew> {
  const human = await newIdentity({ kind: "human", name: `${prefix}-human` });
  const bot = await newIdentity({ kind: "agent", name: `${prefix}-bot`, owner: `${prefix}-human` });
  const stranger = await newIdentity({ kind: "human", name: `${prefix}-stranger` });
  await adminClient().createChannel({ name: prefix });
  await bot.client.createMessage({ channel: prefix, text: "Deployed" });
  return { bot: bot.client, human: human.client, stranger: stranger.client };
}

async function clickAuthor(name: string): Promise<void> {
  const messages = await inPane().findByRole("feed", { name: "Messages" });
  fireEvent.click(await within(messages).findByRole("link", { name: testAgentDisplayName(name) }));
}

async function openedFromAuthor(prefix: string): Promise<readonly string[]> {
  await clickAuthor(`${prefix}-bot`);
  const heading = await inProfile().findByRole("heading", { level: 3 });
  return [globalThis.location.hash, heading.textContent, inPane().getByText("Deployed").textContent];
}

async function rename(text: string): Promise<void> {
  const form = await inProfile().findByRole("form", { name: "Display name" });
  fireEvent.change(within(form).getByRole("textbox"), { target: { value: text } });
  fireEvent.click(within(form).getByRole("button", { name: "Save" }));
}

async function parentOf(channel: string): Promise<string> {
  const { messages } = await adminClient().listMessages(channel);
  return messages.map((message) => String(message.id)).join("");
}

interface Watching {
  readonly close: () => void;
  readonly events: EventStream;
}

async function watchAsOwner(prefix: string): Promise<Watching> {
  const { human } = await crewOf(prefix);
  const { live, stream } = watched(human);
  const close = openAt({ client: human, hash: `#/channels/${prefix}?profile=${prefix}-bot`, live });
  return { close, events: await stream };
}

function profilePanels(): number {
  return screen.queryAllByRole("complementary", { name: "Profile" }).length;
}

it("clicking a message's author opens their profile beside the channel, and Escape closes it", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const prefix = "web-panel-open";
  const { stranger } = await crewOf(prefix);
  const close = openAt({ client: stranger, hash: `#/channels/${prefix}` });
  const opened = await openedFromAuthor(prefix);
  fireEvent.keyDown(document.body, { key: "Escape" });
  await waitFor(() => {
    expect(profilePanels()).toBe(NONE);
  });

  expect([opened, globalThis.location.hash]).toStrictEqual([
    [`#/channels/${prefix}?profile=${prefix}-bot`, `${agentShown(`${prefix}-bot`)}agent`, "Deployed"],
    `#/channels/${prefix}`,
  ]);

  close();
});

it("opening a profile from a thread replaces the thread panel", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const prefix = "web-panel-thread";
  const { stranger } = await crewOf(prefix);
  const parent = await parentOf(prefix);
  const close = openAt({ client: stranger, hash: `#/channels/${prefix}/threads/${parent}` });
  const thread = await screen.findByRole("complementary", { name: "Thread" });
  fireEvent.click(await within(thread).findByRole("link", { name: testAgentDisplayName(`${prefix}-bot`) }));
  await inProfile().findByRole("heading", { level: 3 });

  expect([globalThis.location.hash, screen.queryAllByRole("complementary", { name: "Thread" })]).toStrictEqual([
    `#/channels/${prefix}?profile=${prefix}-bot`,
    [],
  ]);

  close();
});

it("an owner renames their agent in the panel and the new name shows on its messages live", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { close, events } = await watchAsOwner("web-panel-rename");
  await rename("Release Bot");
  const messages = await inPane().findByRole("feed", { name: "Messages" });
  await waitFor(() => {
    expect(within(messages).getByRole("article").textContent).toMatch(/Release Bot@web-panel-rename-bot/u);
  });

  expect(inProfile().getByRole("button", { name: "Rotate token" })).toBeDefined();

  close();
  await events.close();
});

it("you edit your own display name in your panel", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const prefix = "web-panel-own";
  const { human } = await crewOf(prefix);
  const close = openAt({ client: human, hash: `#/inbox?profile=${prefix}-human` });
  await rename("Ada");

  await waitFor(async () => {
    await expect(human.whoami()).resolves.toHaveProperty("identity.displayName", "Ada");
  });

  close();
});

it("someone who doesn't own the agent sees its profile with no edit controls", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const prefix = "web-panel-readonly";
  const { stranger } = await crewOf(prefix);
  const close = openAt({ client: stranger, hash: `#/channels/${prefix}?profile=${prefix}-bot` });
  await inProfile().findByRole("heading", { level: 3 });

  expect([inProfile().queryAllByRole("form"), inProfile().queryAllByRole("button")]).toStrictEqual([[], []]);

  close();
});

function hrefOfRow(name: string): string | null {
  return within(screen.getByRole("list", { name: "Identities" }))
    .getByRole("link", { name: (label) => label.startsWith(name) })
    .getAttribute("href");
}

it("a profile asked for beside the people page opens as the people page's own profile", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const prefix = "web-panel-people";
  const { stranger } = await crewOf(prefix);
  const close = openAt({ client: stranger, hash: `#/people?profile=${prefix}-bot` });
  await screen.findByRole("list", { name: "Identities" });
  const heading = await inProfile().findByRole("heading", { level: 3 });

  expect([heading.textContent, hrefOfRow(`${prefix}-human`)]).toStrictEqual([
    `${agentShown(`${prefix}-bot`)}agent`,
    `#/people/${prefix}-human`,
  ]);

  close();
});

it("a profile open beside the login page closes to the people page", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const prefix = "web-panel-login";
  const { stranger } = await crewOf(prefix);
  const close = openAt({ client: stranger, hash: `#/login?profile=${prefix}-bot` });

  await expect(inProfile().findByRole("link", { name: "Close profile" })).resolves.toHaveProperty("hash", "#/people");

  close();
});

async function escapedInDisplayName(text: string): Promise<readonly unknown[]> {
  const form = await inProfile().findByRole("form", { name: "Display name" });
  const field = within(form).getByRole("textbox");
  fireEvent.change(field, { target: { value: text } });
  field.focus();
  fireEvent.keyDown(field, { key: "Escape" });
  return [
    profilePanels(),
    globalThis.document.activeElement === inProfile().element(),
    within(form).getByDisplayValue(text) === field,
  ];
}

it("the first Escape in a field of the panel leaves it for the panel, keeping the text, and the next closes it", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const prefix = "web-panel-field-escape";
  const { human } = await crewOf(prefix);
  const close = openAt({ client: human, hash: `#/channels/${prefix}?profile=${prefix}-human` });
  const kept = await escapedInDisplayName("Half typed");
  fireEvent.keyDown(inProfile().element(), { key: "Escape" });
  await waitFor(() => {
    expect(profilePanels()).toBe(NONE);
  });

  expect(kept).toStrictEqual([ONE, true, true]);

  close();
});

it("an Escape in a field outside the panel, such as the People filter, closes the panel", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const prefix = "web-panel-filter-escape";
  const { stranger } = await crewOf(prefix);
  const close = openAt({ client: stranger, hash: `#/people?profile=${prefix}-bot` });
  await inProfile().findByRole("heading", { level: 3 });
  const filter = await screen.findByRole("textbox", { name: "Filter by name" });
  filter.focus();
  fireEvent.keyDown(filter, { key: "Escape" });

  await waitFor(() => {
    expect(profilePanels()).toBe(NONE);
  });

  close();
});
