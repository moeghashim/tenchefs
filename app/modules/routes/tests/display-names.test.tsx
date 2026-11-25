import type { CookoutClient, EventStream } from "../../sdk/index.ts";
import { adminClient, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { inSettings, inSidebar } from "./regions.ts";
import { alertSaying } from "./alerts.ts";
import { openAt } from "./render.tsx";
import { watched } from "./watched.ts";

const TOO_LONG = 81;

interface Crew {
  readonly human: CookoutClient;
  readonly bot: CookoutClient;
}

async function crewOf(prefix: string): Promise<Crew> {
  const human = await newIdentity({ kind: "human", name: `${prefix}-human` });
  const bot = await newIdentity({ kind: "agent", name: `${prefix}-bot`, owner: `${prefix}-human` });
  await newIdentity({ kind: "human", name: `${prefix}-boss` });
  await newIdentity({ kind: "agent", name: `${prefix}-other`, owner: `${prefix}-boss` });
  return { bot: bot.client, human: human.client };
}

async function openSettings(client: CookoutClient): Promise<() => void> {
  const close = openAt({ client, hash: "#/people" });
  await screen.findByRole("list", { name: "Identities" });
  fireEvent.click(await inSidebar().findByRole("link", { name: "Settings" }));
  await inSettings().findByRole("heading", { level: 2, name: "My agents" });
  return close;
}

async function openPeople(): Promise<void> {
  fireEvent.click(inSidebar().getByRole("link", { name: "People & agents" }));
  await screen.findByRole("list", { name: "Identities" });
}

function formNames(): readonly (string | null)[] {
  const names: (string | null)[] = [];
  for (const form of inSettings().getAllByRole("form")) {
    names.push(form.getAttribute("aria-label"));
  }
  return names;
}

function fieldIn(label: string): unknown {
  return within(screen.getByRole("form", { name: label })).getByRole("textbox");
}

async function saveIn(label: string, text: string): Promise<void> {
  const form = await screen.findByRole("form", { name: label });
  fireEvent.change(within(form).getByRole("textbox"), { target: { value: text } });
  fireEvent.click(within(form).getByRole("button", { name: "Save" }));
}

function rowOf(name: string): string {
  const list = screen.getByRole("list", { name: "Identities" });
  for (const row of within(list).getAllByRole("link")) {
    if (row.getAttribute("href") === `#/people/${name}`) {
      return row.textContent;
    }
  }
  return "no row";
}

async function closeBoth(unmount: () => void, stream: Promise<EventStream>): Promise<void> {
  unmount();
  const events = await stream;
  await events.close();
}

interface Watching {
  readonly human: CookoutClient;
  readonly stream: Promise<EventStream>;
  readonly unmount: () => void;
}

async function watchChannel(prefix: string): Promise<Watching> {
  const { bot, human } = await crewOf(prefix);
  const reader = await newIdentity({ kind: "human", name: `${prefix}-reader` });
  await adminClient().createChannel({ name: prefix });
  await bot.createMessage({ channel: prefix, text: "Deployed" });
  const { live, stream } = watched(reader.client);
  const unmount = openAt({ client: reader.client, hash: `#/channels/${prefix}`, live });
  await screen.findByText("Deployed");
  await stream;
  return { human, stream, unmount };
}

interface Typed {
  readonly box: unknown;
  readonly close: () => void;
}

async function typeMention(client: CookoutClient, prefix: string): Promise<Typed> {
  await client.setDisplayName(`${prefix}-bot`, "Release Bot");
  await adminClient().createChannel({ name: prefix });
  const close = openAt({ client, hash: `#/channels/${prefix}` });
  const box = await screen.findByLabelText("Message");
  fireEvent.change(box, { target: { value: `@${prefix}-bot` } });
  return { box, close };
}

it("settings saves your own display name and your agents', and shows them at once", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { human } = await crewOf("web-names-save");
  const close = await openSettings(human);
  await saveIn("Your display name", "  Ada Lovelace ");
  await saveIn("Display name of @web-names-save-bot", "Release Bot");
  const forms = formNames();
  await openPeople();
  await waitFor(() => {
    expect(rowOf("web-names-save-bot")).toBe(
      "Release Bot@web-names-save-botagentAgent · owned by web-names-save-human",
    );
  });

  expect([
    forms,
    rowOf("web-names-save-human"),
    inSidebar().getByRole("link", { name: /Ada Lovelace/u }).textContent,
  ]).toStrictEqual([
    ["Your display name", "Display name of @web-names-save-bot", "Create an agent"],
    "Ada Lovelace@web-names-save-human(you)Human",
    "Ada Lovelace@web-names-save-human",
  ]);

  close();
});

it("saving an empty display name clears it", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { human } = await crewOf("web-names-clear");
  await human.setDisplayName("web-names-clear-human", "Grace Hopper");
  const close = await openSettings(human);
  await saveIn("Your display name", "");
  await inSidebar().findByRole("link", { name: /^web-names-clear-human/u });
  const field = fieldIn("Your display name");
  await openPeople();

  expect([rowOf("web-names-clear-human"), field]).toStrictEqual([
    "web-names-clear-human(you)Human",
    expect.objectContaining({ value: "" }),
  ]);

  close();
});

it("a refused display name shows why inline and keeps the text", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { human } = await crewOf("web-names-refused");
  const close = await openSettings(human);
  const long = "x".repeat(TOO_LONG);
  await saveIn("Your display name", long);
  const alert = await alertSaying("Couldn't save the display name (invalid_request)");

  expect([
    screen.getByRole("form", { name: "Your display name" }).contains(alert),
    fieldIn("Your display name"),
  ]).toStrictEqual([true, expect.objectContaining({ value: long })]);

  close();
});

it("a display name set elsewhere shows on the open channel's messages without a reload", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { human, stream, unmount } = await watchChannel("web-names-live");
  await human.setDisplayName("web-names-live-bot", "Release Bot");
  const messages = screen.getByRole("feed", { name: "Messages" });

  await waitFor(() => {
    expect(within(messages).getByRole("article").textContent).toMatch(/Release Bot@web-names-live-botagent.*Deployed/u);
  });

  await closeBoth(unmount, stream);
});

it("an inbox row shows its author's display name with the name beside it", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { bot, human } = await crewOf("web-names-inbox");
  await human.setDisplayName("web-names-inbox-bot", "Release Bot");
  await adminClient().createChannel({ name: "web-names-inbox" });
  await bot.createMessage({ channel: "web-names-inbox", text: "Ping @web-names-inbox-human" });
  const close = openAt({ client: human, hash: "#/inbox" });
  const unread = await screen.findByRole("list", { name: "For you" });

  await expect(within(unread).findByText("@web-names-inbox-bot")).resolves.toHaveProperty(
    "previousSibling.textContent",
    "Release Bot",
  );

  close();
});

it("the @ suggestions show display names and insert the name", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { human } = await crewOf("web-names-suggest");
  const { box, close } = await typeMention(human, "web-names-suggest");
  const option = within(await screen.findByRole("listbox", { name: "Mention suggestions" })).getByRole("option");
  const shown = option.textContent;
  fireEvent.mouseDown(option);

  expect([shown, box]).toStrictEqual([
    "@web-names-suggest-botRelease Bot",
    expect.objectContaining({ value: "@web-names-suggest-bot " }),
  ]);

  close();
});

it("the profile shows the display name with the name beside it", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { human } = await crewOf("web-names-profile");
  await human.setDisplayName("web-names-profile-bot", "Release Bot");
  const close = openAt({ client: human, hash: "#/people/web-names-profile-bot" });
  const panel = await screen.findByRole("complementary", { name: "Profile" });
  const heading = await within(panel).findByRole("heading", { level: 3 });

  expect(heading.textContent).toBe("Release Bot@web-names-profile-botagent");

  close();
});
