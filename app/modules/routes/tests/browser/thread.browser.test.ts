import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import { inThread, sidebarLink } from "./regions.ts";
import type { Message } from "../../../sdk/index.ts";
import type { Page } from "@playwright/test";
import type { Person } from "./people.ts";
import { logIn } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

async function followedThread(channel: string, reader: Person): Promise<Message> {
  const admin = adminClient();
  await admin.createChannel({ name: channel });
  const { message: parent } = await admin.createMessage({ channel, text: "Who's on call?" });
  await reader.client.follow(parent.id);
  await admin.createMessage({ channel, replyTo: parent.id, text: "Not me" });
  return parent;
}

async function replyInThread(page: Page, channel: string, text: string): Promise<void> {
  await sidebarLink({ label: `#${channel}`, page }).click();
  await page.getByRole("article").filter({ hasText: "Who's on call?" }).getByText("1 reply", { exact: true }).click();
  await page.getByRole("textbox", { exact: true, name: "Reply" }).fill(text);
  await inThread(page).getByRole("button", { exact: true, name: "Send" }).click();
}

test("a human opens a thread, replies, and the thread leaves their inbox", async ({ page }) => {
  const channel = unique("browser-thread");
  const reader = await newIdentity({ kind: "human", name: unique("browser-replier") });
  await followedThread(channel, reader);
  const before = await reader.client.inbox();

  await logIn({ page, token: reader.token });
  await replyInThread(page, channel, "I am");

  await expect(page.getByRole("feed", { exact: true, name: "Replies" }).getByRole("article")).toContainText([
    "Not me",
    "I am",
  ]);
  await expect
    .poll(async () => {
      const after = await reader.client.inbox();
      return [before.items.map((item) => item.message.text), after.items];
    })
    .toStrictEqual([["Not me"], []]);
});
