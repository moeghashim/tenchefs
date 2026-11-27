import { expect, it } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { inPane } from "./regions.ts";
import { openAt } from "./render.tsx";
import { postedIn } from "./feed.ts";
import { pressed } from "./menus.ts";

const TEXTS = ["Before.", "Deploy?", "After."] as const;
const REACTIONS = ["React with 👍+", "React with 👎-"] as const;
const ICON_FIRST = ':scope > svg[aria-hidden="true"]:first-child';

type Shown = readonly (readonly [string, boolean])[];

async function itemsOf(menu: string): Promise<Shown> {
  const shown = await screen.findByRole("menu", { name: menu });
  const items: (readonly [string, boolean])[] = [];
  for (const item of within(shown).getAllByRole("menuitem")) {
    items.push([item.textContent, item.querySelector(ICON_FIRST) !== null]);
  }
  return items;
}

function withIcons(names: readonly string[]): Shown {
  return names.map((name) => [name, true]);
}

async function moreActionsOf(text: string): Promise<HTMLElement> {
  const found = await inPane().findByText(text);
  return within(found.closest("article") ?? found).getByRole("button", { name: "More actions" });
}

it("every item in a message's More actions menu shows an icon before its label", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const posted = await postedIn({ channel: "web-menu-icons-more", closed: [], texts: TEXTS });
  const close = openAt({ client: posted.reader, hash: `#/channels/${posted.channel}` });
  const button = await moreActionsOf("Deploy?");
  pressed(() => button);

  await expect(itemsOf("More actions")).resolves.toStrictEqual(
    withIcons([
      "Reply→ or Enter or r",
      "Open threadt",
      ...REACTIONS,
      "Mark unreadAlt+Enter",
      "Copy linkl",
      "Copy textc",
      "Closex",
    ]),
  );

  close();
});

it("every item in a closed message's context menu shows an icon before its label", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  const posted = await postedIn({ channel: "web-menu-icons-context", closed: ["Deploy?"], texts: TEXTS });
  const close = openAt({ client: posted.reader, hash: `#/channels/${posted.channel}` });
  fireEvent.click(await inPane().findByRole("button", { name: "1 closed thread" }));
  fireEvent.contextMenu(await inPane().findByText("Deploy?"));

  await expect(itemsOf("Message actions")).resolves.toStrictEqual(
    withIcons([
      "Reply→ or Enter or r",
      "Open threadt",
      ...REACTIONS,
      "Mark unreadAlt+Enter",
      "Copy linkl",
      "Copy textc",
      "Reopenx",
    ]),
  );

  close();
});
