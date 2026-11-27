import type { CookoutClient, EventStream } from "../../sdk/index.ts";
import { adminClient, newIdentity } from "./identities.ts";
import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { openAt } from "./render.tsx";
import { watched } from "./watched.ts";

const MENTIONS = { name: "Mention suggestions" };
const COMMANDS = { name: "Command suggestions" };

async function openChannel(channel: string): Promise<() => void> {
  await adminClient().createChannel({ name: channel });
  const close = openAt({ client: adminClient(), hash: `#/channels/${channel}` });
  await screen.findByLabelText("Message");
  return close;
}

function type(text: string): void {
  fireEvent.change(screen.getByLabelText("Message"), { target: { value: text } });
}

function press(key: string): void {
  fireEvent.keyDown(screen.getByLabelText("Message"), { key });
}

interface Combobox {
  readonly expanded: string | null;
  readonly controls: boolean;
  readonly active: boolean;
  readonly chosen: string | null;
}

function comboboxNow(): Combobox {
  const box = screen.getByRole("combobox", { name: "Message" });
  const list = screen.getByRole("listbox", MENTIONS);
  const selected = within(list).getByRole("option", { selected: true });
  return {
    active: box.getAttribute("aria-activedescendant") === selected.id,
    chosen: selected.textContent,
    controls: box.getAttribute("aria-controls") === list.id,
    expanded: box.getAttribute("aria-expanded"),
  };
}

async function mentionListFor(channel: string): Promise<() => void> {
  await newIdentity({ kind: "human", name: `combobox-${channel}-first` });
  await newIdentity({ kind: "human", name: `combobox-${channel}-second` });
  const close = await openChannel(`web-combobox-${channel}`);
  type(`Ping @combobox-${channel}-`);
  await screen.findByRole("listbox", MENTIONS);
  return close;
}

it("while the mention list shows, the box is a combobox that controls a listbox, and its active option follows the arrows", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const close = await mentionListFor("roles");
  const first = comboboxNow();
  press("ArrowDown");
  const moved = comboboxNow();
  press("ArrowUp");

  expect([first, moved, comboboxNow()]).toStrictEqual([
    { active: true, chosen: "@combobox-roles-first", controls: true, expanded: "true" },
    { active: true, chosen: "@combobox-roles-second", controls: true, expanded: "true" },
    { active: true, chosen: "@combobox-roles-first", controls: true, expanded: "true" },
  ]);

  close();
});

it("with no suggestions showing, the message box is a plain text box again", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const close = await mentionListFor("closed");
  press("Escape");

  expect([
    screen.queryByRole("listbox", MENTIONS),
    screen.queryByRole("combobox", { name: "Message" }),
    screen.getByRole("textbox", { name: "Message" }).getAttribute("aria-activedescendant"),
  ]).toStrictEqual([null, null, null]);

  close();
});

interface Watching {
  readonly ada: CookoutClient;
  readonly close: () => Promise<void>;
}

interface Crew {
  readonly ada: CookoutClient;
  readonly reader: CookoutClient;
}

async function crewIn(prefix: string): Promise<Crew> {
  const ada = await newIdentity({ kind: "human", name: `${prefix}-ada` });
  await newIdentity({ kind: "human", name: `${prefix}-alan` });
  const reader = await newIdentity({ kind: "human", name: `${prefix}-reader` });
  await adminClient().createChannel({ name: prefix });
  await ada.client.createMessage({ channel: prefix, text: "Deployed" });
  return { ada: ada.client, reader: reader.client };
}

interface Typed {
  readonly text: string;
  readonly listbox: { readonly name: string };
}

async function liveListFor(prefix: string, typed: Typed): Promise<Watching> {
  const { ada, reader } = await crewIn(prefix);
  const { live, stream } = watched(reader);
  const unmount = openAt({ client: reader, hash: `#/channels/${prefix}`, live });
  await screen.findByText("Deployed");
  const events: EventStream = await stream;
  type(typed.text);
  await screen.findByRole("listbox", typed.listbox);
  return {
    ada,
    close: async () => {
      unmount();
      await events.close();
    },
  };
}

function mentioning(prefix: string): Typed {
  return { listbox: MENTIONS, text: `Ping @${prefix}-a` };
}

async function renamedLive(ada: CookoutClient, name: string): Promise<void> {
  await ada.setDisplayName(name, "Ada Lovelace");
  const messages = screen.getByRole("feed", { name: "Messages" });
  await waitFor(() => {
    expect(within(messages).getByRole("article").textContent).toMatch(/Ada Lovelace/u);
  });
}

it("an identity changing elsewhere keeps the arrowed-to option active", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { ada, close } = await liveListFor("web-combobox-live-arrowed", mentioning("web-combobox-live-arrowed"));
  press("ArrowDown");
  await renamedLive(ada, "web-combobox-live-arrowed-ada");

  expect(comboboxNow()).toStrictEqual({
    active: true,
    chosen: "@web-combobox-live-arrowed-alan",
    controls: true,
    expanded: "true",
  });

  await close();
});

it("an identity changing elsewhere leaves a list closed with Escape closed", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { ada, close } = await liveListFor("web-combobox-live-closed", mentioning("web-combobox-live-closed"));
  press("Escape");
  await renamedLive(ada, "web-combobox-live-closed-ada");

  expect(screen.queryByRole("listbox", MENTIONS)).toBeNull();

  await close();
});

it("an identity changing elsewhere keeps /schedule highlighted in the Command list", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { ada, close } = await liveListFor("web-combobox-live-command", { listbox: COMMANDS, text: "/" });
  await renamedLive(ada, "web-combobox-live-command-ada");
  const list = screen.getByRole("listbox", COMMANDS);

  expect(within(list).getByRole("option", { selected: true }).textContent).toBe("/scheduleSchedule a message");

  await close();
});
