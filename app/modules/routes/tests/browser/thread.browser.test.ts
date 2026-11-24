import { adminClient, newIdentity } from "./people.ts";
import { expect, test } from "@playwright/test";
import { inSidebar, inThread } from "./regions.ts";
import type { Message } from "../../../sdk/index.ts";
import type { Page } from "@playwright/test";
import type { Person } from "./people.ts";
import { logIn } from "./login.ts";

async function followedThread(channel: string, reader: Person): Promise<Message> {
  const admin = adminClient();
  await admin.createChannel({ name: channel });
  const { message: parent } = await admin.createMessage({ channel, text: "Who's on call?" });
  await reader.client.follow(parent.id);
  await admin.createMessage({ channel, replyTo: parent.id, text: "Not me" });
  return parent;
}

async function replyInThread(page: Page, channel: string, text: string): Promise<void> {
  await inSidebar(page)
    .getByRole("link", { name: `#${channel}` })
    .click();
  await page.getByRole("article").filter({ hasText: "Who's on call?" }).getByRole("link", { name: "1 reply" }).click();
  await page.getByRole("textbox", { exact: true, name: "Reply" }).fill(text);
  await inThread(page).getByRole("button", { name: "Send" }).click();
}

test("a human opens a thread, replies, and the thread leaves their inbox", async ({ page }) => {
  const reader = await newIdentity({ kind: "human", name: "browser-replier" });
  await followedThread("browser-thread", reader);
  const before = await reader.client.inbox();

  await logIn({ page, token: reader.token });
  await replyInThread(page, "browser-thread", "I am");

  await expect(page.getByRole("list", { name: "Replies" }).getByRole("article")).toContainText(["Not me", "I am"]);
  await expect
    .poll(async () => {
      const after = await reader.client.inbox();
      return [before.items.map((item) => item.message.text), after.items];
    })
    .toStrictEqual([["Not me"], []]);
});
