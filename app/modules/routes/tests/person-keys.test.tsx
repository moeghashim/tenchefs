import { adminClient, newIdentity } from "./identities.ts";
import { expect, it, onTestFinished, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { Mock } from "vitest";
import { inPane } from "./regions.ts";
import { viewOpened } from "./view-opened.ts";

const TWO_PEOPLE = 2;
const TAB_STOP = 0;
const NO_TAB_STOP = -1;

interface Pair {
  readonly first: string;
  readonly second: string;
  readonly close: () => void;
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

function pressed(key: string): string | null {
  fireEvent.keyDown(globalThis.document.activeElement ?? globalThis.document.body, { key });
  const focused = globalThis.document.activeElement;
  if (focused === null) {
    return null;
  }
  return focused.getAttribute("href");
}

function rowOf(name: string): HTMLElement {
  return within(screen.getByRole("list", { name: "Identities" })).getByRole("link", {
    name: new RegExp(`^${name}`, "u"),
  });
}

async function peopleOf(prefix: string): Promise<Pair> {
  const first = `${prefix}-ada`;
  const second = `${prefix}-bea`;
  const { client } = await newIdentity({ kind: "human", name: first });
  await newIdentity({ kind: "human", name: second });
  const { close } = await viewOpened({ client, hash: "#/people", waitingOn: ["listIdentities"] });
  fireEvent.change(await screen.findByRole("textbox", { name: "Filter by name" }), { target: { value: prefix } });
  await waitFor(() => {
    expect(within(screen.getByRole("list", { name: "Identities" })).getAllByRole("link")).toHaveLength(TWO_PEOPLE);
  });
  return { close, first, second };
}

it("in the People list only one row is a Tab stop, and ↑/↓ move between rows, stopping at either end", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { close, first, second } = await peopleOf("web-people-keys-arrows");
  const before = [rowOf(first).tabIndex, rowOf(second).tabIndex];
  rowOf(first).focus();
  const moves = [pressed("ArrowUp"), pressed("ArrowDown"), pressed("ArrowDown")];
  inPane()
    .getByRole("button", { name: `@${second} actions` })
    .focus();
  const offRow = pressed("ArrowUp");
  rowOf(second).focus();

  expect([before, moves, [rowOf(first).tabIndex, rowOf(second).tabIndex], offRow, pressed("ArrowUp")]).toStrictEqual([
    [TAB_STOP, NO_TAB_STOP],
    [`#/people/${first}`, `#/people/${second}`, `#/people/${second}`],
    [NO_TAB_STOP, TAB_STOP],
    null,
    `#/people/${first}`,
  ]);

  close();
});

it("in the People list Home and End move to the first and last rows, and do nothing off a row", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { close, first, second } = await peopleOf("web-people-keys-ends");
  rowOf(first).focus();
  const moves = [pressed("End"), pressed("Home")];
  inPane()
    .getByRole("button", { name: `@${second} actions` })
    .focus();

  expect([...moves, pressed("Home")]).toStrictEqual([`#/people/${second}`, `#/people/${first}`, null]);

  close();
});

it("when the filter hides the row an arrow moved to, the first row shown takes the Tab stop", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const { close, first, second } = await peopleOf("web-people-keys-hidden");
  rowOf(first).focus();
  pressed("ArrowDown");
  fireEvent.change(screen.getByRole("textbox", { name: "Filter by name" }), { target: { value: first } });

  await waitFor(() => {
    expect([
      rowOf(first).tabIndex,
      inPane().queryByRole("link", { name: new RegExp(`^${second}`, "u") }),
    ]).toStrictEqual([TAB_STOP, null]);
  });

  close();
});

it("enter on a People row opens its profile, which then holds the row's Tab stop", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { close, first, second } = await peopleOf("web-people-keys-enter");
  rowOf(first).focus();
  pressed("ArrowDown");
  pressed("ArrowUp");
  const hashBefore = globalThis.location.hash;
  pressed("Enter");

  await waitFor(() => {
    expect([hashBefore, globalThis.location.hash, rowOf(first).tabIndex, rowOf(second).tabIndex]).toStrictEqual([
      "#/people",
      `#/people/${first}`,
      TAB_STOP,
      NO_TAB_STOP,
    ]);
  });

  close();
});

it("c on a People row copies @name and says so, and m does nothing where there is no message box", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const writeText = stubClipboard();
  const { close, first } = await peopleOf("web-people-keys-copy");
  rowOf(first).focus();
  pressed("m");
  pressed("c");

  await expect(screen.findByRole("status", { name: "Announcements" })).resolves.toHaveProperty(
    "textContent",
    `Copied @${first}`,
  );
  expect(writeText.mock.calls).toStrictEqual([[`@${first}`]]);

  close();
});

interface Authored {
  readonly author: string;
  readonly close: () => void;
  readonly name: HTMLElement;
}

async function authorIn(channel: string, deactivated: boolean): Promise<Authored> {
  const author = `${channel}-author`;
  const poster = await newIdentity({ kind: "human", name: author });
  const reader = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await adminClient().createChannel({ name: channel });
  await poster.client.createMessage({ channel, text: "Hello" });
  if (deactivated) {
    await adminClient().deactivateIdentity(author);
  }
  const { close } = await viewOpened({
    client: reader.client,
    hash: `#/channels/${channel}`,
    waitingOn: ["listMessages", "listIdentities"],
  });
  const name = await within(await screen.findByRole("feed", { name: "Messages" })).findByRole("link", { name: author });
  return { author, close, name };
}

it("m on a message's author puts @author in the message box", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { author, close, name } = await authorIn("web-person-keys-message", false);
  name.focus();
  pressed("m");

  await waitFor(() => {
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveProperty("value", `@${author} `);
  });

  close();
});

it("m on a deactivated author leaves the message box empty", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const { close, name } = await authorIn("web-person-keys-deactivated", true);
  name.focus();
  pressed("m");

  expect(screen.getByRole("textbox", { name: "Message" })).toHaveProperty("value", "");

  close();
});
