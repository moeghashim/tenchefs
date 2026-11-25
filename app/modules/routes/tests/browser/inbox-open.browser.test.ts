import type { Locator, Page } from "@playwright/test";
import { adminClient, newIdentity } from "./people.ts";
import { test as base, expect } from "@playwright/test";
import type { MessageId } from "../../../sdk/index.ts";
import type { Person } from "./people.ts";
import { inConversation } from "./regions.ts";
import { logInToChannels } from "./login.ts";
import { probeFixtures } from "./probe.ts";
import { unique } from "./names.ts";

const test = base.extend(probeFixtures);

const NONE = 0;
const ONE = 1;
const REPLIES_EACH_SIDE = 20;
const MENTION = "can you check the rollout?";

interface Mentioned {
  readonly poster: Person;
  readonly reader: Person;
  readonly parent: MessageId;
  readonly mention: MessageId;
}

interface Replies {
  readonly poster: Person;
  readonly channel: string;
  readonly parent: MessageId;
  readonly left: number;
}

async function postReplies({ channel, left, parent, poster }: Replies): Promise<void> {
  if (left === NONE) {
    return;
  }
  await poster.client.createMessage({ channel, replyTo: parent, text: `Step ${String(left)} done` });
  await postReplies({ channel, left: left - ONE, parent, poster });
}

async function mentionedDeepInThread(channel: string): Promise<Mentioned> {
  await adminClient().createChannel({ name: channel });
  const poster = await newIdentity({ kind: "agent", name: `${channel}-poster` });
  const reader = await newIdentity({ kind: "human", name: `${channel}-reader` });
  const { message: parent } = await poster.client.createMessage({ channel, text: "Deploy at noon?" });
  const replies = { channel, left: REPLIES_EACH_SIDE, parent: parent.id, poster };
  await postReplies(replies);
  const { message: mention } = await poster.client.createMessage({
    channel,
    replyTo: parent.id,
    text: `@${channel}-reader ${MENTION}`,
  });
  await postReplies(replies);
  return { mention: mention.id, parent: parent.id, poster, reader };
}

function mentionIn(page: Page): Locator {
  return inConversation(page).getByRole("article").filter({ hasText: MENTION });
}

async function openFromInbox(page: Page, list: string): Promise<void> {
  await page.goto("/#/inbox");
  await page
    .getByRole("main")
    .getByRole("list", { exact: true, name: list })
    .getByRole("link")
    .filter({ has: page.getByText("Mentioned you", { exact: true }) })
    .click();
}

async function expectMentionShown(page: Page): Promise<void> {
  await expect(inConversation(page)).toContainText("Deploy at noon?");
  await expect(mentionIn(page)).toHaveAttribute("aria-current", "true");
  await expect(mentionIn(page)).toBeInViewport();
}

async function shownInLight(page: Page): Promise<void> {
  await page.evaluate(() => {
    globalThis.localStorage.setItem("cookout-theme", "light");
  });
  await page.reload();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(mentionIn(page)).toBeInViewport();
}

test("clicking an unseen Inbox item deep in a long thread shows its message in view, highlighted", async ({ page }) => {
  const { reader } = await mentionedDeepInThread(unique("browser-inbox-open-unseen"));
  await logInToChannels({ page, token: reader.token });
  await openFromInbox(page, "For you");

  await expectMentionShown(page);
});

test("clicking a seen Inbox item shows its thread, with its message in view", async ({ page }) => {
  const { mention, reader } = await mentionedDeepInThread(unique("browser-inbox-open-seen"));
  await reader.client.ack(mention);
  await logInToChannels({ page, token: reader.token });
  await openFromInbox(page, "Earlier");

  await expectMentionShown(page);
  await page.screenshot({ path: test.info().outputPath("inbox-open-seen-dark.png") });
  await shownInLight(page);

  await page.screenshot({ path: test.info().outputPath("inbox-open-seen-light.png") });
});

test("an Inbox thread address without a message still opens, scrolled to the newest message", async ({ page }) => {
  const channel = unique("browser-inbox-open-old-link");
  const { parent, reader } = await mentionedDeepInThread(channel);
  await logInToChannels({ page, token: reader.token });
  await page.goto(`/#/inbox/${channel}/${String(parent)}`);
  const newest = inConversation(page).getByRole("article").filter({ hasText: "Step 1 done" });

  await expect(newest.last()).toBeInViewport();
});

test("clicking a seen Inbox item in a Closed thread shows its thread, with its message in view", async ({ page }) => {
  const { mention, parent, poster, reader } = await mentionedDeepInThread(unique("browser-inbox-open-closed"));
  await reader.client.ack(mention);
  await poster.client.closeThread(parent);
  await logInToChannels({ page, token: reader.token });
  await openFromInbox(page, "Earlier");

  await expectMentionShown(page);
});
