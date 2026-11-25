import { expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { adminClient } from "./identities.ts";
import { clockStoppedAt } from "./clock.ts";
import { inSearchResults } from "./regions.ts";
import { openedBy } from "./presence.ts";
import { postedIn } from "./feed.ts";

const BOX = { name: "Search" } as const;
const SUGGESTIONS = { name: "Filter suggestions" } as const;
const ONE = 1;

interface Picked {
  readonly value: string;
  readonly caret: number | null;
  readonly listed: boolean;
}

async function openedFor(channel: string): Promise<Awaited<ReturnType<typeof postedIn>>> {
  const posted = await postedIn({ channel, closed: [], texts: [`Not hers wombatword ${channel}`] });
  await openedBy({ client: posted.reader, hash: "#/inbox" });
  return posted;
}

async function typedAtEnd(query: string): Promise<HTMLInputElement> {
  const box = await screen.findByRole<HTMLInputElement>("combobox", BOX);
  box.focus();
  fireEvent.input(box, { target: { value: query } });
  return box;
}

async function suggestionNamed(name: string | Readonly<RegExp>): Promise<HTMLElement> {
  const list = await screen.findByRole("listbox", SUGGESTIONS);
  const option = await within(list).findByRole("option", { name });
  return option;
}

function textsIn(list: () => HTMLElement): readonly string[] {
  const texts: string[] = [];
  for (const option of within(list()).getAllByRole("option")) {
    texts.push(option.textContent);
  }
  return texts;
}

async function messageTexts(count: number): Promise<readonly string[]> {
  const texts = await vi.waitFor(() => {
    const group = inSearchResults().getByRole("group", { name: "Messages" });
    const shown = textsIn(() => group);

    expect(shown).toHaveLength(count);

    return shown;
  });
  return texts;
}

async function picked(name: string | Readonly<RegExp>): Promise<Picked> {
  fireEvent.mouseDown(await suggestionNamed(name));
  const box = screen.getByRole<HTMLInputElement>("combobox", BOX);
  return {
    caret: box.selectionStart,
    listed: screen.queryByRole("listbox", SUGGESTIONS) !== null,
    value: box.value,
  };
}

it("typing from: and the start of a name suggests that identity with its display name and dot, and picking it filters", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const posted = await postedIn({ channel: "grsuggest-from", closed: [], texts: ["Not hers wombatword"] });
  await posted.reader.createMessage({ channel: posted.channel, text: "Hers wombatword" });
  await adminClient().setDisplayName("grsuggest-from-grace", "Grace Suggestly");
  await openedBy({ client: posted.reader, hash: "#/inbox" });
  await typedAtEnd("wombatword from:grsuggest-from-g");
  const option = await suggestionNamed(/^Grace Suggestly, @grsuggest-from-grace, Online/u);
  const shown = [option.textContent, within(option).getByRole("img").dataset["presence"]];

  expect([shown, await picked(/@grsuggest-from-grace/u)]).toStrictEqual([
    ["@grsuggest-from-graceGrace Suggestly", "online"],
    {
      caret: "wombatword from:@grsuggest-from-grace ".length,
      listed: false,
      value: "wombatword from:@grsuggest-from-grace ",
    },
  ]);
  await expect(messageTexts(ONE)).resolves.toStrictEqual([expect.stringContaining("Hers wombatword")]);
});

it("a Deactivated identity is suggested after from:", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  await openedFor("grsuggest-gone");
  await adminClient().deactivateIdentity("grsuggest-gone-ada");
  await typedAtEnd("from:@grsuggest-gone-a");

  await expect(suggestionNamed(/@grsuggest-gone-ada/u)).resolves.toBeDefined();
});

it("typing in: and the start of a channel's name suggests it, and picking it filters to that channel", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const posted = await openedFor("depsuggest-in");
  await adminClient().createChannel({ name: "depsuggest-out" });
  await posted.poster.createMessage({ channel: "depsuggest-out", text: "Not hers wombatword elsewhere" });
  await typedAtEnd("wombatword in:depsuggest-i");

  await expect(picked("#depsuggest-in")).resolves.toStrictEqual(
    expect.objectContaining({ value: "wombatword in:#depsuggest-in " }),
  );
  await expect(messageTexts(ONE)).resolves.toStrictEqual([expect.stringContaining("depsuggest-in")]);
});

it("typing before: suggests today first, then yesterday, a week ago and a month ago, as YYYY-MM-DD", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  await openedFor("datesuggest-before");
  clockStoppedAt("2026-03-31T12:00:00");
  const box = await typedAtEnd("before:");
  await screen.findByRole("listbox", SUGGESTIONS);
  const texts = textsIn(() => screen.getByRole("listbox", SUGGESTIONS));
  fireEvent.keyDown(box, { key: "Tab" });

  expect([texts, box.value]).toStrictEqual([
    ["2026-03-31Today", "2026-03-30Yesterday", "2026-03-24A week ago", "2026-02-28A month ago"],
    "before:2026-03-31 ",
  ]);
});

function pressedAll(keys: readonly string[]): string | null {
  const box = screen.getByRole("combobox", BOX);
  for (const key of keys) {
    fireEvent.keyDown(box, { key });
  }
  const active = box.getAttribute("aria-activedescendant") ?? "";
  const option = globalThis.document.querySelector(`[id="${active}"]`);
  if (option === null) {
    return null;
  }
  return option.textContent;
}

function escapedTwice(): readonly (HTMLElement | null)[] {
  pressedAll(["Escape"]);
  const hidden = screen.queryByRole("listbox", SUGGESTIONS);
  pressedAll(["Escape"]);
  return [hidden, screen.queryByRole("listbox", { name: "Search results" })];
}

it("down and Up wrap round the suggestions, Escape hides them until the next edit, then closes search", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const posted = await openedFor("keysuggest-a");
  await adminClient().createChannel({ name: "keysuggest-b" });
  await posted.reader.subscribe("keysuggest-b");
  await typedAtEnd("in:keysuggest-");
  await suggestionNamed("#keysuggest-b");
  const highlighted = [pressedAll(["ArrowUp"]), pressedAll(["ArrowDown"]), pressedAll(["ArrowDown"])];

  expect([highlighted, escapedTwice()]).toStrictEqual([
    ["#keysuggest-b", "#keysuggest-a", "#keysuggest-b"],
    [null, null],
  ]);
});
