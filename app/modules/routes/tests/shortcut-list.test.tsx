import { expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { newIdentity } from "./identities.ts";
import { openAt } from "./render.tsx";

const LIST = { name: "Keyboard shortcuts" } as const;
const ONE = 1;

async function openedList(name: string): Promise<HTMLElement> {
  const { client } = await newIdentity({ kind: "human", name });
  openAt({ client, hash: "#/people" });
  await screen.findByRole("list", { name: "Identities" });
  fireEvent.keyDown(globalThis.document.body, { key: "?" });
  return screen.findByRole("dialog", LIST);
}

it("the shortcut list is a named dialog whose every group is a list named by its heading", {
  timeout: 5000,
}, async () => {
  expect.hasAssertions();

  const dialog = within(await openedList("web-shortcut-list"));
  const headings: string[] = [];
  for (const heading of dialog.getAllByRole("heading", { level: 3 })) {
    headings.push(heading.textContent);
  }
  const named = headings.filter((heading) => dialog.queryAllByRole("list", { name: heading }).length === ONE);

  expect({ everywhere: headings.includes("Everywhere"), named }).toStrictEqual({ everywhere: true, named: headings });
});

it("escape closes the shortcut list", { timeout: 5000 }, async () => {
  expect.hasAssertions();

  fireEvent.keyDown(await openedList("web-shortcut-list-escape"), { key: "Escape" });

  await waitFor(() => {
    expect(screen.queryByRole("dialog", LIST)).toBeNull();
  });
});
