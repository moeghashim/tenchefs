import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { feedMessage, hidden, shown, typing, walk } from "./key-walk.ts";
import { inSidebar, inThread } from "./regions.ts";
import type { Step } from "./key-walk.ts";
import { logInWithStream } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

function box(page: Page): Locator {
  return page.getByRole("combobox", { exact: true, name: "Search" });
}

function results(page: Page): Locator {
  return page.getByRole("listbox", { exact: true, name: "Search results" });
}

function listed(page: Page, text: string): Step {
  return async () => {
    await expect(results(page).getByRole("group", { exact: true, name: "Messages" }).getByRole("option")).toContainText(
      [text],
    );
  };
}

async function opened(page: Page): Promise<string> {
  const channel = unique("kbwalk-search");
  await adminClient().createChannel({ name: channel });
  const reader = await newIdentity({ kind: "human", name: `${channel}-reader` });
  await reader.client.subscribe(channel);
  await adminClient().createMessage({ channel, text: `Walk hello ${channel}` });
  await logInWithStream({ page, token: reader.token, url: `/#/channels/${channel}` });
  return `Walk hello ${channel}`;
}

function sorted(page: Page, hello: string): readonly Step[] {
  const sort = page.getByRole("radiogroup", { exact: true, name: "Sort results" });
  return [
    ["Tab", sort.getByRole("radio", { checked: true, exact: true, name: "Newest" })],
    ["ArrowRight", sort.getByRole("radio", { checked: true, exact: true, name: "Best match" })],
    listed(page, hello),
    ["Shift+Tab", box(page)],
  ];
}

test("search opens, closes and opens a message by keys alone, focus kept named", async ({ page }) => {
  const hello = await opened(page);
  const message = feedMessage({ page, text: hello });
  await walk({
    page,
    steps: [
      shown(message),
      ["Tab", inSidebar(page).getByRole("button", { exact: true, name: "Collapse sidebar" })],
      ["Control+]", message],
      ["Control+k", box(page)],
      ["Escape", message],
      hidden(results(page)),
      ["Control+k", box(page)],
      typing({ into: box(page), page, text: hello.toLowerCase() }),
      listed(page, hello),
      ...sorted(page, hello),
      ["Enter", inThread(page).getByRole("textbox", { exact: true, name: "Reply" })],
      hidden(results(page)),
      ["Control+k", box(page)],
      typing({ into: box(page), page, text: "inbox" }),
      ["Enter", page.getByRole("heading", { exact: true, name: "Inbox" })],
    ],
  });

  await expect(results(page)).toBeHidden();
});
