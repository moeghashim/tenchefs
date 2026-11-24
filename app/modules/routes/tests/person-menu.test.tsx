import { adminClient, newIdentity } from "./identities.ts";
import { chose, pressed } from "./menus.ts";
import { expect, it, onTestFinished, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { inPane, inProfile } from "./regions.ts";
import type { CookoutClient } from "../../sdk/index.ts";
import type { Mock } from "vitest";
import { openAt } from "./render.tsx";

const ICON_FIRST = ':scope > svg[aria-hidden="true"]:first-child';

type Shown = readonly (readonly [string, boolean, boolean])[];

interface Posted {
  readonly author: string;
  readonly reader: CookoutClient;
  readonly close: () => void;
}

async function postedIn(channel: string, text = "Hello"): Promise<Posted> {
  const author = `${channel}-author`;
  const poster = await newIdentity({ kind: "human", name: author });
  const reader = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await adminClient().createChannel({ name: channel });
  await poster.client.createMessage({ channel, text });
  const close = openAt({ client: reader.client, hash: `#/channels/${channel}` });
  return { author, close, reader: reader.client };
}

async function authorName(author: string): Promise<HTMLElement> {
  const name = await waitFor(() => {
    const link = within(screen.getByRole("list", { name: "Messages" })).getByRole("link", { name: author });

    expect(link.dataset).toHaveProperty("identityCard");

    return link;
  });
  return name;
}

async function menuItems(name: string): Promise<Shown> {
  const shown = await screen.findByRole("menu", { name });
  const items: (readonly [string, boolean, boolean])[] = [];
  for (const item of within(shown).getAllByRole("menuitem")) {
    items.push([item.textContent, item.querySelector(ICON_FIRST) !== null, "disabled" in item.dataset]);
  }
  return items;
}

const ALL_ITEMS: Shown = [
  ["View profile", true, false],
  ["Message", true, false],
  ["Copy name", true, false],
];

function boxNow(): readonly [boolean, string | null] {
  const box = screen.getByRole("textbox", { name: "Message" });
  const focused = box === globalThis.document.activeElement;
  if (box instanceof HTMLTextAreaElement) {
    return [focused, box.value];
  }
  return [focused, null];
}

function stubClipboard(): Mock<(text: string) => Promise<void>> {
  const writeText = vi.fn<(text: string) => Promise<void>>(async () => {
    await Promise.resolve();
  });
  Object.defineProperty(globalThis.navigator, "clipboard", { configurable: true, value: { writeText } });
  onTestFinished(() => {
    Reflect.deleteProperty(globalThis.navigator, "clipboard");
  });
  return writeText;
}

it("right-clicking a message's author name opens that person's actions menu, every item with an icon", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { author, close } = await postedIn("web-person-menu-right");
  fireEvent.contextMenu(await authorName(author));

  await expect(menuItems(`@${author} actions`)).resolves.toStrictEqual(ALL_ITEMS);
  expect(screen.queryByRole("menu", { name: "Message actions" })).toBeNull();

  close();
});

it("an author name's actions button opens the same menu as a dropdown", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { author, close } = await postedIn("web-person-menu-more");
  await authorName(author);
  pressed(() => inPane().getByRole("button", { name: `@${author} actions` }));

  await expect(menuItems(`@${author} actions`)).resolves.toStrictEqual(ALL_ITEMS);

  close();
});

const KEYS = [
  ["the context-menu key", "ContextMenu", false],
  ["Shift+F10", "F10", true],
] as const;

it.each(KEYS)(
  "%s on a focused author name opens that person's menu, not the message's",
  { timeout: 5000 },
  async (_name, key, shiftKey) => {
    expect.hasAssertions();

    const { author, close } = await postedIn(`web-person-menu-key-${key.toLowerCase()}`);
    const name = await authorName(author);
    name.focus();
    fireEvent.keyDown(name, { key, shiftKey });

    await expect(menuItems(`@${author} actions`)).resolves.toStrictEqual(ALL_ITEMS);
    expect(screen.queryByRole("menu", { name: "Message actions" })).toBeNull();

    close();
  },
);

it("an @name in a message has the same menu", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const channel = "web-person-menu-mention";
  const { close } = await postedIn(channel, `Ask @${channel}-reader`);
  fireEvent.contextMenu(await inPane().findByRole("link", { name: `@${channel}-reader` }));

  await expect(menuItems(`@${channel}-reader actions`)).resolves.toStrictEqual(ALL_ITEMS);

  close();
});

it("view profile opens the person's profile", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { author, close } = await postedIn("web-person-menu-profile");
  fireEvent.contextMenu(await authorName(author));
  await chose("View profile");

  await waitFor(async () => {
    await expect(inProfile().findByRole("heading", { level: 3 })).resolves.toHaveProperty("textContent", author);
  });

  close();
});

it("message puts @name in the channel's message box and focuses it", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { author, close } = await postedIn("web-person-menu-message");
  fireEvent.contextMenu(await authorName(author));
  await chose("Message");

  await waitFor(() => {
    expect(boxNow()).toStrictEqual([true, `@${author} `]);
  });

  close();
});

it("copy name puts @name on the clipboard", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const writeText = stubClipboard();
  const { author, close } = await postedIn("web-person-menu-copy");
  fireEvent.contextMenu(await authorName(author));
  await chose("Copy name");

  await waitFor(() => {
    expect(writeText.mock.calls).toStrictEqual([[`@${author}`]]);
  });

  close();
});

it("a deactivated author's Message is dimmed", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { author, close } = await postedIn("web-person-menu-deactivated");
  await adminClient().deactivateIdentity(author);
  await waitFor(async () => {
    fireEvent.contextMenu(await authorName(author));

    await expect(menuItems(`@${author} actions`)).resolves.toStrictEqual([
      ["View profile", true, false],
      ["Message", true, true],
      ["Copy name", true, false],
    ]);
  });

  close();
});

async function peopleRow(name: string): Promise<HTMLElement> {
  const row = await within(await screen.findByRole("list", { name: "Identities" })).findByRole("link", {
    name: new RegExp(`^${name}`, "u"),
  });
  return row;
}

async function peopleRowMenu(name: string, how: "right-click" | "button"): Promise<Shown> {
  const row = await peopleRow(name);
  if (how === "right-click") {
    fireEvent.contextMenu(row);
  } else {
    pressed(() => within(row.parentElement ?? row).getByRole("button", { name: `@${name} actions` }));
  }
  const shown = await menuItems(`@${name} actions`);
  fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
  return shown;
}

const WITHOUT_MESSAGE: Shown = [
  ["View profile", true, false],
  ["Copy name", true, false],
];

it("a row in the People list has the menu, without Message where there is no message box", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const prefix = "web-person-menu-people";
  const reader = await newIdentity({ kind: "human", name: `${prefix}-reader` });
  await newIdentity({ kind: "agent", name: `${prefix}-bot`, owner: `${prefix}-reader` });
  const bot = `${prefix}-bot`;
  const close = openAt({ client: reader.client, hash: "#/people" });
  const byRightClick = await peopleRowMenu(bot, "right-click");
  const byButton = await peopleRowMenu(bot, "button");

  expect([byRightClick, byButton]).toStrictEqual([WITHOUT_MESSAGE, WITHOUT_MESSAGE]);

  close();
});
