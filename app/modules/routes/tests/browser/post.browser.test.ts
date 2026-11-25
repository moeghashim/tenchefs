import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inPane, sidebarLink } from "./regions.ts";
import type { CookoutClient } from "../../../sdk/index.ts";
import type { Page } from "@playwright/test";
import { logInWithStream } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { testAgentDisplayName } from "../../../testing/index.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

async function postWithMention(page: Page): Promise<void> {
  await sidebarLink({ label: `#${unique("browser-post")}`, page }).click();
  await page.getByLabel("Message", { exact: true }).pressSequentially(`Can @${unique("browser-post-reviewer")}`);
  await page
    .getByRole("listbox", { exact: true, name: "Mention suggestions" })
    .getByRole("option", {
      exact: true,
      name: `${testAgentDisplayName(unique("browser-post-reviewer"))}, @${unique("browser-post-reviewer")}, Offline`,
    })
    .click();
  await page.keyboard.type("look?");
  await inPane(page).getByRole("button", { exact: true, name: "Send" }).click();
}

async function inboxesOf(mentioned: CookoutClient, poster: CookoutClient): Promise<readonly unknown[]> {
  const [theirs, mine] = await Promise.all([mentioned.inbox(), poster.inbox()]);
  return [theirs.items.map((item) => [item.message.text, item.reasons]), mine.items];
}

test("a human posts a top-level message with an @ mention from the channel view, and the mentioned identity's inbox has it", async ({
  page,
}) => {
  const poster = await newIdentity({ kind: "human", name: unique("browser-poster") });
  const mentioned = await newIdentity({ kind: "agent", name: unique("browser-post-reviewer") });
  await adminClient().createChannel({ name: unique("browser-post") });
  await logInWithStream({ page, token: poster.token });
  await postWithMention(page);

  await expect(page.getByRole("feed", { exact: true, name: "Messages" }).getByRole("article")).toContainText([
    `Can @${unique("browser-post-reviewer")} look?`,
  ]);
  await expect(page.getByLabel("Message", { exact: true })).toHaveValue("");
  await expect
    .poll(async () => {
      const inboxes = await inboxesOf(mentioned.client, poster.client);
      return inboxes;
    })
    .toStrictEqual([[[`Can @${unique("browser-post-reviewer")} look?`, ["mention"]]], []]);
});

test("a message with attachments and no text shows in the channel under its author", async ({ page }) => {
  const poster = await newIdentity({ kind: "human", name: unique("browser-files-only") });
  await adminClient().createChannel({ name: unique("browser-files-only") });
  await adminClient().createMessage({ channel: unique("browser-files-only"), text: "Earlier" });
  const bytes = new TextEncoder().encode("a log line");
  await poster.client.createMessage({
    attachments: [{ bytes, name: "log.txt" }],
    channel: unique("browser-files-only"),
    text: "",
  });
  await logInWithStream({ page, token: poster.token });
  await sidebarLink({ label: `#${unique("browser-files-only")}`, page }).click();

  await expect(page.getByRole("feed", { exact: true, name: "Messages" }).getByRole("article")).toContainText([
    "Earlier",
    unique("browser-files-only"),
  ]);
});

test("Send with an empty box, no text and no attachment, posts nothing", async ({ page }) => {
  const poster = await newIdentity({ kind: "human", name: unique("browser-empty-send") });
  await adminClient().createChannel({ name: unique("browser-empty-send") });
  await logInWithStream({ page, token: poster.token });
  await sidebarLink({ label: `#${unique("browser-empty-send")}`, page }).click();
  const send = inPane(page).getByRole("button", { exact: true, name: "Send" });
  await send.click();
  await page.getByLabel("Message", { exact: true }).fill("After");
  await send.click();

  await expect(page.getByRole("feed", { exact: true, name: "Messages" }).getByRole("article")).toContainText(["After"]);
  await expect
    .poll(async () => {
      const { messages } = await poster.client.listMessages(unique("browser-empty-send"));
      return messages.map((message) => message.text);
    })
    .toStrictEqual(["After"]);
});
